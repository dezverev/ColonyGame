const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, DISTRICT_DEFS, PLANET_TYPES, MONTH_TICKS, GROWTH_BASE_TICKS, GROWTH_FAST_TICKS, GROWTH_FASTEST_TICKS } = require('../../server/game-engine');

function makeRoom(playerCount = 2) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { id: i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 1, maxPlayers: 4, status: 'playing', players };
}

describe('GameEngine — Initialization', () => {
  it('initializes with player states and starting colonies', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const state = engine.getInitState();
    assert.strictEqual(state.players.length, 2);
    assert.strictEqual(state.colonies.length, 2);
  });

  it('assigns different colors to players', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const state = engine.getState();
    const colors = state.players.map(p => p.color);
    assert.notStrictEqual(colors[0], colors[1]);
  });

  it('creates starting resources per spec', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    const p = state.players[0];
    assert.strictEqual(p.resources.energy, 100);
    assert.strictEqual(p.resources.minerals, 300);
    assert.strictEqual(p.resources.food, 100);
    assert.strictEqual(p.resources.alloys, 50);
    assert.strictEqual(p.resources.influence, 100);
    assert.deepStrictEqual(p.resources.research, { physics: 0, society: 0, engineering: 0 });
  });

  it('starting colony has 8 pops', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    assert.strictEqual(state.colonies[0].pops, 8);
  });

  it('starting colony has 4 pre-built districts', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    const colony = state.colonies[0];
    assert.strictEqual(colony.districts.length, 4);
    const types = colony.districts.map(d => d.type).sort();
    assert.deepStrictEqual(types, ['agriculture', 'agriculture', 'generator', 'mining']);
  });

  it('starting colony is on a continental planet with size 16', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    const colony = state.colonies[0];
    assert.strictEqual(colony.planet.type, 'continental');
    assert.strictEqual(colony.planet.size, 16);
    assert.strictEqual(colony.planet.habitability, 80);
  });

  it('each player gets their own colony', () => {
    const engine = new GameEngine(makeRoom(3), { tickRate: 10 });
    const state = engine.getState();
    const owners = state.colonies.map(c => c.ownerId);
    assert.strictEqual(new Set(owners).size, 3);
  });
});

describe('GameEngine — District Building', () => {
  it('builds a district with valid resources', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine.getState().colonies[0];
    const result = engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'housing' });
    assert.strictEqual(result.ok, true);

    // Check resources deducted (housing costs 100 minerals)
    const state = engine.getState();
    assert.strictEqual(state.players[0].resources.minerals, 300 - 100);

    // Check build queue
    assert.strictEqual(state.colonies[0].buildQueue.length, 1);
    assert.strictEqual(state.colonies[0].buildQueue[0].type, 'housing');
  });

  it('rejects building on another players colony', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const colony = engine.getState().colonies[0]; // player 1's colony
    const result = engine.handleCommand(2, { type: 'buildDistrict', colonyId: colony.id, districtType: 'housing' });
    assert.ok(result.error);
    assert.match(result.error, /not your/i);
  });

  it('rejects invalid district type', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine.getState().colonies[0];
    const result = engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'laserCannon' });
    assert.ok(result.error);
    assert.match(result.error, /invalid/i);
  });

  it('rejects when not enough resources', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine.getState().colonies[0];
    // Drain minerals
    engine.playerStates.get(1).resources.minerals = 0;
    const result = engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'mining' });
    assert.ok(result.error);
    assert.match(result.error, /not enough/i);
  });

  it('rejects when no district slots available', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    const colonyId = state.colonies[0].id;
    const colony = engine.colonies.get(colonyId);
    // Fill up to max (planet size 16, already have 4)
    for (let i = 0; i < 12; i++) {
      engine._addBuiltDistrict(colony, 'housing');
    }
    assert.strictEqual(engine._totalDistricts(colony), 16);
    const result = engine.handleCommand(1, { type: 'buildDistrict', colonyId, districtType: 'housing' });
    assert.ok(result.error);
    assert.match(result.error, /no district slots/i);
  });

  it('rejects when build queue is full (max 3)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine.getState().colonies[0];
    // Give plenty of resources
    engine.playerStates.get(1).resources.minerals = 10000;
    engine.playerStates.get(1).resources.energy = 10000;
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'housing' });
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'housing' });
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'housing' });
    const result = engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'housing' });
    assert.ok(result.error);
    assert.match(result.error, /queue full/i);
  });

  it('first 3 districts on a colony build at 50% time', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    // Create a fresh colony with no districts
    const colony = engine._createColony(1, 'New World', { size: 16, type: 'desert', habitability: 60 });
    engine.playerStates.get(1).resources.minerals = 10000;

    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'housing' });
    // housing buildTime is 300, 50% = 150
    assert.strictEqual(colony.buildQueue[0].ticksRemaining, 150);
  });

  it('districts after the first 3 build at full time', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colonyId = engine.getState().colonies[0].id;
    // Colony already has 4 built districts
    engine.playerStates.get(1).resources.minerals = 10000;

    engine.handleCommand(1, { type: 'buildDistrict', colonyId, districtType: 'housing' });
    const colony = engine.colonies.get(colonyId);
    // Should be full build time (300) since colony already has 3 districts
    assert.strictEqual(colony.buildQueue[0].ticksRemaining, 300);
  });
});

