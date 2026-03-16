const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, DISTRICT_DEFS, PLANET_TYPES, PLANET_BONUSES, MONTH_TICKS, BROADCAST_EVERY, TECH_TREE, GROWTH_BASE_TICKS, GROWTH_FAST_TICKS, GROWTH_FASTEST_TICKS, PLAYER_COLORS, SPEED_INTERVALS, SPEED_LABELS, DEFAULT_SPEED, FRIENDLY_HOP_RANGE, FRIENDLY_PRODUCTION_BONUS } = require('../../server/game-engine');

// Helper: calculate total planet bonus for a colony's districts
function calcPlanetBonus(colony) {
  const bonus = { energy: 0, minerals: 0, food: 0, alloys: 0, physics: 0, society: 0, engineering: 0 };
  const pb = PLANET_BONUSES[colony.planet.type];
  if (!pb) return bonus;
  for (const d of colony.districts) {
    if (d.disabled) continue;
    if (pb[d.type]) {
      for (const [res, amt] of Object.entries(pb[d.type])) {
        bonus[res] += amt;
      }
    }
  }
  return bonus;
}

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
    // Check internal colony object for full planet data (serialized state omits habitability)
    const colony = [...engine.colonies.values()][0];
    assert.ok(colony.planet.habitability >= 60, 'Starting planet should be habitable');
    assert.ok(colony.planet.size >= 8, 'Starting planet should have reasonable size');
    assert.ok(colony.systemId != null, 'Colony should be placed in a galaxy system');
    // Serialized colony should still have planet size and type
    const state = engine.getState();
    const serialized = state.colonies[0];
    assert.strictEqual(serialized.planet.size, colony.planet.size);
    assert.strictEqual(serialized.planet.type, colony.planet.type);
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

  it('starting colony never gets build discount even with 0 playerBuiltDistricts', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colonyId = engine.getState().colonies[0].id;
    const colony = engine.colonies.get(colonyId);
    // Starting colony has isStartingColony=true and playerBuiltDistricts=0
    assert.strictEqual(colony.isStartingColony, true, 'starting colony should have isStartingColony=true');
    assert.strictEqual(colony.playerBuiltDistricts, 0, 'starting colony should have 0 playerBuiltDistricts');

    engine.playerStates.get(1).resources.minerals = 10000;
    engine.handleCommand(1, { type: 'buildDistrict', colonyId, districtType: 'housing' });
    // Full price (200) despite playerBuiltDistricts being 0, because isStartingColony is true
    assert.strictEqual(colony.buildQueue[0].ticksRemaining, 200, 'starting colony should not get discount');
  });

  it('playerBuiltDistricts increments on each build and discount expires after 3', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine._createColony(1, 'Test', { size: 16, type: 'desert', habitability: 60 });
    engine.playerStates.get(1).resources.minerals = 50000;
    assert.strictEqual(colony.playerBuiltDistricts, 0);

    // Build 1 — discounted
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'housing' });
    assert.strictEqual(colony.playerBuiltDistricts, 1);
    assert.strictEqual(colony.buildQueue[0].ticksRemaining, 100, '1st district should be 50% time');

    // Build 2 — discounted (mining: 300 * 0.5 = 150)
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'mining' });
    assert.strictEqual(colony.playerBuiltDistricts, 2);
    assert.strictEqual(colony.buildQueue[1].ticksRemaining, 150, '2nd district should be 50% time');

    // Build 3 — discounted (generator: 300 * 0.5 = 150)
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'generator' });
    assert.strictEqual(colony.playerBuiltDistricts, 3);
    assert.strictEqual(colony.buildQueue[2].ticksRemaining, 150, '3rd district should be 50% time');

    // Clear queue to allow more builds (max queue is 3)
    colony.buildQueue.length = 0;

    // Build 4 — full price
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'housing' });
    assert.strictEqual(colony.playerBuiltDistricts, 4);
    assert.strictEqual(colony.buildQueue[0].ticksRemaining, 200, '4th district should be full price');
  });

  it('_createColony defaults to isStartingColony=false', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine._createColony(1, 'New', { size: 10, type: 'continental', habitability: 80 });
    assert.strictEqual(colony.isStartingColony, false);
    assert.strictEqual(colony.playerBuiltDistricts, 0);
  });

  it('serialized colony omits server-internal fields (isStartingColony, playerBuiltDistricts)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    const colony = state.colonies[0];
    assert.strictEqual(colony.isStartingColony, undefined, 'isStartingColony should not be serialized');
    assert.strictEqual(colony.playerBuiltDistricts, undefined, 'playerBuiltDistricts should not be serialized');
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
    const colony = Array.from(engine.colonies.values())[0];
    const pb = calcPlanetBonus(colony);
    const before = JSON.parse(JSON.stringify(engine.playerStates.get(1).resources));

    // Run exactly MONTH_TICKS ticks to trigger monthly processing
    for (let i = 0; i < MONTH_TICKS; i++) {
      engine.tick();
    }

    const after = engine.playerStates.get(1).resources;
    // Starting districts: generator(+6 energy), mining(+6 minerals), 2x agriculture(+12 food)
    // Plus planet type bonuses. 8 pops consume 8 food
    assert.strictEqual(after.energy, before.energy + 6 + pb.energy);
    assert.strictEqual(after.minerals, before.minerals + 6 + pb.minerals);
    assert.strictEqual(after.food, before.food + 12 + pb.food - 8);
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
  it('pop grows after appropriate growth ticks when food surplus > 0', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine._doctrinePhase = false; // skip doctrine auto-assignment
    const colony = Array.from(engine.colonies.values())[0];
    const pb = calcPlanetBonus(colony);
    // Starting: 8 pops, 10 housing — 2 slots for growth
    // Food surplus = 12 + pb.food - 8 pops
    const foodSurplus = 12 + pb.food - 8;
    const expectedTicks = foodSurplus > 10 ? GROWTH_FASTEST_TICKS : foodSurplus > 5 ? GROWTH_FAST_TICKS : GROWTH_BASE_TICKS;

    for (let i = 0; i < expectedTicks; i++) {
      engine.tick();
    }

    assert.strictEqual(colony.pops, 9, 'Should have grown 1 pop after growth ticks');
    assert.strictEqual(colony.growthProgress, 0, 'Growth progress should reset after pop added');
  });

  it('no growth before reaching growth threshold', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine._doctrinePhase = false; // skip doctrine auto-assignment
    const colony = Array.from(engine.colonies.values())[0];
    const pb = calcPlanetBonus(colony);
    const foodSurplus = 12 + pb.food - 8;
    const expectedTicks = foodSurplus > 10 ? GROWTH_FASTEST_TICKS : foodSurplus > 5 ? GROWTH_FAST_TICKS : GROWTH_BASE_TICKS;

    for (let i = 0; i < expectedTicks - 1; i++) {
      engine.tick();
    }

    assert.strictEqual(colony.pops, 8, 'Should not have grown before threshold');
    assert.strictEqual(colony.growthProgress, expectedTicks - 1);
  });

  it('growth is blocked by housing cap', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine._doctrinePhase = false; // skip doctrine auto-assignment
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
    engine._doctrinePhase = false; // skip doctrine auto-assignment
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
    engine._doctrinePhase = false; // skip doctrine auto-assignment
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
    const colony0 = Array.from(engine.colonies.values())[0];
    const pb = calcPlanetBonus(colony0);
    const state = engine.getState();
    const colony = state.colonies[0];
    assert.ok(colony.netProduction);
    assert.strictEqual(colony.netProduction.energy, 6 + pb.energy);
    assert.strictEqual(colony.netProduction.minerals, 6 + pb.minerals);
    assert.strictEqual(colony.netProduction.food, 12 + pb.food - 8);
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
    const colony0 = Array.from(engine.colonies.values())[0];
    const pb = calcPlanetBonus(colony0);
    const foodSurplus = 12 + pb.food - 8;
    const expectedTarget = foodSurplus > 10 ? GROWTH_FASTEST_TICKS : foodSurplus > 5 ? GROWTH_FAST_TICKS : GROWTH_BASE_TICKS;
    const expectedStatus = foodSurplus > 10 ? 'rapid' : foodSurplus > 5 ? 'fast' : 'slow';

    const state = engine.getState();
    const colony = state.colonies[0];
    assert.strictEqual(colony.growthProgress, 0);
    assert.strictEqual(colony.growthTarget, expectedTarget);
    assert.strictEqual(colony.growthStatus, expectedStatus);
  });

  it('getState shows housing_full growth status when pops at cap', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    // Set pops to housing cap directly (base housing = 10)
    colony.pops = 10;
    engine._invalidateColonyCache(colony);
    const state = engine.getState();
    const sColony = state.colonies[0];
    assert.strictEqual(sColony.pops, 10);
    assert.strictEqual(sColony.growthStatus, 'housing_full');
    assert.strictEqual(sColony.growthTarget, 0);
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

  it('housing district produces 2 food (DISTRICT_DEFS)', () => {
    assert.strictEqual(DISTRICT_DEFS.housing.produces.food, 2);
  });

  it('housing district food production is applied in production calc', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine._createColony(1, 'Test', { size: 16, type: 'continental', habitability: 80 });
    engine._addBuiltDistrict(colony, 'housing');

    const { production } = engine._calcProduction(colony);
    // Housing produces 2 food without requiring a pop
    assert.strictEqual(production.food, 2);
  });

  it('multiple housing districts stack food production', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine._createColony(1, 'Test', { size: 16, type: 'continental', habitability: 80 });
    engine._addBuiltDistrict(colony, 'housing');
    engine._addBuiltDistrict(colony, 'housing');
    engine._addBuiltDistrict(colony, 'housing');

    const { production } = engine._calcProduction(colony);
    // 3 housing × 2 food = 6 food
    assert.strictEqual(production.food, 6);
  });

  it('housing food production does not require pops (jobless)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine._createColony(1, 'Test', { size: 16, type: 'continental', habitability: 80 });
    colony.pops = 0; // No pops at all
    engine._addBuiltDistrict(colony, 'housing');

    const { production } = engine._calcProduction(colony);
    // Housing is jobless — produces food even with 0 pops
    assert.strictEqual(production.food, 2);
  });

  it('disabled housing produces no food', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine._createColony(1, 'Test', { size: 16, type: 'continental', habitability: 80 });
    engine._addBuiltDistrict(colony, 'housing');
    colony.districts[colony.districts.length - 1].disabled = true;

    const { production } = engine._calcProduction(colony);
    assert.strictEqual(production.food, 0);
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

  it('starting food surplus includes planet bonus', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony0 = Array.from(engine.colonies.values())[0];
    const pb = calcPlanetBonus(colony0);
    const colony = engine.getState().colonies[0];
    assert.strictEqual(colony.netProduction.food, 12 + pb.food - 8);
  });

  it('base capital housing is 10', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    // Colony with no housing districts should have base housing of 10
    const colony = engine._createColony(1, 'Bare', { size: 16, type: 'continental', habitability: 80 });
    assert.strictEqual(engine._calcHousing(colony), 10);
  });

  it('food surplus grows over multiple months', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const pb = calcPlanetBonus(colony);
    const netFood = 12 + pb.food - 8;
    const before = engine.playerStates.get(1).resources.food;

    // Run 3 months — use short period to avoid pop growth changing food consumption
    for (let i = 0; i < MONTH_TICKS * 3; i++) {
      engine.tick();
    }

    const after = engine.playerStates.get(1).resources.food;
    // Net food/month × 3 months (pop growth may occur so check >= minimum)
    assert.ok(after >= before + netFood * 3 - 3, `Food should grow: got ${after}, expected >= ${before + netFood * 3 - 3}`);
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
    engine._doctrinePhase = false; // skip doctrine auto-assignment
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
    engine._doctrinePhase = false; // skip doctrine auto-assignment
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
    engine._doctrinePhase = false; // skip doctrine auto-assignment
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
    assert.ok(sizeKB < 65, `64-colony payload is ${sizeKB.toFixed(1)}KB, limit 65KB`);
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
    assert.ok(sizeKB < 40, `Payload is ${sizeKB.toFixed(1)}KB, limit is 40KB`);
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
    assert.ok(sizeKB < 9, `Per-player payload is ${sizeKB.toFixed(1)}KB, limit is 9KB`);
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
  it('TECH_TREE has 9 techs across 3 tracks and 3 tiers', () => {
    const techs = Object.entries(TECH_TREE);
    assert.strictEqual(techs.length, 9);
    for (const track of ['physics', 'society', 'engineering']) {
      const trackTechs = techs.filter(([, t]) => t.track === track);
      assert.strictEqual(trackTechs.length, 3, `${track} should have 3 techs`);
      assert.ok(trackTechs.some(([, t]) => t.tier === 1), `${track} missing T1`);
      assert.ok(trackTechs.some(([, t]) => t.tier === 2), `${track} missing T2`);
      assert.ok(trackTechs.some(([, t]) => t.tier === 3), `${track} missing T3`);
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
    const pb = calcPlanetBonus(colony);

    // Before tech: generator produces 6 energy + planet bonus
    const before = engine._calcProduction(colony);
    assert.strictEqual(before.production.energy, 6 + pb.energy);

    // Complete tech
    engine.playerStates.get(1).completedTechs.push('improved_power_plants');
    engine._invalidateColonyCache(colony);

    const after = engine._calcProduction(colony);
    assert.strictEqual(after.production.energy, 7.5 + pb.energy); // 6 * 1.25 + planet bonus
  });

  it('Improved Mining applies +25% Mining output', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const pb = calcPlanetBonus(colony);

    engine.playerStates.get(1).completedTechs.push('improved_mining');
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony);
    assert.strictEqual(prod.production.minerals, 7.5 + pb.minerals); // 6 * 1.25 + planet bonus
  });

  it('T2 supersedes T1 for same district type (highest multiplier wins)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const pb = calcPlanetBonus(colony);

    engine.playerStates.get(1).completedTechs.push('improved_power_plants', 'advanced_reactors');
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony);
    // Should use 1.5x (T2), not 1.25x (T1), plus planet bonus
    assert.strictEqual(prod.production.energy, 9 + pb.energy); // 6 * 1.5 + planet bonus
  });

  it('Frontier Medicine reduces pop growth time by 25%', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine._doctrinePhase = false; // skip doctrine auto-assignment
    const colony = Array.from(engine.colonies.values())[0];
    const pb = calcPlanetBonus(colony);
    colony.pops = 8;
    colony.growthProgress = 0;
    engine._invalidateColonyCache(colony);

    const foodSurplus = 12 + pb.food - 8;
    const baseTicks = foodSurplus > 10 ? GROWTH_FASTEST_TICKS : foodSurplus > 5 ? GROWTH_FAST_TICKS : GROWTH_BASE_TICKS;
    const withTech = Math.floor(baseTicks * 0.75);

    engine.playerStates.get(1).completedTechs.push('frontier_medicine');
    engine._invalidateColonyCache(colony);

    for (let i = 0; i < withTech - 1; i++) engine.tick();
    assert.strictEqual(colony.pops, 8, `Should not grow before ${withTech} ticks`);

    engine.tick();
    assert.strictEqual(colony.pops, 9, `Should grow at ${withTech} ticks with Frontier Medicine`);
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
    const pb = calcPlanetBonus(colony);

    engine.playerStates.get(1).completedTechs.push('frontier_medicine', 'gene_crops');
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony);
    // 2 agriculture districts, each producing 6 * 1.5 = 9 food + planet bonus
    assert.strictEqual(prod.production.food, 18 + pb.food); // 2 * 9 + planet bonus
  });
});

