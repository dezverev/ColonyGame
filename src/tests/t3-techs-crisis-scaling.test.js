const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, DISTRICT_DEFS, TECH_TREE, MONTH_TICKS, CRISIS_MIN_TICKS, CRISIS_MAX_TICKS, CRISIS_IMMUNITY_TICKS } = require('../../server/game-engine');

function makeRoom(playerCount = 1, options = {}) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { id: i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 1, maxPlayers: 4, status: 'playing', players, ...options };
}

function makeEngine(opts = {}) {
  return new GameEngine(makeRoom(opts.playerCount || 1), { tickRate: 10, ...opts });
}

function getColony(engine) {
  return Array.from(engine.colonies.values())[0];
}

function getPlayer(engine) {
  return engine.playerStates.get(1);
}

// Helper: complete a tech for a player
function completeTech(engine, techId) {
  const player = getPlayer(engine);
  player.completedTechs.push(techId);
  engine._techModCache.delete(player.id);
  // Invalidate all colony caches for this player
  const colonyIds = engine._playerColonies.get(player.id) || [];
  for (const cid of colonyIds) {
    const c = engine.colonies.get(cid);
    if (c) engine._invalidateColonyCache(c);
  }
}

// ── T3 Tech Tree Structure ──

describe('T3 Tech Tree — Structure', () => {
  it('TECH_TREE has 9 techs (3 tiers × 3 tracks)', () => {
    assert.strictEqual(Object.keys(TECH_TREE).length, 9);
  });

  it('fusion_reactors is physics T3, requires advanced_reactors, cost 1000', () => {
    const tech = TECH_TREE.fusion_reactors;
    assert.strictEqual(tech.track, 'physics');
    assert.strictEqual(tech.tier, 3);
    assert.strictEqual(tech.requires, 'advanced_reactors');
    assert.strictEqual(tech.cost, 1000);
  });

  it('genetic_engineering is society T3, requires gene_crops, cost 1000', () => {
    const tech = TECH_TREE.genetic_engineering;
    assert.strictEqual(tech.track, 'society');
    assert.strictEqual(tech.tier, 3);
    assert.strictEqual(tech.requires, 'gene_crops');
    assert.strictEqual(tech.cost, 1000);
  });

  it('automated_mining is engineering T3, requires deep_mining, cost 1000', () => {
    const tech = TECH_TREE.automated_mining;
    assert.strictEqual(tech.track, 'engineering');
    assert.strictEqual(tech.tier, 3);
    assert.strictEqual(tech.requires, 'deep_mining');
    assert.strictEqual(tech.cost, 1000);
  });

  it('each track has exactly 3 tiers', () => {
    for (const track of ['physics', 'society', 'engineering']) {
      const tiers = Object.values(TECH_TREE).filter(t => t.track === track).map(t => t.tier);
      assert.deepStrictEqual(tiers.sort(), [1, 2, 3], `${track} should have tiers 1, 2, 3`);
    }
  });
});

// ── Fusion Reactors (Physics T3) ──

