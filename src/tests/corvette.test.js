const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  CORVETTE_COST, CORVETTE_BUILD_TIME, CORVETTE_HOP_TICKS,
  CORVETTE_HP, CORVETTE_ATTACK, MAX_CORVETTES,
} = require('../../server/game-engine');

// Helper: create a minimal game engine with one player
function createEngine(opts = {}) {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  if (opts.twoPlayers) {
    players.set('p2', { name: 'Player 2' });
  }
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  const engine = new GameEngine(room, { tickRate: 10 });
  return engine;
}

// Helper: get first colony for a player
function getFirstColony(engine, playerId = 'p1') {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

// Helper: give player enough resources to build corvettes
function giveResources(engine, playerId = 'p1') {
  const state = engine.playerStates.get(playerId);
  state.resources.minerals = 5000;
  state.resources.alloys = 5000;
  state.resources.energy = 5000;
  state.resources.food = 5000;
}

// Helper: build and complete a corvette, return the ship
function buildAndCompleteCorvette(engine, playerId = 'p1') {
  const colony = getFirstColony(engine, playerId);
  giveResources(engine, playerId);
  const result = engine.handleCommand(playerId, { type: 'buildCorvette', colonyId: colony.id });
  assert.ok(result.ok, 'buildCorvette should succeed');
  // Fast-forward through build time
  for (let i = 0; i < CORVETTE_BUILD_TIME; i++) {
    engine.tick();
  }
  const ship = engine._militaryShips.find(s => s.ownerId === playerId);
  assert.ok(ship, 'Corvette should be spawned after build completes');
  return ship;
}

describe('Corvette ship class — constants', () => {
  it('corvette cost constants are correct', () => {
    assert.deepStrictEqual(CORVETTE_COST, { minerals: 100, alloys: 50 });
  });

  it('corvette build time is 400 ticks', () => {
    assert.strictEqual(CORVETTE_BUILD_TIME, 400);
  });

  it('corvette movement speed is 40 ticks per hop', () => {
    assert.strictEqual(CORVETTE_HOP_TICKS, 40);
  });

  it('corvette stats are correct', () => {
    assert.strictEqual(CORVETTE_HP, 10);
    assert.strictEqual(CORVETTE_ATTACK, 3);
  });

  it('max corvettes per player is 10', () => {
    assert.strictEqual(MAX_CORVETTES, 10);
  });
});

describe('Corvette ship class — initialization', () => {
  it('engine starts with empty military ships array', () => {
    const engine = createEngine();
    assert.ok(Array.isArray(engine._militaryShips));
    assert.strictEqual(engine._militaryShips.length, 0);
  });
});

describe('Corvette ship class — build command', () => {
  it('buildCorvette deducts resources and queues build', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    giveResources(engine);
    const state = engine.playerStates.get('p1');
    const mineralsBefore = state.resources.minerals;
    const alloysBefore = state.resources.alloys;

    const result = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    assert.ok(result.ok);
    assert.strictEqual(state.resources.minerals, mineralsBefore - CORVETTE_COST.minerals);
    assert.strictEqual(state.resources.alloys, alloysBefore - CORVETTE_COST.alloys);
    assert.strictEqual(colony.buildQueue.length, 1);
    assert.strictEqual(colony.buildQueue[0].type, 'corvette');
    assert.strictEqual(colony.buildQueue[0].ticksRemaining, CORVETTE_BUILD_TIME);
  });

  it('buildCorvette fails with missing colonyId', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', { type: 'buildCorvette' });
    assert.ok(result.error);
  });

  it('buildCorvette fails for non-owned colony', () => {
    const engine = createEngine({ twoPlayers: true });
    const colony = getFirstColony(engine, 'p1');
    giveResources(engine, 'p2');
    const result = engine.handleCommand('p2', { type: 'buildCorvette', colonyId: colony.id });
    assert.ok(result.error);
    assert.match(result.error, /Not your colony/);
  });

  it('buildCorvette fails with insufficient resources', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    const state = engine.playerStates.get('p1');
    state.resources.minerals = 0;
    state.resources.alloys = 0;

    const result = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    assert.ok(result.error);
    assert.match(result.error, /Not enough/);
  });

  it('buildCorvette fails when build queue is full', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    giveResources(engine);

    // Fill the queue
    colony.buildQueue.push({ id: 1, type: 'mining', ticksRemaining: 100 });
    colony.buildQueue.push({ id: 2, type: 'mining', ticksRemaining: 100 });
    colony.buildQueue.push({ id: 3, type: 'mining', ticksRemaining: 100 });

    const result = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    assert.ok(result.error);
    assert.match(result.error, /Build queue full/);
  });

  it('buildCorvette fails when corvette cap reached', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    giveResources(engine);

    // Manually add MAX_CORVETTES ships
    for (let i = 0; i < MAX_CORVETTES; i++) {
      engine._addMilitaryShip({
        id: engine._nextId(), ownerId: 'p1', systemId: colony.systemId,
        targetSystemId: null, path: [], hopProgress: 0,
        hp: CORVETTE_HP, attack: CORVETTE_ATTACK,
      });
    }

    const result = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    assert.ok(result.error);
    assert.match(result.error, /Corvette cap reached/);
  });

  it('building corvettes count toward cap', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    giveResources(engine);

    // Add MAX_CORVETTES - 1 built ships + 1 in build queue
    for (let i = 0; i < MAX_CORVETTES - 1; i++) {
      engine._addMilitaryShip({
        id: engine._nextId(), ownerId: 'p1', systemId: colony.systemId,
        targetSystemId: null, path: [], hopProgress: 0,
        hp: CORVETTE_HP, attack: CORVETTE_ATTACK,
      });
    }
    colony.buildQueue.push({ id: engine._nextId(), type: 'corvette', ticksRemaining: 100 });

    const result = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    assert.ok(result.error);
    assert.match(result.error, /Corvette cap reached/);
  });
});

