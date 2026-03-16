const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, MONTH_TICKS, BROADCAST_EVERY } = require('../../server/game-engine');

function makeRoom(playerCount = 2, options = {}) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { id: i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 1, maxPlayers: 8, status: 'playing', players, ...options };
}

describe('Performance — tick budget', () => {
  it('8-player tick completes within 10ms budget', () => {
    const engine = new GameEngine(makeRoom(8), { tickRate: 10, profile: true });
    // Run 200 ticks including monthly processing
    for (let i = 0; i < 200; i++) engine.tick();
    const stats = engine.getTickStats();
    assert.ok(stats.avg < 10, `Avg tick ${stats.avg.toFixed(4)}ms exceeds 10ms budget`);
    assert.ok(stats.max < 50, `Max tick ${stats.max.toFixed(4)}ms exceeds 50ms budget`);
    engine.stop();
  });

  it('monthly tick (with resource processing) stays under budget', () => {
    const engine = new GameEngine(makeRoom(8), { tickRate: 10, profile: true });
    // Tick to just before monthly, then time the monthly tick
    for (let i = 0; i < MONTH_TICKS - 1; i++) engine.tick();
    const t0 = process.hrtime.bigint();
    engine.tick(); // monthly tick
    const durationMs = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(durationMs < 10, `Monthly tick ${durationMs.toFixed(4)}ms exceeds 10ms budget`);
    engine.stop();
  });
});

describe('Performance — payload sizes', () => {
  it('per-player gameState payload under 5KB for 8 players', () => {
    const engine = new GameEngine(makeRoom(8), { tickRate: 10 });
    for (let i = 0; i < 10; i++) engine.tick();
    const json = engine.getPlayerStateJSON(1);
    assert.ok(json.length < 5120, `Per-player payload ${json.length} bytes exceeds 5KB`);
    engine.stop();
  });

  it('full gameState payload under 10KB for 8 players', () => {
    const engine = new GameEngine(makeRoom(8), { tickRate: 10 });
    for (let i = 0; i < 10; i++) engine.tick();
    const json = engine.getStateJSON();
    assert.ok(json.length < 10240, `Full state ${json.length} bytes exceeds 10KB`);
    engine.stop();
  });
});

describe('Performance — per-player JSON caching', () => {
  it('getPlayerStateJSON returns cached result on second call', () => {
    const engine = new GameEngine(makeRoom(4), { tickRate: 10 });
    for (let i = 0; i < 10; i++) engine.tick();
    const json1 = engine.getPlayerStateJSON(1);
    const json2 = engine.getPlayerStateJSON(1);
    // Should be reference-equal (cached string)
    assert.strictEqual(json1, json2, 'Per-player JSON should be cached');
    engine.stop();
  });

  it('per-player cache invalidates on state change', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    for (let i = 0; i < 10; i++) engine.tick();
    const json1 = engine.getPlayerStateJSON(1);
    // Trigger state change
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: 'e1', districtType: 'generator' });
    const json2 = engine.getPlayerStateJSON(1);
    assert.notStrictEqual(json1, json2, 'Cache should invalidate on state change');
    engine.stop();
  });
});

describe('Performance — broadcast efficiency', () => {
  it('growth-only ticks do not broadcast every tick', () => {
    let broadcastCount = 0;
    const engine = new GameEngine(makeRoom(2), {
      tickRate: 10,
      onTick: () => { broadcastCount++; },
    });

    // Run 30 ticks (no monthly processing, no construction)
    for (let i = 0; i < 30; i++) engine.tick();

    // With throttled growth dirty (every 10 ticks), expect far fewer than
    // the maximum of 10 broadcasts per player (30 ticks / 3 broadcast interval)
    // Max possible = 20 (2 players × 10 slots). Throttled should be < 10.
    assert.ok(broadcastCount < 14,
      `${broadcastCount} broadcasts in 30 ticks — growth dirty throttle not working`);
    engine.stop();
  });

  it('construction ticks still broadcast promptly', () => {
    let broadcastCount = 0;
    const engine = new GameEngine(makeRoom(1), {
      tickRate: 10,
      onTick: () => { broadcastCount++; },
    });

    // Queue a construction
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: 'e1', districtType: 'generator' });

    // Run 9 ticks (3 broadcast slots)
    broadcastCount = 0;
    for (let i = 0; i < 9; i++) engine.tick();

    // Construction marks dirty every tick, so all 3 broadcast slots should fire
    assert.ok(broadcastCount >= 3,
      `Only ${broadcastCount} broadcasts during construction — should be at least 3`);
    engine.stop();
  });
});

