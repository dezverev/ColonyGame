const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, TECH_TREE } = require('../../server/game-engine');

// ── Helpers ──

function makeRoom(playerCount = 1, options = {}) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { id: i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 1, maxPlayers: 8, status: 'playing', players, ...options };
}

function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

function addDistricts(colony, type, count) {
  for (let i = 0; i < count; i++) {
    colony.districts.push({ type, buildProgress: null });
  }
}

function zeroVPSources(engine, playerId) {
  const colony = getFirstColony(engine, playerId);
  colony.pops = 0;
  colony.districts = [];
  const state = engine.playerStates.get(playerId);
  state.resources.alloys = 0;
  state.resources.research = { physics: 0, society: 0, engineering: 0 };
  state.completedTechs = [];
  engine._surveyedSystems.set(playerId, new Set());
  engine._vpCacheTick = -1;
}

// ── _calcPopVP edge cases ──

describe('VP Rebalance Deep — _calcPopVP edge inputs', () => {
  it('negative pops returns 0 or negative (no crash)', () => {
    // _calcPopVP should handle gracefully — first tier check passes for negative
    const result = GameEngine._calcPopVP(-5);
    assert.strictEqual(typeof result, 'number', 'should return a number');
    assert.strictEqual(result, -10); // -5 * 2 per current formula
  });

  it('very large pop count (1000) returns correct VP', () => {
    // 40 + 30 + (1000-40) = 40 + 30 + 960 = 1030
    assert.strictEqual(GameEngine._calcPopVP(1000), 1030);
  });

  it('exact tier boundaries: 19, 20, 21, 39, 40, 41', () => {
    assert.strictEqual(GameEngine._calcPopVP(19), 38);  // 19*2
    assert.strictEqual(GameEngine._calcPopVP(20), 40);  // 20*2
    assert.strictEqual(GameEngine._calcPopVP(21), 42);  // 40 + round(1*1.5)
    assert.strictEqual(GameEngine._calcPopVP(39), 69);  // 40 + round(19*1.5) = 40+29
    assert.strictEqual(GameEngine._calcPopVP(40), 70);  // 40 + 30
    assert.strictEqual(GameEngine._calcPopVP(41), 71);  // 40 + 30 + 1
  });
});

// ── Multi-player VP isolation ──

describe('VP Rebalance Deep — multi-player VP isolation', () => {
  it('each player has independent VP', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const c1 = getFirstColony(engine, 1);
    const c2 = getFirstColony(engine, 2);
    c1.pops = 30;
    c2.pops = 10;
    engine._vpCacheTick = -1;

    const bd1 = engine._calcVPBreakdown(1);
    const bd2 = engine._calcVPBreakdown(2);
    assert.strictEqual(bd1.popsVP, GameEngine._calcPopVP(30));
    assert.strictEqual(bd2.popsVP, GameEngine._calcPopVP(10));
    assert.notStrictEqual(bd1.vp, bd2.vp, 'different pops should yield different VP');
  });

  it('one player surveying does not affect another player VP', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    engine._surveyedSystems.set(1, new Set(['a', 'b', 'c', 'd', 'e']));
    engine._vpCacheTick = -1;

    const bd1 = engine._calcVPBreakdown(1);
    const bd2 = engine._calcVPBreakdown(2);
    assert.strictEqual(bd1.surveyedVP, 1);
    assert.strictEqual(bd2.surveyedVP, 0);
  });

  it('VP cache works correctly across multiple players in same tick', () => {
    const engine = new GameEngine(makeRoom(3), { tickRate: 10 });
    const c1 = getFirstColony(engine, 1);
    const c2 = getFirstColony(engine, 2);
    const c3 = getFirstColony(engine, 3);
    c1.pops = 50;
    c2.pops = 20;
    c3.pops = 5;
    engine._vpCacheTick = -1;

    // Calculate all three — cache should store each independently
    const bd1 = engine._calcVPBreakdown(1);
    const bd2 = engine._calcVPBreakdown(2);
    const bd3 = engine._calcVPBreakdown(3);

    assert.strictEqual(bd1.popsVP, 80);  // 40+30+10
    assert.strictEqual(bd2.popsVP, 40);  // 20*2
    assert.strictEqual(bd3.popsVP, 10);  // 5*2

    // Verify _calcVictoryPoints uses the cached values
    assert.strictEqual(engine._calcVictoryPoints(1), bd1.vp);
    assert.strictEqual(engine._calcVictoryPoints(2), bd2.vp);
    assert.strictEqual(engine._calcVictoryPoints(3), bd3.vp);
  });
});

// ── VP cache invalidation ──

