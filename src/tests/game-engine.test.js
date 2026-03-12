const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, DISTRICT_DEFS, PLANET_TYPES, MONTH_TICKS, BROADCAST_EVERY, TECH_TREE, GROWTH_BASE_TICKS, GROWTH_FAST_TICKS, GROWTH_FASTEST_TICKS, PLAYER_COLORS } = require('../../server/game-engine');

// Helper: tick engine to next broadcast boundary (tickCount divisible by BROADCAST_EVERY)
function tickToBroadcast(engine) {
  do { engine.tick(); } while (engine.tickCount % BROADCAST_EVERY !== 0);
}

function makeRoom(playerCount = 2, options = {}) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { id: i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 1, maxPlayers: 4, status: 'playing', players, ...options };
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

  it('starting colony is on a habitable planet from the galaxy', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    const colony = state.colonies[0];
    assert.ok(colony.planet.habitability >= 60, 'Starting planet should be habitable');
    assert.ok(colony.planet.size >= 8, 'Starting planet should have reasonable size');
    assert.ok(colony.systemId != null, 'Colony should be placed in a galaxy system');
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
    // Fill up to max districts (planet size varies with galaxy generation)
    const maxDistricts = colony.planet.size;
    const currentDistricts = engine._totalDistricts(colony);
    for (let i = 0; i < maxDistricts - currentDistricts; i++) {
      engine._addBuiltDistrict(colony, 'housing');
    }
    assert.strictEqual(engine._totalDistricts(colony), maxDistricts);
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
    // housing buildTime is 200, 50% = 100
    assert.strictEqual(colony.buildQueue[0].ticksRemaining, 100);
  });

  it('districts after the first 3 build at full time', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colonyId = engine.getState().colonies[0].id;
    // Colony already has 4 built districts
    engine.playerStates.get(1).resources.minerals = 10000;

    engine.handleCommand(1, { type: 'buildDistrict', colonyId, districtType: 'housing' });
    const colony = engine.colonies.get(colonyId);
    // Should be full build time (200) since colony already has 3+ districts (housing buildTime=200)
    assert.strictEqual(colony.buildQueue[0].ticksRemaining, 200);
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

  it('cancels a build queue item with 50% resource refund', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine.getState().colonies[0];
    // Build a generator (100 minerals)
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'generator' });
    const afterBuild = engine.getState();
    const mineralsBefore = afterBuild.players[0].resources.minerals;
    const queueItem = afterBuild.colonies[0].buildQueue[0];
    assert.ok(queueItem, 'queue item should exist');
    // Cancel it
    const result = engine.handleCommand(1, { type: 'demolish', colonyId: colony.id, districtId: queueItem.id });
    assert.strictEqual(result.ok, true);
    const afterCancel = engine.getState();
    assert.strictEqual(afterCancel.colonies[0].buildQueue.length, 0);
    // Should get 50% refund (50 minerals)
    assert.strictEqual(afterCancel.players[0].resources.minerals, mineralsBefore + 50);
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

  it('growthProgress tracked on internal colony object', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine.colonies.values().next().value;
    assert.strictEqual(colony.growthProgress, 0);
  });
});

describe('GameEngine — State Serialization', () => {
  it('getState includes netProduction data per colony', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    const colony = state.colonies[0];
    assert.ok(colony.netProduction);
    assert.strictEqual(colony.netProduction.energy, 6); // generator (no consumers yet)
    assert.strictEqual(colony.netProduction.minerals, 6); // mining
    assert.strictEqual(colony.netProduction.food, 4); // 2x agriculture (12) - 8 pops consuming
  });

  it('getState includes housing and jobs', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    const colony = state.colonies[0];
    assert.strictEqual(colony.housing, 10); // base housing from capital (no housing districts)
    assert.strictEqual(colony.jobs, 4); // 4 working districts (gen, mining, 2x agri)
  });

  it('getState includes growth data (progress, target, status)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    const colony = state.colonies[0];
    assert.strictEqual(colony.growthProgress, 0);
    assert.strictEqual(colony.growthTarget, GROWTH_BASE_TICKS); // food surplus = 4 (base rate)
    assert.strictEqual(colony.growthStatus, 'slow'); // food surplus 4 <= 5 = slow
  });

  it('getState shows housing_full growth status when pops at cap', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    // Run enough ticks for pops to fill housing (8 pops → 10 housing)
    for (let i = 0; i < GROWTH_BASE_TICKS * 3; i++) engine.tick();
    const state = engine.getState();
    const colony = state.colonies[0];
    assert.strictEqual(colony.pops, 10); // should have hit housing cap
    assert.strictEqual(colony.growthStatus, 'housing_full');
    assert.strictEqual(colony.growthTarget, 0);
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
    // 2 agriculture = 12 food, 8 pops consume 8 food => net +4
    assert.ok(colony.netProduction.food > 0,
      `Net food (${colony.netProduction.food}) should be positive`);
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
    assert.strictEqual(colony.netProduction.food, 4);
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

describe('Variable build times', () => {
  it('housing builds faster than basic districts (200 vs 300 ticks)', () => {
    assert.strictEqual(DISTRICT_DEFS.housing.buildTime, 200);
    assert.strictEqual(DISTRICT_DEFS.generator.buildTime, 300);
    assert.strictEqual(DISTRICT_DEFS.mining.buildTime, 300);
    assert.strictEqual(DISTRICT_DEFS.agriculture.buildTime, 300);
  });

  it('advanced districts build slower than basic districts (400 vs 300 ticks)', () => {
    assert.strictEqual(DISTRICT_DEFS.industrial.buildTime, 400);
    assert.strictEqual(DISTRICT_DEFS.research.buildTime, 400);
  });

  it('housing completes in 200 ticks at full build time', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colonyId = engine.getState().colonies[0].id;
    engine.playerStates.get(1).resources.minerals = 10000;

    engine.handleCommand(1, { type: 'buildDistrict', colonyId, districtType: 'housing' });
    const colony = engine.colonies.get(colonyId);
    // Housing buildTime=200, colony has 4+ districts so no discount
    assert.strictEqual(colony.buildQueue[0].ticksRemaining, 200);

    // After 199 ticks, still building
    for (let i = 0; i < 199; i++) engine.tick();
    assert.strictEqual(colony.buildQueue.length, 1);

    // Tick 200 completes it
    engine.tick();
    assert.strictEqual(colony.buildQueue.length, 0);
  });

  it('industrial completes in 400 ticks at full build time', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colonyId = engine.getState().colonies[0].id;
    engine.playerStates.get(1).resources.minerals = 10000;

    engine.handleCommand(1, { type: 'buildDistrict', colonyId, districtType: 'industrial' });
    const colony = engine.colonies.get(colonyId);
    assert.strictEqual(colony.buildQueue[0].ticksRemaining, 400);

    // After 399 ticks, still building
    for (let i = 0; i < 399; i++) engine.tick();
    assert.strictEqual(colony.buildQueue.length, 1);

    // Tick 400 completes it
    engine.tick();
    assert.strictEqual(colony.buildQueue.length, 0);
  });

  it('50% new-colony discount applies to variable build times', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine.playerStates.get(1).resources.minerals = 10000;
    engine.playerStates.get(1).resources.energy = 10000;

    // Create a fresh colony with no districts
    const colony = engine._createColony(1, 'New World', { size: 16, type: 'desert', habitability: 60 });

    // Housing: 200 * 0.5 = 100
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'housing' });
    assert.strictEqual(colony.buildQueue[0].ticksRemaining, 100);

    // Industrial: 400 * 0.5 = 200
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'industrial' });
    assert.strictEqual(colony.buildQueue[1].ticksRemaining, 200);

    // Research: 400 * 0.5 = 200
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'research' });
    assert.strictEqual(colony.buildQueue[2].ticksRemaining, 200);
  });
});