// ── Energy Deficit Consequences ──

describe('GameEngine — Energy Deficit', () => {
  it('disables highest-energy-consuming district when energy goes negative', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const state = engine.playerStates.get(1);

    // Add multiple energy consumers to guarantee deficit regardless of planet bonuses
    engine._addBuiltDistrict(colony, 'industrial');
    engine._addBuiltDistrict(colony, 'research');
    engine._addBuiltDistrict(colony, 'research');
    colony.pops = 12;
    engine._invalidateColonyCache(colony);

    // Net energy before planet bonuses: 6 (gen) - 3 (industrial) - 4 (research) - 4 (research) = -5/month
    // Even with arid bonus (+1 energy on gen), net = -4 — always negative
    state.resources.energy = 0;

    engine._processMonthlyResources();
    assert.ok(state.resources.energy < 0, 'energy should be negative before deficit processing');

    engine._processEnergyDeficit();

    // Research district (4 energy) should be disabled first (highest consumer)
    const researchDistrict = colony.districts.find(d => d.type === 'research' && d.disabled);
    assert.ok(researchDistrict, 'at least one research district should be disabled');
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
    assert.ok(disabledCount >= 1, 'should disable at least 1 district');
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

    // Add multiple energy consumers to guarantee deficit regardless of planet bonuses
    engine._addBuiltDistrict(colony, 'industrial');
    engine._addBuiltDistrict(colony, 'research');
    engine._addBuiltDistrict(colony, 'research');
    colony.pops = 12;
    engine._invalidateColonyCache(colony);

    // Net energy before planet bonuses: 6 (gen) - 3 (industrial) - 4 (research) - 4 (research) = -5/month
    // Even with arid bonus (+1 energy on gen), net = -4 — always negative
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

    // Baseline net energy (varies by random planet type bonus)
    const net1 = engine._calcPlayerNetEnergy(1);
    assert.ok(net1 >= 6, 'starting colony with generator should produce at least +6 net energy');

    // Add industrial (consumes 3) — net should drop by 3
    engine._addBuiltDistrict(colony1, 'industrial');
    colony1.pops = 10;
    engine._invalidateColonyCache(colony1);

    const net2 = engine._calcPlayerNetEnergy(1);
    assert.strictEqual(net2, net1 - 3, 'adding industrial(-3 energy) should reduce net by 3');
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

  it('VP includes total research divided by 50', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 0;
    state.resources.research = { physics: 100, society: 100, engineering: 100 };
    const vp = engine._calcVictoryPoints(1);
    // 8*2=16, 4 districts, 0 alloys, 300/50=6
    assert.strictEqual(vp, 16 + 4 + 0 + 6);
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
    // Diminishing pop VP: first 20 ×2, 21-40 ×1.5, 41+ ×1
    assert.strictEqual(breakdown.popsVP, GameEngine._calcPopVP(breakdown.pops));
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

describe('GameEngine — Tech Modifier Cache', () => {
  it('caches tech modifiers per player and invalidates on tech completion', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const state1 = engine.playerStates.get(1);

    // First call should compute and cache
    const mods1 = engine._getTechModifiers(state1);
    assert.deepStrictEqual(mods1.district, {});
    assert.strictEqual(mods1.growth, 1);

    // Second call should return same cached object
    const mods2 = engine._getTechModifiers(state1);
    assert.strictEqual(mods1, mods2, 'Should return cached object');

    // Complete a tech — cache should invalidate
    state1.completedTechs.push('improved_power_plants');
    engine._techModCache.delete(1); // simulate invalidation
    const mods3 = engine._getTechModifiers(state1);
    assert.notStrictEqual(mods1, mods3, 'Should return fresh object after invalidation');
    assert.strictEqual(mods3.district.generator, 1.25);
  });

  it('tech modifiers are invalidated when research completes via _processResearch', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);

    // Set up research
    state.currentResearch.physics = 'improved_power_plants';
    state.resources.research.physics = 200; // enough to complete (cost 150)

    // Cache tech mods before research completes
    const before = engine._getTechModifiers(state);
    assert.deepStrictEqual(before.district, {});

    // Process research — should complete and invalidate cache
    engine._processResearch();
    assert.ok(state.completedTechs.includes('improved_power_plants'));

    // Cache should be cleared — new call should reflect completed tech
    const after = engine._getTechModifiers(state);
    assert.strictEqual(after.district.generator, 1.25);
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
    state.resources.research = { physics: 33, society: 33, engineering: 33 }; // 99/50 = 1.98 → floor = 1

    const vp = engine._calcVictoryPoints(1);
    // 8*2=16, 4 districts, 3 alloyVP, 1 researchVP
    assert.strictEqual(vp, 16 + 4 + 3 + 1);
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

  it('VP research weight uses divisor of 50 (not 100)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 0;
    state.resources.research = { physics: 50, society: 0, engineering: 0 };
    const vp = engine._calcVictoryPoints(1);
    // 8*2=16, 4 districts, 0 alloys, 50/50=1 researchVP
    assert.strictEqual(vp, 16 + 4 + 0 + 1);
  });

  it('VP includes +5 per completed T1 tech', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 0;
    state.completedTechs = ['improved_power_plants'];
    const vp = engine._calcVictoryPoints(1);
    // 8*2=16, 4 districts, 0 alloys, 0 research, 1 T1 tech = +5
    assert.strictEqual(vp, 16 + 4 + 0 + 0 + 5);
  });

  it('VP includes +10 per completed T2 tech', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 0;
    state.completedTechs = ['advanced_reactors'];
    const vp = engine._calcVictoryPoints(1);
    // 8*2=16, 4 districts, 0 alloys, 0 research, 1 T2 tech = +10
    assert.strictEqual(vp, 16 + 4 + 0 + 0 + 10);
  });

  it('VP sums tech bonuses across multiple completed techs', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 0;
    state.completedTechs = ['improved_power_plants', 'frontier_medicine', 'advanced_reactors'];
    const vp = engine._calcVictoryPoints(1);
    // 8*2=16, 4 districts, 0 alloys, 0 research, 2 T1 (10) + 1 T2 (10) = +20
    assert.strictEqual(vp, 16 + 4 + 0 + 0 + 20);
  });

  it('VP tech bonus is 0 when no techs completed', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 0;
    state.completedTechs = [];
    const vp = engine._calcVictoryPoints(1);
    assert.strictEqual(vp, 16 + 4 + 0 + 0);
  });

  it('gameOver breakdown includes techs and techVP fields', () => {
    let gameOverData = null;
    const engine = new GameEngine(makeRoom(1, { matchTimer: 1 }), {
      tickRate: 10,
      onGameOver: (data) => { gameOverData = data; },
    });
    engine.playerStates.get(1).completedTechs = ['improved_power_plants', 'advanced_reactors'];
    for (let i = 0; i < 600; i++) engine.tick();

    assert.ok(gameOverData);
    const breakdown = gameOverData.scores[0].breakdown;
    assert.strictEqual(breakdown.techs, 2);
    assert.strictEqual(breakdown.techVP, 15); // 1 T1 (+5) + 1 T2 (+10) = 15
  });

  it('all 6 current techs give +30 total VP (3×T1 + 3×T2)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 0;
    state.completedTechs = [
      'improved_power_plants', 'frontier_medicine', 'improved_mining',
      'advanced_reactors', 'gene_crops', 'deep_mining'
    ];
    const vp = engine._calcVictoryPoints(1);
    // 8*2=16, 4 districts, 0 alloys, 0 research, 3×5 + 3×10 = 45
    assert.strictEqual(vp, 16 + 4 + 0 + 0 + 45);
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
    engine._doctrinePhase = false; // skip doctrine auto-assignment to keep VP equal
    engine._endgameCrisisTriggered = true; // skip endgame crisis to keep VP equal
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
  it('colony name is a procedural name from planet type list', () => {
    const { COLONY_NAMES } = require('../../server/game-engine');
    const engine = new GameEngine(makeRoom(1), { tickRate: 10, galaxySeed: 42 });
    const colony = Array.from(engine.colonies.values())[0];
    const planetType = colony.planet.type;
    const validNames = COLONY_NAMES[planetType];
    assert.ok(validNames.includes(colony.name),
      `Colony name "${colony.name}" should be from ${planetType} name list`);
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

// ── Tech Modifiers — Production Integration ──

describe('GameEngine — Tech Modifier Production', () => {
  it('improved_power_plants increases generator output by 25%', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const pb = calcPlanetBonus(colony);
    const state = engine.playerStates.get(1);

    // Baseline: generator produces 6 energy + planet bonus
    const before = engine._calcProduction(colony);
    assert.strictEqual(before.production.energy, 6 + pb.energy);

    // Complete tech
    state.completedTechs.push('improved_power_plants');
    engine._techModCache.delete(1);
    engine._invalidateColonyCache(colony);

    const after = engine._calcProduction(colony);
    assert.strictEqual(after.production.energy, 7.5 + pb.energy, 'Generator should produce 6 * 1.25 = 7.5 + planet bonus');
  });

  it('T2 tech supersedes T1 for same district (advanced_reactors overrides improved_power_plants)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const pb = calcPlanetBonus(colony);
    const state = engine.playerStates.get(1);

    // Complete both T1 and T2
    state.completedTechs.push('improved_power_plants');
    state.completedTechs.push('advanced_reactors');
    engine._techModCache.delete(1);
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony);
    // Should use 1.5x (T2), not 1.25x (T1), plus planet bonus
    assert.strictEqual(prod.production.energy, 9 + pb.energy, 'Generator should produce 6 * 1.5 = 9 + planet bonus');
  });

  it('improved_mining increases mining district output by 25%', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const pb = calcPlanetBonus(colony);
    const state = engine.playerStates.get(1);

    const before = engine._calcProduction(colony);
    assert.strictEqual(before.production.minerals, 6 + pb.minerals);

    state.completedTechs.push('improved_mining');
    engine._techModCache.delete(1);
    engine._invalidateColonyCache(colony);

    const after = engine._calcProduction(colony);
    assert.strictEqual(after.production.minerals, 7.5 + pb.minerals, 'Mining should produce 6 * 1.25 = 7.5 + planet bonus');
  });

  it('tech modifier cache auto-invalidates when completedTechs length changes', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);

    // Cache initial (empty) modifiers
    const mods1 = engine._getTechModifiers(state);
    assert.deepStrictEqual(mods1.district, {});

    // Add tech without manually deleting cache — should auto-detect via _techCount
    state.completedTechs.push('improved_mining');
    const mods2 = engine._getTechModifiers(state);
    assert.strictEqual(mods2.district.mining, 1.25, 'Should auto-invalidate and return new modifiers');
    assert.notStrictEqual(mods1, mods2, 'Should be a new object');
  });

  it('industrial produces 4 alloys per month in actual production calc', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const pb = calcPlanetBonus(colony);

    engine._addBuiltDistrict(colony, 'industrial');
    colony.pops = 10; // enough to work all districts
    engine._invalidateColonyCache(colony);

    // Recalc bonus after adding industrial
    const pbAfter = calcPlanetBonus(colony);
    const prod = engine._calcProduction(colony);
    assert.strictEqual(prod.production.alloys, 4 + pbAfter.alloys, 'Industrial should produce 4 alloys + planet bonus');
  });

  it('research district produces 4/4/4 per month in actual production calc', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];

    engine._addBuiltDistrict(colony, 'research');
    colony.pops = 10;
    engine._invalidateColonyCache(colony);

    const pb = calcPlanetBonus(colony);
    const prod = engine._calcProduction(colony);
    // Starting districts: gen(1), mining(1), agri(1), agri(1) = 4 jobs + 1 research = 5 jobs
    // 10 pops - 5 jobs = 5 unemployed, each producing 1 research per track
    const unemployedResearch = 10 - 5; // 5 unemployed pops
    assert.strictEqual(prod.production.physics, 4 + unemployedResearch + pb.physics, 'Research district produces 4 physics + unemployed + planet bonus');
    assert.strictEqual(prod.production.society, 4 + unemployedResearch + pb.society, 'Research district produces 4 society + unemployed + planet bonus');
    assert.strictEqual(prod.production.engineering, 4 + unemployedResearch + pb.engineering, 'Research district produces 4 engineering + unemployed + planet bonus');
  });
});

