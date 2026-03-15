const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine, COLONY_TRAITS, DISTRICT_DEFS, PLANET_BONUSES,
} = require('../../server/game-engine');
const { formatGameEvent, TOAST_TYPE_MAP } = require('../public/js/toast-format');

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

// Helper: get player's first colony
function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

// Helper: add districts directly to a colony (bypasses build queue)
function addDistricts(colony, type, count) {
  for (let i = 0; i < count; i++) {
    colony.districts.push({ id: 'test-' + type + '-' + i + '-' + Math.random(), type });
  }
  colony._cachedProduction = null;
  colony._cachedJobs = null;
  colony._cachedHousing = null;
}

// Helper: set up a colony with a specific planet type and clear starting districts
function makeEngineWithCleanColony(planetType) {
  const engine = makeEngine();
  const colony = getFirstColony(engine, 1);
  colony.planet.type = planetType || 'continental';
  colony.districts = [];
  colony._cachedProduction = null;
  colony._cachedJobs = null;
  colony._cachedHousing = null;
  return { engine, colony };
}

// ── COLONY_TRAITS constant ──

describe('COLONY_TRAITS constant', () => {
  it('should define 5 trait types', () => {
    assert.strictEqual(Object.keys(COLONY_TRAITS).length, 5);
  });

  it('should have threshold of 4 for all traits', () => {
    for (const [type, def] of Object.entries(COLONY_TRAITS)) {
      assert.strictEqual(def.threshold, 4, `${type} threshold should be 4`);
    }
  });

  it('should have correct trait names', () => {
    assert.strictEqual(COLONY_TRAITS.research.name, 'Academy World');
    assert.strictEqual(COLONY_TRAITS.industrial.name, 'Forge World');
    assert.strictEqual(COLONY_TRAITS.mining.name, 'Mining Colony');
    assert.strictEqual(COLONY_TRAITS.agriculture.name, 'Breadbasket');
    assert.strictEqual(COLONY_TRAITS.generator.name, 'Power Hub');
  });

  it('should have 10% bonus for each trait', () => {
    assert.deepStrictEqual(COLONY_TRAITS.research.bonus, { physics: 0.10, society: 0.10, engineering: 0.10 });
    assert.deepStrictEqual(COLONY_TRAITS.industrial.bonus, { alloys: 0.10 });
    assert.deepStrictEqual(COLONY_TRAITS.mining.bonus, { minerals: 0.10 });
    assert.deepStrictEqual(COLONY_TRAITS.agriculture.bonus, { food: 0.10 });
    assert.deepStrictEqual(COLONY_TRAITS.generator.bonus, { energy: 0.10 });
  });
});

// ── _calcColonyTrait ──