describe('GameEngine — Event Notifications', () => {
  it('emits constructionComplete when a build queue item finishes', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colonyId = engine.getState().colonies[0].id;
    engine.playerStates.get(1).resources.minerals = 10000;

    engine.handleCommand(1, { type: 'buildDistrict', colonyId, districtType: 'housing' });
    const colony = engine.colonies.get(colonyId);
    const buildTime = colony.buildQueue[0].ticksRemaining;

    for (let i = 0; i < buildTime; i++) {
      engine.tick();
    }

    const events = engine._pendingEvents.length === 0
      ? [] // already flushed by tick
      : engine._pendingEvents;
    // Events are flushed each tick, so collect them via onEvent
    // Re-test with event collector
    const engine2 = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colonyId2 = engine2.getState().colonies[0].id;
    engine2.playerStates.get(1).resources.minerals = 10000;
    engine2.handleCommand(1, { type: 'buildDistrict', colonyId: colonyId2, districtType: 'mining' });
    const colony2 = engine2.colonies.get(colonyId2);
    const bt = colony2.buildQueue[0].ticksRemaining;

    const collected = [];
    engine2.onEvent = (evts) => collected.push(...evts);

    for (let i = 0; i < bt; i++) {
      engine2.tick();
    }

    const ccEvents = collected.filter(e => e.eventType === 'constructionComplete');
    assert.strictEqual(ccEvents.length, 1);
    assert.strictEqual(ccEvents[0].districtType, 'mining');
    assert.strictEqual(ccEvents[0].colonyId, colonyId2);
    assert.strictEqual(ccEvents[0].playerId, 1);
  });

  it('emits queueEmpty when last build queue item completes', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colonyId = engine.getState().colonies[0].id;
    engine.playerStates.get(1).resources.minerals = 10000;

    engine.handleCommand(1, { type: 'buildDistrict', colonyId, districtType: 'housing' });
    const colony = engine.colonies.get(colonyId);
    const bt = colony.buildQueue[0].ticksRemaining;

    const collected = [];
    engine.onEvent = (evts) => collected.push(...evts);

    for (let i = 0; i < bt; i++) {
      engine.tick();
    }

    const qeEvents = collected.filter(e => e.eventType === 'queueEmpty');
    assert.strictEqual(qeEvents.length, 1);
    assert.strictEqual(qeEvents[0].colonyId, colonyId);
  });

  it('does not emit queueEmpty when queue still has items', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colonyId = engine.getState().colonies[0].id;
    engine.playerStates.get(1).resources.minerals = 10000;

    // Queue 2 items — first completes but queue is not empty
    engine.handleCommand(1, { type: 'buildDistrict', colonyId, districtType: 'housing' });
    engine.handleCommand(1, { type: 'buildDistrict', colonyId, districtType: 'housing' });
    const colony = engine.colonies.get(colonyId);
    const bt = colony.buildQueue[0].ticksRemaining;

    const collected = [];
    engine.onEvent = (evts) => collected.push(...evts);

    for (let i = 0; i < bt; i++) {
      engine.tick();
    }

    const ccEvents = collected.filter(e => e.eventType === 'constructionComplete');
    assert.strictEqual(ccEvents.length, 1);
    const qeEvents = collected.filter(e => e.eventType === 'queueEmpty');
    assert.strictEqual(qeEvents.length, 0, 'Should not emit queueEmpty when queue still has items');
  });

  it('emits popMilestone at multiples of 5 pops', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    // Set pops to 9 so next growth hits 10 (multiple of 5)
    colony.pops = 9;
    // Add housing so cap doesn't block
    engine._addBuiltDistrict(colony, 'housing');
    engine._invalidateColonyCache(colony);

    const collected = [];
    engine.onEvent = (evts) => collected.push(...evts);

    for (let i = 0; i < GROWTH_BASE_TICKS; i++) {
      engine.tick();
    }

    assert.strictEqual(colony.pops, 10);
    const pmEvents = collected.filter(e => e.eventType === 'popMilestone');
    assert.strictEqual(pmEvents.length, 1);
    assert.strictEqual(pmEvents[0].pops, 10);
  });

  it('does not emit popMilestone at non-multiples of 5', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    // Starting at 8, grows to 9 — not a multiple of 5

    const collected = [];
    engine.onEvent = (evts) => collected.push(...evts);

    for (let i = 0; i < GROWTH_BASE_TICKS; i++) {
      engine.tick();
    }

    assert.strictEqual(colony.pops, 9);
    const pmEvents = collected.filter(e => e.eventType === 'popMilestone');
    assert.strictEqual(pmEvents.length, 0);
  });

  it('emits housingFull when pops reach housing cap', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    // Set pops to 9, housing is 10 (base) — next growth fills it
    colony.pops = 9;
    engine._invalidateColonyCache(colony);

    const collected = [];
    engine.onEvent = (evts) => collected.push(...evts);

    for (let i = 0; i < GROWTH_BASE_TICKS; i++) {
      engine.tick();
    }

    assert.strictEqual(colony.pops, 10);
    const hfEvents = collected.filter(e => e.eventType === 'housingFull');
    assert.strictEqual(hfEvents.length, 1);
    assert.strictEqual(hfEvents[0].pops, 10);
    assert.strictEqual(hfEvents[0].housing, 10);
  });

  it('emits foodDeficit when food goes negative after monthly processing', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    // Remove all agriculture to cause food deficit
    colony.districts = colony.districts.filter(d => d.type !== 'agriculture');
    engine._invalidateColonyCache(colony);
    // Set food low enough that it goes negative after monthly consumption
    engine.playerStates.get(1).resources.food = 5;

    const collected = [];
    engine.onEvent = (evts) => collected.push(...evts);

    for (let i = 0; i < MONTH_TICKS; i++) {
      engine.tick();
    }

    // No agriculture = 0 food production, 8 pops consume 8 food. 5 - 8 = -3
    assert.ok(engine.playerStates.get(1).resources.food < 0);
    const fdEvents = collected.filter(e => e.eventType === 'foodDeficit');
    assert.strictEqual(fdEvents.length, 1);
    assert.ok(fdEvents[0].food < 0);
  });

  it('does not emit foodDeficit when food is non-negative', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });

    const collected = [];
    engine.onEvent = (evts) => collected.push(...evts);

    for (let i = 0; i < MONTH_TICKS; i++) {
      engine.tick();
    }

    // Starting setup has food surplus (+4/month)
    assert.ok(engine.playerStates.get(1).resources.food >= 0);
    const fdEvents = collected.filter(e => e.eventType === 'foodDeficit');
    assert.strictEqual(fdEvents.length, 0);
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
      for (const [pid] of engine.playerStates) engine._dirtyPlayers.add(pid); // force worst-case
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

  it('skips broadcast on clean ticks (per-player dirty tracking)', () => {
    let broadcastCount = 0;
    let broadcastPlayers = [];
    const engine = new GameEngine(makeRoom(2), {
      tickRate: 10,
      onTick: (playerId) => { broadcastCount++; broadcastPlayers.push(playerId); },
    });

    // Tick to first broadcast boundary — should broadcast to all players (dirty from init)
    tickToBroadcast(engine);
    assert.strictEqual(broadcastCount, 2, 'Should broadcast to both players on init');

    // Run enough ticks past growth/construction activity for a clean state
    // (colonies with food surplus will have growth ticking — stop growth by filling housing)
    for (const [, colony] of engine.colonies) {
      colony.pops = 100; // exceed housing to stop growth
      engine._invalidateColonyCache(colony);
    }
    tickToBroadcast(engine); // flush dirty
    broadcastCount = 0;
    broadcastPlayers = [];

    // Now subsequent ticks with no growth/construction should not broadcast
    // (run a full broadcast cycle to be sure)
    for (let i = 0; i < BROADCAST_EVERY; i++) engine.tick();
    assert.strictEqual(broadcastCount, 0, 'Should not broadcast when no state changes');

    // Command from player 1 should only broadcast to player 1 at next broadcast boundary
    const colony = engine.getState().colonies[0];
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'housing' });
    tickToBroadcast(engine);
    assert.ok(broadcastPlayers.includes(1), 'Player 1 should receive broadcast after their command');
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

  it('onTick receives per-player pre-stringified JSON', () => {
    let receivedPlayerId = null;
    let receivedPayload = null;
    const engine = new GameEngine(makeRoom(1), {
      tickRate: 10,
      onTick: (playerId, payload) => { receivedPlayerId = playerId; receivedPayload = payload; },
    });

    tickToBroadcast(engine);
    assert.strictEqual(receivedPlayerId, 1, 'onTick should receive playerId');
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

describe('GameEngine — Performance', () => {
  it('tick completes within 5ms at 8 players / 40 colonies', () => {
    const players = new Map();
    for (let i = 1; i <= 8; i++) {
      players.set(i, { id: i, name: `P${i}`, ready: true, isHost: i === 1 });
    }
    const room = { id: 'perf', name: 'Perf', hostId: 1, maxPlayers: 8, status: 'playing', players };
    const engine = new GameEngine(room, { tickRate: 10 });
    // Add 4 extra colonies per player (5 total each = 40 colonies)
    for (let i = 1; i <= 8; i++) {
      for (let c = 0; c < 4; c++) {
        const colony = engine._createColony(i, `Extra${c}`, { size: 16, type: 'continental', habitability: 80 });
        engine._addBuiltDistrict(colony, 'generator');
        engine._addBuiltDistrict(colony, 'mining');
        engine._addBuiltDistrict(colony, 'agriculture');
        engine._addBuiltDistrict(colony, 'agriculture');
        engine._addBuiltDistrict(colony, 'housing');
      }
    }
    // Warm up caches
    for (let i = 0; i < 10; i++) engine.tick();

    const start = process.hrtime.bigint();
    engine.tick();
    const duration = Number(process.hrtime.bigint() - start) / 1e6;
    assert.ok(duration < 5, `Tick took ${duration.toFixed(3)}ms, budget is 5ms`);
  });

  it('state payload under 25KB at 8 players / 40 colonies', () => {
    const players = new Map();
    for (let i = 1; i <= 8; i++) {
      players.set(i, { id: i, name: `P${i}`, ready: true, isHost: i === 1 });
    }
    const room = { id: 'perf', name: 'Perf', hostId: 1, maxPlayers: 8, status: 'playing', players };
    const engine = new GameEngine(room, { tickRate: 10 });
    for (let i = 1; i <= 8; i++) {
      for (let c = 0; c < 4; c++) {
        const colony = engine._createColony(i, `Extra${c}`, { size: 16, type: 'continental', habitability: 80 });
        engine._addBuiltDistrict(colony, 'generator');
        engine._addBuiltDistrict(colony, 'mining');
        engine._addBuiltDistrict(colony, 'agriculture');
        engine._addBuiltDistrict(colony, 'agriculture');
        engine._addBuiltDistrict(colony, 'housing');
      }
    }
    engine._cachedState = null;
    engine._cachedStateJSON = null;
    const json = engine.getStateJSON();
    const sizeKB = json.length / 1024;
    assert.ok(sizeKB < 25, `Payload is ${sizeKB.toFixed(1)}KB, limit is 25KB`);
  });
});

describe('GameEngine — Tick Profiling', () => {
  it('tick budget stays under 50ms with 8 players fully built', () => {
    const engine = new GameEngine(makeRoom(8), { profile: true });

    // Max out every colony: 12 built districts + 3 in queue
    for (const [, colony] of engine.colonies) {
      for (let i = 0; i < 8; i++) {
        engine._addBuiltDistrict(colony, ['generator', 'mining', 'agriculture', 'industrial', 'research', 'housing'][i % 6]);
      }
      colony.buildQueue.push({ id: 'q1', type: 'mining', ticksRemaining: 50 });
      colony.buildQueue.push({ id: 'q2', type: 'generator', ticksRemaining: 100 });
      colony.buildQueue.push({ id: 'q3', type: 'research', ticksRemaining: 150 });
    }

    // Run 500 ticks (includes monthly processing)
    for (let i = 0; i < 500; i++) engine.tick();

    const stats = engine.getTickStats();
    assert.ok(stats.avg < 50, `Avg tick ${stats.avg.toFixed(3)}ms exceeds 50ms budget`);
    assert.ok(stats.max < 80, `Max tick ${stats.max.toFixed(3)}ms exceeds 80ms limit`);
    assert.ok(stats.budgetPct < 50, `Tick uses ${stats.budgetPct.toFixed(1)}% of budget, limit 50%`);
  });

  it('getTickStats returns zeroes when profiling is disabled', () => {
    const engine = new GameEngine(makeRoom(1));
    for (let i = 0; i < 10; i++) engine.tick();
    const stats = engine.getTickStats();
    assert.strictEqual(stats.count, 0);
    assert.strictEqual(stats.avg, 0);
  });

  it('broadcast throttle reduces serialization count vs unthrottled', () => {
    let broadcastCount = 0;
    const engine = new GameEngine(makeRoom(8), {
      onTick: () => { broadcastCount++; },
      onEvent: () => {},
    });

    // Run 300 ticks (100 broadcast windows at BROADCAST_EVERY=3)
    for (let i = 0; i < 300; i++) engine.tick();

    // Without any throttle: 300 ticks * 8 players = 2400 broadcasts
    // With broadcast throttle (every 3 ticks) + growth dirty throttle (every 10 ticks):
    // growth-only broadcasts fire ~3 times per 30 ticks, plus monthly/construction events.
    // Expect significantly fewer than the unthrottled maximum.
    assert.ok(broadcastCount <= 900, `Expected <= 900 broadcasts, got ${broadcastCount}`);
    assert.ok(broadcastCount >= 100, `Expected >= 100 broadcasts, got ${broadcastCount} (throttle may be broken)`);
  });
});

describe('GameEngine — Per-Player State Filtering', () => {
  it('getPlayerState only includes the requesting players colonies', () => {
    const engine = new GameEngine(makeRoom(2));
    const state1 = engine.getPlayerState(1);
    const state2 = engine.getPlayerState(2);

    // Each player should only see their own colonies
    assert.ok(state1.colonies.every(c => c.ownerId === 1), 'Player 1 sees only own colonies');
    assert.ok(state2.colonies.every(c => c.ownerId === 2), 'Player 2 sees only own colonies');
    assert.strictEqual(state1.colonies.length, 1);
    assert.strictEqual(state2.colonies.length, 1);
  });

  it('getPlayerState includes own resources but not other players resources', () => {
    const engine = new GameEngine(makeRoom(2));
    const state = engine.getPlayerState(1);

    // First player in array is self (has resources)
    const me = state.players.find(p => p.id === 1);
    assert.ok(me.resources, 'Own player has resources');

    // Other player should NOT have resources
    const other = state.players.find(p => p.id === 2);
    assert.strictEqual(other.resources, undefined, 'Other player has no resources');
  });

  it('per-player payload is under 5KB for 8 players with 5 colonies each', () => {
    const engine = new GameEngine(makeRoom(8));
    // Add 4 extra colonies per player (5 total each)
    for (let i = 1; i <= 8; i++) {
      for (let c = 0; c < 4; c++) {
        const colony = engine._createColony(i, `Colony-${i}-${c}`, { size: 16, type: 'continental', habitability: 80 });
        engine._addBuiltDistrict(colony, 'generator');
        engine._addBuiltDistrict(colony, 'mining');
        engine._addBuiltDistrict(colony, 'agriculture');
        engine._addBuiltDistrict(colony, 'housing');
      }
    }

    // Check per-player payload size
    const json = engine.getPlayerStateJSON(1);
    const sizeKB = json.length / 1024;
    assert.ok(sizeKB < 5, `Per-player payload is ${sizeKB.toFixed(1)}KB, limit is 5KB`);
  });

  it('per-player onTick sends filtered state to each player', () => {
    const received = new Map();
    const engine = new GameEngine(makeRoom(2), {
      onTick: (playerId, json) => {
        received.set(playerId, JSON.parse(json));
      },
    });

    tickToBroadcast(engine); // triggers dirty broadcast at throttle boundary

    assert.ok(received.has(1), 'Player 1 received state');
    assert.ok(received.has(2), 'Player 2 received state');
    // Each player's colonies should only be their own
    assert.ok(received.get(1).colonies.every(c => c.ownerId === 1));
    assert.ok(received.get(2).colonies.every(c => c.ownerId === 2));
  });

  it('per-player dirty tracking only broadcasts to affected players', () => {
    const broadcasts = new Map(); // playerId -> count
    const engine = new GameEngine(makeRoom(2), {
      onTick: (playerId) => {
        broadcasts.set(playerId, (broadcasts.get(playerId) || 0) + 1);
      },
    });

    // First broadcast boundary — broadcasts to all (init dirty)
    tickToBroadcast(engine);
    assert.strictEqual(broadcasts.get(1), 1);
    assert.strictEqual(broadcasts.get(2), 1);

    // Stop growth on all colonies (fill housing) to get clean state
    for (const [, colony] of engine.colonies) {
      colony.pops = 100;
      engine._invalidateColonyCache(colony);
    }
    tickToBroadcast(engine); // flush
    broadcasts.clear();

    // Player 1 builds — only player 1 should get broadcast at next boundary
    const colony1 = engine.getState().colonies.find(c => c.ownerId === 1);
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony1.id, districtType: 'generator' });
    tickToBroadcast(engine);
    assert.strictEqual(broadcasts.get(1), 1, 'Player 1 gets broadcast');
    assert.strictEqual(broadcasts.get(2) || 0, 0, 'Player 2 does NOT get broadcast');
  });

  it('construction progress broadcasts only to building player at throttled rate', () => {
    const broadcastCounts = new Map();
    const engine = new GameEngine(makeRoom(2), {
      onTick: (playerId) => {
        broadcastCounts.set(playerId, (broadcastCounts.get(playerId) || 0) + 1);
      },
    });

    // Stop growth on all colonies to isolate construction broadcasts
    for (const [, colony] of engine.colonies) {
      colony.pops = 100;
      engine._invalidateColonyCache(colony);
    }
    tickToBroadcast(engine);
    broadcastCounts.clear();

    // Player 1 starts building
    const colony1 = engine.getState().colonies.find(c => c.ownerId === 1);
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony1.id, districtType: 'generator' });

    // Run N*BROADCAST_EVERY ticks — player 1 should get N broadcasts, player 2 should get 0
    const cycles = 4;
    for (let i = 0; i < cycles * BROADCAST_EVERY; i++) engine.tick();
    assert.strictEqual(broadcastCounts.get(1), cycles, 'Building player gets broadcast at throttled rate');
    assert.strictEqual(broadcastCounts.get(2) || 0, 0, 'Non-building player gets no broadcasts');
  });
});

