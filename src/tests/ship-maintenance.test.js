const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  CORVETTE_COST, CORVETTE_BUILD_TIME, CORVETTE_HP,
  CORVETTE_MAINTENANCE, CIVILIAN_SHIP_MAINTENANCE, MAINTENANCE_DAMAGE,
  MONTH_TICKS, COLONY_SHIP_COST, COLONY_SHIP_BUILD_TIME,
  SCIENCE_SHIP_COST, SCIENCE_SHIP_BUILD_TIME,
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

function giveResources(engine, playerId = 'p1', amounts = {}) {
  const state = engine.playerStates.get(playerId);
  state.resources.minerals = amounts.minerals !== undefined ? amounts.minerals : 5000;
  state.resources.alloys = amounts.alloys !== undefined ? amounts.alloys : 5000;
  state.resources.energy = amounts.energy !== undefined ? amounts.energy : 5000;
  state.resources.food = amounts.food !== undefined ? amounts.food : 5000;
}

function buildAndCompleteCorvette(engine, playerId = 'p1') {
  const colony = getFirstColony(engine, playerId);
  giveResources(engine, playerId);
  engine.handleCommand(playerId, { type: 'buildCorvette', colonyId: colony.id });
  for (let i = 0; i < CORVETTE_BUILD_TIME; i++) engine.tick();
  const ships = engine._militaryShipsByPlayer.get(playerId) || [];
  return ships[ships.length - 1];
}

// ── Constants ──

describe('Ship maintenance — constants', () => {
  it('corvette maintenance costs are 1 energy + 1 alloy per month', () => {
    assert.deepStrictEqual(CORVETTE_MAINTENANCE, { energy: 1, alloys: 1 });
  });

  it('civilian ship maintenance is 1 energy per month', () => {
    assert.deepStrictEqual(CIVILIAN_SHIP_MAINTENANCE, { energy: 1 });
  });

  it('maintenance damage is 2 HP per corvette', () => {
    assert.strictEqual(MAINTENANCE_DAMAGE, 2);
  });
});

// ── Corvette maintenance deduction ──

describe('Ship maintenance — corvette costs', () => {
  it('1 corvette deducts 1 energy + 1 alloy on monthly tick', () => {
    const engine = createEngine();
    buildAndCompleteCorvette(engine);
    const state = engine.playerStates.get('p1');

    // Set known resource levels
    state.resources.energy = 100;
    state.resources.alloys = 100;

    // Run exactly one month
    engine._processMonthlyResources();

    // Energy should be 100 + colony production - colony consumption - 1 corvette maintenance
    // Alloys should be 100 + colony production - 1 corvette maintenance
    // Just verify that maintenance was deducted by checking less than what colony production alone would give
    const colonyIds = engine._playerColonies.get('p1') || [];
    let colonyEnergy = 0, colonyAlloys = 0;
    for (const cid of colonyIds) {
      const col = engine.colonies.get(cid);
      const { production, consumption } = engine._calcProduction(col);
      colonyEnergy += production.energy - consumption.energy;
      colonyAlloys += production.alloys - consumption.alloys;
    }

    assert.strictEqual(state.resources.energy, 100 + colonyEnergy - 1);
    assert.strictEqual(state.resources.alloys, 100 + colonyAlloys - 1);
  });

  it('3 corvettes deduct 3 energy + 3 alloys on monthly tick', () => {
    const engine = createEngine();
    buildAndCompleteCorvette(engine);
    buildAndCompleteCorvette(engine);
    buildAndCompleteCorvette(engine);
    const state = engine.playerStates.get('p1');

    state.resources.energy = 100;
    state.resources.alloys = 100;

    const colonyIds = engine._playerColonies.get('p1') || [];
    let colonyEnergy = 0, colonyAlloys = 0;
    for (const cid of colonyIds) {
      const col = engine.colonies.get(cid);
      const { production, consumption } = engine._calcProduction(col);
      colonyEnergy += production.energy - consumption.energy;
      colonyAlloys += production.alloys - consumption.alloys;
    }

    engine._processMonthlyResources();

    assert.strictEqual(state.resources.energy, 100 + colonyEnergy - 3);
    assert.strictEqual(state.resources.alloys, 100 + colonyAlloys - 3);
  });

  it('zero corvettes = zero maintenance', () => {
    const engine = createEngine();
    const state = engine.playerStates.get('p1');
    state.resources.energy = 100;
    state.resources.alloys = 100;

    const colonyIds = engine._playerColonies.get('p1') || [];
    let colonyEnergy = 0, colonyAlloys = 0;
    for (const cid of colonyIds) {
      const col = engine.colonies.get(cid);
      const { production, consumption } = engine._calcProduction(col);
      colonyEnergy += production.energy - consumption.energy;
      colonyAlloys += production.alloys - consumption.alloys;
    }

    engine._processMonthlyResources();

    assert.strictEqual(state.resources.energy, 100 + colonyEnergy);
    assert.strictEqual(state.resources.alloys, 100 + colonyAlloys);
  });
});

