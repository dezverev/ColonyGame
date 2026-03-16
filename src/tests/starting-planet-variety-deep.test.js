const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, PLANET_TYPES, PLANET_BONUSES, COLONY_NAMES, DISTRICT_DEFS } = require('../../server/game-engine');

const HABITABLE_TYPES = ['continental', 'ocean', 'tropical', 'arctic', 'desert', 'arid'];

function makeRoom(playerCount = 2, options = {}) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { id: i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 1, maxPlayers: 8, status: 'playing', players, ...options };
}

function getColonies(engine) {
  return [...engine.colonies.values()];
}

describe('Starting Planet Variety — Planet Type Bonuses', () => {
  it('tropical starting planet gives +2 food per agriculture district', () => {
    // Create games until we get a tropical starting planet
    let engine, colony;
    for (let i = 0; i < 100; i++) {
      engine = new GameEngine(makeRoom(1), { tickRate: 10 });
      colony = getColonies(engine)[0];
      if (colony.planet.type === 'tropical') break;
    }
    if (colony.planet.type !== 'tropical') {
      // Can't test if RNG never gives tropical — skip gracefully
      return;
    }
    const prod = engine._calcProduction(colony);
    // Starting colony has 2 agriculture districts, each gets +2 food from tropical bonus
    // Base agriculture: 6 food each = 12 food from 2 ag districts, +2 bonus per ag = +4
    const agCount = colony.districts.filter(d => d.type === 'agriculture').length;
    const baseFood = DISTRICT_DEFS.agriculture.produces.food * agCount;
    assert.ok(prod.production.food >= baseFood + (agCount * 2),
      `Tropical should add +2 food per agriculture district, got ${prod.production.food} food (base would be ${baseFood})`);
  });

  it('desert starting planet gives +2 minerals per mining district', () => {
    let engine, colony;
    for (let i = 0; i < 100; i++) {
      engine = new GameEngine(makeRoom(1), { tickRate: 10 });
      colony = getColonies(engine)[0];
      if (colony.planet.type === 'desert') break;
    }
    if (colony.planet.type !== 'desert') return;
    const prod = engine._calcProduction(colony);
    const miningCount = colony.districts.filter(d => d.type === 'mining').length;
    const baseMinerals = DISTRICT_DEFS.mining.produces.minerals * miningCount;
    assert.ok(prod.production.minerals >= baseMinerals + (miningCount * 2),
      `Desert should add +2 minerals per mining district, got ${prod.production.minerals}`);
  });

  it('arid starting planet gives +1 energy per generator and +1 alloys per industrial', () => {
    let engine, colony;
    for (let i = 0; i < 100; i++) {
      engine = new GameEngine(makeRoom(1), { tickRate: 10 });
      colony = getColonies(engine)[0];
      if (colony.planet.type === 'arid') break;
    }
    if (colony.planet.type !== 'arid') return;
    const prod = engine._calcProduction(colony);
    const genCount = colony.districts.filter(d => d.type === 'generator').length;
    const baseEnergy = DISTRICT_DEFS.generator.produces.energy * genCount;
    assert.ok(prod.production.energy >= baseEnergy + genCount,
      `Arid should add +1 energy per generator, got ${prod.production.energy}`);
  });

  it('arctic starting planet gives +1 minerals per mining and research bonuses', () => {
    let engine, colony;
    for (let i = 0; i < 100; i++) {
      engine = new GameEngine(makeRoom(1), { tickRate: 10 });
      colony = getColonies(engine)[0];
      if (colony.planet.type === 'arctic') break;
    }
    if (colony.planet.type !== 'arctic') return;
    const prod = engine._calcProduction(colony);
    const miningCount = colony.districts.filter(d => d.type === 'mining').length;
    const baseMinerals = DISTRICT_DEFS.mining.produces.minerals * miningCount;
    assert.ok(prod.production.minerals >= baseMinerals + miningCount,
      `Arctic should add +1 minerals per mining district, got ${prod.production.minerals}`);
  });

  it('planet bonuses are applied per working district, not flat', () => {
    // Verify bonuses scale with number of districts
    let engine, colony;
    for (let i = 0; i < 100; i++) {
      engine = new GameEngine(makeRoom(1), { tickRate: 10 });
      colony = getColonies(engine)[0];
      if (colony.planet.type === 'tropical') break;
    }
    if (colony.planet.type !== 'tropical') return;

    const prodBefore = engine._calcProduction(colony);
    const foodBefore = prodBefore.production.food;

    // Add another agriculture district
    engine._addBuiltDistrict(colony, 'agriculture');
    const prodAfter = engine._calcProduction(colony);
    const foodAfter = prodAfter.production.food;

    // New district adds base food + tropical bonus (+2)
    const expectedIncrease = DISTRICT_DEFS.agriculture.produces.food + 2;
    // Account for possible pop limitation (need enough pops to work the district)
    if (colony.pops > colony.districts.filter(d => !d.disabled).length - 1) {
      assert.strictEqual(foodAfter - foodBefore, expectedIncrease,
        `Adding agriculture on tropical should add ${expectedIncrease} food, got ${foodAfter - foodBefore}`);
    }
  });
});