describe('GameEngine — Demolish', () => {
  it('demolishes an existing district', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine.getState().colonies[0];
    const districtId = colony.districts[0].id;
    const result = engine.handleCommand(1, { type: 'demolish', colonyId: colony.id, districtId });
    assert.strictEqual(result.ok, true);
    const after = engine.getState().colonies[0];
    assert.strictEqual(after.districts.length, 3); // 4 starting - 1 demolished
  });

  it('rejects demolishing on another players colony', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const colony = engine.getState().colonies[0];
    const districtId = colony.districts[0].id;
    const result = engine.handleCommand(2, { type: 'demolish', colonyId: colony.id, districtId });
    assert.ok(result.error);
  });

  it('rejects demolishing a non-existent district', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine.getState().colonies[0];
    const result = engine.handleCommand(1, { type: 'demolish', colonyId: colony.id, districtId: 'nope' });
    assert.ok(result.error);
    assert.match(result.error, /not found/i);
  });
});

describe('GameEngine — Construction Processing', () => {
  it('completes construction after buildTime ticks', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colonyId = engine.getState().colonies[0].id;
    engine.playerStates.get(1).resources.minerals = 10000;

    engine.handleCommand(1, { type: 'buildDistrict', colonyId, districtType: 'housing' });
    const colony = engine.colonies.get(colonyId);
    const buildTime = colony.buildQueue[0].ticksRemaining;

    // Tick until construction completes
    for (let i = 0; i < buildTime; i++) {
      engine._processConstruction();
    }

    assert.strictEqual(colony.buildQueue.length, 0);
    assert.strictEqual(colony.districts.length, 5); // 4 starting + 1 built
    assert.strictEqual(colony.districts[4].type, 'housing');
  });
});

describe('GameEngine — Resource Production', () => {
  it('produces resources on monthly tick', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const before = JSON.parse(JSON.stringify(engine.playerStates.get(1).resources));

    // Run exactly MONTH_TICKS ticks to trigger monthly processing
    for (let i = 0; i < MONTH_TICKS; i++) {
      engine.tick();
    }

    const after = engine.playerStates.get(1).resources;
    // Starting districts: generator(+6 energy), mining(+6 minerals), 2x agriculture(+12 food)
    // 8 pops consume 8 food, so net food = +12 - 8 = +4
    assert.strictEqual(after.energy, before.energy + 6);
    assert.strictEqual(after.minerals, before.minerals + 6);
    assert.strictEqual(after.food, before.food + 12 - 8);
  });

  it('unemployed pops produce research', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    // 4 working districts = 4 employed, 8 - 4 = 4 unemployed
    // Each unemployed pop produces 1 of each research type

    for (let i = 0; i < MONTH_TICKS; i++) {
      engine.tick();
    }

    const after = engine.playerStates.get(1).resources;
    assert.strictEqual(after.research.physics, 4);
    assert.strictEqual(after.research.society, 4);
    assert.strictEqual(after.research.engineering, 4);
  });

  it('does not produce resources before a full month', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const before = JSON.parse(JSON.stringify(engine.playerStates.get(1).resources));

    // Run 99 ticks (not enough for a month)
    for (let i = 0; i < MONTH_TICKS - 1; i++) {
      engine.tick();
    }

    const after = engine.playerStates.get(1).resources;
    assert.strictEqual(after.energy, before.energy);
    assert.strictEqual(after.minerals, before.minerals);
  });
});

