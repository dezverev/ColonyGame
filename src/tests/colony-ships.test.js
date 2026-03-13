const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { GameEngine, COLONY_SHIP_COST, COLONY_SHIP_BUILD_TIME, COLONY_SHIP_HOP_TICKS, MAX_COLONIES, COLONY_SHIP_STARTING_POPS, DISTRICT_DEFS } = require('../../server/game-engine');

// Helper: create a game engine with 1 player and predictable galaxy
function makeEngine(opts = {}) {
  const room = {
    id: 'test-room',
    players: new Map([[1, { name: 'Alice' }]]),
    hostId: 1,
    galaxySize: 'small',
    matchTimer: 0,
    ...(opts.room || {}),
  };
  const engine = new GameEngine(room, {
    tickRate: 10,
    galaxySeed: opts.seed != null ? opts.seed : 42,
    ...opts,
  });
  return engine;
}

// Helper: give player resources to afford a colony ship
function giveShipResources(engine, playerId) {
  const state = engine.playerStates.get(playerId);
  state.resources.minerals = 500;
  state.resources.food = 300;
  state.resources.alloys = 300;
}

// Helper: get player's first colony
function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

describe('Colony Ship Constants', () => {
  it('should have correct colony ship cost', () => {
    assert.deepStrictEqual(COLONY_SHIP_COST, { minerals: 200, food: 100, alloys: 100 });
  });

  it('should have correct build time', () => {
    assert.strictEqual(COLONY_SHIP_BUILD_TIME, 600);
  });

  it('should have correct hop ticks', () => {
    assert.strictEqual(COLONY_SHIP_HOP_TICKS, 50);
  });

  it('should have max 5 colonies', () => {
    assert.strictEqual(MAX_COLONIES, 5);
  });

  it('should start with 2 pops on colonized planet', () => {
    assert.strictEqual(COLONY_SHIP_STARTING_POPS, 2);
  });
});

describe('buildColonyShip command', () => {
  let engine;

  beforeEach(() => {
    engine = makeEngine();
    giveShipResources(engine, 1);
  });

  it('should queue a colony ship in build queue', () => {
    const colony = getFirstColony(engine, 1);
    const result = engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    assert.ok(result.ok);
    assert.strictEqual(colony.buildQueue.length, 1);
    assert.strictEqual(colony.buildQueue[0].type, 'colonyShip');
    assert.strictEqual(colony.buildQueue[0].ticksRemaining, COLONY_SHIP_BUILD_TIME);
  });

  it('should deduct resources on build', () => {
    const state = engine.playerStates.get(1);
    const colony = getFirstColony(engine, 1);
    const mineralsBefore = state.resources.minerals;
    const foodBefore = state.resources.food;
    const alloysBefore = state.resources.alloys;

    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });

    assert.strictEqual(state.resources.minerals, mineralsBefore - 200);
    assert.strictEqual(state.resources.food, foodBefore - 100);
    assert.strictEqual(state.resources.alloys, alloysBefore - 100);
  });

  it('should reject if not enough minerals', () => {
    const state = engine.playerStates.get(1);
    state.resources.minerals = 50;
    const colony = getFirstColony(engine, 1);
    const result = engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    assert.ok(result.error);
    assert.ok(result.error.includes('minerals'));
  });

  it('should reject if not enough alloys', () => {
    const state = engine.playerStates.get(1);
    state.resources.alloys = 50;
    const colony = getFirstColony(engine, 1);
    const result = engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    assert.ok(result.error);
    assert.ok(result.error.includes('alloys'));
  });

  it('should reject if build queue full', () => {
    const colony = getFirstColony(engine, 1);
    // Fill queue
    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    giveShipResources(engine, 1);
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'housing' });
    giveShipResources(engine, 1);
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'mining' });
    // Queue now has 3 items
    giveShipResources(engine, 1);
    const result = engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    assert.ok(result.error);
    assert.ok(result.error.includes('queue'));
  });

  it('should reject if wrong colony owner', () => {
    const colony = getFirstColony(engine, 1);
    const result = engine.handleCommand(999, { type: 'buildColonyShip', colonyId: colony.id });
    assert.ok(result.error);
  });

  it('should reject if colony not found', () => {
    const result = engine.handleCommand(1, { type: 'buildColonyShip', colonyId: 'nonexistent' });
    assert.ok(result.error);
  });

  it('should reject if missing colonyId', () => {
    const result = engine.handleCommand(1, { type: 'buildColonyShip' });
    assert.ok(result.error);
  });
});