describe('Corvette ship class — construction completion', () => {
  it('corvette spawns at colony system after build completes', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    giveResources(engine);

    engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });

    // Tick through build time
    for (let i = 0; i < CORVETTE_BUILD_TIME; i++) {
      engine.tick();
    }

    assert.strictEqual(engine._militaryShips.length, 1);
    const ship = engine._militaryShips[0];
    assert.strictEqual(ship.ownerId, 'p1');
    assert.strictEqual(ship.systemId, colony.systemId);
    assert.strictEqual(ship.hp, CORVETTE_HP);
    assert.strictEqual(ship.attack, CORVETTE_ATTACK);
    assert.deepStrictEqual(ship.path, []);
    assert.strictEqual(ship.targetSystemId, null);
  });

  it('constructionComplete event fires for corvette', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    giveResources(engine);

    const allEvents = [];
    engine.onEvent = (evts) => allEvents.push(...evts);

    engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    for (let i = 0; i < CORVETTE_BUILD_TIME; i++) {
      engine.tick();
    }

    const constructEvent = allEvents.find(e => e.eventType === 'constructionComplete' && e.districtType === 'corvette');
    assert.ok(constructEvent, 'constructionComplete event should be emitted for corvette');
    assert.strictEqual(constructEvent.colonyName, colony.name);
  });
});