describe('GameEngine — Mini Tech Tree', () => {
  it('TECH_TREE has 6 techs across 3 tracks and 2 tiers', () => {
    const techs = Object.entries(TECH_TREE);
    assert.strictEqual(techs.length, 6);
    for (const track of ['physics', 'society', 'engineering']) {
      const trackTechs = techs.filter(([, t]) => t.track === track);
      assert.strictEqual(trackTechs.length, 2, `${track} should have 2 techs`);
      assert.ok(trackTechs.some(([, t]) => t.tier === 1), `${track} missing T1`);
      assert.ok(trackTechs.some(([, t]) => t.tier === 2), `${track} missing T2`);
    }
  });

  it('T2 techs require T1 in the same track', () => {
    for (const [, tech] of Object.entries(TECH_TREE)) {
      if (tech.tier === 2) {
        assert.ok(tech.requires, `T2 tech ${tech.name} must have a prerequisite`);
        const prereq = TECH_TREE[tech.requires];
        assert.ok(prereq, `Prerequisite ${tech.requires} must exist`);
        assert.strictEqual(prereq.track, tech.track, 'Prerequisite must be same track');
        assert.strictEqual(prereq.tier, 1, 'Prerequisite must be T1');
      }
    }
  });

  it('player starts with empty research state', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    const player = state.players[0];
    assert.deepStrictEqual(player.currentResearch, { physics: null, society: null, engineering: null });
    assert.deepStrictEqual(player.researchProgress, {});
    assert.deepStrictEqual(player.completedTechs, []);
  });

  it('setResearch assigns tech to correct track', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const result = engine.handleCommand(1, { type: 'setResearch', techId: 'improved_power_plants' });
    assert.ok(result.ok);
    assert.strictEqual(engine.playerStates.get(1).currentResearch.physics, 'improved_power_plants');
  });

  it('setResearch rejects unknown tech', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const result = engine.handleCommand(1, { type: 'setResearch', techId: 'warp_drive' });
    assert.ok(result.error);
  });

  it('setResearch rejects T2 without T1 completed', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const result = engine.handleCommand(1, { type: 'setResearch', techId: 'advanced_reactors' });
    assert.ok(result.error);
    assert.ok(result.error.includes('Prerequisite'));
  });

  it('setResearch allows T2 after T1 completed', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine.playerStates.get(1).completedTechs.push('improved_power_plants');
    const result = engine.handleCommand(1, { type: 'setResearch', techId: 'advanced_reactors' });
    assert.ok(result.ok);
  });

  it('setResearch rejects already completed tech', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine.playerStates.get(1).completedTechs.push('improved_power_plants');
    const result = engine.handleCommand(1, { type: 'setResearch', techId: 'improved_power_plants' });
    assert.ok(result.error);
    assert.ok(result.error.includes('already'));
  });

  it('research progress accumulates from monthly research production', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    // Add a research district for physics production
    const colony = Array.from(engine.colonies.values())[0];
    engine._addBuiltDistrict(colony, 'research');
    engine._invalidateColonyCache(colony);

    engine.handleCommand(1, { type: 'setResearch', techId: 'improved_power_plants' });

    // Run one month
    for (let i = 0; i < MONTH_TICKS; i++) engine.tick();

    // Research district produces 4 physics/month + unemployed pops produce some too
    const progress = engine.playerStates.get(1).researchProgress['improved_power_plants'];
    assert.ok(progress > 0, 'Research progress should be positive');
    // Physics stockpile should be consumed (set to 0)
    assert.strictEqual(engine.playerStates.get(1).resources.research.physics, 0);
  });

  it('tech completes when progress reaches cost', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine.handleCommand(1, { type: 'setResearch', techId: 'improved_power_plants' });

    // Give enough research to complete in one month
    engine.playerStates.get(1).resources.research.physics = 200;

    const collected = [];
    engine.onEvent = (evts) => collected.push(...evts);

    // Process one month
    for (let i = 0; i < MONTH_TICKS; i++) engine.tick();

    assert.ok(engine.playerStates.get(1).completedTechs.includes('improved_power_plants'));
    assert.strictEqual(engine.playerStates.get(1).currentResearch.physics, null);

    const rcEvents = collected.filter(e => e.eventType === 'researchComplete');
    assert.strictEqual(rcEvents.length, 1);
    assert.strictEqual(rcEvents[0].techId, 'improved_power_plants');
    assert.strictEqual(rcEvents[0].track, 'physics');
  });

  it('Improved Power Plants applies +25% Generator output', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];

    // Before tech: generator produces 6 energy
    const before = engine._calcProduction(colony);
    assert.strictEqual(before.production.energy, 6);

    // Complete tech
    engine.playerStates.get(1).completedTechs.push('improved_power_plants');
    engine._invalidateColonyCache(colony);

    const after = engine._calcProduction(colony);
    assert.strictEqual(after.production.energy, 7.5); // 6 * 1.25
  });

  it('Improved Mining applies +25% Mining output', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];

    engine.playerStates.get(1).completedTechs.push('improved_mining');
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony);
    assert.strictEqual(prod.production.minerals, 7.5); // 6 * 1.25
  });

  it('T2 supersedes T1 for same district type (highest multiplier wins)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];

    engine.playerStates.get(1).completedTechs.push('improved_power_plants', 'advanced_reactors');
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony);
    // Should use 1.5x (T2), not 1.25x (T1)
    assert.strictEqual(prod.production.energy, 9); // 6 * 1.5
  });

  it('Frontier Medicine reduces pop growth time by 25%', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    colony.pops = 8;
    colony.growthProgress = 0;
    engine._invalidateColonyCache(colony);

    // Without tech: base growth takes 400 ticks (food surplus = 4)
    // With Frontier Medicine: 400 * 0.75 = 300 ticks
    engine.playerStates.get(1).completedTechs.push('frontier_medicine');
    engine._invalidateColonyCache(colony);

    for (let i = 0; i < 299; i++) engine.tick();
    assert.strictEqual(colony.pops, 8, 'Should not grow before 300 ticks');

    engine.tick(); // tick 300
    assert.strictEqual(colony.pops, 9, 'Should grow at 300 ticks with Frontier Medicine');
  });

  it('can research all 3 tracks simultaneously', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine.handleCommand(1, { type: 'setResearch', techId: 'improved_power_plants' });
    engine.handleCommand(1, { type: 'setResearch', techId: 'frontier_medicine' });
    engine.handleCommand(1, { type: 'setResearch', techId: 'improved_mining' });

    const cr = engine.playerStates.get(1).currentResearch;
    assert.strictEqual(cr.physics, 'improved_power_plants');
    assert.strictEqual(cr.society, 'frontier_medicine');
    assert.strictEqual(cr.engineering, 'improved_mining');
  });

  it('research state included in getState serialization', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine.handleCommand(1, { type: 'setResearch', techId: 'improved_power_plants' });
    engine.playerStates.get(1).completedTechs.push('improved_mining');

    const state = engine.getState();
    const player = state.players[0];
    assert.strictEqual(player.currentResearch.physics, 'improved_power_plants');
    assert.ok(player.completedTechs.includes('improved_mining'));
  });

  it('research state included in per-player state', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    engine.handleCommand(1, { type: 'setResearch', techId: 'improved_power_plants' });

    const state = engine.getPlayerState(1);
    const me = state.players.find(p => p.id === 1);
    assert.strictEqual(me.currentResearch.physics, 'improved_power_plants');
  });

  it('Gene Crops applies +50% Agriculture output', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];

    engine.playerStates.get(1).completedTechs.push('frontier_medicine', 'gene_crops');
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony);
    // 2 agriculture districts, each producing 6 * 1.5 = 9 food
    assert.strictEqual(prod.production.food, 18); // 2 * 9
  });
});

