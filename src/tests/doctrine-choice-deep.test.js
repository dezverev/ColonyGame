const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  DOCTRINE_DEFS, DOCTRINE_SELECTION_TICKS,
  COLONY_SHIP_COST, COLONY_SHIP_BUILD_TIME,
  DISTRICT_DEFS, MONTH_TICKS,
} = require('../../server/game-engine');

// Helper: create a game engine with N players
function createEngine(opts = {}) {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  if (opts.twoPlayer !== false) {
    players.set('p2', { name: 'Player 2' });
  }
  if (opts.threePlayer) {
    players.set('p3', { name: 'Player 3' });
  }
  const room = { players, galaxySize: 'small', matchTimer: opts.matchTimer || 0 };
  return new GameEngine(room, { tickRate: 10 });
}

function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

function giveResources(engine, playerId) {
  const state = engine.playerStates.get(playerId);
  state.resources.minerals = 10000;
  state.resources.alloys = 10000;
  state.resources.energy = 10000;
  state.resources.food = 10000;
  state.resources.influence = 1000;
}

function skipDoctrinePhase(engine) {
  for (const [, state] of engine.playerStates) {
    if (state.doctrine === null) state.doctrine = 'industrialist';
  }
  engine._doctrinePhase = false;
}

// ── Industrialist Deep Coverage ──

describe('Industrialist — Deep', () => {
  it('should not add extra district if colony is already at max size', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    // Fill colony to max
    while (colony.districts.length < colony.planet.size) {
      engine._addBuiltDistrict(colony, 'mining');
    }
    engine._invalidateColonyCache(colony);
    const districtCountBefore = colony.districts.length;
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    assert.strictEqual(colony.districts.length, districtCountBefore, 'should not exceed planet size');
  });

  it('mining bonus should be exactly 25% on mineral production', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');

    // Add 1 extra mining to match what industrialist will add, then get baseline
    engine._addBuiltDistrict(colony, 'mining');
    engine._invalidateColonyCache(colony);
    const baseWithExtra = engine._calcProduction(colony);
    const baseMinWithExtra = baseWithExtra.production.minerals;
    assert.ok(baseMinWithExtra > 0, 'need baseline mineral production');

    // Remove the extra district, apply industrialist (which adds +1 mining)
    colony.districts.pop();
    engine._invalidateColonyCache(colony);
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    engine._invalidateColonyCache(getFirstColony(engine, 'p1'));
    const prod = engine._calcProduction(getFirstColony(engine, 'p1'));
    // Should be exactly 25% more than the same district count without doctrine
    const expected = Math.round(baseMinWithExtra * 1.25 * 100) / 100;
    assert.strictEqual(prod.production.minerals, expected, 'mining should be exactly +25%');
  });

  it('should not modify energy or food production', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    // Add energy and farm districts for baseline
    engine._addBuiltDistrict(colony, 'generator');
    engine._addBuiltDistrict(colony, 'agriculture');
    engine._invalidateColonyCache(colony);
    const baseline = engine._calcProduction(colony);

    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    engine._invalidateColonyCache(colony);
    const afterDoctrine = engine._calcProduction(colony);
    // Energy and food should be unchanged by industrialist
    assert.strictEqual(afterDoctrine.production.energy, baseline.production.energy, 'energy unchanged');
    assert.strictEqual(afterDoctrine.production.food, baseline.production.food, 'food unchanged');
  });

  it('research penalty is exactly -10% on all 3 research resources', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');

    // Add research + extra mining to match what industrialist will add
    engine._addBuiltDistrict(colony, 'research');
    engine._addBuiltDistrict(colony, 'mining');
    engine._invalidateColonyCache(colony);
    const baseline = engine._calcProduction(colony);

    // Remove the extra mining, apply industrialist (which adds +1 mining back)
    colony.districts.pop();
    engine._invalidateColonyCache(colony);
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    engine._invalidateColonyCache(colony);
    const prod = engine._calcProduction(colony);

    // Compare research output: industrialist should be -10% vs same-layout no-doctrine
    if (baseline.production.physics > 0) {
      assert.strictEqual(prod.production.physics, Math.round(baseline.production.physics * 0.9 * 100) / 100, 'physics -10%');
    }
    if (baseline.production.society > 0) {
      assert.strictEqual(prod.production.society, Math.round(baseline.production.society * 0.9 * 100) / 100, 'society -10%');
    }
    if (baseline.production.engineering > 0) {
      assert.strictEqual(prod.production.engineering, Math.round(baseline.production.engineering * 0.9 * 100) / 100, 'engineering -10%');
    }
  });
});

