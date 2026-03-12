const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine, SCIENCE_SHIP_COST, SCIENCE_SHIP_BUILD_TIME, SCIENCE_SHIP_HOP_TICKS,
  MAX_SCIENCE_SHIPS, SURVEY_TICKS, ANOMALY_CHANCE, ANOMALY_TYPES,
} = require('../../server/game-engine');
const { formatGameEvent, TOAST_TYPE_MAP } = require('../public/js/toast-format');

// Helper: create a game engine with 1 player and predictable galaxy
function makeEngine(opts = {}) {
  const room = {
    id: 'test-room',
    players: new Map([[1, { name: 'Alice' }]]),
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

// Helper: give player resources to afford a science ship
function giveSciResources(engine, playerId) {
  const state = engine.playerStates.get(playerId);
  state.resources.minerals = 500;
  state.resources.alloys = 200;
}

// Helper: get player's first colony
function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

// Helper: build and complete a science ship
function buildAndCompleteScienceShip(engine, playerId) {
  giveSciResources(engine, playerId);
  const colony = getFirstColony(engine, playerId);
  engine.handleCommand(playerId, { type: 'buildScienceShip', colonyId: colony.id });
  // Fast-forward construction
  for (let i = 0; i < SCIENCE_SHIP_BUILD_TIME; i++) {
    engine.tick();
  }
  return engine._scienceShips.find(s => s.ownerId === playerId);
}

// ── Constants ──

describe('Science Ship Constants', () => {
  it('should have correct science ship cost', () => {
    assert.deepStrictEqual(SCIENCE_SHIP_COST, { minerals: 100, alloys: 50 });
  });

  it('should have correct build time (300 ticks = 30 sec)', () => {
    assert.strictEqual(SCIENCE_SHIP_BUILD_TIME, 300);
  });

  it('should have correct hop ticks (30 = 3 sec, faster than colony ships)', () => {
    assert.strictEqual(SCIENCE_SHIP_HOP_TICKS, 30);
  });

  it('should have max 3 science ships', () => {
    assert.strictEqual(MAX_SCIENCE_SHIPS, 3);
  });

  it('should have survey duration of 100 ticks (10 sec)', () => {
    assert.strictEqual(SURVEY_TICKS, 100);
  });

  it('should have 20% anomaly chance per planet', () => {
    assert.strictEqual(ANOMALY_CHANCE, 0.20);
  });

  it('should have 5 anomaly types', () => {
    assert.strictEqual(ANOMALY_TYPES.length, 5);
    const types = ANOMALY_TYPES.map(a => a.type);
    assert.ok(types.includes('ancientRuins'));
    assert.ok(types.includes('mineralDeposit'));
    assert.ok(types.includes('habitableMoon'));
    assert.ok(types.includes('precursorArtifact'));
    assert.ok(types.includes('derelictShip'));
  });
});

// ── Build Command ──

describe('buildScienceShip command', () => {
  let engine;

  beforeEach(() => {
    engine = makeEngine();
    giveSciResources(engine, 1);
  });

  it('should queue a science ship in build queue', () => {
    const colony = getFirstColony(engine, 1);
    const result = engine.handleCommand(1, { type: 'buildScienceShip', colonyId: colony.id });
    assert.ok(result.ok);
    assert.strictEqual(colony.buildQueue.length, 1);
    assert.strictEqual(colony.buildQueue[0].type, 'scienceShip');
    assert.strictEqual(colony.buildQueue[0].ticksRemaining, SCIENCE_SHIP_BUILD_TIME);
  });

  it('should deduct resources on build', () => {
    const state = engine.playerStates.get(1);
    const colony = getFirstColony(engine, 1);
    const mineralsBefore = state.resources.minerals;
    const alloysBefore = state.resources.alloys;
    engine.handleCommand(1, { type: 'buildScienceShip', colonyId: colony.id });
    assert.strictEqual(state.resources.minerals, mineralsBefore - 100);
    assert.strictEqual(state.resources.alloys, alloysBefore - 50);
  });

  it('should reject if not enough resources', () => {
    const state = engine.playerStates.get(1);
    state.resources.minerals = 10;
    state.resources.alloys = 10;
    const colony = getFirstColony(engine, 1);
    const result = engine.handleCommand(1, { type: 'buildScienceShip', colonyId: colony.id });
    assert.ok(result.error);
    assert.ok(result.error.includes('Not enough'));
  });

  it('should reject if build queue full', () => {
    const colony = getFirstColony(engine, 1);
    // Fill queue with district builds (not ships, to avoid cap)
    for (let i = 0; i < 3; i++) {
      giveSciResources(engine, 1);
      engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'generator' });
    }
    giveSciResources(engine, 1);
    const result = engine.handleCommand(1, { type: 'buildScienceShip', colonyId: colony.id });
    assert.ok(result.error);
    assert.ok(result.error.includes('queue full'));
  });

  it('should reject if at science ship cap (3)', () => {
    const colony = getFirstColony(engine, 1);
    // Build 3 science ships
    for (let i = 0; i < 3; i++) {
      giveSciResources(engine, 1);
      engine.handleCommand(1, { type: 'buildScienceShip', colonyId: colony.id });
      // Complete each one
      for (let t = 0; t < SCIENCE_SHIP_BUILD_TIME; t++) engine.tick();
    }
    assert.strictEqual(engine._scienceShips.filter(s => s.ownerId === 1).length, 3);
    giveSciResources(engine, 1);
    const result = engine.handleCommand(1, { type: 'buildScienceShip', colonyId: colony.id });
    assert.ok(result.error);
    assert.ok(result.error.includes('cap'));
  });

  it('should reject if colony not owned', () => {
    const colony = getFirstColony(engine, 1);
    const result = engine.handleCommand(999, { type: 'buildScienceShip', colonyId: colony.id });
    assert.ok(result.error);
  });

  it('should reject if missing colonyId', () => {
    const result = engine.handleCommand(1, { type: 'buildScienceShip' });
    assert.ok(result.error);
    assert.ok(result.error.includes('Missing'));
  });
});