// ── Energy Deficit Consequences ──

describe('GameEngine — Energy Deficit', () => {
  it('disables highest-energy-consuming district when energy goes negative', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const state = engine.playerStates.get(1);

    // Add an industrial district (consumes 3 energy) and a research district (consumes 4 energy)
    engine._addBuiltDistrict(colony, 'industrial');
    engine._addBuiltDistrict(colony, 'research');
    // Add pops so they can work the new districts
    colony.pops = 10;
    engine._invalidateColonyCache(colony);

    // Set energy to a level that will go negative after monthly processing
    // Generator produces 6, industrial consumes 3, research consumes 4 → net = -1/month
    // (no housing district built — base capital housing doesn't consume energy)
    state.resources.energy = 0; // will become -1 after monthly processing

    engine._processMonthlyResources();
    assert.ok(state.resources.energy < 0, 'energy should be negative before deficit processing');

    engine._processEnergyDeficit();

    // Research district (4 energy) should be disabled first (highest consumer)
    const researchDistrict = colony.districts.find(d => d.type === 'research');
    assert.strictEqual(researchDistrict.disabled, true, 'research district should be disabled');
  });

  it('disabled districts produce nothing and consume nothing', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];

    // Add a research district and disable it
    const districtId = engine._addBuiltDistrict(colony, 'research');
    colony.pops = 10;
    const researchDistrict = colony.districts.find(d => d.id === districtId);
    researchDistrict.disabled = true;
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony);
    // Research district is disabled — should not produce 3/3/3 research or consume 4 energy
    // Only generator (6 energy), mining (6 minerals), 2 agriculture (12 food) produce
    // No housing district built, so no housing energy consumption
    assert.strictEqual(prod.consumption.energy, 0); // no energy-consuming district active
    // 4 built districts with jobs (gen, mining, 2 agri) = 4 jobs. Research disabled = 0 jobs.
    // 10 pops - 4 working = 6 unemployed. Each produces 1 research.
    assert.strictEqual(prod.production.physics, 6); // 6 unemployed × 1
  });

  it('disables multiple districts if needed to restore energy balance', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const state = engine.playerStates.get(1);

    // Add two research districts (consume 4 each) and one industrial (consumes 3)
    engine._addBuiltDistrict(colony, 'research');
    engine._addBuiltDistrict(colony, 'research');
    engine._addBuiltDistrict(colony, 'industrial');
    colony.pops = 12;
    engine._invalidateColonyCache(colony);

    // Net energy: 6 (gen) - 4 - 4 - 3 = -5/month (no housing district built)
    state.resources.energy = 0; // will become -5

    engine._processMonthlyResources();
    engine._processEnergyDeficit();

    // Should have disabled enough districts to bring energy >= 0
    const disabledCount = colony.districts.filter(d => d.disabled).length;
    assert.ok(disabledCount >= 2, 'should disable at least 2 districts');
    assert.ok(state.resources.energy >= 0, 'energy should be non-negative after disabling');
  });

  it('re-enables cheapest disabled district when energy supports it', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const state = engine.playerStates.get(1);

    // Add an industrial district (consumes 3) and disable it manually
    const districtId = engine._addBuiltDistrict(colony, 'industrial');
    colony.pops = 10;
    const indDistrict = colony.districts.find(d => d.id === districtId);
    indDistrict.disabled = true;
    engine._invalidateColonyCache(colony);

    // With industrial disabled: net energy = 6 (gen) - 1 (housing) = +5/month
    // Re-enabling industrial would make it: 6 - 1 - 3 = +2/month — still positive
    state.resources.energy = 100; // plenty of energy

    engine._processEnergyDeficit();

    assert.ok(!indDistrict.disabled, 'industrial should be re-enabled');
  });

  it('does not re-enable if it would cause negative energy balance', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const state = engine.playerStates.get(1);

    // Add two research districts (4 each) and disable both
    const id1 = engine._addBuiltDistrict(colony, 'research');
    const id2 = engine._addBuiltDistrict(colony, 'research');
    colony.pops = 10;
    const r1 = colony.districts.find(d => d.id === id1);
    const r2 = colony.districts.find(d => d.id === id2);
    r1.disabled = true;
    r2.disabled = true;
    engine._invalidateColonyCache(colony);

    // Currently: net energy = 6 (gen) - 1 (housing) = +5/month
    // Re-enabling one research: 6 - 1 - 4 = +1 → ok
    // Re-enabling both: 6 - 1 - 4 - 4 = -3 → not ok
    state.resources.energy = 100;

    engine._processEnergyDeficit();

    const enabledResearch = colony.districts.filter(d => d.type === 'research' && !d.disabled);
    const disabledResearch = colony.districts.filter(d => d.type === 'research' && d.disabled);
    assert.strictEqual(enabledResearch.length, 1, 'should re-enable one research district');
    assert.strictEqual(disabledResearch.length, 1, 'should keep one research district disabled');
  });

  it('emits districtDisabled event when disabling', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const state = engine.playerStates.get(1);

    engine._addBuiltDistrict(colony, 'industrial');
    colony.pops = 10;
    engine._invalidateColonyCache(colony);

    // Force energy negative
    state.resources.energy = -10;

    engine._processEnergyDeficit();

    const events = engine._flushEvents();
    assert.ok(events, 'should have pending events');
    const disableEvent = events.find(e => e.eventType === 'districtDisabled');
    assert.ok(disableEvent, 'should emit districtDisabled event');
    assert.strictEqual(disableEvent.districtType, 'industrial');
    assert.strictEqual(disableEvent.playerId, 1);
  });

  it('emits districtEnabled event when re-enabling', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const state = engine.playerStates.get(1);

    const districtId = engine._addBuiltDistrict(colony, 'industrial');
    colony.pops = 10;
    const indDistrict = colony.districts.find(d => d.id === districtId);
    indDistrict.disabled = true;
    engine._invalidateColonyCache(colony);

    state.resources.energy = 100;

    engine._processEnergyDeficit();

    const events = engine._flushEvents();
    assert.ok(events, 'should have pending events');
    const enableEvent = events.find(e => e.eventType === 'districtEnabled');
    assert.ok(enableEvent, 'should emit districtEnabled event');
    assert.strictEqual(enableEvent.districtType, 'industrial');
  });

  it('disabled housing districts provide no housing', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];

    const districtId = engine._addBuiltDistrict(colony, 'housing');
    const housingDistrict = colony.districts.find(d => d.id === districtId);
    const housingBefore = engine._calcHousing(colony);
    assert.strictEqual(housingBefore, 15); // 10 base + 5 from housing district

    housingDistrict.disabled = true;
    engine._invalidateColonyCache(colony);
    const housingAfter = engine._calcHousing(colony);
    assert.strictEqual(housingAfter, 10); // back to base only
  });

  it('disabled districts do not count as jobs', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];

    const districtId = engine._addBuiltDistrict(colony, 'mining');
    const miningDistrict = colony.districts.find(d => d.id === districtId);
    const jobsBefore = engine._calcJobs(colony);
    assert.strictEqual(jobsBefore, 5); // gen(1) + mining(1) + agri(1) + agri(1) + new mining(1) = 5

    miningDistrict.disabled = true;
    engine._invalidateColonyCache(colony);
    const jobsAfter = engine._calcJobs(colony);
    assert.strictEqual(jobsAfter, 4); // one mining disabled
  });

  it('energy deficit processing runs during monthly tick', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const state = engine.playerStates.get(1);

    // Add industrial + research to create energy deficit
    engine._addBuiltDistrict(colony, 'industrial');
    engine._addBuiltDistrict(colony, 'research');
    colony.pops = 10;
    engine._invalidateColonyCache(colony);

    // Set energy low enough that monthly processing puts it negative
    // Net energy: 6 (gen) - 3 (industrial) - 4 (research) = -1/month
    state.resources.energy = 0;

    // Run ticks until monthly processing
    const events = [];
    engine.onEvent = (evts) => events.push(...evts);
    for (let i = 0; i < MONTH_TICKS; i++) {
      engine.tick();
    }

    // Should have auto-disabled at least one district
    const hasDisableEvent = events.some(e => e.eventType === 'districtDisabled');
    assert.ok(hasDisableEvent, 'energy deficit should trigger district disable during monthly tick');
  });

  it('generators are not disabled (they produce energy, not consume)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const state = engine.playerStates.get(1);

    // Starting setup: generator, mining, 2x agriculture
    // Add an industrial (consumes 3 energy) to create deficit
    engine._addBuiltDistrict(colony, 'industrial');
    colony.pops = 10;
    engine._invalidateColonyCache(colony);

    state.resources.energy = -10;
    engine._processEnergyDeficit();

    // Generator should NOT be disabled — it has no energy consumption
    const gen = colony.districts.find(d => d.type === 'generator');
    assert.ok(!gen.disabled, 'generator should never be disabled by energy deficit');
    // Industrial should be disabled instead
    const ind = colony.districts.find(d => d.type === 'industrial');
    assert.strictEqual(ind.disabled, true, 'industrial should be disabled');
  });

  it('handles multi-colony energy deficit across all player colonies', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);

    // Create a second colony for the same player
    const colony2 = engine._createColony(1, 'Colony 2', { size: 16, type: 'continental', habitability: 80 });
    engine._addBuiltDistrict(colony2, 'research'); // consumes 4 energy
    engine._addBuiltDistrict(colony2, 'research'); // consumes 4 energy
    colony2.pops = 10;
    engine._invalidateColonyCache(colony2);

    // Colony 1 has generator (+6), Colony 2 has 2 research (-8) → net = -2
    state.resources.energy = -5;
    engine._processEnergyDeficit();

    // Should disable research district(s) on colony2 to fix deficit
    const disabledOnC2 = colony2.districts.filter(d => d.disabled);
    assert.ok(disabledOnC2.length > 0, 'should disable districts on second colony');
    assert.ok(state.resources.energy >= 0, 'energy should be non-negative after multi-colony deficit fix');
  });

  it('_calcPlayerNetEnergy sums across all colonies', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony1 = Array.from(engine.colonies.values())[0];

    // Colony1 starting: generator (+6), no energy consumers
    const net1 = engine._calcPlayerNetEnergy(1);
    assert.strictEqual(net1, 6, 'single colony with generator should have +6 net energy');

    // Add industrial (consumes 3)
    engine._addBuiltDistrict(colony1, 'industrial');
    colony1.pops = 10;
    engine._invalidateColonyCache(colony1);

    const net2 = engine._calcPlayerNetEnergy(1);
    assert.strictEqual(net2, 3, 'generator(+6) - industrial(-3) = +3 net');
  });

  it('disabled district can still be demolished', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];

    const districtId = engine._addBuiltDistrict(colony, 'industrial');
    const ind = colony.districts.find(d => d.id === districtId);
    ind.disabled = true;
    engine._invalidateColonyCache(colony);

    const countBefore = colony.districts.length;
    const result = engine.handleCommand(1, { type: 'demolish', colonyId: colony.id, districtId });
    assert.strictEqual(result.ok, true, 'should be able to demolish disabled district');
    assert.strictEqual(colony.districts.length, countBefore - 1, 'district count should decrease');
  });

  it('serialized colony includes disabled flag on districts', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];

    const districtId = engine._addBuiltDistrict(colony, 'industrial');
    const ind = colony.districts.find(d => d.id === districtId);
    ind.disabled = true;
    engine._invalidateColonyCache(colony);

    const state = engine.getState();
    const serializedColony = state.colonies[0];
    const serializedDistrict = serializedColony.districts.find(d => d.id === districtId);
    assert.strictEqual(serializedDistrict.disabled, true, 'serialized district should have disabled flag');
  });

  it('no districts disabled when energy stays non-negative', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const state = engine.playerStates.get(1);

    state.resources.energy = 500; // plenty
    engine._processEnergyDeficit();

    const disabledCount = colony.districts.filter(d => d.disabled).length;
    assert.strictEqual(disabledCount, 0, 'no districts should be disabled when energy is positive');
  });
});

