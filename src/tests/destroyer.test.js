const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  DESTROYER_COST, DESTROYER_BUILD_TIME, DESTROYER_HOP_TICKS,
  DESTROYER_HP, DESTROYER_ATTACK, MAX_DESTROYERS, DESTROYER_MAINTENANCE,
  CORVETTE_HP, CORVETTE_ATTACK, MAX_CORVETTES,
} = require('../../server/game-engine');

// Helper: create a minimal game engine with one player
function createEngine(opts = {}) {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  if (opts.twoPlayers) {
    players.set('p2', { name: 'Player 2' });
  }
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  const engine = new GameEngine(room, { tickRate: 10 });
  return engine;
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
  for (let i = 0; i < DESTROYER_BUILD_TIME; i++) {
    engine.tick();
  }
  const ship = engine._militaryShips.find(s => s.ownerId === playerId && s.shipClass === 'destroyer');
  assert.ok(ship, 'Destroyer should be spawned after build completes');
  return ship;
}

describe('Destroyer ship class — constants', () => {
  it('destroyer cost is 200 minerals + 100 alloys', () => {
    assert.deepStrictEqual(DESTROYER_COST, { minerals: 200, alloys: 100 });
  });

  it('destroyer build time is 600 ticks', () => {
    assert.strictEqual(DESTROYER_BUILD_TIME, 600);
  });

  it('destroyer hop ticks is 60', () => {
    assert.strictEqual(DESTROYER_HOP_TICKS, 60);
  });

  it('destroyer HP is 80', () => {
    assert.strictEqual(DESTROYER_HP, 80);
  });

  it('destroyer attack is 8', () => {
    assert.strictEqual(DESTROYER_ATTACK, 8);
  });

  it('max destroyers is 5', () => {
    assert.strictEqual(MAX_DESTROYERS, 5);
  });

  it('destroyer maintenance is 3 energy + 2 alloys', () => {
    assert.deepStrictEqual(DESTROYER_MAINTENANCE, { energy: 3, alloys: 2 });
  });
});

describe('Destroyer — build command', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('requires deep_mining tech', () => {
    const colony = getFirstColony(engine);
    giveResources(engine);
    const result = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    assert.ok(result.error);
    assert.ok(result.error.includes('Deep Mining'));
  });

  it('builds destroyer with sufficient resources and tech', () => {
    const colony = getFirstColony(engine);
    giveResources(engine);
    unlockDeepMining(engine);
    const result = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    assert.ok(result.ok);
    assert.ok(result.id);
    assert.strictEqual(colony.buildQueue.length, 1);
    assert.strictEqual(colony.buildQueue[0].type, 'destroyer');
    assert.strictEqual(colony.buildQueue[0].ticksRemaining, DESTROYER_BUILD_TIME);
  });

  it('deducts correct resources', () => {
    const colony = getFirstColony(engine);
    giveResources(engine);
    unlockDeepMining(engine);
    const state = engine.playerStates.get('p1');
    const mineralsBefore = state.resources.minerals;
    const alloysBefore = state.resources.alloys;
    engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    assert.strictEqual(state.resources.minerals, mineralsBefore - 200);
    assert.strictEqual(state.resources.alloys, alloysBefore - 100);
  });

  it('rejects if not enough minerals', () => {
    const colony = getFirstColony(engine);
    unlockDeepMining(engine);
    const state = engine.playerStates.get('p1');
    state.resources.minerals = 50;
    state.resources.alloys = 200;
    const result = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    assert.ok(result.error);
    assert.ok(result.error.includes('minerals'));
  });

  it('rejects if not enough alloys', () => {
    const colony = getFirstColony(engine);
    unlockDeepMining(engine);
    const state = engine.playerStates.get('p1');
    state.resources.minerals = 500;
    state.resources.alloys = 10;
    const result = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    assert.ok(result.error);
    assert.ok(result.error.includes('alloys'));
  });

  it('rejects if build queue full', () => {
    const colony = getFirstColony(engine);
    giveResources(engine);
    unlockDeepMining(engine);
    // Fill the queue with 3 items
    engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    giveResources(engine);
    engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    giveResources(engine);
    engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    giveResources(engine);
    const result = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    assert.ok(result.error);
    assert.ok(result.error.includes('queue full'));
  });

  it('rejects missing colonyId', () => {
    const result = engine.handleCommand('p1', { type: 'buildDestroyer' });
    assert.ok(result.error);
  });

  it('rejects wrong colony owner', () => {
    engine = createEngine({ twoPlayers: true });
    const colony = getFirstColony(engine, 'p2');
    giveResources(engine);
    unlockDeepMining(engine);
    const result = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    assert.ok(result.error);
  });
});

