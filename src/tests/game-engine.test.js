const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, DISTRICT_DEFS, PLANET_TYPES, MONTH_TICKS } = require('../../server/game-engine');

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
    assert.strictEqual(p.resources.minerals, 200);
    assert.strictEqual(p.resources.food, 100);
    assert.strictEqual(p.resources.alloys, 50);
    assert.strictEqual(p.resources.influence, 100);
    assert.deepStrictEqual(p.resources.research, { physics: 0, society: 0, engineering: 0 });
  });

  it('starting colony has 10 pops', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    assert.strictEqual(state.colonies[0].pops, 10);
  });

  it('starting colony has 3 pre-built districts', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    const colony = state.colonies[0];
    assert.strictEqual(colony.districts.length, 3);
    const types = colony.districts.map(d => d.type).sort();
    assert.deepStrictEqual(types, ['agriculture', 'generator', 'mining']);
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
    assert.strictEqual(state.players[0].resources.minerals, 200 - 100);

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
    // Fill up to max (planet size 16, already have 3)
    for (let i = 0; i < 13; i++) {
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
    // Colony already has 3 built districts
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
    assert.strictEqual(after.districts.length, 2);
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
    assert.strictEqual(colony.districts.length, 4); // 3 starting + 1 built
    assert.strictEqual(colony.districts[3].type, 'housing');
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
    // Starting districts: generator(+6 energy), mining(+4 minerals), agriculture(+6 food)
    // 10 pops consume 10 food, so net food = +6 - 10 = -4
    assert.strictEqual(after.energy, before.energy + 6);
    assert.strictEqual(after.minerals, before.minerals + 4);
    assert.strictEqual(after.food, before.food + 6 - 10);
  });

  it('unemployed pops produce research', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    // 3 working districts = 3 employed, 10 - 3 = 7 unemployed
    // Each unemployed pop produces 1 of each research type

    for (let i = 0; i < MONTH_TICKS; i++) {
      engine.tick();
    }

    const after = engine.playerStates.get(1).resources;
    assert.strictEqual(after.research.physics, 7);
    assert.strictEqual(after.research.society, 7);
    assert.strictEqual(after.research.engineering, 7);
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
    // Set food to negative to simulate deficit
    engine.playerStates.get(1).resources.food = -1;

    for (let i = 0; i < MONTH_TICKS; i++) {
      engine.tick();
    }

    const colony = Array.from(engine.colonies.values())[0];
    // Should have lost a pop (started with 10, food was already negative)
    assert.ok(colony.pops < 10);
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

describe('GameEngine — State Serialization', () => {
  it('getState includes production data per colony', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    const colony = state.colonies[0];
    assert.ok(colony.production);
    assert.ok(colony.production.production);
    assert.ok(colony.production.consumption);
    assert.strictEqual(colony.production.production.energy, 6); // generator
    assert.strictEqual(colony.production.production.minerals, 4); // mining
    assert.strictEqual(colony.production.production.food, 6); // agriculture
  });

  it('getState includes housing and jobs', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    const colony = state.colonies[0];
    assert.strictEqual(colony.housing, 2); // base housing only (no housing districts)
    assert.strictEqual(colony.jobs, 3); // 3 working districts
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
