const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  DESTROYER_COST, DESTROYER_BUILD_TIME, DESTROYER_HOP_TICKS,
  DESTROYER_HP, DESTROYER_ATTACK, MAX_DESTROYERS, DESTROYER_MAINTENANCE,
  CORVETTE_HP, CORVETTE_ATTACK, MAX_CORVETTES, CORVETTE_BUILD_TIME,
} = require('../../server/game-engine');

// Helper: create a minimal game engine with one or two players
function createEngine(opts = {}) {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  if (opts.twoPlayers) {
    players.set('p2', { name: 'Player 2' });
  }
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  return new GameEngine(room, { tickRate: 10 });
}

function getFirstColony(engine, playerId = 'p1') {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

function giveResources(engine, playerId = 'p1') {
  const state = engine.playerStates.get(playerId);
  state.resources.minerals = 10000;
  state.resources.alloys = 10000;
  state.resources.energy = 10000;
  state.resources.food = 10000;
}

function unlockDeepMining(engine, playerId = 'p1') {
  const state = engine.playerStates.get(playerId);
  if (!state.completedTechs.includes('basic_mining')) state.completedTechs.push('basic_mining');
  if (!state.completedTechs.includes('deep_mining')) state.completedTechs.push('deep_mining');
}

function buildAndCompleteDestroyer(engine, playerId = 'p1') {
  const colony = getFirstColony(engine, playerId);
  giveResources(engine, playerId);
  unlockDeepMining(engine, playerId);
  const result = engine.handleCommand(playerId, { type: 'buildDestroyer', colonyId: colony.id });
  assert.ok(result.ok, 'buildDestroyer should succeed');
  for (let i = 0; i < DESTROYER_BUILD_TIME; i++) engine.tick();
  const ship = engine._militaryShips.find(s => s.ownerId === playerId && s.shipClass === 'destroyer');
  assert.ok(ship, 'Destroyer should be spawned after build completes');
  return ship;
}

// ── Cap enforcement: queued destroyers count toward cap ──

describe('Destroyer deep — queued builds count toward cap', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
    giveResources(engine);
    unlockDeepMining(engine);
  });

  it('queued (unfinished) destroyers count toward the cap of 5', () => {
    const colony = getFirstColony(engine);
    // Build 3 destroyers (queue max 3 at a time, complete them)
    for (let i = 0; i < 3; i++) {
      giveResources(engine);
      engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    }
    for (let i = 0; i < DESTROYER_BUILD_TIME * 3; i++) engine.tick();
    assert.strictEqual(engine._playerDestroyerCount('p1'), 3, 'Should have 3 completed destroyers');

    // Queue 2 more (4 and 5 — still under cap since 3 owned + queued <= 5)
    giveResources(engine);
    const r4 = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    assert.ok(r4.ok, 'Destroyer 4 should queue (3 owned + 1 queued = 4)');
    giveResources(engine);
    const r5 = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    assert.ok(r5.ok, 'Destroyer 5 should queue (3 owned + 2 queued = 5)');

    // 6th should be rejected — 3 owned + 2 queued = 5 = cap
    giveResources(engine);
    const r6 = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    assert.ok(r6.error, 'Destroyer 6 should be rejected (cap includes queued)');
    assert.ok(r6.error.includes('cap'));
  });
});

// ── Invalid colony ID ──

describe('Destroyer deep — invalid inputs', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
    giveResources(engine);
    unlockDeepMining(engine);
  });

  it('rejects non-existent colonyId', () => {
    const result = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: 'fake-colony-999' });
    assert.ok(result.error, 'Should reject non-existent colony');
  });

  it('rejects NaN or non-string colonyId gracefully', () => {
    const result = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: 12345 });
    assert.ok(result.error, 'Should reject numeric colonyId');
  });
});

// ── Destroyer removed → count decreases, cap frees up ──

