const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  CORVETTE_COST, CORVETTE_BUILD_TIME, CORVETTE_HOP_TICKS,
  CORVETTE_HP, CORVETTE_ATTACK, MAX_CORVETTES,
} = require('../../server/game-engine');

// Helper: create a minimal game engine with one or two players
function createEngine(opts = {}) {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  if (opts.twoPlayers) {
    players.set('p2', { name: 'Player 2' });
  }
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  return new GameEngine(room, { tickRate: 10 });
}

function getFirstColony(engine, playerId = 'p1') {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

function giveResources(engine, playerId = 'p1') {
  const state = engine.playerStates.get(playerId);
  state.resources.minerals = 50000;
  state.resources.alloys = 50000;
  state.resources.energy = 50000;
  state.resources.food = 50000;
}

function buildAndCompleteCorvette(engine, playerId = 'p1') {
  const colony = getFirstColony(engine, playerId);
  giveResources(engine, playerId);
  const result = engine.handleCommand(playerId, { type: 'buildCorvette', colonyId: colony.id });
  assert.ok(result.ok, 'buildCorvette should succeed');
  for (let i = 0; i < CORVETTE_BUILD_TIME; i++) engine.tick();
  const ships = (engine._militaryShipsByPlayer.get(playerId) || []);
  return ships[ships.length - 1];
}

// ── Multi-hop movement ──────────────────────────────────────────────

describe('Corvette deep — multi-hop movement', () => {
  it('ship traverses intermediate systems on a multi-hop path', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    const startSys = ship.systemId;

    // Find a system that is 2+ BFS hops away by walking adjacency
    const adj1 = engine._adjacency.get(startSys);
    assert.ok(adj1 && adj1.length > 0, 'need at least one adjacent system');
    let farTarget = null;
    for (const mid of adj1) {
      const adj2 = engine._adjacency.get(mid) || [];
      const candidate = adj2.find(s => s !== startSys && !adj1.includes(s));
      if (candidate) { farTarget = candidate; break; }
    }
    if (!farTarget) return; // degenerate galaxy — all neighbors share edges

    const result = engine.handleCommand('p1', {
      type: 'sendFleet', shipId: ship.id, targetSystemId: farTarget,
    });
    assert.ok(result.ok);
    assert.ok(ship.path.length >= 2, `path should span at least 2 hops, got ${ship.path.length}`);

    // Snapshot the BFS path before movement consumes it
    const fullPath = [...ship.path];

    // After 1 hop the ship should be at the first waypoint
    for (let i = 0; i < CORVETTE_HOP_TICKS; i++) engine.tick();
    assert.strictEqual(ship.systemId, fullPath[0], 'ship should be at first waypoint after first hop');

    // Tick through all remaining hops
    for (let hop = 1; hop < fullPath.length; hop++) {
      for (let i = 0; i < CORVETTE_HOP_TICKS; i++) engine.tick();
    }
    assert.strictEqual(ship.systemId, farTarget, 'ship should be at final destination');
    assert.strictEqual(ship.path.length, 0);
    assert.strictEqual(ship.targetSystemId, null);
  });

  it('hop progress resets to 0 at each intermediate system', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    const startSys = ship.systemId;
    const adj1 = engine._adjacency.get(startSys);
    const mid = adj1[0];
    const adj2 = engine._adjacency.get(mid);
    const farTarget = adj2.find(s => s !== startSys);
    if (!farTarget) return;

    engine.handleCommand('p1', {
      type: 'sendFleet', shipId: ship.id, targetSystemId: farTarget,
    });

    // Snapshot the first waypoint from BFS path (may differ from manual adjacency walk)
    const firstWaypoint = ship.path[0];

    // Tick to just before arrival at intermediate
    for (let i = 0; i < CORVETTE_HOP_TICKS - 1; i++) engine.tick();
    assert.strictEqual(ship.hopProgress, CORVETTE_HOP_TICKS - 1);

    // One more tick — arrive and reset
    engine.tick();
    assert.strictEqual(ship.hopProgress, 0, 'hop progress should reset after arriving at intermediate');
    assert.strictEqual(ship.systemId, firstWaypoint);
  });
});

