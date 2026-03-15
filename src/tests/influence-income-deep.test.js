const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine, INFLUENCE_BASE_INCOME, INFLUENCE_TRAIT_INCOME, INFLUENCE_CAP,
  MONTH_TICKS, COLONY_TRAITS, EDICT_DEFS,
} = require('../../server/game-engine');

// ── Helpers ──

function makeEngine(opts = {}) {
  const room = {
    id: 'test-room',
    players: new Map([[1, { name: 'Alice' }]]),
    hostId: 1,
    galaxySize: 'small',
    matchTimer: 0,
    ...(opts.room || {}),
  };
  return new GameEngine(room, {
    tickRate: 10,
    galaxySeed: opts.seed != null ? opts.seed : 42,
    ...opts,
  });
}

function makeEngineMulti(playerCount = 2) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { name: 'Player' + i });
  }
  const room = {
    id: 'test-room', players, hostId: 1,
    galaxySize: 'small', matchTimer: 0,
  };
  return new GameEngine(room, { tickRate: 10, galaxySeed: 42 });
}

function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

function addDistricts(colony, type, count) {
  for (let i = 0; i < count; i++) {
    colony.districts.push({ id: 'deep-' + type + '-' + i + '-' + Math.random(), type });
  }
  colony._cachedProduction = null;
  colony._cachedJobs = null;
  colony._cachedHousing = null;
  colony._cachedTrait = undefined;
}

function addExtraColony(engine, playerId, opts = {}) {
  const existing = getFirstColony(engine, playerId);
  const cId = 'extra-colony-' + Math.random();
  engine.colonies.set(cId, {
    id: cId, name: opts.name || 'Extra Colony', ownerId: playerId,
    systemId: existing.systemId,
    planet: { size: 12, type: 'continental', habitability: 80 },
    districts: [], buildQueue: [], pops: opts.pops || 2,
    growthProgress: 0, isStartingColony: false, playerBuiltDistricts: 0,
  });
  engine._playerColonies.get(playerId).push(cId);
  return engine.colonies.get(cId);
}

function runMonth(engine) {
  for (let i = 0; i < MONTH_TICKS; i++) engine.tick();
}

// ── Edict + Influence interaction ──

describe('Influence income — edict interaction', () => {
  it('should replenish influence after edict spending over multiple months', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    // Start with enough to enact an edict
    state.resources.influence = 50;
    // Spend via edict
    const edictType = Object.keys(EDICT_DEFS)[0];
    const cost = EDICT_DEFS[edictType].cost;
    const result = engine.handleCommand(1, { type: 'enactEdict', edictType });
    if (result && result.error) {
      // If edict needs more influence, set it higher and retry
      state.resources.influence = cost;
      engine.handleCommand(1, { type: 'enactEdict', edictType });
    }
    const afterEdict = state.resources.influence;
    // Run a month — income should increase influence
    runMonth(engine);
    assert.ok(state.resources.influence > afterEdict,
      `Influence should increase after month: was ${afterEdict}, now ${state.resources.influence}`);
  });

  it('should still earn income while edict is active', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    state.resources.influence = 100;
    const edictType = Object.keys(EDICT_DEFS)[0];
    engine.handleCommand(1, { type: 'enactEdict', edictType });
    const afterEdict = state.resources.influence;
    engine._processInfluenceIncome();
    assert.strictEqual(state.resources.influence, afterEdict + INFLUENCE_BASE_INCOME,
      'Income should be added even with active edict');
  });
});

// ── Colony removal ──