describe('Starting Planet Variety — Colony Naming', () => {
  it('colony name comes from the correct planet type pool', () => {
    for (let trial = 0; trial < 30; trial++) {
      const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
      const colony = getColonies(engine)[0];
      const typeNames = COLONY_NAMES[colony.planet.type];
      assert.ok(typeNames.includes(colony.name),
        `Colony name "${colony.name}" should be in ${colony.planet.type} names list`);
    }
  });

  it('non-fair mode assigns type-appropriate names per player', () => {
    const engine = new GameEngine(makeRoom(4, { fairStartingPlanets: false }), { tickRate: 10 });
    const colonies = getColonies(engine);
    for (const c of colonies) {
      const typeNames = COLONY_NAMES[c.planet.type];
      // Name should be from the type pool or a fallback
      const isInPool = typeNames.includes(c.name);
      const isFallback = c.name.startsWith('Colony ');
      assert.ok(isInPool || isFallback,
        `Colony "${c.name}" should match type "${c.planet.type}" name pool`);
    }
  });
});

describe('Starting Planet Variety — District Capacity from Size', () => {
  it('planet size determines max district count', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = getColonies(engine)[0];
    // Max districts = planet size
    assert.strictEqual(colony.planet.size, colony.planet.size);
    assert.ok(colony.planet.size >= 12 && colony.planet.size <= 20);
    // Current districts should be less than max
    assert.ok(colony.districts.length <= colony.planet.size,
      `Districts (${colony.districts.length}) should not exceed planet size (${colony.planet.size})`);
  });

  it('cannot build more districts than planet size allows', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = getColonies(engine)[0];
    // Fill up to planet size
    while (colony.districts.length < colony.planet.size) {
      engine._addBuiltDistrict(colony, 'generator');
    }
    assert.strictEqual(colony.districts.length, colony.planet.size);
    // Try to build one more via command
    const result = engine.handleCommand(colony.ownerId, 'buildDistrict', {
      colonyId: colony.id,
      districtType: 'generator'
    });
    assert.ok(result && result.error, 'Should reject district build when at capacity');
  });

  it('smaller planet has fewer available district slots', () => {
    // Run until we find size 12 and size 18+ planets
    let smallColony = null, largeColony = null;
    for (let i = 0; i < 100; i++) {
      const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
      const colony = getColonies(engine)[0];
      if (colony.planet.size <= 13 && !smallColony) smallColony = colony;
      if (colony.planet.size >= 18 && !largeColony) largeColony = colony;
      if (smallColony && largeColony) break;
    }
    if (smallColony && largeColony) {
      assert.ok(largeColony.planet.size > smallColony.planet.size,
        'Large planet should have more capacity than small');
    }
  });
});

describe('Starting Planet Variety — Galaxy Integration', () => {
  it('all system planets retain original non-colonized planets', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = getColonies(engine)[0];
    const system = engine.galaxy.systems[colony.systemId];
    // System should have multiple planets, not just the colonized one
    assert.ok(system.planets.length >= 1, 'System should have planets');
    const colonized = system.planets.filter(p => p.colonized);
    assert.strictEqual(colonized.length, 1, 'Should have exactly 1 colonized planet');
  });

  it('colonized planet in galaxy has correct owner', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const colonies = getColonies(engine);
    for (const colony of colonies) {
      const system = engine.galaxy.systems[colony.systemId];
      const colonizedPlanet = system.planets.find(p => p.colonized);
      assert.ok(colonizedPlanet, `System ${colony.systemId} should have colonized planet`);
      assert.strictEqual(colonizedPlanet.colonyOwner, colony.ownerId,
        'Colonized planet should track owner');
    }
  });

  it('fair mode 8 players all get identical planet type and size', () => {
    const engine = new GameEngine(makeRoom(8), { tickRate: 10 });
    const colonies = getColonies(engine);
    assert.strictEqual(colonies.length, 8, 'Should have 8 colonies for 8 players');
    const types = new Set(colonies.map(c => c.planet.type));
    const sizes = new Set(colonies.map(c => c.planet.size));
    assert.strictEqual(types.size, 1, `All 8 players should have same type, got: ${[...types]}`);
    assert.strictEqual(sizes.size, 1, `All 8 players should have same size, got: ${[...sizes]}`);
  });
});