// ── Cap enforcement across multiple colonies ────────────────────────

describe('Corvette deep — cap across colonies', () => {
  it('corvettes building on different colonies all count toward cap', () => {
    const engine = createEngine();
    giveResources(engine);
    const colony = getFirstColony(engine);

    // Fill cap with owned ships
    for (let i = 0; i < MAX_CORVETTES - 1; i++) {
      engine._addMilitaryShip({
        id: engine._nextId(), ownerId: 'p1', systemId: colony.systemId,
        targetSystemId: null, path: [], hopProgress: 0,
        hp: CORVETTE_HP, attack: CORVETTE_ATTACK,
      });
    }

    // Put 1 corvette in build queue
    colony.buildQueue.push({ id: engine._nextId(), type: 'corvette', ticksRemaining: 200 });

    // Should be at cap now (9 owned + 1 building = 10)
    const result = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    assert.ok(result.error);
    assert.match(result.error, /Corvette cap reached/);
  });

  it('other player corvettes do not count toward your cap', () => {
    const engine = createEngine({ twoPlayers: true });
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
    const colony1 = getFirstColony(engine, 'p1');
    const colony2 = getFirstColony(engine, 'p2');

    // p2 has MAX_CORVETTES ships
    for (let i = 0; i < MAX_CORVETTES; i++) {
      engine._addMilitaryShip({
        id: engine._nextId(), ownerId: 'p2', systemId: colony2.systemId,
        targetSystemId: null, path: [], hopProgress: 0,
        hp: CORVETTE_HP, attack: CORVETTE_ATTACK,
      });
    }

    // p1 should still be able to build
    const result = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony1.id });
    assert.ok(result.ok, 'p1 should be able to build despite p2 being at cap');
  });
});

// ── Input validation edge cases ─────────────────────────────────────

describe('Corvette deep — input validation', () => {
  it('buildCorvette rejects NaN resources gracefully', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    const state = engine.playerStates.get('p1');
    state.resources.minerals = NaN;

    const result = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    assert.ok(result.error, 'should reject when resources are NaN');
    assert.match(result.error, /Not enough/);
  });

  it('buildCorvette rejects Infinity resources', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    const state = engine.playerStates.get('p1');
    state.resources.minerals = Infinity;
    state.resources.alloys = Infinity;

    const result = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    assert.ok(result.error, 'should reject when resources are Infinity');
  });

  it('sendFleet rejects string targetSystemId', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);

    const result = engine.handleCommand('p1', {
      type: 'sendFleet', shipId: ship.id, targetSystemId: 'abc',
    });
    assert.ok(result.error, 'should reject non-numeric targetSystemId');
  });

  it('sendFleet rejects NaN targetSystemId', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);

    const result = engine.handleCommand('p1', {
      type: 'sendFleet', shipId: ship.id, targetSystemId: NaN,
    });
    assert.ok(result.error, 'should reject NaN targetSystemId');
  });

  it('buildCorvette rejects nonexistent colony ID', () => {
    const engine = createEngine();
    giveResources(engine);
    const result = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: 'fake-colony-999' });
    assert.ok(result.error);
  });

  it('sendFleet rejects non-existent shipId', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', {
      type: 'sendFleet', shipId: 999999, targetSystemId: 0,
    });
    assert.ok(result.error);
    assert.match(result.error, /Corvette not found/);
  });
});

// ── State serialization deep ────────────────────────────────────────