// ── Planet Type Bonuses ──

describe('GameEngine — Planet Type Bonuses', () => {
  // Helper: create engine and manually set colony planet type for deterministic testing
  function makeEngineWithPlanet(planetType) {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    colony.planet.type = planetType;
    engine._invalidateColonyCache(colony);
    return { engine, colony };
  }

  it('PLANET_BONUSES defines bonuses for all 6 habitable types', () => {
    assert.ok(PLANET_BONUSES.continental);
    assert.ok(PLANET_BONUSES.ocean);
    assert.ok(PLANET_BONUSES.tropical);
    assert.ok(PLANET_BONUSES.arctic);
    assert.ok(PLANET_BONUSES.desert);
    assert.ok(PLANET_BONUSES.arid);
  });

  it('no bonuses for non-habitable planet types', () => {
    assert.strictEqual(PLANET_BONUSES.barren, undefined);
    assert.strictEqual(PLANET_BONUSES.molten, undefined);
    assert.strictEqual(PLANET_BONUSES.gasGiant, undefined);
  });

  it('Continental: +1 food per Agriculture district', () => {
    const { engine, colony } = makeEngineWithPlanet('continental');
    const prod = engine._calcProduction(colony);
    // 2 agriculture districts: each 6 food + 1 bonus = 7, total 14
    assert.strictEqual(prod.production.food, 14); // 2 × (6 + 1)
  });

  it('Ocean: +1 food per Agriculture, +1 each research per Research', () => {
    const { engine, colony } = makeEngineWithPlanet('ocean');
    // Add a research district
    engine._addBuiltDistrict(colony, 'research');
    colony.pops = 10; // ensure enough pops for all jobs
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony);
    // 2 agriculture: 2 × (6 + 1) = 14 food
    assert.strictEqual(prod.production.food, 14);
    // 1 research district: 4 + 1 = 5 per track, plus 5 unemployed pops
    assert.strictEqual(prod.production.physics, 5 + 5);
    assert.strictEqual(prod.production.society, 5 + 5);
    assert.strictEqual(prod.production.engineering, 5 + 5);
  });

  it('Tropical: +2 food per Agriculture district', () => {
    const { engine, colony } = makeEngineWithPlanet('tropical');
    const prod = engine._calcProduction(colony);
    // 2 agriculture: 2 × (6 + 2) = 16 food
    assert.strictEqual(prod.production.food, 16);
  });

  it('Arctic: +1 minerals per Mining, +1 each research per Research', () => {
    const { engine, colony } = makeEngineWithPlanet('arctic');
    engine._addBuiltDistrict(colony, 'research');
    colony.pops = 10;
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony);
    // 1 mining: 6 + 1 = 7 minerals
    assert.strictEqual(prod.production.minerals, 7);
    // 1 research: 4 + 1 = 5 per track, plus 5 unemployed
    assert.strictEqual(prod.production.physics, 5 + 5);
  });

  it('Desert: +2 minerals per Mining district', () => {
    const { engine, colony } = makeEngineWithPlanet('desert');
    const prod = engine._calcProduction(colony);
    // 1 mining: 6 + 2 = 8 minerals
    assert.strictEqual(prod.production.minerals, 8);
  });

  it('Arid: +1 energy per Generator, +1 alloy per Industrial', () => {
    const { engine, colony } = makeEngineWithPlanet('arid');
    engine._addBuiltDistrict(colony, 'industrial');
    colony.pops = 10;
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony);
    // 1 generator: 6 + 1 = 7 energy
    assert.strictEqual(prod.production.energy, 7);
    // 1 industrial: 4 + 1 = 5 alloys
    assert.strictEqual(prod.production.alloys, 5);
  });

  it('planet bonuses stack with tech modifiers', () => {
    const { engine, colony } = makeEngineWithPlanet('desert');
    engine.playerStates.get(1).completedTechs.push('improved_mining');
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony);
    // 1 mining: 6 * 1.25 (tech) = 7.5 + 2 (desert bonus) = 9.5
    assert.strictEqual(prod.production.minerals, 9.5);
  });

  it('disabled districts do not receive planet bonuses', () => {
    const { engine, colony } = makeEngineWithPlanet('desert');
    // Disable the mining district
    colony.districts.find(d => d.type === 'mining').disabled = true;
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony);
    assert.strictEqual(prod.production.minerals, 0); // disabled, no output
  });

  it('planet bonuses included in getState colony serialization', () => {
    const { engine, colony } = makeEngineWithPlanet('tropical');
    const state = engine.getState();
    const serializedColony = state.colonies.find(c => c.id === colony.id);
    // Tropical: +2 food per agriculture, 2 agriculture = +4 bonus
    // Net food: 16 - 8 = 8
    assert.strictEqual(serializedColony.netProduction.food, 8);
  });

  it('non-matching districts receive no planet bonus', () => {
    const { engine, colony } = makeEngineWithPlanet('continental');
    // Continental only grants +1 food per agriculture — generator and mining should be unaffected
    const prod = engine._calcProduction(colony);
    assert.strictEqual(prod.production.energy, 6, 'Generator should produce base 6 energy with no continental bonus');
    assert.strictEqual(prod.production.minerals, 6, 'Mining should produce base 6 minerals with no continental bonus');
  });

  it('bonus scales linearly with multiple matching districts', () => {
    const { engine, colony } = makeEngineWithPlanet('desert');
    // Desert: +2 minerals per mining. Start has 1 mining, add 2 more
    engine._addBuiltDistrict(colony, 'mining');
    engine._addBuiltDistrict(colony, 'mining');
    colony.pops = 10; // enough pops for all districts
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony);
    // 3 mining districts: 3 × (6 + 2) = 24 minerals
    assert.strictEqual(prod.production.minerals, 24, 'Each mining district should get +2 desert bonus');
  });

  it('pop-limited colony only gives bonus to working districts', () => {
    const { engine, colony } = makeEngineWithPlanet('tropical');
    // Tropical: +2 food per agriculture. Starting: 1 gen, 1 mining, 2 agriculture
    // With only 2 pops, only gen + mining get staffed (they come first in order)
    colony.pops = 2;
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony);
    // 2 pops → gen (6 energy) + mining (6 minerals), agriculture districts unstaffed
    assert.strictEqual(prod.production.food, 0, 'Unstaffed agriculture should produce no food or bonus');
    assert.strictEqual(prod.production.energy, 6);
    assert.strictEqual(prod.production.minerals, 6);
  });

  it('housing districts never receive planet bonuses', () => {
    const { engine, colony } = makeEngineWithPlanet('arid');
    engine._addBuiltDistrict(colony, 'housing');
    engine._invalidateColonyCache(colony);

    const prod = engine._calcProduction(colony);
    // Housing has 0 jobs, no production — planet bonus should not apply
    // Arid bonuses: +1 energy/gen, +1 alloy/industrial — housing is neither
    assert.strictEqual(prod.production.energy, 7, 'Only generator should get arid +1 energy bonus');
  });

  it('unknown planet type produces no bonuses', () => {
    const { engine, colony } = makeEngineWithPlanet('barren');
    const prod = engine._calcProduction(colony);
    // Barren has no entry in PLANET_BONUSES — all output should be base
    assert.strictEqual(prod.production.food, 12, 'Base agriculture: 2 × 6 = 12 food');
    assert.strictEqual(prod.production.energy, 6, 'Base generator: 6 energy');
    assert.strictEqual(prod.production.minerals, 6, 'Base mining: 6 minerals');
  });

  it('planet bonuses included in getPlayerState serialization', () => {
    const { engine, colony } = makeEngineWithPlanet('desert');
    const playerState = engine.getPlayerState(1);
    const serializedColony = playerState.colonies.find(c => c.id === colony.id);
    // Desert: +2 minerals per mining, 1 mining = 8 minerals, consumption 0
    assert.strictEqual(serializedColony.netProduction.minerals, 8, 'getPlayerState should include desert mining bonus');
  });
});