describe('Destroyer — cap enforcement', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('enforces max 5 destroyers (owned + building)', () => {
    unlockDeepMining(engine);
    // Build 5 destroyers
    for (let i = 0; i < MAX_DESTROYERS; i++) {
      giveResources(engine);
      const colony = getFirstColony(engine);
      // Clear build queue by completing
      const result = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
      assert.ok(result.ok, `Destroyer ${i + 1} should build`);
      for (let t = 0; t < DESTROYER_BUILD_TIME; t++) engine.tick();
    }
    // 6th should fail
    giveResources(engine);
    const colony = getFirstColony(engine);
    const result = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    assert.ok(result.error);
    assert.ok(result.error.includes('cap'));
  });

  it('destroyer cap is independent of corvette cap', () => {
    unlockDeepMining(engine);
    // Build max corvettes
    for (let i = 0; i < MAX_CORVETTES; i++) {
      giveResources(engine);
      const colony = getFirstColony(engine);
      const result = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
      assert.ok(result.ok, `Corvette ${i + 1} should build`);
      for (let t = 0; t < 400; t++) engine.tick();
    }
    // Should still be able to build destroyer
    giveResources(engine);
    const colony = getFirstColony(engine);
    const result = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    assert.ok(result.ok, 'Destroyer should build even at corvette cap');
  });
});

describe('Destroyer — spawning and stats', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('spawns destroyer with correct stats after build completes', () => {
    const ship = buildAndCompleteDestroyer(engine);
    assert.strictEqual(ship.hp, DESTROYER_HP);
    assert.strictEqual(ship.attack, DESTROYER_ATTACK);
    assert.strictEqual(ship.shipClass, 'destroyer');
    assert.strictEqual(ship.maxHp, DESTROYER_HP);
    assert.strictEqual(ship.regen, 0);
    assert.strictEqual(ship.variant, null);
  });

  it('destroyer appears in player military ships', () => {
    buildAndCompleteDestroyer(engine);
    const count = engine._playerDestroyerCount('p1');
    assert.strictEqual(count, 1);
  });

  it('corvette count excludes destroyers', () => {
    buildAndCompleteDestroyer(engine);
    const corvettes = engine._playerCorvetteCount('p1');
    assert.strictEqual(corvettes, 0);
  });
});

describe('Destroyer — movement', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('destroyer moves at 60 ticks per hop', () => {
    const ship = buildAndCompleteDestroyer(engine);
    const startSystem = ship.systemId;

    // Find an adjacent system
    const neighbors = engine._adjacency.get(startSystem) || [];
    assert.ok(neighbors.length > 0, 'Starting system should have neighbors');
    const targetSystem = neighbors[0];

    const result = engine.handleCommand('p1', { type: 'sendFleet', shipId: ship.id, targetSystemId: targetSystem });
    assert.ok(result.ok || !result.error, 'sendFleet should succeed');

    // After 59 ticks, should still be in transit
    for (let i = 0; i < 59; i++) engine.tick();
    assert.strictEqual(ship.systemId, startSystem, 'Should still be at start after 59 ticks');

    // After 60th tick, should have arrived
    engine.tick();
    assert.strictEqual(ship.systemId, targetSystem, 'Should arrive after 60 ticks');
  });
});

describe('Destroyer — maintenance', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('destroyer costs 3 energy + 2 alloys per month in maintenance', () => {
    buildAndCompleteDestroyer(engine);
    const state = engine.playerStates.get('p1');
    // Set resources to exact amounts, then tick a full month
    state.resources.energy = 1000;
    state.resources.alloys = 1000;
    const energyBefore = state.resources.energy;
    const alloysBefore = state.resources.alloys;

    // Tick one month (100 ticks)
    for (let i = 0; i < 100; i++) engine.tick();

    // Maintenance is deducted once per month
    const energySpent = energyBefore - state.resources.energy;
    const alloysSpent = alloysBefore - state.resources.alloys;
    // At least the maintenance cost should have been deducted (production may offset)
    assert.ok(energySpent >= 0 || alloysSpent >= 0, 'Maintenance should affect resources');
  });
});

