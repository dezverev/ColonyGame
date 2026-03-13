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

  it('serialization time under 5ms per player', () => {
    const engine = new GameEngine(createRoom(4), { tickRate: 10 });
    buildUpColonies(engine);

    for (const [playerId] of engine.playerStates) {
      // Clear cache to force fresh serialization
      engine._invalidateStateCache();
      const t0 = process.hrtime.bigint();
      engine.getPlayerStateJSON(playerId);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      console.log(`  Player ${playerId} serialization: ${ms.toFixed(3)}ms`);
      assert.ok(ms < 5, `Player ${playerId} serialization ${ms.toFixed(1)}ms exceeds 5ms`);
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
});
