const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine, COLONY_SHIP_COST, COLONY_SHIP_BUILD_TIME, COLONY_SHIP_HOP_TICKS,
  DOCTRINE_DEFS
} = require('../../server/game-engine');

function makeEngine(opts = {}) {
  const room = {
    id: 'test-room',
    players: new Map([[1, { name: 'P1' }]]),
    hostId: 1,
    galaxySize: 'small',
    matchTimer: 0,
    ...(opts.room || {}),
  };
  const engine = new GameEngine(room, {
    tickRate: 10,
    galaxySeed: opts.seed != null ? opts.seed : 42,
    ...opts,
  });
  return engine;
}

function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

function giveResources(engine, playerId) {
  const state = engine.playerStates.get(playerId);
  state.resources.minerals = 500;
  state.resources.food = 300;
  state.resources.alloys = 300;
}

describe('Colony Ship Balance — R59 cost/time reduction', () => {
  it('colony ship costs 175 minerals, 75 food, 75 alloys', () => {
    assert.strictEqual(COLONY_SHIP_COST.minerals, 175);
    assert.strictEqual(COLONY_SHIP_COST.food, 75);
    assert.strictEqual(COLONY_SHIP_COST.alloys, 75);
  });

  it('colony ship build time is 450 ticks (45 seconds)', () => {
    assert.strictEqual(COLONY_SHIP_BUILD_TIME, 450);
  });

  it('total resource cost is 325 (down from 400)', () => {
    const total = COLONY_SHIP_COST.minerals + COLONY_SHIP_COST.food + COLONY_SHIP_COST.alloys;
    assert.strictEqual(total, 325);
  });

  it('colony ship completes in exactly 450 ticks', () => {
    const engine = makeEngine();
    giveResources(engine, 1);
    const colony = getFirstColony(engine, 1);

    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    assert.strictEqual(colony.buildQueue[0].ticksRemaining, COLONY_SHIP_BUILD_TIME);

    // Tick 449 times — should still be building
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME - 1; i++) engine.tick();
    assert.strictEqual(colony.buildQueue.length, 1, 'ship still building at tick 449');

    // One more tick completes it
    engine.tick();
    assert.strictEqual(colony.buildQueue.length, 0, 'ship complete at tick 450');
  });

  it('player cannot afford ship with exactly 174 minerals', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    state.resources.minerals = 174;
    state.resources.food = 200;
    state.resources.alloys = 200;
    const colony = getFirstColony(engine, 1);

    const result = engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    assert.ok(result.error, 'should reject with 174 minerals');
  });

  it('player can afford ship with exactly 175 minerals', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    state.resources.minerals = 175;
    state.resources.food = 75;
    state.resources.alloys = 75;
    const colony = getFirstColony(engine, 1);

    const result = engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    assert.ok(!result.error, 'should accept with exact resources');
    assert.strictEqual(state.resources.minerals, 0);
    assert.strictEqual(state.resources.food, 0);
    assert.strictEqual(state.resources.alloys, 0);
  });

  it('cancellation refunds floor(cost/2) for odd amounts', () => {
    const engine = makeEngine();
    giveResources(engine, 1);
    const state = engine.playerStates.get(1);
    const colony = getFirstColony(engine, 1);

    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    const mineralsAfterBuild = state.resources.minerals;
    const foodAfterBuild = state.resources.food;
    const alloysAfterBuild = state.resources.alloys;

    const qItem = colony.buildQueue[0];
    engine.handleCommand(1, { type: 'demolish', colonyId: colony.id, districtId: qItem.id });

    // floor(175/2)=87, floor(75/2)=37
    assert.strictEqual(state.resources.minerals, mineralsAfterBuild + 87);
    assert.strictEqual(state.resources.food, foodAfterBuild + 37);
    assert.strictEqual(state.resources.alloys, alloysAfterBuild + 37);
  });

  it('Expansionist doctrine applies 0.75 multiplier to reduced cost', () => {
    const engine = makeEngine();

    // Set doctrine
    const state1 = engine.playerStates.get(1);
    state1.doctrine = 'expansionist';
    giveResources(engine, 1);

    const colony = getFirstColony(engine, 1);
    const mineralsBefore = state1.resources.minerals;

    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });

    const expectedCost = Math.ceil(COLONY_SHIP_COST.minerals * 0.75);
    assert.strictEqual(state1.resources.minerals, mineralsBefore - expectedCost);

    // Build time also 75%
    assert.strictEqual(colony.buildQueue[0].ticksRemaining, Math.ceil(COLONY_SHIP_BUILD_TIME * 0.75));
  });
});
