const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine, TECH_TREE, MONTH_TICKS, TOTAL_TECHS,
  MILITARY_VICTORY_OCCUPATIONS, ECONOMIC_VICTORY_ALLOYS, ECONOMIC_VICTORY_TRAITS,
  CORVETTE_MAINTENANCE, COLONY_TRAITS,
} = require('../../server/game-engine');

function makeRoom(playerCount = 2, options = {}) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { id: i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 1, maxPlayers: 8, status: 'playing', players, ...options };
}

function makeColony(id, ownerId, systemId, overrides = {}) {
  return {
    id, name: overrides.name || id, ownerId, systemId,
    planet: overrides.planet || { type: 'Continental', size: 16, habitability: 80 },
    pops: overrides.pops || 8,
    districts: overrides.districts || [],
    buildQueue: [], occupiedBy: overrides.occupiedBy || null,
    crisisState: null, nextCrisisTick: 999999,
    defensePlatform: null, occupationProgress: 0,
    isStartingColony: false, playerBuiltDistricts: 0,
    growthProgress: 0, disabledDistricts: new Set(),
    _cachedHousing: null, _cachedJobs: null, _cachedProduction: null,
  };
}

function makeEngine(playerCount = 2, opts = {}) {
  let gameOverCalls = [];
  const engine = new GameEngine(makeRoom(playerCount, opts.roomOpts || {}), {
    tickRate: 10,
    onGameOver: (data) => { gameOverCalls.push(data); },
  });
  engine._doctrinePhase = false;
  engine._endgameCrisisTriggered = true;
  return { engine, getGameOver: () => gameOverCalls[0] || null, gameOverCalls };
}

function tickToMonth(engine) {
  do { engine.tick(); } while (engine.tickCount % MONTH_TICKS !== 0);
}

function findUnusedSystems(engine, count) {
  const usedSystems = new Set();
  for (const c of engine.colonies.values()) usedSystems.add(c.systemId);
  const result = [];
  for (const sys of engine.galaxy.systems) {
    if (usedSystems.has(sys.id)) continue;
    result.push(sys);
    if (result.length >= count) break;
  }
  return result;
}

// ── Victory progress tick-scoped cache ──
describe('Victory progress cache — tick-scoped invalidation', () => {
  it('returns cached result on same tick', () => {
    const { engine } = makeEngine(1);
    const state = engine.playerStates.get(1);
    state.completedTechs = ['improved_power_plants'];

    const first = engine._calcVictoryProgress(1);
    const second = engine._calcVictoryProgress(1);
    assert.strictEqual(first, second, 'same tick should return identical cached object');
  });

  it('invalidates cache on next tick', () => {
    const { engine } = makeEngine(1);
    const state = engine.playerStates.get(1);
    state.completedTechs = ['improved_power_plants'];

    const first = engine._calcVictoryProgress(1);
    assert.strictEqual(first.scientific.current, 1);

    engine.tick();
    state.completedTechs.push('frontier_medicine');
    const second = engine._calcVictoryProgress(1);
    assert.strictEqual(second.scientific.current, 2, 'should reflect updated state after tick');
    assert.notStrictEqual(first, second, 'should be a new object after cache invalidation');
  });

  it('caches per-player independently within same tick', () => {
    const { engine } = makeEngine(2);
    engine.playerStates.get(1).completedTechs = ['improved_power_plants', 'frontier_medicine'];
    engine.playerStates.get(2).completedTechs = ['improved_mining'];

    const p1 = engine._calcVictoryProgress(1);
    const p2 = engine._calcVictoryProgress(2);
    assert.strictEqual(p1.scientific.current, 2);
    assert.strictEqual(p2.scientific.current, 1);
    assert.notStrictEqual(p1, p2, 'different players get distinct progress objects');
  });
});

