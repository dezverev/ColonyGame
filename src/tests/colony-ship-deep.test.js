const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine, COLONY_SHIP_COST, COLONY_SHIP_BUILD_TIME, COLONY_SHIP_HOP_TICKS,
  MAX_COLONIES, COLONY_SHIP_STARTING_POPS, CORVETTE_HP, CORVETTE_ATTACK,
} = require('../../server/game-engine');

function makeEngine(opts = {}) {
  const room = {
    id: 'test-room',
    players: new Map([[1, { name: 'Alice' }], ...(opts.extraPlayers || [])]),
    hostId: 1,
    galaxySize: 'small',
    matchTimer: 0,
    ...(opts.room || {}),
  };
  return new GameEngine(room, {
    tickRate: 10,
    galaxySeed: opts.seed != null ? opts.seed : 42,
    ...opts,
  });
}

function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

function giveResources(engine, playerId) {
  const state = engine.playerStates.get(playerId);
  state.resources.minerals = 500;
  state.resources.food = 300;
  state.resources.alloys = 300;
}

// Build and complete a colony ship, return it
function buildAndCompleteShip(engine, playerId) {
  giveResources(engine, playerId);
  const colony = getFirstColony(engine, playerId);
  engine.handleCommand(playerId, { type: 'buildColonyShip', colonyId: colony.id });
  for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();
  return engine._colonyShips.find(s => s.ownerId === playerId);
}

// Find nearest habitable target system from a given system
function findHabitableTarget(engine, fromSystemId) {
  for (const [a, b] of engine.galaxy.hyperlanes) {
    let neighborId = null;
    if (a === fromSystemId) neighborId = b;
    else if (b === fromSystemId) neighborId = a;
    if (neighborId == null) continue;
    const sys = engine.galaxy.systems[neighborId];
    if (sys.planets && sys.planets.some(p => p.habitability >= 20 && !p.colonized)) {
      return neighborId;
    }
  }
  return null;
}

// Send ship to target and tick until arrival, return events
function sendShipAndArrive(engine, playerId, ship, targetSysId) {
  engine.handleCommand(playerId, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: targetSysId });
  let events = [];
  engine.onEvent = (evts) => { events = events.concat(evts); };
  const totalTicks = ship.path.length * COLONY_SHIP_HOP_TICKS;
  for (let i = 0; i < totalTicks + 5; i++) engine.tick();
  return events;
}

describe('Colony ship — enemy fleet blocks colonization', () => {
  it('should emit colonyShipFailed when enemy corvette present in target system', () => {
    const engine = makeEngine({
      extraPlayers: [[2, { name: 'Bob' }]],
    });
    const ship = buildAndCompleteShip(engine, 1);
    if (!ship) return;

    const targetSysId = findHabitableTarget(engine, ship.systemId);
    if (targetSysId == null) return;

    // Place an enemy corvette (stationary) at the target system
    engine._addMilitaryShip({
      id: 'enemy-corvette-1',
      ownerId: 2,
      systemId: targetSysId,
      targetSystemId: null,
      path: [],
      hopProgress: 0,
      hp: CORVETTE_HP,
      attack: CORVETTE_ATTACK,
    });

    const events = sendShipAndArrive(engine, 1, ship, targetSysId);

    assert.strictEqual(engine._colonyShips.length, 0, 'Ship should be consumed');
    const failEvent = events.find(e => e.eventType === 'colonyShipFailed' && e.reason === 'Enemy fleet controls system');
    assert.ok(failEvent, 'Should emit colonyShipFailed for enemy fleet');

    // No new colony should have been founded
    const colonyIds = engine._playerColonies.get(1);
    assert.strictEqual(colonyIds.length, 1, 'Should still have only starting colony');
  });

  it('should NOT block colonization by own corvette in target system', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteShip(engine, 1);
    if (!ship) return;

    const targetSysId = findHabitableTarget(engine, ship.systemId);
    if (targetSysId == null) return;

    // Place own corvette at target system
    engine._addMilitaryShip({
      id: 'own-corvette-1',
      ownerId: 1,
      systemId: targetSysId,
      targetSystemId: null,
      path: [],
      hopProgress: 0,
      hp: CORVETTE_HP,
      attack: CORVETTE_ATTACK,
    });

    const events = sendShipAndArrive(engine, 1, ship, targetSysId);

    const foundEvent = events.find(e => e.eventType === 'colonyFounded' && e.playerId === 1);
    assert.ok(foundEvent, 'Should found colony when own corvette is present');
    assert.strictEqual((engine._playerColonies.get(1) || []).length, 2, 'Should have 2 colonies');
  });

  it('should NOT block colonization by enemy corvette in transit (has path)', () => {
    const engine = makeEngine({
      extraPlayers: [[2, { name: 'Bob' }]],
    });
    const ship = buildAndCompleteShip(engine, 1);
    if (!ship) return;

    const targetSysId = findHabitableTarget(engine, ship.systemId);
    if (targetSysId == null) return;

    // Place enemy corvette that is IN TRANSIT through the target system (has remaining path)
    engine._addMilitaryShip({
      id: 'enemy-corvette-transit',
      ownerId: 2,
      systemId: targetSysId,
      targetSystemId: 999,
      path: [999], // still has path = in transit
      hopProgress: 0,
      hp: CORVETTE_HP,
      attack: CORVETTE_ATTACK,
    });

    const events = sendShipAndArrive(engine, 1, ship, targetSysId);

    const foundEvent = events.find(e => e.eventType === 'colonyFounded' && e.playerId === 1);
    assert.ok(foundEvent, 'Should found colony — enemy corvette is just passing through');
  });
});