describe('Colony ship construction completion', () => {
  let engine;

  beforeEach(() => {
    engine = makeEngine();
    giveShipResources(engine, 1);
  });

  it('should spawn colony ship when build completes', () => {
    const colony = getFirstColony(engine, 1);
    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });

    // Fast-forward ticks to complete construction
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) {
      engine.tick();
    }

    assert.strictEqual(colony.buildQueue.length, 0);
    assert.strictEqual(engine._colonyShips.length, 1);
    assert.strictEqual(engine._colonyShips[0].ownerId, 1);
    assert.strictEqual(engine._colonyShips[0].systemId, colony.systemId);
    assert.deepStrictEqual(engine._colonyShips[0].path, []);
  });

  it('should emit constructionComplete event for colony ship', () => {
    const colony = getFirstColony(engine, 1);
    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });

    let events = [];
    engine.onEvent = (evts) => { events = events.concat(evts); };

    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) {
      engine.tick();
    }

    const shipEvent = events.find(e => e.eventType === 'constructionComplete' && e.districtType === 'colonyShip');
    assert.ok(shipEvent, 'Should emit constructionComplete for colonyShip');
    assert.ok(shipEvent.shipId, 'Should include shipId in event');
  });
});

describe('Colony ship cancellation', () => {
  it('should refund 50% resources when cancelling colony ship build', () => {
    const engine = makeEngine();
    giveShipResources(engine, 1);

    const colony = getFirstColony(engine, 1);
    const state = engine.playerStates.get(1);
    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });

    const mineralsBefore = state.resources.minerals;
    const foodBefore = state.resources.food;
    const alloysBefore = state.resources.alloys;

    const queueItem = colony.buildQueue[0];
    const result = engine.handleCommand(1, { type: 'demolish', colonyId: colony.id, districtId: queueItem.id });
    assert.ok(result.ok);

    assert.strictEqual(state.resources.minerals, mineralsBefore + 100); // 200/2
    assert.strictEqual(state.resources.food, foodBefore + 50); // 100/2
    assert.strictEqual(state.resources.alloys, alloysBefore + 50); // 100/2
    assert.strictEqual(colony.buildQueue.length, 0);
  });
});

describe('BFS pathfinding', () => {
  it('should find a path between connected systems', () => {
    const engine = makeEngine();
    // Path from starting system to another connected system
    const colony = getFirstColony(engine, 1);
    const startSysId = colony.systemId;

    // Find a connected system via hyperlanes
    let targetSysId = null;
    for (const [a, b] of engine.galaxy.hyperlanes) {
      if (a === startSysId) { targetSysId = b; break; }
      if (b === startSysId) { targetSysId = a; break; }
    }
    assert.ok(targetSysId != null, 'Should find a connected system');

    const path = engine._findPath(startSysId, targetSysId);
    assert.ok(path, 'Path should exist');
    assert.strictEqual(path.length, 1);
    assert.strictEqual(path[0], targetSysId);
  });

  it('should find empty path for same system', () => {
    const engine = makeEngine();
    const path = engine._findPath(0, 0);
    assert.deepStrictEqual(path, []);
  });

  it('should return multi-hop path for distant systems', () => {
    const engine = makeEngine();
    // Find two systems that are more than 1 hop apart
    const colony = getFirstColony(engine, 1);
    const startSysId = colony.systemId;

    // Walk 2 hops away
    let hop1 = null;
    for (const [a, b] of engine.galaxy.hyperlanes) {
      if (a === startSysId) { hop1 = b; break; }
      if (b === startSysId) { hop1 = a; break; }
    }
    let hop2 = null;
    for (const [a, b] of engine.galaxy.hyperlanes) {
      if (a === hop1 && b !== startSysId) { hop2 = b; break; }
      if (b === hop1 && a !== startSysId) { hop2 = a; break; }
    }

    if (hop2 != null) {
      const path = engine._findPath(startSysId, hop2);
      assert.ok(path, 'Path should exist');
      assert.ok(path.length >= 2, 'Should be at least 2 hops');
    }
  });
});