describe('Corvette ship class — sendFleet command', () => {
  it('sendFleet moves corvette to target system', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    const colony = getFirstColony(engine);

    // Find an adjacent system
    const adj = engine._adjacency.get(colony.systemId);
    assert.ok(adj && adj.length > 0, 'Colony should have adjacent systems');
    const targetSysId = adj[0];

    const result = engine.handleCommand('p1', { type: 'sendFleet', shipId: ship.id, targetSystemId: targetSysId });
    assert.ok(result.ok);
    assert.strictEqual(ship.targetSystemId, targetSysId);
    assert.ok(ship.path.length > 0);
    assert.strictEqual(ship.hopProgress, 0);
  });

  it('sendFleet fails with missing shipId', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', { type: 'sendFleet', targetSystemId: 0 });
    assert.ok(result.error);
  });

  it('sendFleet fails with missing targetSystemId', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    const result = engine.handleCommand('p1', { type: 'sendFleet', shipId: ship.id });
    assert.ok(result.error);
  });

  it('sendFleet fails for non-owned corvette', () => {
    const engine = createEngine({ twoPlayers: true });
    const ship = buildAndCompleteCorvette(engine, 'p1');
    const colony2 = getFirstColony(engine, 'p2');
    const adj = engine._adjacency.get(colony2.systemId);

    const result = engine.handleCommand('p2', { type: 'sendFleet', shipId: ship.id, targetSystemId: adj[0] });
    assert.ok(result.error);
    assert.match(result.error, /not found/);
  });

  it('sendFleet fails when ship already in transit', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    const colony = getFirstColony(engine);
    const adj = engine._adjacency.get(colony.systemId);

    engine.handleCommand('p1', { type: 'sendFleet', shipId: ship.id, targetSystemId: adj[0] });
    const result = engine.handleCommand('p1', { type: 'sendFleet', shipId: ship.id, targetSystemId: adj[0] });
    assert.ok(result.error);
    assert.match(result.error, /already in transit/);
  });

  it('sendFleet fails when target is current system', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);

    const result = engine.handleCommand('p1', { type: 'sendFleet', shipId: ship.id, targetSystemId: ship.systemId });
    assert.ok(result.error);
    assert.match(result.error, /Already at target/);
  });

  it('sendFleet fails for invalid target system', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);

    const result = engine.handleCommand('p1', { type: 'sendFleet', shipId: ship.id, targetSystemId: 99999 });
    assert.ok(result.error);
  });
});

describe('Corvette ship class — movement', () => {
  it('corvette moves along hyperlanes at CORVETTE_HOP_TICKS rate', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    const colony = getFirstColony(engine);
    const adj = engine._adjacency.get(colony.systemId);
    const targetSysId = adj[0];

    engine.handleCommand('p1', { type: 'sendFleet', shipId: ship.id, targetSystemId: targetSysId });
    const startSystem = ship.systemId;

    // Tick until arrival
    for (let i = 0; i < CORVETTE_HOP_TICKS; i++) {
      engine.tick();
    }

    assert.strictEqual(ship.systemId, targetSysId);
    assert.notStrictEqual(ship.systemId, startSystem);
    assert.strictEqual(ship.path.length, 0);
    assert.strictEqual(ship.targetSystemId, null);
  });

  it('corvette hop progress increments each tick', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    const colony = getFirstColony(engine);
    const adj = engine._adjacency.get(colony.systemId);

    engine.handleCommand('p1', { type: 'sendFleet', shipId: ship.id, targetSystemId: adj[0] });

    engine.tick();
    assert.strictEqual(ship.hopProgress, 1);
    engine.tick();
    assert.strictEqual(ship.hopProgress, 2);
  });

  it('corvette clears targetSystemId on arrival', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    const colony = getFirstColony(engine);
    const adj = engine._adjacency.get(colony.systemId);

    engine.handleCommand('p1', { type: 'sendFleet', shipId: ship.id, targetSystemId: adj[0] });

    for (let i = 0; i < CORVETTE_HOP_TICKS; i++) {
      engine.tick();
    }

    assert.strictEqual(ship.targetSystemId, null);
  });
});

describe('Corvette ship class — VP integration', () => {
  it('each corvette adds +1 VP', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    const vpAfter = engine._calcVPBreakdown('p1');

    assert.strictEqual(vpAfter.corvettes, 1);
    assert.strictEqual(vpAfter.militaryVP, 1);
    // militaryVP should be exactly corvettes count
    assert.strictEqual(vpAfter.militaryVP, vpAfter.corvettes);
  });

  it('VP breakdown includes corvettes and militaryVP fields', () => {
    const engine = createEngine();
    const breakdown = engine._calcVPBreakdown('p1');
    assert.ok('corvettes' in breakdown);
    assert.ok('militaryVP' in breakdown);
    assert.strictEqual(breakdown.corvettes, 0);
    assert.strictEqual(breakdown.militaryVP, 0);
  });

  it('multiple corvettes stack VP', () => {
    const engine = createEngine();
    giveResources(engine);
    const colony = getFirstColony(engine);

    // Build 3 corvettes
    for (let i = 0; i < 3; i++) {
      engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
      for (let t = 0; t < CORVETTE_BUILD_TIME; t++) engine.tick();
    }

    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.corvettes, 3);
    assert.strictEqual(breakdown.militaryVP, 3);
  });
});