describe('T3 — Fusion Reactors', () => {
  it('doubles generator output (2.0x multiplier)', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    // Set planet to barren-like to avoid planet bonuses
    colony.planet.type = 'barren';

    // Clear districts, add 1 generator
    colony.districts = [{ type: 'generator', disabled: false }];
    colony.pops = 8;
    engine._invalidateColonyCache(colony);

    // Without tech
    let prod = engine._calcProduction(colony).production;
    assert.strictEqual(prod.energy, 6); // base generator output

    // With T1+T2+T3 physics techs
    completeTech(engine, 'improved_power_plants');
    completeTech(engine, 'advanced_reactors');
    completeTech(engine, 'fusion_reactors');
    engine._invalidateColonyCache(colony);

    prod = engine._calcProduction(colony).production;
    assert.strictEqual(prod.energy, 12); // 6 * 2.0
  });

  it('generators produce +1 alloy per working district', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.planet.type = 'barren';
    colony.districts = [
      { type: 'generator', disabled: false },
      { type: 'generator', disabled: false },
    ];
    colony.pops = 8;

    completeTech(engine, 'improved_power_plants');
    completeTech(engine, 'advanced_reactors');
    completeTech(engine, 'fusion_reactors');
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony).production;
    assert.strictEqual(prod.alloys, 2); // +1 alloy per generator × 2 generators
  });

  it('disabled generators do not produce alloy bonus', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.planet.type = 'barren';
    colony.districts = [
      { type: 'generator', disabled: false },
      { type: 'generator', disabled: true },
    ];
    colony.pops = 8;

    completeTech(engine, 'improved_power_plants');
    completeTech(engine, 'advanced_reactors');
    completeTech(engine, 'fusion_reactors');
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony).production;
    assert.strictEqual(prod.alloys, 1); // only 1 working generator
  });
});

// ── Genetic Engineering (Society T3) ──

describe('T3 — Genetic Engineering', () => {
  it('doubles agriculture output (2.0x multiplier)', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.planet.type = 'barren';
    colony.districts = [{ type: 'agriculture', disabled: false }];
    colony.pops = 8;
    engine._invalidateColonyCache(colony);

    // Without tech
    let prod = engine._calcProduction(colony).production;
    assert.strictEqual(prod.food, 6); // base agriculture output

    completeTech(engine, 'frontier_medicine');
    completeTech(engine, 'gene_crops');
    completeTech(engine, 'genetic_engineering');
    engine._invalidateColonyCache(colony);

    prod = engine._calcProduction(colony).production;
    assert.strictEqual(prod.food, 12); // 6 * 2.0
  });

  it('halves pop growth time (stacks with Frontier Medicine)', () => {
    const engine = makeEngine();
    const player = getPlayer(engine);

    // Frontier Medicine: growthMultiplier = 0.75
    completeTech(engine, 'frontier_medicine');
    completeTech(engine, 'gene_crops');

    let mods = engine._getTechModifiers(player);
    assert.strictEqual(mods.growth, 0.75);

    // Add Genetic Engineering: growthMultiplier *= 0.5 → 0.375
    completeTech(engine, 'genetic_engineering');
    mods = engine._getTechModifiers(player);
    assert.strictEqual(mods.growth, 0.75 * 0.5);
  });
});

// ── Automated Mining (Engineering T3) ──

describe('T3 — Automated Mining', () => {
  it('doubles mining output (2.0x multiplier)', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.planet.type = 'barren';
    colony.districts = [{ type: 'mining', disabled: false }];
    colony.pops = 8;
    engine._invalidateColonyCache(colony);

    let prod = engine._calcProduction(colony).production;
    assert.strictEqual(prod.minerals, 6); // base

    completeTech(engine, 'improved_mining');
    completeTech(engine, 'deep_mining');
    completeTech(engine, 'automated_mining');
    engine._invalidateColonyCache(colony);

    prod = engine._calcProduction(colony).production;
    assert.strictEqual(prod.minerals, 12); // 6 * 2.0
  });

  it('mining districts cost 0 jobs', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.districts = [
      { type: 'mining', disabled: false },
      { type: 'mining', disabled: false },
      { type: 'generator', disabled: false },
    ];
    engine._invalidateColonyCache(colony);

    // Without tech: 3 jobs (1 per district)
    let jobs = engine._calcJobs(colony);
    assert.strictEqual(jobs, 3);

    completeTech(engine, 'improved_mining');
    completeTech(engine, 'deep_mining');
    completeTech(engine, 'automated_mining');
    engine._invalidateColonyCache(colony);

    // With tech: 1 job (generator only — mining costs 0)
    jobs = engine._calcJobs(colony);
    assert.strictEqual(jobs, 1);
  });

  it('mining districts still produce with 0 jobs and enough pops', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.planet.type = 'barren';
    colony.districts = [
      { type: 'mining', disabled: false },
      { type: 'mining', disabled: false },
      { type: 'generator', disabled: false },
    ];
    colony.pops = 1; // only 1 pop — enough for the generator
    engine._invalidateColonyCache(colony);

    completeTech(engine, 'improved_mining');
    completeTech(engine, 'deep_mining');
    completeTech(engine, 'automated_mining');
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony).production;
    // 1 pop assigned to generator (1 job), mining districts need 0 jobs so both produce
    assert.strictEqual(prod.minerals, 24); // 2 × (6 * 2.0)
    assert.strictEqual(prod.energy, 6); // generator still works
  });

  it('mining districts with 0 pops still produce when automated', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.planet.type = 'barren';
    colony.districts = [
      { type: 'mining', disabled: false },
    ];
    colony.pops = 0;
    engine._invalidateColonyCache(colony);

    completeTech(engine, 'improved_mining');
    completeTech(engine, 'deep_mining');
    completeTech(engine, 'automated_mining');
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony).production;
    assert.strictEqual(prod.minerals, 12); // produces without pops
  });
});