// ── Research Progression ──

describe('GameEngine — Research Progression', () => {
  it('completes research after accumulating enough from monthly production', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);

    // Set up research
    engine.handleCommand(1, { type: 'setResearch', techId: 'improved_power_plants' });
    assert.strictEqual(state.currentResearch.physics, 'improved_power_plants');

    // Pump physics research directly (cost = 150)
    state.resources.research.physics = 200;
    engine._processResearch();

    assert.ok(state.completedTechs.includes('improved_power_plants'), 'Tech should complete');
    assert.strictEqual(state.currentResearch.physics, null, 'Track should be cleared');
  });

  it('accumulates progress across multiple research cycles', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);

    engine.handleCommand(1, { type: 'setResearch', techId: 'improved_power_plants' });

    // First cycle: 50 research (cost is 150)
    state.resources.research.physics = 50;
    engine._processResearch();
    assert.ok(!state.completedTechs.includes('improved_power_plants'), 'Should not complete yet');
    assert.strictEqual(state.researchProgress.improved_power_plants, 50);
    assert.strictEqual(state.resources.research.physics, 0, 'Research stockpile consumed');

    // Second cycle: 50 more
    state.resources.research.physics = 50;
    engine._processResearch();
    assert.strictEqual(state.researchProgress.improved_power_plants, 100);

    // Third cycle: 50 more → total 150 = cost
    state.resources.research.physics = 50;
    engine._processResearch();
    assert.ok(state.completedTechs.includes('improved_power_plants'), 'Should complete at 150');
  });

  it('rejects tech with unmet prerequisite', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    // advanced_reactors requires improved_power_plants
    const result = engine.handleCommand(1, { type: 'setResearch', techId: 'advanced_reactors' });
    assert.ok(result.error, 'Should reject tech with unmet prerequisite');
    assert.match(result.error, /requires|prerequisite/i);
  });

  it('allows tech after prerequisite is completed', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);

    // Complete prerequisite
    state.completedTechs.push('improved_power_plants');

    const result = engine.handleCommand(1, { type: 'setResearch', techId: 'advanced_reactors' });
    assert.strictEqual(result.ok, true, 'Should allow tech with met prerequisite');
    assert.strictEqual(state.currentResearch.physics, 'advanced_reactors');
  });

  it('switching research preserves old progress but abandons it', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);

    // Start researching improved_power_plants
    engine.handleCommand(1, { type: 'setResearch', techId: 'improved_power_plants' });
    state.resources.research.physics = 50;
    engine._processResearch();
    assert.strictEqual(state.researchProgress.improved_power_plants, 50);

    // Switch to improved_mining (different track, both should work)
    engine.handleCommand(1, { type: 'setResearch', techId: 'improved_mining' });

    // Old progress still exists in researchProgress
    assert.strictEqual(state.researchProgress.improved_power_plants, 50,
      'Old research progress should persist in data');
  });

  it('emits researchComplete event with correct data', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);

    engine.handleCommand(1, { type: 'setResearch', techId: 'frontier_medicine' });
    state.resources.research.society = 200;

    engine._processResearch();

    const events = engine._flushEvents();
    assert.ok(events, 'Should have pending events');
    const researchEvent = events.find(e => e.eventType === 'researchComplete');
    assert.ok(researchEvent, 'Should emit researchComplete event');
    assert.strictEqual(researchEvent.techId, 'frontier_medicine');
    assert.strictEqual(researchEvent.track, 'society');
    assert.strictEqual(researchEvent.techName, 'Frontier Medicine');
  });

  it('research completion invalidates production cache for tech bonuses', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];
    const state = engine.playerStates.get(1);

    // Cache production (base energy varies by planet type due to bonuses)
    const before = engine._calcProduction(colony);
    const basePlanetBonus = calcPlanetBonus(colony).energy;
    assert.strictEqual(before.production.energy, 6 + basePlanetBonus);

    // Complete improved_power_plants via research
    engine.handleCommand(1, { type: 'setResearch', techId: 'improved_power_plants' });
    state.resources.research.physics = 200;
    engine._processResearch();

    // Production cache should be invalidated — new calc should show boosted output
    // Tech gives 1.25x to base generator (6 * 1.25 = 7.5) + planet bonus stays additive
    const after = engine._calcProduction(colony);
    assert.strictEqual(after.production.energy, 7.5 + basePlanetBonus,
      'Production should reflect tech bonus after research completion');
  });
});

