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

describe('Performance — galaxy generation', () => {
  it('large galaxy generates under 50ms', () => {
    const { generateGalaxy } = require('../../server/galaxy');
    const t0 = process.hrtime.bigint();
    generateGalaxy({ size: 'large', seed: 42 });
    const durationMs = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(durationMs < 50, `Large galaxy took ${durationMs.toFixed(2)}ms, budget 50ms`);
  });
});
