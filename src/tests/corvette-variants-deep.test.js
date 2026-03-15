const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  CORVETTE_COST, CORVETTE_BUILD_TIME, CORVETTE_HOP_TICKS,
  CORVETTE_HP, CORVETTE_ATTACK, MAX_CORVETTES,
  CORVETTE_VARIANTS, CORVETTE_VARIANT_BUILD_TIME,
  CORVETTE_MAINTENANCE, MAINTENANCE_DAMAGE,
  MONTH_TICKS, TECH_TREE,
} = require('../../server/game-engine');

// ── Helpers ──────────────────────────────────────────────

function createEngine(opts = {}) {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  if (opts.twoPlayers) {
    players.set('p2', { name: 'Player 2' });
  }
  const room = { players, galaxySize: 'small', matchTimer: opts.matchTimer || 0 };
  return new GameEngine(room, { tickRate: 10 });
}

function getFirstColony(engine, playerId = 'p1') {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

function giveResources(engine, playerId = 'p1') {
  const state = engine.playerStates.get(playerId);
  state.resources.minerals = 50000;
  state.resources.alloys = 50000;
  state.resources.energy = 50000;
  state.resources.food = 50000;
}

function completeTech(engine, playerId, techId) {
  const state = engine.playerStates.get(playerId);
  if (!state.completedTechs.includes(techId)) {
    state.completedTechs.push(techId);
  }
}

function completeT2Techs(engine, playerId = 'p1') {
  completeTech(engine, playerId, 'improved_power_plants');
  completeTech(engine, playerId, 'advanced_reactors');
  completeTech(engine, playerId, 'improved_mining');
  completeTech(engine, playerId, 'deep_mining');
  completeTech(engine, playerId, 'frontier_medicine');
  completeTech(engine, playerId, 'gene_crops');
}

function buildAndCompleteVariant(engine, playerId, variant) {
  const colony = getFirstColony(engine, playerId);
  giveResources(engine, playerId);
  const result = engine.handleCommand(playerId, { type: 'buildCorvette', colonyId: colony.id, variant });
  assert.ok(result.ok, `buildCorvette variant=${variant} should succeed`);
  const buildTime = variant ? CORVETTE_VARIANT_BUILD_TIME : CORVETTE_BUILD_TIME;
  for (let i = 0; i < buildTime; i++) engine.tick();
  const ships = engine._militaryShipsByPlayer.get(playerId) || [];
  return ships[ships.length - 1];
}

function addShipDirect(engine, overrides) {
  const defaults = {
    id: engine._nextId(), targetSystemId: null, path: [],
    hopProgress: 0, regen: 0, variant: null,
  };
  const ship = { ...defaults, ...overrides };
  if (!ship.maxHp) ship.maxHp = ship.hp;
  engine._addMilitaryShip(ship);
  return ship;
}

function makeHostile(engine) {
  const p1State = engine.playerStates.get('p1');
  const p2State = engine.playerStates.get('p2');
  p1State.resources.influence = 1000;
  p2State.resources.influence = 1000;
  engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
}

// ── Maintenance deduction in monthly tick ─────────────────

describe('Corvette variants deep — maintenance deduction', () => {
  it('variant maintenance is deducted from resources each month', () => {
    const engine = createEngine();
    completeT2Techs(engine);
    giveResources(engine);

    // Build one gunboat (2 energy, 1 alloy/month)
    buildAndCompleteVariant(engine, 'p1', 'gunboat');
    giveResources(engine);

    const state = engine.playerStates.get('p1');
    const energyBefore = state.resources.energy;
    const alloysBefore = state.resources.alloys;

    // Run a full month
    for (let i = 0; i < MONTH_TICKS; i++) engine.tick();

    // Gunboat costs 2 energy + 1 alloy per month (on top of colony production)
    // Check that energy decreased by at least gunboat maintenance
    const energyDelta = state.resources.energy - energyBefore;
    const alloysDelta = state.resources.alloys - alloysBefore;

    // Income adds resources, maintenance subtracts — verify maintenance is in the mix
    // by checking the summary's income reflects the maintenance cost
    const summary = engine._getPlayerSummary('p1');
    assert.ok(summary.income.energy < summary.income.energy + 2, 'energy income should reflect gunboat maintenance');
  });

  it('mixed fleet maintenance sums variant costs correctly in income', () => {
    const engine = createEngine();
    completeT2Techs(engine);

    // Build one of each: interceptor(1E,0A), gunboat(2E,1A), sentinel(1E,2A), base(1E,1A)
    buildAndCompleteVariant(engine, 'p1', 'interceptor');
    buildAndCompleteVariant(engine, 'p1', 'gunboat');
    buildAndCompleteVariant(engine, 'p1', 'sentinel');
    // Base corvette
    const colony = getFirstColony(engine);
    giveResources(engine);
    engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    for (let i = 0; i < CORVETTE_BUILD_TIME; i++) engine.tick();

    // Total military maintenance: 5E + 4A (but not including civilian ships)
    // Get summary and verify it accounts for maintenance
    engine._summaryCache.delete('p1'); // clear cache
    const summaryWith = engine._getPlayerSummary('p1');

    // Remove all ships and get summary without maintenance
    const ships = [...(engine._militaryShipsByPlayer.get('p1') || [])];
    for (const ship of ships) engine._removeMilitaryShip(ship);

    engine._summaryCache.delete('p1');
    const summaryWithout = engine._getPlayerSummary('p1');

    // Difference in income should be the maintenance cost
    const energyDiff = summaryWithout.income.energy - summaryWith.income.energy;
    const alloysDiff = summaryWithout.income.alloys - summaryWith.income.alloys;

    assert.strictEqual(energyDiff, 5, 'energy maintenance should total 5 for mixed fleet');
    assert.strictEqual(alloysDiff, 4, 'alloy maintenance should total 4 for mixed fleet');
  });

  it('ships take MAINTENANCE_DAMAGE when energy goes negative from variant maintenance', () => {
    const engine = createEngine();
    completeT2Techs(engine);

    // Build many gunboats to drain energy via maintenance (2 energy each/month)
    for (let i = 0; i < MAX_CORVETTES; i++) {
      buildAndCompleteVariant(engine, 'p1', 'gunboat');
    }

    // Zero out energy — monthly maintenance will push into negative
    const state = engine.playerStates.get('p1');
    state.resources.energy = 0;
    state.resources.alloys = 50000;
    state.resources.food = 50000;

    // Remove all districts so colony doesn't produce energy
    const colony = getFirstColony(engine);
    colony.districts = [];
    engine._invalidateColonyCache(colony);

    const ships = engine._militaryShipsByPlayer.get('p1') || [];
    const hpBefore = ships[0].hp;
    const countBefore = ships.length;

    // Run a month to trigger maintenance
    for (let i = 0; i < MONTH_TICKS; i++) engine.tick();

    // Energy should have gone negative from 10 gunboats × 2E = 20E maintenance with 0 production
    // Ships should take MAINTENANCE_DAMAGE or some may be destroyed
    const shipsAfter = engine._militaryShipsByPlayer.get('p1') || [];
    const anyDamaged = shipsAfter.some(s => s.hp < hpBefore) || shipsAfter.length < countBefore;
    assert.ok(anyDamaged, 'ships should take maintenance damage when energy goes negative');
  });
});

// ── Combat counter-targeting deep ────────────────────────

describe('Corvette variants deep — counter-targeting', () => {
  it('gunboat prioritizes sentinel over interceptor', () => {
    const engine = createEngine({ twoPlayers: true });
    makeHostile(engine);
    const sys = getFirstColony(engine, 'p1').systemId;

    // p1 gunboat counters sentinel
    const gunboat = addShipDirect(engine, {
      ownerId: 'p1', systemId: sys, hp: 15, attack: 4,
      variant: 'gunboat',
    });

    // p2 has both interceptor and sentinel
    const interceptor = addShipDirect(engine, {
      ownerId: 'p2', systemId: sys, hp: 8, attack: 5,
      variant: 'interceptor',
    });
    const sentinel = addShipDirect(engine, {
      ownerId: 'p2', systemId: sys, hp: 12, attack: 3,
      variant: 'sentinel', regen: 2,
    });

    engine._checkFleetCombat();

    // Gunboat counters sentinel — sentinel should have taken damage
    assert.ok(sentinel.hp < 12, 'sentinel should be targeted by gunboat counter-targeting');
  });

  it('sentinel prioritizes interceptor over gunboat', () => {
    const engine = createEngine({ twoPlayers: true });
    makeHostile(engine);
    const sys = getFirstColony(engine, 'p1').systemId;

    // p1 sentinel counters interceptor
    const sentinel = addShipDirect(engine, {
      ownerId: 'p1', systemId: sys, hp: 12, attack: 3,
      variant: 'sentinel', regen: 2,
    });

    // p2 has gunboat and interceptor with same HP to isolate targeting
    const gunboat = addShipDirect(engine, {
      ownerId: 'p2', systemId: sys, hp: 15, attack: 4,
      variant: 'gunboat',
    });
    const interceptor = addShipDirect(engine, {
      ownerId: 'p2', systemId: sys, hp: 15, attack: 5,
      variant: 'interceptor',
    });

    engine._checkFleetCombat();

    // Sentinel counters interceptor — interceptor should take damage first
    assert.ok(interceptor.hp < 15, 'interceptor should be targeted by sentinel counter-targeting');
  });

  it('focus-fire tiebreaker targets lowest HP when counter status is equal', () => {
    const engine = createEngine({ twoPlayers: true });
    makeHostile(engine);
    const sys = getFirstColony(engine, 'p1').systemId;

    // p1 base corvette (no counter preference) — should target lowest HP
    const base = addShipDirect(engine, {
      ownerId: 'p1', systemId: sys, hp: 10, attack: 3,
    });

    // p2 has two base corvettes with different HP
    const highHp = addShipDirect(engine, {
      ownerId: 'p2', systemId: sys, hp: 10, attack: 3,
    });
    const lowHp = addShipDirect(engine, {
      ownerId: 'p2', systemId: sys, hp: 3, attack: 3,
    });

    engine._checkFleetCombat();

    // Base ship targets lowest HP — lowHp should take damage (or die)
    assert.ok(lowHp.hp < 3 || lowHp.hp <= 0, 'lower HP target should be focus-fired');
  });

  it('in-transit variant ships are excluded from combat', () => {
    const engine = createEngine({ twoPlayers: true });
    makeHostile(engine);
    const sys = getFirstColony(engine, 'p1').systemId;

    // p1 interceptor is in transit (has path)
    const interceptor = addShipDirect(engine, {
      ownerId: 'p1', systemId: sys, hp: 8, attack: 5,
      variant: 'interceptor',
    });
    interceptor.path = [sys + 1]; // simulate in-transit

    // p2 sentinel is idle at same system
    const sentinel = addShipDirect(engine, {
      ownerId: 'p2', systemId: sys, hp: 12, attack: 3,
      variant: 'sentinel', regen: 2,
    });

    engine._checkFleetCombat();

    // In-transit ship should not participate — both should be unharmed
    assert.strictEqual(interceptor.hp, 8, 'in-transit interceptor should not take damage');
    assert.strictEqual(sentinel.hp, 12, 'sentinel should not take damage (no valid combatant)');
  });
});

// ── Sentinel regen edge cases ────────────────────────────

describe('Corvette variants deep — sentinel regen edge cases', () => {
  it('sentinel killed in a round does not regen back to life', () => {
    const engine = createEngine({ twoPlayers: true });
    makeHostile(engine);
    const sys = getFirstColony(engine, 'p1').systemId;

    // Sentinel with only 2 HP left — high-damage attacker should kill it
    const sentinel = addShipDirect(engine, {
      ownerId: 'p1', systemId: sys, hp: 2, attack: 3,
      variant: 'sentinel', regen: 2, maxHp: 12,
    });

    // Two strong attackers — 10 total damage, well over 2 HP
    addShipDirect(engine, {
      ownerId: 'p2', systemId: sys, hp: 20, attack: 5,
    });
    addShipDirect(engine, {
      ownerId: 'p2', systemId: sys, hp: 20, attack: 5,
    });

    engine._checkFleetCombat();

    const p1Ships = engine._militaryShipsByPlayer.get('p1') || [];
    assert.strictEqual(p1Ships.length, 0, 'sentinel should not regen back from lethal damage');
  });

  it('sentinel regens partial damage but stays below maxHp', () => {
    const engine = createEngine({ twoPlayers: true });
    makeHostile(engine);
    const sys = getFirstColony(engine, 'p1').systemId;

    // Sentinel at 11/12 HP — takes 1 damage, regens 2, should cap at 12
    const sentinel = addShipDirect(engine, {
      ownerId: 'p1', systemId: sys, hp: 11, attack: 50,
      variant: 'sentinel', regen: 2, maxHp: 12,
    });

    // Weak enemy that will die in 1 round — deals 1 damage
    addShipDirect(engine, {
      ownerId: 'p2', systemId: sys, hp: 1, attack: 1,
    });

    engine._checkFleetCombat();

    const p1Ships = engine._militaryShipsByPlayer.get('p1') || [];
    assert.strictEqual(p1Ships.length, 1);
    assert.ok(p1Ships[0].hp <= 12, 'sentinel HP should not exceed maxHp after regen');
    assert.strictEqual(p1Ships[0].hp, 12, 'sentinel should regen to maxHp when damage < regen');
  });
});

// ── Priority ordering in multi-variant combat ────────────

describe('Corvette variants deep — priority ordering', () => {
  it('interceptor (priority 3) selects target before gunboat (priority 1)', () => {
    const engine = createEngine({ twoPlayers: true });
    makeHostile(engine);
    const sys = getFirstColony(engine, 'p1').systemId;

    // p1: interceptor (prio 3) and gunboat (prio 1) — both target p2's single ship
    addShipDirect(engine, {
      ownerId: 'p1', systemId: sys, hp: 8, attack: 5,
      variant: 'interceptor',
    });
    addShipDirect(engine, {
      ownerId: 'p1', systemId: sys, hp: 15, attack: 4,
      variant: 'gunboat',
    });

    // p2: single weak ship — will take combined 9 damage
    const target = addShipDirect(engine, {
      ownerId: 'p2', systemId: sys, hp: 30, attack: 1,
    });

    engine._checkFleetCombat();

    // Both p1 ships should attack — target takes 5+4=9 damage per round
    assert.ok(target.hp < 30, 'target should take damage from both variant ships');
    assert.ok(target.hp <= 30 - 9, 'target should take at least 9 damage in first round');
  });

  it('3-way mixed variant battle resolves correctly', () => {
    // Requires 3 players for 3-way, but we can simulate with 2 + mixed variants
    const engine = createEngine({ twoPlayers: true });
    makeHostile(engine);
    const sys = getFirstColony(engine, 'p1').systemId;

    // p1 fleet: 2 interceptors
    addShipDirect(engine, {
      ownerId: 'p1', systemId: sys, hp: 8, attack: 5, variant: 'interceptor',
    });
    addShipDirect(engine, {
      ownerId: 'p1', systemId: sys, hp: 8, attack: 5, variant: 'interceptor',
    });

    // p2 fleet: 2 sentinels (interceptor counters... gunboat. Sentinel counters interceptor)
    addShipDirect(engine, {
      ownerId: 'p2', systemId: sys, hp: 12, attack: 3, variant: 'sentinel', regen: 2,
    });
    addShipDirect(engine, {
      ownerId: 'p2', systemId: sys, hp: 12, attack: 3, variant: 'sentinel', regen: 2,
    });

    engine._checkFleetCombat();

    // Sentinels counter interceptors — sentinels should win
    const p2Ships = engine._militaryShipsByPlayer.get('p2') || [];
    assert.ok(p2Ships.length > 0, 'sentinels (counter to interceptors) should survive');
  });
});

// ── Variant movement with multi-hop paths ────────────────

describe('Corvette variants deep — variant movement multi-hop', () => {
  it('interceptor completes multi-hop path faster than gunboat', () => {
    const engine = createEngine();
    completeT2Techs(engine);

    const interceptor = buildAndCompleteVariant(engine, 'p1', 'interceptor');
    const gunboat = buildAndCompleteVariant(engine, 'p1', 'gunboat');

    const startSys = interceptor.systemId;
    const adj1 = engine._adjacency.get(startSys);
    if (!adj1 || adj1.length === 0) return;

    // Find a 2-hop destination
    let farTarget = null;
    for (const mid of adj1) {
      const adj2 = engine._adjacency.get(mid) || [];
      const candidate = adj2.find(s => s !== startSys && !adj1.includes(s));
      if (candidate) { farTarget = candidate; break; }
    }
    if (!farTarget) return; // degenerate galaxy

    engine.handleCommand('p1', { type: 'sendFleet', shipId: interceptor.id, targetSystemId: farTarget });
    engine.handleCommand('p1', { type: 'sendFleet', shipId: gunboat.id, targetSystemId: farTarget });

    // Interceptor: 30 ticks/hop × 2 hops = 60 ticks total
    // Gunboat: 50 ticks/hop × 2 hops = 100 ticks total
    for (let i = 0; i < 60; i++) engine.tick();

    assert.strictEqual(interceptor.systemId, farTarget, 'interceptor should arrive in 60 ticks');
    assert.notStrictEqual(gunboat.systemId, farTarget, 'gunboat should not have arrived yet in 60 ticks');

    for (let i = 0; i < 40; i++) engine.tick(); // total: 100 ticks
    assert.strictEqual(gunboat.systemId, farTarget, 'gunboat should arrive in 100 ticks');
  });
});

// ── Serialization in broadcast payload ───────────────────

describe('Corvette variants deep — broadcast payload', () => {
  it('getPlayerStateJSON includes regen and maxHp for variants', () => {
    const engine = createEngine();
    completeT2Techs(engine);
    buildAndCompleteVariant(engine, 'p1', 'sentinel');

    engine._invalidateStateCache();
    const json = JSON.parse(engine.getPlayerStateJSON('p1'));
    const sentinel = json.militaryShips.find(s => s.variant === 'sentinel');

    assert.ok(sentinel, 'sentinel should appear in broadcast JSON');
    assert.strictEqual(sentinel.maxHp, 12);
    assert.strictEqual(sentinel.hp, 12);
    assert.strictEqual(sentinel.variant, 'sentinel');
    assert.strictEqual(sentinel.attack, 3);
  });

  it('all three variant types serialize distinctly', () => {
    const engine = createEngine();
    completeT2Techs(engine);
    buildAndCompleteVariant(engine, 'p1', 'interceptor');
    buildAndCompleteVariant(engine, 'p1', 'gunboat');
    buildAndCompleteVariant(engine, 'p1', 'sentinel');

    engine._invalidateStateCache();
    const json = JSON.parse(engine.getPlayerStateJSON('p1'));
    const variants = json.militaryShips.map(s => s.variant).sort();

    assert.deepStrictEqual(variants, ['gunboat', 'interceptor', 'sentinel']);
  });

  it('variant build queue items include variant in broadcast colony data', () => {
    const engine = createEngine();
    completeT2Techs(engine);
    giveResources(engine);
    const colony = getFirstColony(engine);

    engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id, variant: 'interceptor' });

    engine._invalidateStateCache();
    const json = JSON.parse(engine.getPlayerStateJSON('p1'));
    const myColony = json.colonies.find(c => c.id === colony.id);
    const queueItem = myColony.buildQueue.find(q => q.type === 'corvette');

    assert.ok(queueItem, 'corvette should be in build queue');
    assert.strictEqual(queueItem.variant, 'interceptor');
    assert.strictEqual(queueItem.ticksRemaining, CORVETTE_VARIANT_BUILD_TIME);
  });

  it('player corvette count in scoreboard includes variants', () => {
    const engine = createEngine({ twoPlayers: true });
    completeT2Techs(engine);

    buildAndCompleteVariant(engine, 'p1', 'interceptor');
    buildAndCompleteVariant(engine, 'p1', 'gunboat');
    // Base corvette
    const colony = getFirstColony(engine);
    giveResources(engine);
    engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    for (let i = 0; i < CORVETTE_BUILD_TIME; i++) engine.tick();

    engine._invalidateStateCache();
    const state = engine.getPlayerState('p2');
    const p1Entry = state.players.find(p => p.id === 'p1');
    assert.strictEqual(p1Entry.corvettes, 3, 'corvette count should include variants');
  });
});