// ── HP degradation when maintenance unaffordable ──

describe('Ship maintenance — attrition on negative resources', () => {
  it('corvettes lose 2 HP when energy goes negative from maintenance', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    const state = engine.playerStates.get('p1');

    // Set resources so that after colony production + maintenance, energy goes negative
    // Colony production gives some energy, so set energy low enough
    state.resources.energy = -100; // force negative
    state.resources.alloys = 500;
    const hpBefore = ship.hp;

    engine._processMonthlyResources();

    assert.strictEqual(ship.hp, hpBefore - MAINTENANCE_DAMAGE);
  });

  it('corvettes lose 2 HP when alloys go negative from maintenance', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    const state = engine.playerStates.get('p1');

    state.resources.energy = 500;
    state.resources.alloys = -100; // force negative after maintenance

    const hpBefore = ship.hp;
    engine._processMonthlyResources();

    assert.strictEqual(ship.hp, hpBefore - MAINTENANCE_DAMAGE);
  });

  it('corvette destroyed at 0 HP from maintenance attrition', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    const state = engine.playerStates.get('p1');

    // Set HP to exactly MAINTENANCE_DAMAGE so it dies
    ship.hp = MAINTENANCE_DAMAGE;
    state.resources.energy = -100;
    state.resources.alloys = 500;

    engine._processMonthlyResources();

    // Ship should be removed
    const remaining = (engine._militaryShipsByPlayer.get('p1') || []).length;
    assert.strictEqual(remaining, 0, 'Ship should be destroyed');
  });

  it('multiple corvettes all take damage when maintenance unaffordable', () => {
    const engine = createEngine();
    const s1 = buildAndCompleteCorvette(engine);
    const s2 = buildAndCompleteCorvette(engine);
    const state = engine.playerStates.get('p1');

    state.resources.energy = -100;
    state.resources.alloys = 500;

    engine._processMonthlyResources();

    assert.strictEqual(s1.hp, CORVETTE_HP - MAINTENANCE_DAMAGE);
    assert.strictEqual(s2.hp, CORVETTE_HP - MAINTENANCE_DAMAGE);
  });

  it('no damage when resources stay positive after maintenance', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    const state = engine.playerStates.get('p1');

    state.resources.energy = 500;
    state.resources.alloys = 500;

    engine._processMonthlyResources();

    assert.strictEqual(ship.hp, CORVETTE_HP);
  });
});

// ── Maintenance attrition events ──

describe('Ship maintenance — events', () => {
  it('emits maintenanceAttrition event when ships destroyed', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    ship.hp = 1; // will die from 2 damage
    const state = engine.playerStates.get('p1');
    state.resources.energy = -100;

    // Flush any prior events
    engine._flushEvents();

    engine._processMonthlyResources();

    const events = engine._flushEvents() || [];
    const attrition = events.find(e => e.eventType === 'maintenanceAttrition');
    assert.ok(attrition, 'maintenanceAttrition event should be emitted');
    assert.strictEqual(attrition.shipsLost, 1);
    assert.strictEqual(attrition.broadcast, true);
  });

  it('emits shipLostMaintenance event per destroyed ship', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    ship.hp = 1;
    const state = engine.playerStates.get('p1');
    state.resources.energy = -100;

    engine._flushEvents();
    engine._processMonthlyResources();

    const events = engine._flushEvents() || [];
    const shipLost = events.find(e => e.eventType === 'shipLostMaintenance');
    assert.ok(shipLost, 'shipLostMaintenance event should be emitted');
    assert.strictEqual(shipLost.shipId, ship.id);
  });

  it('no attrition event when no ships destroyed', () => {
    const engine = createEngine();
    buildAndCompleteCorvette(engine);
    const state = engine.playerStates.get('p1');
    state.resources.energy = -100; // will cause damage but not destroy (10 HP - 2 = 8)

    engine._flushEvents();
    engine._processMonthlyResources();

    const events = engine._flushEvents() || [];
    const attrition = events.find(e => e.eventType === 'maintenanceAttrition');
    assert.ok(!attrition, 'no attrition event when ships survive');
  });
});

// ── Civilian ship maintenance ──