// ── T3 VP Bonuses ──

describe('T3 — VP Tech Bonuses', () => {
  it('T3 techs grant +30 VP each', () => {
    const engine = makeEngine();
    const player = getPlayer(engine);

    // Complete full physics chain
    completeTech(engine, 'improved_power_plants');
    completeTech(engine, 'advanced_reactors');
    completeTech(engine, 'fusion_reactors');

    const breakdown = engine._calcVPBreakdown(player.id);
    // T1: +5, T2: +10, T3: +30 = 45 techVP
    assert.strictEqual(breakdown.techVP, 45);
  });

  it('all 9 techs grant +5+5+5 +10+10+10 +30+30+30 = 135 total techVP', () => {
    const engine = makeEngine();

    // Complete all techs
    for (const techId of Object.keys(TECH_TREE)) {
      completeTech(engine, techId);
    }

    const breakdown = engine._calcVPBreakdown(getPlayer(engine).id);
    assert.strictEqual(breakdown.techVP, 135); // 3*5 + 3*10 + 3*30
  });
});

// ── Tech Research Validation ──

describe('T3 — Research Validation', () => {
  it('cannot research T3 without completing T2 prerequisite', () => {
    const engine = makeEngine();
    const player = getPlayer(engine);

    // Try to research fusion_reactors without advanced_reactors
    completeTech(engine, 'improved_power_plants');

    const result = engine.handleCommand(player.id, { type: 'setResearch', techId: 'fusion_reactors' });
    assert.ok(result.error, 'Should return error for missing prerequisite');
    assert.ok(result.error.includes('Prerequisite'));
  });

  it('can research T3 after completing T2', () => {
    const engine = makeEngine();
    const player = getPlayer(engine);

    completeTech(engine, 'improved_power_plants');
    completeTech(engine, 'advanced_reactors');

    const result = engine.handleCommand(player.id, { type: 'setResearch', techId: 'fusion_reactors' });
    assert.ok(result.ok);
    assert.strictEqual(player.currentResearch.physics, 'fusion_reactors');
  });
});

// ── Crisis Interval Scaling ──