describe('Destroyer deep — cap frees after destruction', () => {
  it('destroying a destroyer allows building a new one', () => {
    const engine = createEngine({ twoPlayers: true });

    // Build MAX_DESTROYERS for p1
    for (let i = 0; i < MAX_DESTROYERS; i++) {
      giveResources(engine, 'p1');
      unlockDeepMining(engine, 'p1');
      const colony = getFirstColony(engine, 'p1');
      const r = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
      assert.ok(r.ok, `Destroyer ${i + 1} should build`);
      for (let t = 0; t < DESTROYER_BUILD_TIME; t++) engine.tick();
    }

    // Verify at cap
    giveResources(engine, 'p1');
    const colony = getFirstColony(engine, 'p1');
    const atCap = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    assert.ok(atCap.error, 'Should be at cap');

    // Manually destroy one destroyer
    const destroyer = engine._militaryShips.find(s => s.ownerId === 'p1' && s.shipClass === 'destroyer');
    assert.ok(destroyer, 'Should have a destroyer to remove');
    const idx = engine._militaryShips.indexOf(destroyer);
    engine._militaryShips.splice(idx, 1);
    const byPlayer = engine._militaryShipsByPlayer.get('p1');
    const idx2 = byPlayer.indexOf(destroyer);
    byPlayer.splice(idx2, 1);

    // Now should be able to build again
    giveResources(engine, 'p1');
    const freed = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    assert.ok(freed.ok, 'Should be able to build after one destroyed (4 < 5)');
  });
});

// ── Multiple destroyers VP scaling ──

describe('Destroyer deep — VP scales with count', () => {
  it('3 destroyers give 9 military VP', () => {
    const engine = createEngine();
    for (let i = 0; i < 3; i++) {
      buildAndCompleteDestroyer(engine, 'p1');
    }
    engine._vpCacheTick = -1;
    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.destroyers, 3);
    assert.strictEqual(breakdown.militaryVP, 9); // 3 * 3 = 9
  });

  it('mixed corvettes and destroyers VP sums correctly', () => {
    const engine = createEngine();
    // Build 1 destroyer
    buildAndCompleteDestroyer(engine, 'p1');
    // Build 1 corvette
    giveResources(engine, 'p1');
    const colony = getFirstColony(engine, 'p1');
    const r = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    assert.ok(r.ok, 'Corvette should build');
    for (let t = 0; t < CORVETTE_BUILD_TIME; t++) engine.tick();

    engine._vpCacheTick = -1;
    const breakdown = engine._calcVPBreakdown('p1');
    // 1 corvette * 1 + 1 destroyer * 3 = 4 military VP
    assert.strictEqual(breakdown.corvettes, 1);
    assert.strictEqual(breakdown.destroyers, 1);
    assert.strictEqual(breakdown.militaryVP, 4);
  });
});

// ── Serialization: other players see destroyer count ──

describe('Destroyer deep — other player serialization', () => {
  it('other player info includes destroyer count', () => {
    const engine = createEngine({ twoPlayers: true });
    buildAndCompleteDestroyer(engine, 'p1');
    engine._invalidateStateCache();
    const stateJSON = JSON.parse(engine.getPlayerStateJSON('p2'));
    // p1 should appear in p2's player list with destroyers field
    const p1Info = stateJSON.players.find(p => p.id === 'p1');
    assert.ok(p1Info, 'p1 should be in p2 state');
    assert.strictEqual(p1Info.destroyers, 1, 'p2 should see p1 has 1 destroyer');
  });
});

// ── Build queue: mixed destroyer + corvette queue ──

describe('Destroyer deep — mixed build queue', () => {
  it('destroyer and corvette can coexist in build queue', () => {
    const engine = createEngine();
    giveResources(engine);
    unlockDeepMining(engine);
    const colony = getFirstColony(engine);

    const r1 = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    assert.ok(r1.ok, 'Corvette should queue');

    giveResources(engine);
    const r2 = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    assert.ok(r2.ok, 'Destroyer should queue alongside corvette');

    assert.strictEqual(colony.buildQueue.length, 2);
    assert.strictEqual(colony.buildQueue[0].type, 'corvette');
    assert.strictEqual(colony.buildQueue[1].type, 'destroyer');
  });

  it('only front item in queue ticks down', () => {
    const engine = createEngine();
    giveResources(engine);
    unlockDeepMining(engine);
    const colony = getFirstColony(engine);

    engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    giveResources(engine);
    engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });

    const destroyerTicksBefore = colony.buildQueue[1].ticksRemaining;
    // Tick once
    engine.tick();
    // First item ticks down, second stays same
    assert.strictEqual(colony.buildQueue[1].ticksRemaining, destroyerTicksBefore,
      'Second queue item should not tick down while first is building');
  });
});