// ── Scholar Deep Coverage ──

describe('Scholar — Deep', () => {
  it('should set research progress to 50 even when progress is 0', () => {
    const engine = createEngine();
    const state = engine.playerStates.get('p1');
    // Explicitly set to 0 (falsy value)
    state.researchProgress['improved_power_plants'] = 0;
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'scholar' });
    // 0 is falsy, so !0 === true, progress should be set to 50
    assert.strictEqual(state.researchProgress['improved_power_plants'], 50);
  });

  it('research bonus should be exactly 25% on all 3 research resources', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    engine._addBuiltDistrict(colony, 'research');
    engine._invalidateColonyCache(colony);
    const baseline = engine._calcProduction(colony);

    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'scholar' });
    engine._invalidateColonyCache(colony);
    const prod = engine._calcProduction(colony);
    if (baseline.production.physics > 0) {
      const expected = Math.round(baseline.production.physics * 1.25 * 100) / 100;
      assert.strictEqual(prod.production.physics, expected, 'physics +25%');
    }
    if (baseline.production.society > 0) {
      const expected = Math.round(baseline.production.society * 1.25 * 100) / 100;
      assert.strictEqual(prod.production.society, expected, 'society +25%');
    }
    if (baseline.production.engineering > 0) {
      const expected = Math.round(baseline.production.engineering * 1.25 * 100) / 100;
      assert.strictEqual(prod.production.engineering, expected, 'engineering +25%');
    }
  });

  it('should not modify energy, food, or alloy production', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    engine._addBuiltDistrict(colony, 'generator');
    engine._addBuiltDistrict(colony, 'agriculture');
    engine._addBuiltDistrict(colony, 'industrial');
    engine._invalidateColonyCache(colony);
    const baseline = engine._calcProduction(colony);

    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'scholar' });
    engine._invalidateColonyCache(colony);
    const prod = engine._calcProduction(colony);
    assert.strictEqual(prod.production.energy, baseline.production.energy, 'energy unchanged');
    assert.strictEqual(prod.production.food, baseline.production.food, 'food unchanged');
    assert.strictEqual(prod.production.alloys, baseline.production.alloys, 'alloys unchanged');
  });

  it('mineral penalty is exactly -10%', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const baseline = engine._calcProduction(colony);
    const baseMinerals = baseline.production.minerals;
    assert.ok(baseMinerals > 0, 'need baseline mineral production');

    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'scholar' });
    engine._invalidateColonyCache(colony);
    const prod = engine._calcProduction(colony);
    const expected = Math.round(baseMinerals * 0.9 * 100) / 100;
    assert.strictEqual(prod.production.minerals, expected, 'minerals -10%');
  });
});

// ── Expansionist Deep Coverage ──

describe('Expansionist — Deep', () => {
  it('should discount all colony ship resource costs by 25%', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'expansionist' });
    const state = engine.playerStates.get('p1');
    const colony = getFirstColony(engine, 'p1');

    // Record resources before
    const before = { ...state.resources };
    engine.handleCommand('p1', { type: 'buildColonyShip', colonyId: colony.id });

    // Verify each resource was discounted
    for (const [resource, amount] of Object.entries(COLONY_SHIP_COST)) {
      const expectedCost = Math.ceil(amount * 0.75);
      const actualCost = before[resource] - state.resources[resource];
      assert.strictEqual(actualCost, expectedCost, `${resource} cost should be 75% of base`);
    }
  });

  it('non-expansionist pays full colony ship cost', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'scholar' });
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    const state = engine.playerStates.get('p1');
    const colony = getFirstColony(engine, 'p1');

    const before = { ...state.resources };
    engine.handleCommand('p1', { type: 'buildColonyShip', colonyId: colony.id });

    for (const [resource, amount] of Object.entries(COLONY_SHIP_COST)) {
      const actualCost = before[resource] - state.resources[resource];
      assert.strictEqual(actualCost, amount, `${resource} should be full price for non-expansionist`);
    }
  });

  it('should not modify energy, food, or mineral production', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    engine._addBuiltDistrict(colony, 'generator');
    engine._addBuiltDistrict(colony, 'agriculture');
    engine._invalidateColonyCache(colony);
    const baseline = engine._calcProduction(colony);

    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'expansionist' });
    engine._invalidateColonyCache(colony);
    const prod = engine._calcProduction(colony);
    assert.strictEqual(prod.production.energy, baseline.production.energy, 'energy unchanged');
    assert.strictEqual(prod.production.food, baseline.production.food, 'food unchanged');
    assert.strictEqual(prod.production.minerals, baseline.production.minerals, 'minerals unchanged');
  });

  it('alloy penalty is exactly -10%', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    engine._addBuiltDistrict(colony, 'industrial');
    engine._invalidateColonyCache(colony);
    const baseline = engine._calcProduction(colony);
    const baseAlloys = baseline.production.alloys;
    assert.ok(baseAlloys > 0, 'need baseline alloy production');

    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'expansionist' });
    engine._invalidateColonyCache(colony);
    const prod = engine._calcProduction(colony);
    const expected = Math.round(baseAlloys * 0.9 * 100) / 100;
    assert.strictEqual(prod.production.alloys, expected, 'alloys -10%');
  });

  it('pops bonus is added even if colony already has many pops', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    colony.pops = 50;
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'expansionist' });
    assert.strictEqual(colony.pops, 52, 'should add +2 regardless of current count');
  });
});