describe('Corvette deep — serialization edge cases', () => {
  it('in-transit corvette serializes path and hopProgress', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    const colony = getFirstColony(engine);
    const adj = engine._adjacency.get(colony.systemId);

    engine.handleCommand('p1', {
      type: 'sendFleet', shipId: ship.id, targetSystemId: adj[0],
    });

    // Tick a few times to get non-zero hopProgress
    for (let i = 0; i < 5; i++) engine.tick();

    engine._invalidateStateCache();
    const json = JSON.parse(engine.getPlayerStateJSON('p1'));
    const serialized = json.militaryShips.find(s => s.id === ship.id);
    assert.ok(serialized);
    assert.strictEqual(serialized.hopProgress, 5);
    assert.ok(serialized.path.length > 0);
    assert.strictEqual(serialized.targetSystemId, adj[0]);
  });

  it('getPlayerStateJSON matches getPlayerState for military ships', () => {
    const engine = createEngine();
    buildAndCompleteCorvette(engine);
    buildAndCompleteCorvette(engine);

    engine._invalidateStateCache();
    const obj = engine.getPlayerState('p1');
    const json = JSON.parse(engine.getPlayerStateJSON('p1'));

    assert.strictEqual(json.militaryShips.length, obj.militaryShips.length);
    for (let i = 0; i < obj.militaryShips.length; i++) {
      assert.strictEqual(json.militaryShips[i].id, obj.militaryShips[i].id);
      assert.strictEqual(json.militaryShips[i].ownerId, obj.militaryShips[i].ownerId);
    }
  });

  it('removed corvettes disappear from serialized state', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    assert.strictEqual(engine._militaryShips.length, 1);

    engine._removeMilitaryShip(ship);
    engine._invalidateStateCache();

    const state = engine.getPlayerState('p1');
    assert.strictEqual(state.militaryShips.length, 0);

    const me = state.players.find(p => p.id === 'p1');
    assert.strictEqual(me.corvettes, 0);
  });
});

// ── Concurrent ship movement ────────────────────────────────────────

describe('Corvette deep — concurrent movement', () => {
  it('multiple corvettes move independently', () => {
    const engine = createEngine();
    const ship1 = buildAndCompleteCorvette(engine);
    const ship2 = buildAndCompleteCorvette(engine);

    const colony = getFirstColony(engine);
    const adj = engine._adjacency.get(colony.systemId);
    assert.ok(adj.length >= 1);

    // Send ship1 to adj[0]
    engine.handleCommand('p1', { type: 'sendFleet', shipId: ship1.id, targetSystemId: adj[0] });

    // Ship2 stays put
    assert.strictEqual(ship2.path.length, 0);

    // After movement completes, ship1 moved but ship2 didn't
    for (let i = 0; i < CORVETTE_HOP_TICKS; i++) engine.tick();

    assert.strictEqual(ship1.systemId, adj[0]);
    assert.strictEqual(ship2.systemId, colony.systemId);
  });

  it('two players ships move simultaneously without interference', () => {
    const engine = createEngine({ twoPlayers: true });
    const ship1 = buildAndCompleteCorvette(engine, 'p1');
    const ship2 = buildAndCompleteCorvette(engine, 'p2');

    const adj1 = engine._adjacency.get(ship1.systemId);
    const adj2 = engine._adjacency.get(ship2.systemId);

    engine.handleCommand('p1', { type: 'sendFleet', shipId: ship1.id, targetSystemId: adj1[0] });
    engine.handleCommand('p2', { type: 'sendFleet', shipId: ship2.id, targetSystemId: adj2[0] });

    for (let i = 0; i < CORVETTE_HOP_TICKS; i++) engine.tick();

    assert.strictEqual(ship1.systemId, adj1[0]);
    assert.strictEqual(ship2.systemId, adj2[0]);
    assert.strictEqual(ship1.targetSystemId, null);
    assert.strictEqual(ship2.targetSystemId, null);
  });
});

// ── Build queue interactions ────────────────────────────────────────