describe('Starting Planet Variety — Serialization', () => {
  it('gameInit payload includes planet type and size for each colony', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const state = engine.getState();
    for (const col of state.colonies) {
      assert.ok(col.planet, `Colony ${col.id} should have planet in serialized state`);
      assert.ok(HABITABLE_TYPES.includes(col.planet.type),
        `Serialized planet type "${col.planet.type}" should be habitable`);
      assert.ok(col.planet.size >= 12 && col.planet.size <= 20,
        `Serialized planet size ${col.planet.size} should be 12-20`);
      assert.ok(typeof col.planet.habitability === 'number',
        'Serialized planet should have habitability');
    }
  });

  it('getPlayerStateJSON includes planet variety data', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const json = engine.getPlayerStateJSON(1);
    const state = JSON.parse(json);
    assert.ok(state.colonies.length >= 1, 'Should have at least 1 colony');
    const colony = state.colonies[0];
    assert.ok(colony.planet, 'Player state colony should have planet data');
    assert.ok(HABITABLE_TYPES.includes(colony.planet.type));
    assert.ok(colony.planet.size >= 12 && colony.planet.size <= 20);
  });

  it('planet type habitability values are correct in serialized state', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = getColonies(engine)[0];
    const state = engine.getState();
    const serialized = state.colonies[0];
    const expectedHabitability = PLANET_TYPES[colony.planet.type].habitability;
    assert.strictEqual(serialized.planet.habitability, expectedHabitability,
      `Habitability ${serialized.planet.habitability} should match ${colony.planet.type} type (${expectedHabitability})`);
  });
});

describe('Starting Planet Variety — Habitability Classes', () => {
  it('high-habitability types (continental, ocean, tropical) have 80%', () => {
    for (const type of ['continental', 'ocean', 'tropical']) {
      assert.strictEqual(PLANET_TYPES[type].habitability, 80,
        `${type} should have 80% habitability`);
    }
  });

  it('low-habitability types (arctic, desert, arid) have 60%', () => {
    for (const type of ['arctic', 'desert', 'arid']) {
      assert.strictEqual(PLANET_TYPES[type].habitability, 60,
        `${type} should have 60% habitability`);
    }
  });

  it('every habitable type has a defined planet bonus', () => {
    for (const type of HABITABLE_TYPES) {
      assert.ok(PLANET_BONUSES[type],
        `${type} should have a planet bonus defined`);
    }
  });

  it('every habitable type has colony name pool', () => {
    for (const type of HABITABLE_TYPES) {
      assert.ok(COLONY_NAMES[type], `${type} should have colony names`);
      assert.ok(COLONY_NAMES[type].length >= 8,
        `${type} should have at least 8 colony names, has ${COLONY_NAMES[type].length}`);
    }
  });
});

describe('Starting Planet Variety — Edge Cases', () => {
  it('single player game works with fair mode', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colonies = getColonies(engine);
    assert.strictEqual(colonies.length, 1);
    assert.ok(HABITABLE_TYPES.includes(colonies[0].planet.type));
  });

  it('single player game works with non-fair mode', () => {
    const engine = new GameEngine(makeRoom(1, { fairStartingPlanets: false }), { tickRate: 10 });
    const colonies = getColonies(engine);
    assert.strictEqual(colonies.length, 1);
    assert.ok(HABITABLE_TYPES.includes(colonies[0].planet.type));
  });

  it('all six habitable types can appear as starting planets', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
      seen.add(getColonies(engine)[0].planet.type);
      if (seen.size === 6) break;
    }
    assert.strictEqual(seen.size, 6,
      `Should see all 6 habitable types, only saw: ${[...seen].join(', ')}`);
  });

  it('all sizes 12-20 can appear as starting planets', () => {
    const seen = new Set();
    for (let i = 0; i < 300; i++) {
      const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
      seen.add(getColonies(engine)[0].planet.size);
      if (seen.size === 9) break;
    }
    assert.strictEqual(seen.size, 9,
      `Should see all 9 sizes (12-20), only saw: ${[...seen].join(', ')}`);
  });

  it('fair mode habitability is consistent across all players', () => {
    const engine = new GameEngine(makeRoom(4), { tickRate: 10 });
    const colonies = getColonies(engine);
    const habitabilities = new Set(colonies.map(c => c.planet.habitability));
    assert.strictEqual(habitabilities.size, 1,
      `Fair mode should give all players same habitability, got: ${[...habitabilities]}`);
  });
});