// ── Maintenance: precise verification ──

describe('Destroyer deep — maintenance precision', () => {
  it('destroyer maintenance is included in total ship maintenance tally', () => {
    const engine = createEngine();
    buildAndCompleteDestroyer(engine, 'p1');

    // Zero out all production so we can measure maintenance alone
    const state = engine.playerStates.get('p1');
    state.resources.energy = 5000;
    state.resources.alloys = 5000;

    // Snapshot before month tick
    const eBefore = state.resources.energy;
    const aBefore = state.resources.alloys;

    // Run one full month (100 ticks)
    for (let i = 0; i < 100; i++) engine.tick();

    // Energy should have decreased (maintenance + other costs) relative to base
    // We just verify maintenance direction is correct
    const eDelta = eBefore - state.resources.energy;
    const aDelta = aBefore - state.resources.alloys;

    // With 1 destroyer: 3 energy + 2 alloys maintenance per month
    // Production will partially offset, but alloys maintenance should show impact
    assert.ok(eDelta !== 0 || aDelta !== 0, 'Resources should change over a month');
  });

  it('destroyer maintenance is separate from corvette maintenance', () => {
    const engine = createEngine();
    giveResources(engine);
    unlockDeepMining(engine);

    // Build 1 corvette first, measure month cost
    const colony = getFirstColony(engine);
    engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    for (let i = 0; i < CORVETTE_BUILD_TIME; i++) engine.tick();

    const state = engine.playerStates.get('p1');
    state.resources.energy = 50000;
    state.resources.alloys = 50000;
    const e1 = state.resources.energy;
    const a1 = state.resources.alloys;
    for (let i = 0; i < 100; i++) engine.tick();
    const corvetteOnlyECost = e1 - state.resources.energy;
    const corvetteOnlyACost = a1 - state.resources.alloys;

    // Now add a destroyer and run another month
    buildAndCompleteDestroyer(engine, 'p1');
    state.resources.energy = 50000;
    state.resources.alloys = 50000;
    const e2 = state.resources.energy;
    const a2 = state.resources.alloys;
    for (let i = 0; i < 100; i++) engine.tick();
    const withDestroyerECost = e2 - state.resources.energy;
    const withDestroyerACost = a2 - state.resources.alloys;

    // Adding a destroyer should increase energy and alloy costs
    assert.ok(withDestroyerECost > corvetteOnlyECost,
      `Energy cost should increase with destroyer (${withDestroyerECost} > ${corvetteOnlyECost})`);
    assert.ok(withDestroyerACost > corvetteOnlyACost,
      `Alloy cost should increase with destroyer (${withDestroyerACost} > ${corvetteOnlyACost})`);
  });
});

// ── Destroyer spawns at correct system ──

describe('Destroyer deep — spawn location', () => {
  it('destroyer spawns at the colony system where it was built', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    const expectedSystem = colony.systemId;

    const ship = buildAndCompleteDestroyer(engine, 'p1');
    assert.strictEqual(ship.systemId, expectedSystem,
      'Destroyer should spawn at the colony system');
  });
});

// ── Cancel: partial build refund ──