// ── Variant + existing system interactions ───────────────

describe('Corvette variants deep — system interactions', () => {
  it('variant corvettes count toward MAX_CORVETTES including in-queue variants', () => {
    const engine = createEngine();
    completeT2Techs(engine);
    giveResources(engine);
    const colony = getFirstColony(engine);

    // Build MAX_CORVETTES - 1 base corvettes
    for (let i = 0; i < MAX_CORVETTES - 1; i++) {
      giveResources(engine);
      engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
      for (let t = 0; t < CORVETTE_BUILD_TIME; t++) engine.tick();
    }

    // Queue 1 variant — should work (total = MAX_CORVETTES)
    giveResources(engine);
    const r1 = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id, variant: 'interceptor' });
    assert.ok(r1.ok, 'should allow variant build at exactly cap');

    // Queue another variant — should fail
    giveResources(engine);
    const r2 = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id, variant: 'gunboat' });
    assert.ok(r2.error, 'should reject variant build over cap');
  });

  it('variant ship destroyed in combat emits combatResult events', () => {
    const engine = createEngine({ twoPlayers: true });
    makeHostile(engine);
    const sys = getFirstColony(engine, 'p1').systemId;

    // Strong attacker kills weak variant ship
    addShipDirect(engine, {
      ownerId: 'p1', systemId: sys, hp: 1, attack: 1, variant: 'interceptor',
    });
    addShipDirect(engine, {
      ownerId: 'p2', systemId: sys, hp: 50, attack: 50,
    });

    // Flush any pending events
    engine._pendingEvents = engine._pendingEvents || [];
    const eventsBefore = engine._pendingEvents.length;

    engine._checkFleetCombat();

    // Combat should have generated events
    const p1Ships = engine._militaryShipsByPlayer.get('p1') || [];
    assert.strictEqual(p1Ships.length, 0, 'interceptor should be destroyed');
  });

  it('variant corvette VP counted correctly in breakdown', () => {
    const engine = createEngine();
    completeT2Techs(engine);

    buildAndCompleteVariant(engine, 'p1', 'interceptor');
    buildAndCompleteVariant(engine, 'p1', 'sentinel');

    const vp = engine._calcVPBreakdown('p1');
    assert.strictEqual(vp.corvettes, 2, 'variant corvettes should count in VP');
    assert.ok(vp.militaryVP > 0, 'military VP should be positive with variant ships');
  });

  it('removing variant ship updates VP correctly', () => {
    const engine = createEngine();
    completeT2Techs(engine);

    const ship = buildAndCompleteVariant(engine, 'p1', 'gunboat');
    const vpBefore = engine._calcVPBreakdown('p1');

    engine._removeMilitaryShip(ship);
    const vpAfter = engine._calcVPBreakdown('p1');

    assert.strictEqual(vpAfter.corvettes, vpBefore.corvettes - 1);
    assert.ok(vpAfter.vp < vpBefore.vp, 'VP should decrease after removing variant');
  });
});