describe('GameEngine — Population', () => {
  it('pop dies when food deficit', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    // Set food to very negative so it stays negative after monthly production (+4 net)
    engine.playerStates.get(1).resources.food = -10;

    for (let i = 0; i < MONTH_TICKS; i++) {
      engine.tick();
    }

    const colony = Array.from(engine.colonies.values())[0];
    // Should have lost a pop (food was -10, +4 net = -6, still negative at month end)
    assert.ok(colony.pops < 8);
  });

  it('pops do not go below 1', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    colony.pops = 1;
    engine.playerStates.get(1).resources.food = -100;

    for (let i = 0; i < MONTH_TICKS; i++) {
      engine.tick();
    }

    assert.strictEqual(colony.pops, 1);
  });
});

describe('GameEngine — Pop Growth', () => {
  it('pop grows after GROWTH_BASE_TICKS when food surplus > 0', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    // Starting: 8 pops, 10 housing — 2 slots for growth

    for (let i = 0; i < GROWTH_BASE_TICKS; i++) {
      engine.tick();
    }

    assert.strictEqual(colony.pops, 9, 'Should have grown 1 pop after base growth ticks');
    assert.strictEqual(colony.growthProgress, 0, 'Growth progress should reset after pop added');
  });

  it('no growth before reaching growth threshold', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];

    for (let i = 0; i < GROWTH_BASE_TICKS - 1; i++) {
      engine.tick();
    }

    assert.strictEqual(colony.pops, 8, 'Should not have grown before threshold');
    assert.strictEqual(colony.growthProgress, GROWTH_BASE_TICKS - 1);
  });

  it('growth is blocked by housing cap', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    // Set pops to housing cap (10) to test blocking
    colony.pops = 10;
    engine._invalidateColonyCache(colony);

    for (let i = 0; i < GROWTH_BASE_TICKS; i++) {
      engine.tick();
    }

    assert.strictEqual(colony.pops, 10, 'Pops should not exceed housing');
    assert.strictEqual(colony.growthProgress, 0, 'Growth progress should not accumulate at housing cap');
  });

  it('faster growth with food surplus > 5', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    // Starting surplus = 12 - 8 = 4. Need surplus > 5 for FAST rate.
    // Add 1 agriculture: production = 18, consumption = 8, surplus = 10 (> 5, ≤ 10) → FAST
    engine._addBuiltDistrict(colony, 'agriculture');
    engine._invalidateColonyCache(colony);

    for (let i = 0; i < GROWTH_FAST_TICKS; i++) {
      engine.tick();
    }

    assert.strictEqual(colony.pops, 9, 'Should grow at fast rate with surplus > 5');
  });

  it('fastest growth with food surplus > 10', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    // Add 2 more agriculture: production = 24, consumption = 8, surplus = 16 > 10 → fastest
    engine._addBuiltDistrict(colony, 'agriculture');
    engine._addBuiltDistrict(colony, 'agriculture');
    engine._invalidateColonyCache(colony);

    for (let i = 0; i < GROWTH_FASTEST_TICKS; i++) {
      engine.tick();
    }

    assert.strictEqual(colony.pops, 9, 'Should grow at fastest rate with surplus > 10');
  });

  it('no growth when food surplus is 0 or negative', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    engine._addBuiltDistrict(colony, 'housing'); // need housing to isolate test
    // Remove all agriculture to create food deficit
    colony.districts = colony.districts.filter(d => d.type !== 'agriculture');
    engine._invalidateColonyCache(colony);

    for (let i = 0; i < GROWTH_BASE_TICKS; i++) {
      engine.tick();
    }

    assert.strictEqual(colony.pops, 8, 'No growth when food surplus <= 0');
    assert.strictEqual(colony.growthProgress, 0);
  });

  it('starvation resets growth progress', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    engine._addBuiltDistrict(colony, 'housing');
    // Accumulate some growth progress
    colony.growthProgress = 50;
    // Set food to negative to trigger starvation
    engine.playerStates.get(1).resources.food = -100;

    // Run one month
    for (let i = 0; i < MONTH_TICKS; i++) {
      engine.tick();
    }

    assert.strictEqual(colony.growthProgress, 0, 'Growth progress should reset on starvation');
  });

  it('growthProgress is included in serialized state', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    assert.strictEqual(state.colonies[0].growthProgress, 0);
  });
});