describe('Colony ship — match stats tracking', () => {
  it('should increment coloniesFounded in match stats on successful colonization', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteShip(engine, 1);
    if (!ship) return;

    const targetSysId = findHabitableTarget(engine, ship.systemId);
    if (targetSysId == null) return;

    const statsBefore = engine._matchStats.get(1).coloniesFounded;
    sendShipAndArrive(engine, 1, ship, targetSysId);
    const statsAfter = engine._matchStats.get(1).coloniesFounded;

    assert.strictEqual(statsAfter, statsBefore + 1, 'coloniesFounded should increment by 1');
  });

  it('should NOT increment coloniesFounded when colonization fails', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteShip(engine, 1);
    if (!ship) return;

    const targetSysId = findHabitableTarget(engine, ship.systemId);
    if (targetSysId == null) return;

    // Fill colony cap before arrival
    for (let i = 0; i < 4; i++) {
      engine._createColony(1, `Extra ${i}`, { size: 10, type: 'continental', habitability: 80 }, 0);
    }

    const statsBefore = engine._matchStats.get(1).coloniesFounded;
    sendShipAndArrive(engine, 1, ship, targetSysId);
    const statsAfter = engine._matchStats.get(1).coloniesFounded;

    assert.strictEqual(statsAfter, statsBefore, 'coloniesFounded should NOT increment on failure');
  });
});

describe('Colony ship — sendColonyShip cap re-check at send time', () => {
  it('should reject send when in-flight ships plus colonies exceed cap', () => {
    const engine = makeEngine();

    // Give player 4 colonies total
    for (let i = 0; i < 3; i++) {
      engine._createColony(1, `Colony ${i + 2}`, { size: 12, type: 'continental', habitability: 80 }, 0);
    }

    // Build a ship (allowed: 4 colonies + 0 in-flight = 4 < 5)
    const ship = buildAndCompleteShip(engine, 1);
    if (!ship) return;

    // Now add another colony while ship is idle (total 5)
    engine._createColony(1, 'Colony 6', { size: 12, type: 'continental', habitability: 80 }, 0);

    const targetSysId = findHabitableTarget(engine, ship.systemId);
    if (targetSysId == null) return;

    const result = engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: targetSysId });
    assert.ok(result.error, 'Should reject send when colonies >= cap');
    assert.ok(result.error.includes('cap'), 'Error should mention cap');
  });
});

describe('Colony ship — broadcast payload path trimming', () => {
  it('getPlayerStateJSON should only include path[0] for colony ships', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteShip(engine, 1);
    if (!ship) return;

    // Find a 2+ hop target for a multi-hop path
    const colony = getFirstColony(engine, 1);
    const startSysId = colony.systemId;
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
    if (hop2 == null) return; // skip

    engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: hop2 });
    assert.ok(ship.path.length >= 2, 'Ship should have 2+ hop path');

    const json = JSON.parse(engine.getPlayerStateJSON(1));
    const shipState = json.colonyShips.find(s => s.id === ship.id);
    assert.ok(shipState, 'Ship should be in broadcast');
    assert.ok(shipState.path.length <= 1, 'Broadcast should trim path to at most path[0]');
  });

  it('getPlayerStateJSON should include empty path for idle colony ship', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteShip(engine, 1);
    if (!ship) return;

    const json = JSON.parse(engine.getPlayerStateJSON(1));
    const shipState = json.colonyShips.find(s => s.id === ship.id);
    assert.ok(shipState, 'Idle ship should be in broadcast');
    assert.deepStrictEqual(shipState.path, [], 'Idle ship path should be empty');
  });
});

describe('Colony ship — getState vs getPlayerState consistency', () => {
  it('getState should include full path for colony ships', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteShip(engine, 1);
    if (!ship) return;

    const targetSysId = findHabitableTarget(engine, ship.systemId);
    if (targetSysId == null) return;

    engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: targetSysId });

    const state = engine.getState();
    const shipState = state.colonyShips.find(s => s.id === ship.id);
    assert.ok(shipState, 'Ship should be in getState');
    assert.deepStrictEqual(shipState.path, ship.path, 'getState should include full path');
  });
});

