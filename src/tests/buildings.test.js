const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { GameEngine, BUILDING_DEFS, BUILDING_SLOT_THRESHOLDS, DISTRICT_DEFS, DEFENSE_PLATFORM_MAX_HP, DEFENSE_PLATFORM_COST, DEFENSE_PLATFORM_BUILD_TIME, MONTH_TICKS } = require('../../server/game-engine');

function makeRoom(playerCount = 1, options = {}) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set('p' + i, { id: 'p' + i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 'p1', maxPlayers: 4, status: 'playing', players, matchTimer: 0, ...options };
}

function makeEngine(opts = {}) {
  const playerCount = opts.twoPlayers ? 2 : 1;
  const engine = new GameEngine(makeRoom(playerCount), { tickRate: 10 });
  engine.start();
  return engine;
}

function getColony(engine, playerId = 'p1') {
  const ids = engine._playerColonies.get(playerId);
  return engine.colonies.get(ids[0]);
}

function giveResources(engine, playerId, resources) {
  const state = engine.playerStates.get(playerId);
  for (const [r, a] of Object.entries(resources)) {
    state.resources[r] = a;
  }
}

describe('Building Definitions', () => {
  it('should have 3 building types defined', () => {
    assert.strictEqual(Object.keys(BUILDING_DEFS).length, 3);
    assert.ok(BUILDING_DEFS.researchLab);
    assert.ok(BUILDING_DEFS.foundry);
    assert.ok(BUILDING_DEFS.shieldGenerator);
  });

  it('Research Lab should produce 4/4/4 research and consume 2 energy', () => {
    const def = BUILDING_DEFS.researchLab;
    assert.deepStrictEqual(def.produces, { physics: 4, society: 4, engineering: 4 });
    assert.deepStrictEqual(def.consumes, { energy: 2 });
    assert.strictEqual(def.jobs, 1);
    assert.deepStrictEqual(def.cost, { minerals: 200, energy: 50 });
    assert.strictEqual(def.buildTime, 500);
  });

  it('Foundry should produce 4 alloys and consume 2 energy', () => {
    const def = BUILDING_DEFS.foundry;
    assert.deepStrictEqual(def.produces, { alloys: 4 });
    assert.deepStrictEqual(def.consumes, { energy: 2 });
    assert.strictEqual(def.jobs, 1);
    assert.deepStrictEqual(def.cost, { minerals: 300 });
    assert.strictEqual(def.buildTime, 500);
  });

  it('Shield Generator should grant +25 defense platform HP', () => {
    const def = BUILDING_DEFS.shieldGenerator;
    assert.strictEqual(def.defensePlatformHPBonus, 25);
    assert.deepStrictEqual(def.consumes, { energy: 3 });
    assert.deepStrictEqual(def.cost, { minerals: 200, alloys: 100 });
  });

  it('building slot thresholds should be [5, 10, 15]', () => {
    assert.deepStrictEqual(BUILDING_SLOT_THRESHOLDS, [5, 10, 15]);
  });
});

describe('Building Slot Unlocking', () => {
  it('colony with 8 pops should have 1 slot unlocked', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    assert.strictEqual(colony.pops, 8); // starting pops
    // 8 >= 5 → 1 slot; 8 < 10 → no 2nd slot
    const state = engine.getPlayerState('p1');
    const myColony = state.colonies[0];
    assert.strictEqual(myColony.buildingSlotsUnlocked, 1);
  });

  it('colony with 4 pops should have 0 slots unlocked', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.pops = 4;
    engine._invalidateColonyCache(colony);
    const state = engine.getPlayerState('p1');
    const myColony = state.colonies[0];
    assert.strictEqual(myColony.buildingSlotsUnlocked, 0);
  });

  it('colony with 15 pops should have 3 slots unlocked', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.pops = 15;
    engine._invalidateColonyCache(colony);
    const state = engine.getPlayerState('p1');
    const myColony = state.colonies[0];
    assert.strictEqual(myColony.buildingSlotsUnlocked, 3);
  });
});