describe('_calcColonyTrait', () => {
  it('should return null with fewer than 4 districts of any type', () => {
    const { engine, colony } = makeEngineWithCleanColony();
    addDistricts(colony, 'mining', 3);
    assert.strictEqual(engine._calcColonyTrait(colony), null);
  });

  it('should return Mining Colony with 4+ mining districts', () => {
    const { engine, colony } = makeEngineWithCleanColony();
    addDistricts(colony, 'mining', 4);
    colony.pops = 10; // enough workers
    const trait = engine._calcColonyTrait(colony);
    assert.strictEqual(trait.type, 'mining');
    assert.strictEqual(trait.name, 'Mining Colony');
  });

  it('should return Academy World with 4+ research districts', () => {
    const { engine, colony } = makeEngineWithCleanColony();
    addDistricts(colony, 'research', 5);
    colony.pops = 10;
    const trait = engine._calcColonyTrait(colony);
    assert.strictEqual(trait.type, 'research');
    assert.strictEqual(trait.name, 'Academy World');
  });

  it('should return Forge World with 4+ industrial districts', () => {
    const { engine, colony } = makeEngineWithCleanColony();
    addDistricts(colony, 'industrial', 4);
    colony.pops = 10;
    const trait = engine._calcColonyTrait(colony);
    assert.strictEqual(trait.type, 'industrial');
    assert.strictEqual(trait.name, 'Forge World');
  });

  it('should return Breadbasket with 4+ agriculture districts', () => {
    const { engine, colony } = makeEngineWithCleanColony();
    addDistricts(colony, 'agriculture', 4);
    colony.pops = 10;
    const trait = engine._calcColonyTrait(colony);
    assert.strictEqual(trait.type, 'agriculture');
    assert.strictEqual(trait.name, 'Breadbasket');
  });

  it('should return Power Hub with 4+ generator districts', () => {
    const { engine, colony } = makeEngineWithCleanColony();
    addDistricts(colony, 'generator', 4);
    colony.pops = 10;
    const trait = engine._calcColonyTrait(colony);
    assert.strictEqual(trait.type, 'generator');
    assert.strictEqual(trait.name, 'Power Hub');
  });

  it('should pick highest count when multiple types qualify', () => {
    const { engine, colony } = makeEngineWithCleanColony();
    addDistricts(colony, 'mining', 4);
    addDistricts(colony, 'generator', 5);
    colony.pops = 20;
    const trait = engine._calcColonyTrait(colony);
    assert.strictEqual(trait.type, 'generator');
  });

  it('should ignore disabled districts', () => {
    const { engine, colony } = makeEngineWithCleanColony();
    addDistricts(colony, 'mining', 4);
    colony.districts[0].disabled = true; // only 3 active
    colony.pops = 10;
    assert.strictEqual(engine._calcColonyTrait(colony), null);
  });

  it('should ignore housing districts (no trait for housing)', () => {
    const { engine, colony } = makeEngineWithCleanColony();
    addDistricts(colony, 'housing', 6);
    colony.pops = 10;
    assert.strictEqual(engine._calcColonyTrait(colony), null);
  });
});

// ── Empire-wide trait bonuses in _calcProduction ──

describe('Empire-wide trait bonuses in _calcProduction', () => {
  it('should apply +10% mineral bonus with Mining Colony trait', () => {
    const { engine, colony } = makeEngineWithCleanColony('barren'); // no planet bonuses
    colony.planet.type = 'barren'; // ensure no planet bonuses
    addDistricts(colony, 'mining', 5);
    colony.pops = 10;
    const { production } = engine._calcProduction(colony);
    // Base: 5 mining × 6 minerals = 30, +10% trait = 33
    assert.strictEqual(production.minerals, 33);
  });

  it('should apply +10% alloy bonus with Forge World trait', () => {
    const { engine, colony } = makeEngineWithCleanColony('barren');
    colony.planet.type = 'barren';
    addDistricts(colony, 'industrial', 5);
    colony.pops = 10;
    const { production } = engine._calcProduction(colony);
    // Base: 5 industrial × 4 alloys = 20, +10% = 22
    assert.strictEqual(production.alloys, 22);
  });

  it('should apply +10% food bonus with Breadbasket trait', () => {
    const { engine, colony } = makeEngineWithCleanColony('barren');
    colony.planet.type = 'barren';
    addDistricts(colony, 'agriculture', 4);
    colony.pops = 10;
    const { production } = engine._calcProduction(colony);
    // Base: 4 agriculture × 6 food = 24, +10% = 26.4 → rounded to 26.4
    assert.strictEqual(production.food, 26.4);
  });

  it('should apply +10% energy bonus with Power Hub trait', () => {
    const { engine, colony } = makeEngineWithCleanColony('barren');
    colony.planet.type = 'barren';
    addDistricts(colony, 'generator', 4);
    colony.pops = 10;
    const { production } = engine._calcProduction(colony);
    // Base: 4 generators × 6 energy = 24, +10% = 26.4
    assert.strictEqual(production.energy, 26.4);
  });

  it('should apply +10% research bonus with Academy World trait', () => {
    const { engine, colony } = makeEngineWithCleanColony('barren');
    colony.planet.type = 'barren';
    addDistricts(colony, 'research', 4);
    colony.pops = 4; // exactly enough workers, no unemployed
    const { production } = engine._calcProduction(colony);
    // Base: 4 research × 4 each = 16 per track, +10% = 17.6
    assert.strictEqual(production.physics, 17.6);
    assert.strictEqual(production.society, 17.6);
    assert.strictEqual(production.engineering, 17.6);
  });

  it('should stack bonuses from multiple colonies', () => {
    const engine = makeEngine();
    // Clear all colonies for player 1
    const colonyIds = [...engine._playerColonies.get(1)];
    for (const cid of colonyIds) {
      const c = engine.colonies.get(cid);
      c.districts = [];
      c._cachedProduction = null;
      c._cachedJobs = null;
      c._cachedHousing = null;
    }
    const colony1 = engine.colonies.get(colonyIds[0]);
    colony1.planet.type = 'barren';
    addDistricts(colony1, 'mining', 5);
    colony1.pops = 10;

    // Create a second colony with mining trait
    const colony2Id = engine._nextId();
    const colony2 = {
      id: colony2Id, ownerId: 1, name: 'Colony 2', systemId: colony1.systemId,
      planet: { type: 'barren', size: 16, habitability: 0 },
      districts: [], buildQueue: [], pops: 10,
      growthProgress: 0, isStartingColony: false, playerBuiltDistricts: 0,
      _cachedProduction: null, _cachedJobs: null, _cachedHousing: null,
    };
    addDistricts(colony2, 'mining', 4);
    engine.colonies.set(colony2Id, colony2);
    engine._playerColonies.get(1).push(colony2Id);

    // Colony1 should get +20% minerals (2 Mining Colonies)
    const { production } = engine._calcProduction(colony1);
    // Base: 5 × 6 = 30, +20% = 36
    assert.strictEqual(production.minerals, 36);
  });

  it('should not apply trait bonuses with fewer than 4 districts', () => {
    const { engine, colony } = makeEngineWithCleanColony('barren');
    colony.planet.type = 'barren';
    addDistricts(colony, 'mining', 3);
    colony.pops = 10;
    const { production } = engine._calcProduction(colony);
    // Base: 3 mining × 6 = 18, no trait bonus
    assert.strictEqual(production.minerals, 18);
  });
});