describe('GameEngine — State Serialization', () => {
  it('getState includes production data per colony', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    const colony = state.colonies[0];
    assert.ok(colony.production);
    assert.ok(colony.production.production);
    assert.ok(colony.production.consumption);
    assert.strictEqual(colony.production.production.energy, 6); // generator
    assert.strictEqual(colony.production.production.minerals, 6); // mining
    assert.strictEqual(colony.production.production.food, 12); // 2x agriculture
  });

  it('getState includes housing and jobs', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    const colony = state.colonies[0];
    assert.strictEqual(colony.housing, 10); // base housing from capital (no housing districts)
    assert.strictEqual(colony.jobs, 4); // 4 working districts (gen, mining, 2x agri)
  });
});

describe('GameEngine — Tick Loop', () => {
  it('start/stop tick loop', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 100 });
    engine.start();
    assert.ok(engine.tickInterval);
    engine.stop();
    assert.strictEqual(engine.tickInterval, null);
  });

  it('tick increments tickCount', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    assert.strictEqual(engine.tickCount, 0);
    engine.tick();
    assert.strictEqual(engine.tickCount, 1);
  });
});

describe('GameEngine — Energy Balance', () => {
  it('generator produces 6 energy per month', () => {
    assert.strictEqual(DISTRICT_DEFS.generator.produces.energy, 6);
  });

  it('industrial consumes 3 energy per month (not 50)', () => {
    assert.strictEqual(DISTRICT_DEFS.industrial.consumes.energy, 3);
  });

  it('research consumes 4 energy per month (not 100)', () => {
    assert.strictEqual(DISTRICT_DEFS.research.consumes.energy, 4);
  });

  it('housing consumes 1 energy per month', () => {
    assert.strictEqual(DISTRICT_DEFS.housing.consumes.energy, 1);
  });

  it('industrial build cost has no energy requirement', () => {
    assert.strictEqual(DISTRICT_DEFS.industrial.cost.energy, undefined);
  });

  it('research build cost is 20 energy (not 100)', () => {
    assert.strictEqual(DISTRICT_DEFS.research.cost.energy, 20);
  });

  it('housing district energy consumption is applied in production calc', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colonyId = engine.getState().colonies[0].id;
    const colony = engine.colonies.get(colonyId);
    engine._addBuiltDistrict(colony, 'housing');

    const { consumption } = engine._calcProduction(colony);
    // Housing consumes 1 energy, no other districts consume energy in starting setup
    assert.strictEqual(consumption.energy, 1);
  });

  it('one generator can power two industrials (6 energy vs 3+3)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine._createColony(1, 'Test', { size: 16, type: 'continental', habitability: 80 });
    engine._addBuiltDistrict(colony, 'generator');
    engine._addBuiltDistrict(colony, 'industrial');
    engine._addBuiltDistrict(colony, 'industrial');
    colony.pops = 10;

    const { production, consumption } = engine._calcProduction(colony);
    // Generator: +6 energy, 2 industrials: -6 energy = net 0
    assert.strictEqual(production.energy, 6);
    assert.strictEqual(consumption.energy, 6);
  });
});