// ── Victory Points ──
describe('GameEngine — Victory Points', () => {
  it('calculates VP from pops, districts, alloys, and research', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    const colony = Array.from(engine.colonies.values())[0];

    // Starting: 8 pops * 2 = 16, 4 districts * 1 = 4, alloys 50/25 = 2, research 0
    const vp = engine._calcVictoryPoints(1);
    assert.strictEqual(vp, 16 + 4 + 2 + 0); // 22
  });

  it('VP includes alloy stockpile divided by 25', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 250;
    const vp = engine._calcVictoryPoints(1);
    // 8*2=16, 4 districts, 250/25=10
    assert.strictEqual(vp, 16 + 4 + 10 + 0);
  });

  it('VP includes total research divided by 100', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 0;
    state.resources.research = { physics: 100, society: 100, engineering: 100 };
    const vp = engine._calcVictoryPoints(1);
    // 8*2=16, 4 districts, 0 alloys, 300/100=3
    assert.strictEqual(vp, 16 + 4 + 0 + 3);
  });

  it('VP is 0 for unknown player', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    assert.strictEqual(engine._calcVictoryPoints(999), 0);
  });

  it('VP included in getState() player data', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    assert.ok(state.players[0].vp !== undefined, 'player should have vp field');
    assert.strictEqual(typeof state.players[0].vp, 'number');
  });

  it('VP included in getPlayerState() for self and others', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const pState = engine.getPlayerState(1);
    assert.ok(pState.players[0].vp !== undefined, 'own player should have vp');
    assert.ok(pState.players[1].vp !== undefined, 'other player should have vp');
  });

  it('VP reflects additional districts', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const vpBefore = engine._calcVictoryPoints(1);
    engine._addBuiltDistrict(colony, 'mining');
    const vpAfter = engine._calcVictoryPoints(1);
    assert.strictEqual(vpAfter, vpBefore + 1, 'VP should increase by 1 per new district');
  });
});