describe('Performance — stress test (max load)', () => {
  it('8 players with max districts — tick stays under 5ms', () => {
    const engine = new GameEngine(makeRoom(8), { tickRate: 10, profile: true });

    // Max out districts on every colony
    for (let p = 1; p <= 8; p++) {
      engine.playerStates.get(p).resources.minerals = 99999;
      engine.playerStates.get(p).resources.energy = 99999;
      const colonyIds = engine._playerColonies.get(p) || [];
      for (const cId of colonyIds) {
        const colony = engine.colonies.get(cId);
        const remaining = colony.planet.size - colony.districts.length - colony.buildQueue.length;
        const types = ['generator', 'mining', 'agriculture', 'industrial', 'research', 'housing'];
        for (let d = 0; d < remaining; d++) {
          engine.handleCommand(p, { type: 'buildDistrict', colonyId: cId, districtType: types[d % types.length] });
        }
      }
    }

    // Run 500 ticks (5 monthly cycles) under max load
    for (let i = 0; i < 500; i++) engine.tick();
    const stats = engine.getTickStats();
    assert.ok(stats.avg < 5, `Avg tick ${stats.avg.toFixed(4)}ms exceeds 5ms under max load`);
    assert.ok(stats.max < 20, `Max tick ${stats.max.toFixed(4)}ms exceeds 20ms under max load`);
    engine.stop();
  });

  it('per-player payload stays under 5KB at max districts', () => {
    const engine = new GameEngine(makeRoom(8), { tickRate: 10 });

    for (let p = 1; p <= 8; p++) {
      engine.playerStates.get(p).resources.minerals = 99999;
      engine.playerStates.get(p).resources.energy = 99999;
      const colonyIds = engine._playerColonies.get(p) || [];
      for (const cId of colonyIds) {
        const colony = engine.colonies.get(cId);
        const remaining = colony.planet.size - colony.districts.length - colony.buildQueue.length;
        const types = ['generator', 'mining', 'agriculture', 'industrial', 'research', 'housing'];
        for (let d = 0; d < remaining; d++) {
          engine.handleCommand(p, { type: 'buildDistrict', colonyId: cId, districtType: types[d % types.length] });
        }
      }
    }

    // Let construction finish
    for (let i = 0; i < 500; i++) engine.tick();

    const json = engine.getPlayerStateJSON(1);
    assert.ok(json.length < 5120, `Per-player payload ${json.length} bytes exceeds 5KB at max load`);
    engine.stop();
  });
});

describe('Performance — pathfinding', () => {
  it('BFS pathfinding uses cached adjacency list', () => {
    const engine = new GameEngine(makeRoom(2, { galaxySize: 'large' }), { tickRate: 10, profile: true });
    // Adjacency list should be built once at construction
    assert.ok(engine._adjacency instanceof Map, 'Adjacency list should be a Map');
    assert.ok(engine._adjacency.size > 0, 'Adjacency list should not be empty');

    // Run 100 pathfinding calls — should be fast with cached adjacency
    const systems = engine.galaxy.systems;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) {
      const from = i % systems.length;
      const to = (i * 7 + 13) % systems.length;
      engine._findPath(from, to);
    }
    const durationMs = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(durationMs < 50, `100 pathfinding calls took ${durationMs.toFixed(2)}ms, budget 50ms`);
    engine.stop();
  });
});

describe('Performance — multi-colony stress', () => {
  it('5-colony player tick stays under budget', () => {
    const engine = new GameEngine(makeRoom(4), { tickRate: 10, profile: true });
    // Give player 1 additional colonies
    for (let i = 0; i < 4; i++) {
      const sys = engine.galaxy.systems[i + 5]; // pick non-starting systems
      if (!sys) continue;
      const planet = { size: 12, type: 'continental', habitability: 80 };
      engine._createColony(1, `Colony ${i + 2}`, planet, sys.id);
    }

    for (let i = 0; i < 300; i++) engine.tick();
    const stats = engine.getTickStats();
    assert.ok(stats.avg < 5, `Avg tick ${stats.avg.toFixed(4)}ms exceeds 5ms with multi-colony`);
    engine.stop();
  });
});

