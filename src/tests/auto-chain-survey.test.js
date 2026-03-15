const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine, SURVEY_TICKS, SCIENCE_SHIP_HOP_TICKS,
} = require('../../server/game-engine');

// Helper: create a 2-player engine with doctrine phase skipped
function createEngine(opts = {}) {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  if (opts.twoPlayer !== false) {
    players.set('p2', { name: 'Player 2' });
  }
  const room = { players, galaxySize: 'small', matchTimer: opts.matchTimer || 0 };
  const engine = new GameEngine(room, { tickRate: 10 });
  engine._doctrinePhase = false;
  return engine;
}

function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

// Helper: create a science ship at a specific system
function spawnScienceShip(engine, playerId, systemId) {
  const shipId = engine._nextId();
  const ship = {
    id: shipId,
    ownerId: playerId,
    systemId,
    targetSystemId: null,
    path: [],
    hopProgress: 0,
    surveying: false,
    surveyProgress: 0,
    autoSurvey: true,
  };
  engine._scienceShips.push(ship);
  let arr = engine._scienceShipsByPlayer.get(playerId);
  if (!arr) { arr = []; engine._scienceShipsByPlayer.set(playerId, arr); }
  arr.push(ship);
  return ship;
}

// Helper: find an unsurveyed neighbor system
function findUnsurveyedNeighbor(engine, systemId, playerId) {
  const adj = engine._adjacency;
  const surveyed = engine._surveyedSystems.get(playerId) || new Set();
  const neighbors = adj.get(systemId) || [];
  for (const n of neighbors) {
    if (!surveyed.has(n)) return n;
  }
  return null;
}

// ── Auto-chain after survey completes ──

describe('Science Ship Auto-Chain Survey — basic', () => {
  it('science ship auto-dispatches to nearest unsurveyed after survey completes', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const startSystemId = colony.systemId;

    // Spawn ship at the starting system
    const ship = spawnScienceShip(engine, 'p1', startSystemId);

    // Find an unsurveyed neighbor to survey first
    const firstTarget = findUnsurveyedNeighbor(engine, startSystemId, 'p1');
    assert.ok(firstTarget !== null, 'should have an unsurveyed neighbor');

    // Manually set up ship as surveying at firstTarget (about to complete)
    ship.systemId = firstTarget;
    ship.surveying = true;
    ship.surveyProgress = SURVEY_TICKS - 1;
    ship.targetSystemId = firstTarget;

    // Tick to complete the survey
    engine._processScienceShipMovement();

    // Ship should now have a new target (auto-chained)
    assert.strictEqual(ship.surveying, false, 'no longer surveying');
    assert.ok(ship.path && ship.path.length > 0, 'should have a new path from auto-chain');
    assert.ok(ship.targetSystemId !== null, 'should have a new target');

    // The target should be unsurveyed
    const surveyed = engine._surveyedSystems.get('p1');
    assert.ok(!surveyed.has(ship.targetSystemId), 'target should be unsurveyed');
  });

  it('auto-chain does not dispatch if autoSurvey is false', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const startSystemId = colony.systemId;
    const ship = spawnScienceShip(engine, 'p1', startSystemId);
    ship.autoSurvey = false;

    const firstTarget = findUnsurveyedNeighbor(engine, startSystemId, 'p1');
    assert.ok(firstTarget !== null);

    ship.systemId = firstTarget;
    ship.surveying = true;
    ship.surveyProgress = SURVEY_TICKS - 1;
    ship.targetSystemId = firstTarget;

    engine._processScienceShipMovement();

    // Ship should be idle — no auto-chain
    assert.strictEqual(ship.surveying, false);
    assert.ok(!ship.path || ship.path.length === 0, 'should not auto-chain when disabled');
    assert.strictEqual(ship.targetSystemId, null, 'target should be null');
  });

  it('auto-chain stays idle when all systems are surveyed', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const startSystemId = colony.systemId;
    const ship = spawnScienceShip(engine, 'p1', startSystemId);

    // Survey ALL systems in the galaxy
    const surveyed = new Set();
    for (const sys of engine.galaxy.systems) {
      surveyed.add(sys.id);
    }
    engine._surveyedSystems.set('p1', surveyed);

    // Set ship as completing a survey at a system
    const target = engine.galaxy.systems[0].id;
    ship.systemId = target;
    ship.surveying = true;
    ship.surveyProgress = SURVEY_TICKS - 1;
    ship.targetSystemId = target;

    engine._processScienceShipMovement();

    // Ship should be idle — all systems surveyed
    assert.strictEqual(ship.surveying, false);
    assert.ok(!ship.path || ship.path.length === 0, 'should remain idle');
  });
});

// ── toggleAutoSurvey command ──