describe('Corvette ship class — state serialization', () => {
  it('getState includes militaryShips array', () => {
    const engine = createEngine();
    const state = engine.getState();
    assert.ok(Array.isArray(state.militaryShips));
    assert.strictEqual(state.militaryShips.length, 0);
  });

  it('getPlayerState includes militaryShips array', () => {
    const engine = createEngine();
    const state = engine.getPlayerState('p1');
    assert.ok(Array.isArray(state.militaryShips));
  });

  it('corvette serialization includes all fields', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);

    engine._invalidateStateCache();
    const state = engine.getState();
    assert.strictEqual(state.militaryShips.length, 1);
    const serialized = state.militaryShips[0];
    assert.strictEqual(serialized.id, ship.id);
    assert.strictEqual(serialized.ownerId, 'p1');
    assert.strictEqual(serialized.systemId, ship.systemId);
    assert.strictEqual(serialized.hp, CORVETTE_HP);
    assert.strictEqual(serialized.attack, CORVETTE_ATTACK);
    assert.ok(Array.isArray(serialized.path));
  });

  it('getPlayerState includes corvettes count for scoreboard', () => {
    const engine = createEngine();
    buildAndCompleteCorvette(engine);

    engine._invalidateStateCache();
    const state = engine.getPlayerState('p1');
    const me = state.players.find(p => p.id === 'p1');
    assert.strictEqual(me.corvettes, 1);
  });

  it('getPlayerStateJSON includes militaryShips', () => {
    const engine = createEngine();
    buildAndCompleteCorvette(engine);

    engine._invalidateStateCache();
    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    assert.ok(Array.isArray(parsed.militaryShips));
    assert.strictEqual(parsed.militaryShips.length, 1);
  });

  it('other players see corvette count in scoreboard', () => {
    const engine = createEngine({ twoPlayers: true });
    buildAndCompleteCorvette(engine, 'p1');

    engine._invalidateStateCache();
    const state = engine.getPlayerState('p2');
    const p1 = state.players.find(p => p.id === 'p1');
    assert.strictEqual(p1.corvettes, 1);
  });
});

describe('Corvette ship class — build queue cancellation', () => {
  it('cancelling corvette build refunds 50% resources', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    giveResources(engine);
    const state = engine.playerStates.get('p1');

    engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    const mineralsAfterBuild = state.resources.minerals;
    const alloysAfterBuild = state.resources.alloys;

    const queueItem = colony.buildQueue[0];
    engine.handleCommand('p1', { type: 'demolish', colonyId: colony.id, districtId: queueItem.id });

    assert.strictEqual(state.resources.minerals, mineralsAfterBuild + Math.floor(CORVETTE_COST.minerals / 2));
    assert.strictEqual(state.resources.alloys, alloysAfterBuild + Math.floor(CORVETTE_COST.alloys / 2));
    assert.strictEqual(colony.buildQueue.length, 0);
  });
});

describe('Corvette ship class — _removeMilitaryShip', () => {
  it('removes a ship from the array', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    assert.strictEqual(engine._militaryShips.length, 1);

    engine._removeMilitaryShip(ship);
    assert.strictEqual(engine._militaryShips.length, 0);
  });

  it('no-op when ship not in array', () => {
    const engine = createEngine();
    engine._removeMilitaryShip({ id: 999 });
    assert.strictEqual(engine._militaryShips.length, 0);
  });
});