describe('VP Rebalance Deep — cache invalidation on state mutations', () => {
  it('building a district invalidates VP cache and increases VP', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine._vpCacheTick = -1;
    const vpBefore = engine._calcVPBreakdown(1).vp;

    // Build a district via _invalidateColonyCache
    const colony = getFirstColony(engine, 1);
    colony.districts.push({ type: 'mining', buildProgress: null });
    engine._invalidateColonyCache(colony);

    const vpAfter = engine._calcVPBreakdown(1).vp;
    assert.ok(vpAfter > vpBefore, `VP should increase after building district: ${vpBefore} -> ${vpAfter}`);
  });

  it('gaining alloys updates VP after resource processing invalidation', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 24;
    engine._vpCacheTick = -1;
    const vpBefore = engine._calcVPBreakdown(1);
    assert.strictEqual(vpBefore.alloysVP, 0); // 24/25 = 0

    state.resources.alloys = 25;
    engine._vpCacheTick = -1;
    const vpAfter = engine._calcVPBreakdown(1);
    assert.strictEqual(vpAfter.alloysVP, 1); // 25/25 = 1
  });

  it('completing research updates VP', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.completedTechs = [];
    engine._vpCacheTick = -1;
    const vpBefore = engine._calcVPBreakdown(1).techVP;

    state.completedTechs = ['improved_power_plants'];
    engine._vpCacheTick = -1;
    const vpAfter = engine._calcVPBreakdown(1).techVP;
    assert.strictEqual(vpAfter - vpBefore, 5, 'T1 tech should add 5 techVP');
  });
});

// ── VP in serialized state ──

describe('VP Rebalance Deep — VP in serialized payloads', () => {
  it('getPlayerState includes VP for own player', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine._vpCacheTick = -1;
    const playerState = engine.getPlayerState(1);
    const me = playerState.players[0];
    assert.ok('vp' in me, 'player state should include vp field');
    assert.strictEqual(typeof me.vp, 'number');
    assert.strictEqual(me.vp, engine._calcVPBreakdown(1).vp);
  });

  it('getPlayerState includes VP for other players', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    engine._vpCacheTick = -1;
    const playerState = engine.getPlayerState(1);
    assert.strictEqual(playerState.players.length, 2, 'should have 2 players');
    const other = playerState.players[1];
    assert.ok('vp' in other, 'other player should have vp');
    assert.strictEqual(other.vp, engine._calcVPBreakdown(2).vp);
  });

  it('getState includes VP for all players', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    engine._vpCacheTick = -1;
    const state = engine.getState();
    for (const p of state.players) {
      assert.ok('vp' in p, `player ${p.id} should have vp in global state`);
      assert.strictEqual(p.vp, engine._calcVPBreakdown(p.id).vp);
    }
  });

  it('surveyedSystems serialized in getState', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine._surveyedSystems.set(1, new Set(['sys1', 'sys2']));
    engine._invalidateStateCache();
    const state = engine.getState();
    assert.ok(state.surveyedSystems, 'state should include surveyedSystems');
    assert.deepStrictEqual(state.surveyedSystems[1].sort(), ['sys1', 'sys2']);
  });
});

// ── Districts VP includes in-progress builds ──

describe('VP Rebalance Deep — district VP counting', () => {
  it('in-progress districts with buildProgress count toward VP', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    zeroVPSources(engine, 1);
    const colony = getFirstColony(engine, 1);
    // Add a district that's still building
    colony.districts.push({ type: 'mining', buildProgress: 5 });
    engine._vpCacheTick = -1;

    const bd = engine._calcVPBreakdown(1);
    // districts.length includes in-progress — this IS the current behavior
    assert.strictEqual(bd.districts, 1, 'in-progress district counted');
    assert.strictEqual(bd.districtsVP, 1);
  });

  it('empty colony with 0 districts gives 0 districtsVP', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    zeroVPSources(engine, 1);
    const bd = engine._calcVPBreakdown(1);
    assert.strictEqual(bd.districts, 0);
    assert.strictEqual(bd.districtsVP, 0);
  });
});

// ── Tech VP edge cases ──

describe('VP Rebalance Deep — tech VP edge cases', () => {
  it('unknown tech ID in completedTechs is ignored (no crash, no VP)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.completedTechs = ['nonexistent_tech_xyz'];
    state.resources.alloys = 0;
    engine._vpCacheTick = -1;

    const bd = engine._calcVPBreakdown(1);
    assert.strictEqual(bd.techVP, 0, 'unknown tech should not contribute VP');
    assert.strictEqual(bd.techs, 1, 'tech count includes unknown techs');
  });

  it('empty completedTechs array gives 0 techVP', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.completedTechs = [];
    engine._vpCacheTick = -1;

    assert.strictEqual(engine._calcVPBreakdown(1).techVP, 0);
  });

  it('duplicate tech IDs are counted multiple times', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.completedTechs = ['improved_power_plants', 'improved_power_plants'];
    state.resources.alloys = 0;
    engine._vpCacheTick = -1;

    const bd = engine._calcVPBreakdown(1);
    // Current behavior: duplicates are counted (no dedup)
    assert.strictEqual(bd.techVP, 10, 'duplicate T1 tech counted twice');
  });
});