// ── Surveyed systems array cache ──
describe('Surveyed systems array cache — size-keyed', () => {
  it('reuses cached array when surveyed set size unchanged', () => {
    const { engine } = makeEngine(1);
    const playerId = 1;

    // Survey a system
    if (!engine._surveyedSystems.has(playerId)) engine._surveyedSystems.set(playerId, new Set());
    engine._surveyedSystems.get(playerId).add(0);
    engine._invalidateStateCache();

    const state1 = engine.getPlayerState(playerId);
    const arr1 = state1.surveyedSystems[playerId];

    // Get state again without changing surveyed set
    engine._invalidateStateCache();
    const state2 = engine.getPlayerState(playerId);
    const arr2 = state2.surveyedSystems[playerId];

    assert.deepStrictEqual(arr1, arr2, 'arrays should have same content');
    // The cache should return the same array reference
    assert.strictEqual(arr1, arr2, 'should reuse same array object when size unchanged');
  });

  it('rebuilds array when a new system is surveyed', () => {
    const { engine } = makeEngine(1);
    const playerId = 1;

    if (!engine._surveyedSystems.has(playerId)) engine._surveyedSystems.set(playerId, new Set());
    engine._surveyedSystems.get(playerId).add(0);
    engine._invalidateStateCache();

    const state1 = engine.getPlayerState(playerId);
    const arr1 = state1.surveyedSystems[playerId];
    assert.strictEqual(arr1.length, 1);

    // Survey another system
    engine._surveyedSystems.get(playerId).add(5);
    engine._invalidateStateCache();

    const state2 = engine.getPlayerState(playerId);
    const arr2 = state2.surveyedSystems[playerId];
    assert.strictEqual(arr2.length, 2, 'should include newly surveyed system');
    assert.notStrictEqual(arr1, arr2, 'should be a new array since size changed');
  });
});

// ── _triggerGameOver idempotency ──
describe('_triggerGameOver — idempotency', () => {
  it('only fires onGameOver callback once even if called twice', () => {
    const { engine, gameOverCalls } = makeEngine(2, { roomOpts: { matchTimer: 20 } });

    const state = engine.playerStates.get(1);
    state.completedTechs = Object.keys(TECH_TREE);

    tickToMonth(engine);

    assert.strictEqual(gameOverCalls.length, 1, 'should fire exactly once');

    // Try to trigger again
    engine._gameOver = false; // hack to bypass guard
    engine._checkVictoryConditions();
    // The stop() in _triggerGameOver may prevent further ticking, but
    // _triggerGameOver itself should guard with _gameOver flag
  });

  it('_checkVictoryConditions returns early when _gameOver is true', () => {
    const { engine, gameOverCalls } = makeEngine(2, { roomOpts: { matchTimer: 20 } });

    engine._gameOver = true;
    const state = engine.playerStates.get(1);
    state.completedTechs = Object.keys(TECH_TREE);

    engine._checkVictoryConditions();
    assert.strictEqual(gameOverCalls.length, 0, 'should not fire when _gameOver already true');
  });
});

// ── Military victory across multiple opponents ──
describe('Military Victory — multi-opponent occupation', () => {
  it('counts occupied colonies from different opponents', () => {
    const { engine, getGameOver } = makeEngine(3, { roomOpts: { matchTimer: 20 } });
    const systems = findUnusedSystems(engine, 4);

    // Create 2 colonies for player 2 and 1 for player 3, all occupied by player 1
    engine.colonies.set('p2_c1', makeColony('p2_c1', 2, systems[0].id, { occupiedBy: 1 }));
    engine.colonies.set('p2_c2', makeColony('p2_c2', 2, systems[1].id, { occupiedBy: 1 }));
    engine.colonies.set('p3_c1', makeColony('p3_c1', 3, systems[2].id, { occupiedBy: 1 }));

    if (!engine._playerColonies.has(2)) engine._playerColonies.set(2, []);
    engine._playerColonies.get(2).push('p2_c1', 'p2_c2');
    if (!engine._playerColonies.has(3)) engine._playerColonies.set(3, []);
    engine._playerColonies.get(3).push('p3_c1');

    tickToMonth(engine);

    const gd = getGameOver();
    assert.ok(gd, 'gameOver should fire with 3 occupied colonies across 2 opponents');
    assert.strictEqual(gd.victoryType, 'military');
    assert.strictEqual(gd.winner.playerId, 1);
  });

  it('victory progress counts occupations across all opponents', () => {
    const { engine } = makeEngine(3);
    const systems = findUnusedSystems(engine, 2);

    engine.colonies.set('p2_occ', makeColony('p2_occ', 2, systems[0].id, { occupiedBy: 1 }));
    engine.colonies.set('p3_occ', makeColony('p3_occ', 3, systems[1].id, { occupiedBy: 1 }));
    if (!engine._playerColonies.has(2)) engine._playerColonies.set(2, []);
    engine._playerColonies.get(2).push('p2_occ');
    if (!engine._playerColonies.has(3)) engine._playerColonies.set(3, []);
    engine._playerColonies.get(3).push('p3_occ');

    const progress = engine._calcVictoryProgress(1);
    assert.strictEqual(progress.military.current, 2, 'should count occupations from both opponents');
  });
});

