const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, DISTRICT_DEFS, TECH_TREE, MONTH_TICKS,
  GROWTH_BASE_TICKS, GROWTH_FAST_TICKS, GROWTH_FASTEST_TICKS } = require('../../server/game-engine');

function makeRoom(playerCount = 1) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { id: i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 1, maxPlayers: 4, status: 'playing', players };
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

function completeTech(engine, techId) {
  const player = getPlayer(engine);
  player.completedTechs.push(techId);
  engine._techModCache.delete(player.id);
  const colonyIds = engine._playerColonies.get(player.id) || [];
  for (const cid of colonyIds) {
    const c = engine.colonies.get(cid);
    if (c) engine._invalidateColonyCache(c);
  }
}

function completeAllPrereqs(engine, trackTechs) {
  for (const techId of trackTechs) {
    completeTech(engine, techId);
  }
}

// ── All T3 Techs Combined ──

describe('T3 — All Three Combined', () => {
  it('all three T3 techs active simultaneously apply correct bonuses', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.planet.type = 'barren';
    colony.districts = [
      { type: 'generator', disabled: false },
      { type: 'mining', disabled: false },
      { type: 'agriculture', disabled: false },
    ];
    colony.pops = 8;

    // Complete all 9 techs
    for (const techId of Object.keys(TECH_TREE)) {
      completeTech(engine, techId);
    }
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony).production;
    // Generator: 6 * 2.0 = 12 energy + 1 alloy bonus
    assert.strictEqual(prod.energy, 12);
    assert.strictEqual(prod.alloys, 1);
    // Mining: 6 * 2.0 = 12 minerals (0 jobs)
    assert.strictEqual(prod.minerals, 12);
    // Agriculture: 6 * 2.0 = 12 food
    assert.strictEqual(prod.food, 12);
  });

  it('with all T3 techs, mining uses 0 jobs so more pops available for other districts', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.planet.type = 'barren';
    colony.districts = [
      { type: 'mining', disabled: false },
      { type: 'mining', disabled: false },
      { type: 'generator', disabled: false },
      { type: 'agriculture', disabled: false },
    ];
    colony.pops = 2; // Only 2 pops — without T3 only 2 of 4 districts work

    for (const techId of Object.keys(TECH_TREE)) {
      completeTech(engine, techId);
    }
    engine._invalidateColonyCache(colony);

    // Jobs: generator=1, agriculture=1, mining=0×2 = 2 total jobs
    const jobs = engine._calcJobs(colony);
    assert.strictEqual(jobs, 2);

    const prod = engine._calcProduction(colony).production;
    // 2 pops fill generator + agriculture; mining is automated
    assert.strictEqual(prod.minerals, 24); // 2 mining × 6 × 2.0
    assert.strictEqual(prod.energy, 12);   // 1 generator × 6 × 2.0
    assert.strictEqual(prod.food, 12);     // 1 agriculture × 6 × 2.0
  });
});

// ── Fusion Reactors + Industrial Alloy Stacking ──

describe('T3 — Fusion Alloy Bonus + Industrial Alloys', () => {
  it('fusion alloy bonus stacks with industrial district alloys', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.planet.type = 'barren';
    colony.districts = [
      { type: 'generator', disabled: false },
      { type: 'industrial', disabled: false },
    ];
    colony.pops = 8;

    completeAllPrereqs(engine, ['improved_power_plants', 'advanced_reactors', 'fusion_reactors']);
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony).production;
    // Industrial: 4 alloys (no tech multiplier for industrial)
    // Generator: +1 alloy from fusion bonus
    assert.strictEqual(prod.alloys, 5); // 4 + 1
    assert.strictEqual(prod.energy, 12); // 6 × 2.0
  });

  it('multiple generators each contribute alloy bonus independently', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.planet.type = 'barren';
    colony.districts = [
      { type: 'generator', disabled: false },
      { type: 'generator', disabled: false },
      { type: 'generator', disabled: false },
    ];
    colony.pops = 8;

    completeAllPrereqs(engine, ['improved_power_plants', 'advanced_reactors', 'fusion_reactors']);
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony).production;
    assert.strictEqual(prod.alloys, 3); // 3 generators × 1 alloy each
    assert.strictEqual(prod.energy, 36); // 3 × 6 × 2.0
  });
});

// ── T3 + Planet Type Bonuses ──