// ── Construction Completion ──

describe('Science ship construction', () => {
  it('should spawn science ship at colony system on completion', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);
    assert.ok(ship);
    assert.strictEqual(ship.ownerId, 1);
    const colony = getFirstColony(engine, 1);
    assert.strictEqual(ship.systemId, colony.systemId);
    assert.strictEqual(ship.surveying, false);
    assert.strictEqual(ship.surveyProgress, 0);
  });

  it('should emit constructionComplete event with scienceShip type', () => {
    const engine = makeEngine();
    let foundEvent = false;
    engine.onEvent = (events) => {
      for (const event of events) {
        if (event.eventType === 'constructionComplete' && event.districtType === 'scienceShip') {
          foundEvent = true;
        }
      }
    };
    buildAndCompleteScienceShip(engine, 1);
    assert.ok(foundEvent);
  });
});

// ── Send Command ──

describe('sendScienceShip command', () => {
  let engine, ship;

  beforeEach(() => {
    engine = makeEngine();
    ship = buildAndCompleteScienceShip(engine, 1);
  });

  it('should send science ship to target system', () => {
    // Find a nearby system via hyperlanes
    const colony = getFirstColony(engine, 1);
    const adj = engine._adjacency.get(colony.systemId) || [];
    assert.ok(adj.length > 0, 'Starting system should have neighbors');
    const targetId = adj[0];

    const result = engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });
    assert.ok(result.ok);
    assert.strictEqual(ship.targetSystemId, targetId);
    assert.ok(ship.path.length > 0);
  });

  it('should reject if ship not found', () => {
    const result = engine.handleCommand(1, { type: 'sendScienceShip', shipId: 99999, targetSystemId: 0 });
    assert.ok(result.error);
  });

  it('should reject if ship already in transit', () => {
    const colony = getFirstColony(engine, 1);
    const adj = engine._adjacency.get(colony.systemId) || [];
    const targetId = adj[0];
    engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });
    // Try to send again
    const result = engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });
    assert.ok(result.error);
    assert.ok(result.error.includes('transit'));
  });

  it('should reject if system already surveyed', () => {
    const colony = getFirstColony(engine, 1);
    const adj = engine._adjacency.get(colony.systemId) || [];
    const targetId = adj[0];

    // Manually mark as surveyed
    engine._surveyedSystems.set(1, new Set([targetId]));

    const result = engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });
    assert.ok(result.error);
    assert.ok(result.error.includes('already surveyed'));
  });

  it('should reject if invalid target system', () => {
    const result = engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: 99999 });
    assert.ok(result.error);
  });

  it('should reject if missing shipId', () => {
    const result = engine.handleCommand(1, { type: 'sendScienceShip', targetSystemId: 0 });
    assert.ok(result.error);
  });
});