describe('Influence income — colony removal', () => {
  it('should reduce income when a colony is removed', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    addExtraColony(engine, 1);

    // 2 colonies = +4
    state.resources.influence = 0;
    engine._processInfluenceIncome();
    assert.strictEqual(state.resources.influence, 2 * INFLUENCE_BASE_INCOME);

    // Remove second colony
    const colonyIds = engine._playerColonies.get(1);
    const removedId = colonyIds.pop();
    engine.colonies.delete(removedId);

    // 1 colony = +2
    state.resources.influence = 0;
    engine._invalidateStateCache();
    engine._processInfluenceIncome();
    assert.strictEqual(state.resources.influence, INFLUENCE_BASE_INCOME);
  });

  it('should handle colony ID in list but missing from colonies map', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    // Add a phantom colony ID
    engine._playerColonies.get(1).push('nonexistent-colony');

    state.resources.influence = 0;
    // Should not crash — colony lookup returns undefined, skipped for trait
    engine._processInfluenceIncome();
    // 1 real colony + 1 phantom = base income counts both IDs
    assert.strictEqual(state.resources.influence, 2 * INFLUENCE_BASE_INCOME,
      'Phantom colony still counted in base income (length-based)');
  });
});

// ── All trait types ──

describe('Influence income — all trait types generate bonus', () => {
  for (const [traitType, traitDef] of Object.entries(COLONY_TRAITS)) {
    it(`should earn trait bonus for ${traitDef.name} (${traitType})`, () => {
      const engine = makeEngine();
      const state = engine.playerStates.get(1);
      const colony = getFirstColony(engine, 1);
      colony.districts = [];
      addDistricts(colony, traitType, traitDef.threshold);

      const trait = engine._calcColonyTrait(colony);
      assert.ok(trait, `Colony should have ${traitType} trait`);
      assert.strictEqual(trait.type, traitType);

      state.resources.influence = 0;
      engine._processInfluenceIncome();
      assert.strictEqual(state.resources.influence, INFLUENCE_BASE_INCOME + INFLUENCE_TRAIT_INCOME,
        `${traitDef.name} should give +${INFLUENCE_TRAIT_INCOME} trait bonus`);
    });
  }
});

// ── Mixed colonies: some with traits, some without ──

describe('Influence income — mixed trait/no-trait colonies', () => {
  it('should only give trait bonus to colonies that qualify', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    const colony1 = getFirstColony(engine, 1);

    // Colony 1: has trait
    colony1.districts = [];
    addDistricts(colony1, 'mining', 4);

    // Colony 2: no trait (mixed districts below threshold)
    const colony2 = addExtraColony(engine, 1);
    addDistricts(colony2, 'mining', 2);
    addDistricts(colony2, 'generator', 1);

    // Colony 3: no districts at all
    addExtraColony(engine, 1);

    state.resources.influence = 0;
    engine._processInfluenceIncome();
    // 3 colonies base (6) + 1 trait (1) = 7
    assert.strictEqual(state.resources.influence, 3 * INFLUENCE_BASE_INCOME + 1 * INFLUENCE_TRAIT_INCOME);
  });
});

// ── Summary cache consistency ──

describe('Influence income — summary consistency', () => {
  it('should report same income in summary as actual _processInfluenceIncome delta', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    const colony = getFirstColony(engine, 1);
    colony.districts = [];
    addDistricts(colony, 'industrial', 4);

    const summary = engine._getPlayerSummary(1);
    const expectedIncome = summary.income.influence;

    state.resources.influence = 0;
    engine._processInfluenceIncome();
    assert.strictEqual(state.resources.influence, expectedIncome,
      'Summary income should match actual income added');
  });

  it('should report correct income for multi-colony mixed traits in summary', () => {
    const engine = makeEngine();
    const colony1 = getFirstColony(engine, 1);
    colony1.districts = [];
    addDistricts(colony1, 'agriculture', 5);

    const colony2 = addExtraColony(engine, 1);
    addDistricts(colony2, 'mining', 2); // no trait

    const summary = engine._getPlayerSummary(1);
    // 2 colonies base + 1 trait
    assert.strictEqual(summary.income.influence, 2 * INFLUENCE_BASE_INCOME + 1 * INFLUENCE_TRAIT_INCOME);
  });
});

// ── JSON wire format ──

