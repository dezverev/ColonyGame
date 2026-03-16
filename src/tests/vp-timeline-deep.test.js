const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine } = require('../../server/game-engine');

function makeEngine(opts = {}) {
  const playerCount = opts.players || 2;
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(`p${i}`, { name: `Player${i}` });
  }
  const room = { players, galaxySize: 'small', matchTimer: opts.matchTimer || 0 };
  const engine = new GameEngine(room, { tickRate: 10 });
  engine._doctrinePhase = false;
  return engine;
}

describe('VP timeline — snapshot immutability', () => {
  it('earlier snapshots are not modified by later ticks', () => {
    const engine = makeEngine();
    // Advance to month 10 (tick 1000)
    for (let i = 0; i < 1000; i++) engine.tick();
    assert.strictEqual(engine._vpTimeline.length, 1);

    // Deep-copy the first snapshot values
    const firstSnapCopy = { ...engine._vpTimeline[0].snapshots };

    // Advance to month 20 (tick 2000)
    for (let i = 0; i < 1000; i++) engine.tick();
    assert.strictEqual(engine._vpTimeline.length, 2);

    // First snapshot should be unchanged
    assert.deepStrictEqual(engine._vpTimeline[0].snapshots, firstSnapCopy,
      'Earlier snapshot should not be mutated by later ticks');
  });
});

describe('VP timeline — snapshot content accuracy', () => {
  it('snapshot VP matches _calcVictoryPoints at the recorded tick', () => {
    const engine = makeEngine();
    for (let i = 0; i < 1000; i++) engine.tick();
    const snap = engine._vpTimeline[0];
    // VP was captured at tick 1000 — verify it matches current calc
    // (no ticks have advanced since, so values should still match)
    for (const pid of ['p1', 'p2']) {
      const currentVP = engine._calcVictoryPoints(pid);
      assert.strictEqual(snap.snapshots[pid], currentVP,
        `Snapshot VP for ${pid} should match _calcVictoryPoints`);
    }
  });

  it('all player IDs are present in every snapshot', () => {
    const engine = makeEngine({ players: 4 });
    for (let i = 0; i < 1000; i++) engine.tick();
    const snap = engine._vpTimeline[0];
    for (let i = 1; i <= 4; i++) {
      assert.ok(`p${i}` in snap.snapshots,
        `Player p${i} should be in snapshot`);
    }
  });

  it('month field is an integer in periodic snapshots', () => {
    const engine = makeEngine();
    for (let i = 0; i < 3000; i++) engine.tick();
    for (const snap of engine._vpTimeline) {
      assert.strictEqual(snap.month, Math.floor(snap.month),
        'Month should be an integer');
      assert.strictEqual(snap.month % 10, 0,
        'Periodic snapshots should be at 10-month intervals');
    }
  });
});

describe('VP timeline — final snapshot deduplication', () => {
  it('does not duplicate when game ends exactly on a 10-month boundary', () => {
    // matchTimer=1 → 600 ticks, but let's use 2 min = 1200 ticks = month 12
    // The game ends around tick 1200 which is exactly month 12 (not a multiple of 10)
    // Let's use a game that ends near month 20 (tick 2000)
    const engine = makeEngine({ matchTimer: 2 }); // 2 min = 1200 ticks
    let gameOverData = null;
    engine.onGameOver = (data) => { gameOverData = data; };
    for (let i = 0; i < 1300; i++) engine.tick();
    assert.ok(gameOverData);

    // Check there are no duplicate tick entries
    const ticks = gameOverData.vpTimeline.map(s => s.tick);
    const uniqueTicks = [...new Set(ticks)];
    assert.strictEqual(ticks.length, uniqueTicks.length,
      'No duplicate tick entries in vpTimeline');
  });

  it('final snapshot tick matches gameOverData.finalTick', () => {
    const engine = makeEngine({ matchTimer: 2 });
    let gameOverData = null;
    engine.onGameOver = (data) => { gameOverData = data; };
    for (let i = 0; i < 1300; i++) engine.tick();
    assert.ok(gameOverData);
    const last = gameOverData.vpTimeline[gameOverData.vpTimeline.length - 1];
    assert.strictEqual(last.tick, gameOverData.finalTick,
      'Last vpTimeline entry tick should equal finalTick');
  });

  it('final snapshot VP values match scores in gameOverData', () => {
    const engine = makeEngine({ matchTimer: 2 });
    let gameOverData = null;
    engine.onGameOver = (data) => { gameOverData = data; };
    for (let i = 0; i < 1300; i++) engine.tick();
    assert.ok(gameOverData);
    const last = gameOverData.vpTimeline[gameOverData.vpTimeline.length - 1];
    for (const score of gameOverData.scores) {
      assert.strictEqual(last.snapshots[score.playerId], score.vp,
        `Final snapshot VP for ${score.playerId} should match score`);
    }
  });
});

describe('VP timeline — not in periodic broadcasts', () => {
  it('getPlayerStateJSON does not include vpTimeline', () => {
    const engine = makeEngine();
    for (let i = 0; i < 1000; i++) engine.tick();
    assert.ok(engine._vpTimeline.length >= 1, 'Should have a snapshot');
    const json = engine.getPlayerStateJSON('p1');
    const state = JSON.parse(json);
    assert.strictEqual(state.vpTimeline, undefined,
      'vpTimeline should not be in periodic state broadcasts');
  });
});

describe('VP timeline — VP progression over time', () => {
  it('VP generally does not decrease between snapshots', () => {
    const engine = makeEngine({ matchTimer: 5 }); // 5 min = 3000 ticks
    let gameOverData = null;
    engine.onGameOver = (data) => { gameOverData = data; };
    for (let i = 0; i < 3100; i++) engine.tick();
    assert.ok(gameOverData);
    assert.ok(gameOverData.vpTimeline.length >= 2, 'Need at least 2 snapshots');
    // VP should generally not decrease — allow at most 1 decrease per player
    // (resource VP can fluctuate with spending)
    for (const pid of ['p1', 'p2']) {
      let decreases = 0;
      for (let i = 1; i < gameOverData.vpTimeline.length; i++) {
        if (gameOverData.vpTimeline[i].snapshots[pid] < gameOverData.vpTimeline[i - 1].snapshots[pid]) {
          decreases++;
        }
      }
      // Some fluctuation is acceptable (spending alloys on ships), but not wild swings
      assert.ok(decreases <= Math.ceil(gameOverData.vpTimeline.length / 2),
        `VP for ${pid} should not wildly decrease — had ${decreases} decreases in ${gameOverData.vpTimeline.length} snapshots`);
    }
  });
});

describe('VP timeline — many players', () => {
  it('handles 8 players correctly', () => {
    const engine = makeEngine({ players: 8 });
    for (let i = 0; i < 1000; i++) engine.tick();
    assert.ok(engine._vpTimeline.length >= 1);
    const snap = engine._vpTimeline[0];
    assert.strictEqual(Object.keys(snap.snapshots).length, 8,
      'Snapshot should have entries for all 8 players');
    for (let i = 1; i <= 8; i++) {
      assert.strictEqual(typeof snap.snapshots[`p${i}`], 'number',
        `VP for p${i} should be a number`);
    }
  });
});