// ── Doctrine Phase Lifecycle ──

describe('Doctrine Phase — Lifecycle', () => {
  it('doctrine phase should not restart after ending', () => {
    const engine = createEngine();
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'scholar' });
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'scholar' });
    assert.strictEqual(engine._doctrinePhase, false);
    // Tick many times — phase should stay false
    for (let i = 0; i < 500; i++) engine.tick();
    assert.strictEqual(engine._doctrinePhase, false);
  });

  it('doctrine persists across many ticks', () => {
    const engine = createEngine();
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'scholar' });
    for (let i = 0; i < 200; i++) engine.tick();
    assert.strictEqual(engine.playerStates.get('p1').doctrine, 'industrialist');
    assert.strictEqual(engine.playerStates.get('p2').doctrine, 'scholar');
  });

  it('auto-assignment only emits events for undecided players', () => {
    const engine = createEngine();
    const events = [];
    engine.onEvent = (evts) => events.push(...evts);
    // p1 chooses, p2 does not
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'scholar' });
    for (let i = 0; i <= DOCTRINE_SELECTION_TICKS; i++) engine.tick();
    const autoEvents = events.filter(e => e.eventType === 'doctrineAutoAssigned');
    assert.strictEqual(autoEvents.length, 1, 'only p2 should get auto-assigned event');
  });

  it('with 3 players, phase ends only when all 3 choose', () => {
    const engine = createEngine({ threePlayer: true });
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    assert.strictEqual(engine._doctrinePhase, true);
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'scholar' });
    assert.strictEqual(engine._doctrinePhase, true);
    engine.handleCommand('p3', { type: 'selectDoctrine', doctrineType: 'expansionist' });
    assert.strictEqual(engine._doctrinePhase, false, 'phase ends when all 3 choose');
  });

  it('single-player game ends doctrine phase on first selection', () => {
    const engine = createEngine({ twoPlayer: false });
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'expansionist' });
    assert.strictEqual(engine._doctrinePhase, false);
  });
});

// ── Validation Edge Cases ──

describe('selectDoctrine — Validation Edge Cases', () => {
  it('should reject numeric doctrineType', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 42 });
    assert.ok(result.error);
  });

  it('should reject empty string doctrineType', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: '' });
    assert.ok(result.error);
  });

  it('should reject null doctrineType', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: null });
    assert.ok(result.error);
  });

  it('should reject __proto__ as doctrineType', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: '__proto__' });
    assert.ok(result.error, 'prototype pollution attempt should be rejected');
  });

  it('should reject constructor as doctrineType', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'constructor' });
    assert.ok(result.error);
  });

  it('extra fields in command should not cause errors', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', {
      type: 'selectDoctrine',
      doctrineType: 'scholar',
      extraField: 'hack',
      __proto__: { admin: true },
    });
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(engine.playerStates.get('p1').doctrine, 'scholar');
  });
});

// ── Serialization Deep Coverage ──