describe('Influence income — JSON wire format', () => {
  it('should include influence income in getPlayerStateJSON parsed output', () => {
    const engine = makeEngine();
    const colony = getFirstColony(engine, 1);
    colony.districts = [];
    addDistricts(colony, 'generator', 4);

    const json = engine.getPlayerStateJSON(1);
    const parsed = JSON.parse(json);
    const me = parsed.players.find(p => p.id === 1);
    assert.ok(me, 'Player should be in JSON state');
    assert.ok(me.income, 'Player should have income in JSON state');
    assert.strictEqual(me.income.influence, INFLUENCE_BASE_INCOME + INFLUENCE_TRAIT_INCOME,
      'JSON wire format should include correct influence income');
  });

  it('should update JSON after influence income changes (cache invalidation via tick)', () => {
    const engine = makeEngine();
    const json1 = engine.getPlayerStateJSON(1);
    const parsed1 = JSON.parse(json1);
    const income1 = parsed1.players.find(p => p.id === 1).income.influence;

    // Add a colony with trait
    const colony2 = addExtraColony(engine, 1);
    addDistricts(colony2, 'mining', 4);
    // Tick advances tickCount, which invalidates tick-scoped summary cache
    engine.tick();

    const json2 = engine.getPlayerStateJSON(1);
    const parsed2 = JSON.parse(json2);
    const income2 = parsed2.players.find(p => p.id === 1).income.influence;

    assert.ok(income2 > income1,
      `Income should increase after adding colony with trait: was ${income1}, now ${income2}`);
  });
});

// ── Cap edge cases ──

describe('Influence income — cap edge cases', () => {
  it('should not go above cap even if influence starts above cap (external set)', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    state.resources.influence = 250; // artificially above cap
    engine._processInfluenceIncome();
    // Income would add more, but cap should clamp
    assert.strictEqual(state.resources.influence, INFLUENCE_CAP,
      'Should clamp to cap even if starting above cap');
  });

  it('should handle influence at exactly cap minus base income', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    state.resources.influence = INFLUENCE_CAP - INFLUENCE_BASE_INCOME;
    engine._processInfluenceIncome();
    assert.strictEqual(state.resources.influence, INFLUENCE_CAP,
      'Should reach exactly cap when income fills remaining');
  });
});

// ── Multiplayer independence ──

describe('Influence income — multiplayer isolation', () => {
  it('should not let one player influence income affect another', () => {
    const engine = makeEngineMulti(3);
    const state1 = engine.playerStates.get(1);
    const state2 = engine.playerStates.get(2);
    const state3 = engine.playerStates.get(3);

    // Player 1: 3 colonies with traits
    const c1 = getFirstColony(engine, 1);
    c1.districts = [];
    addDistricts(c1, 'mining', 4);
    for (let i = 0; i < 2; i++) {
      const c = addExtraColony(engine, 1);
      addDistricts(c, 'generator', 4);
    }

    // Player 2: 1 colony no trait (default)
    // Player 3: 0 colonies
    engine._playerColonies.set(3, []);

    state1.resources.influence = 0;
    state2.resources.influence = 0;
    state3.resources.influence = 0;
    engine._processInfluenceIncome();

    assert.strictEqual(state1.resources.influence, 3 * INFLUENCE_BASE_INCOME + 3 * INFLUENCE_TRAIT_INCOME,
      'Player 1 should get 3 base + 3 trait');
    assert.strictEqual(state2.resources.influence, INFLUENCE_BASE_INCOME,
      'Player 2 should only get base');
    assert.strictEqual(state3.resources.influence, 0,
      'Player 3 with no colonies should get nothing');
  });
});

// ── Dirty player marking ──

describe('Influence income — dirty player tracking', () => {
  it('should mark players dirty after processing income', () => {
    const engine = makeEngineMulti(2);
    engine._dirtyPlayers.clear();
    engine._processInfluenceIncome();
    assert.ok(engine._dirtyPlayers.has(1), 'Player 1 should be marked dirty');
    assert.ok(engine._dirtyPlayers.has(2), 'Player 2 should be marked dirty');
  });

  it('should not mark player dirty if they have 0 colonies', () => {
    const engine = makeEngine();
    engine._playerColonies.set(1, []);
    engine._dirtyPlayers.clear();
    engine._processInfluenceIncome();
    assert.ok(!engine._dirtyPlayers.has(1), 'Player with 0 colonies should not be marked dirty');
  });
});