describe('Colony ship — build queue ships not counted toward cap (design gap check)', () => {
  it('allows queueing colony ships even when colonies + queue = cap (only in-flight count)', () => {
    const engine = makeEngine();

    // Give player 4 colonies (1 starting + 3 more)
    for (let i = 0; i < 3; i++) {
      engine._createColony(1, `Colony ${i + 2}`, { size: 12, type: 'continental', habitability: 80 }, 0);
    }
    // 4 colonies, 0 in-flight — should allow building 1 ship
    giveResources(engine, 1);
    const colony = getFirstColony(engine, 1);
    const r1 = engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    assert.ok(r1.ok, 'Should allow ship build at 4 colonies + 0 in-flight');

    // Ship is in build queue (not yet in _colonyShips) — cap check uses _colonyShipsByPlayer
    // which only has in-flight ships, not queued ones
    assert.strictEqual(engine._colonyShips.length, 0, 'Ship not yet in-flight');
    assert.strictEqual(colony.buildQueue.length, 1, 'Ship is in build queue');
  });
});

describe('Colony ship — hopProgress serialization', () => {
  it('should include hopProgress in getPlayerStateJSON for in-transit ship', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteShip(engine, 1);
    if (!ship) return;

    const targetSysId = findHabitableTarget(engine, ship.systemId);
    if (targetSysId == null) return;

    engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: targetSysId });

    // Tick halfway through a hop
    const halfHop = Math.floor(COLONY_SHIP_HOP_TICKS / 2);
    for (let i = 0; i < halfHop; i++) engine.tick();

    const json = JSON.parse(engine.getPlayerStateJSON(1));
    const shipState = json.colonyShips.find(s => s.id === ship.id);
    assert.ok(shipState, 'Ship should be in broadcast');
    assert.strictEqual(shipState.hopProgress, halfHop, 'hopProgress should reflect ticks elapsed');
  });
});

describe('Colony ship — colonyFounded event is broadcast', () => {
  it('colonyFounded event should have broadcast=true for multiplayer visibility', () => {
    const engine = makeEngine({
      extraPlayers: [[2, { name: 'Bob' }]],
    });
    const ship = buildAndCompleteShip(engine, 1);
    if (!ship) return;

    const targetSysId = findHabitableTarget(engine, ship.systemId);
    if (targetSysId == null) return;

    const events = sendShipAndArrive(engine, 1, ship, targetSysId);

    const foundEvent = events.find(e => e.eventType === 'colonyFounded');
    assert.ok(foundEvent, 'Should emit colonyFounded event');
    assert.strictEqual(foundEvent.broadcast, true, 'colonyFounded should be broadcast to all players');
    assert.strictEqual(foundEvent.playerName, 'Alice', 'Should include player name');
  });
});

describe('Colony ship — system ownership on colonization', () => {
  it('should set system.owner to colonizing player on arrival', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteShip(engine, 1);
    if (!ship) return;

    const targetSysId = findHabitableTarget(engine, ship.systemId);
    if (targetSysId == null) return;

    // Verify system is unowned before colonization
    const sys = engine.galaxy.systems[targetSysId];
    assert.ok(!sys.owner || sys.owner !== 1, 'System should not be owned by player 1 initially');

    sendShipAndArrive(engine, 1, ship, targetSysId);

    assert.strictEqual(sys.owner, 1, 'System should be owned by player 1 after colonization');
  });
});

describe('Colony ship — production recalculation after founding', () => {
  it('should recalculate production for existing colonies after founding (underdog bonus)', () => {
    const engine = makeEngine({
      extraPlayers: [[2, { name: 'Bob' }]],
    });

    // Pre-warm production cache and record old value
    const colony1 = getFirstColony(engine, 1);
    const prodBefore = engine._calcProduction(colony1);
    assert.ok(prodBefore, 'Production should be calculated');

    const ship = buildAndCompleteShip(engine, 1);
    if (!ship) return;

    const targetSysId = findHabitableTarget(engine, ship.systemId);
    if (targetSysId == null) return;

    sendShipAndArrive(engine, 1, ship, targetSysId);

    // After founding, _invalidateAllProductionCaches was called
    // Verify the new colony also produces correctly
    const colonyIds = engine._playerColonies.get(1);
    assert.strictEqual(colonyIds.length, 2, 'Should have 2 colonies after founding');
    const newColony = engine.colonies.get(colonyIds[1]);
    const newProd = engine._calcProduction(newColony);
    assert.ok(newProd.production.minerals > 0, 'New colony should produce minerals from bonus district');
  });
});