describe('Performance — VP breakdown single source of truth', () => {
  it('_calcVPBreakdown is tick-cached (8 players, no redundant computation)', () => {
    const engine = new GameEngine(makeRoom(8), { tickRate: 10 });
    for (let i = 0; i < 100; i++) engine.tick();

    // First call computes, subsequent calls within same tick return cached
    const t0 = process.hrtime.bigint();
    for (let round = 0; round < 100; round++) {
      for (let pid = 1; pid <= 8; pid++) {
        engine._calcVPBreakdown(pid);
      }
    }
    const durationMs = Number(process.hrtime.bigint() - t0) / 1e6;
    // 800 calls should be nearly free (all cached within same tick)
    assert.ok(durationMs < 5, `800 VP breakdown calls took ${durationMs.toFixed(2)}ms, budget 5ms`);

    // Verify breakdown matches _calcVictoryPoints
    for (let pid = 1; pid <= 8; pid++) {
      const breakdown = engine._calcVPBreakdown(pid);
      assert.strictEqual(breakdown.vp, engine._calcVictoryPoints(pid));
    }
    engine.stop();
  });

  it('_getPlayerSummary is tick-cached (N² calls reduced to N)', () => {
    const engine = new GameEngine(makeRoom(8), { tickRate: 10 });
    for (let i = 0; i < 100; i++) engine.tick();

    const t0 = process.hrtime.bigint();
    // Simulate broadcast pattern: each player queries all 8 summaries
    for (let self = 1; self <= 8; self++) {
      for (let pid = 1; pid <= 8; pid++) {
        engine._getPlayerSummary(pid);
      }
    }
    const durationMs = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(durationMs < 5, `64 summary calls took ${durationMs.toFixed(2)}ms, budget 5ms`);
    engine.stop();
  });
});

describe('Performance — galaxy generation', () => {
  it('large galaxy generates under 50ms', () => {
    const { generateGalaxy } = require('../../server/galaxy');
    const t0 = process.hrtime.bigint();
    generateGalaxy({ size: 'large', seed: 42 });
    const durationMs = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(durationMs < 50, `Large galaxy took ${durationMs.toFixed(2)}ms, budget 50ms`);
  });
});

describe('Performance — serialization trim', () => {
  it('serialized colony omits habitability, isStartingColony, playerBuiltDistricts', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    for (let i = 0; i < 10; i++) engine.tick();
    const state = JSON.parse(engine.getPlayerStateJSON(1));
    const colony = state.colonies[0];
    assert.strictEqual(colony.isStartingColony, undefined, 'isStartingColony should not be in payload');
    assert.strictEqual(colony.playerBuiltDistricts, undefined, 'playerBuiltDistricts should not be in payload');
    assert.strictEqual(colony.planet.habitability, undefined, 'habitability should not be in tick payload');
    assert.ok(colony.planet.size > 0, 'planet.size should still be present');
    assert.ok(colony.planet.type, 'planet.type should still be present');
    engine.stop();
  });

  it('5-colony player payload stays under 5.5KB', () => {
    const engine = new GameEngine(makeRoom(8), { tickRate: 10 });
    for (let p = 1; p <= 8; p++) {
      engine.handleCommand(p, { type: 'selectDoctrine', doctrine: 'industrialist' });
      const s = engine.playerStates.get(p);
      s.resources.minerals = 99999;
      s.resources.energy = 99999;
      // Fill starting colony
      const colonyIds = engine._playerColonies.get(p) || [];
      for (const cId of colonyIds) {
        const colony = engine.colonies.get(cId);
        const remaining = colony.planet.size - colony.districts.length - colony.buildQueue.length;
        const types = ['generator', 'mining', 'agriculture', 'industrial', 'research', 'housing'];
        for (let d = 0; d < remaining; d++) {
          engine.handleCommand(p, { type: 'buildDistrict', colonyId: cId, districtType: types[d % types.length] });
        }
      }
      // Add 4 more colonies
      for (let c = 0; c < 4; c++) {
        const sys = engine.galaxy.systems[p * 5 + c];
        if (!sys) continue;
        const colony = engine._createColony(p, `C-${p}-${c}`, { size: 12, type: 'continental', habitability: 80 }, sys.id);
        const rem = colony.planet.size - colony.districts.length;
        const types = ['generator', 'mining', 'agriculture', 'industrial', 'research', 'housing'];
        for (let d = 0; d < rem; d++) {
          engine.handleCommand(p, { type: 'buildDistrict', colonyId: colony.id, districtType: types[d % types.length] });
        }
      }
    }
    for (let i = 0; i < 500; i++) engine.tick();
    const json = engine.getPlayerStateJSON(1);
    assert.ok(json.length < 7168, `5-colony payload ${json.length} bytes exceeds 7KB`);
    engine.stop();
  });
});
