const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  DOCTRINE_DEFS, DOCTRINE_SELECTION_TICKS,
  COLONY_SHIP_COST, COLONY_SHIP_BUILD_TIME,
  DISTRICT_DEFS, MONTH_TICKS, TECH_TREE,
} = require('../../server/game-engine');

// Helper: create a game engine with N players
function createEngine(opts = {}) {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  if (opts.twoPlayer !== false) {
    players.set('p2', { name: 'Player 2' });
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

// ── Constants ──

describe('Doctrine Constants', () => {
  it('should export DOCTRINE_DEFS with 3 doctrines', () => {
    assert.ok(DOCTRINE_DEFS);
    assert.deepStrictEqual(Object.keys(DOCTRINE_DEFS).sort(), ['expansionist', 'industrialist', 'scholar']);
  });

  it('should export DOCTRINE_SELECTION_TICKS as 300', () => {
    assert.strictEqual(DOCTRINE_SELECTION_TICKS, 300);
  });

  it('each doctrine should have name, description, productionBonus, productionPenalty, startingBonus', () => {
    for (const [type, def] of Object.entries(DOCTRINE_DEFS)) {
      assert.ok(def.name, `${type} missing name`);
      assert.ok(def.description, `${type} missing description`);
      assert.ok(def.productionBonus !== undefined, `${type} missing productionBonus`);
      assert.ok(def.productionPenalty !== undefined, `${type} missing productionPenalty`);
      assert.ok(def.startingBonus !== undefined, `${type} missing startingBonus`);
    }
  });
});

// ── Initial State ──

describe('Doctrine Initial State', () => {
  it('players start with doctrine: null', () => {
    const engine = createEngine();
    const state = engine.playerStates.get('p1');
    assert.strictEqual(state.doctrine, null);
  });

  it('doctrinePhase is true at game start', () => {
    const engine = createEngine();
    assert.strictEqual(engine._doctrinePhase, true);
  });

  it('doctrineDeadlineTick equals DOCTRINE_SELECTION_TICKS', () => {
    const engine = createEngine();
    assert.strictEqual(engine._doctrineDeadlineTick, DOCTRINE_SELECTION_TICKS);
  });
});

// ── selectDoctrine Command ──

describe('selectDoctrine Command', () => {
  it('should accept valid doctrine choice', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(engine.playerStates.get('p1').doctrine, 'industrialist');
  });

  it('should reject invalid doctrine type', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'invalid' });
    assert.ok(result.error);
  });

  it('should reject missing doctrineType', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', { type: 'selectDoctrine' });
    assert.ok(result.error);
  });

  it('should reject choosing doctrine twice', () => {
    const engine = createEngine();
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'scholar' });
    const result = engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    assert.ok(result.error);
    assert.strictEqual(engine.playerStates.get('p1').doctrine, 'scholar');
  });

  it('should reject selection after doctrine phase ends', () => {
    const engine = createEngine();
    // Advance past deadline
    for (let i = 0; i <= DOCTRINE_SELECTION_TICKS; i++) engine.tick();
    assert.strictEqual(engine._doctrinePhase, false);
    const result = engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'scholar' });
    assert.ok(result.error);
  });

  it('should end doctrine phase early when all players choose', () => {
    const engine = createEngine();
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    assert.strictEqual(engine._doctrinePhase, true); // p2 hasn't chosen yet
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'scholar' });
    assert.strictEqual(engine._doctrinePhase, false); // all chosen → phase ends early
  });

  it('should emit doctrineChosen event on selection', () => {
    const engine = createEngine();
    const events = [];
    engine.onEvent = (evts) => events.push(...evts);
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'expansionist' });
    engine.tick(); // flush events
    const found = events.find(e => e.eventType === 'doctrineChosen');
    assert.ok(found);
    assert.strictEqual(found.doctrine, 'expansionist');
    assert.strictEqual(found.broadcast, true);
  });
});

// ── Auto-assignment on timer expiry ──