describe('GameEngine — Food & Housing Balance', () => {
  it('starting colony food production exceeds consumption (no deficit)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine.getState().colonies[0];
    const { production, consumption } = colony.production;
    // 2 agriculture = 12 food, 8 pops consume 8 food => net +4
    assert.ok(production.food > consumption.food,
      `Food production (${production.food}) should exceed consumption (${consumption.food})`);
  });

  it('starting colony housing accommodates all starting pops', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine.getState().colonies[0];
    // Base housing = 10, starting pops = 8 — 2 slots for natural growth
    assert.ok(colony.housing >= colony.pops,
      `Housing (${colony.housing}) should be >= pops (${colony.pops})`);
  });

  it('starting pops are 2 below housing cap for natural growth', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine.getState().colonies[0];
    assert.strictEqual(colony.housing - colony.pops, 2,
      'Should start 2 below housing cap to allow 2 growth cycles before housing constrains');
  });

  it('starting food surplus is +4 (12 production - 8 consumption)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine.getState().colonies[0];
    const { production, consumption } = colony.production;
    assert.strictEqual(production.food - consumption.food, 4);
  });

  it('base capital housing is 10', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    // Colony with no housing districts should have base housing of 10
    const colony = engine._createColony(1, 'Bare', { size: 16, type: 'continental', habitability: 80 });
    assert.strictEqual(engine._calcHousing(colony), 10);
  });

  it('food surplus grows over multiple months', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const before = engine.playerStates.get(1).resources.food;

    // Run 3 months (300 ticks, no pop growth yet since GROWTH_BASE_TICKS = 400)
    for (let i = 0; i < MONTH_TICKS * 3; i++) {
      engine.tick();
    }

    const after = engine.playerStates.get(1).resources.food;
    // Net +4 food/month × 3 months = +12
    assert.strictEqual(after, before + 12);
  });
});

describe('GameEngine — Mineral Pacing Balance', () => {
  it('mining district produces 6 minerals per month (not 4)', () => {
    assert.strictEqual(DISTRICT_DEFS.mining.produces.minerals, 6);
  });

  it('mining district costs 100 minerals (same as agriculture/housing)', () => {
    assert.strictEqual(DISTRICT_DEFS.mining.cost.minerals, 100);
    assert.strictEqual(DISTRICT_DEFS.agriculture.cost.minerals, 100);
    assert.strictEqual(DISTRICT_DEFS.housing.cost.minerals, 100);
  });

  it('starting minerals are 300 (not 200)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    assert.strictEqual(state.players[0].resources.minerals, 300);
  });

  it('starting minerals allow 3 immediate district builds at 100 each', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine.getState().colonies[0];
    // Build 3 mining districts at 100 each = 300 minerals
    const r1 = engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'mining' });
    assert.strictEqual(r1.ok, true);
    const r2 = engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'mining' });
    assert.strictEqual(r2.ok, true);
    const r3 = engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'mining' });
    assert.strictEqual(r3.ok, true);
    assert.strictEqual(engine.playerStates.get(1).resources.minerals, 0);
  });

  it('mining income funds a new mining district every ~17 seconds (100 cost / 6 per month)', () => {
    // At 6 minerals/month (10 seconds), cost 100 minerals takes ~167 seconds ≈ 2.8 minutes
    // With 2 mining districts (12/month), cost 100 takes ~83 seconds
    // This is significantly better than the old 4/month which took 37.5 seconds per mining build
    const monthlyIncome = DISTRICT_DEFS.mining.produces.minerals;
    const cost = DISTRICT_DEFS.mining.cost.minerals;
    const monthsToFund = cost / monthlyIncome;
    // Single mine: 100/6 ≈ 16.7 months. Old was 100/4 = 37.5 months (at old 150 cost).
    // Actually old was 150/4 = 37.5. New is 100/6 = 16.7. ~2.2x faster.
    assert.ok(monthsToFund < 20, `Should fund a mining district in under 20 months, got ${monthsToFund.toFixed(1)}`);
  });
});

describe('DISTRICT_DEFS', () => {
  it('has all 6 district types', () => {
    const expected = ['housing', 'generator', 'mining', 'agriculture', 'industrial', 'research'];
    for (const type of expected) {
      assert.ok(DISTRICT_DEFS[type], `Missing district def: ${type}`);
    }
  });

  it('all districts have required fields', () => {
    for (const [type, def] of Object.entries(DISTRICT_DEFS)) {
      assert.ok('produces' in def, `${type} missing produces`);
      assert.ok('consumes' in def, `${type} missing consumes`);
      assert.ok('cost' in def, `${type} missing cost`);
      assert.ok(Number.isFinite(def.buildTime), `${type} missing buildTime`);
      assert.ok(Number.isFinite(def.housing), `${type} missing housing`);
      assert.ok(Number.isFinite(def.jobs), `${type} missing jobs`);
    }
  });
});