describe('T3 — Planet Bonus Interaction', () => {
  it('fusion reactors on arid planet: energy bonus is additive with tech multiplier', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.planet.type = 'arid'; // arid: generator +1 energy
    colony.districts = [{ type: 'generator', disabled: false }];
    colony.pops = 8;

    completeAllPrereqs(engine, ['improved_power_plants', 'advanced_reactors', 'fusion_reactors']);
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony).production;
    // Base 6 × 2.0 multiplier = 12, + 1 planet bonus (additive) = 13
    assert.strictEqual(prod.energy, 13);
    assert.strictEqual(prod.alloys, 1); // fusion alloy bonus
  });

  it('automated mining on desert planet: mineral bonus is additive with tech multiplier', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.planet.type = 'desert'; // desert: mining +2 minerals
    colony.districts = [{ type: 'mining', disabled: false }];
    colony.pops = 8;

    completeAllPrereqs(engine, ['improved_mining', 'deep_mining', 'automated_mining']);
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony).production;
    // Base 6 × 2.0 = 12, + 2 planet bonus = 14
    assert.strictEqual(prod.minerals, 14);
  });

  it('genetic engineering on tropical planet: food bonus is additive with tech multiplier', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.planet.type = 'tropical'; // tropical: agriculture +2 food
    colony.districts = [{ type: 'agriculture', disabled: false }];
    colony.pops = 8;

    completeAllPrereqs(engine, ['frontier_medicine', 'gene_crops', 'genetic_engineering']);
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony).production;
    // Base 6 × 2.0 = 12, + 2 planet bonus = 14
    assert.strictEqual(prod.food, 14);
  });
});

// ── Genetic Engineering Pop Growth Integration ──

describe('T3 — Genetic Engineering Pop Growth', () => {
  it('pop growth target is halved by genetic engineering modifier', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.pops = 5;
    colony.growthProgress = 0;

    // Give plenty of food surplus
    colony.districts = [
      { type: 'agriculture', disabled: false },
      { type: 'agriculture', disabled: false },
      { type: 'agriculture', disabled: false },
    ];

    completeAllPrereqs(engine, ['frontier_medicine', 'gene_crops', 'genetic_engineering']);
    engine._invalidateColonyCache(colony);

    // Growth modifier: 0.75 * 0.5 = 0.375
    const mods = engine._getTechModifiers(getPlayer(engine));
    assert.strictEqual(mods.growth, 0.375);

    // Base growth target with low surplus (<=5 food): GROWTH_BASE_TICKS
    // Modified: floor(GROWTH_BASE_TICKS * 0.375)
    const expectedTarget = Math.floor(GROWTH_BASE_TICKS * 0.375);
    assert.ok(expectedTarget > 0, 'Growth target should be positive');
    assert.ok(expectedTarget < GROWTH_BASE_TICKS, 'Growth target should be shorter than base');
  });

  it('pop grows after modified tick count via _processPopGrowth', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.planet.type = 'barren';
    colony.pops = 3;
    colony.growthProgress = 0;

    // Lots of food to ensure surplus
    colony.districts = [
      { type: 'agriculture', disabled: false },
      { type: 'agriculture', disabled: false },
      { type: 'agriculture', disabled: false },
    ];

    completeAllPrereqs(engine, ['frontier_medicine', 'gene_crops', 'genetic_engineering']);
    engine._invalidateColonyCache(colony);

    const { production, consumption } = engine._calcProduction(colony);
    const foodSurplus = production.food - consumption.food;
    assert.ok(foodSurplus > 0, 'Should have food surplus for growth');

    // Determine expected growth target
    let baseTarget;
    if (foodSurplus > 10) baseTarget = GROWTH_FASTEST_TICKS;
    else if (foodSurplus > 5) baseTarget = GROWTH_FAST_TICKS;
    else baseTarget = GROWTH_BASE_TICKS;
    const modifiedTarget = Math.floor(baseTarget * 0.375);

    // Tick until just before pop should grow
    const initialPops = colony.pops;
    for (let i = 0; i < modifiedTarget - 1; i++) {
      engine._processPopGrowth();
    }
    assert.strictEqual(colony.pops, initialPops, 'Pop should not grow before target');

    // One more tick should trigger growth
    engine._processPopGrowth();
    assert.strictEqual(colony.pops, initialPops + 1, 'Pop should grow at modified target');
  });
});

// ── Automated Mining District Order Independence ──