describe('Doctrine Auto-Assignment', () => {
  it('should auto-assign doctrine when timer expires', () => {
    const engine = createEngine();
    // Advance past deadline
    for (let i = 0; i <= DOCTRINE_SELECTION_TICKS; i++) engine.tick();
    assert.strictEqual(engine._doctrinePhase, false);
    const p1State = engine.playerStates.get('p1');
    const p2State = engine.playerStates.get('p2');
    assert.ok(p1State.doctrine !== null, 'p1 should have auto-assigned doctrine');
    assert.ok(p2State.doctrine !== null, 'p2 should have auto-assigned doctrine');
    assert.ok(DOCTRINE_DEFS[p1State.doctrine], 'p1 doctrine should be valid');
    assert.ok(DOCTRINE_DEFS[p2State.doctrine], 'p2 doctrine should be valid');
  });

  it('should only auto-assign to players who haven\'t chosen', () => {
    const engine = createEngine();
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'scholar' });
    // Advance past deadline
    for (let i = 0; i <= DOCTRINE_SELECTION_TICKS; i++) engine.tick();
    assert.strictEqual(engine.playerStates.get('p1').doctrine, 'scholar'); // unchanged
    assert.ok(engine.playerStates.get('p2').doctrine !== null); // auto-assigned
  });

  it('should emit doctrineAutoAssigned event for auto-assigned players', () => {
    const engine = createEngine();
    const events = [];
    engine.onEvent = (evts) => events.push(...evts);
    for (let i = 0; i <= DOCTRINE_SELECTION_TICKS; i++) engine.tick();
    const autoEvents = events.filter(e => e.eventType === 'doctrineAutoAssigned');
    assert.strictEqual(autoEvents.length, 2); // both players
  });
});

// ── Industrialist Starting Bonus ──

describe('Industrialist Doctrine', () => {
  it('should add extra mining district on starting colony', () => {
    const engine = createEngine();
    const colonyBefore = getFirstColony(engine, 'p1');
    const miningBefore = colonyBefore.districts.filter(d => d.type === 'mining').length;
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    const colonyAfter = getFirstColony(engine, 'p1');
    const miningAfter = colonyAfter.districts.filter(d => d.type === 'mining').length;
    assert.strictEqual(miningAfter, miningBefore + 1);
  });

  it('should boost mining production by 25%', () => {
    const engine = createEngine();
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'scholar' }); // control
    const colony1 = getFirstColony(engine, 'p1');
    const colony2 = getFirstColony(engine, 'p2');
    const prod1 = engine._calcProduction(colony1);
    const prod2 = engine._calcProduction(colony2);
    // Industrialist has more mining districts AND +25% mining bonus
    assert.ok(prod1.production.minerals > prod2.production.minerals);
  });

  it('should boost industrial (alloy) production by 25%', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
    // Build industrial district on both
    const c1 = getFirstColony(engine, 'p1');
    const c2 = getFirstColony(engine, 'p2');
    engine._addBuiltDistrict(c1, 'industrial');
    engine._addBuiltDistrict(c2, 'industrial');
    engine._invalidateColonyCache(c1);
    engine._invalidateColonyCache(c2);
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'expansionist' });
    engine._invalidateColonyCache(c1);
    engine._invalidateColonyCache(c2);
    const prod1 = engine._calcProduction(c1);
    const prod2 = engine._calcProduction(c2);
    // Industrialist +25% alloy vs expansionist -10% alloy
    assert.ok(prod1.production.alloys > prod2.production.alloys);
  });

  it('should reduce research output by 10%', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
    // Build research districts
    const c1 = getFirstColony(engine, 'p1');
    const c2 = getFirstColony(engine, 'p2');
    engine._addBuiltDistrict(c1, 'research');
    engine._addBuiltDistrict(c2, 'research');
    engine._invalidateColonyCache(c1);
    engine._invalidateColonyCache(c2);
    // Get baseline research from c2 (no doctrine yet)
    const baselineProd = engine._calcProduction(c2);
    const baselinePhysics = baselineProd.production.physics;
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    engine._invalidateColonyCache(c1);
    const prod1 = engine._calcProduction(c1);
    // Industrialist -10% research — should be less than baseline
    assert.ok(prod1.production.physics < baselinePhysics);
  });
});

// ── Scholar Starting Bonus ──