describe('Generator cost parity', () => {
  it('generator costs 100 minerals — same as housing, mining, agriculture', () => {
    const basicDistricts = ['housing', 'generator', 'mining', 'agriculture'];
    for (const type of basicDistricts) {
      assert.strictEqual(DISTRICT_DEFS[type].cost.minerals, 100, `${type} should cost 100 minerals`);
    }
  });

  it('tier 2 districts (industrial, research) cost 200 minerals', () => {
    assert.strictEqual(DISTRICT_DEFS.industrial.cost.minerals, 200);
    assert.strictEqual(DISTRICT_DEFS.research.cost.minerals, 200);
  });

  it('player can build 3 generators with 300 starting minerals', () => {
    const players = new Map();
    players.set(1, { id: 1, name: 'P1', ready: true, isHost: true });
    const room = { id: 'r', name: 'R', hostId: 1, maxPlayers: 2, status: 'playing', players };
    const engine = new GameEngine(room);
    const colony = engine.colonies.values().next().value;

    const r1 = engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'generator' });
    const r2 = engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'generator' });
    const r3 = engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'generator' });
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r3.ok, true);
    assert.strictEqual(engine.playerStates.get(1).resources.minerals, 0);
  });
});

describe('PLANET_TYPES', () => {
  it('has habitability values for all types', () => {
    const expected = ['continental', 'ocean', 'tropical', 'arctic', 'desert', 'arid', 'barren', 'molten', 'gasGiant'];
    for (const type of expected) {
      assert.ok(PLANET_TYPES[type], `Missing planet type: ${type}`);
      assert.ok(Number.isFinite(PLANET_TYPES[type].habitability), `${type} missing habitability`);
    }
  });

  it('habitable types have habitability >= 60', () => {
    for (const type of ['continental', 'ocean', 'tropical', 'arctic', 'desert', 'arid']) {
      assert.ok(PLANET_TYPES[type].habitability >= 60, `${type} should be habitable`);
    }
  });

  it('uninhabitable types have habitability 0', () => {
    for (const type of ['barren', 'molten', 'gasGiant']) {
      assert.strictEqual(PLANET_TYPES[type].habitability, 0, `${type} should be uninhabitable`);
    }
  });
});