describe('sendColonyShip command', () => {
  let engine;

  beforeEach(() => {
    engine = makeEngine();
    giveShipResources(engine, 1);
    // Build and complete a colony ship
    const colony = getFirstColony(engine, 1);
    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();
  });

  it('should start colony ship movement to target', () => {
    const ship = engine._colonyShips[0];
    // Find a target system with habitable planet
    let targetSysId = null;
    for (const sys of engine.galaxy.systems) {
      if (sys.id === ship.systemId) continue;
      const hasPlanet = sys.planets && sys.planets.some(p => p.habitability >= 20 && !p.colonized);
      if (hasPlanet) {
        targetSysId = sys.id;
        break;
      }
    }
    if (targetSysId == null) return; // skip if no target available

    const result = engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: targetSysId });
    assert.ok(result.ok, 'Should accept send command: ' + JSON.stringify(result));
    assert.strictEqual(ship.targetSystemId, targetSysId);
    assert.ok(ship.path.length > 0, 'Should have a path');
  });

  it('should reject if ship not found', () => {
    const result = engine.handleCommand(1, { type: 'sendColonyShip', shipId: 'fake', targetSystemId: 0 });
    assert.ok(result.error);
  });

  it('should reject if target has no habitable planet', () => {
    const ship = engine._colonyShips[0];
    // Find a system with no habitable planet
    let targetSysId = null;
    for (const sys of engine.galaxy.systems) {
      const hasHab = sys.planets && sys.planets.some(p => p.habitability >= 20);
      if (!hasHab) { targetSysId = sys.id; break; }
    }
    if (targetSysId == null) return; // skip

    const result = engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: targetSysId });
    assert.ok(result.error);
  });

  it('should reject if planet already colonized', () => {
    const ship = engine._colonyShips[0];
    // The starting system is already colonized
    const colony = getFirstColony(engine, 1);
    const startSysId = colony.systemId;

    const result = engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: startSysId });
    assert.ok(result.error);
  });

  it('should reject if ship already in transit', () => {
    const ship = engine._colonyShips[0];
    let targetSysId = null;
    for (const sys of engine.galaxy.systems) {
      if (sys.id === ship.systemId) continue;
      const hasPlanet = sys.planets && sys.planets.some(p => p.habitability >= 20 && !p.colonized);
      if (hasPlanet) { targetSysId = sys.id; break; }
    }
    if (targetSysId == null) return;

    engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: targetSysId });
    const result = engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: targetSysId });
    assert.ok(result.error);
    assert.ok(result.error.includes('transit'));
  });
});