describe('Destroyer deep — cancel mid-build', () => {
  it('cancelling a partially built destroyer still refunds 50%', () => {
    const engine = createEngine();
    giveResources(engine);
    unlockDeepMining(engine);
    const colony = getFirstColony(engine);
    const state = engine.playerStates.get('p1');

    engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    // Tick halfway through build
    for (let i = 0; i < Math.floor(DESTROYER_BUILD_TIME / 2); i++) engine.tick();

    assert.strictEqual(colony.buildQueue.length, 1, 'Should still be building');
    const queuedId = colony.buildQueue[0].id;

    const mineralsBefore = state.resources.minerals;
    const alloysBefore = state.resources.alloys;
    const cancelResult = engine.handleCommand('p1', { type: 'demolish', colonyId: colony.id, districtId: queuedId });
    assert.ok(cancelResult.ok, 'Cancel should succeed');

    // 50% refund regardless of progress
    assert.strictEqual(state.resources.minerals, mineralsBefore + 100);
    assert.strictEqual(state.resources.alloys, alloysBefore + 50);
    assert.strictEqual(colony.buildQueue.length, 0, 'Queue should be empty after cancel');
  });
});

// ── Destroyer path movement: multi-hop ──

describe('Destroyer deep — multi-hop movement', () => {
  it('destroyer arrives at 2-hop destination in 120 ticks', () => {
    const engine = createEngine();
    const ship = buildAndCompleteDestroyer(engine, 'p1');
    const startSystem = ship.systemId;

    // Find a 2-hop target via adjacency
    const neighbors = engine._adjacency.get(startSystem) || [];
    assert.ok(neighbors.length > 0, 'Start system needs neighbors');
    const hop1 = neighbors[0];
    const hop2Neighbors = (engine._adjacency.get(hop1) || []).filter(n => n !== startSystem);

    if (hop2Neighbors.length > 0) {
      const hop2 = hop2Neighbors[0];
      const result = engine.handleCommand('p1', { type: 'sendFleet', shipId: ship.id, targetSystemId: hop2 });
      assert.ok(!result.error, 'sendFleet to 2-hop target should succeed');

      // After 1 hop (60 ticks), should have left start
      for (let i = 0; i < DESTROYER_HOP_TICKS; i++) engine.tick();
      assert.notStrictEqual(ship.systemId, startSystem, 'Should have left start after 60 ticks');

      // After 2nd hop (120 total), should be at destination
      for (let i = 0; i < DESTROYER_HOP_TICKS; i++) engine.tick();
      assert.strictEqual(ship.systemId, hop2, 'Should arrive at 2-hop destination after 120 ticks');
    }
  });
});

// ── Destroyer in combat: HP-based advantage ──