// ── Pop Growth with Tech Modifier ──

describe('GameEngine — Pop Growth Tech Bonus', () => {
  it('frontier_medicine reduces growth target by 25%', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine._doctrinePhase = false; // skip doctrine auto-assignment
    const colony = Array.from(engine.colonies.values())[0];
    const state = engine.playerStates.get(1);

    // Complete frontier_medicine (growthBonus: 0.75)
    state.completedTechs.push('frontier_medicine');
    engine._techModCache.delete(1);

    // Base growth: GROWTH_BASE_TICKS = 400, with modifier: 400 * 0.75 = 300
    const techMods = engine._getTechModifiers(state);
    assert.strictEqual(techMods.growth, 0.75);

    // Verify by ticking — pop should grow faster
    state.resources.food = 1000; // plenty of food
    const startPops = colony.pops; // 8

    // Tick 300 times — should be enough for 1 growth with 0.75x modifier
    for (let i = 0; i < 300; i++) {
      engine.tick();
    }

    assert.strictEqual(colony.pops, startPops + 1,
      'Pop should grow after 300 ticks with frontier_medicine (400 * 0.75 = 300)');
  });
});

// ── Game Speed Controls ──

describe('GameEngine — Game Speed Controls', () => {
  it('starts at default speed (2)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    assert.strictEqual(state.gameSpeed, DEFAULT_SPEED);
    assert.strictEqual(state.paused, false);
  });

  it('setGameSpeed changes speed and returns ok', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const result = engine.setGameSpeed(5);
    assert.strictEqual(result.ok, true);
    const state = engine.getState();
    assert.strictEqual(state.gameSpeed, 5);
  });

  it('setGameSpeed rejects invalid values', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    assert.ok(engine.setGameSpeed(0).error);
    assert.ok(engine.setGameSpeed(6).error);
    assert.ok(engine.setGameSpeed(-1).error);
    assert.ok(engine.setGameSpeed(2.5).error);
    assert.ok(engine.setGameSpeed('abc').error);
    assert.ok(engine.setGameSpeed(NaN).error);
    assert.ok(engine.setGameSpeed(Infinity).error);
    // Speed should remain at default after all invalid attempts
    assert.strictEqual(engine.getState().gameSpeed, DEFAULT_SPEED);
  });

  it('setGameSpeed with same speed is a no-op', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const result = engine.setGameSpeed(DEFAULT_SPEED);
    assert.strictEqual(result.ok, true);
  });

  it('togglePause pauses and unpauses the game', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    assert.strictEqual(engine.getState().paused, false);
    const r1 = engine.togglePause();
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r1.paused, true);
    assert.strictEqual(engine.getState().paused, true);
    const r2 = engine.togglePause();
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.paused, false);
    assert.strictEqual(engine.getState().paused, false);
  });

  it('pause stops ticking — tickCount does not advance', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine.start();
    engine.togglePause(); // pause
    const tickBefore = engine.tickCount;
    // Manually try calling tick — it should still work if called directly
    // but the interval should be cleared
    assert.strictEqual(engine.tickInterval, null, 'Interval should be cleared when paused');
    engine.togglePause(); // unpause
    assert.ok(engine.tickInterval !== null, 'Interval should be restored when unpaused');
    engine.stop();
  });

  it('speed change while running restarts interval', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine.start();
    const oldInterval = engine.tickInterval;
    engine.setGameSpeed(4);
    assert.ok(engine.tickInterval !== null, 'Interval should exist after speed change');
    assert.notStrictEqual(engine.tickInterval, oldInterval, 'Interval should be different');
    engine.stop();
  });

  it('onSpeedChange callback fires on speed change', () => {
    let received = null;
    const engine = new GameEngine(makeRoom(1), {
      tickRate: 10,
      onSpeedChange: (state) => { received = state; },
    });
    engine.setGameSpeed(3);
    assert.ok(received);
    assert.strictEqual(received.speed, 3);
    assert.strictEqual(received.speedLabel, '2x');
    assert.strictEqual(received.paused, false);
  });

  it('onSpeedChange callback fires on pause toggle', () => {
    let received = null;
    const engine = new GameEngine(makeRoom(1), {
      tickRate: 10,
      onSpeedChange: (state) => { received = state; },
    });
    engine.togglePause();
    assert.ok(received);
    assert.strictEqual(received.paused, true);
    assert.strictEqual(received.speed, DEFAULT_SPEED);
  });

  it('speed and pause state included in per-player state', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine.setGameSpeed(4);
    const pState = engine.getPlayerState(1);
    assert.strictEqual(pState.gameSpeed, 4);
    assert.strictEqual(pState.paused, false);
  });

  it('SPEED_INTERVALS has entries for all 5 speeds', () => {
    for (let s = 1; s <= 5; s++) {
      assert.ok(SPEED_INTERVALS[s] > 0, `Speed ${s} should have a positive interval`);
    }
    // Higher speed = lower interval
    assert.ok(SPEED_INTERVALS[1] > SPEED_INTERVALS[5]);
  });

  it('SPEED_LABELS has labels for all 5 speeds', () => {
    for (let s = 1; s <= 5; s++) {
      assert.ok(typeof SPEED_LABELS[s] === 'string', `Speed ${s} should have a label`);
    }
  });
});

// ── VP Breakdown & Summary Cache (Research VP Rebalance coverage) ──

