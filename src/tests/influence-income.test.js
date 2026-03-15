const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine, INFLUENCE_BASE_INCOME, INFLUENCE_TRAIT_INCOME, INFLUENCE_CAP,
  MONTH_TICKS, COLONY_TRAITS,
} = require('../../server/game-engine');

// Helper: create a game engine with 1 player
function makeEngine(opts = {}) {
  const room = {
    id: 'test-room',
    players: new Map([[1, { name: 'Alice' }]]),
    hostId: 1,
    galaxySize: 'small',
    matchTimer: 0,
    ...(opts.room || {}),
  };
  const engine = new GameEngine(room, {
    tickRate: 10,
    galaxySeed: opts.seed != null ? opts.seed : 42,
    ...opts,
  });
  return engine;
}

function makeEngineMulti(playerCount = 2) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { name: 'Player' + i });
  }
  const room = {
    id: 'test-room',
    players,
    hostId: 1,
    galaxySize: 'small',
    matchTimer: 0,
  };
  return new GameEngine(room, { tickRate: 10, galaxySeed: 42 });
}

function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

// Add districts directly (bypasses build queue)
function addDistricts(colony, type, count) {
  for (let i = 0; i < count; i++) {
    colony.districts.push({ id: 'inf-' + type + '-' + i + '-' + Math.random(), type });
  }
  colony._cachedProduction = null;
  colony._cachedJobs = null;
  colony._cachedHousing = null;
  colony._cachedTrait = undefined;
}

// Run monthly tick
function runMonth(engine) {
  for (let i = 0; i < MONTH_TICKS; i++) {
    engine.tick();
  }
}

// ── Constants ──

describe('Influence income constants', () => {
  it('should export INFLUENCE_BASE_INCOME = 2', () => {
    assert.strictEqual(INFLUENCE_BASE_INCOME, 2);
  });

  it('should export INFLUENCE_TRAIT_INCOME = 1', () => {
    assert.strictEqual(INFLUENCE_TRAIT_INCOME, 1);
  });

  it('should export INFLUENCE_CAP = 200', () => {
    assert.strictEqual(INFLUENCE_CAP, 200);
  });
});

// ── Base income from colonies ──

describe('Influence base income', () => {
  it('should add +2 influence per colony per month with 1 colony', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    state.resources.influence = 0;
    engine._processInfluenceIncome();
    assert.strictEqual(state.resources.influence, INFLUENCE_BASE_INCOME);
  });

  it('should add +4 influence per month with 2 colonies', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    // Found a second colony by manually adding
    const colony1 = getFirstColony(engine, 1);
    const colony2Id = 'test-colony-2';
    engine.colonies.set(colony2Id, {
      id: colony2Id,
      name: 'Second Colony',
      ownerId: 1,
      systemId: colony1.systemId,
      planet: { size: 12, type: 'desert', habitability: 60 },
      districts: [],
      buildQueue: [],
      pops: 2,
      growthProgress: 0,
      isStartingColony: false,
      playerBuiltDistricts: 0,
    });
    engine._playerColonies.get(1).push(colony2Id);

    state.resources.influence = 0;
    engine._processInfluenceIncome();
    assert.strictEqual(state.resources.influence, 2 * INFLUENCE_BASE_INCOME);
  });

  it('should add +6 influence per month with 3 colonies', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    const colony1 = getFirstColony(engine, 1);

    for (let i = 2; i <= 3; i++) {
      const cId = 'test-colony-' + i;
      engine.colonies.set(cId, {
        id: cId, name: 'Colony ' + i, ownerId: 1,
        systemId: colony1.systemId,
        planet: { size: 12, type: 'continental', habitability: 80 },
        districts: [], buildQueue: [], pops: 2,
        growthProgress: 0, isStartingColony: false, playerBuiltDistricts: 0,
      });
      engine._playerColonies.get(1).push(cId);
    }

    state.resources.influence = 0;
    engine._processInfluenceIncome();
    assert.strictEqual(state.resources.influence, 3 * INFLUENCE_BASE_INCOME);
  });
});

// ── Trait bonus income ──

describe('Influence trait bonus income', () => {
  it('should add +1 influence per colony with a personality trait', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    const colony = getFirstColony(engine, 1);

    // Give colony 4 mining districts to earn Mining Colony trait
    colony.districts = [];
    addDistricts(colony, 'mining', 4);

    // Verify trait exists
    const trait = engine._calcColonyTrait(colony);
    assert.ok(trait, 'colony should have a trait');
    assert.strictEqual(trait.type, 'mining');

    state.resources.influence = 0;
    engine._processInfluenceIncome();
    // 1 colony base (2) + 1 trait bonus (1) = 3
    assert.strictEqual(state.resources.influence, INFLUENCE_BASE_INCOME + INFLUENCE_TRAIT_INCOME);
  });

  it('should add +2 trait bonus for 2 colonies with traits', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    const colony1 = getFirstColony(engine, 1);

    // Colony 1: Mining Colony trait
    colony1.districts = [];
    addDistricts(colony1, 'mining', 4);

    // Colony 2: Forge World trait
    const c2Id = 'trait-colony-2';
    engine.colonies.set(c2Id, {
      id: c2Id, name: 'Forge World', ownerId: 1,
      systemId: colony1.systemId,
      planet: { size: 16, type: 'continental', habitability: 80 },
      districts: [], buildQueue: [], pops: 8,
      growthProgress: 0, isStartingColony: false, playerBuiltDistricts: 0,
    });
    const c2 = engine.colonies.get(c2Id);
    addDistricts(c2, 'industrial', 4);
    engine._playerColonies.get(1).push(c2Id);

    state.resources.influence = 0;
    engine._processInfluenceIncome();
    // 2 colonies base (4) + 2 traits bonus (2) = 6
    assert.strictEqual(state.resources.influence, 2 * INFLUENCE_BASE_INCOME + 2 * INFLUENCE_TRAIT_INCOME);
  });

  it('should not add trait bonus for colony without enough districts', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    const colony = getFirstColony(engine, 1);

    // Only 3 mining districts — not enough for trait (need 4)
    colony.districts = [];
    addDistricts(colony, 'mining', 3);

    const trait = engine._calcColonyTrait(colony);
    assert.strictEqual(trait, null, 'colony should not have a trait with only 3 districts');

    state.resources.influence = 0;
    engine._processInfluenceIncome();
    // 1 colony base only
    assert.strictEqual(state.resources.influence, INFLUENCE_BASE_INCOME);
  });
});