describe('GameEngine — Performance', () => {
  it('tick completes within 50ms budget (8 players, 8 colonies each)', () => {
    // Create a high-load scenario: 8 players, each with multiple colonies
    const players = new Map();
    for (let i = 1; i <= 8; i++) {
      players.set(i, { id: i, name: `Player${i}`, ready: true, isHost: i === 1 });
    }
    const room = { id: 'perf', name: 'Perf', hostId: 1, maxPlayers: 8, status: 'playing', players };
    const engine = new GameEngine(room, { tickRate: 10 });

    // Add 7 more colonies per player (8 total each = 64 colonies)
    for (let i = 1; i <= 8; i++) {
      for (let c = 0; c < 7; c++) {
        const colony = engine._createColony(i, `Colony ${i}-${c}`, { size: 16, type: 'continental', habitability: 80 });
        engine._addBuiltDistrict(colony, 'generator');
        engine._addBuiltDistrict(colony, 'mining');
        engine._addBuiltDistrict(colony, 'agriculture');
        engine._addBuiltDistrict(colony, 'industrial');
        engine._addBuiltDistrict(colony, 'research');
      }
    }

    // Warm up
    engine.tick();

    // Measure 100 ticks (includes a monthly cycle)
    const start = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) {
      engine._dirty = true; // force state serialization every tick for worst-case
      engine._cachedStateJSON = null;
      engine.tick();
    }
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const avgTickMs = durationMs / 100;

    assert.ok(avgTickMs < 50, `Average tick took ${avgTickMs.toFixed(2)}ms, budget is 50ms`);
  });

  it('getState payload is under 10KB for typical game', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const state = engine.getState();
    const json = JSON.stringify(state);
    const sizeKB = Buffer.byteLength(json) / 1024;

    assert.ok(sizeKB < 10, `State payload is ${sizeKB.toFixed(2)}KB, target is <10KB`);
  });

  it('getState serialization completes under 5ms', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });

    // Warm up
    engine.getState();
    engine._cachedState = null;

    const start = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) {
      engine._cachedState = null; // force recalculation
      JSON.stringify(engine.getState());
    }
    const avgMs = Number(process.hrtime.bigint() - start) / 1e6 / 100;

    assert.ok(avgMs < 5, `Serialization took ${avgMs.toFixed(2)}ms avg, target is <5ms`);
  });

  it('skips broadcast on clean ticks (dirty flag)', () => {
    let broadcastCount = 0;
    const engine = new GameEngine(makeRoom(1), {
      tickRate: 10,
      onTick: () => { broadcastCount++; },
    });

    // First tick should broadcast (dirty from init)
    engine.tick();
    assert.strictEqual(broadcastCount, 1);

    // Subsequent ticks with no changes should not broadcast
    engine.tick();
    engine.tick();
    engine.tick();
    assert.strictEqual(broadcastCount, 1, 'Should not broadcast when state is clean');

    // Command should trigger broadcast on next tick
    const colony = engine.getState().colonies[0];
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'housing' });
    engine.tick();
    assert.strictEqual(broadcastCount, 2, 'Should broadcast after command');
  });

  it('getState payload scales linearly and stays reasonable at 64 colonies', () => {
    const players = new Map();
    for (let i = 1; i <= 8; i++) {
      players.set(i, { id: i, name: `P${i}`, ready: true, isHost: i === 1 });
    }
    const room = { id: 'scale', name: 'Scale', hostId: 1, maxPlayers: 8, status: 'playing', players };
    const engine = new GameEngine(room, { tickRate: 10 });
    for (let i = 1; i <= 8; i++) {
      for (let c = 0; c < 7; c++) {
        const col = engine._createColony(i, `C${i}-${c}`, { size: 16, type: 'continental', habitability: 80 });
        for (const t of ['generator', 'mining', 'agriculture', 'industrial', 'research', 'housing'])
          engine._addBuiltDistrict(col, t);
      }
    }
    const json = JSON.stringify(engine.getState());
    const sizeKB = Buffer.byteLength(json) / 1024;
    // 64 colonies with 6 districts each should stay under 50KB
    assert.ok(sizeKB < 50, `64-colony payload is ${sizeKB.toFixed(1)}KB, limit 50KB`);
  });

  it('getStateJSON caches pre-stringified broadcast payload', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });

    const json1 = engine.getStateJSON();
    const json2 = engine.getStateJSON();
    assert.strictEqual(json1, json2, 'Should return same cached string');

    // Verify it includes the type field
    const parsed = JSON.parse(json1);
    assert.strictEqual(parsed.type, 'gameState');
    assert.ok(parsed.players);
    assert.ok(parsed.colonies);

    // After a state change, should return a different string
    const colony = engine.getState().colonies[0];
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'housing' });
    const json3 = engine.getStateJSON();
    assert.notStrictEqual(json1, json3, 'Should return new string after state change');
  });

  it('onTick receives pre-stringified JSON', () => {
    let receivedPayload = null;
    const engine = new GameEngine(makeRoom(1), {
      tickRate: 10,
      onTick: (payload) => { receivedPayload = payload; },
    });

    engine.tick();
    assert.strictEqual(typeof receivedPayload, 'string', 'onTick should receive a string');
    const parsed = JSON.parse(receivedPayload);
    assert.strictEqual(parsed.type, 'gameState');
  });

  it('caches production calculations between calls', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];

    const result1 = engine._calcProduction(colony);
    const result2 = engine._calcProduction(colony);
    assert.strictEqual(result1, result2, 'Should return same cached object');

    // Invalidate and check new object
    engine._invalidateColonyCache(colony);
    const result3 = engine._calcProduction(colony);
    assert.notStrictEqual(result1, result3, 'Should return new object after invalidation');
    assert.deepStrictEqual(result1, result3, 'Values should still match');
  });
});