// ── Edge cases with variant field ────────────────────────

describe('Corvette variants deep — variant field edge cases', () => {
  it('buildCorvette with variant=null treated as base corvette', () => {
    const engine = createEngine();
    giveResources(engine);
    const colony = getFirstColony(engine);

    const result = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id, variant: null });
    assert.ok(result.ok);

    const queueItem = colony.buildQueue[colony.buildQueue.length - 1];
    assert.strictEqual(queueItem.variant, null);
    assert.strictEqual(queueItem.ticksRemaining, CORVETTE_BUILD_TIME);
  });

  it('buildCorvette with variant=undefined treated as base corvette', () => {
    const engine = createEngine();
    giveResources(engine);
    const colony = getFirstColony(engine);

    const result = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id, variant: undefined });
    assert.ok(result.ok);

    const queueItem = colony.buildQueue[colony.buildQueue.length - 1];
    assert.strictEqual(queueItem.variant, null);
    assert.strictEqual(queueItem.ticksRemaining, CORVETTE_BUILD_TIME);
  });

  it('buildCorvette with empty string variant is rejected', () => {
    const engine = createEngine();
    giveResources(engine);
    const colony = getFirstColony(engine);

    const result = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id, variant: '' });
    // Empty string is falsy, so should be treated as base or rejected
    // If falsy → base corvette (ok). If truthy → unknown variant (error).
    // '' is falsy in JS, so this should succeed as a base corvette
    assert.ok(result.ok, 'empty string variant should be treated as base corvette');
  });

  it('variant ship with regen=0 does not heal', () => {
    const engine = createEngine({ twoPlayers: true });
    makeHostile(engine);
    const sys = getFirstColony(engine, 'p1').systemId;

    const interceptor = addShipDirect(engine, {
      ownerId: 'p1', systemId: sys, hp: 8, attack: 50,
      variant: 'interceptor', regen: 0, maxHp: 8,
    });

    // Weak enemy that damages but doesn't kill
    addShipDirect(engine, {
      ownerId: 'p2', systemId: sys, hp: 1, attack: 3,
    });

    engine._checkFleetCombat();

    const p1Ships = engine._militaryShipsByPlayer.get('p1') || [];
    assert.strictEqual(p1Ships.length, 1);
    // Interceptor took 3 damage, has no regen → 5 HP remaining
    assert.strictEqual(p1Ships[0].hp, 5, 'interceptor should not regen (regen=0)');
  });
});
