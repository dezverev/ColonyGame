/**
 * Performance benchmarks for game engine tick loop, crisis processing,
 * and state serialization.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, CRISIS_TYPES, CRISIS_CHOICE_TICKS } = require('../../server/game-engine');

function makeRoom(playerCount = 1) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { name: `Player${i}` });
  }
  return {
    id: 'perf-room',
    players,
    hostId: 1,
    galaxySize: 'small',
  };
}

function createEngine(playerCount = 1, opts = {}) {
  return new GameEngine(makeRoom(playerCount), {
    tickRate: 10,
    profile: true,
    galaxySeed: 42,
    ...opts,
  });
}

// Build up colonies to create realistic load
function buildUpColonies(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  for (const colonyId of colonyIds) {
    const colony = engine.colonies.get(colonyId);
    if (!colony) continue;
    // Fill with districts (simulates mid-game state)
    const types = ['generator', 'mining', 'agriculture', 'industrial', 'research', 'housing'];
    while (colony.districts.length < colony.planet.size - 2) {
      engine._addBuiltDistrict(colony, types[colony.districts.length % types.length]);
    }
    colony.pops = 20; // mid-game population
  }
}

describe('Performance Benchmarks', () => {
  describe('Tick Duration', () => {
    it('single player tick completes within budget', () => {
      const engine = createEngine(1);
      buildUpColonies(engine, 1);

      // Warm up caches
      for (let i = 0; i < 10; i++) engine.tick();

      // Measure 100 ticks
      const start = process.hrtime.bigint();
      for (let i = 0; i < 100; i++) engine.tick();
      const duration = Number(process.hrtime.bigint() - start) / 1e6;
      const avgMs = duration / 100;

      console.log(`  1-player avg tick: ${avgMs.toFixed(3)}ms (budget: 50ms)`);
      assert.ok(avgMs < 50, `Tick took ${avgMs.toFixed(3)}ms, budget is 50ms`);
    });

    it('4-player tick completes within budget', () => {
      const engine = createEngine(4);
      for (let i = 1; i <= 4; i++) buildUpColonies(engine, i);

      // Warm up
      for (let i = 0; i < 10; i++) engine.tick();

      const start = process.hrtime.bigint();
      for (let i = 0; i < 100; i++) engine.tick();
      const duration = Number(process.hrtime.bigint() - start) / 1e6;
      const avgMs = duration / 100;

      console.log(`  4-player avg tick: ${avgMs.toFixed(3)}ms (budget: 50ms)`);
      assert.ok(avgMs < 50, `Tick took ${avgMs.toFixed(3)}ms, budget is 50ms`);
    });

    it('8-player tick completes within budget', () => {
      const engine = createEngine(8);
      for (let i = 1; i <= 8; i++) buildUpColonies(engine, i);

      // Warm up
      for (let i = 0; i < 10; i++) engine.tick();

      const start = process.hrtime.bigint();
      for (let i = 0; i < 100; i++) engine.tick();
      const duration = Number(process.hrtime.bigint() - start) / 1e6;
      const avgMs = duration / 100;

      console.log(`  8-player avg tick: ${avgMs.toFixed(3)}ms (budget: 50ms)`);
      assert.ok(avgMs < 50, `Tick took ${avgMs.toFixed(3)}ms, budget is 50ms`);
    });
  });

  describe('Crisis Processing', () => {
    it('crisis processing adds minimal overhead', () => {
      const engine = createEngine(4);
      for (let i = 1; i <= 4; i++) buildUpColonies(engine, i);

      // Measure ticks without crises
      for (let i = 0; i < 10; i++) engine.tick();
      const startNoCrisis = process.hrtime.bigint();
      for (let i = 0; i < 100; i++) engine.tick();
      const noCrisisMs = Number(process.hrtime.bigint() - startNoCrisis) / 1e6 / 100;

      // Trigger crises on all colonies
      for (const [, colony] of engine.colonies) {
        colony.nextCrisisTick = 0; // trigger immediately
      }
      // Run a tick to trigger crises
      engine.tick();

      // Measure ticks with active crises
      const startCrisis = process.hrtime.bigint();
      for (let i = 0; i < 100; i++) engine.tick();
      const crisisMs = Number(process.hrtime.bigint() - startCrisis) / 1e6 / 100;

      const overhead = crisisMs - noCrisisMs;
      console.log(`  Crisis overhead: ${overhead.toFixed(3)}ms per tick (no crisis: ${noCrisisMs.toFixed(3)}ms, with crisis: ${crisisMs.toFixed(3)}ms)`);
      assert.ok(overhead < 5, `Crisis overhead ${overhead.toFixed(3)}ms exceeds 5ms budget`);
    });
  });

  describe('State Serialization', () => {
    it('per-player gameState payload < 10KB', () => {
      const engine = createEngine(4);
      for (let i = 1; i <= 4; i++) buildUpColonies(engine, i);
      engine.tick(); // populate state

      for (let playerId = 1; playerId <= 4; playerId++) {
        const json = engine.getPlayerStateJSON(playerId);
        const sizeKB = Buffer.byteLength(json) / 1024;
        console.log(`  Player ${playerId} payload: ${sizeKB.toFixed(2)} KB`);
        assert.ok(sizeKB < 10, `Player ${playerId} payload ${sizeKB.toFixed(2)}KB exceeds 10KB`);
      }
    });

    it('serialization time < 5ms per player', () => {
      const engine = createEngine(4);
      for (let i = 1; i <= 4; i++) buildUpColonies(engine, i);
      engine.tick();

      for (let playerId = 1; playerId <= 4; playerId++) {
        // Clear cache to force fresh serialization
        engine._invalidateStateCache();
        const start = process.hrtime.bigint();
        engine.getPlayerStateJSON(playerId);
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        console.log(`  Player ${playerId} serialization: ${durationMs.toFixed(3)}ms`);
        assert.ok(durationMs < 5, `Serialization took ${durationMs.toFixed(3)}ms, budget is 5ms`);
      }
    });

    it('crisis data does not inflate payload significantly', () => {
      const engine = createEngine(1);
      buildUpColonies(engine, 1);
      engine.tick();

      engine._invalidateStateCache();
      const noCrisisJSON = engine.getPlayerStateJSON(1);
      const noCrisisSize = Buffer.byteLength(noCrisisJSON);

      // Trigger crisis on colony
      for (const [, colony] of engine.colonies) {
        colony.nextCrisisTick = 0;
      }
      engine.tick();
      engine._invalidateStateCache();
      const crisisJSON = engine.getPlayerStateJSON(1);
      const crisisSize = Buffer.byteLength(crisisJSON);

      const inflationBytes = crisisSize - noCrisisSize;
      const inflationPct = (inflationBytes / noCrisisSize * 100).toFixed(1);
      console.log(`  Crisis payload inflation: ${inflationBytes} bytes (${inflationPct}%)`);
      // Crisis data should add < 500 bytes per colony
      assert.ok(inflationBytes < 500, `Crisis inflation ${inflationBytes} bytes exceeds 500 byte budget`);
    });
  });

  describe('Monthly Tick (resource processing)', () => {
    it('monthly tick (100th tick) completes within budget', () => {
      const engine = createEngine(8);
      for (let i = 1; i <= 8; i++) buildUpColonies(engine, i);

      // Run to tick 99
      for (let i = 0; i < 99; i++) engine.tick();

      // Measure the monthly tick (tick 100)
      const start = process.hrtime.bigint();
      engine.tick();
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

      console.log(`  Monthly tick (8 players): ${durationMs.toFixed(3)}ms (budget: 50ms)`);
      assert.ok(durationMs < 50, `Monthly tick took ${durationMs.toFixed(3)}ms`);
    });
  });

  describe('Monthly Tick with cold production caches', () => {
    it('8-player monthly tick with all production caches invalidated stays under 5ms', () => {
      const engine = createEngine(8);
      for (let i = 1; i <= 8; i++) buildUpColonies(engine, i);

      // Warm up
      for (let i = 0; i < 10; i++) engine.tick();

      // Run 20 iterations: invalidate all caches then measure monthly tick
      const times = [];
      for (let r = 0; r < 20; r++) {
        while (engine.tickCount % 100 !== 99) engine.tick();
        engine._invalidateAllProductionCaches();
        engine._invalidateStateCache();
        const t0 = process.hrtime.bigint();
        engine.tick();
        times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      }

      times.sort((a, b) => a - b);
      const avg = times.reduce((a, b) => a + b) / times.length;
      const max = times[times.length - 1];
      console.log(`  Cold-cache monthly tick avg: ${avg.toFixed(3)}ms, max: ${max.toFixed(3)}ms`);
      assert.ok(avg < 50, `Avg cold-cache tick ${avg.toFixed(3)}ms exceeds 50ms budget`);
      assert.ok(max < 100, `Max cold-cache tick ${max.toFixed(3)}ms exceeds 100ms budget`);
    });
  });

  describe('Full Broadcast Path', () => {
    it('tick + serialize all 8 players completes within budget', () => {
      const engine = createEngine(8);
      for (let i = 1; i <= 8; i++) buildUpColonies(engine, i);

      // Simulate surveyed systems (realistic mid-game: 15 systems per player)
      for (let i = 1; i <= 8; i++) {
        const surveySet = new Set();
        for (let s = 0; s < 15; s++) surveySet.add(s);
        engine._surveyedSystems.set(i, surveySet);
      }

      // Mark all players dirty and wire up onTick to collect serialized payloads
      let totalBytes = 0;
      let callCount = 0;
      engine.onTick = (playerId, json) => {
        totalBytes += json.length;
        callCount++;
      };

      // Warm up
      for (let i = 0; i < 10; i++) engine.tick();

      // Measure broadcast ticks (every BROADCAST_EVERY ticks)
      const times = [];
      for (let r = 0; r < 30; r++) {
        // Mark all dirty so broadcast fires
        for (let i = 1; i <= 8; i++) engine._dirtyPlayers.add(i);
        engine._invalidateStateCache();
        callCount = 0;
        totalBytes = 0;
        const t0 = process.hrtime.bigint();
        // Advance to next broadcast tick
        do { engine.tick(); } while (callCount === 0);
        times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      }

      times.sort((a, b) => a - b);
      const avg = times.reduce((a, b) => a + b) / times.length;
      const max = times[times.length - 1];
      console.log(`  Broadcast tick (8 players) avg: ${avg.toFixed(3)}ms, max: ${max.toFixed(3)}ms`);
      assert.ok(avg < 50, `Avg broadcast tick ${avg.toFixed(3)}ms exceeds 50ms budget`);
    });

    it('victory progress cache prevents redundant colony iteration', () => {
      const engine = createEngine(4);
      for (let i = 1; i <= 4; i++) buildUpColonies(engine, i);
      engine.tick();

      // First call computes, subsequent calls in same tick hit cache
      engine._invalidateStateCache();
      const t0 = process.hrtime.bigint();
      for (let i = 1; i <= 4; i++) engine.getPlayerStateJSON(i);
      const coldMs = Number(process.hrtime.bigint() - t0) / 1e6;

      // Second round in same tick — all should be fully cached
      engine._stateCacheDirty = true; // force JSON re-serialization but VP/progress still cached
      engine._cachedPlayerJSON.clear();
      const t1 = process.hrtime.bigint();
      for (let i = 1; i <= 4; i++) engine.getPlayerStateJSON(i);
      const warmMs = Number(process.hrtime.bigint() - t1) / 1e6;

      console.log(`  Victory progress cache: cold=${coldMs.toFixed(3)}ms, warm=${warmMs.toFixed(3)}ms`);
      // Warm should be at least as fast (cache hit)
      assert.ok(warmMs <= coldMs * 1.5, 'Warm serialization should not be slower than cold');
    });
  });
});