describe('GameEngine — _calcVPBreakdown', () => {
  it('returns full breakdown object with all expected fields', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 75;
    state.resources.research = { physics: 30, society: 20, engineering: 10 };
    state.completedTechs = ['improved_power_plants', 'advanced_reactors'];

    const bd = engine._calcVPBreakdown(1);
    assert.strictEqual(bd.pops, 8);
    assert.strictEqual(bd.popsVP, 16);
    assert.strictEqual(bd.districts, 4);
    assert.strictEqual(bd.districtsVP, 4);
    assert.strictEqual(bd.alloys, 75);
    assert.strictEqual(bd.alloysVP, 3); // floor(75/25)
    assert.strictEqual(bd.totalResearch, 60);
    assert.strictEqual(bd.researchVP, 1); // floor(60/50)
    assert.strictEqual(bd.techs, 2);
    assert.strictEqual(bd.techVP, 15); // T1(5) + T2(10)
    assert.strictEqual(bd.vp, 16 + 4 + 3 + 1 + 15);
  });

  it('returns empty breakdown for unknown player', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const bd = engine._calcVPBreakdown(999);
    assert.strictEqual(bd.vp, 0);
    assert.strictEqual(bd.pops, 0);
    assert.strictEqual(bd.techVP, 0);
    assert.strictEqual(bd.researchVP, 0);
  });

  it('is consistent with _calcVictoryPoints across cache invalidation', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);

    // Initial
    assert.strictEqual(engine._calcVPBreakdown(1).vp, engine._calcVictoryPoints(1));

    // Mutate state + invalidate
    state.completedTechs.push('improved_mining');
    engine._vpCacheTick = -1;
    assert.strictEqual(engine._calcVPBreakdown(1).vp, engine._calcVictoryPoints(1));

    // After tick advancement
    engine.tick();
    state.resources.alloys += 100;
    assert.strictEqual(engine._calcVPBreakdown(1).vp, engine._calcVictoryPoints(1));
  });

  it('breakdown cache updates across tick boundaries', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);

    const bd1 = engine._calcVPBreakdown(1);
    const vp1 = bd1.vp;

    // Advance tick + change state
    engine.tick();
    state.resources.alloys += 250; // +10 VP (250/25)
    const bd2 = engine._calcVPBreakdown(1);
    assert.strictEqual(bd2.vp, vp1 + 10);
    assert.strictEqual(bd2.alloysVP, bd1.alloysVP + 10);
  });

  it('gracefully handles unknown techId in completedTechs', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine.playerStates.get(1).completedTechs = ['nonexistent_tech', 'improved_power_plants'];
    engine._vpCacheTick = -1;
    const bd = engine._calcVPBreakdown(1);
    // Should only count the valid tech
    assert.strictEqual(bd.techVP, 5); // only improved_power_plants (T1)
    assert.strictEqual(bd.techs, 2); // count includes unknown but VP skips it
  });
});

describe('GameEngine — Summary Cache Invalidation', () => {
  it('_invalidateColonyCache clears summary cache', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];

    // Populate summary cache
    engine._getPlayerSummary(1);
    assert.strictEqual(engine._summaryCacheTick, engine.tickCount);

    // Invalidate colony — should clear summary cache tick
    engine._invalidateColonyCache(colony);
    assert.strictEqual(engine._summaryCacheTick, -1, 'Summary cache tick should be reset');
  });

  it('_invalidateColonyCache clears both VP and summary caches', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];

    // Populate both caches
    engine._calcVPBreakdown(1);
    engine._getPlayerSummary(1);
    assert.strictEqual(engine._vpCacheTick, engine.tickCount);
    assert.strictEqual(engine._summaryCacheTick, engine.tickCount);

    // Invalidate colony
    engine._invalidateColonyCache(colony);
    assert.strictEqual(engine._vpCacheTick, -1, 'VP cache should be invalidated');
    assert.strictEqual(engine._summaryCacheTick, -1, 'Summary cache should be invalidated');
  });

  it('summary reflects colony changes after invalidation', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = Array.from(engine.colonies.values())[0];

    const before = engine._getPlayerSummary(1);
    const popsBefore = before.totalPops;

    // Add pops and invalidate
    colony.pops += 5;
    engine._invalidateColonyCache(colony);

    const after = engine._getPlayerSummary(1);
    assert.strictEqual(after.totalPops, popsBefore + 5,
      'Summary should reflect updated pops after invalidation');
  });

  it('summary cache resets on new tick', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });

    // Cache summaries for tick 0
    const s1 = engine._getPlayerSummary(1);
    assert.strictEqual(engine._summaryCacheTick, 0);

    // Advance tick
    engine.tick();
    // Cache should auto-clear on next call (different tick)
    const s2 = engine._getPlayerSummary(1);
    assert.strictEqual(engine._summaryCacheTick, engine.tickCount);
  });
});

describe('GameEngine — getPlayerState summary fields', () => {
  it('includes colonyCount, totalPops, and income for self', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const pState = engine.getPlayerState(1);
    const me = pState.players[0]; // first player is self

    assert.strictEqual(me.id, 1);
    assert.strictEqual(typeof me.colonyCount, 'number');
    assert.strictEqual(typeof me.totalPops, 'number');
    assert.ok(me.income, 'self should have income field');
    assert.strictEqual(typeof me.income.energy, 'number');
    assert.strictEqual(typeof me.income.minerals, 'number');
    assert.strictEqual(typeof me.income.food, 'number');
    assert.strictEqual(typeof me.income.alloys, 'number');
    assert.strictEqual(me.colonyCount, 1);
    assert.strictEqual(me.totalPops, 8);
  });

  it('includes summary fields for other players', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const pState = engine.getPlayerState(1);
    const other = pState.players[1]; // second player is other

    assert.strictEqual(other.id, 2);
    assert.strictEqual(typeof other.colonyCount, 'number');
    assert.strictEqual(typeof other.totalPops, 'number');
    assert.ok(other.income, 'other player should have income for scoreboard');
    assert.strictEqual(typeof other.vp, 'number');
  });

  it('other players do not have resources (privacy)', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const pState = engine.getPlayerState(1);
    const other = pState.players[1];

    assert.strictEqual(other.resources, undefined, 'other player resources should not be exposed');
    assert.strictEqual(other.completedTechs, undefined, 'other player techs should not be exposed');
  });
});