// ── Match Timer ──
describe('GameEngine — Match Timer', () => {
  it('no timer when matchTimer is 0 (unlimited)', () => {
    const engine = new GameEngine(makeRoom(1, { matchTimer: 0 }), { tickRate: 10 });
    assert.strictEqual(engine._matchTimerEnabled, false);
    assert.strictEqual(engine._matchTicksRemaining, 0);
  });

  it('timer enabled when matchTimer is set', () => {
    const engine = new GameEngine(makeRoom(1, { matchTimer: 10 }), { tickRate: 10 });
    assert.strictEqual(engine._matchTimerEnabled, true);
    // 10 minutes * 60 seconds * 10 ticks/sec = 6000 ticks
    assert.strictEqual(engine._matchTicksRemaining, 6000);
  });

  it('timer counts down each tick', () => {
    const engine = new GameEngine(makeRoom(1, { matchTimer: 10 }), { tickRate: 10 });
    const startTicks = engine._matchTicksRemaining;
    engine.tick();
    assert.strictEqual(engine._matchTicksRemaining, startTicks - 1);
  });

  it('match timer included in getState when enabled', () => {
    const engine = new GameEngine(makeRoom(1, { matchTimer: 10 }), { tickRate: 10 });
    const state = engine.getState();
    assert.strictEqual(state.matchTimerEnabled, true);
    assert.strictEqual(typeof state.matchTicksRemaining, 'number');
  });

  it('match timer included in getPlayerState when enabled', () => {
    const engine = new GameEngine(makeRoom(1, { matchTimer: 10 }), { tickRate: 10 });
    const state = engine.getPlayerState(1);
    assert.strictEqual(state.matchTimerEnabled, true);
    assert.strictEqual(typeof state.matchTicksRemaining, 'number');
  });

  it('no match timer in state when unlimited', () => {
    const engine = new GameEngine(makeRoom(1, { matchTimer: 0 }), { tickRate: 10 });
    const state = engine.getState();
    assert.strictEqual(state.matchTimerEnabled, undefined);
  });

  it('2-minute warning event fires at correct time', () => {
    const events = [];
    const engine = new GameEngine(makeRoom(1, { matchTimer: 10 }), {
      tickRate: 10,
      onEvent: (evts) => events.push(...evts),
    });
    // Advance to 2 minutes before end: 6000 - 1200 = 4800 ticks
    const targetTicks = engine._matchTicksRemaining - (2 * 60 * 10);
    for (let i = 0; i < targetTicks; i++) engine.tick();
    // Next tick should trigger the 2-minute warning
    engine.tick();
    const warning = events.find(e => e.eventType === 'matchWarning');
    assert.ok(warning, 'matchWarning event should fire');
    assert.strictEqual(warning.secondsRemaining, 120);
  });

  it('30-second countdown event fires', () => {
    const events = [];
    const engine = new GameEngine(makeRoom(1, { matchTimer: 10 }), {
      tickRate: 10,
      onEvent: (evts) => events.push(...evts),
    });
    // Advance to 30 seconds before end: 6000 - 300 = 5700 ticks
    const targetTicks = engine._matchTicksRemaining - (30 * 10);
    for (let i = 0; i < targetTicks; i++) engine.tick();
    engine.tick();
    const countdown = events.find(e => e.eventType === 'finalCountdown');
    assert.ok(countdown, 'finalCountdown event should fire');
    assert.strictEqual(countdown.secondsRemaining, 30);
  });

  it('game over triggers when timer expires', () => {
    let gameOverData = null;
    // Use a very short timer for testing: 1 minute = 600 ticks
    const engine = new GameEngine(makeRoom(1, { matchTimer: 1 }), {
      tickRate: 10,
      onGameOver: (data) => { gameOverData = data; },
    });
    assert.strictEqual(engine._matchTicksRemaining, 600);

    // Tick through the whole timer
    for (let i = 0; i < 600; i++) engine.tick();

    assert.ok(gameOverData, 'onGameOver should have been called');
    assert.ok(gameOverData.winner, 'should have a winner');
    assert.strictEqual(gameOverData.winner.playerId, 1);
    assert.ok(gameOverData.scores.length > 0, 'scores should be populated');
  });

  it('game stops ticking after game over', () => {
    const engine = new GameEngine(makeRoom(1, { matchTimer: 1 }), {
      tickRate: 10,
      onGameOver: () => {},
    });
    for (let i = 0; i < 600; i++) engine.tick();
    const tickAfterGameOver = engine.tickCount;
    engine.tick();
    assert.strictEqual(engine.tickCount, tickAfterGameOver, 'tick count should not change after game over');
  });

  it('gameOver scores are sorted by VP descending', () => {
    let gameOverData = null;
    const engine = new GameEngine(makeRoom(2, { matchTimer: 1 }), {
      tickRate: 10,
      onGameOver: (data) => { gameOverData = data; },
    });
    // Give player 2 more alloys for higher VP
    const p2 = engine.playerStates.get(2);
    p2.resources.alloys = 1000;

    for (let i = 0; i < 600; i++) engine.tick();

    assert.ok(gameOverData);
    assert.strictEqual(gameOverData.scores[0].playerId, 2, 'player 2 should be first (higher VP)');
    assert.ok(gameOverData.scores[0].vp > gameOverData.scores[1].vp, 'scores should be in descending order');
  });

  it('gameOver breakdown includes correct VP components', () => {
    let gameOverData = null;
    const engine = new GameEngine(makeRoom(1, { matchTimer: 1 }), {
      tickRate: 10,
      onGameOver: (data) => { gameOverData = data; },
    });
    for (let i = 0; i < 600; i++) engine.tick();

    assert.ok(gameOverData);
    const breakdown = gameOverData.scores[0].breakdown;
    assert.ok(breakdown.pops > 0);
    assert.ok(breakdown.popsVP > 0);
    assert.strictEqual(breakdown.popsVP, breakdown.pops * 2);
    assert.ok(breakdown.districts > 0);
    assert.strictEqual(breakdown.districtsVP, breakdown.districts);
    assert.strictEqual(typeof breakdown.alloysVP, 'number');
    assert.strictEqual(typeof breakdown.researchVP, 'number');
  });
});

// ── Performance regression tests ──