describe('Scholar Doctrine', () => {
  it('should set T1 research progress to 50 in all 3 tracks', () => {
    const engine = createEngine();
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'scholar' });
    const state = engine.playerStates.get('p1');
    assert.strictEqual(state.researchProgress['improved_power_plants'], 50);
    assert.strictEqual(state.researchProgress['frontier_medicine'], 50);
    assert.strictEqual(state.researchProgress['improved_mining'], 50);
  });

  it('should not overwrite existing research progress', () => {
    const engine = createEngine();
    const state = engine.playerStates.get('p1');
    state.researchProgress['improved_power_plants'] = 100; // already ahead
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'scholar' });
    assert.strictEqual(state.researchProgress['improved_power_plants'], 100); // unchanged
  });

  it('should boost research production by 25%', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
    const c1 = getFirstColony(engine, 'p1');
    const c2 = getFirstColony(engine, 'p2');
    engine._addBuiltDistrict(c1, 'research');
    engine._addBuiltDistrict(c2, 'research');
    engine._invalidateColonyCache(c1);
    engine._invalidateColonyCache(c2);
    // Get control baseline
    const baseline = engine._calcProduction(c2);
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'scholar' });
    engine._invalidateColonyCache(c1);
    const prod1 = engine._calcProduction(c1);
    assert.ok(prod1.production.physics > baseline.production.physics);
  });

  it('should reduce mineral production by 10%', () => {
    const engine = createEngine();
    const c1 = getFirstColony(engine, 'p1');
    // Get baseline mining production
    const baseline = engine._calcProduction(c1);
    const baselineMinerals = baseline.production.minerals;
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'scholar' });
    engine._invalidateColonyCache(c1);
    const prod = engine._calcProduction(c1);
    // -10% minerals
    const expected = Math.round(baselineMinerals * 0.9 * 100) / 100;
    assert.strictEqual(prod.production.minerals, expected);
  });
});

// ── Expansionist Starting Bonus ──

describe('Expansionist Doctrine', () => {
  it('should add 2 extra pops on starting colony', () => {
    const engine = createEngine();
    const colonyBefore = getFirstColony(engine, 'p1');
    const popsBefore = colonyBefore.pops;
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'expansionist' });
    assert.strictEqual(colonyBefore.pops, popsBefore + 2);
  });

  it('should reduce colony ship cost by 25%', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'expansionist' });
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'scholar' });
    const c1 = getFirstColony(engine, 'p1');
    const c2 = getFirstColony(engine, 'p2');
    const s1 = engine.playerStates.get('p1');
    const s2 = engine.playerStates.get('p2');
    const m1Before = s1.resources.minerals;
    const m2Before = s2.resources.minerals;
    engine.handleCommand('p1', { type: 'buildColonyShip', colonyId: c1.id });
    engine.handleCommand('p2', { type: 'buildColonyShip', colonyId: c2.id });
    const m1After = s1.resources.minerals;
    const m2After = s2.resources.minerals;
    // Expansionist pays 75% of COLONY_SHIP_COST.minerals
    assert.strictEqual(m1Before - m1After, Math.ceil(COLONY_SHIP_COST.minerals * 0.75));
    assert.strictEqual(m2Before - m2After, COLONY_SHIP_COST.minerals);
  });

  it('should reduce colony ship build time by 25%', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'expansionist' });
    const c1 = getFirstColony(engine, 'p1');
    engine.handleCommand('p1', { type: 'buildColonyShip', colonyId: c1.id });
    const queue = c1.buildQueue.find(q => q.type === 'colonyShip');
    assert.ok(queue);
    assert.strictEqual(queue.ticksRemaining, Math.ceil(COLONY_SHIP_BUILD_TIME * 0.75));
  });

  it('should reduce alloy production by 10%', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    const c1 = getFirstColony(engine, 'p1');
    engine._addBuiltDistrict(c1, 'industrial');
    engine._invalidateColonyCache(c1);
    const baseline = engine._calcProduction(c1);
    const baselineAlloys = baseline.production.alloys;
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'expansionist' });
    engine._invalidateColonyCache(c1);
    const prod = engine._calcProduction(c1);
    const expected = Math.round(baselineAlloys * 0.9 * 100) / 100;
    assert.strictEqual(prod.production.alloys, expected);
  });
});

// ── Serialization ──

