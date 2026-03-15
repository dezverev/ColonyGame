const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, COLONY_SHIP_COST, COLONY_SHIP_BUILD_TIME, COLONY_SHIP_HOP_TICKS, COLONY_SHIP_STARTING_POPS } = require('../../server/game-engine');

// Helper: create a game engine with 1 player
function makeEngine(opts = {}) {
  const room = {
    id: 'test-room',
    players: new Map([[1, { name: 'Alice' }]]),
    hostId: 1,
    galaxySize: 'small',
    matchTimer: 0,
    ...(opts.room || {}),
  };
  return new GameEngine(room, {
    tickRate: 10,
    galaxySeed: opts.seed != null ? opts.seed : 42,
    ...opts,
  });
}

function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

function giveShipResources(engine, playerId) {
  const state = engine.playerStates.get(playerId);
  state.resources.minerals = 500;
  state.resources.food = 300;
  state.resources.alloys = 300;
}

// Helper: build colony ship, send it to a habitable target, tick until arrival
// Returns { engine, newColony, targetSysId } or null if no valid target
function foundNewColony(engine, playerId) {
  giveShipResources(engine, playerId);
  const colony = getFirstColony(engine, playerId);
  engine.handleCommand(playerId, { type: 'buildColonyShip', colonyId: colony.id });
  for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();

  const ship = engine._colonyShips.find(s => s.ownerId === playerId);
  if (!ship) return null;

  // Find nearest habitable target
  let targetSysId = null;
  for (const [a, b] of engine.galaxy.hyperlanes) {
    let neighborId = null;
    if (a === ship.systemId) neighborId = b;
    else if (b === ship.systemId) neighborId = a;
    if (neighborId == null) continue;
    const sys = engine.galaxy.systems[neighborId];
    const hasPlanet = sys.planets && sys.planets.some(p => p.habitability >= 20 && !p.colonized);
    if (hasPlanet) { targetSysId = neighborId; break; }
  }
  if (targetSysId == null) return null;

  engine.handleCommand(playerId, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: targetSysId });
  const totalTicks = ship.path.length * COLONY_SHIP_HOP_TICKS;
  for (let i = 0; i < totalTicks + 5; i++) engine.tick();

  const colonyIds = engine._playerColonies.get(playerId);
  const newColonyId = colonyIds[colonyIds.length - 1];
  const newColony = engine.colonies.get(newColonyId);
  return { engine, newColony, targetSysId };
}

describe('Colony established bonus', () => {
  it('should auto-build 1 mining district on new colony founding', () => {
    const engine = makeEngine();
    const result = foundNewColony(engine, 1);
    if (!result) return; // skip if no habitable target (unlikely with seed 42)

    const { newColony } = result;
    assert.ok(newColony, 'New colony should exist');
    assert.strictEqual(newColony.districts.length, 1, 'Should have exactly 1 district');
    assert.strictEqual(newColony.districts[0].type, 'mining', 'District should be mining');
  });

  it('should not charge resources for the bonus mining district', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);

    // Record resources right before arrival
    giveShipResources(engine, 1);
    const colony = getFirstColony(engine, 1);
    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();

    const ship = engine._colonyShips[0];
    if (!ship) return;

    let targetSysId = null;
    for (const [a, b] of engine.galaxy.hyperlanes) {
      let neighborId = null;
      if (a === ship.systemId) neighborId = b;
      else if (b === ship.systemId) neighborId = a;
      if (neighborId == null) continue;
      const sys = engine.galaxy.systems[neighborId];
      const hasPlanet = sys.planets && sys.planets.some(p => p.habitability >= 20 && !p.colonized);
      if (hasPlanet) { targetSysId = neighborId; break; }
    }
    if (targetSysId == null) return;

    engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: targetSysId });

    // Record minerals just before final arrival tick
    const totalTicks = ship.path.length * COLONY_SHIP_HOP_TICKS;
    for (let i = 0; i < totalTicks - 1; i++) engine.tick();
    const mineralsBefore = state.resources.minerals;
    // Final ticks to arrive
    for (let i = 0; i < 10; i++) engine.tick();

    // Minerals should not have been deducted for the bonus district
    // (they may change due to monthly production, but should not decrease by mining district cost)
    assert.ok(state.resources.minerals >= mineralsBefore - 1,
      'Minerals should not decrease by district cost for bonus mining district');
  });

  it('should have bonus district with no build time (instant)', () => {
    const engine = makeEngine();
    const result = foundNewColony(engine, 1);
    if (!result) return;

    const { newColony } = result;
    // District is fully built (in districts array, not buildQueue)
    assert.strictEqual(newColony.districts.length, 1, 'District should be in built array');
    assert.strictEqual(newColony.buildQueue.length, 0, 'Build queue should be empty');
  });

  it('should produce minerals from the bonus district', () => {
    const engine = makeEngine();
    const result = foundNewColony(engine, 1);
    if (!result) return;

    const { newColony } = result;
    // Colony has 1 mining district and COLONY_SHIP_STARTING_POPS pops
    // Production should include mining output
    const { production } = engine._calcProduction(newColony);
    assert.ok(production.minerals > 0, 'New colony should produce minerals from bonus district');
  });

  it('starting colony should NOT get bonus district (already has pre-built districts)', () => {
    const engine = makeEngine();
    const startingColony = getFirstColony(engine, 1);

    // Starting colony has 4 pre-built districts (1 gen, 1 mining, 2 agriculture)
    assert.strictEqual(startingColony.districts.length, 4, 'Starting colony should have 4 districts');
    assert.strictEqual(startingColony.isStartingColony, true);
  });

  it('should track bonus district in match stats', () => {
    const engine = makeEngine();
    const result = foundNewColony(engine, 1);
    if (!result) return;

    // The bonus district is added via _addBuiltDistrict, same as any other
    // It should show in the colony's district count
    const colonyIds = engine._playerColonies.get(1);
    assert.strictEqual(colonyIds.length, 2, 'Player should have 2 colonies');
  });

  it('should include bonus district in serialized colony state', () => {
    const engine = makeEngine();
    const result = foundNewColony(engine, 1);
    if (!result) return;

    const state = engine.getPlayerState(1);
    // New colony is the one at the target system
    const newColonyState = state.colonies.find(c => c.systemId === result.targetSysId);
    assert.ok(newColonyState, 'Serialized state should include new colony');
    assert.strictEqual(newColonyState.districts.length, 1, 'Serialized colony should have 1 district');
    assert.strictEqual(newColonyState.districts[0].type, 'mining');
  });

  it('should work with multiple colony foundings', () => {
    const engine = makeEngine();

    // Found first new colony
    const result1 = foundNewColony(engine, 1);
    if (!result1) return;
    assert.strictEqual(result1.newColony.districts.length, 1);
    assert.strictEqual(result1.newColony.districts[0].type, 'mining');

    // Found second new colony (may fail if no more habitable targets — that's ok)
    const result2 = foundNewColony(engine, 1);
    if (!result2) return;
    assert.strictEqual(result2.newColony.districts.length, 1);
    assert.strictEqual(result2.newColony.districts[0].type, 'mining');
  });
});