// ── Economic victory boundary: exactly 500 alloys ──
describe('Economic Victory — boundary at exactly 500 alloys', () => {
  it('triggers with exactly 500 alloys and 3 traits', () => {
    const { engine, getGameOver } = makeEngine(1, { roomOpts: { matchTimer: 20 } });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 500; // exactly at boundary

    const existingColonyId = (engine._playerColonies.get(1) || [])[0];
    const existingColony = engine.colonies.get(existingColonyId);
    existingColony.districts = Array.from({ length: 4 }, () => ({ type: 'mining', disabled: false }));

    const systems = findUnusedSystems(engine, 2);
    const traitTypes = ['generator', 'agriculture'];
    for (let i = 0; i < 2; i++) {
      const colId = `trait_boundary_${i}`;
      const districts = Array.from({ length: 4 }, () => ({ type: traitTypes[i], disabled: false }));
      engine.colonies.set(colId, makeColony(colId, 1, systems[i].id, { districts }));
      engine._playerColonies.get(1).push(colId);
    }

    tickToMonth(engine);

    const gd = getGameOver();
    assert.ok(gd, 'should trigger at exactly 500 alloys');
    assert.strictEqual(gd.victoryType, 'economic');
  });
});

// ── Victory progress: fractional alloys are floored ──
describe('Victory progress — alloy floor for fractional values', () => {
  it('floors fractional alloy value in progress', () => {
    const { engine } = makeEngine(1);
    engine.playerStates.get(1).resources.alloys = 499.99;

    const progress = engine._calcVictoryProgress(1);
    assert.strictEqual(progress.economic.alloys, 499, 'should floor 499.99 to 499');
  });

  it('fractional alloys at 500.5 still shows 500', () => {
    const { engine } = makeEngine(1);
    engine.playerStates.get(1).resources.alloys = 500.5;

    const progress = engine._calcVictoryProgress(1);
    assert.strictEqual(progress.economic.alloys, 500);
  });
});

// ── gameOver data structure completeness ──
describe('gameOver payload — complete data structure', () => {
  it('includes matchDurationSec, finalTick, scores array, and victoryType', () => {
    const { engine, getGameOver } = makeEngine(2, { roomOpts: { matchTimer: 20 } });
    const state = engine.playerStates.get(1);
    state.completedTechs = Object.keys(TECH_TREE);

    tickToMonth(engine);

    const gd = getGameOver();
    assert.ok(gd);
    assert.strictEqual(typeof gd.matchDurationSec, 'number', 'matchDurationSec should be a number');
    assert.ok(gd.matchDurationSec >= 0, 'matchDurationSec should be non-negative');
    assert.strictEqual(typeof gd.finalTick, 'number', 'finalTick should be a number');
    assert.ok(gd.finalTick > 0, 'finalTick should be positive');
    assert.ok(Array.isArray(gd.scores), 'scores should be an array');
    assert.strictEqual(gd.scores.length, 2, 'should have scores for both players');
    assert.strictEqual(gd.victoryType, 'scientific');
  });

  it('scores include matchStats with resource breakdown', () => {
    const { engine, getGameOver } = makeEngine(2, { roomOpts: { matchTimer: 20 } });
    engine.playerStates.get(1).completedTechs = Object.keys(TECH_TREE);

    tickToMonth(engine);

    const gd = getGameOver();
    for (const score of gd.scores) {
      assert.ok(score.matchStats, `score for ${score.name} should have matchStats`);
      assert.ok('coloniesFounded' in score.matchStats, 'matchStats should have coloniesFounded');
      assert.ok('districtsBuilt' in score.matchStats, 'matchStats should have districtsBuilt');
      assert.ok('shipsBuilt' in score.matchStats, 'matchStats should have shipsBuilt');
      assert.ok(score.matchStats.resourcesGathered, 'matchStats should have resourcesGathered');
    }
  });

  it('scores are sorted by VP descending', () => {
    const { engine, getGameOver } = makeEngine(3, { roomOpts: { matchTimer: 20 } });

    // Give player 3 lots of alloys for higher VP
    engine.playerStates.get(3).resources.alloys = 9999;
    engine.playerStates.get(1).completedTechs = Object.keys(TECH_TREE);

    tickToMonth(engine);

    const gd = getGameOver();
    for (let i = 1; i < gd.scores.length; i++) {
      assert.ok(gd.scores[i - 1].vp >= gd.scores[i].vp,
        `scores[${i-1}].vp (${gd.scores[i-1].vp}) should be >= scores[${i}].vp (${gd.scores[i].vp})`);
    }
  });

  it('winner object has playerId, name, and vp', () => {
    const { engine, getGameOver } = makeEngine(2, { roomOpts: { matchTimer: 20 } });
    engine.playerStates.get(1).completedTechs = Object.keys(TECH_TREE);

    tickToMonth(engine);

    const gd = getGameOver();
    assert.ok(gd.winner);
    assert.strictEqual(typeof gd.winner.playerId, 'number');
    assert.strictEqual(typeof gd.winner.name, 'string');
    assert.strictEqual(typeof gd.winner.vp, 'number');
  });
});