describe('Colony ship movement and colonization', () => {
  it('should move ship along path and found colony on arrival', () => {
    const engine = makeEngine();
    giveShipResources(engine, 1);

    const colony = getFirstColony(engine, 1);
    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();

    const ship = engine._colonyShips[0];
    // Find nearest habitable target
    let targetSysId = null;
    for (const [a, b] of engine.galaxy.hyperlanes) {
      let neighborId = null;
      if (a === ship.systemId) neighborId = b;
      else if (b === ship.systemId) neighborId = a;
      if (neighborId == null) continue;
      const sys = engine.galaxy.systems[neighborId];
      const hasPlanet = sys.planets && sys.planets.some(p => p.habitability >= 20 && !p.colonized);
      if (hasPlanet) { targetSysId = neighborId; break; }
    }
    if (targetSysId == null) return; // skip

    const result = engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: targetSysId });
    assert.ok(result.ok);

    const pathLength = ship.path.length;
    const totalTicks = pathLength * COLONY_SHIP_HOP_TICKS;

    // Tick enough for the ship to arrive
    for (let i = 0; i < totalTicks + 5; i++) engine.tick();

    // Ship should be consumed
    assert.strictEqual(engine._colonyShips.length, 0, 'Ship should be consumed');

    // New colony should exist
    const playerColonyIds = engine._playerColonies.get(1);
    assert.strictEqual(playerColonyIds.length, 2, 'Should have 2 colonies');

    // New colony should have COLONY_SHIP_STARTING_POPS pops
    const newColonyId = playerColonyIds[1];
    const newColony = engine.colonies.get(newColonyId);
    assert.ok(newColony, 'New colony should exist');
    assert.strictEqual(newColony.pops, COLONY_SHIP_STARTING_POPS);
    assert.strictEqual(newColony.isStartingColony, false);
    assert.strictEqual(newColony.systemId, targetSysId);
  });

  it('should emit colonyFounded event on arrival', () => {
    const engine = makeEngine();
    giveShipResources(engine, 1);

    const colony = getFirstColony(engine, 1);
    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();

    const ship = engine._colonyShips[0];
    let targetSysId = null;
    for (const [a, b] of engine.galaxy.hyperlanes) {
      let neighborId = (a === ship.systemId) ? b : (b === ship.systemId) ? a : null;
      if (neighborId == null) continue;
      const sys = engine.galaxy.systems[neighborId];
      if (sys.planets && sys.planets.some(p => p.habitability >= 20 && !p.colonized)) {
        targetSysId = neighborId; break;
      }
    }
    if (targetSysId == null) return;

    engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: targetSysId });

    let events = [];
    engine.onEvent = (evts) => { events = events.concat(evts); };

    const totalTicks = ship.path.length * COLONY_SHIP_HOP_TICKS;
    for (let i = 0; i < totalTicks + 5; i++) engine.tick();

    const foundedEvent = events.find(e => e.eventType === 'colonyFounded' && e.playerId === 1);
    assert.ok(foundedEvent, 'Should emit colonyFounded event');
    assert.ok(foundedEvent.systemName);
  });
});

describe('Colony cap enforcement', () => {
  it('should reject buildColonyShip at colony cap', () => {
    const engine = makeEngine();
    // Artificially give player 4 colonies + 1 ship in flight = 5
    const colony = getFirstColony(engine, 1);
    for (let i = 0; i < 4; i++) {
      engine._createColony(1, `Colony ${i + 2}`, { size: 12, type: 'continental', habitability: 80 }, 0);
    }
    // Now at 5 colonies
    giveShipResources(engine, 1);
    const result = engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    assert.ok(result.error);
    assert.ok(result.error.includes('cap'));
  });

  it('should count in-flight ships toward colony cap', () => {
    const engine = makeEngine();
    // Give player 4 colonies
    for (let i = 0; i < 3; i++) {
      engine._createColony(1, `Colony ${i + 2}`, { size: 12, type: 'continental', habitability: 80 }, 0);
    }
    // 4 colonies, build a colony ship
    giveShipResources(engine, 1);
    const colony = getFirstColony(engine, 1);
    const r1 = engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    assert.ok(r1.ok, 'First ship should be allowed (4 colonies + 1 ship = 5)');

    // Try to build another
    giveShipResources(engine, 1);
    // Complete first ship first so it's in _colonyShips
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();
    const r2 = engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    assert.ok(r2.error, 'Second ship should be rejected (4 colonies + 1 in flight = 5)');
  });
});

describe('Colony ship serialization', () => {
  it('should include colony ships in getState', () => {
    const engine = makeEngine();
    giveShipResources(engine, 1);
    const colony = getFirstColony(engine, 1);
    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();

    const state = engine.getState();
    assert.ok(state.colonyShips);
    assert.strictEqual(state.colonyShips.length, 1);
    assert.strictEqual(state.colonyShips[0].ownerId, 1);
  });

  it('should include colony ships in getPlayerState', () => {
    const engine = makeEngine();
    giveShipResources(engine, 1);
    const colony = getFirstColony(engine, 1);
    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();

    const state = engine.getPlayerState(1);
    assert.ok(state.colonyShips);
    assert.strictEqual(state.colonyShips.length, 1);
  });
});