describe('Corvette deep — build queue interactions', () => {
  it('corvette builds after other queue items complete', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    giveResources(engine);

    // Add a short item first
    colony.buildQueue.push({ id: engine._nextId(), type: 'mining', ticksRemaining: 10 });

    // Queue corvette
    const result = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    assert.ok(result.ok);
    assert.strictEqual(colony.buildQueue.length, 2);

    // Tick past the mining item
    for (let i = 0; i < 10; i++) engine.tick();

    // Corvette should now be at front of queue
    assert.strictEqual(colony.buildQueue.length, 1);
    assert.strictEqual(colony.buildQueue[0].type, 'corvette');

    // Tick through corvette build
    for (let i = 0; i < CORVETTE_BUILD_TIME; i++) engine.tick();

    assert.strictEqual(engine._militaryShips.length, 1);
    assert.strictEqual(colony.buildQueue.length, 0);
  });

  it('cancelling mid-queue corvette does not affect other items', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    giveResources(engine);

    // Queue: [mining, corvette]
    colony.buildQueue.push({ id: engine._nextId(), type: 'mining', ticksRemaining: 50 });
    const result = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    assert.ok(result.ok);
    assert.strictEqual(colony.buildQueue.length, 2);

    // Cancel the corvette
    const corvetteItem = colony.buildQueue.find(q => q.type === 'corvette');
    engine.handleCommand('p1', { type: 'demolish', colonyId: colony.id, districtId: corvetteItem.id });

    assert.strictEqual(colony.buildQueue.length, 1);
    assert.strictEqual(colony.buildQueue[0].type, 'mining');
  });
});

// ── VP and scoreboard after ship removal ────────────────────────────

describe('Corvette deep — VP after removal', () => {
  it('VP decreases when corvette is removed', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);

    const vpBefore = engine._calcVPBreakdown('p1');
    assert.strictEqual(vpBefore.corvettes, 1);

    engine._removeMilitaryShip(ship);

    const vpAfter = engine._calcVPBreakdown('p1');
    assert.strictEqual(vpAfter.corvettes, 0);
    assert.strictEqual(vpAfter.militaryVP, 0);
    assert.ok(vpAfter.vp < vpBefore.vp, 'total VP should decrease');
  });

  it('scoreboard reflects correct count after build and removal', () => {
    const engine = createEngine({ twoPlayers: true });
    const ship1 = buildAndCompleteCorvette(engine, 'p1');
    buildAndCompleteCorvette(engine, 'p1');

    engine._invalidateStateCache();
    let state = engine.getPlayerState('p2');
    let p1Entry = state.players.find(p => p.id === 'p1');
    assert.strictEqual(p1Entry.corvettes, 2);

    // Remove one
    engine._removeMilitaryShip(ship1);
    engine._invalidateStateCache();
    state = engine.getPlayerState('p2');
    p1Entry = state.players.find(p => p.id === 'p1');
    assert.strictEqual(p1Entry.corvettes, 1);
  });
});

// ── Cache invalidation ──────────────────────────────────────────────

describe('Corvette deep — cache invalidation', () => {
  it('buildCorvette invalidates state cache', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    giveResources(engine);

    // Prime the cache
    engine.getPlayerStateJSON('p1');

    // Build should invalidate
    engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });

    // Fresh state should show the build queue item
    const json = JSON.parse(engine.getPlayerStateJSON('p1'));
    const myColony = json.colonies.find(c => c.id === colony.id);
    assert.ok(myColony.buildQueue.some(q => q.type === 'corvette'));
  });

  it('sendFleet invalidates state cache', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    const colony = getFirstColony(engine);
    const adj = engine._adjacency.get(colony.systemId);

    // Prime the cache
    engine.getPlayerStateJSON('p1');

    engine.handleCommand('p1', {
      type: 'sendFleet', shipId: ship.id, targetSystemId: adj[0],
    });

    // Fresh state should show movement
    engine._invalidateStateCache();
    const json = JSON.parse(engine.getPlayerStateJSON('p1'));
    const serialized = json.militaryShips.find(s => s.id === ship.id);
    assert.strictEqual(serialized.targetSystemId, adj[0]);
    assert.ok(serialized.path.length > 0);
  });
});

// ── Idle ship behavior ──────────────────────────────────────────────

describe('Corvette deep — idle behavior', () => {
  it('idle corvette does not move during ticks', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    const startSys = ship.systemId;

    // Tick many times — ship should not move
    for (let i = 0; i < 100; i++) engine.tick();

    assert.strictEqual(ship.systemId, startSys);
    assert.strictEqual(ship.hopProgress, 0);
    assert.strictEqual(ship.path.length, 0);
    assert.strictEqual(ship.targetSystemId, null);
  });
});