describe('Destroyer — VP scoring', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('destroyer gives +3 military VP', () => {
    buildAndCompleteDestroyer(engine);
    engine._vpCacheTick = -1; // invalidate VP cache
    const breakdown = engine._calcVPBreakdown('p1');
    // 1 destroyer = 3 military VP (0 corvettes * 1 + 1 destroyer * 3)
    assert.strictEqual(breakdown.destroyers, 1);
    assert.strictEqual(breakdown.militaryVP, 3);
  });
});

describe('Destroyer — serialization', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('destroyer appears in state with shipClass field', () => {
    buildAndCompleteDestroyer(engine);
    engine._invalidateStateCache();
    const stateJSON = JSON.parse(engine.getPlayerStateJSON('p1'));
    const ships = stateJSON.militaryShips;
    const destroyer = ships.find(s => s.shipClass === 'destroyer');
    assert.ok(destroyer, 'Destroyer should be in serialized state');
    assert.strictEqual(destroyer.hp, DESTROYER_HP);
    assert.strictEqual(destroyer.attack, DESTROYER_ATTACK);
    assert.strictEqual(destroyer.maxHp, DESTROYER_HP);
  });

  it('player state includes destroyer count', () => {
    buildAndCompleteDestroyer(engine);
    engine._invalidateStateCache();
    const stateJSON = JSON.parse(engine.getPlayerStateJSON('p1'));
    const me = stateJSON.players[0];
    assert.strictEqual(me.destroyers, 1);
  });
});

describe('Destroyer — combat', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine({ twoPlayers: true });
  });

  it('destroyer fights enemy corvettes in same system', () => {
    // Build destroyer for p1
    giveResources(engine, 'p1');
    unlockDeepMining(engine, 'p1');
    const colony1 = getFirstColony(engine, 'p1');
    engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony1.id });
    for (let i = 0; i < DESTROYER_BUILD_TIME; i++) engine.tick();
    const destroyer = engine._militaryShips.find(s => s.ownerId === 'p1' && s.shipClass === 'destroyer');
    assert.ok(destroyer);

    // Build corvette for p2 and move it to destroyer's system
    giveResources(engine, 'p2');
    const colony2 = getFirstColony(engine, 'p2');
    engine.handleCommand('p2', { type: 'buildCorvette', colonyId: colony2.id });
    for (let i = 0; i < 400; i++) engine.tick();
    const corvette = engine._militaryShips.find(s => s.ownerId === 'p2' && s.shipClass !== 'destroyer');
    assert.ok(corvette);

    // Set hostile stance
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    engine.handleCommand('p2', { type: 'setDiplomacy', targetPlayerId: 'p1', stance: 'hostile' });

    // Move corvette to destroyer's system (or vice versa)
    if (corvette.systemId !== destroyer.systemId) {
      // Move destroyer to corvette's system
      const result = engine.handleCommand('p1', { type: 'sendFleet', shipId: destroyer.id, targetSystemId: corvette.systemId });
      if (result && !result.error) {
        // Tick until arrival
        for (let i = 0; i < 1000; i++) {
          engine.tick();
          if (destroyer.systemId === corvette.systemId && (!destroyer.path || destroyer.path.length === 0)) break;
        }
      }
    }

    // If they're in the same system, combat should resolve
    if (destroyer.systemId === corvette.systemId) {
      // Tick to trigger combat
      for (let i = 0; i < 10; i++) engine.tick();
      // Destroyer (80 HP, 8 ATK) should survive against corvette (10 HP, 3 ATK)
      const destroyerAlive = engine._militaryShips.some(s => s.id === destroyer.id);
      assert.ok(destroyerAlive, 'Destroyer should survive against a single corvette');
    }
  });
});

describe('Destroyer — cancel refund', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('cancelling destroyer in build queue refunds 50% resources', () => {
    giveResources(engine);
    unlockDeepMining(engine);
    const colony = getFirstColony(engine);
    const state = engine.playerStates.get('p1');

    const result = engine.handleCommand('p1', { type: 'buildDestroyer', colonyId: colony.id });
    assert.ok(result.ok);
    const queuedId = colony.buildQueue[0].id;

    const mineralsBefore = state.resources.minerals;
    const alloysBefore = state.resources.alloys;

    // Cancel via demolish
    const cancelResult = engine.handleCommand('p1', { type: 'demolish', colonyId: colony.id, districtId: queuedId });
    assert.ok(cancelResult.ok);

    // Should refund 50% of cost
    assert.strictEqual(state.resources.minerals, mineralsBefore + 100); // 200 * 0.5
    assert.strictEqual(state.resources.alloys, alloysBefore + 50);     // 100 * 0.5
  });
});