describe('Colony ship toast formatting', () => {
  it('should format colonyFounded event for own colony', () => {
    const { formatGameEvent } = require('../../src/public/js/toast-format');
    const text = formatGameEvent({ eventType: 'colonyFounded', colonyId: 'e5', systemName: 'Alpha Centauri' });
    assert.ok(text.includes('Alpha Centauri'));
    assert.ok(text.includes('founded'));
  });

  it('should format colonyFounded event for other player', () => {
    const { formatGameEvent } = require('../../src/public/js/toast-format');
    const text = formatGameEvent({ eventType: 'colonyFounded', playerName: 'Bob', systemName: 'Sirius' });
    assert.ok(text.includes('Bob'));
    assert.ok(text.includes('Sirius'));
  });

  it('should format colony ship construction complete', () => {
    const { formatGameEvent } = require('../../src/public/js/toast-format');
    const text = formatGameEvent({ eventType: 'constructionComplete', districtType: 'colonyShip', colonyName: 'Home Colony' });
    assert.ok(text.includes('Colony Ship'));
    assert.ok(text.includes('Home Colony'));
  });

  it('should format colonyShipFailed event', () => {
    const { formatGameEvent } = require('../../src/public/js/toast-format');
    const text = formatGameEvent({ eventType: 'colonyShipFailed', systemName: 'Vega', reason: 'Colony cap reached' });
    assert.ok(text.includes('Vega'));
    assert.ok(text.includes('Colony cap'));
  });
});

// ===== Additional coverage for edge cases, race conditions, and validation =====

describe('buildColonyShip — food resource rejection', () => {
  it('should reject if not enough food', () => {
    const engine = makeEngine();
    giveShipResources(engine, 1);
    const state = engine.playerStates.get(1);
    state.resources.food = 10;
    const colony = getFirstColony(engine, 1);
    const result = engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    assert.ok(result.error);
    assert.ok(result.error.includes('food'));
  });
});

describe('buildColonyShip — build queue includes colony ships in queue count', () => {
  it('should count colony ships in build queue toward queue limit', () => {
    const engine = makeEngine();
    const colony = getFirstColony(engine, 1);

    // Fill queue with 3 colony ships
    for (let i = 0; i < 3; i++) {
      giveShipResources(engine, 1);
      engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    }
    assert.strictEqual(colony.buildQueue.length, 3);

    // 4th should be rejected
    giveShipResources(engine, 1);
    const result = engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    assert.ok(result.error);
    assert.ok(result.error.includes('queue'));
  });
});

describe('Colony ship — colony cap reached during transit', () => {
  it('should emit colonyShipFailed when cap reached during transit', () => {
    const engine = makeEngine();
    giveShipResources(engine, 1);

    const colony = getFirstColony(engine, 1);
    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();

    const ship = engine._colonyShips[0];
    // Find habitable target
    let targetSysId = null;
    for (const [a, b] of engine.galaxy.hyperlanes) {
      let neighborId = (a === ship.systemId) ? b : (b === ship.systemId) ? a : null;
      if (neighborId == null) continue;
      const sys = engine.galaxy.systems[neighborId];
      if (sys.planets && sys.planets.some(p => p.habitability >= 20 && !p.colonized)) {
        targetSysId = neighborId; break;
      }
    }
    if (targetSysId == null) return; // skip if no valid target

    engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: targetSysId });

    // While ship is in transit, artificially fill colony cap
    for (let i = 0; i < 4; i++) {
      engine._createColony(1, `Extra ${i}`, { size: 10, type: 'continental', habitability: 80 }, 0);
    }
    // Now player has 5+ colonies — ship should fail on arrival

    let events = [];
    engine.onEvent = (evts) => { events = events.concat(evts); };

    const totalTicks = ship.path.length * COLONY_SHIP_HOP_TICKS;
    for (let i = 0; i < totalTicks + 5; i++) engine.tick();

    // Ship should be removed without founding a colony
    assert.strictEqual(engine._colonyShips.length, 0, 'Ship should be consumed');
    const failEvent = events.find(e => e.eventType === 'colonyShipFailed' && e.reason === 'Colony cap reached');
    assert.ok(failEvent, 'Should emit colonyShipFailed event');
  });
});