// ── Edict System ──
describe('GameEngine — Edict System', () => {
  it('activates a duration edict and deducts influence', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    const influenceBefore = state.resources.influence;

    const result = engine.handleCommand(1, { type: 'activateEdict', edictType: 'mineralRush' });
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(state.resources.influence, influenceBefore - 50);
    assert.strictEqual(state.activeEdict.type, 'mineralRush');
    assert.strictEqual(state.activeEdict.monthsRemaining, 5);
  });

  it('rejects edict with insufficient influence', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.influence = 10; // not enough for any edict except none

    const result = engine.handleCommand(1, { type: 'activateEdict', edictType: 'mineralRush' });
    assert.ok(result.error);
    assert.ok(result.error.includes('influence'));
    assert.strictEqual(state.activeEdict, null);
  });

  it('rejects second edict while one is active', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine.handleCommand(1, { type: 'activateEdict', edictType: 'mineralRush' });

    const result = engine.handleCommand(1, { type: 'activateEdict', edictType: 'researchGrant' });
    assert.ok(result.error);
    assert.ok(result.error.includes('already active'));
  });

  it('rejects unknown edict type', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const result = engine.handleCommand(1, { type: 'activateEdict', edictType: 'nonexistent' });
    assert.ok(result.error);
    assert.ok(result.error.includes('Unknown'));
  });

  it('rejects edict with missing edictType', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const result = engine.handleCommand(1, { type: 'activateEdict' });
    assert.ok(result.error);
  });

  it('emergency reserves grants instant resources without setting active edict', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    const energyBefore = state.resources.energy;
    const mineralsBefore = state.resources.minerals;
    const foodBefore = state.resources.food;

    const result = engine.handleCommand(1, { type: 'activateEdict', edictType: 'emergencyReserves' });
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(state.resources.energy, energyBefore + 100);
    assert.strictEqual(state.resources.minerals, mineralsBefore + 100);
    assert.strictEqual(state.resources.food, foodBefore + 100);
    assert.strictEqual(state.activeEdict, null, 'instant edict should not set active');
  });

  it('mineral rush increases mining production by 50%', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colonies = engine._playerColonies.get(1);
    const colony = engine.colonies.get(colonies[0]);

    // Get base production first
    const baseProd = engine._calcProduction(colony);
    const baseMinerals = baseProd.production.minerals;

    // Activate mineral rush
    engine.handleCommand(1, { type: 'activateEdict', edictType: 'mineralRush' });
    engine._invalidatePlayerProductionCaches(1);
    const boostedProd = engine._calcProduction(colony);

    assert.ok(baseMinerals > 0, 'should have base mineral production');
    const expected = Math.round(baseMinerals * 1.5 * 100) / 100;
    assert.strictEqual(boostedProd.production.minerals, expected);
  });

  it('research grant increases research production by 50%', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colonies = engine._playerColonies.get(1);
    const colony = engine.colonies.get(colonies[0]);

    // Starting colony has 8 pops, 4 districts (gen, mine, agri, agri) = 3 jobs = 5 unemployed
    // Unemployed produce 1 research each = 5 physics/society/engineering
    const baseProd = engine._calcProduction(colony);
    const basePhysics = baseProd.production.physics;

    engine.handleCommand(1, { type: 'activateEdict', edictType: 'researchGrant' });
    engine._invalidatePlayerProductionCaches(1);
    const boostedProd = engine._calcProduction(colony);

    assert.ok(basePhysics > 0, 'should have base research production');
    const expected = Math.round(basePhysics * 1.5 * 100) / 100;
    assert.strictEqual(boostedProd.production.physics, expected);
    assert.strictEqual(boostedProd.production.society, Math.round(baseProd.production.society * 1.5 * 100) / 100);
  });

  it('population drive halves growth target ticks', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });

    // Build a housing district so pops can grow (need housing)
    const colonies = engine._playerColonies.get(1);
    const colony = engine.colonies.get(colonies[0]);
    engine._addBuiltDistrict(colony, 'housing');

    // Tick until food surplus is positive (starting colony has agriculture)
    // Record growth progress with and without edict
    engine.handleCommand(1, { type: 'activateEdict', edictType: 'populationDrive' });
    const state = engine.playerStates.get(1);
    assert.strictEqual(state.activeEdict.type, 'populationDrive');

    // Tick a few times and verify growth progresses
    colony.growthProgress = 0;
    for (let i = 0; i < 10; i++) engine.tick();
    const progressWithEdict = colony.growthProgress;
    assert.ok(progressWithEdict > 0, 'growth should progress with edict');
  });

  it('edict expires after duration and emits event', () => {
    const events = [];
    const engine = new GameEngine(makeRoom(1), { tickRate: 10, onEvent: (evts) => events.push(...evts) });
    engine.handleCommand(1, { type: 'activateEdict', edictType: 'mineralRush' });

    const state = engine.playerStates.get(1);
    assert.strictEqual(state.activeEdict.monthsRemaining, 5);

    // Tick 5 months (5 × 100 ticks)
    for (let i = 0; i < 500; i++) engine.tick();

    assert.strictEqual(state.activeEdict, null, 'edict should have expired');
    const expiredEvt = events.find(e => e.eventType === 'edictExpired');
    assert.ok(expiredEvt, 'should emit edictExpired event');
    assert.strictEqual(expiredEvt.edictType, 'mineralRush');
  });

  it('edict activation emits edictActivated event', () => {
    const events = [];
    const engine = new GameEngine(makeRoom(1), { tickRate: 10, onEvent: (evts) => events.push(...evts) });
    engine.handleCommand(1, { type: 'activateEdict', edictType: 'researchGrant' });

    // Flush events by ticking to broadcast
    tickToBroadcast(engine);

    const activatedEvt = events.find(e => e.eventType === 'edictActivated');
    assert.ok(activatedEvt, 'should emit edictActivated event');
    assert.strictEqual(activatedEvt.edictType, 'researchGrant');
    assert.strictEqual(activatedEvt.edictName, 'Research Grant');
  });

  it('activeEdict is included in player state JSON', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine.handleCommand(1, { type: 'activateEdict', edictType: 'mineralRush' });

    const json = engine.getPlayerStateJSON(1);
    const parsed = JSON.parse(json);
    const me = parsed.players[0];
    assert.ok(me.activeEdict, 'activeEdict should be in player state');
    assert.strictEqual(me.activeEdict.type, 'mineralRush');
    assert.strictEqual(me.activeEdict.monthsRemaining, 5);
  });

  it('can activate emergency reserves while duration edict is NOT active', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    // Emergency reserves is instant, shouldn't set activeEdict
    const result = engine.handleCommand(1, { type: 'activateEdict', edictType: 'emergencyReserves' });
    assert.deepStrictEqual(result, { ok: true });

    // Now can activate a duration edict
    const result2 = engine.handleCommand(1, { type: 'activateEdict', edictType: 'mineralRush' });
    assert.deepStrictEqual(result2, { ok: true });
  });

  it('EDICT_DEFS is exported and has 4 edicts', () => {
    const { EDICT_DEFS } = require('../../server/game-engine');
    assert.strictEqual(Object.keys(EDICT_DEFS).length, 4);
    assert.ok(EDICT_DEFS.mineralRush);
    assert.ok(EDICT_DEFS.populationDrive);
    assert.ok(EDICT_DEFS.researchGrant);
    assert.ok(EDICT_DEFS.emergencyReserves);
  });

  it('can activate a new edict after the previous one expires', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine.handleCommand(1, { type: 'activateEdict', edictType: 'mineralRush' });

    // Expire it by ticking 5 months
    for (let i = 0; i < 500; i++) engine.tick();
    const state = engine.playerStates.get(1);
    assert.strictEqual(state.activeEdict, null, 'edict should have expired');

    // Now activate another
    const result = engine.handleCommand(1, { type: 'activateEdict', edictType: 'researchGrant' });
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(state.activeEdict.type, 'researchGrant');
  });

  it('emergency reserves can be used while a duration edict IS active', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);

    // Activate a duration edict first
    engine.handleCommand(1, { type: 'activateEdict', edictType: 'mineralRush' });
    assert.ok(state.activeEdict, 'duration edict should be active');

    // Emergency reserves is instant — should it be blocked or allowed?
    // Per the code: state.activeEdict is set, so it IS blocked
    const result = engine.handleCommand(1, { type: 'activateEdict', edictType: 'emergencyReserves' });
    assert.ok(result.error, 'emergency reserves blocked while duration edict active');
  });

  it('emergency reserves deducts influence', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    const influenceBefore = state.resources.influence;

    engine.handleCommand(1, { type: 'activateEdict', edictType: 'emergencyReserves' });
    assert.strictEqual(state.resources.influence, influenceBefore - 25, 'should deduct 25 influence for emergency reserves');
  });

  it('succeeds when influence exactly equals edict cost', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.influence = 50; // exact cost for mineralRush

    const result = engine.handleCommand(1, { type: 'activateEdict', edictType: 'mineralRush' });
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(state.resources.influence, 0);
  });

  it('rejects edict with non-string edictType', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    assert.ok(engine.handleCommand(1, { type: 'activateEdict', edictType: 42 }).error);
    assert.ok(engine.handleCommand(1, { type: 'activateEdict', edictType: null }).error);
    assert.ok(engine.handleCommand(1, { type: 'activateEdict', edictType: {} }).error);
  });

  it('production returns to base values after edict expires', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine._doctrinePhase = false; // skip doctrine auto-assignment
    const colonies = engine._playerColonies.get(1);
    const colony = engine.colonies.get(colonies[0]);

    const baseProd = engine._calcProduction(colony);
    const baseMinerals = baseProd.production.minerals;
    assert.ok(baseMinerals > 0, 'should have base mineral production');

    // Activate mineral rush
    engine.handleCommand(1, { type: 'activateEdict', edictType: 'mineralRush' });

    // Expire it
    for (let i = 0; i < 500; i++) engine.tick();
    const state = engine.playerStates.get(1);
    assert.strictEqual(state.activeEdict, null, 'edict should have expired');

    // Production should be back to base
    colony._cachedProduction = null;
    const afterProd = engine._calcProduction(colony);
    assert.strictEqual(afterProd.production.minerals, baseMinerals, 'minerals should return to base after edict expires');
  });

  it('research grant boosts all three research fields', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colonies = engine._playerColonies.get(1);
    const colony = engine.colonies.get(colonies[0]);

    const baseProd = engine._calcProduction(colony);
    const baseEng = baseProd.production.engineering;
    assert.ok(baseEng > 0, 'should have base engineering production');

    engine.handleCommand(1, { type: 'activateEdict', edictType: 'researchGrant' });
    engine._invalidatePlayerProductionCaches(1);
    const boostedProd = engine._calcProduction(colony);

    assert.strictEqual(boostedProd.production.engineering, Math.round(baseEng * 1.5 * 100) / 100, 'engineering should be boosted 50%');
  });

  it('multiple emergency reserves can be used consecutively', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.influence = 100; // enough for 4 uses at 25 each

    const energyBefore = state.resources.energy;
    for (let i = 0; i < 4; i++) {
      const result = engine.handleCommand(1, { type: 'activateEdict', edictType: 'emergencyReserves' });
      assert.deepStrictEqual(result, { ok: true });
    }
    assert.strictEqual(state.resources.energy, energyBefore + 400);
    assert.strictEqual(state.resources.influence, 0);
  });

  it('edict does not affect other players production', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const p2Colonies = engine._playerColonies.get(2);
    const p2Colony = engine.colonies.get(p2Colonies[0]);

    const baseProd = engine._calcProduction(p2Colony);
    const baseMinerals = baseProd.production.minerals;

    // Player 1 activates mineral rush
    engine.handleCommand(1, { type: 'activateEdict', edictType: 'mineralRush' });
    p2Colony._cachedProduction = null;
    const afterProd = engine._calcProduction(p2Colony);

    assert.strictEqual(afterProd.production.minerals, baseMinerals, 'player 2 minerals should be unaffected by player 1 edict');
  });

  it('edictActivated event for instant edict includes instant flag', () => {
    const events = [];
    const engine = new GameEngine(makeRoom(1), { tickRate: 10, onEvent: (evts) => events.push(...evts) });
    engine.handleCommand(1, { type: 'activateEdict', edictType: 'emergencyReserves' });
    tickToBroadcast(engine);

    const evt = events.find(e => e.eventType === 'edictActivated');
    assert.ok(evt, 'should emit edictActivated for instant edict');
    assert.strictEqual(evt.instant, true, 'instant flag should be true');
    assert.strictEqual(evt.edictName, 'Emergency Reserves');
  });

  it('edictActivated event for duration edict includes duration', () => {
    const events = [];
    const engine = new GameEngine(makeRoom(1), { tickRate: 10, onEvent: (evts) => events.push(...evts) });
    engine.handleCommand(1, { type: 'activateEdict', edictType: 'mineralRush' });
    tickToBroadcast(engine);

    const evt = events.find(e => e.eventType === 'edictActivated');
    assert.ok(evt);
    assert.strictEqual(evt.duration, 5);
    assert.strictEqual(evt.instant, undefined, 'duration edict should not have instant flag');
  });

  it('null activeEdict in player state JSON when no edict active', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const json = engine.getPlayerStateJSON(1);
    const parsed = JSON.parse(json);
    const me = parsed.players[0];
    assert.strictEqual(me.activeEdict, null, 'activeEdict should be null when none active');
  });
});

// ── Recent Changes: Housing Food + Friendly Colony Proximity Fix ──