describe('T3 — Automated Mining Pop Assignment', () => {
  it('mining after non-mining: pop-limited colony still produces from automated mining', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.planet.type = 'barren';
    // Generator first (needs pop), then mining (automated, no pop needed)
    colony.districts = [
      { type: 'generator', disabled: false },
      { type: 'mining', disabled: false },
      { type: 'mining', disabled: false },
    ];
    colony.pops = 1; // Only 1 pop for the generator

    completeAllPrereqs(engine, ['improved_mining', 'deep_mining', 'automated_mining']);
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony).production;
    assert.strictEqual(prod.energy, 6); // 1 generator works (1 pop)
    assert.strictEqual(prod.minerals, 24); // 2 mining × 6 × 2.0, no pops needed
  });

  it('only mining districts get 0 jobs, other district types unaffected', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.districts = [
      { type: 'generator', disabled: false },
      { type: 'agriculture', disabled: false },
      { type: 'mining', disabled: false },
      { type: 'industrial', disabled: false },
    ];

    completeAllPrereqs(engine, ['improved_mining', 'deep_mining', 'automated_mining']);
    engine._invalidateColonyCache(colony);

    // Mining: 0 jobs, others: 1 each
    const jobs = engine._calcJobs(colony);
    assert.strictEqual(jobs, 3); // generator + agriculture + industrial (mining = 0)
  });
});

// ── T3 Tech Cache Invalidation ──

describe('T3 — Cache Invalidation', () => {
  it('completing T3 tech invalidates production cache', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.planet.type = 'barren';
    colony.districts = [{ type: 'generator', disabled: false }];
    colony.pops = 8;
    engine._invalidateColonyCache(colony);

    // First calc — populates cache
    const prod1 = engine._calcProduction(colony).production;
    assert.strictEqual(prod1.energy, 6);

    // Complete T3 physics chain — should invalidate cache
    completeAllPrereqs(engine, ['improved_power_plants', 'advanced_reactors', 'fusion_reactors']);

    // Second calc — should reflect new tech
    const prod2 = engine._calcProduction(colony).production;
    assert.strictEqual(prod2.energy, 12);
  });

  it('tech modifier cache updates when new tech is completed', () => {
    const engine = makeEngine();
    const player = getPlayer(engine);

    // Get initial modifiers (no techs)
    const mods1 = engine._getTechModifiers(player);
    assert.deepStrictEqual(mods1.alloysBonus, {});
    assert.deepStrictEqual(mods1.jobOverride, {});

    // Complete fusion reactors chain
    completeTech(engine, 'improved_power_plants');
    completeTech(engine, 'advanced_reactors');
    completeTech(engine, 'fusion_reactors');

    const mods2 = engine._getTechModifiers(player);
    assert.strictEqual(mods2.alloysBonus.generator, 1);
    assert.strictEqual(mods2.district.generator, 2.0);
  });
});

// ── T3 in Serialized State ──

describe('T3 — Serialized Game State', () => {
  it('getPlayerStateJSON reflects T3 production bonuses', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.planet.type = 'barren';
    colony.districts = [
      { type: 'generator', disabled: false },
      { type: 'mining', disabled: false },
    ];
    colony.pops = 8;

    completeAllPrereqs(engine, [
      'improved_power_plants', 'advanced_reactors', 'fusion_reactors',
      'improved_mining', 'deep_mining', 'automated_mining',
    ]);
    engine._invalidateColonyCache(colony);
    engine._invalidateStateCache();

    const json = engine.getPlayerStateJSON(1);
    const state = JSON.parse(json);

    // Find our colony in the state (serialized as netProduction)
    const colonyState = state.colonies.find(c => c.id === colony.id);
    assert.ok(colonyState, 'Colony should be in serialized state');

    // netProduction should reflect T3 bonuses
    assert.strictEqual(colonyState.netProduction.energy, 12); // 6 × 2.0
    assert.strictEqual(colonyState.netProduction.minerals, 12); // 6 × 2.0
    assert.strictEqual(colonyState.netProduction.alloys, 1); // fusion alloy bonus
  });

  it('completedTechs includes T3 techs in serialized state', () => {
    const engine = makeEngine();
    completeAllPrereqs(engine, [
      'improved_power_plants', 'advanced_reactors', 'fusion_reactors',
    ]);
    engine._invalidateStateCache();

    const json = engine.getPlayerStateJSON(1);
    const state = JSON.parse(json);
    const me = state.players.find(p => p.id === 1);

    assert.ok(me.completedTechs.includes('fusion_reactors'), 'Should include T3 tech');
    assert.ok(me.completedTechs.includes('advanced_reactors'), 'Should include T2 tech');
  });
});