describe('Corvette ship class — edge cases', () => {
  it('multiple corvettes from different colonies', () => {
    const engine = createEngine();
    giveResources(engine);
    const colony = getFirstColony(engine);

    // Build 2 corvettes sequentially
    engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    for (let t = 0; t < CORVETTE_BUILD_TIME; t++) engine.tick();
    engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    for (let t = 0; t < CORVETTE_BUILD_TIME; t++) engine.tick();

    assert.strictEqual(engine._militaryShips.length, 2);
    assert.notStrictEqual(engine._militaryShips[0].id, engine._militaryShips[1].id);
  });

  it('corvettes from different players tracked separately', () => {
    const engine = createEngine({ twoPlayers: true });
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');

    const colony1 = getFirstColony(engine, 'p1');
    const colony2 = getFirstColony(engine, 'p2');

    engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony1.id });
    engine.handleCommand('p2', { type: 'buildCorvette', colonyId: colony2.id });
    for (let t = 0; t < CORVETTE_BUILD_TIME; t++) engine.tick();

    const p1Ships = engine._militaryShips.filter(s => s.ownerId === 'p1');
    const p2Ships = engine._militaryShips.filter(s => s.ownerId === 'p2');
    assert.strictEqual(p1Ships.length, 1);
    assert.strictEqual(p2Ships.length, 1);
  });

  it('corvette at rest can be sent after arrival', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    const colony = getFirstColony(engine);
    const adj = engine._adjacency.get(colony.systemId);
    const target1 = adj[0];

    // Move to target1
    engine.handleCommand('p1', { type: 'sendFleet', shipId: ship.id, targetSystemId: target1 });
    for (let i = 0; i < CORVETTE_HOP_TICKS; i++) engine.tick();

    assert.strictEqual(ship.systemId, target1);
    assert.strictEqual(ship.path.length, 0);

    // Now send to another system
    const adj2 = engine._adjacency.get(target1);
    if (adj2 && adj2.length > 0) {
      const target2 = adj2[0];
      const result = engine.handleCommand('p1', { type: 'sendFleet', shipId: ship.id, targetSystemId: target2 });
      assert.ok(result.ok);
    }
  });
});

describe('Corvette ship class — index consistency', () => {
  it('_militaryShipsByPlayer tracks adds correctly', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    assert.strictEqual(engine._playerCorvetteCount('p1'), 0);

    engine._addMilitaryShip({
      id: 900, ownerId: 'p1', systemId: colony.systemId,
      targetSystemId: null, path: [], hopProgress: 0,
      hp: CORVETTE_HP, attack: CORVETTE_ATTACK,
    });
    assert.strictEqual(engine._playerCorvetteCount('p1'), 1);
    assert.strictEqual(engine._militaryShipsById.get(900).id, 900);
  });

  it('_removeMilitaryShip updates both indices', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);

    const ship = {
      id: 901, ownerId: 'p1', systemId: colony.systemId,
      targetSystemId: null, path: [], hopProgress: 0,
      hp: CORVETTE_HP, attack: CORVETTE_ATTACK,
    };
    engine._addMilitaryShip(ship);
    assert.strictEqual(engine._playerCorvetteCount('p1'), 1);

    engine._removeMilitaryShip(ship);
    assert.strictEqual(engine._playerCorvetteCount('p1'), 0);
    assert.strictEqual(engine._militaryShipsById.get(901), undefined);
    assert.strictEqual(engine._militaryShips.length, 0);
  });

  it('construction-spawned corvettes are indexed', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    assert.strictEqual(engine._playerCorvetteCount('p1'), 1);
    assert.strictEqual(engine._militaryShipsById.get(ship.id), ship);
  });

  it('getPlayerState corvette count uses O(1) index', () => {
    const engine = createEngine();
    buildAndCompleteCorvette(engine);
    buildAndCompleteCorvette(engine);

    const state = engine.getPlayerState('p1');
    const me = state.players[0];
    assert.strictEqual(me.corvettes, 2);
  });
});