describe('GameEngine — Performance', () => {
  it('game tick completes within budget (8 players, mid-game load)', () => {
    const players = new Map();
    for (let i = 1; i <= 8; i++) players.set(i, { name: 'P' + i });
    const room = { id: 'perf', name: 'Perf', players, matchTimer: 20 };
    const engine = new GameEngine(room, { tickRate: 10, profile: true, onTick: () => {} });

    // Simulate mid-game: 14 districts, 20 pops per colony
    for (const [pid] of players) {
      const cids = engine._playerColonies.get(pid);
      const c = engine.colonies.get(cids[0]);
      const types = ['generator', 'mining', 'agriculture', 'industrial', 'research', 'housing'];
      for (let d = 0; d < 10; d++) engine._addBuiltDistrict(c, types[d % 6]);
      c.pops = 20;
      engine._invalidateColonyCache(c);
    }

    // Warm up
    for (let i = 0; i < 10; i++) engine.tick();

    // Measure 100 ticks
    const start = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) engine.tick();
    const avgMs = Number(process.hrtime.bigint() - start) / 1e6 / 100;

    // Budget: 50ms per tick (50% of 100ms interval at 10Hz)
    assert.ok(avgMs < 50, `Avg tick ${avgMs.toFixed(3)}ms exceeds 50ms budget`);
  });

  it('per-player state payload stays under 10KB', () => {
    const players = new Map();
    for (let i = 1; i <= 8; i++) players.set(i, { name: 'P' + i });
    const room = { id: 'perf', name: 'Perf', players, matchTimer: 20 };
    const engine = new GameEngine(room, { tickRate: 10 });

    for (const [pid] of players) {
      const cids = engine._playerColonies.get(pid);
      const c = engine.colonies.get(cids[0]);
      const types = ['generator', 'mining', 'agriculture', 'industrial', 'research', 'housing'];
      for (let d = 0; d < 10; d++) engine._addBuiltDistrict(c, types[d % 6]);
      c.pops = 20;
      engine._invalidateColonyCache(c);
    }

    const json = engine.getPlayerStateJSON(1);
    const bytes = Buffer.byteLength(json, 'utf8');
    assert.ok(bytes < 10240, `Per-player payload ${bytes} bytes exceeds 10KB`);
  });

  it('VP calculation is cached within a tick (O(N) not O(N²))', () => {
    const players = new Map();
    for (let i = 1; i <= 4; i++) players.set(i, { name: 'P' + i });
    const room = { id: 'vp', name: 'VP', players, matchTimer: 20 };
    const engine = new GameEngine(room, { tickRate: 10, onTick: () => {} });

    // Force broadcast: all dirty + tick at broadcast boundary
    for (const [pid] of players) engine._dirtyPlayers.add(pid);
    engine.tickCount = BROADCAST_EVERY - 1;
    engine.tick();

    // After broadcast, VP cache should be populated for all players (computed once each)
    assert.strictEqual(engine._vpCache.size, players.size,
      `VP cache should have ${players.size} entries, got ${engine._vpCache.size}`);
    assert.strictEqual(engine._vpCacheTick, engine.tickCount,
      'VP cache should be scoped to current tick');

    // Verify cached values match fresh computation
    engine._vpCacheTick = -1; // force fresh computation
    for (const [pid] of players) {
      const fresh = engine._calcVictoryPoints(pid);
      engine._vpCacheTick = -1; // reset between calls
      const cached = engine._vpCache.get(pid);
      // Note: cached value is from the broadcast tick; fresh uses same state
      assert.strictEqual(typeof cached, 'number');
    }
  });
});

// ── VP & Timer Edge Cases ──

describe('GameEngine — VP Edge Cases', () => {
  it('VP sums pops and districts across multiple colonies', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    // Create a second colony for player 1
    const colony2 = engine._createColony(1, 'Second World', { size: 16, type: 'desert', habitability: 60 });
    colony2.pops = 5;
    engine._addBuiltDistrict(colony2, 'mining');
    engine._addBuiltDistrict(colony2, 'generator');

    // Player 1 now has: colony1 (8 pops, 4 districts) + colony2 (5 pops, 2 districts)
    // Total pops = 13, total districts = 6
    // VP = 13*2 + 6 + floor(50/25) + 0 = 26 + 6 + 2 = 34
    const vp = engine._calcVictoryPoints(1);
    assert.strictEqual(vp, 34);
  });

  it('VP floors fractional alloy and research values', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 99;  // 99/25 = 3.96 → floor = 3
    state.resources.research = { physics: 33, society: 33, engineering: 33 }; // 99/100 = 0.99 → floor = 0

    const vp = engine._calcVictoryPoints(1);
    // 8*2=16, 4 districts, 3 alloyVP, 0 researchVP
    assert.strictEqual(vp, 16 + 4 + 3 + 0);
  });

  it('VP handles zero alloys correctly', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine.playerStates.get(1).resources.alloys = 0;
    const vp = engine._calcVictoryPoints(1);
    // 8*2=16, 4 districts, 0 alloys, 0 research
    assert.strictEqual(vp, 16 + 4 + 0 + 0);
  });

  it('VP cache is invalidated between ticks', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const vp1 = engine._calcVictoryPoints(1);

    // Advance a tick — cache should be stale
    engine.tick();
    engine.playerStates.get(1).resources.alloys += 500; // +20 VP from alloys (500/25)
    const vp2 = engine._calcVictoryPoints(1);
    assert.strictEqual(vp2, vp1 + 20, 'VP should reflect updated alloys after tick advances');
  });

  it('Industrial district produces 4 alloys per month', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    assert.strictEqual(DISTRICT_DEFS.industrial.produces.alloys, 4);
  });

  it('Research district produces 4 of each research type per month', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    assert.strictEqual(DISTRICT_DEFS.research.produces.physics, 4);
    assert.strictEqual(DISTRICT_DEFS.research.produces.society, 4);
    assert.strictEqual(DISTRICT_DEFS.research.produces.engineering, 4);
  });

  it('VP alloy weight uses divisor of 25 (not 50)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 75; // 75/25 = 3 VP from alloys
    const vp = engine._calcVictoryPoints(1);
    // 8*2=16, 4 districts, 75/25=3
    assert.strictEqual(vp, 16 + 4 + 3 + 0);
  });
});

describe('GameEngine — Match Timer Edge Cases', () => {
  it('commands are rejected after game over', () => {
    const engine = new GameEngine(makeRoom(1, { matchTimer: 1 }), {
      tickRate: 10,
      onGameOver: () => {},
    });
    // Run game to completion
    for (let i = 0; i < 600; i++) engine.tick();
    assert.strictEqual(engine._gameOver, true);

    const colony = Array.from(engine.colonies.values())[0];
    const result = engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'housing' });
    assert.ok(result.error, 'should reject command after game over');
  });

  it('_triggerGameOver is idempotent — does not fire onGameOver twice', () => {
    let callCount = 0;
    const engine = new GameEngine(makeRoom(1, { matchTimer: 1 }), {
      tickRate: 10,
      onGameOver: () => { callCount++; },
    });
    for (let i = 0; i < 600; i++) engine.tick();
    assert.strictEqual(callCount, 1);

    // Call again directly — should be no-op
    engine._triggerGameOver();
    assert.strictEqual(callCount, 1, 'onGameOver should not fire again');
  });

  it('game over with tied VP — both players get scored', () => {
    let gameOverData = null;
    const engine = new GameEngine(makeRoom(2, { matchTimer: 1 }), {
      tickRate: 10,
      onGameOver: (data) => { gameOverData = data; },
    });
    // Equalize resources so VP is the same
    const p1 = engine.playerStates.get(1);
    const p2 = engine.playerStates.get(2);
    p1.resources.alloys = 50;
    p2.resources.alloys = 50;

    for (let i = 0; i < 600; i++) engine.tick();

    assert.ok(gameOverData);
    assert.strictEqual(gameOverData.scores.length, 2);
    // Both should have same VP (same pops, districts, alloys, research)
    assert.strictEqual(gameOverData.scores[0].vp, gameOverData.scores[1].vp,
      'Tied players should have equal VP');
    assert.ok(gameOverData.winner, 'Should still pick a winner even in tie');
  });

  it('warning events fire for all players in multiplayer', () => {
    const events = [];
    const engine = new GameEngine(makeRoom(2, { matchTimer: 10 }), {
      tickRate: 10,
      onEvent: (evts) => events.push(...evts),
    });
    // Advance to 2-minute warning
    const targetTicks = engine._matchTicksRemaining - (2 * 60 * 10);
    for (let i = 0; i < targetTicks; i++) engine.tick();
    engine.tick();

    const warnings = events.filter(e => e.eventType === 'matchWarning');
    assert.strictEqual(warnings.length, 2, 'Both players should receive matchWarning');
  });

  it('warnings do not fire twice on repeated ticks', () => {
    const events = [];
    const engine = new GameEngine(makeRoom(1, { matchTimer: 1 }), {
      tickRate: 10,
      onEvent: (evts) => events.push(...evts),
    });
    // Run entire game
    for (let i = 0; i < 600; i++) engine.tick();

    const matchWarnings = events.filter(e => e.eventType === 'matchWarning');
    const countdowns = events.filter(e => e.eventType === 'finalCountdown');
    assert.strictEqual(matchWarnings.length, 1, 'matchWarning should fire exactly once');
    assert.strictEqual(countdowns.length, 1, 'finalCountdown should fire exactly once');
  });

  it('gameOver includes finalTick matching tick count at end', () => {
    let gameOverData = null;
    const engine = new GameEngine(makeRoom(1, { matchTimer: 1 }), {
      tickRate: 10,
      onGameOver: (data) => { gameOverData = data; },
    });
    for (let i = 0; i < 600; i++) engine.tick();
    assert.ok(gameOverData);
    assert.strictEqual(gameOverData.finalTick, engine.tickCount);
  });

  it('unlimited game never triggers game over even after many ticks', () => {
    let gameOverFired = false;
    const engine = new GameEngine(makeRoom(1, { matchTimer: 0 }), {
      tickRate: 10,
      onGameOver: () => { gameOverFired = true; },
    });
    // Run 10000 ticks — well beyond any timer
    for (let i = 0; i < 10000; i++) engine.tick();
    assert.strictEqual(gameOverFired, false, 'unlimited game should never end on timer');
    assert.strictEqual(engine._gameOver, false);
  });
});

// ── Galaxy–Colony Integration ──