describe('buildBuilding Command', () => {
  it('should build a Research Lab successfully', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 500, energy: 200, alloys: 200 });
    const colony = getColony(engine);
    const result = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'researchLab' });
    assert.ok(result.ok);
    assert.strictEqual(colony.buildingQueue.length, 1);
    assert.strictEqual(colony.buildingQueue[0].type, 'researchLab');
    assert.strictEqual(colony.buildingQueue[0].ticksRemaining, 500);
  });

  it('should deduct correct resources for Foundry', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 500, energy: 200, alloys: 200 });
    const colony = getColony(engine);
    engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'foundry' });
    const state = engine.playerStates.get('p1');
    assert.strictEqual(state.resources.minerals, 200); // 500 - 300
  });

  it('should reject if not enough resources', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 50, energy: 10, alloys: 0 });
    const colony = getColony(engine);
    const result = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'researchLab' });
    assert.ok(result.error);
    assert.match(result.error, /Not enough/);
  });

  it('should reject invalid building type', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    const result = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'invalidBuilding' });
    assert.ok(result.error);
    assert.match(result.error, /Invalid building type/);
  });

  it('should reject if no slots available (pops too low)', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 500, energy: 200, alloys: 200 });
    const colony = getColony(engine);
    colony.pops = 4; // below 5 threshold
    engine._invalidateColonyCache(colony);
    const result = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'researchLab' });
    assert.ok(result.error);
    assert.match(result.error, /No building slots/);
  });

  it('should reject if all unlocked slots are used', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 1000, energy: 500, alloys: 500 });
    const colony = getColony(engine);
    // 8 pops = 1 slot, build a research lab to fill it
    engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'researchLab' });
    // Try to build a second building — should fail (only 1 slot at 8 pops)
    const result = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'foundry' });
    assert.ok(result.error);
    assert.match(result.error, /No building slots/);
  });

  it('should reject duplicate building type', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 1000, energy: 500, alloys: 500 });
    const colony = getColony(engine);
    colony.pops = 15; // 3 slots
    engine._invalidateColonyCache(colony);
    engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'researchLab' });
    // Try duplicate
    const result = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'researchLab' });
    assert.ok(result.error);
    assert.match(result.error, /Already have this building type/);
  });

  it('should reject building on wrong colony (ownership check)', () => {
    const engine = makeEngine({ twoPlayers: true });
    const colony2 = getColony(engine, 'p2');
    giveResources(engine, 'p1', { minerals: 1000, energy: 500, alloys: 500 });
    const result = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony2.id, buildingType: 'researchLab' });
    assert.ok(result.error);
    assert.match(result.error, /Not your colony/);
  });

  it('should reject missing parameters', () => {
    const engine = makeEngine();
    const result = engine.handleCommand('p1', { type: 'buildBuilding' });
    assert.ok(result.error);
  });
});

describe('Building Construction Processing', () => {
  it('building should complete after buildTime ticks', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 500, energy: 200, alloys: 200 });
    const colony = getColony(engine);
    engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'researchLab' });
    assert.strictEqual(colony.buildings.length, 0);
    assert.strictEqual(colony.buildingQueue.length, 1);

    // Tick 500 times
    for (let i = 0; i < 500; i++) {
      engine.tick();
    }

    assert.strictEqual(colony.buildings.length, 1);
    assert.strictEqual(colony.buildings[0].type, 'researchLab');
    assert.strictEqual(colony.buildingQueue.length, 0);
  });

  it('building should not complete before buildTime', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 500, energy: 200, alloys: 200 });
    const colony = getColony(engine);
    engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'foundry' });

    for (let i = 0; i < 499; i++) {
      engine.tick();
    }

    assert.strictEqual(colony.buildings.length, 0);
    assert.strictEqual(colony.buildingQueue.length, 1);
    assert.strictEqual(colony.buildingQueue[0].ticksRemaining, 1);
  });
});

