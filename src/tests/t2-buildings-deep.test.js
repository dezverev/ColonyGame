const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, BUILDING_DEFS, DEFENSE_PLATFORM_MAX_HP, DEFENSE_PLATFORM_BUILD_TIME, TECH_TREE } = require('../../server/game-engine');

function makeRoom(playerCount = 1) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set('p' + i, { id: 'p' + i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 'p1', maxPlayers: 4, status: 'playing', players, matchTimer: 0 };
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

function giveT2Prerequisites(engine, playerId, colony, techId, baseBuilding) {
  const state = engine.playerStates.get(playerId);
  if (!state.completedTechs.includes(techId)) {
    state.completedTechs.push(techId);
  }
  const t2Def = TECH_TREE[techId];
  if (t2Def && t2Def.requires && !state.completedTechs.includes(t2Def.requires)) {
    state.completedTechs.push(t2Def.requires);
  }
  if (!colony.buildings.some(b => b.type === baseBuilding)) {
    colony.buildings.push({ id: engine._nextId(), type: baseBuilding, slot: colony.buildings.length });
  }
  engine._invalidateColonyCache(colony);
}

// ── T2 Resource Deduction ────────────────────────────────────────────

describe('T2 Buildings — Resource Deduction', () => {
  it('Quantum Lab should deduct 400 minerals + 100 energy', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 1000, energy: 500, alloys: 500 });
    const colony = getColony(engine);
    colony.pops = 15;
    giveT2Prerequisites(engine, 'p1', colony, 'advanced_reactors', 'researchLab');

    engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'quantumLab' });
    const res = engine.playerStates.get('p1').resources;
    assert.strictEqual(res.minerals, 600, 'minerals should be 1000 - 400');
    assert.strictEqual(res.energy, 400, 'energy should be 500 - 100');
  });

  it('Advanced Foundry should deduct 400 minerals + 100 alloys', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 1000, energy: 500, alloys: 500 });
    const colony = getColony(engine);
    colony.pops = 15;
    giveT2Prerequisites(engine, 'p1', colony, 'deep_mining', 'foundry');

    engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'advancedFoundry' });
    const res = engine.playerStates.get('p1').resources;
    assert.strictEqual(res.minerals, 600, 'minerals should be 1000 - 400');
    assert.strictEqual(res.alloys, 400, 'alloys should be 500 - 100');
  });

  it('Planetary Shield should deduct 300 minerals + 200 alloys', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 1000, energy: 500, alloys: 500 });
    const colony = getColony(engine);
    colony.pops = 15;
    giveT2Prerequisites(engine, 'p1', colony, 'gene_crops', 'shieldGenerator');

    engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'planetaryShield' });
    const res = engine.playerStates.get('p1').resources;
    assert.strictEqual(res.minerals, 700, 'minerals should be 1000 - 300');
    assert.strictEqual(res.alloys, 300, 'alloys should be 500 - 200');
  });
});

// ── T2 Demolition / Refund ───────────────────────────────────────────

describe('T2 Buildings — Demolition and Refund', () => {
  it('cancelling queued Quantum Lab should refund 50% of 400 minerals + 100 energy', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 1000, energy: 500, alloys: 500 });
    const colony = getColony(engine);
    colony.pops = 15;
    giveT2Prerequisites(engine, 'p1', colony, 'advanced_reactors', 'researchLab');

    const buildResult = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'quantumLab' });
    const res = engine.playerStates.get('p1').resources;
    const mineralsAfterBuild = res.minerals; // 600
    const energyAfterBuild = res.energy;     // 400

    const result = engine.handleCommand('p1', { type: 'demolish', colonyId: colony.id, districtId: buildResult.id });
    assert.ok(result.ok);
    assert.strictEqual(colony.buildingQueue.length, 0);
    assert.strictEqual(res.minerals, mineralsAfterBuild + 200, '50% of 400 minerals refunded');
    assert.strictEqual(res.energy, energyAfterBuild + 50, '50% of 100 energy refunded');
  });

  it('cancelling queued Advanced Foundry should refund 50% of 400 minerals + 100 alloys', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 1000, energy: 500, alloys: 500 });
    const colony = getColony(engine);
    colony.pops = 15;
    giveT2Prerequisites(engine, 'p1', colony, 'deep_mining', 'foundry');

    const buildResult = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'advancedFoundry' });
    const res = engine.playerStates.get('p1').resources;
    const mineralsAfterBuild = res.minerals;
    const alloysAfterBuild = res.alloys;

    const result = engine.handleCommand('p1', { type: 'demolish', colonyId: colony.id, districtId: buildResult.id });
    assert.ok(result.ok);
    assert.strictEqual(res.minerals, mineralsAfterBuild + 200, '50% of 400 minerals refunded');
    assert.strictEqual(res.alloys, alloysAfterBuild + 50, '50% of 100 alloys refunded');
  });

  it('demolishing a built T2 building should remove it', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    const buildingId = engine._nextId();
    colony.buildings.push({ id: buildingId, type: 'quantumLab', slot: 0 });

    const result = engine.handleCommand('p1', { type: 'demolish', colonyId: colony.id, districtId: buildingId });
    assert.ok(result.ok);
    assert.strictEqual(colony.buildings.filter(b => b.type === 'quantumLab').length, 0);
  });
});