// ── Movement + Survey ──

describe('Science ship movement and survey', () => {
  it('should move along hyperlanes and arrive at target', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);
    const colony = getFirstColony(engine, 1);
    const adj = engine._adjacency.get(colony.systemId) || [];
    const targetId = adj[0];

    engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });
    assert.ok(ship.path.length > 0);

    // Tick until arrival
    for (let i = 0; i < SCIENCE_SHIP_HOP_TICKS; i++) {
      engine.tick();
    }

    // Ship should have arrived and started surveying
    assert.strictEqual(ship.systemId, targetId);
    assert.strictEqual(ship.surveying, true);
    assert.strictEqual(ship.surveyProgress, 0);
  });

  it('should complete survey after SURVEY_TICKS', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);
    const colony = getFirstColony(engine, 1);
    const adj = engine._adjacency.get(colony.systemId) || [];
    const targetId = adj[0];

    engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });

    // Tick through travel + survey
    for (let i = 0; i < SCIENCE_SHIP_HOP_TICKS + SURVEY_TICKS; i++) {
      engine.tick();
    }

    // System should now be surveyed
    const surveyed = engine._surveyedSystems.get(1);
    assert.ok(surveyed);
    assert.ok(surveyed.has(targetId));

    // Ship should no longer be surveying
    assert.strictEqual(ship.surveying, false);
  });

  it('should emit surveyComplete event on survey completion', () => {
    const engine = makeEngine();
    const events = [];
    engine.onEvent = (evtBatch) => {
      for (const event of evtBatch) {
        if (event.eventType === 'surveyComplete') events.push(event);
      }
    };

    const ship = buildAndCompleteScienceShip(engine, 1);
    const colony = getFirstColony(engine, 1);
    const adj = engine._adjacency.get(colony.systemId) || [];
    const targetId = adj[0];

    engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });

    for (let i = 0; i < SCIENCE_SHIP_HOP_TICKS + SURVEY_TICKS; i++) {
      engine.tick();
    }

    assert.ok(events.length > 0);
    assert.strictEqual(events[0].systemId, targetId);
    assert.ok(events[0].systemName);
    assert.ok(Array.isArray(events[0].discoveries));
  });

  it('should return to nearest colony after surveying', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);
    const colony = getFirstColony(engine, 1);
    const adj = engine._adjacency.get(colony.systemId) || [];
    const targetId = adj[0];

    engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });

    // Complete travel + survey
    for (let i = 0; i < SCIENCE_SHIP_HOP_TICKS + SURVEY_TICKS; i++) {
      engine.tick();
    }

    // Ship should have a return path back to colony
    assert.strictEqual(ship.surveying, false);
    // Ship is returning: either already at colony system or has a path
    if (ship.systemId !== colony.systemId) {
      assert.ok(ship.path.length > 0);
      assert.strictEqual(ship.targetSystemId, colony.systemId);
    }
  });
});

// ── Serialization ──