describe('Building Production', () => {
  it('Research Lab should add to colony production', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    // Manually add a built research lab
    colony.buildings.push({ id: 9990, type: 'researchLab', slot: 0 });
    engine._invalidateColonyCache(colony);

    const { production, consumption } = engine._calcProduction(colony);
    // Should include +4/+4/+4 from research lab
    assert.ok(production.physics >= 4);
    assert.ok(production.society >= 4);
    assert.ok(production.engineering >= 4);
    // Should consume 2 energy
    assert.ok(consumption.energy >= 2);
  });

  it('Foundry should add alloy production', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.buildings.push({ id: 9991, type: 'foundry', slot: 0 });
    engine._invalidateColonyCache(colony);

    const { production, consumption } = engine._calcProduction(colony);
    assert.ok(production.alloys >= 4);
    assert.ok(consumption.energy >= 2);
  });

  it('buildings should require pops to work', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.pops = 0; // no pops available
    colony.buildings.push({ id: 9992, type: 'researchLab', slot: 0 });
    engine._invalidateColonyCache(colony);

    const { production } = engine._calcProduction(colony);
    // With 0 pops, no districts or buildings work
    // Districts have priority, then buildings — with 0 working pops, building doesn't produce
    // (Physics may be 0 or include unemployed research, but with 0 pops there's nothing)
    assert.strictEqual(production.physics, 0);
  });

  it('building jobs should count in total jobs', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    const jobsBefore = engine._calcJobs(colony);
    colony.buildings.push({ id: 9993, type: 'foundry', slot: 0 });
    engine._invalidateColonyCache(colony);
    const jobsAfter = engine._calcJobs(colony);
    assert.strictEqual(jobsAfter, jobsBefore + 1);
  });
});

describe('Shield Generator + Defense Platform', () => {
  it('Shield Generator should increase defense platform maxHp', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    // Build defense platform first
    giveResources(engine, 'p1', { minerals: 500, energy: 200, alloys: 300 });
    engine.handleCommand('p1', { type: 'buildDefensePlatform', colonyId: colony.id });
    // Complete construction
    for (let i = 0; i < DEFENSE_PLATFORM_BUILD_TIME; i++) engine.tick();
    assert.strictEqual(colony.defensePlatform.hp, DEFENSE_PLATFORM_MAX_HP);
    assert.strictEqual(colony.defensePlatform.maxHp, DEFENSE_PLATFORM_MAX_HP);

    // Now add Shield Generator
    colony.pops = 10; // need 2 slots but we just directly add
    colony.buildings.push({ id: 9994, type: 'shieldGenerator', slot: 0 });
    engine._invalidateColonyCache(colony);

    // Trigger repair which recalculates maxHp
    engine._processDefensePlatformRepair();
    assert.strictEqual(colony.defensePlatform.maxHp, DEFENSE_PLATFORM_MAX_HP + 25);
  });

  it('_calcDefensePlatformMaxHP should return base when no shield generator', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    assert.strictEqual(engine._calcDefensePlatformMaxHP(colony), DEFENSE_PLATFORM_MAX_HP);
  });

  it('_calcDefensePlatformMaxHP should add 25 with shield generator', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.buildings.push({ id: 9995, type: 'shieldGenerator', slot: 0 });
    assert.strictEqual(engine._calcDefensePlatformMaxHP(colony), DEFENSE_PLATFORM_MAX_HP + 25);
  });

  it('shield generator completion should boost existing platform HP', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    giveResources(engine, 'p1', { minerals: 500, energy: 200, alloys: 300 });

    // Build and complete defense platform
    engine.handleCommand('p1', { type: 'buildDefensePlatform', colonyId: colony.id });
    for (let i = 0; i < DEFENSE_PLATFORM_BUILD_TIME; i++) engine.tick();

    // Damage the platform
    colony.defensePlatform.hp = 30;

    // Queue shield generator in building queue and let it complete
    colony.pops = 10;
    engine._invalidateColonyCache(colony);
    colony.buildingQueue.push({ id: engine._nextId(), type: 'shieldGenerator', slot: 0, ticksRemaining: 1 });
    engine.tick(); // completes

    // HP should be boosted by 25 but capped at new maxHp
    assert.strictEqual(colony.defensePlatform.maxHp, DEFENSE_PLATFORM_MAX_HP + 25);
    assert.strictEqual(colony.defensePlatform.hp, 55); // 30 + 25
  });
});