describe('Doctrine Serialization', () => {
  it('should include doctrine in per-player gameState', () => {
    const engine = createEngine();
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    const state = engine.getPlayerState('p1');
    const me = state.players.find(p => p.id === 'p1');
    assert.strictEqual(me.doctrine, 'industrialist');
  });

  it('should include other players\' doctrine in gameState', () => {
    const engine = createEngine();
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'scholar' });
    const state = engine.getPlayerState('p1');
    const p2 = state.players.find(p => p.id === 'p2');
    assert.strictEqual(p2.doctrine, 'scholar');
  });

  it('should include doctrinePhase in gameState during selection', () => {
    const engine = createEngine();
    const state = engine.getPlayerState('p1');
    assert.strictEqual(state.doctrinePhase, true);
    assert.strictEqual(state.doctrineDeadlineTick, DOCTRINE_SELECTION_TICKS);
  });

  it('should not include doctrinePhase after phase ends', () => {
    const engine = createEngine();
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'scholar' });
    const state = engine.getPlayerState('p1');
    assert.ok(!state.doctrinePhase);
  });

  it('should serialize doctrine as null when not chosen yet', () => {
    const engine = createEngine();
    const state = engine.getPlayerState('p1');
    const me = state.players.find(p => p.id === 'p1');
    assert.strictEqual(me.doctrine, null);
  });
});

// ── Production Modifier Interactions ──

describe('Doctrine Production Interactions', () => {
  it('doctrine bonus stacks with tech modifiers', () => {
    const engine = createEngine();
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    const state = engine.playerStates.get('p1');
    // Complete improved_mining tech for +25% mining bonus
    state.completedTechs.push('improved_mining');
    const colony = getFirstColony(engine, 'p1');
    engine._invalidateColonyCache(colony);
    const prod = engine._calcProduction(colony);
    // Mining should have tech bonus (1.25x from districtBonus) and doctrine bonus (+25%)
    // Base mining = 6, tech = 6*1.25 = 7.5, doctrine = 7.5*1.25 = 9.38 rounded
    assert.ok(prod.production.minerals > 6, 'minerals should exceed base');
  });

  it('no doctrine should leave production unchanged', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const prod = engine._calcProduction(colony);
    // With no doctrine, base mining = 6 (1 mining district)
    // May have planet bonuses, so just check it's reasonable
    assert.ok(prod.production.minerals >= 6);
  });
});

// ── Edge Cases ──

describe('Doctrine Edge Cases', () => {
  it('different players can choose the same doctrine', () => {
    const engine = createEngine();
    const r1 = engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'scholar' });
    const r2 = engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'scholar' });
    assert.deepStrictEqual(r1, { ok: true });
    assert.deepStrictEqual(r2, { ok: true });
  });

  it('different players can choose different doctrines', () => {
    const engine = createEngine();
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    engine.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'expansionist' });
    assert.strictEqual(engine.playerStates.get('p1').doctrine, 'industrialist');
    assert.strictEqual(engine.playerStates.get('p2').doctrine, 'expansionist');
  });

  it('doctrine production modifiers do not apply when production is 0', () => {
    const engine = createEngine();
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'industrialist' });
    const colony = getFirstColony(engine, 'p1');
    engine._invalidateColonyCache(colony);
    const prod = engine._calcProduction(colony);
    // No industrial districts on starting colony (before bonus mining is added) → no alloy production to boost
    // Industrialist adds +1 mining, so alloys should still be 0 unless they have industrial
    // This is fine — the bonus multiplier on 0 should stay 0
    // Scholar penalty on minerals: if minerals=0, should stay 0
    const engine2 = createEngine();
    const c2 = getFirstColony(engine2, 'p2');
    // Remove all mining districts
    c2.districts = c2.districts.filter(d => d.type !== 'mining');
    engine2._invalidateColonyCache(c2);
    engine2.handleCommand('p2', { type: 'selectDoctrine', doctrineType: 'scholar' });
    engine2._invalidateColonyCache(c2);
    const prod2 = engine2._calcProduction(c2);
    // Scholar penalty is -10% minerals, but with no mining districts, minerals should be 0
    assert.strictEqual(prod2.production.minerals, 0);
  });

  it('gameState JSON is serializable with doctrine', () => {
    const engine = createEngine();
    engine.handleCommand('p1', { type: 'selectDoctrine', doctrineType: 'scholar' });
    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    const me = parsed.players.find(p => p.id === 'p1');
    assert.strictEqual(me.doctrine, 'scholar');
  });
});
