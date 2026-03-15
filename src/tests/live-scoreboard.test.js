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

describe('Live Scoreboard — Opponent Summaries', () => {

  // ── Opponent data presence ──

  it('getPlayerState includes techs and raidersDestroyed for all players', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    const state = engine.getPlayerState(1);
    const me = state.players.find(p => p.id === 1);
    const opponent = state.players.find(p => p.id === 2);

    assert.strictEqual(typeof me.techs, 'number', 'own player should have techs count');
    assert.strictEqual(typeof me.raidersDestroyed, 'number', 'own player should have raidersDestroyed');
    assert.strictEqual(typeof opponent.techs, 'number', 'opponent should have techs count');
    assert.strictEqual(typeof opponent.raidersDestroyed, 'number', 'opponent should have raidersDestroyed');
  });

  it('opponent techs count starts at 0', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    const state = engine.getPlayerState(1);
    const opponent = state.players.find(p => p.id === 2);
    assert.strictEqual(opponent.techs, 0);
  });

  it('opponent raidersDestroyed starts at 0', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    const state = engine.getPlayerState(1);
    const opponent = state.players.find(p => p.id === 2);
    assert.strictEqual(opponent.raidersDestroyed, 0);
  });

  // ── Techs reflect completed research ──

  it('opponent techs count increases after research completion', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    const player2 = engine.playerStates.get(2);
    // Simulate completing a tech
    player2.completedTechs = ['improved_power_plants'];
    engine._invalidateStateCache();

    const state = engine.getPlayerState(1);
    const opponent = state.players.find(p => p.id === 2);
    assert.strictEqual(opponent.techs, 1);
  });

  it('own techs count matches completedTechs length', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    const player1 = engine.playerStates.get(1);
    player1.completedTechs = ['improved_power_plants', 'gene_crops'];
    engine._invalidateStateCache();

    const state = engine.getPlayerState(1);
    const me = state.players.find(p => p.id === 1);
    assert.strictEqual(me.techs, 2);
  });

  // ── Raiders destroyed ──

  it('raidersDestroyed reflects server-side tracking', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    engine._raidersDestroyed.set(2, 3);
    engine._invalidateStateCache();

    const state = engine.getPlayerState(1);
    const opponent = state.players.find(p => p.id === 2);
    assert.strictEqual(opponent.raidersDestroyed, 3);
  });

  it('own raidersDestroyed reflects server-side tracking', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    engine._raidersDestroyed.set(1, 5);
    engine._invalidateStateCache();

    const state = engine.getPlayerState(1);
    const me = state.players.find(p => p.id === 1);
    assert.strictEqual(me.raidersDestroyed, 5);
  });

  // ── Existing fields still present ──

  it('opponent still includes vp, colonyCount, totalPops, income', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    const state = engine.getPlayerState(1);
    const opponent = state.players.find(p => p.id === 2);

    assert.strictEqual(typeof opponent.vp, 'number');
    assert.strictEqual(typeof opponent.colonyCount, 'number');
    assert.strictEqual(typeof opponent.totalPops, 'number');
    assert.ok(opponent.income, 'opponent should have income object');
    assert.strictEqual(typeof opponent.income.energy, 'number');
  });

  // ── Multi-player (3+) ──

  it('shows all opponents in 3-player game', () => {
    const engine = new GameEngine(makeRoom(3), { galaxySeed: 42 });
    const state = engine.getPlayerState(1);
    assert.strictEqual(state.players.length, 3, 'should have 3 players');
    const opponents = state.players.filter(p => p.id !== 1);
    assert.strictEqual(opponents.length, 2, 'should have 2 opponents');
    for (const opp of opponents) {
      assert.strictEqual(typeof opp.techs, 'number');
      assert.strictEqual(typeof opp.raidersDestroyed, 'number');
    }
  });

  // ── Player ordering / VP ranking ──

  it('players sorted by VP in client can use all scoreboard fields', () => {
    const engine = new GameEngine(makeRoom(3), { galaxySeed: 42 });
    // Give player 3 some techs and raiders for higher VP
    const player3 = engine.playerStates.get(3);
    player3.completedTechs = ['improved_power_plants', 'gene_crops', 'improved_mining'];
    engine._raidersDestroyed.set(3, 2);
    engine._invalidateStateCache();

    const state = engine.getPlayerState(1);
    const players = [...state.players].sort((a, b) => (b.vp || 0) - (a.vp || 0));
    // Player 3 should be higher due to techs + raiders VP
    const p3 = players.find(p => p.id === 3);
    assert.ok(p3.vp > 0, 'player 3 should have positive VP');
    assert.strictEqual(p3.techs, 3);
    assert.strictEqual(p3.raidersDestroyed, 2);
  });

  // ── JSON serialization ──

  it('getPlayerStateJSON includes techs and raidersDestroyed', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    engine.playerStates.get(2).completedTechs = ['improved_power_plants'];
    engine._raidersDestroyed.set(2, 1);
    engine._invalidateStateCache();

    const json = engine.getPlayerStateJSON(1);
    const parsed = JSON.parse(json);
    const opponent = parsed.players.find(p => p.id === 2);
    assert.strictEqual(opponent.techs, 1);
    assert.strictEqual(opponent.raidersDestroyed, 1);
  });

  // ── Symmetry: each player sees the other correctly ──

  it('player 2 sees player 1 techs/raiders correctly', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    engine.playerStates.get(1).completedTechs = ['improved_power_plants', 'gene_crops'];
    engine._raidersDestroyed.set(1, 4);
    engine._invalidateStateCache();

    const state = engine.getPlayerState(2);
    const opponent = state.players.find(p => p.id === 1);
    assert.strictEqual(opponent.techs, 2);
    assert.strictEqual(opponent.raidersDestroyed, 4);
  });

  // ── Edge case: player with no completedTechs array ──

  it('handles missing completedTechs gracefully', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    engine.playerStates.get(2).completedTechs = undefined;
    engine._invalidateStateCache();

    const state = engine.getPlayerState(1);
    const opponent = state.players.find(p => p.id === 2);
    assert.strictEqual(opponent.techs, 0, 'should default to 0 with undefined completedTechs');
  });

  // ── Cache invalidation: new data appears after cache clear ──

  it('updated techs appear after cache invalidation', () => {
    const engine = new GameEngine(makeRoom(2), { galaxySeed: 42 });
    const state1 = engine.getPlayerState(1);
    const opp1 = state1.players.find(p => p.id === 2);
    assert.strictEqual(opp1.techs, 0);

    engine.playerStates.get(2).completedTechs = ['improved_power_plants'];
    engine._invalidateStateCache();
    const state2 = engine.getPlayerState(1);
    const opp2 = state2.players.find(p => p.id === 2);
    assert.strictEqual(opp2.techs, 1);
  });
});