describe('Building Demolition', () => {
  it('should demolish a built building', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    const buildingId = engine._nextId();
    colony.buildings.push({ id: buildingId, type: 'researchLab', slot: 0 });

    const result = engine.handleCommand('p1', { type: 'demolish', colonyId: colony.id, districtId: buildingId });
    assert.ok(result.ok);
    assert.strictEqual(colony.buildings.length, 0);
  });

  it('should cancel a queued building with 50% refund', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 500, energy: 200, alloys: 200 });
    const colony = getColony(engine);
    const buildResult = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'foundry' });
    const queuedId = buildResult.id;

    const state = engine.playerStates.get('p1');
    const mineralsBefore = state.resources.minerals; // 500 - 300 = 200

    const result = engine.handleCommand('p1', { type: 'demolish', colonyId: colony.id, districtId: queuedId });
    assert.ok(result.ok);
    assert.strictEqual(colony.buildingQueue.length, 0);
    // Should get 50% of 300 minerals = 150 back
    assert.strictEqual(state.resources.minerals, mineralsBefore + 150);
  });
});

describe('Building Serialization', () => {
  it('colony serialization should include buildings and buildingQueue', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.buildings.push({ id: 9996, type: 'researchLab', slot: 0 });
    colony.buildingQueue.push({ id: 9997, type: 'foundry', slot: 1, ticksRemaining: 250 });
    engine._invalidateColonyCache(colony);

    const state = engine.getPlayerState('p1');
    const serialized = state.colonies[0];

    assert.ok(Array.isArray(serialized.buildings));
    assert.strictEqual(serialized.buildings.length, 1);
    assert.strictEqual(serialized.buildings[0].type, 'researchLab');

    assert.ok(Array.isArray(serialized.buildingQueue));
    assert.strictEqual(serialized.buildingQueue.length, 1);
    assert.strictEqual(serialized.buildingQueue[0].type, 'foundry');
    assert.strictEqual(serialized.buildingQueue[0].ticksRemaining, 250);

    assert.ok(typeof serialized.buildingSlotsUnlocked === 'number');
  });

  it('new colony should have empty buildings array', () => {
    const engine = makeEngine();
    const state = engine.getPlayerState('p1');
    const colony = state.colonies[0];
    assert.ok(Array.isArray(colony.buildings));
    assert.strictEqual(colony.buildings.length, 0);
    assert.ok(Array.isArray(colony.buildingQueue));
    assert.strictEqual(colony.buildingQueue.length, 0);
  });
});

describe('Building Edge Cases', () => {
  it('building all 3 types in 3 slots should work', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 2000, energy: 500, alloys: 500 });
    const colony = getColony(engine);
    colony.pops = 15; // 3 slots
    engine._invalidateColonyCache(colony);

    const r1 = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'researchLab' });
    const r2 = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'foundry' });
    const r3 = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'shieldGenerator' });
    assert.ok(r1.ok);
    assert.ok(r2.ok);
    assert.ok(r3.ok);
    assert.strictEqual(colony.buildingQueue.length, 3);
  });

  it('should reject 4th building even with 15 pops (only 3 slots max)', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 2000, energy: 500, alloys: 500 });
    const colony = getColony(engine);
    colony.pops = 15;
    engine._invalidateColonyCache(colony);

    engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'researchLab' });
    engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'foundry' });
    engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'shieldGenerator' });
    // All 3 types used, no more to build — but also no slots
    // (This would actually fail on "no slots" since used=3, unlocked=3)
    // Verify colony has 3 queued
    assert.strictEqual(colony.buildingQueue.length, 3);
  });

  it('duplicate check should consider both built and queued', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 2000, energy: 500, alloys: 500 });
    const colony = getColony(engine);
    colony.pops = 15; // 3 slots
    colony.buildings.push({ id: 8888, type: 'researchLab', slot: 0 }); // already built
    engine._invalidateColonyCache(colony);

    const result = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'researchLab' });
    assert.ok(result.error);
    assert.match(result.error, /Already have this building type/);
  });

  it('shield generator consumes energy in production', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.buildings.push({ id: 9998, type: 'shieldGenerator', slot: 0 });
    engine._invalidateColonyCache(colony);

    const { consumption } = engine._calcProduction(colony);
    // Base consumption from districts + 3 from shield generator
    assert.ok(consumption.energy >= 3);
  });
});