// ── Influence cap ──

describe('Influence cap at 200', () => {
  it('should cap influence at 200', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    state.resources.influence = 199;
    engine._processInfluenceIncome();
    // Would add +2, but capped at 200
    assert.strictEqual(state.resources.influence, INFLUENCE_CAP);
  });

  it('should not exceed cap even with high income', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    const colony1 = getFirstColony(engine, 1);

    // Add 4 more colonies with traits for max income
    for (let i = 2; i <= 5; i++) {
      const cId = 'cap-colony-' + i;
      engine.colonies.set(cId, {
        id: cId, name: 'Colony ' + i, ownerId: 1,
        systemId: colony1.systemId,
        planet: { size: 16, type: 'continental', habitability: 80 },
        districts: [], buildQueue: [], pops: 8,
        growthProgress: 0, isStartingColony: false, playerBuiltDistricts: 0,
      });
      const c = engine.colonies.get(cId);
      addDistricts(c, 'mining', 4); // trait
      engine._playerColonies.get(1).push(cId);
    }
    // First colony also gets a trait
    colony1.districts = [];
    addDistricts(colony1, 'research', 4);

    // 5 colonies × 2 base + 5 traits × 1 = 15/month
    state.resources.influence = 190;
    engine._processInfluenceIncome();
    assert.strictEqual(state.resources.influence, INFLUENCE_CAP);
  });

  it('should not increase influence already at cap', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    state.resources.influence = INFLUENCE_CAP;
    engine._processInfluenceIncome();
    assert.strictEqual(state.resources.influence, INFLUENCE_CAP);
  });
});

// ── Edge cases ──

describe('Influence income edge cases', () => {
  it('should not add income for player with 0 colonies', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    // Remove all colonies
    engine._playerColonies.set(1, []);
    state.resources.influence = 50;
    engine._processInfluenceIncome();
    assert.strictEqual(state.resources.influence, 50);
  });

  it('should process influence income during monthly tick', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    state.resources.influence = 0;
    // Run one full month
    runMonth(engine);
    // Should have gained at least base income (1 colony = +2)
    assert.ok(state.resources.influence >= INFLUENCE_BASE_INCOME,
      `Expected at least ${INFLUENCE_BASE_INCOME} influence, got ${state.resources.influence}`);
  });

  it('should include influence income in player summary', () => {
    const engine = makeEngine();
    const colony = getFirstColony(engine, 1);
    colony.districts = [];
    addDistricts(colony, 'generator', 4); // Power Hub trait

    const summary = engine._getPlayerSummary(1);
    // 1 colony base + 1 trait = 3
    assert.strictEqual(summary.income.influence, INFLUENCE_BASE_INCOME + INFLUENCE_TRAIT_INCOME);
  });

  it('should include influence income in player summary without traits', () => {
    const engine = makeEngine();
    const summary = engine._getPlayerSummary(1);
    // Starting colony has mixed districts, likely no trait
    // Base income = 1 colony * 2 = 2 (no trait)
    const colony = getFirstColony(engine, 1);
    const trait = engine._calcColonyTrait(colony);
    const expected = INFLUENCE_BASE_INCOME + (trait ? INFLUENCE_TRAIT_INCOME : 0);
    assert.strictEqual(summary.income.influence, expected);
  });

  it('should work correctly for multiple players', () => {
    const engine = makeEngineMulti(2);
    const state1 = engine.playerStates.get(1);
    const state2 = engine.playerStates.get(2);
    state1.resources.influence = 0;
    state2.resources.influence = 0;
    engine._processInfluenceIncome();
    // Each player has 1 colony → +2 each
    assert.strictEqual(state1.resources.influence, INFLUENCE_BASE_INCOME);
    assert.strictEqual(state2.resources.influence, INFLUENCE_BASE_INCOME);
  });
});

// ── Serialization ──

describe('Influence income in serialized state', () => {
  it('should include influence in getPlayerState income', () => {
    const engine = makeEngine();
    const playerState = engine.getPlayerState(1);
    const me = playerState.players[0];
    assert.ok(me.income, 'player should have income in state');
    assert.ok(me.income.influence != null, 'income should include influence');
    assert.ok(me.income.influence >= INFLUENCE_BASE_INCOME, 'influence income should be at least base');
  });
});