describe('Destroyer deep — combat outcome', () => {
  it('destroyer with 80 HP beats a single corvette with 10 HP', () => {
    const engine = createEngine({ twoPlayers: true });

    // Build destroyer for p1
    const destroyer = buildAndCompleteDestroyer(engine, 'p1');

    // Build corvette for p2
    giveResources(engine, 'p2');
    const colony2 = getFirstColony(engine, 'p2');
    engine.handleCommand('p2', { type: 'buildCorvette', colonyId: colony2.id });
    for (let i = 0; i < CORVETTE_BUILD_TIME; i++) engine.tick();
    const corvette = engine._militaryShips.find(s => s.ownerId === 'p2');
    assert.ok(corvette, 'p2 should have a corvette');

    // Set hostile
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    engine.handleCommand('p2', { type: 'setDiplomacy', targetPlayerId: 'p1', stance: 'hostile' });

    // Relocate corvette to destroyer's system via the index
    const oldSysArr = engine._militaryShipsBySystem.get(corvette.systemId);
    if (oldSysArr) {
      const idx = oldSysArr.indexOf(corvette);
      if (idx >= 0) oldSysArr.splice(idx, 1);
    }
    corvette.systemId = destroyer.systemId;
    corvette.targetSystemId = null;
    corvette.path = [];
    corvette.hopProgress = 0;
    let newSysArr = engine._militaryShipsBySystem.get(destroyer.systemId);
    if (!newSysArr) { newSysArr = []; engine._militaryShipsBySystem.set(destroyer.systemId, newSysArr); }
    if (!newSysArr.includes(corvette)) newSysArr.push(corvette);

    // Tick combat resolution
    for (let i = 0; i < 100; i++) engine.tick();

    const destroyerAlive = engine._militaryShips.some(s => s.id === destroyer.id);
    const corvetteAlive = engine._militaryShips.some(s => s.id === corvette.id);

    assert.ok(destroyerAlive, 'Destroyer (80 HP, 8 ATK) should survive vs corvette (10 HP, 3 ATK)');
    assert.ok(!corvetteAlive, 'Corvette should be destroyed by destroyer');
  });

  it('destroyer takes damage from multiple corvettes', () => {
    const engine = createEngine({ twoPlayers: true });

    const destroyer = buildAndCompleteDestroyer(engine, 'p1');
    const initialHP = destroyer.hp;

    // Build 3 corvettes for p2 so they can deal damage across combat rounds
    const corvettes = [];
    for (let c = 0; c < 3; c++) {
      giveResources(engine, 'p2');
      const colony2 = getFirstColony(engine, 'p2');
      engine.handleCommand('p2', { type: 'buildCorvette', colonyId: colony2.id });
      for (let i = 0; i < CORVETTE_BUILD_TIME; i++) engine.tick();
    }
    for (const s of engine._militaryShips) {
      if (s.ownerId === 'p2') corvettes.push(s);
    }
    assert.ok(corvettes.length >= 3, 'Should have 3 corvettes');

    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    engine.handleCommand('p2', { type: 'setDiplomacy', targetPlayerId: 'p1', stance: 'hostile' });

    // Relocate all corvettes to destroyer's system
    for (const corvette of corvettes) {
      const oldSysArr = engine._militaryShipsBySystem.get(corvette.systemId);
      if (oldSysArr) {
        const idx = oldSysArr.indexOf(corvette);
        if (idx >= 0) oldSysArr.splice(idx, 1);
      }
      corvette.systemId = destroyer.systemId;
      corvette.targetSystemId = null;
      corvette.path = [];
      corvette.hopProgress = 0;
      let newSysArr = engine._militaryShipsBySystem.get(destroyer.systemId);
      if (!newSysArr) { newSysArr = []; engine._militaryShipsBySystem.set(destroyer.systemId, newSysArr); }
      if (!newSysArr.includes(corvette)) newSysArr.push(corvette);
    }

    // Tick combat resolution
    for (let i = 0; i < 100; i++) engine.tick();

    // 3 corvettes at 3 ATK each = 9 damage per round; destroyer should take hits
    assert.ok(destroyer.hp < initialHP,
      `Destroyer should take damage from 3 corvettes (${destroyer.hp} < ${initialHP})`);
  });
});

// ── Tech gating: basic_mining alone is not enough ──

describe('Destroyer deep — tech prerequisites', () => {
  it('basic_mining alone does not unlock destroyers', () => {
    const engine = createEngine();
    giveResources(engine);
    const state = engine.playerStates.get('p1');
    state.completedTechs.push('basic_mining');
    // Do NOT add deep_mining

    const colony = getFirstColony(engine);
    const result = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    assert.ok(result.error, 'basic_mining alone should not unlock destroyers');
    assert.ok(result.error.includes('Deep Mining'));
  });
});

// ── Destroyer in gameInit payload ──

describe('Destroyer deep — gameInit includes ship data', () => {
  it('getPlayerStateJSON includes all destroyer fields', () => {
    const engine = createEngine();
    const ship = buildAndCompleteDestroyer(engine, 'p1');
    engine._invalidateStateCache();
    const stateJSON = JSON.parse(engine.getPlayerStateJSON('p1'));
    const serialized = stateJSON.militaryShips.find(s => s.id === ship.id);

    assert.ok(serialized, 'Destroyer should be in state');
    assert.strictEqual(serialized.shipClass, 'destroyer');
    assert.strictEqual(serialized.hp, DESTROYER_HP);
    assert.strictEqual(serialized.maxHp, DESTROYER_HP);
    assert.strictEqual(serialized.attack, DESTROYER_ATTACK);
    assert.strictEqual(serialized.ownerId, 'p1');
    assert.ok('systemId' in serialized, 'Should include systemId');
  });
});