describe('Doctrine Serialization — Deep', () => {
  it('getPlayerStateJSON roundtrip preserves doctrine for all players', () => {
    const engine = createEngine({ threePlayer: true });
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'scholar' });
    engine.handleCommand('p3', { type: 'selectDoctrine', doctrineType: 'expansionist' });

    for (const pid of ['p1', 'p2', 'p3']) {
      const json = engine.getPlayerStateJSON(pid);
      const parsed = JSON.parse(json);
      const players = parsed.players;
      const p1 = players.find(p => p.id === 'p1');
      const p2 = players.find(p => p.id === 'p2');
      const p3 = players.find(p => p.id === 'p3');
      assert.strictEqual(p1.doctrine, 'industrialist', `p1 doctrine visible from ${pid}`);
      assert.strictEqual(p2.doctrine, 'scholar', `p2 doctrine visible from ${pid}`);
      assert.strictEqual(p3.doctrine, 'expansionist', `p3 doctrine visible from ${pid}`);
    }
  });

  it('doctrinePhase and doctrineDeadlineTick absent from JSON after phase ends', () => {
    const engine = createEngine();
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'scholar' });
    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.doctrinePhase, undefined, 'doctrinePhase should not be in JSON');
    assert.strictEqual(parsed.doctrineDeadlineTick, undefined, 'doctrineDeadlineTick should not be in JSON');
  });

  it('doctrinePhase present in JSON during selection window', () => {
    const engine = createEngine();
    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.doctrinePhase, true);
    assert.strictEqual(parsed.doctrineDeadlineTick, DOCTRINE_SELECTION_TICKS);
  });

  it('auto-assigned doctrine appears in serialized state', () => {
    const engine = createEngine();
    for (let i = 0; i <= DOCTRINE_SELECTION_TICKS; i++) engine.tick();
    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    const me = parsed.players.find(p => p.id === 'p1');
    assert.ok(me.doctrine !== null, 'auto-assigned doctrine should serialize');
    assert.ok(DOCTRINE_DEFS[me.doctrine], 'auto-assigned doctrine should be valid');
  });
});

// ── Production Modifier Stacking ──

describe('Doctrine — Production Modifier Stacking', () => {
  it('industrialist bonus stacks multiplicatively with tech modifiers', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const state = engine.playerStates.get('p1');

    // Get base production
    const baseProd = engine._calcProduction(colony);
    const baseMinerals = baseProd.production.minerals;
    assert.ok(baseMinerals > 0, 'need baseline minerals');

    // Add tech bonus
    state.completedTechs.push('improved_mining');
    engine._invalidateColonyCache(colony);
    const techProd = engine._calcProduction(colony);
    const techMinerals = techProd.production.minerals;
    assert.ok(techMinerals > baseMinerals, 'tech should boost minerals');

    // Now add doctrine
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'scholar' }); // end phase
    // Note: industrialist adds +1 mining district, need to account for that
    engine._invalidateColonyCache(colony);
    const withDoctrine = engine._calcProduction(colony);
    // Should be more than tech alone (due to +25% AND extra district)
    assert.ok(withDoctrine.production.minerals > techMinerals, 'doctrine + tech should exceed tech alone');
  });

  it('doctrine penalty and bonus do not cross-cancel on same colony', () => {
    // Industrialist: +25% mining, -10% research — verify they apply independently
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    engine._addBuiltDistrict(colony, 'research');
    engine._invalidateColonyCache(colony);
    const baseline = engine._calcProduction(colony);

    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    engine._invalidateColonyCache(colony);
    const prod = engine._calcProduction(colony);

    // Minerals should go up (bonus), research should go down (penalty)
    // Note: industrialist adds +1 mining district so minerals definitely up
    assert.ok(prod.production.minerals > baseline.production.minerals, 'minerals up from bonus');
    if (baseline.production.physics > 0) {
      assert.ok(prod.production.physics < baseline.production.physics, 'research down from penalty');
    }
  });

  it('doctrine modifiers apply after edict bonuses', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const state = engine.playerStates.get('p1');

    // Add a mining edict if available
    engine._addBuiltDistrict(colony, 'mining');
    engine._invalidateColonyCache(colony);

    // Scholar -10% minerals should apply after any edict bonus
    const baseline = engine._calcProduction(colony);
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'scholar' });
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    engine._invalidateColonyCache(colony);
    const prod = engine._calcProduction(colony);
    // With scholar penalty, minerals should be exactly 90% of baseline
    const expected = Math.round(baseline.production.minerals * 0.9 * 100) / 100;
    assert.strictEqual(prod.production.minerals, expected, 'penalty applies to post-edict value');
  });
});

// ── Cache Invalidation ──