// ── T2 Prerequisite Edge Cases ───────────────────────────────────────

describe('T2 Buildings — Prerequisite Edge Cases', () => {
  it('base building in queue (not built) should NOT satisfy T2 prerequisite', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 3000, energy: 1000, alloys: 1000 });
    const colony = getColony(engine);
    colony.pops = 15;
    // Grant tech but queue (don't build) the base building
    const state = engine.playerStates.get('p1');
    state.completedTechs.push('improved_power_plants', 'advanced_reactors');
    engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'researchLab' });
    // researchLab is in buildingQueue, not buildings
    assert.strictEqual(colony.buildingQueue.length, 1);
    assert.strictEqual(colony.buildings.filter(b => b.type === 'researchLab').length, 0);

    const result = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'quantumLab' });
    assert.ok(result.error, 'should reject when base building is only queued');
    assert.match(result.error, /Requires Research Lab/);
  });

  it('should reject T2 building on colony owned by another player', () => {
    const engine = makeEngine({ twoPlayers: true });
    const colony2 = getColony(engine, 'p2');
    giveResources(engine, 'p1', { minerals: 3000, energy: 1000, alloys: 1000 });
    // Give p1 the tech but try to build on p2's colony
    const state = engine.playerStates.get('p1');
    state.completedTechs.push('improved_power_plants', 'advanced_reactors');
    colony2.buildings.push({ id: engine._nextId(), type: 'researchLab', slot: 0 });

    const result = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony2.id, buildingType: 'quantumLab' });
    assert.ok(result.error);
    assert.match(result.error, /Not your colony/);
  });

  it('should reject T2 building when resources are exactly 1 short', () => {
    const engine = makeEngine();
    // Quantum Lab costs 400 minerals + 100 energy — give 399 minerals
    giveResources(engine, 'p1', { minerals: 399, energy: 100, alloys: 500 });
    const colony = getColony(engine);
    colony.pops = 15;
    giveT2Prerequisites(engine, 'p1', colony, 'advanced_reactors', 'researchLab');

    const result = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'quantumLab' });
    assert.ok(result.error);
    assert.match(result.error, /Not enough/);
  });
});

// ── T2 + T1 Combined Production ──────────────────────────────────────

describe('T2 Buildings — Combined T1+T2 Production', () => {
  it('Research Lab + Quantum Lab should produce combined research output', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.pops = 15; // enough workers for both
    colony.buildings.push({ id: 9700, type: 'researchLab', slot: 0 });
    colony.buildings.push({ id: 9701, type: 'quantumLab', slot: 1 });
    engine._invalidateColonyCache(colony);

    const { production, consumption } = engine._calcProduction(colony);
    // researchLab: 4/4/4 + quantumLab: 3/3/2
    assert.ok(production.physics >= 7, `physics should be at least 7, got ${production.physics}`);
    assert.ok(production.society >= 7, `society should be at least 7, got ${production.society}`);
    assert.ok(production.engineering >= 6, `engineering should be at least 6, got ${production.engineering}`);
    // Energy consumption: researchLab 2 + quantumLab 4
    assert.ok(consumption.energy >= 6, `energy consumption should be at least 6, got ${consumption.energy}`);
  });

  it('Foundry + Advanced Foundry should produce combined alloy output', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.pops = 15;
    colony.buildings.push({ id: 9702, type: 'foundry', slot: 0 });
    colony.buildings.push({ id: 9703, type: 'advancedFoundry', slot: 1 });
    engine._invalidateColonyCache(colony);

    const { production, consumption } = engine._calcProduction(colony);
    // foundry: 4 alloys + advancedFoundry: 8 alloys
    assert.ok(production.alloys >= 12, `alloys should be at least 12, got ${production.alloys}`);
    assert.ok(consumption.energy >= 6, `energy consumption should be at least 6, got ${consumption.energy}`);
    assert.ok(consumption.minerals >= 2, `mineral consumption should be at least 2, got ${consumption.minerals}`);
  });
});

// ── T2 Building Jobs ─────────────────────────────────────────────────

describe('T2 Buildings — Job Count', () => {
  it('each T2 building should add 1 job', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    const jobsBefore = engine._calcJobs(colony);

    colony.buildings.push({ id: 9710, type: 'quantumLab', slot: 0 });
    engine._invalidateColonyCache(colony);
    assert.strictEqual(engine._calcJobs(colony), jobsBefore + 1, 'quantumLab should add 1 job');

    colony.buildings.push({ id: 9711, type: 'advancedFoundry', slot: 1 });
    engine._invalidateColonyCache(colony);
    assert.strictEqual(engine._calcJobs(colony), jobsBefore + 2, 'advancedFoundry should add another job');

    colony.buildings.push({ id: 9712, type: 'planetaryShield', slot: 2 });
    engine._invalidateColonyCache(colony);
    assert.strictEqual(engine._calcJobs(colony), jobsBefore + 3, 'planetaryShield should add another job');
  });
});