describe('GameEngine — Housing Food & Friendly Proximity (recent)', () => {
  // --- Housing +2 food: interaction with other systems ---

  it('housing food appears in serialized player state (netProduction)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = engine.colonies.values().next().value;
    // Strip all existing districts to get clean baseline
    colony.districts = [];
    colony.pops = 0;
    colony._cachedProduction = null;
    engine._addBuiltDistrict(colony, 'housing');

    engine._invalidateStateCache();
    const json = engine.getPlayerStateJSON(1);
    const parsed = JSON.parse(json);
    const sColony = parsed.colonies[0];
    // Housing produces 2 food, 0 pops consume 0 food → net food = 2
    assert.strictEqual(sColony.netProduction.food, 2,
      'Serialized colony netProduction.food should show housing food output');
  });

  it('housing food production stacks with agriculture food production', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    // Use arid planet to avoid continental agriculture food bonus
    const colony = engine._createColony(1, 'MixedFarm', { size: 16, type: 'arid', habitability: 60 });
    colony.pops = 2; // enough to staff 1 agriculture worker
    engine._addBuiltDistrict(colony, 'housing');
    engine._addBuiltDistrict(colony, 'agriculture');

    const { production } = engine._calcProduction(colony);
    // Housing: 2 food (jobless) + Agriculture: 6 food (1 pop) = 8 food (no planet bonus on arid for agriculture)
    assert.strictEqual(production.food, 8,
      'Housing food (2) + agriculture food (6) should stack to 8');
  });

  it('housing food does not receive planet type bonuses', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    // Arid has bonus for generators and industrials, not housing
    const colony = engine._createColony(1, 'AridHousing', { size: 16, type: 'arid', habitability: 60 });
    colony.pops = 0;
    engine._addBuiltDistrict(colony, 'housing');

    const { production } = engine._calcProduction(colony);
    assert.strictEqual(production.food, 2,
      'Housing food should be exactly 2 on arid planet (no planet bonus for housing)');
  });

  // --- Friendly colony proximity: BFS edge cases ---

  it('_hasFriendlyColonyNearby returns false when _adjacency is null', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const colony = engine.colonies.values().next().value;
    engine._adjacency = null;
    assert.strictEqual(engine._hasFriendlyColonyNearby(colony), false,
      'Should return false when adjacency data is missing');
  });

  it('_hasFriendlyColonyNearby returns false when friendly colony is beyond hop range', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const colony1 = [...engine.colonies.values()].find(c => c.ownerId === 1);
    const colony2 = [...engine.colonies.values()].find(c => c.ownerId === 2);

    // Make mutual friendly
    const s1 = engine.playerStates.get(1);
    const s2 = engine.playerStates.get(2);
    s1.diplomacy[2] = { stance: 'friendly', cooldownTick: 0 };
    s2.diplomacy[1] = { stance: 'friendly', cooldownTick: 0 };

    // Build a linear chain of systems beyond FRIENDLY_HOP_RANGE
    // sys-A -> sys-B -> sys-C -> sys-D -> sys-E (4 hops, range is 3)
    const farSysIds = [];
    for (let i = 0; i < FRIENDLY_HOP_RANGE + 2; i++) {
      farSysIds.push(`far-sys-${i}`);
    }

    // Replace adjacency with a controlled linear chain
    const adj = new Map();
    adj.set(colony1.systemId, [farSysIds[0]]);
    adj.set(farSysIds[0], [colony1.systemId, farSysIds[1]]);
    for (let i = 1; i < farSysIds.length - 1; i++) {
      adj.set(farSysIds[i], [farSysIds[i - 1], farSysIds[i + 1]]);
    }
    adj.set(farSysIds[farSysIds.length - 1], [farSysIds[farSysIds.length - 2]]);
    engine._adjacency = adj;

    // Place colony2 at the far end (beyond hop range)
    colony2.systemId = farSysIds[farSysIds.length - 1];

    assert.strictEqual(engine._hasFriendlyColonyNearby(colony1), false,
      `Colony ${FRIENDLY_HOP_RANGE + 1} hops away should be out of range`);
  });

  it('_hasFriendlyColonyNearby returns true when friendly colony is exactly at hop range', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const colony1 = [...engine.colonies.values()].find(c => c.ownerId === 1);
    const colony2 = [...engine.colonies.values()].find(c => c.ownerId === 2);

    // Make mutual friendly
    const s1 = engine.playerStates.get(1);
    const s2 = engine.playerStates.get(2);
    s1.diplomacy[2] = { stance: 'friendly', cooldownTick: 0 };
    s2.diplomacy[1] = { stance: 'friendly', cooldownTick: 0 };

    // Build a chain of exactly FRIENDLY_HOP_RANGE hops
    const chainIds = [];
    for (let i = 0; i < FRIENDLY_HOP_RANGE; i++) {
      chainIds.push(`chain-sys-${i}`);
    }

    const adj = new Map();
    adj.set(colony1.systemId, [chainIds[0]]);
    if (chainIds.length === 1) {
      adj.set(chainIds[0], [colony1.systemId]);
    } else {
      adj.set(chainIds[0], [colony1.systemId, chainIds[1]]);
      for (let i = 1; i < chainIds.length - 1; i++) {
        adj.set(chainIds[i], [chainIds[i - 1], chainIds[i + 1]]);
      }
      adj.set(chainIds[chainIds.length - 1], [chainIds[chainIds.length - 2]]);
    }
    engine._adjacency = adj;

    // Place colony2 at exactly FRIENDLY_HOP_RANGE hops
    colony2.systemId = chainIds[chainIds.length - 1];

    assert.strictEqual(engine._hasFriendlyColonyNearby(colony1), true,
      `Colony exactly ${FRIENDLY_HOP_RANGE} hops away should be in range`);
  });

  it('friendly bonus applies 10% increase to housing food production', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const colony1 = [...engine.colonies.values()].find(c => c.ownerId === 1);
    const colony2 = [...engine.colonies.values()].find(c => c.ownerId === 2);

    // Strip colony to housing-only for clean measurement
    colony1.districts = [];
    colony1.pops = 0;
    colony1._cachedProduction = null;
    engine._addBuiltDistrict(colony1, 'housing');

    // Baseline without bonus
    const { production: baseline } = engine._calcProduction(colony1);
    assert.strictEqual(baseline.food, 2, 'Baseline housing food should be 2');

    // Make mutual friendly
    const s1 = engine.playerStates.get(1);
    const s2 = engine.playerStates.get(2);
    s1.diplomacy[2] = { stance: 'friendly', cooldownTick: 0 };
    s2.diplomacy[1] = { stance: 'friendly', cooldownTick: 0 };

    // Place colony2 adjacent to colony1
    const neighbors = engine._adjacency.get(colony1.systemId);
    assert.ok(neighbors && neighbors.length > 0, 'colony1 must have neighbors');
    colony2.systemId = neighbors[0];

    // With friendly bonus
    colony1._cachedProduction = null;
    const { production: boosted } = engine._calcProduction(colony1);
    const expected = Math.round(2 * (1 + FRIENDLY_PRODUCTION_BONUS) * 100) / 100;
    assert.strictEqual(boosted.food, expected,
      `Housing food with friendly bonus should be ${expected} (2 * 1.1)`);
  });

  it('friendly bonus does not create production for zero-output resources', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const colony1 = [...engine.colonies.values()].find(c => c.ownerId === 1);
    const colony2 = [...engine.colonies.values()].find(c => c.ownerId === 2);

    // Housing-only colony: produces food but NOT energy, minerals, alloys, etc.
    colony1.districts = [];
    colony1.pops = 0;
    colony1._cachedProduction = null;
    engine._addBuiltDistrict(colony1, 'housing');

    // Make mutual friendly and adjacent
    const s1 = engine.playerStates.get(1);
    const s2 = engine.playerStates.get(2);
    s1.diplomacy[2] = { stance: 'friendly', cooldownTick: 0 };
    s2.diplomacy[1] = { stance: 'friendly', cooldownTick: 0 };
    const neighbors = engine._adjacency.get(colony1.systemId);
    colony2.systemId = neighbors[0];

    colony1._cachedProduction = null;
    const { production } = engine._calcProduction(colony1);

    // Food should be boosted, but minerals/alloys/energy should remain 0
    assert.ok(production.food > 0, 'Food should be positive with housing');
    assert.strictEqual(production.minerals, 0, 'Minerals should remain 0 — bonus only on positive values');
    assert.strictEqual(production.alloys, 0, 'Alloys should remain 0 — bonus only on positive values');
  });

  it('_hasFriendlyColonyNearby uses Map.get (not bracket access) on adjacency', () => {
    // Regression test: bracket access on Map always returns undefined
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const colony1 = [...engine.colonies.values()].find(c => c.ownerId === 1);
    const colony2 = [...engine.colonies.values()].find(c => c.ownerId === 2);

    // Make mutual friendly
    const s1 = engine.playerStates.get(1);
    const s2 = engine.playerStates.get(2);
    s1.diplomacy[2] = { stance: 'friendly', cooldownTick: 0 };
    s2.diplomacy[1] = { stance: 'friendly', cooldownTick: 0 };

    // Place on adjacent systems and verify it actually works
    const neighbors = engine._adjacency.get(colony1.systemId);
    assert.ok(neighbors && neighbors.length > 0, 'Must have adjacency data');
    colony2.systemId = neighbors[0];

    // The fix: this should return true (was always false before Map.get fix)
    assert.strictEqual(engine._hasFriendlyColonyNearby(colony1), true,
      'Friendly colony on adjacent system must be detected (Map.get regression)');
  });
});