// ── Crisis Scaling Edge Cases ──

describe('Crisis Scaling — Edge Cases', () => {
  it('_scheduleCrisis with orphaned colony (no player colonies entry) uses 0 count', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    engine.tickCount = 100;

    // Remove the player from _playerColonies to simulate orphan
    engine._playerColonies.delete(colony.ownerId);

    // Should not throw — falls back to []
    engine._scheduleCrisis(colony);
    assert.ok(colony.nextCrisisTick > engine.tickCount, 'Should still schedule a crisis');
  });

  it('_scheduleCrisis with large colony count scales linearly', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    engine.tickCount = 0;

    const colonyIds = engine._playerColonies.get(getPlayer(engine).id);
    // Add 9 more colonies (10 total)
    for (let i = 0; i < 9; i++) colonyIds.push(`fake-${i}`);

    engine._scheduleCrisis(colony);
    // Extra delay: (10 - 3) * 100 = 700 ticks
    const { CRISIS_IMMUNITY_TICKS, CRISIS_MIN_TICKS } = require('../../server/game-engine');
    const minExpected = CRISIS_IMMUNITY_TICKS + CRISIS_MIN_TICKS + 700;
    assert.ok(colony.nextCrisisTick >= minExpected,
      `10 colonies: ${colony.nextCrisisTick} >= ${minExpected}`);
  });
});

// ── T3 Research via handleCommand ──

describe('T3 — Research Command Edge Cases', () => {
  it('cannot research already-completed T3 tech', () => {
    const engine = makeEngine();
    const player = getPlayer(engine);

    completeAllPrereqs(engine, ['improved_power_plants', 'advanced_reactors', 'fusion_reactors']);

    const result = engine.handleCommand(player.id, { type: 'setResearch', techId: 'fusion_reactors' });
    assert.ok(result.error, 'Should reject already-completed tech');
  });

  it('cannot research T3 tech from a different track without its own prereqs', () => {
    const engine = makeEngine();
    const player = getPlayer(engine);

    // Complete physics chain — does NOT unlock engineering T3
    completeAllPrereqs(engine, ['improved_power_plants', 'advanced_reactors']);

    const result = engine.handleCommand(player.id, { type: 'setResearch', techId: 'automated_mining' });
    assert.ok(result.error, 'Should reject T3 from different track without prereqs');
  });

  it('can research all three T3 techs when all prereqs are met', () => {
    const engine = makeEngine();
    const player = getPlayer(engine);

    // Complete all T1+T2 techs
    completeAllPrereqs(engine, [
      'improved_power_plants', 'advanced_reactors',
      'frontier_medicine', 'gene_crops',
      'improved_mining', 'deep_mining',
    ]);

    for (const t3 of ['fusion_reactors', 'genetic_engineering', 'automated_mining']) {
      const result = engine.handleCommand(player.id, { type: 'setResearch', techId: t3 });
      assert.ok(result.ok, `Should allow researching ${t3}`);
    }
  });
});

// ── T3 Techs Unemployed Pop Interaction ──

describe('T3 — Unemployed Pop Research Output', () => {
  it('automated mining frees pops who become unemployed and generate research', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.planet.type = 'barren';
    colony.districts = [
      { type: 'mining', disabled: false },
      { type: 'mining', disabled: false },
    ];
    colony.pops = 3; // 3 pops, normally 2 jobs from mining

    engine._invalidateColonyCache(colony);

    // Without tech: 2 jobs, 1 unemployed → 1 research each type
    let prod = engine._calcProduction(colony).production;
    assert.strictEqual(prod.physics, 1);

    completeAllPrereqs(engine, ['improved_mining', 'deep_mining', 'automated_mining']);
    engine._invalidateColonyCache(colony);

    // With tech: 0 jobs, 3 unemployed → 3 research each type
    prod = engine._calcProduction(colony).production;
    assert.strictEqual(prod.physics, 3);
    assert.strictEqual(prod.society, 3);
    assert.strictEqual(prod.engineering, 3);
    // Mining still produces
    assert.strictEqual(prod.minerals, 24); // 2 × 6 × 2.0
  });
});