// ── Planetary Shield + Defense Platform ──────────────────────────────

describe('T2 Buildings — Planetary Shield Defense Boost', () => {
  it('completing Planetary Shield should boost existing defense platform HP by 50', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    giveResources(engine, 'p1', { minerals: 3000, energy: 1000, alloys: 1000 });

    // Build and complete defense platform
    engine.handleCommand('p1', { type: 'buildDefensePlatform', colonyId: colony.id });
    for (let i = 0; i < DEFENSE_PLATFORM_BUILD_TIME; i++) engine.tick();

    // Damage the platform
    colony.defensePlatform.hp = 20;

    // Queue planetary shield and let it complete
    colony.pops = 15;
    // Need shieldGenerator as base building
    colony.buildings.push({ id: engine._nextId(), type: 'shieldGenerator', slot: 0 });
    engine._invalidateColonyCache(colony);
    colony.buildingQueue.push({ id: engine._nextId(), type: 'planetaryShield', slot: 1, ticksRemaining: 1 });
    engine.tick(); // completes

    assert.strictEqual(colony.defensePlatform.maxHp, DEFENSE_PLATFORM_MAX_HP + 25 + 50,
      'maxHp should include shieldGenerator (+25) and planetaryShield (+50)');
    assert.strictEqual(colony.defensePlatform.hp, 70,
      'hp should be boosted by 50 (20 + 50 = 70)');
  });

  it('all three shield buildings should stack correctly', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.buildings.push({ id: 9720, type: 'shieldGenerator', slot: 0 });
    colony.buildings.push({ id: 9721, type: 'planetaryShield', slot: 1 });

    const maxHp = engine._calcDefensePlatformMaxHP(colony);
    assert.strictEqual(maxHp, DEFENSE_PLATFORM_MAX_HP + 25 + 50,
      'should stack shieldGenerator (+25) and planetaryShield (+50)');
  });
});

// ── T2 Building Serialization ────────────────────────────────────────

describe('T2 Buildings — Serialization', () => {
  it('built T2 buildings should appear in getPlayerState colonies', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.pops = 15;
    colony.buildings.push({ id: 9730, type: 'researchLab', slot: 0 });
    colony.buildings.push({ id: 9731, type: 'quantumLab', slot: 1 });
    colony.buildings.push({ id: 9732, type: 'advancedFoundry', slot: 2 });
    engine._invalidateColonyCache(colony);

    const state = engine.getPlayerState('p1');
    const serialized = state.colonies[0];
    assert.strictEqual(serialized.buildings.length, 3);
    const types = serialized.buildings.map(b => b.type);
    assert.ok(types.includes('researchLab'));
    assert.ok(types.includes('quantumLab'));
    assert.ok(types.includes('advancedFoundry'));
  });

  it('queued T2 building should appear in buildingQueue with correct ticksRemaining', () => {
    const engine = makeEngine();
    const colony = getColony(engine);
    colony.pops = 15;
    colony.buildingQueue.push({ id: 9740, type: 'planetaryShield', slot: 0, ticksRemaining: 600 });
    engine._invalidateColonyCache(colony);

    const state = engine.getPlayerState('p1');
    const serialized = state.colonies[0];
    assert.strictEqual(serialized.buildingQueue.length, 1);
    assert.strictEqual(serialized.buildingQueue[0].type, 'planetaryShield');
    assert.strictEqual(serialized.buildingQueue[0].ticksRemaining, 600);
  });
});

// ── T2 Duplicate Checks ─────────────────────────────────────────────

describe('T2 Buildings — Duplicate Prevention', () => {
  it('should reject duplicate T2 building when already built', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 3000, energy: 1000, alloys: 1000 });
    const colony = getColony(engine);
    colony.pops = 15;
    giveT2Prerequisites(engine, 'p1', colony, 'advanced_reactors', 'researchLab');
    colony.buildings.push({ id: engine._nextId(), type: 'quantumLab', slot: 1 });
    engine._invalidateColonyCache(colony);

    const result = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'quantumLab' });
    assert.ok(result.error);
    assert.match(result.error, /Already have this building type/);
  });

  it('should reject duplicate T2 building when already queued', () => {
    const engine = makeEngine();
    giveResources(engine, 'p1', { minerals: 3000, energy: 1000, alloys: 1000 });
    const colony = getColony(engine);
    colony.pops = 15;
    giveT2Prerequisites(engine, 'p1', colony, 'advanced_reactors', 'researchLab');

    const r1 = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'quantumLab' });
    assert.ok(r1.ok);

    const r2 = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'quantumLab' });
    assert.ok(r2.error);
    assert.match(r2.error, /Already have this building type/);
  });
});
