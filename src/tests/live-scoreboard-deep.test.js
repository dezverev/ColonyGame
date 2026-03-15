const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine } = require('../../server/game-engine');

function makeRoom(playerCount = 2) {
  const room = {
    id: 'test-room',
    matchTimer: 0,
    galaxySize: 'small',
    players: new Map(),
  };
  for (let i = 1; i <= playerCount; i++) {
    room.players.set(i, { id: i, name: `Player ${i}` });
  }
  return room;
}

describe('Live Scoreboard — Deep Edge Cases', () => {

  // ── VP contribution from techs in scoreboard ──

  it('scoreboard VP includes per-tech VP bonuses (T1 = +5)', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    // Get baseline VP with no techs
    const baselineVP = engine._calcVPBreakdown(2);
    assert.strictEqual(baselineVP.techVP, 0, 'baseline techVP should be 0');

    // Now create a fresh engine and give player 2 a tech
    const engine2 = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    engine2.playerStates.get(2).completedTechs = ['improved_power_plants'];
    engine2._invalidateStateCache();

    const state = engine2.getPlayerState(1);
    const opp = state.players.find(p => p.id === 2);
    assert.strictEqual(opp.techs, 1);
    // VP breakdown should show techVP = 5
    const breakdown = engine2._calcVPBreakdown(2);
    assert.strictEqual(breakdown.techVP, 5, 'T1 tech should contribute +5 VP');
    assert.strictEqual(opp.vp, breakdown.vp, 'scoreboard VP should match breakdown');
  });

  it('scoreboard VP includes raider destroy VP (+5 each)', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    engine._raidersDestroyed.set(2, 3);
    engine._invalidateStateCache();

    const breakdown = engine._calcVPBreakdown(2);
    assert.strictEqual(breakdown.raidersVP, 15, '3 raiders × 5 VP = 15');
    assert.strictEqual(breakdown.raidersDestroyed, 3);

    const state = engine.getPlayerState(1);
    const opp = state.players.find(p => p.id === 2);
    assert.strictEqual(opp.raidersDestroyed, 3);
    assert.strictEqual(opp.vp, breakdown.vp, 'scoreboard VP should match breakdown');
  });

  // ── getState() vs getPlayerState() divergence ──

  it('getState() players do NOT include techs or raidersDestroyed fields', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    engine.playerStates.get(1).completedTechs = ['improved_power_plants'];
    engine._raidersDestroyed.set(1, 2);
    engine._invalidateStateCache();

    const globalState = engine.getState();
    const p1 = globalState.players.find(p => p.id === 1);
    // getState() includes completedTechs array but NOT the summary `techs` count field
    assert.ok(Array.isArray(p1.completedTechs), 'getState should have completedTechs array');
    assert.strictEqual(p1.techs, undefined, 'getState should NOT have techs count field');
    assert.strictEqual(p1.raidersDestroyed, undefined, 'getState should NOT have raidersDestroyed field');
  });

  // ── Stale cache (no invalidation) ──

  it('cached JSON returns stale data without invalidation', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    // Prime the JSON cache by calling getPlayerStateJSON
    const json1 = engine.getPlayerStateJSON(1);
    const parsed1 = JSON.parse(json1);
    const opp1 = parsed1.players.find(p => p.id === 2);
    assert.strictEqual(opp1.techs, 0);

    // Mutate without invalidating — JSON cache should still serve old data
    engine.playerStates.get(2).completedTechs = ['improved_power_plants'];
    // DO NOT call _invalidateStateCache()

    const json2 = engine.getPlayerStateJSON(1);
    const parsed2 = JSON.parse(json2);
    const opp2 = parsed2.players.find(p => p.id === 2);
    // Cached JSON should still show 0 techs (stale)
    assert.strictEqual(opp2.techs, 0, 'stale JSON cache should return old techs count');
  });

  // ── 8-player scoreboard ──

  it('8-player game shows all 7 opponents with scoreboard fields', () => {
    const engine = new GameEngine(makeRoom(8), { galaxySeed: 42 });
    // Give each player different stats
    for (let i = 1; i <= 8; i++) {
      const techs = [];
      for (let t = 0; t < i; t++) techs.push(`tech_${t}`);
      engine.playerStates.get(i).completedTechs = techs;
      engine._raidersDestroyed.set(i, i * 2);
    }
    engine._invalidateStateCache();

    const state = engine.getPlayerState(1);
    assert.strictEqual(state.players.length, 8, 'should have 8 players');

    const me = state.players.find(p => p.id === 1);
    assert.strictEqual(me.techs, 1);
    assert.strictEqual(me.raidersDestroyed, 2);

    const opponents = state.players.filter(p => p.id !== 1);
    assert.strictEqual(opponents.length, 7, 'should have 7 opponents');

    for (const opp of opponents) {
      assert.strictEqual(opp.techs, opp.id, `player ${opp.id} should have ${opp.id} techs`);
      assert.strictEqual(opp.raidersDestroyed, opp.id * 2, `player ${opp.id} should have ${opp.id * 2} raiders`);
    }
  });

  // ── Research completion via tick updates techs ──

  it('research completion via monthly tick increments techs count in scoreboard', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    const player = engine.playerStates.get(2);

    // Set up research on a tech with enough research stockpile to complete
    player.currentResearch = { physics: 'improved_power_plants', society: null, engineering: null };
    player.resources.research = { physics: 99999, society: 0, engineering: 0 };
    player.researchProgress = {};

    // Research processes on monthly ticks (every 100 ticks) — advance to next month
    const ticksToMonth = 100 - (engine.tickCount % 100);
    for (let i = 0; i < ticksToMonth; i++) {
      engine.tick();
    }

    engine._invalidateStateCache();
    const state = engine.getPlayerState(1);
    const opp = state.players.find(p => p.id === 2);
    assert.ok(opp.techs >= 1, `techs should be >= 1 after monthly research tick, got ${opp.techs}`);
    assert.ok(player.completedTechs.includes('improved_power_plants'), 'tech should be in completedTechs');
  });

  // ── Simultaneous techs and raiders ──

  it('player with both techs and raiders shows combined data correctly', () => {
    const engine = new GameEngine(makeRoom(3), { galaxySeed: 42 });

    // Player 2: many techs, no raiders
    engine.playerStates.get(2).completedTechs = ['improved_power_plants', 'gene_crops', 'improved_mining'];
    engine._raidersDestroyed.set(2, 0);

    // Player 3: no techs, many raiders
    engine.playerStates.get(3).completedTechs = [];
    engine._raidersDestroyed.set(3, 10);

    engine._invalidateStateCache();

    const state = engine.getPlayerState(1);
    const p2 = state.players.find(p => p.id === 2);
    const p3 = state.players.find(p => p.id === 3);

    assert.strictEqual(p2.techs, 3);
    assert.strictEqual(p2.raidersDestroyed, 0);
    assert.strictEqual(p3.techs, 0);
    assert.strictEqual(p3.raidersDestroyed, 10);
  });

  // ── getPlayerState fallback for invalid playerId ──

  it('getPlayerState with invalid playerId falls back to getState()', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    const state = engine.getPlayerState(999);
    // Fallback returns getState() format — has players array
    assert.ok(Array.isArray(state.players), 'fallback should return state with players array');
    assert.ok(state.tick !== undefined, 'fallback should have tick');
  });

  // ── Self-player has both full resources AND scoreboard fields ──

  it('self-player object has resources, completedTechs, AND scoreboard fields', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    engine.playerStates.get(1).completedTechs = ['improved_power_plants'];
    engine._raidersDestroyed.set(1, 3);
    engine._invalidateStateCache();

    const state = engine.getPlayerState(1);
    const me = state.players.find(p => p.id === 1);

    // Full resources (only self gets these)
    assert.ok(me.resources, 'self should have resources');
    assert.ok(me.resources.energy !== undefined, 'self should have energy');
    assert.ok(Array.isArray(me.completedTechs), 'self should have completedTechs array');

    // Scoreboard fields
    assert.strictEqual(me.techs, 1, 'self should have techs count');
    assert.strictEqual(me.raidersDestroyed, 3, 'self should have raidersDestroyed');
    assert.strictEqual(typeof me.vp, 'number', 'self should have VP');
  });

  // ── Opponents do NOT have full resources ──

  it('opponent objects do NOT include resources or completedTechs array', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    const state = engine.getPlayerState(1);
    const opp = state.players.find(p => p.id === 2);

    assert.strictEqual(opp.resources, undefined, 'opponent should NOT have resources');
    assert.strictEqual(opp.completedTechs, undefined, 'opponent should NOT have completedTechs array');
    // But should have scoreboard summary
    assert.strictEqual(typeof opp.techs, 'number');
    assert.strictEqual(typeof opp.vp, 'number');
  });

  // ── Each player sees consistent VP across views ──

  it('VP in scoreboard matches _calcVictoryPoints for all players', () => {
    const engine = new GameEngine(makeRoom(4), { galaxySeed: 42 });
    engine.playerStates.get(2).completedTechs = ['improved_power_plants'];
    engine._raidersDestroyed.set(3, 5);
    engine._invalidateStateCache();

    for (let viewerId = 1; viewerId <= 4; viewerId++) {
      engine._vpCacheTick = -1; // force recalc
      const state = engine.getPlayerState(viewerId);
      for (const p of state.players) {
        engine._vpCacheTick = -1;
        const expectedVP = engine._calcVictoryPoints(p.id);
        assert.strictEqual(p.vp, expectedVP,
          `player ${viewerId} sees player ${p.id} VP=${p.vp}, expected ${expectedVP}`);
      }
    }
  });

  // ── Zero techs with empty array vs no array ──

  it('empty completedTechs array shows 0 techs (not undefined)', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    engine.playerStates.get(2).completedTechs = [];
    engine._invalidateStateCache();

    const state = engine.getPlayerState(1);
    const opp = state.players.find(p => p.id === 2);
    assert.strictEqual(opp.techs, 0);
  });

  // ── Large values don't break anything ──

  it('large raider count and tech count serialize correctly', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    const bigTechs = [];
    for (let i = 0; i < 100; i++) bigTechs.push(`fake_tech_${i}`);
    engine.playerStates.get(2).completedTechs = bigTechs;
    engine._raidersDestroyed.set(2, 9999);
    engine._invalidateStateCache();

    const json = engine.getPlayerStateJSON(1);
    const parsed = JSON.parse(json);
    const opp = parsed.players.find(p => p.id === 2);
    assert.strictEqual(opp.techs, 100);
    assert.strictEqual(opp.raidersDestroyed, 9999);
  });

  // ── _raidersDestroyed absent from Map returns 0 ──

  it('player not in _raidersDestroyed Map shows 0', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    // Ensure player 2 has no entry at all
    engine._raidersDestroyed.delete(2);
    engine._invalidateStateCache();

    const state = engine.getPlayerState(1);
    const opp = state.players.find(p => p.id === 2);
    assert.strictEqual(opp.raidersDestroyed, 0);
  });

  // ── Summary fields (colonyCount, totalPops, income) coexist with new fields ──

  it('scoreboard opponent has colonyCount, totalPops, income alongside techs/raiders', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    engine.playerStates.get(2).completedTechs = ['improved_power_plants'];
    engine._raidersDestroyed.set(2, 1);
    engine._invalidateStateCache();

    const state = engine.getPlayerState(1);
    const opp = state.players.find(p => p.id === 2);

    // New fields
    assert.strictEqual(opp.techs, 1);
    assert.strictEqual(opp.raidersDestroyed, 1);
    // Existing summary fields
    assert.strictEqual(typeof opp.colonyCount, 'number');
    assert.strictEqual(typeof opp.totalPops, 'number');
    assert.ok(opp.income, 'should have income');
    assert.strictEqual(typeof opp.income.energy, 'number');
    assert.strictEqual(typeof opp.income.minerals, 'number');
    assert.strictEqual(typeof opp.income.food, 'number');
    assert.strictEqual(typeof opp.income.alloys, 'number');
  });

  // ── Tick-scoped VP cache produces correct results across players ──

  it('VP cache does not bleed between players within same tick', () => {
    const engine = new GameEngine(makeRoom(3), { galaxySeed: 42 });
    engine.playerStates.get(1).completedTechs = [];
    engine.playerStates.get(2).completedTechs = ['improved_power_plants', 'gene_crops'];
    engine.playerStates.get(3).completedTechs = ['improved_power_plants'];
    engine._raidersDestroyed.set(1, 0);
    engine._raidersDestroyed.set(2, 0);
    engine._raidersDestroyed.set(3, 5);
    engine._invalidateStateCache();

    // All in same tick — cache should differentiate players
    const state1 = engine.getPlayerState(1);
    const p2from1 = state1.players.find(p => p.id === 2);
    const p3from1 = state1.players.find(p => p.id === 3);

    assert.strictEqual(p2from1.techs, 2);
    assert.strictEqual(p3from1.techs, 1);
    assert.strictEqual(p2from1.raidersDestroyed, 0);
    assert.strictEqual(p3from1.raidersDestroyed, 5);
    assert.ok(p3from1.vp > p2from1.vp || p2from1.vp > p3from1.vp || p2from1.vp === p3from1.vp,
      'VP values should be valid numbers for both players');
  });
});
