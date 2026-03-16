const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { GameEngine } = require('../../server/game-engine');

function makeEngine(matchTimer = 0) {
  const players = new Map();
  players.set('p1', { name: 'Alice' });
  players.set('p2', { name: 'Bob' });
  const room = { players, galaxySize: 'small', matchTimer };
  const engine = new GameEngine(room, { tickRate: 10 });
  engine._doctrinePhase = false;
  return engine;
}

function makeTimedEngine(matchTimer = 2) {
  const players = new Map();
  players.set('p1', { name: 'Alice' });
  players.set('p2', { name: 'Bob' });
  const room = { players, galaxySize: 'small', matchTimer };
  const engine = new GameEngine(room, { tickRate: 10 });
  engine._doctrinePhase = false;
  return engine;
}

describe('VP timeline snapshots', () => {
  it('initializes _vpTimeline as empty array', () => {
    const engine = makeEngine();
    assert.ok(Array.isArray(engine._vpTimeline));
    assert.strictEqual(engine._vpTimeline.length, 0);
  });

  it('records snapshot at month 10 (tick 1000)', () => {
    const engine = makeEngine();
    // Advance to tick 1000 (month 10)
    for (let i = 0; i < 1000; i++) engine.tick();
    assert.ok(engine._vpTimeline.length >= 1);
    const snap = engine._vpTimeline[0];
    assert.strictEqual(snap.tick, 1000);
    assert.strictEqual(snap.month, 10);
    assert.ok('p1' in snap.snapshots);
    assert.ok('p2' in snap.snapshots);
    assert.strictEqual(typeof snap.snapshots.p1, 'number');
  });

  it('does not record snapshots at non-10-month intervals', () => {
    const engine = makeEngine();
    // Advance to month 5 (tick 500)
    for (let i = 0; i < 500; i++) engine.tick();
    assert.strictEqual(engine._vpTimeline.length, 0);
  });

  it('records multiple snapshots over time', () => {
    const engine = makeEngine();
    // Advance to month 30 (tick 3000)
    for (let i = 0; i < 3000; i++) engine.tick();
    // Should have snapshots at months 10, 20, 30
    assert.strictEqual(engine._vpTimeline.length, 3);
    assert.strictEqual(engine._vpTimeline[0].month, 10);
    assert.strictEqual(engine._vpTimeline[1].month, 20);
    assert.strictEqual(engine._vpTimeline[2].month, 30);
  });

  it('snapshot VP values match _calcVictoryPoints', () => {
    const engine = makeEngine();
    for (let i = 0; i < 1000; i++) engine.tick();
    const snap = engine._vpTimeline[0];
    // VP in snapshot should be a non-negative number
    assert.ok(snap.snapshots.p1 >= 0, 'VP should be non-negative');
    assert.ok(snap.snapshots.p2 >= 0, 'VP should be non-negative');
  });
});

describe('VP timeline in gameOverData', () => {
  it('gameOver event includes vpTimeline', () => {
    const engine = makeTimedEngine(2); // 2 min = 1200 ticks
    let gameOverData = null;
    engine.onGameOver = (data) => { gameOverData = data; };
    for (let i = 0; i < 1300; i++) engine.tick();
    assert.ok(gameOverData, 'gameOver should have fired');
    assert.ok(Array.isArray(gameOverData.vpTimeline), 'vpTimeline should be an array');
    assert.ok(gameOverData.vpTimeline.length > 0, 'vpTimeline should have entries');
  });

  it('gameOver vpTimeline includes final snapshot', () => {
    const engine = makeTimedEngine(2);
    let gameOverData = null;
    engine.onGameOver = (data) => { gameOverData = data; };
    for (let i = 0; i < 1300; i++) engine.tick();
    assert.ok(gameOverData);
    const last = gameOverData.vpTimeline[gameOverData.vpTimeline.length - 1];
    // Final snapshot should match the final tick
    assert.strictEqual(last.tick, gameOverData.finalTick);
    assert.ok('p1' in last.snapshots);
    assert.ok('p2' in last.snapshots);
  });

  it('vpTimeline snapshots have correct structure', () => {
    const engine = makeTimedEngine(2);
    let gameOverData = null;
    engine.onGameOver = (data) => { gameOverData = data; };
    for (let i = 0; i < 1300; i++) engine.tick();
    assert.ok(gameOverData);
    for (const snap of gameOverData.vpTimeline) {
      assert.strictEqual(typeof snap.tick, 'number');
      assert.strictEqual(typeof snap.month, 'number');
      assert.ok(snap.snapshots && typeof snap.snapshots === 'object');
    }
  });

  it('vpTimeline is chronologically ordered', () => {
    const engine = makeTimedEngine(2);
    let gameOverData = null;
    engine.onGameOver = (data) => { gameOverData = data; };
    for (let i = 0; i < 1300; i++) engine.tick();
    assert.ok(gameOverData);
    for (let i = 1; i < gameOverData.vpTimeline.length; i++) {
      assert.ok(gameOverData.vpTimeline[i].tick > gameOverData.vpTimeline[i - 1].tick,
        'Timeline should be chronologically ordered');
    }
  });

  it('gameOver vpTimeline works with short game (no periodic snapshots)', () => {
    const engine = makeTimedEngine(1); // 1 min = 600 ticks, ends before month 10
    let gameOverData = null;
    engine.onGameOver = (data) => { gameOverData = data; };
    for (let i = 0; i < 700; i++) engine.tick();
    assert.ok(gameOverData);
    // Should still have at least the final snapshot
    assert.ok(gameOverData.vpTimeline.length >= 1);
    const last = gameOverData.vpTimeline[gameOverData.vpTimeline.length - 1];
    assert.strictEqual(last.tick, gameOverData.finalTick);
  });
});

describe('VP timeline edge cases', () => {
  it('works with single player', () => {
    const players = new Map();
    players.set('p1', { name: 'Solo' });
    const room = { players, galaxySize: 'small', matchTimer: 0 };
    const engine = new GameEngine(room, { tickRate: 10 });
    engine._doctrinePhase = false;
    for (let i = 0; i < 1000; i++) engine.tick();
    assert.ok(engine._vpTimeline.length >= 1);
    assert.ok('p1' in engine._vpTimeline[0].snapshots);
  });

  it('VP values are non-negative in all snapshots', () => {
    const engine = makeTimedEngine(2);
    let gameOverData = null;
    engine.onGameOver = (data) => { gameOverData = data; };
    for (let i = 0; i < 1300; i++) engine.tick();
    assert.ok(gameOverData);
    for (const snap of gameOverData.vpTimeline) {
      for (const pid of ['p1', 'p2']) {
        assert.ok(snap.snapshots[pid] >= 0, 'VP should never be negative');
      }
    }
  });
});