// ── VP bonus for colony traits ──

describe('VP bonus for colony traits', () => {
  it('should add +5 VP per active colony trait', () => {
    const { engine, colony } = makeEngineWithCleanColony('barren');
    colony.planet.type = 'barren';
    addDistricts(colony, 'mining', 4);
    colony.pops = 10;
    engine._invalidateStateCache();

    const breakdown = engine._calcVPBreakdown(1);
    assert.strictEqual(breakdown.traits, 1);
    assert.strictEqual(breakdown.traitsVP, 10);
  });

  it('should return 0 traitsVP with no traits', () => {
    const { engine, colony } = makeEngineWithCleanColony('barren');
    colony.planet.type = 'barren';
    addDistricts(colony, 'mining', 2);
    colony.pops = 10;
    engine._invalidateStateCache();

    const breakdown = engine._calcVPBreakdown(1);
    assert.strictEqual(breakdown.traits, 0);
    assert.strictEqual(breakdown.traitsVP, 0);
  });

  it('should include traitsVP in total VP', () => {
    const { engine, colony } = makeEngineWithCleanColony('barren');
    colony.planet.type = 'barren';
    addDistricts(colony, 'mining', 4);
    colony.pops = 0; // no pops, no other VP sources
    // Clear resources to isolate trait VP
    const state = engine.playerStates.get(1);
    state.resources.alloys = 0;
    state.resources.research = { physics: 0, society: 0, engineering: 0 };
    state.completedTechs = [];
    engine._invalidateStateCache();

    const breakdown = engine._calcVPBreakdown(1);
    // VP = popVP(0) + districts(4) + alloys/25(0) + research/50(0) + techVP(0) + traitsVP(10) = 14
    assert.strictEqual(breakdown.vp, 14);
  });

  it('should include traitsVP in gameOver breakdown', () => {
    const engine = makeEngine({ room: { matchTimer: 0 } });
    const colony = getFirstColony(engine, 1);
    colony.districts = [];
    colony.planet.type = 'barren';
    addDistricts(colony, 'mining', 4);
    colony.pops = 10;
    colony._cachedProduction = null;
    colony._cachedJobs = null;
    colony._cachedHousing = null;
    engine._invalidateStateCache();

    let gameOverData = null;
    engine.onGameOver = (data) => { gameOverData = data; };
    engine._triggerGameOver();

    assert.ok(gameOverData);
    const score = gameOverData.scores[0];
    assert.strictEqual(score.breakdown.traits, 1);
    assert.strictEqual(score.breakdown.traitsVP, 10);
  });
});

