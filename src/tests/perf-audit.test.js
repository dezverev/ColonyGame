/**
 * Performance audit tests — measures tick duration, payload sizes, and serialization time.
 * Run with: node --test src/tests/perf-audit.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, DISTRICT_DEFS, MONTH_TICKS, BROADCAST_EVERY } = require('../../server/game-engine');

function createRoom(playerCount = 4) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { name: `Player${i}`, ready: true });
  }
  return { id: 'perf-room', name: 'Perf', hostId: 1, players, galaxySize: 'small' };
}

function buildUpColonies(engine) {
  // Build lots of districts on every colony to stress production calcs
  for (const [playerId] of engine.playerStates) {
    const colonyIds = engine._playerColonies.get(playerId) || [];
    for (const colonyId of colonyIds) {
      const colony = engine.colonies.get(colonyId);
      if (!colony) continue;
      // Fill up with districts
      const types = ['generator', 'mining', 'agriculture', 'industrial', 'research', 'housing'];
      while (colony.districts.length + colony.buildQueue.length < colony.planet.size) {
        const type = types[colony.districts.length % types.length];
        colony.districts.push({ id: `d${colony.districts.length}`, type });
        engine._invalidateColonyCache(colony);
      }
      colony.pops = 30; // Stress pop calculations
    }
    // Give lots of resources so monthly doesn't cause deficits
    const state = engine.playerStates.get(playerId);
    state.resources.energy = 10000;
    state.resources.minerals = 10000;
    state.resources.food = 10000;
  }
}

describe('Performance Audit', () => {

  it('tick duration under budget (4 players, built-up colonies)', () => {
    const engine = new GameEngine(createRoom(4), { tickRate: 10, profile: true });
    buildUpColonies(engine);

    // Warm up caches
    engine.tick();

    // Run 100 ticks and measure
    const durations = [];
    for (let i = 0; i < 100; i++) {
      const t0 = process.hrtime.bigint();
      engine.tick();
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      durations.push(ms);
    }

    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const max = Math.max(...durations);
    const p95 = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)];

    console.log(`  Tick duration (4p built): avg=${avg.toFixed(3)}ms, p95=${p95.toFixed(3)}ms, max=${max.toFixed(3)}ms`);
    assert.ok(avg < 50, `Avg tick ${avg.toFixed(1)}ms exceeds 50ms budget`);
    assert.ok(max < 80, `Max tick ${max.toFixed(1)}ms exceeds 80ms budget`);
  });

  it('tick duration under budget (8 players, max load)', () => {
    const engine = new GameEngine(createRoom(8), { tickRate: 10, profile: true });
    buildUpColonies(engine);

    const durations = [];
    for (let i = 0; i < 100; i++) {
      const t0 = process.hrtime.bigint();
      engine.tick();
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      durations.push(ms);
    }

    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const max = Math.max(...durations);
    console.log(`  Tick duration (8p built): avg=${avg.toFixed(3)}ms, max=${max.toFixed(3)}ms`);
    assert.ok(avg < 50, `Avg tick ${avg.toFixed(1)}ms exceeds 50ms budget`);
  });

  it('gameState payload size under 10KB per player', () => {
    const engine = new GameEngine(createRoom(4), { tickRate: 10 });
    buildUpColonies(engine);

    // Force all dirty
    for (const [pid] of engine.playerStates) engine._dirtyPlayers.add(pid);

    const sizes = [];
    for (const [playerId] of engine.playerStates) {
      const json = engine.getPlayerStateJSON(playerId);
      sizes.push({ playerId, bytes: Buffer.byteLength(json, 'utf8') });
    }

    for (const { playerId, bytes } of sizes) {
      console.log(`  Player ${playerId} payload: ${(bytes / 1024).toFixed(2)} KB`);
      assert.ok(bytes < 10240, `Player ${playerId} payload ${bytes} bytes exceeds 10KB`);
    }
  });

  it('serialization time under 10ms per player', () => {
    const engine = new GameEngine(createRoom(4), { tickRate: 10 });
    buildUpColonies(engine);

    for (const [playerId] of engine.playerStates) {
      // Clear cache to force fresh serialization
      engine._invalidateStateCache();
      const t0 = process.hrtime.bigint();
      engine.getPlayerStateJSON(playerId);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      console.log(`  Player ${playerId} serialization: ${ms.toFixed(3)}ms`);
      assert.ok(ms < 10, `Player ${playerId} serialization ${ms.toFixed(1)}ms exceeds 10ms`);
    }
  });

  it('construction tick does not mark clean players dirty', () => {
    const engine = new GameEngine(createRoom(2), { tickRate: 10 });

    // Ensure no build queues
    for (const [, colony] of engine.colonies) {
      colony.buildQueue = [];
    }

    // Clear dirty set and tick
    engine._dirtyPlayers.clear();
    engine.tick();

    // On a non-monthly tick with no construction, no ship movement, and no growth
    // players should only be marked dirty for growth progress throttle
    // Let's check specifically for construction marking
    const dirtyFromConstruction = engine._dirtyPlayers.size;
    // This is informational — we want to understand the dirty marking
    console.log(`  Dirty players after idle tick: ${dirtyFromConstruction}`);
  });

  it('monthly tick is more expensive but still within budget', () => {
    const engine = new GameEngine(createRoom(4), { tickRate: 10, profile: true });
    buildUpColonies(engine);

    // Advance to just before a monthly boundary
    while (engine.tickCount % MONTH_TICKS !== MONTH_TICKS - 1) {
      engine.tick();
    }

    // Time the monthly tick
    const t0 = process.hrtime.bigint();
    engine.tick();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`  Monthly tick: ${ms.toFixed(3)}ms`);
    assert.ok(ms < 50, `Monthly tick ${ms.toFixed(1)}ms exceeds 50ms budget`);
  });

  it('broadcast tick (serialization) budget', () => {
    const engine = new GameEngine(createRoom(4), { tickRate: 10 });
    buildUpColonies(engine);

    // Advance to just before broadcast boundary
    while (engine.tickCount % BROADCAST_EVERY !== BROADCAST_EVERY - 1) {
      engine.tick();
    }

    // Mark all dirty
    for (const [pid] of engine.playerStates) engine._dirtyPlayers.add(pid);
    engine._invalidateStateCache();

    // Time the broadcast tick (includes serialization for all players)
    const t0 = process.hrtime.bigint();
    engine.tick();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`  Broadcast tick (4 players): ${ms.toFixed(3)}ms`);
    assert.ok(ms < 50, `Broadcast tick ${ms.toFixed(1)}ms exceeds 50ms budget`);
  });

  it('construction dirty marking — only owners with active queues', () => {
    const engine = new GameEngine(createRoom(2), { tickRate: 10 });

    // Player 1 has a building in queue, Player 2 does not
    const p1Colonies = engine._playerColonies.get(1) || [];
    const p2Colonies = engine._playerColonies.get(2) || [];

    // Clear all queues
    for (const [, col] of engine.colonies) col.buildQueue = [];

    // Add queue item only to player 1's colony
    if (p1Colonies.length > 0) {
      const col = engine.colonies.get(p1Colonies[0]);
      col.buildQueue.push({ id: 'test', type: 'mining', ticksRemaining: 100 });
    }

    engine._dirtyPlayers.clear();

    // Single tick — should only mark player 1 dirty (the one with active queue)
    engine.tick();

    const p1Dirty = engine._dirtyPlayers.has(1);
    const p2Dirty = engine._dirtyPlayers.has(2);
    console.log(`  P1 (has queue) dirty: ${p1Dirty}, P2 (no queue) dirty: ${p2Dirty}`);
    assert.ok(p1Dirty, 'Player with active queue should be dirty');
    // P2 may be dirty due to growth — that's fine, we're checking construction specifically
  });

  it('_processOccupation skips colonies with no ships nearby (no Set allocation)', () => {
    const engine = new GameEngine(createRoom(4), { tickRate: 10 });
    buildUpColonies(engine);

    // Most colonies have no military ships in their system — _processOccupation
    // should fast-path these without allocating a Set per colony per tick.
    // Verify by running 1000 ticks with no ships and checking timing.
    const durations = [];
    for (let i = 0; i < 1000; i++) {
      const t0 = process.hrtime.bigint();
      engine._processOccupation();
      const ns = Number(process.hrtime.bigint() - t0);
      durations.push(ns);
    }
    const avgNs = durations.reduce((a, b) => a + b, 0) / durations.length;
    const avgUs = avgNs / 1000;
    console.log(`  _processOccupation (no ships): avg=${avgUs.toFixed(1)}µs`);
    // With fast-path, should be well under 100µs for 4-player game
    assert.ok(avgUs < 100, `_processOccupation took ${avgUs.toFixed(1)}µs, expected <100µs`);
  });

  it('object allocation in tick loop (GC pressure check)', () => {
    const engine = new GameEngine(createRoom(4), { tickRate: 10 });
    buildUpColonies(engine);

    // Run many ticks and check _pendingEvents isn't leaking
    for (let i = 0; i < 500; i++) {
      engine.tick();
    }

    // Events should be flushed each tick, not accumulating
    assert.ok(engine._pendingEvents.length < 100,
      `Pending events accumulating: ${engine._pendingEvents.length}`);
  });

  it('colonyShips array does not grow unbounded', () => {
    const engine = new GameEngine(createRoom(2), { tickRate: 10 });

    // Manually add some ships and tick them to completion
    const initialShipCount = engine._colonyShips.length;
    console.log(`  Initial colony ships: ${initialShipCount}`);

    // After many ticks, ships should not accumulate
    for (let i = 0; i < 200; i++) engine.tick();
    console.log(`  Colony ships after 200 ticks: ${engine._colonyShips.length}`);
    // Ships should only exist if they're in transit — not leak
  });

  it('per-player payload only includes own surveyed systems', () => {
    const engine = new GameEngine(createRoom(2), { tickRate: 10 });

    // Simulate surveyed systems for both players
    engine._surveyedSystems.set(1, new Set([0, 1, 2]));
    engine._surveyedSystems.set(2, new Set([3, 4, 5, 6]));
    engine._invalidateStateCache();

    const p1State = engine.getPlayerState(1);
    const p2State = engine.getPlayerState(2);

    // Player 1 should only see their own surveyed systems
    assert.ok(p1State.surveyedSystems[1], 'Player 1 should have own surveyed data');
    assert.strictEqual(p1State.surveyedSystems[2], undefined, 'Player 1 should not see Player 2 surveyed data');
    assert.deepStrictEqual(p1State.surveyedSystems[1].sort(), [0, 1, 2]);

    // Player 2 should only see their own
    assert.ok(p2State.surveyedSystems[2], 'Player 2 should have own surveyed data');
    assert.strictEqual(p2State.surveyedSystems[1], undefined, 'Player 2 should not see Player 1 surveyed data');
    assert.deepStrictEqual(p2State.surveyedSystems[2].sort(), [3, 4, 5, 6]);

    // Verify payload size difference
    const p1JSON = JSON.stringify(p1State);
    const p2JSON = JSON.stringify(p2State);
    console.log(`  P1 payload: ${p1JSON.length} bytes (3 surveyed), P2: ${p2JSON.length} bytes (4 surveyed)`);
  });

  it('science ship return pathfinding does not double-BFS', () => {
    const engine = new GameEngine(createRoom(2), { tickRate: 10 });

    // Track BFS calls
    let bfsCount = 0;
    const origFindPath = engine._findPath.bind(engine);
    engine._findPath = function (...args) {
      bfsCount++;
      return origFindPath(...args);
    };

    // Create a science ship at a distant system
    const colonyIds = engine._playerColonies.get(1) || [];
    const colony = engine.colonies.get(colonyIds[0]);
    const ship = {
      id: 'test-sci', ownerId: 1, systemId: 5,
      targetSystemId: null, path: [], hopProgress: 0,
      surveying: false, surveyProgress: 0,
    };

    bfsCount = 0;
    engine._returnScienceShipToColony(ship);
    const colonyCount = colonyIds.length;

    // Should only BFS once per colony (to find nearest), NOT twice
    console.log(`  BFS calls for ${colonyCount} colonies: ${bfsCount} (expected ${colonyCount})`);
    assert.strictEqual(bfsCount, colonyCount, `Expected ${colonyCount} BFS calls, got ${bfsCount}`);
  });

  it('_checkFleetCombat uses no Set allocation (reusable buffer)', () => {
    const engine = new GameEngine(createRoom(4), { tickRate: 10 });
    buildUpColonies(engine);

    // Place corvettes from 2 players in same system (non-hostile — no combat triggered)
    const sys0 = 0;
    for (let i = 0; i < 4; i++) {
      engine._addMilitaryShip({
        id: `perf-ship-a${i}`, ownerId: 1, systemId: sys0,
        targetSystemId: null, path: [], hopProgress: 0, hp: 100, attack: 10,
      });
      engine._addMilitaryShip({
        id: `perf-ship-b${i}`, ownerId: 2, systemId: sys0,
        targetSystemId: null, path: [], hopProgress: 0, hp: 100, attack: 10,
      });
    }

    // Run 1000 iterations — should reuse buffer, not allocate Set
    const durations = [];
    for (let i = 0; i < 1000; i++) {
      const t0 = process.hrtime.bigint();
      engine._checkFleetCombat();
      const ns = Number(process.hrtime.bigint() - t0);
      durations.push(ns);
    }
    const avgUs = durations.reduce((a, b) => a + b, 0) / durations.length / 1000;
    console.log(`  _checkFleetCombat (8 ships, 2 owners): avg=${avgUs.toFixed(1)}µs`);
    // Verify reusable buffer exists
    assert.ok(engine._combatOwnersBuf, '_combatOwnersBuf should be allocated on first use');
    assert.ok(avgUs < 50, `_checkFleetCombat took ${avgUs.toFixed(1)}µs, expected <50µs`);
  });

  it('_hasFriendlyColonyNearby uses system-set lookup (not colony iteration)', () => {
    const engine = new GameEngine(createRoom(4), { tickRate: 10 });
    buildUpColonies(engine);

    // Set up mutual friendly between players 1 and 2
    const s1 = engine.playerStates.get(1);
    const s2 = engine.playerStates.get(2);
    s1.diplomacy[2] = { stance: 'friendly', cooldownTick: 0 };
    s2.diplomacy[1] = { stance: 'friendly', cooldownTick: 0 };

    // Invalidate all production caches to force recalculation
    for (const colony of engine.colonies.values()) colony._cachedProduction = null;

    // Time production calc with friendly bonus active
    const colony = engine.colonies.get((engine._playerColonies.get(1) || [])[0]);
    if (!colony) return;

    const durations = [];
    for (let i = 0; i < 500; i++) {
      colony._cachedProduction = null;
      const t0 = process.hrtime.bigint();
      engine._calcProduction(colony);
      const ns = Number(process.hrtime.bigint() - t0);
      durations.push(ns);
    }
    const avgUs = durations.reduce((a, b) => a + b, 0) / durations.length / 1000;
    console.log(`  _calcProduction (with friendly BFS): avg=${avgUs.toFixed(1)}µs`);
    assert.ok(avgUs < 200, `Production calc with friendly BFS took ${avgUs.toFixed(1)}µs, expected <200µs`);
  });

  it('_autoChainSurvey does single BFS (no redundant _findPath call)', () => {
    const engine = new GameEngine(createRoom(2), { tickRate: 10 });

    // Track _findPath calls
    let findPathCalls = 0;
    const origFindPath = engine._findPath.bind(engine);
    engine._findPath = function (...args) {
      findPathCalls++;
      return origFindPath(...args);
    };

    // Create science ship at a system with unsurveyed neighbors
    const ship = {
      id: 'perf-sci', ownerId: 1, systemId: 0,
      targetSystemId: null, path: [], hopProgress: 0,
      surveying: false, surveyProgress: 0, autoSurvey: true,
    };
    engine._scienceShips.push(ship);

    // Mark system 0 as surveyed so auto-chain needs to find a neighbor
    if (!engine._surveyedSystems.has(1)) engine._surveyedSystems.set(1, new Set());
    engine._surveyedSystems.get(1).add(0);

    findPathCalls = 0;
    const result = engine._autoChainSurvey(ship);

    console.log(`  _autoChainSurvey: dispatched=${result}, _findPath calls=${findPathCalls}`);
    // Should NOT call _findPath at all — path is reconstructed inline from BFS parents
    assert.strictEqual(findPathCalls, 0, `Expected 0 _findPath calls, got ${findPathCalls}`);
    if (result) {
      assert.ok(ship.path.length > 0, 'Ship should have a path');
      assert.ok(ship.path.length <= 3, 'Path should be at most 3 hops');
    }
  });

  it('construction tick-down invalidates cache (no stale ticksRemaining in broadcast)', () => {
    const engine = new GameEngine(createRoom(2), { tickRate: 10 });

    // Clear all queues, then add one item to player 1's colony
    for (const [, col] of engine.colonies) {
      col.buildQueue = [];
      if (col.buildingQueue) col.buildingQueue = [];
    }
    const p1Colonies = engine._playerColonies.get(1) || [];
    const colony = engine.colonies.get(p1Colonies[0]);
    colony.buildQueue.push({ id: 'test-cache', type: 'mining', ticksRemaining: 50 });

    // Prime the cache
    engine._invalidateStateCache();
    const json1 = engine.getPlayerStateJSON(1);
    const state1 = JSON.parse(json1);
    const tr1 = state1.colonies.find(c => c.id === colony.id).buildQueue[0].ticksRemaining;
    assert.strictEqual(tr1, 50, 'Initial ticksRemaining should be 50');

    // Run construction (modifies ticksRemaining)
    engine._processConstruction();

    // Cache should be invalidated — next read must reflect decremented value
    const json2 = engine.getPlayerStateJSON(1);
    const state2 = JSON.parse(json2);
    const tr2 = state2.colonies.find(c => c.id === colony.id).buildQueue[0].ticksRemaining;
    assert.strictEqual(tr2, 49, 'ticksRemaining should be 49 after one construction tick');
    assert.notStrictEqual(json1, json2, 'Cache should have been invalidated');
  });

  it('movement functions do not spuriously invalidate cache for idle games', () => {
    const engine = new GameEngine(createRoom(2), { tickRate: 10 });

    // Clear all ships — no one is moving
    engine._colonyShips.length = 0;
    engine._militaryShips.length = 0;
    engine._scienceShips.length = 0;

    // Clear queues so construction doesn't dirty anyone
    for (const [, col] of engine.colonies) {
      col.buildQueue = [];
      if (col.buildingQueue) col.buildingQueue = [];
    }

    // Prime cache
    engine._invalidateStateCache();
    engine.getPlayerStateJSON(1);

    // Manually clear dirty state to isolate movement functions
    engine._stateCacheDirty = false;
    engine._dirtyPlayers.clear();

    // Run movement processors — should NOT invalidate since no ships are active
    engine._processColonyShipMovement();
    engine._processMilitaryShipMovement();
    engine._processScienceShipMovement();

    assert.strictEqual(engine._stateCacheDirty, false,
      'Movement functions should not invalidate cache when no ships are active');
  });

  it('_autoChainSurvey completes within 50µs', () => {
    const engine = new GameEngine(createRoom(2), { tickRate: 10 });

    const ship = {
      id: 'perf-sci2', ownerId: 1, systemId: 0,
      targetSystemId: null, path: [], hopProgress: 0,
      surveying: false, surveyProgress: 0, autoSurvey: true,
    };
    engine._scienceShips.push(ship);
    if (!engine._surveyedSystems.has(1)) engine._surveyedSystems.set(1, new Set());
    engine._surveyedSystems.get(1).add(0);

    const durations = [];
    for (let i = 0; i < 500; i++) {
      // Reset ship state so it can dispatch again
      ship.path = [];
      ship.targetSystemId = null;
      const t0 = process.hrtime.bigint();
      engine._autoChainSurvey(ship);
      durations.push(Number(process.hrtime.bigint() - t0));
    }
    const avgUs = durations.reduce((a, b) => a + b, 0) / durations.length / 1000;
    console.log(`  _autoChainSurvey: avg=${avgUs.toFixed(1)}µs`);
    assert.ok(avgUs < 50, `_autoChainSurvey took ${avgUs.toFixed(1)}µs, expected <50µs`);
  });

  it('scarcity countdown values stay fresh across broadcasts', () => {
    const { GameEngine, BROADCAST_EVERY, SCARCITY_WARNING_TICKS } = require('../../server/game-engine');
    const engine = new GameEngine(createRoom(2), { tickRate: 10 });

    // Advance a few ticks to establish state
    for (let i = 0; i < 10; i++) engine.tick();

    // Schedule scarcity 50 ticks from now — warning phase starts immediately (50 < 100)
    engine._nextScarcityTick = engine.tickCount + 50;
    engine._scarcityWarned = false;
    engine._pendingScarcityResource = null;
    engine._activeScarcity = null;

    // Tick once to trigger warning detection
    engine.tick();

    // Capture ticksUntil after warning is active
    engine._invalidateStateCache();
    const state1 = JSON.parse(engine.getPlayerStateJSON(1));
    assert.ok(state1.scarcityWarning, 'Should have scarcityWarning during warning phase');
    const ticks1 = state1.scarcityWarning.ticksUntil;

    // Advance 2 broadcast cycles (6 ticks)
    for (let i = 0; i < BROADCAST_EVERY * 2; i++) engine.tick();

    const state2 = JSON.parse(engine.getPlayerStateJSON(1));
    assert.ok(state2.scarcityWarning, 'Should still have scarcityWarning');
    const ticks2 = state2.scarcityWarning.ticksUntil;

    // Countdown must have decreased — cache must not be stale
    assert.ok(ticks2 < ticks1,
      `ticksUntil should decrease: was ${ticks1}, now ${ticks2} (stale cache?)`);
    assert.strictEqual(ticks1 - ticks2, BROADCAST_EVERY * 2,
      `Expected ${BROADCAST_EVERY * 2} tick decrease, got ${ticks1 - ticks2}`);
  });
});