describe('Colony ship — planet colonized by another during transit', () => {
  it('should emit colonyShipFailed when target planet already colonized on arrival', () => {
    const engine = makeEngine({
      room: {
        id: 'test-room',
        players: new Map([[1, { name: 'Alice' }], [2, { name: 'Bob' }]]),
        hostId: 1,
        galaxySize: 'small',
        matchTimer: 0,
      },
    });
    giveShipResources(engine, 1);

    const colony = getFirstColony(engine, 1);
    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();

    const ship = engine._colonyShips[0];
    // Find habitable target
    let targetSysId = null;
    for (const sys of engine.galaxy.systems) {
      if (sys.id === ship.systemId) continue;
      const hasPlanet = sys.planets && sys.planets.some(p => p.habitability >= 20 && !p.colonized);
      if (hasPlanet) { targetSysId = sys.id; break; }
    }
    if (targetSysId == null) return;

    engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: targetSysId });

    // While in transit, mark that planet as colonized (simulating another player colonizing it)
    const targetSystem = engine.galaxy.systems[targetSysId];
    const planet = targetSystem.planets.find(p => p.habitability >= 20);
    planet.colonized = true;
    planet.colonyOwner = 2;

    let events = [];
    engine.onEvent = (evts) => { events = events.concat(evts); };

    const totalTicks = ship.path.length * COLONY_SHIP_HOP_TICKS;
    for (let i = 0; i < totalTicks + 5; i++) engine.tick();

    assert.strictEqual(engine._colonyShips.length, 0, 'Ship should be consumed');
    const failEvent = events.find(e => e.eventType === 'colonyShipFailed' && e.reason === 'Planet already colonized');
    assert.ok(failEvent, 'Should emit colonyShipFailed for already-colonized planet');
  });
});

describe('sendColonyShip — validation edge cases', () => {
  let engine, ship;

  beforeEach(() => {
    engine = makeEngine();
    giveShipResources(engine, 1);
    const colony = getFirstColony(engine, 1);
    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();
    ship = engine._colonyShips[0];
  });

  it('should reject missing shipId', () => {
    const result = engine.handleCommand(1, { type: 'sendColonyShip', targetSystemId: 0 });
    assert.ok(result.error);
  });

  it('should reject missing targetSystemId', () => {
    const result = engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id });
    assert.ok(result.error);
  });

  it('should reject NaN targetSystemId', () => {
    const result = engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: 'abc' });
    assert.ok(result.error);
  });

  it('should reject out-of-range targetSystemId', () => {
    const result = engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: 99999 });
    assert.ok(result.error);
  });

  it('should reject if another player tries to send your ship', () => {
    const result = engine.handleCommand(999, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: 0 });
    assert.ok(result.error);
  });

  it('should reject send to same system (own colonized planet)', () => {
    const colony = getFirstColony(engine, 1);
    const result = engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: colony.systemId });
    assert.ok(result.error);
  });
});

describe('Colony ship intermediate movement', () => {
  it('should update ship systemId at each hop', () => {
    const engine = makeEngine();
    giveShipResources(engine, 1);
    const colony = getFirstColony(engine, 1);
    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();

    const ship = engine._colonyShips[0];
    const startSysId = ship.systemId;

    // Find a 2+ hop target
    let hop1 = null;
    for (const [a, b] of engine.galaxy.hyperlanes) {
      if (a === startSysId) { hop1 = b; break; }
      if (b === startSysId) { hop1 = a; break; }
    }
    let hop2 = null;
    if (hop1 != null) {
      for (const [a, b] of engine.galaxy.hyperlanes) {
        const neighbor = (a === hop1 && b !== startSysId) ? b : (b === hop1 && a !== startSysId) ? a : null;
        if (neighbor != null) {
          const sys = engine.galaxy.systems[neighbor];
          if (sys.planets && sys.planets.some(p => p.habitability >= 20 && !p.colonized)) {
            hop2 = neighbor; break;
          }
        }
      }
    }
    if (hop2 == null) return; // skip if no 2-hop target

    engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: hop2 });
    assert.ok(ship.path.length >= 2, 'Path should be 2+ hops');

    const firstHopTarget = ship.path[0];

    // After first hop completes, ship.systemId should update
    for (let i = 0; i < COLONY_SHIP_HOP_TICKS; i++) engine.tick();

    assert.strictEqual(ship.systemId, firstHopTarget, 'Ship should be at first hop system');
    assert.ok(ship.path.length >= 1, 'Path should have remaining hops');
    assert.strictEqual(ship.hopProgress, 0, 'Hop progress should reset');
  });
});