describe('Ship maintenance — civilian ships', () => {
  it('idle colony ship costs 1 energy/month', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    giveResources(engine);

    // Build colony ship
    engine.handleCommand('p1', { type: 'buildColonyShip', colonyId: colony.id });
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();

    // Verify colony ship exists and is idle
    const colonyShips = engine._colonyShips.filter(s => s.ownerId === 'p1');
    assert.ok(colonyShips.length > 0, 'colony ship should exist');
    const ship = colonyShips[0];
    assert.ok(!ship.path || ship.path.length === 0, 'ship should be idle');

    const state = engine.playerStates.get('p1');
    state.resources.energy = 100;
    state.resources.alloys = 100;

    const colonyIds = engine._playerColonies.get('p1') || [];
    let colonyEnergy = 0;
    for (const cid of colonyIds) {
      const col = engine.colonies.get(cid);
      const { production, consumption } = engine._calcProduction(col);
      colonyEnergy += production.energy - consumption.energy;
    }

    engine._processMonthlyResources();

    // Should deduct 1 energy for idle colony ship
    assert.strictEqual(state.resources.energy, 100 + colonyEnergy - 1);
  });

  it('colony ship in transit does not incur maintenance', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    giveResources(engine);

    engine.handleCommand('p1', { type: 'buildColonyShip', colonyId: colony.id });
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();

    const ship = engine._colonyShips.find(s => s.ownerId === 'p1');
    assert.ok(ship, 'colony ship should exist');

    // Simulate in-transit by giving it a path
    ship.path = ['sys1', 'sys2'];

    const state = engine.playerStates.get('p1');
    state.resources.energy = 100;

    const colonyIds = engine._playerColonies.get('p1') || [];
    let colonyEnergy = 0;
    for (const cid of colonyIds) {
      const col = engine.colonies.get(cid);
      const { production, consumption } = engine._calcProduction(col);
      colonyEnergy += production.energy - consumption.energy;
    }

    engine._processMonthlyResources();

    // No civilian maintenance deducted (ship in transit)
    assert.strictEqual(state.resources.energy, 100 + colonyEnergy);
  });
});

// ── Income display includes maintenance ──

describe('Ship maintenance — income display', () => {
  it('_getPlayerSummary includes corvette maintenance in income', () => {
    const engine = createEngine();
    buildAndCompleteCorvette(engine);

    // Get income without corvettes for comparison
    const summaryWith = engine._getPlayerSummary('p1');

    // Remove the corvette and clear cache
    const ship = engine._militaryShips[0];
    engine._removeMilitaryShip(ship);
    engine._summaryCacheTick = -1;

    const summaryWithout = engine._getPlayerSummary('p1');

    // With corvette: income.energy should be 1 less, income.alloys should be 1 less
    assert.strictEqual(summaryWith.income.energy, summaryWithout.income.energy - CORVETTE_MAINTENANCE.energy);
    assert.strictEqual(summaryWith.income.alloys, summaryWithout.income.alloys - CORVETTE_MAINTENANCE.alloys);
  });

  it('_getPlayerSummary includes idle civilian ship maintenance in income', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    giveResources(engine);

    // Build science ship
    engine.handleCommand('p1', { type: 'buildScienceShip', colonyId: colony.id });
    for (let i = 0; i < SCIENCE_SHIP_BUILD_TIME; i++) engine.tick();

    const sciShip = engine._scienceShips.find(s => s.ownerId === 'p1');
    assert.ok(sciShip, 'science ship should exist');

    // Clear summary cache
    engine._summaryCacheTick = -1;
    const summaryWith = engine._getPlayerSummary('p1');

    // Remove science ship and recheck
    const idx = engine._scienceShips.indexOf(sciShip);
    engine._scienceShips.splice(idx, 1);
    engine._summaryCacheTick = -1;
    const summaryWithout = engine._getPlayerSummary('p1');

    assert.strictEqual(summaryWith.income.energy, summaryWithout.income.energy - CIVILIAN_SHIP_MAINTENANCE.energy);
  });
});

// ── Edge cases ──

describe('Ship maintenance — edge cases', () => {
  it('corvette at exactly 1 HP is destroyed by maintenance damage', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    ship.hp = 1;
    const state = engine.playerStates.get('p1');
    state.resources.energy = -100;

    engine._processMonthlyResources();

    assert.strictEqual((engine._militaryShipsByPlayer.get('p1') || []).length, 0);
  });

  it('corvette at HP > MAINTENANCE_DAMAGE survives', () => {
    const engine = createEngine();
    const ship = buildAndCompleteCorvette(engine);
    ship.hp = MAINTENANCE_DAMAGE + 1;
    const state = engine.playerStates.get('p1');
    state.resources.energy = -100;

    engine._processMonthlyResources();

    assert.strictEqual((engine._militaryShipsByPlayer.get('p1') || []).length, 1);
    assert.strictEqual(ship.hp, 1);
  });

  it('building corvettes in queue do not incur maintenance', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    giveResources(engine);

    // Queue a corvette but don't complete it
    engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });

    const state = engine.playerStates.get('p1');
    state.resources.energy = 100;
    state.resources.alloys = 100;

    const colonyIds = engine._playerColonies.get('p1') || [];
    let colonyEnergy = 0, colonyAlloys = 0;
    for (const cid of colonyIds) {
      const col = engine.colonies.get(cid);
      const { production, consumption } = engine._calcProduction(col);
      colonyEnergy += production.energy - consumption.energy;
      colonyAlloys += production.alloys - consumption.alloys;
    }

    engine._processMonthlyResources();

    // No corvette maintenance since it's still building
    assert.strictEqual(state.resources.energy, 100 + colonyEnergy);
    assert.strictEqual(state.resources.alloys, 100 + colonyAlloys);
  });
});