// ── Colony trait in serialization ──

describe('Colony trait serialization', () => {
  it('should include trait in _serializeColony when trait active', () => {
    const { engine, colony } = makeEngineWithCleanColony('barren');
    colony.planet.type = 'barren';
    addDistricts(colony, 'mining', 4);
    colony.pops = 10;
    colony._cachedProduction = null;

    const serialized = engine._serializeColony(colony);
    assert.ok(serialized.trait);
    assert.strictEqual(serialized.trait.type, 'mining');
    assert.strictEqual(serialized.trait.name, 'Mining Colony');
  });

  it('should include null trait when no trait active', () => {
    const { engine, colony } = makeEngineWithCleanColony('barren');
    colony.planet.type = 'barren';
    addDistricts(colony, 'mining', 2);
    colony.pops = 10;
    colony._cachedProduction = null;

    const serialized = engine._serializeColony(colony);
    assert.strictEqual(serialized.trait, null);
  });

  it('should include trait in getPlayerState colony data', () => {
    const { engine, colony } = makeEngineWithCleanColony('barren');
    colony.planet.type = 'barren';
    addDistricts(colony, 'generator', 4);
    colony.pops = 10;
    colony._cachedProduction = null;
    engine._invalidateStateCache();

    const playerState = engine.getPlayerState(1);
    const col = playerState.colonies[0];
    assert.ok(col.trait);
    assert.strictEqual(col.trait.type, 'generator');
    assert.strictEqual(col.trait.name, 'Power Hub');
  });
});

// ── colonyTraitEarned event ──

describe('colonyTraitEarned event', () => {
  it('should emit event when district completion earns a trait', () => {
    const engine = makeEngine();
    engine._doctrinePhase = false; // skip doctrine auto-assignment
    const colony = getFirstColony(engine, 1);
    colony.districts = [];
    colony.planet.type = 'barren';
    colony.planet.size = 16;
    addDistricts(colony, 'mining', 3);
    colony.pops = 10;
    colony._cachedProduction = null;
    colony._cachedJobs = null;
    colony._cachedHousing = null;

    // Give resources for building
    const state = engine.playerStates.get(1);
    state.resources.minerals = 1000;

    // Queue a 4th mining district
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'mining' });

    // Fast-forward construction (mining = 300 ticks)
    const events = [];
    engine.onEvent = (evts) => events.push(...evts);
    for (let i = 0; i < 300; i++) {
      engine.tick();
    }

    const traitEvent = events.find(e => e.eventType === 'colonyTraitEarned');
    assert.ok(traitEvent, 'colonyTraitEarned event should be emitted');
    assert.strictEqual(traitEvent.traitType, 'mining');
    assert.strictEqual(traitEvent.traitName, 'Mining Colony');
    assert.strictEqual(traitEvent.broadcast, true);
  });

  it('should not emit event when district does not earn a new trait', () => {
    const engine = makeEngine();
    const colony = getFirstColony(engine, 1);
    colony.districts = [];
    colony.planet.type = 'barren';
    colony.planet.size = 16;
    addDistricts(colony, 'mining', 4); // already has trait
    colony.pops = 10;
    colony._cachedProduction = null;
    colony._cachedJobs = null;
    colony._cachedHousing = null;

    const state = engine.playerStates.get(1);
    state.resources.minerals = 1000;

    // Queue a 5th mining district (trait doesn't change)
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'mining' });

    const events = [];
    engine.onEvent = (evts) => events.push(...evts);
    for (let i = 0; i < 300; i++) {
      engine.tick();
    }

    const traitEvent = events.find(e => e.eventType === 'colonyTraitEarned');
    assert.strictEqual(traitEvent, undefined, 'No colonyTraitEarned event when trait unchanged');
  });
});

// ── Toast formatting ──