describe('Multiple concurrent colony ships', () => {
  it('should handle two colony ships building at different colonies', () => {
    const engine = makeEngine();

    // Give player a second colony
    engine._createColony(1, 'Colony 2', { size: 12, type: 'continental', habitability: 80 }, 1);
    const colonyIds = engine._playerColonies.get(1);
    assert.strictEqual(colonyIds.length, 2);

    const colony1 = engine.colonies.get(colonyIds[0]);
    const colony2 = engine.colonies.get(colonyIds[1]);

    // Build colony ship at each
    giveShipResources(engine, 1);
    const r1 = engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony1.id });
    assert.ok(r1.ok);

    giveShipResources(engine, 1);
    const r2 = engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony2.id });
    assert.ok(r2.ok);

    // Both should complete after build time
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();
    assert.strictEqual(engine._colonyShips.length, 2, 'Should have 2 ships');
    assert.strictEqual(engine._colonyShips[0].ownerId, 1);
    assert.strictEqual(engine._colonyShips[1].ownerId, 1);
  });

  it('should cap checks count ships building in queue', () => {
    const engine = makeEngine();
    // Give player 3 extra colonies (total 4)
    for (let i = 0; i < 3; i++) {
      engine._createColony(1, `Colony ${i + 2}`, { size: 12, type: 'continental', habitability: 80 }, 0);
    }
    // 4 colonies, no ships yet — can build 1 ship
    giveShipResources(engine, 1);
    const colony = getFirstColony(engine, 1);
    const r1 = engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    assert.ok(r1.ok, '4 colonies + 0 ships = under cap');

    // Complete it so it enters _colonyShips
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();
    assert.strictEqual(engine._colonyShips.length, 1);

    // Now 4 colonies + 1 in-flight ship = 5 = cap
    giveShipResources(engine, 1);
    const r2 = engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    assert.ok(r2.error, '4 colonies + 1 ship = at cap');
  });
});

describe('Colony ship — new colony properties', () => {
  it('should create colony with correct initial state', () => {
    const engine = makeEngine();
    giveShipResources(engine, 1);
    const colony = getFirstColony(engine, 1);
    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();

    const ship = engine._colonyShips[0];
    let targetSysId = null;
    for (const [a, b] of engine.galaxy.hyperlanes) {
      const neighborId = (a === ship.systemId) ? b : (b === ship.systemId) ? a : null;
      if (neighborId == null) continue;
      const sys = engine.galaxy.systems[neighborId];
      if (sys.planets && sys.planets.some(p => p.habitability >= 20 && !p.colonized)) {
        targetSysId = neighborId; break;
      }
    }
    if (targetSysId == null) return;

    engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: targetSysId });
    const totalTicks = ship.path.length * COLONY_SHIP_HOP_TICKS;
    for (let i = 0; i < totalTicks + 5; i++) engine.tick();

    // Verify new colony properties
    const colonyIds = engine._playerColonies.get(1);
    const newColony = engine.colonies.get(colonyIds[colonyIds.length - 1]);
    assert.ok(newColony);
    assert.strictEqual(newColony.pops, COLONY_SHIP_STARTING_POPS);
    assert.strictEqual(newColony.isStartingColony, false);
    assert.strictEqual(newColony.ownerId, 1);
    assert.deepStrictEqual(newColony.districts, []);
    assert.deepStrictEqual(newColony.buildQueue, []);
    assert.strictEqual(newColony.growthProgress, 0);

    // Planet should be marked as colonized
    const targetSystem = engine.galaxy.systems[targetSysId];
    const planet = targetSystem.planets.find(p => p.colonyOwner === 1);
    assert.ok(planet, 'Planet should be marked as colonized');
    assert.strictEqual(planet.colonized, true);

    // System should be owned
    assert.strictEqual(targetSystem.owner, 1);
  });
});