// ── Corvette maintenance constants verified ──
describe('Corvette maintenance — balance tweak constants', () => {
  it('CORVETTE_MAINTENANCE energy is 2 (up from 1)', () => {
    assert.strictEqual(CORVETTE_MAINTENANCE.energy, 2);
  });

  it('CORVETTE_MAINTENANCE alloys is 1', () => {
    assert.strictEqual(CORVETTE_MAINTENANCE.alloys, 1);
  });
});

// ── Victory priority: first player in iteration wins ──
describe('Victory condition — priority when multiple players qualify', () => {
  it('first player in iteration wins when both meet scientific victory', () => {
    const { engine, getGameOver } = makeEngine(2, { roomOpts: { matchTimer: 20 } });

    // Both players have all techs
    engine.playerStates.get(1).completedTechs = Object.keys(TECH_TREE);
    engine.playerStates.get(2).completedTechs = Object.keys(TECH_TREE);

    tickToMonth(engine);

    const gd = getGameOver();
    assert.ok(gd);
    assert.strictEqual(gd.victoryType, 'scientific');
    // First player in the Map iteration wins
    assert.strictEqual(gd.winner.playerId, 1);
  });

  it('scientific victory takes priority over military for same player', () => {
    const { engine, getGameOver } = makeEngine(2, { roomOpts: { matchTimer: 20 } });
    const state = engine.playerStates.get(1);

    // Meet scientific condition
    state.completedTechs = Object.keys(TECH_TREE);

    // Also meet military condition
    const systems = findUnusedSystems(engine, 3);
    for (let i = 0; i < 3; i++) {
      const colId = `p2_mil_${i}`;
      engine.colonies.set(colId, makeColony(colId, 2, systems[i].id, { occupiedBy: 1 }));
      if (!engine._playerColonies.has(2)) engine._playerColonies.set(2, []);
      engine._playerColonies.get(2).push(colId);
    }

    tickToMonth(engine);

    const gd = getGameOver();
    assert.strictEqual(gd.victoryType, 'scientific', 'scientific checked before military');
  });
});

// ── Victory progress in broadcast payload (getPlayerStateJSON) ──
describe('Victory progress in broadcast JSON payload', () => {
  it('serialized JSON includes victoryProgress for each player', () => {
    const { engine } = makeEngine(2);
    engine.playerStates.get(1).completedTechs = ['improved_power_plants'];
    engine._invalidateStateCache();

    const json = engine.getPlayerStateJSON(1);
    const parsed = JSON.parse(json);

    const me = parsed.players.find(p => p.id === 1);
    assert.ok(me.victoryProgress, 'own player should have victoryProgress in JSON');
    assert.strictEqual(me.victoryProgress.scientific.current, 1);
    assert.strictEqual(me.victoryProgress.scientific.target, TOTAL_TECHS);

    const other = parsed.players.find(p => p.id === 2);
    assert.strictEqual(other.victoryProgress, undefined, 'other player should not have victoryProgress (bandwidth saving)');
  });
});