describe('Colony trait — empire-wide production cache invalidation', () => {
  it('earning a trait on one colony updates production on sibling colonies', () => {
    const engine = makeEngine({ seed: 42 });
    const colony1 = getFirstColony(engine, 1);

    // Create a second colony for the same player
    const system = engine.galaxy.systems[1];
    const planet = system.planets.find(p => p.habitability > 0) || system.planets[0];
    const colony2Id = engine._createColony(1, 'Colony 2', planet, system.id).id;
    engine._playerColonies.get(1).push(colony2Id);
    const colony2 = engine.colonies.get(colony2Id);

    // Give colony2 a mining district so it produces minerals
    engine._addBuiltDistrict(colony2, 'mining');
    colony2.pops = 4;
    engine._invalidateColonyCache(colony2);

    // Get baseline mineral production for colony2
    const before = engine._calcProduction(colony2);
    const mineralsBefore = before.production.minerals;

    // Now earn a Mining Colony trait on colony1 (need 4 mining districts)
    // Clear colony1 districts first
    colony1.districts = [];
    for (let i = 0; i < 4; i++) engine._addBuiltDistrict(colony1, 'mining');
    colony1.pops = 8;
    engine._invalidateColonyCache(colony1);

    // Simulate what happens during construction: trait change detection + invalidation
    const trait = engine._calcColonyTrait(colony1);
    assert.ok(trait, 'colony1 should have a mining trait');
    engine._invalidatePlayerProductionCaches(1);

    // Colony2's production should now reflect the empire-wide +10% mining bonus
    const after = engine._calcProduction(colony2);
    const mineralsAfter = after.production.minerals;
    assert.ok(mineralsAfter > mineralsBefore,
      `colony2 minerals should increase from ${mineralsBefore} to reflect empire-wide trait bonus, got ${mineralsAfter}`);
  });

  it('demolishing a trait-giving district invalidates sibling production caches', () => {
    const engine = makeEngine({ seed: 42 });
    const colony1 = getFirstColony(engine, 1);

    // Build 4 mining districts on colony1 to earn a trait
    colony1.districts = [];
    for (let i = 0; i < 4; i++) engine._addBuiltDistrict(colony1, 'mining');
    colony1.pops = 8;
    engine._invalidateColonyCache(colony1);

    // Create colony2 with a mining district
    const system = engine.galaxy.systems[1];
    const planet = system.planets.find(p => p.habitability > 0) || system.planets[0];
    const colony2Id = engine._createColony(1, 'Colony 2', planet, system.id).id;
    engine._playerColonies.get(1).push(colony2Id);
    const colony2 = engine.colonies.get(colony2Id);
    engine._addBuiltDistrict(colony2, 'mining');
    colony2.pops = 4;
    engine._invalidateColonyCache(colony2);

    // Force production cache to be computed (includes +10% mining trait bonus)
    const withTrait = engine._calcProduction(colony2);
    const mineralsWithTrait = withTrait.production.minerals;

    // Demolish a mining district from colony1 — lose the trait
    const districtId = colony1.districts[0].id;
    engine.handleCommand(1, { type: 'demolish', colonyId: colony1.id, districtId });

    // Colony2's production should be recomputed without the trait bonus
    const withoutTrait = engine._calcProduction(colony2);
    const mineralsWithoutTrait = withoutTrait.production.minerals;
    assert.ok(mineralsWithoutTrait < mineralsWithTrait,
      `colony2 minerals should decrease from ${mineralsWithTrait} after trait loss, got ${mineralsWithoutTrait}`);
  });
});

describe('Colony trait toast formatting', () => {
  it('should format colonyTraitEarned toast', () => {
    const msg = { eventType: 'colonyTraitEarned', colonyName: 'New Mars', traitName: 'Mining Colony' };
    const text = formatGameEvent(msg);
    assert.strictEqual(text, 'New Mars earned trait: Mining Colony!');
  });

  it('should have colonyTraitEarned in TOAST_TYPE_MAP as positive', () => {
    assert.strictEqual(TOAST_TYPE_MAP.colonyTraitEarned, 'positive');
  });

  it('should handle missing colonyName gracefully', () => {
    const msg = { eventType: 'colonyTraitEarned', traitName: 'Forge World' };
    const text = formatGameEvent(msg);
    assert.strictEqual(text, 'Colony earned trait: Forge World!');
  });
});