describe('Crisis Interval Scaling', () => {
  it('_scheduleCrisis adds +100 ticks per colony beyond 3', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    const player = getPlayer(engine);
    engine.tickCount = 1000;

    // With 1 colony (default), no extra delay
    engine._scheduleCrisis(colony);
    const tick1 = colony.nextCrisisTick;
    const minExpected1 = 1000 + CRISIS_IMMUNITY_TICKS + CRISIS_MIN_TICKS;
    const maxExpected1 = 1000 + CRISIS_IMMUNITY_TICKS + CRISIS_MAX_TICKS;
    assert.ok(tick1 >= minExpected1, `tick1 ${tick1} >= ${minExpected1}`);
    assert.ok(tick1 <= maxExpected1, `tick1 ${tick1} <= ${maxExpected1}`);

    // Add 4 more colonies (5 total) — extra delay should be (5-3)*100 = 200
    const colonyIds = engine._playerColonies.get(player.id);
    for (let i = 0; i < 4; i++) {
      const fakeId = `fake-colony-${i}`;
      colonyIds.push(fakeId);
    }

    engine._scheduleCrisis(colony);
    const tick5 = colony.nextCrisisTick;
    const minExpected5 = 1000 + CRISIS_IMMUNITY_TICKS + CRISIS_MIN_TICKS + 200;
    const maxExpected5 = 1000 + CRISIS_IMMUNITY_TICKS + CRISIS_MAX_TICKS + 200;
    assert.ok(tick5 >= minExpected5, `tick5 ${tick5} >= ${minExpected5}`);
    assert.ok(tick5 <= maxExpected5, `tick5 ${tick5} <= ${maxExpected5}`);
  });

  it('no extra delay with 3 or fewer colonies', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    engine.tickCount = 500;

    // 1 colony — no extra
    engine._scheduleCrisis(colony);
    const tick = colony.nextCrisisTick;
    const max = 500 + CRISIS_IMMUNITY_TICKS + CRISIS_MAX_TICKS;
    assert.ok(tick <= max, 'No extra delay with 1 colony');

    // Add to 3 colonies — still no extra
    const colonyIds = engine._playerColonies.get(getPlayer(engine).id);
    colonyIds.push('fake1', 'fake2');
    engine._scheduleCrisis(colony);
    const tick3 = colony.nextCrisisTick;
    assert.ok(tick3 <= max, 'No extra delay with 3 colonies');
  });

  it('4 colonies adds +100 ticks extra delay', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    engine.tickCount = 0;

    const colonyIds = engine._playerColonies.get(getPlayer(engine).id);
    colonyIds.push('fake1', 'fake2', 'fake3'); // 4 total

    engine._scheduleCrisis(colony);
    const tick = colony.nextCrisisTick;
    const minExpected = CRISIS_IMMUNITY_TICKS + CRISIS_MIN_TICKS + 100;
    assert.ok(tick >= minExpected, `4 colonies: ${tick} >= ${minExpected}`);
  });
});

// ── Tech Modifier Cache ──

describe('T3 — Tech Modifier Properties', () => {
  it('_getTechModifiers returns alloysBonus for Fusion Reactors', () => {
    const engine = makeEngine();
    const player = getPlayer(engine);

    completeTech(engine, 'improved_power_plants');
    completeTech(engine, 'advanced_reactors');
    completeTech(engine, 'fusion_reactors');

    const mods = engine._getTechModifiers(player);
    assert.strictEqual(mods.alloysBonus.generator, 1);
    assert.strictEqual(mods.district.generator, 2.0);
  });

  it('_getTechModifiers returns jobOverride for Automated Mining', () => {
    const engine = makeEngine();
    const player = getPlayer(engine);

    completeTech(engine, 'improved_mining');
    completeTech(engine, 'deep_mining');
    completeTech(engine, 'automated_mining');

    const mods = engine._getTechModifiers(player);
    assert.strictEqual(mods.jobOverride.mining, 0);
    assert.strictEqual(mods.district.mining, 2.0);
  });

  it('_getTechModifiers returns combined growth for Genetic Engineering + Frontier Medicine', () => {
    const engine = makeEngine();
    const player = getPlayer(engine);

    completeTech(engine, 'frontier_medicine');
    completeTech(engine, 'gene_crops');
    completeTech(engine, 'genetic_engineering');

    const mods = engine._getTechModifiers(player);
    assert.strictEqual(mods.growth, 0.375); // 0.75 * 0.5
    assert.strictEqual(mods.district.agriculture, 2.0);
  });
});