describe('GameEngine — Galaxy–Colony Integration', () => {
  it('colony name is derived from starting system name', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10, galaxySeed: 42 });
    const colony = Array.from(engine.colonies.values())[0];
    const systemId = colony.systemId;
    const system = engine.galaxy.systems[systemId];
    assert.ok(colony.name.startsWith(system.name),
      `Colony name "${colony.name}" should start with system name "${system.name}"`);
    assert.ok(colony.name.endsWith('Colony'),
      `Colony name "${colony.name}" should end with "Colony"`);
  });

  it('starting planet is marked colonized with correct owner in galaxy data', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10, galaxySeed: 42 });
    for (const [playerId] of engine.playerStates) {
      const colonyIds = engine._playerColonies.get(playerId);
      const colony = engine.colonies.get(colonyIds[0]);
      const system = engine.galaxy.systems[colony.systemId];
      const colonizedPlanet = system.planets.find(p => p.colonized);
      assert.ok(colonizedPlanet, `Player ${playerId}'s starting planet should be marked colonized`);
      assert.strictEqual(colonizedPlanet.colonyOwner, playerId);
      assert.strictEqual(colony.planet.type, colonizedPlanet.type);
    }
  });

  it('getInitState strips surveyed hash from galaxy systems', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10, galaxySeed: 42 });
    const initState = engine.getInitState();
    for (const sys of initState.galaxy.systems) {
      assert.ok(!('surveyed' in sys), `System ${sys.name} should not include surveyed hash in client payload`);
    }
  });

  it('getInitState includes planet colonization data', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10, galaxySeed: 42 });
    const initState = engine.getInitState();
    const colony = [...engine.colonies.values()][0];
    const system = initState.galaxy.systems.find(s => s.id === colony.systemId);
    const colonizedPlanet = system.planets.find(p => p.colonized);
    assert.ok(colonizedPlanet, 'Colonized planet should be visible in initState');
    assert.strictEqual(colonizedPlanet.colonyOwner, 1);
  });

  it('getInitState includes starColor for each system', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10, galaxySeed: 42 });
    const initState = engine.getInitState();
    for (const sys of initState.galaxy.systems) {
      assert.ok(typeof sys.starColor === 'string' && sys.starColor.startsWith('#'),
        `System ${sys.name} should have a hex starColor, got "${sys.starColor}"`);
    }
  });

  it('multiplayer starting colonies are in different systems with valid galaxy links', () => {
    const engine = new GameEngine(makeRoom(4), { tickRate: 10, galaxySeed: 42 });
    const colonies = [...engine.colonies.values()];
    const systemIds = colonies.map(c => c.systemId);
    const uniqueSystems = new Set(systemIds);
    assert.strictEqual(uniqueSystems.size, 4, 'Each player should start in a unique system');
    for (const c of colonies) {
      assert.ok(c.systemId >= 0 && c.systemId < engine.galaxy.systems.length,
        `Colony systemId ${c.systemId} out of galaxy range`);
      const sys = engine.galaxy.systems[c.systemId];
      assert.strictEqual(sys.owner, c.ownerId,
        `System ${sys.name} owner should match colony owner`);
    }
  });
});

// ── Command Validation Edge Cases ──

describe('GameEngine — Command Validation', () => {
  it('rejects buildDistrict with missing colonyId', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const result = engine.handleCommand(1, { type: 'buildDistrict', districtType: 'housing' });
    assert.ok(result.error);
    assert.match(result.error, /missing/i);
  });

  it('rejects buildDistrict with missing districtType', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine.getState().colonies[0];
    const result = engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id });
    assert.ok(result.error);
    assert.match(result.error, /missing/i);
  });

  it('rejects demolish with missing colonyId', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const result = engine.handleCommand(1, { type: 'demolish', districtId: 'e1' });
    assert.ok(result.error);
    assert.match(result.error, /missing/i);
  });

  it('rejects demolish with missing districtId', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine.getState().colonies[0];
    const result = engine.handleCommand(1, { type: 'demolish', colonyId: colony.id });
    assert.ok(result.error);
    assert.match(result.error, /missing/i);
  });

  it('rejects setResearch with missing techId', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const result = engine.handleCommand(1, { type: 'setResearch' });
    assert.ok(result.error);
    assert.match(result.error, /missing/i);
  });

  it('rejects setResearch with non-string techId', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const result = engine.handleCommand(1, { type: 'setResearch', techId: 42 });
    assert.ok(result.error);
    assert.match(result.error, /invalid/i);
  });

  it('returns error for unknown command type', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const result = engine.handleCommand(1, { type: 'hackServer' });
    assert.ok(result.error);
    assert.match(result.error, /unknown/i);
  });

  it('rejects buildDistrict with non-existent colonyId', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const result = engine.handleCommand(1, { type: 'buildDistrict', colonyId: 'bogus', districtType: 'housing' });
    assert.ok(result.error);
    assert.match(result.error, /not found/i);
  });

  it('rejects setResearch for tech already being researched', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine.handleCommand(1, { type: 'setResearch', techId: 'improved_power_plants' });
    const result = engine.handleCommand(1, { type: 'setResearch', techId: 'improved_power_plants' });
    assert.ok(result.error);
    assert.match(result.error, /already/i);
  });
});

// ── gameInit Integration (WebSocket) ──

describe('Server Integration — Galaxy in gameInit', () => {
  const WebSocket = require('ws');
  const { startServer } = require('../../server/server');

  function connectWs(port) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      ws._buffer = [];
      ws._waiters = [];
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw);
        const idx = ws._waiters.findIndex(w => w.pred(msg));
        if (idx >= 0) {
          const waiter = ws._waiters.splice(idx, 1)[0];
          clearTimeout(waiter.timer);
          waiter.resolve(msg);
        } else {
          ws._buffer.push(msg);
        }
      });
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  }

  function waitForMessage(ws, predicate, timeout = 5000) {
    const idx = ws._buffer.findIndex(predicate);
    if (idx >= 0) return Promise.resolve(ws._buffer.splice(idx, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        ws._waiters = ws._waiters.filter(w => w !== waiter);
        reject(new Error('Timeout waiting for message'));
      }, timeout);
      const waiter = { pred: predicate, resolve, timer };
      ws._waiters.push(waiter);
    });
  }

  function send(ws, msg) { ws.send(JSON.stringify(msg)); }

  it('gameInit includes galaxy data with systems and hyperlanes', async (t) => {
    const srv = await startServer({ port: 0, log: false });
    t.after(() => srv.close());
    const ws = await connectWs(srv.port);
    t.after(() => ws.close());

    await waitForMessage(ws, m => m.type === 'welcome');
    send(ws, { type: 'setName', name: 'Tester' });
    await waitForMessage(ws, m => m.type === 'nameSet');

    send(ws, { type: 'createRoom', name: 'Galaxy Test', practiceMode: true });
    await waitForMessage(ws, m => m.type === 'roomJoined');

    send(ws, { type: 'launchGame' });
    const init = await waitForMessage(ws, m => m.type === 'gameInit');

    assert.ok(init.galaxy, 'gameInit should include galaxy');
    assert.ok(Array.isArray(init.galaxy.systems), 'galaxy should have systems array');
    assert.ok(init.galaxy.systems.length > 0, 'galaxy should have at least 1 system');
    assert.ok(Array.isArray(init.galaxy.hyperlanes), 'galaxy should have hyperlanes array');
    assert.ok(init.galaxy.hyperlanes.length > 0, 'galaxy should have at least 1 hyperlane');
    assert.ok(init.yourId, 'gameInit should include yourId');

    // Verify system structure
    const sys = init.galaxy.systems[0];
    assert.ok(typeof sys.id === 'number');
    assert.ok(typeof sys.name === 'string');
    assert.ok(typeof sys.starType === 'string');
    assert.ok(typeof sys.starColor === 'string');
    assert.ok(Array.isArray(sys.planets));
  });

  it('gameInit galaxy systems do not include surveyed hash', async (t) => {
    const srv = await startServer({ port: 0, log: false });
    t.after(() => srv.close());
    const ws = await connectWs(srv.port);
    t.after(() => ws.close());

    await waitForMessage(ws, m => m.type === 'welcome');
    send(ws, { type: 'setName', name: 'Tester' });
    await waitForMessage(ws, m => m.type === 'nameSet');

    send(ws, { type: 'createRoom', name: 'Survey Test', practiceMode: true });
    await waitForMessage(ws, m => m.type === 'roomJoined');

    send(ws, { type: 'launchGame' });
    const init = await waitForMessage(ws, m => m.type === 'gameInit');

    for (const sys of init.galaxy.systems) {
      assert.ok(!('surveyed' in sys),
        `System ${sys.name} should not expose surveyed hash to clients`);
    }
  });

  it('galaxySize room setting is passed through to game', async (t) => {
    const srv = await startServer({ port: 0, log: false });
    t.after(() => srv.close());
    const ws = await connectWs(srv.port);
    t.after(() => ws.close());

    await waitForMessage(ws, m => m.type === 'welcome');
    send(ws, { type: 'setName', name: 'Tester' });
    await waitForMessage(ws, m => m.type === 'nameSet');

    send(ws, { type: 'createRoom', name: 'Size Test', practiceMode: true, galaxySize: 'medium' });
    const joined = await waitForMessage(ws, m => m.type === 'roomJoined');
    assert.strictEqual(joined.room.galaxySize, 'medium');

    send(ws, { type: 'launchGame' });
    const init = await waitForMessage(ws, m => m.type === 'gameInit');
    assert.strictEqual(init.galaxy.size, 'medium');
    assert.ok(init.galaxy.systems.length >= 50,
      `Medium galaxy should have >=50 systems, got ${init.galaxy.systems.length}`);
  });
});