describe('Science ship serialization', () => {
  it('should include science ships in getState()', () => {
    const engine = makeEngine();
    buildAndCompleteScienceShip(engine, 1);
    engine._invalidateStateCache();
    const state = engine.getState();
    assert.ok(Array.isArray(state.scienceShips));
    assert.strictEqual(state.scienceShips.length, 1);
    assert.strictEqual(state.scienceShips[0].ownerId, 1);
  });

  it('should include science ships in getPlayerState()', () => {
    const engine = makeEngine();
    buildAndCompleteScienceShip(engine, 1);
    engine._invalidateStateCache();
    const state = engine.getPlayerState(1);
    assert.ok(Array.isArray(state.scienceShips));
    assert.strictEqual(state.scienceShips.length, 1);
  });

  it('should include surveyedSystems in getState()', () => {
    const engine = makeEngine();
    engine._surveyedSystems.set(1, new Set([5, 10]));
    engine._invalidateStateCache();
    const state = engine.getState();
    assert.ok(state.surveyedSystems);
    assert.deepStrictEqual(state.surveyedSystems[1], [5, 10]);
  });

  it('should serialize surveying state correctly', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);
    const colony = getFirstColony(engine, 1);
    const adj = engine._adjacency.get(colony.systemId) || [];
    const targetId = adj[0];

    engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });

    // Tick to arrival (start surveying)
    for (let i = 0; i < SCIENCE_SHIP_HOP_TICKS; i++) engine.tick();

    engine._invalidateStateCache();
    const state = engine.getState();
    const serialized = state.scienceShips[0];
    assert.strictEqual(serialized.surveying, true);
    assert.ok(serialized.surveyProgress >= 0);
  });
});

// ── Cancellation ──

describe('Science ship build cancellation', () => {
  it('should refund 50% resources when cancelled from build queue', () => {
    const engine = makeEngine();
    giveSciResources(engine, 1);
    const state = engine.playerStates.get(1);
    const colony = getFirstColony(engine, 1);

    engine.handleCommand(1, { type: 'buildScienceShip', colonyId: colony.id });
    const mineralsAfterBuild = state.resources.minerals;
    const alloysAfterBuild = state.resources.alloys;

    const qItem = colony.buildQueue[0];
    engine.handleCommand(1, { type: 'demolish', colonyId: colony.id, districtId: qItem.id });

    assert.strictEqual(state.resources.minerals, mineralsAfterBuild + 50); // 50% of 100
    assert.strictEqual(state.resources.alloys, alloysAfterBuild + 25); // 50% of 50
    assert.strictEqual(colony.buildQueue.length, 0);
  });
});

// ── Toast Formatting ──

describe('Science ship toast formatting', () => {
  it('should format scienceShip constructionComplete', () => {
    const text = formatGameEvent({
      eventType: 'constructionComplete',
      districtType: 'scienceShip',
      colonyName: 'Alpha',
    });
    assert.ok(text.includes('Science Ship'));
    assert.ok(text.includes('Alpha'));
  });

  it('should format surveyComplete event', () => {
    const text = formatGameEvent({
      eventType: 'surveyComplete',
      systemName: 'Vega',
      discoveries: [{ anomalyLabel: 'Ancient Ruins' }],
    });
    assert.ok(text.includes('Vega'));
    assert.ok(text.includes('1 anomaly'));
  });

  it('should format surveyComplete with no anomalies', () => {
    const text = formatGameEvent({
      eventType: 'surveyComplete',
      systemName: 'Vega',
      discoveries: [],
    });
    assert.ok(text.includes('Vega'));
    assert.ok(!text.includes('anomal'));
  });

  it('should format anomalyDiscovered event', () => {
    const text = formatGameEvent({
      eventType: 'anomalyDiscovered',
      systemName: 'Sirius',
      anomalyLabel: 'Mineral Deposit',
    });
    assert.ok(text.includes('Mineral Deposit'));
    assert.ok(text.includes('Sirius'));
  });

  it('should have correct toast types for new events', () => {
    assert.strictEqual(TOAST_TYPE_MAP.surveyComplete, 'positive');
    assert.strictEqual(TOAST_TYPE_MAP.anomalyDiscovered, 'positive');
  });
});