// ── Research VP edge cases ──

describe('VP Rebalance Deep — research VP edge cases', () => {
  it('49 total research = 0 researchVP (below threshold)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.research = { physics: 20, society: 20, engineering: 9 };
    engine._vpCacheTick = -1;
    assert.strictEqual(engine._calcVPBreakdown(1).researchVP, 0);
  });

  it('50 total research = 1 researchVP', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.research = { physics: 50, society: 0, engineering: 0 };
    engine._vpCacheTick = -1;
    assert.strictEqual(engine._calcVPBreakdown(1).researchVP, 1);
  });

  it('research with missing fields treated as 0', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.research = { physics: 100 }; // society/engineering missing
    engine._vpCacheTick = -1;
    const bd = engine._calcVPBreakdown(1);
    assert.strictEqual(bd.totalResearch, 100);
    assert.strictEqual(bd.researchVP, 2);
  });
});

// ── Alloys VP edge cases ──

describe('VP Rebalance Deep — alloys VP edge cases', () => {
  it('0 alloys = 0 alloysVP', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 0;
    engine._vpCacheTick = -1;
    assert.strictEqual(engine._calcVPBreakdown(1).alloysVP, 0);
  });

  it('fractional alloys floored correctly (74 alloys = 2 VP)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 74;
    engine._vpCacheTick = -1;
    assert.strictEqual(engine._calcVPBreakdown(1).alloysVP, 2); // floor(74/25)
  });
});

// ── VP with multiple colonies ──

describe('VP Rebalance Deep — multi-colony VP aggregation', () => {
  it('pops across multiple colonies are summed for diminishing returns', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const c1 = getFirstColony(engine, 1);
    c1.pops = 15;

    // Add second colony with 15 pops
    const colId = 'extra-colony';
    const c2 = {
      id: colId, ownerId: 1, name: 'Colony 2',
      planet: { type: 'continental', size: 16, habitability: 80 },
      districts: [], pops: 15,
      _cachedProduction: null, _cachedJobs: null, _cachedHousing: null,
    };
    engine.colonies.set(colId, c2);
    engine._playerColonies.get(1).push(colId);
    engine._vpCacheTick = -1;

    const bd = engine._calcVPBreakdown(1);
    // 30 total pops: 20*2 + round(10*1.5) = 40+15 = 55
    assert.strictEqual(bd.pops, 30);
    assert.strictEqual(bd.popsVP, 55);
    // NOT 15*2 + 15*2 = 60 (would be wrong if per-colony)
  });

  it('districts across multiple colonies are summed', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    zeroVPSources(engine, 1);
    const c1 = getFirstColony(engine, 1);
    addDistricts(c1, 'mining', 3);

    const colId = 'extra-colony-2';
    const c2 = {
      id: colId, ownerId: 1, name: 'Colony 2',
      planet: { type: 'continental', size: 16, habitability: 80 },
      districts: [], pops: 0,
      _cachedProduction: null, _cachedJobs: null, _cachedHousing: null,
    };
    addDistricts(c2, 'generator', 4);
    engine.colonies.set(colId, c2);
    engine._playerColonies.get(1).push(colId);
    engine._vpCacheTick = -1;

    const bd = engine._calcVPBreakdown(1);
    assert.strictEqual(bd.districts, 7);
    assert.strictEqual(bd.districtsVP, 7);
  });
});

// ── gameOver breakdown completeness ──

describe('VP Rebalance Deep — gameOver payload completeness', () => {
  it('gameOver scores include all VP breakdown fields', () => {
    let gameOverData = null;
    const engine = new GameEngine(makeRoom(1), {
      tickRate: 10,
      onGameOver: (data) => { gameOverData = data; },
    });
    engine._triggerGameOver();

    assert.ok(gameOverData, 'gameOver should fire');
    const bd = gameOverData.scores[0].breakdown;
    const expectedFields = [
      'vp', 'pops', 'popsVP', 'districts', 'districtsVP',
      'alloys', 'alloysVP', 'totalResearch', 'researchVP',
      'techs', 'techVP', 'traits', 'traitsVP', 'surveyed', 'surveyedVP',
    ];
    for (const field of expectedFields) {
      assert.ok(field in bd, `breakdown should include '${field}'`);
      assert.strictEqual(typeof bd[field], 'number', `'${field}' should be a number`);
    }
  });

  it('gameOver with multiple players includes all player breakdowns', () => {
    let gameOverData = null;
    const engine = new GameEngine(makeRoom(3), {
      tickRate: 10,
      onGameOver: (data) => { gameOverData = data; },
    });
    engine._triggerGameOver();

    assert.ok(gameOverData);
    assert.strictEqual(gameOverData.scores.length, 3, 'should have 3 player scores');
    for (const score of gameOverData.scores) {
      assert.ok(score.breakdown, `player ${score.playerId} should have breakdown`);
      assert.ok('surveyedVP' in score.breakdown);
    }
  });
});