describe('toggleAutoSurvey command', () => {
  it('toggles autoSurvey from true to false', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);
    assert.strictEqual(ship.autoSurvey, true);

    const result = engine.handleCommand('p1', { type: 'toggleAutoSurvey', shipId: ship.id });
    assert.deepStrictEqual(result.ok, true);
    assert.strictEqual(result.autoSurvey, false);
    assert.strictEqual(ship.autoSurvey, false);
  });

  it('toggles autoSurvey from false to true', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);
    ship.autoSurvey = false;

    const result = engine.handleCommand('p1', { type: 'toggleAutoSurvey', shipId: ship.id });
    assert.deepStrictEqual(result.ok, true);
    assert.strictEqual(result.autoSurvey, true);
    assert.strictEqual(ship.autoSurvey, true);
  });

  it('rejects missing shipId', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', { type: 'toggleAutoSurvey' });
    assert.ok(result.error);
  });

  it('rejects invalid shipId', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', { type: 'toggleAutoSurvey', shipId: 'nonexistent' });
    assert.ok(result.error);
  });

  it('rejects other player toggling your ship', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);

    const result = engine.handleCommand('p2', { type: 'toggleAutoSurvey', shipId: ship.id });
    assert.ok(result.error, 'should not allow toggling another player\'s ship');
  });

  it('toggling ON for idle ship triggers auto-chain immediately', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);
    ship.autoSurvey = false;

    // Mark colony system as surveyed so ship looks for neighbors
    const surveyed = engine._surveyedSystems.get('p1') || new Set();
    surveyed.add(colony.systemId);
    engine._surveyedSystems.set('p1', surveyed);

    const result = engine.handleCommand('p1', { type: 'toggleAutoSurvey', shipId: ship.id });
    assert.strictEqual(result.autoSurvey, true);

    // Ship should have auto-dispatched to a neighbor
    const hasNeighbors = (engine._adjacency.get(colony.systemId) || []).some(n => !surveyed.has(n));
    if (hasNeighbors) {
      assert.ok(ship.path && ship.path.length > 0, 'should auto-dispatch when toggled on');
    }
  });
});

// ── Serialization ──

describe('Auto-Survey — serialization', () => {
  it('autoSurvey=true is included in getPlayerState', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    spawnScienceShip(engine, 'p1', colony.systemId);

    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    assert.ok(parsed.scienceShips.length > 0);
    assert.strictEqual(parsed.scienceShips[0].autoSurvey, true);
  });

  it('autoSurvey=false is serialized correctly', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);
    ship.autoSurvey = false;

    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.scienceShips[0].autoSurvey, false);
  });
});

// ── Auto-chain survey integration ──

describe('Auto-Chain Survey — integration', () => {
  it('newly built science ship has autoSurvey=true by default', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const state = engine.playerStates.get('p1');
    state.resources.minerals = 10000;
    state.resources.energy = 10000;
    state.resources.alloys = 10000;

    engine.handleCommand('p1', { type: 'buildScienceShip', colonyId: colony.id });

    // Tick through the full build time (ticksRemaining field)
    const buildItem = colony.buildQueue.find(q => q.type === 'scienceShip');
    assert.ok(buildItem, 'scienceShip should be in build queue');
    const totalTicks = buildItem.ticksRemaining + 1;
    for (let i = 0; i < totalTicks; i++) engine.tick();

    // Find the newly built ship
    const ships = engine._scienceShipsByPlayer.get('p1') || [];
    const newShip = ships.find(s => s.ownerId === 'p1');
    assert.ok(newShip, 'ship should exist');
    assert.strictEqual(newShip.autoSurvey, true, 'default autoSurvey should be true');
  });

  it('_autoChainSurvey finds nearest unsurveyed within 3 hops', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);

    // Survey the colony system
    const surveyed = engine._surveyedSystems.get('p1') || new Set();
    surveyed.add(colony.systemId);
    engine._surveyedSystems.set('p1', surveyed);

    const result = engine._autoChainSurvey(ship);
    assert.strictEqual(result, true, 'should find an unsurveyed system');
    assert.ok(ship.path.length > 0, 'should have a path');
    assert.ok(ship.path.length <= 3, 'target should be within 3 hops');
  });

  it('_autoChainSurvey returns false when autoSurvey is off', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);
    ship.autoSurvey = false;

    const result = engine._autoChainSurvey(ship);
    assert.strictEqual(result, false);
    assert.ok(!ship.path || ship.path.length === 0);
  });

  it('_autoChainSurvey prefers closer systems', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);

    // Survey colony system and all 1-hop neighbors
    const surveyed = engine._surveyedSystems.get('p1') || new Set();
    surveyed.add(colony.systemId);
    engine._surveyedSystems.set('p1', surveyed);

    // First call: should pick a 1-hop neighbor (closest)
    engine._autoChainSurvey(ship);
    const firstPathLen = ship.path.length;

    // Now survey all 1-hop neighbors, reset ship
    for (const n of (engine._adjacency.get(colony.systemId) || [])) {
      surveyed.add(n);
    }
    ship.path = [];
    ship.targetSystemId = null;
    ship.hopProgress = 0;
    ship.systemId = colony.systemId;

    // Second call: should pick a 2-hop neighbor
    const result = engine._autoChainSurvey(ship);
    if (result) {
      assert.ok(ship.path.length >= firstPathLen, 'second target should be at least as far');
    }
    // If false, all within 3 hops were surveyed — that's fine too
  });
});