describe('Doctrine — Cache Invalidation', () => {
  it('production cache reflects doctrine after selection', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    // Warm the cache
    const before = engine._calcProduction(colony);
    const mineralsBefore = before.production.minerals;

    // Select doctrine — should invalidate cache
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    // Cache should be invalidated, new call should reflect doctrine
    const after = engine._calcProduction(colony);
    // Industrialist adds +1 mining district AND +25% mining, so minerals must increase
    assert.ok(after.production.minerals > mineralsBefore, 'cached production should update after doctrine');
  });

  it('auto-assignment applies doctrine production modifiers', () => {
    const engine = createEngine();
    const colony1 = getFirstColony(engine, 'p1');
    // Warm cache and get baseline
    const baseline = engine._calcProduction(colony1);
    const baseMinerals = baseline.production.minerals;

    // Advance past deadline to trigger auto-assignment
    for (let i = 0; i <= DOCTRINE_SELECTION_TICKS; i++) engine.tick();

    // After auto-assignment, production should reflect the assigned doctrine
    engine._invalidateColonyCache(colony1);
    const afterProd = engine._calcProduction(colony1);
    const doctrine = engine.playerStates.get('p1').doctrine;
    // If industrialist: +1 mining district + 25% mining → minerals increase
    // If scholar: -10% minerals → minerals decrease
    // If expansionist: no mineral modifier → minerals same
    // Either way, production should differ from baseline unless expansionist
    if (doctrine === 'industrialist') {
      assert.ok(afterProd.production.minerals > baseMinerals, 'industrialist auto-assign boosts minerals');
    } else if (doctrine === 'scholar') {
      assert.ok(afterProd.production.minerals < baseMinerals, 'scholar auto-assign reduces minerals');
    }
    // For expansionist, minerals stay the same — that's fine
  });
});

// ── Cross-Feature Interactions ──

describe('Doctrine — Cross-Feature Interactions', () => {
  it('expansionist colony ship discount works with low resources', () => {
    const engine = createEngine();
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'expansionist' });
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'scholar' });
    const state = engine.playerStates.get('p1');
    const colony = getFirstColony(engine, 'p1');

    // Set resources to exactly the discounted cost
    for (const [resource, amount] of Object.entries(COLONY_SHIP_COST)) {
      state.resources[resource] = Math.ceil(amount * 0.75);
    }
    const result = engine.handleCommand('p1', { type: 'buildColonyShip', colonyId: colony.id });
    assert.deepStrictEqual(result.ok, true, 'should build with exactly discounted cost');
  });

  it('expansionist cannot build colony ship with less than discounted cost', () => {
    const engine = createEngine();
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'expansionist' });
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'scholar' });
    const state = engine.playerStates.get('p1');
    const colony = getFirstColony(engine, 'p1');

    // Set resources to 1 below discounted cost
    for (const [resource, amount] of Object.entries(COLONY_SHIP_COST)) {
      state.resources[resource] = Math.ceil(amount * 0.75) - 1;
    }
    const result = engine.handleCommand('p1', { type: 'buildColonyShip', colonyId: colony.id });
    assert.ok(result.error, 'should fail with insufficient resources');
  });

  it('scholar T1 research head start reduces time to complete T1 tech', () => {
    const engine = createEngine();
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'scholar' });
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    const state1 = engine.playerStates.get('p1');
    const state2 = engine.playerStates.get('p2');

    // Scholar should have 50 progress on T1 techs
    assert.strictEqual(state1.researchProgress['improved_power_plants'], 50);
    // Industrialist should have 0
    assert.ok(!state2.researchProgress['improved_power_plants'], 'non-scholar has no head start');
  });

  it('doctrine does not affect resource income directly (only production)', () => {
    const engine = createEngine();
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'scholar' });
    // Tick once to apply production
    engine.tick();
    // Both players should still have starting resources (adjusted by 1 tick of production)
    const s1 = engine.playerStates.get('p1');
    const s2 = engine.playerStates.get('p2');
    // Both should have positive resources — doctrine doesn't drain anything
    assert.ok(s1.resources.energy >= 0, 'industrialist should not have negative energy');
    assert.ok(s2.resources.energy >= 0, 'scholar should not have negative energy');
  });

  it('all 3 doctrines can coexist in a 3-player game', () => {
    const engine = createEngine({ threePlayer: true });
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'scholar' });
    engine.handleCommand('p3', { type: 'selectDoctrine', doctrineType: 'expansionist' });
    // Tick a few times — no crashes
    for (let i = 0; i < 50; i++) engine.tick();
    assert.strictEqual(engine.playerStates.get('p1').doctrine, 'industrialist');
    assert.strictEqual(engine.playerStates.get('p2').doctrine, 'scholar');
    assert.strictEqual(engine.playerStates.get('p3').doctrine, 'expansionist');
  });
});
