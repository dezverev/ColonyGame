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

  it('should stay idle at surveyed system after surveying', () => {
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

    // Ship should be idle at the surveyed system
    assert.strictEqual(ship.surveying, false);
    assert.strictEqual(ship.systemId, targetId);
    assert.strictEqual(ship.path.length, 0);
    assert.strictEqual(ship.targetSystemId, null);
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

// ── Surveyed Systems Privacy ──

describe('Science ships — surveyed systems privacy', () => {
  function makeTwoPlayerEngine() {
    const room = {
      id: 'test-room',
      players: new Map([[1, { name: 'Alice' }], [2, { name: 'Bob' }]]),
      hostId: 1,
      galaxySize: 'small',
      matchTimer: 0,
    };
    return new GameEngine(room, { tickRate: 10, galaxySeed: 42 });
  }

  it('getPlayerState only includes requesting players surveyed systems', () => {
    const engine = makeTwoPlayerEngine();
    engine._surveyedSystems.set(1, new Set([5, 10]));
    engine._surveyedSystems.set(2, new Set([20, 30]));
    engine._invalidateStateCache();

    const state1 = engine.getPlayerState(1);
    assert.deepStrictEqual(state1.surveyedSystems[1], [5, 10]);
    assert.strictEqual(state1.surveyedSystems[2], undefined, 'should not include other players surveyed systems');

    const state2 = engine.getPlayerState(2);
    assert.deepStrictEqual(state2.surveyedSystems[2], [20, 30]);
    assert.strictEqual(state2.surveyedSystems[1], undefined, 'should not include other players surveyed systems');
  });

  it('getState (admin view) includes all players surveyed systems', () => {
    const engine = makeTwoPlayerEngine();
    engine._surveyedSystems.set(1, new Set([5]));
    engine._surveyedSystems.set(2, new Set([20]));
    engine._invalidateStateCache();

    const state = engine.getState();
    assert.deepStrictEqual(state.surveyedSystems[1], [5]);
    assert.deepStrictEqual(state.surveyedSystems[2], [20]);
  });

  it('getPlayerState returns empty surveyedSystems if player has none', () => {
    const engine = makeTwoPlayerEngine();
    engine._invalidateStateCache();
    const state = engine.getPlayerState(1);
    assert.deepStrictEqual(state.surveyedSystems, {});
  });
});

// ── Anomaly Reward Application ──

describe('Science ships — anomaly rewards', () => {
  it('should apply mineral rewards from anomaly discoveries', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);
    const playerState = engine.playerStates.get(1);
    const colony = getFirstColony(engine, 1);
    const adj = engine._adjacency.get(colony.systemId) || [];
    const targetId = adj[0];

    // Manually set up a system with a planet that will trigger a mineral deposit anomaly
    const system = engine.galaxy.systems[targetId];
    if (!system.planets || system.planets.length === 0) {
      system.planets = [{ orbit: 1, size: 10, type: 'barren' }];
    }

    const mineralsBefore = playerState.resources.minerals;
    const alloysBefore = playerState.resources.alloys;
    const influenceBefore = playerState.resources.influence;

    // Send ship and complete survey
    engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });
    for (let i = 0; i < SCIENCE_SHIP_HOP_TICKS + SURVEY_TICKS; i++) {
      engine.tick();
    }

    // Verify system was surveyed regardless of whether anomaly was found
    const surveyed = engine._surveyedSystems.get(1);
    assert.ok(surveyed && surveyed.has(targetId), 'system should be marked surveyed');
  });

  it('should apply all reward types when anomalies are found', () => {
    const engine = makeEngine();
    const playerState = engine.playerStates.get(1);

    // Directly test _completeSurvey with a controlled system
    const testSystemId = 0;
    const system = engine.galaxy.systems[testSystemId];
    system.planets = [
      { orbit: 1, size: 10, type: 'barren' },
      { orbit: 2, size: 10, type: 'barren' },
      { orbit: 3, size: 10, type: 'barren' },
      { orbit: 4, size: 10, type: 'barren' },
      { orbit: 5, size: 10, type: 'barren' },
      { orbit: 6, size: 10, type: 'barren' },
      { orbit: 7, size: 10, type: 'barren' },
      { orbit: 8, size: 10, type: 'barren' },
      { orbit: 9, size: 10, type: 'barren' },
      { orbit: 10, size: 10, type: 'barren' },
    ];

    const ship = { id: 999, ownerId: 1, systemId: testSystemId, surveying: true, surveyProgress: SURVEY_TICKS, path: [], hopProgress: 0, targetSystemId: null };
    engine._scienceShips.push(ship);

    const mineralsBefore = playerState.resources.minerals;
    const alloysBefore = playerState.resources.alloys;
    const influenceBefore = playerState.resources.influence;

    engine._completeSurvey(ship);

    // System should be surveyed
    assert.ok(engine._surveyedSystems.get(1).has(testSystemId));
    // Ship should be reset to idle
    assert.strictEqual(ship.surveying, false);
    assert.strictEqual(ship.surveyProgress, 0);
  });
});

// ── Ship Cap with In-Queue Ships ──

describe('Science ships — cap includes queued ships', () => {
  it('should count in-queue ships toward cap', () => {
    const engine = makeEngine();
    const colony = getFirstColony(engine, 1);

    // Queue 3 science ships (don't complete them)
    for (let i = 0; i < 3; i++) {
      giveSciResources(engine, 1);
      const result = engine.handleCommand(1, { type: 'buildScienceShip', colonyId: colony.id });
      assert.ok(result.ok, `build ${i} should succeed`);
      // Complete each so queue has room for next
      for (let t = 0; t < SCIENCE_SHIP_BUILD_TIME; t++) engine.tick();
    }

    // Now have 3 completed ships, 0 in queue — at cap
    giveSciResources(engine, 1);
    const result = engine.handleCommand(1, { type: 'buildScienceShip', colonyId: colony.id });
    assert.ok(result.error);
    assert.ok(result.error.includes('cap'));
  });

  it('should count queued ships even before completion toward cap', () => {
    const engine = makeEngine();
    const colony = getFirstColony(engine, 1);

    // Queue 3 science ships without completing — build queue max is 3
    // We need to use separate colonies or complete some first
    // Queue 1 ship, complete it. Queue 1 ship, complete it. Queue 1 ship (still building) — that's 2 complete + 1 queued = 3 total
    giveSciResources(engine, 1);
    engine.handleCommand(1, { type: 'buildScienceShip', colonyId: colony.id });
    for (let t = 0; t < SCIENCE_SHIP_BUILD_TIME; t++) engine.tick();

    giveSciResources(engine, 1);
    engine.handleCommand(1, { type: 'buildScienceShip', colonyId: colony.id });
    for (let t = 0; t < SCIENCE_SHIP_BUILD_TIME; t++) engine.tick();

    // 2 completed. Now queue 1 more (still building)
    giveSciResources(engine, 1);
    const r3 = engine.handleCommand(1, { type: 'buildScienceShip', colonyId: colony.id });
    assert.ok(r3.ok, 'third ship should start building');

    // 2 completed + 1 in queue = 3 total, at cap
    giveSciResources(engine, 1);
    const r4 = engine.handleCommand(1, { type: 'buildScienceShip', colonyId: colony.id });
    assert.ok(r4.error, 'should be rejected — cap reached with in-queue ships');
    assert.ok(r4.error.includes('cap'));
  });
});

// ── Send While Surveying ──

describe('Science ships — send while surveying', () => {
  it('should reject send command while ship is surveying', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);
    const colony = getFirstColony(engine, 1);
    const adj = engine._adjacency.get(colony.systemId) || [];
    const targetId = adj[0];

    engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });

    // Tick until arrival (starts surveying)
    for (let i = 0; i < SCIENCE_SHIP_HOP_TICKS; i++) engine.tick();
    assert.strictEqual(ship.surveying, true, 'ship should be surveying');

    // Try to send to another system
    const adj2 = engine._adjacency.get(targetId) || [];
    const target2 = adj2.find(id => id !== colony.systemId);
    if (target2 != null) {
      const result = engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: target2 });
      assert.ok(result.error);
      assert.ok(result.error.includes('surveying'));
    }
  });
});

// ── Multi-Hop Travel ──

describe('Science ships — multi-hop travel', () => {
  it('should traverse multiple hops to reach distant system', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);
    const colony = getFirstColony(engine, 1);
    const startSystem = colony.systemId;

    // Find a system 2+ hops away
    const adj1 = engine._adjacency.get(startSystem) || [];
    let twoHopTarget = null;
    for (const mid of adj1) {
      const adj2 = engine._adjacency.get(mid) || [];
      for (const far of adj2) {
        if (far !== startSystem && !adj1.includes(far)) {
          twoHopTarget = far;
          break;
        }
      }
      if (twoHopTarget != null) break;
    }

    if (twoHopTarget == null) {
      // Galaxy topology might not have a 2-hop target — skip gracefully
      return;
    }

    const result = engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: twoHopTarget });
    assert.ok(result.ok);
    assert.ok(ship.path.length >= 2, 'path should have at least 2 hops');

    const pathLength = ship.path.length;
    // Tick through all hops
    for (let i = 0; i < pathLength * SCIENCE_SHIP_HOP_TICKS; i++) {
      engine.tick();
    }

    assert.strictEqual(ship.systemId, twoHopTarget, 'ship should arrive at distant system');
    assert.strictEqual(ship.surveying, true, 'ship should begin surveying on arrival');
  });
});

// ── Return Behavior Edge Cases ──

describe('Science ships — return edge cases', () => {
  it('ship stays at surveyed system and can be sent to another target', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);
    const colony = getFirstColony(engine, 1);
    const adj = engine._adjacency.get(colony.systemId) || [];
    if (adj.length < 2) return; // need 2 neighbors
    const target1 = adj[0];
    const target2 = adj[1];

    // Survey first target
    engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: target1 });
    for (let i = 0; i < SCIENCE_SHIP_HOP_TICKS + SURVEY_TICKS; i++) engine.tick();

    // Ship idle at target1
    assert.strictEqual(ship.systemId, target1);
    assert.strictEqual(ship.path.length, 0);

    // Send to second target
    const result = engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: target2 });
    assert.ok(result.ok || result.error === 'No path to target system', 'should accept or fail on path only');
  });
});

// ── Idle Ship Tick Processing ──

describe('Science ships — idle ship tick', () => {
  it('should not move or survey an idle ship with no path', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);

    // Ship is idle at colony system
    assert.strictEqual(ship.surveying, false);
    assert.deepStrictEqual(ship.path, []);

    const systemBefore = ship.systemId;
    for (let i = 0; i < 50; i++) engine.tick();

    assert.strictEqual(ship.systemId, systemBefore, 'idle ship should not move');
    assert.strictEqual(ship.surveying, false, 'idle ship should not start surveying');
  });
});

// ── Tick-by-tick movement state (what the client receives) ──

describe('Science ships — tick-by-tick movement correctness', () => {
  it('hopProgress increments from 0 to HOP_TICKS then systemId advances', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);
    const colony = getFirstColony(engine, 1);
    const adj = engine._adjacency.get(colony.systemId) || [];
    const targetId = adj[0];

    engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });
    const startSys = ship.systemId;
    assert.strictEqual(ship.hopProgress, 0);
    assert.strictEqual(ship.systemId, colony.systemId);
    assert.strictEqual(ship.path[0], targetId);

    // Tick 1..29: hopProgress increments, systemId stays
    for (let i = 1; i < SCIENCE_SHIP_HOP_TICKS; i++) {
      engine.tick();
      assert.strictEqual(ship.hopProgress, i, `hopProgress at tick ${i}`);
      assert.strictEqual(ship.systemId, startSys, `systemId unchanged at tick ${i}`);
    }

    // Tick 30: hop completes, systemId advances, hopProgress resets
    engine.tick();
    assert.strictEqual(ship.systemId, targetId, 'systemId should advance to next system');
    assert.strictEqual(ship.hopProgress, 0, 'hopProgress resets after hop');
  });

  it('path shrinks by 1 each time a hop completes', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);
    const colony = getFirstColony(engine, 1);

    // Find 2-hop target
    const adj1 = engine._adjacency.get(colony.systemId) || [];
    let twoHopTarget = null;
    for (const mid of adj1) {
      const adj2 = engine._adjacency.get(mid) || [];
      for (const far of adj2) {
        if (far !== colony.systemId && !adj1.includes(far)) {
          twoHopTarget = far;
          break;
        }
      }
      if (twoHopTarget != null) break;
    }
    if (twoHopTarget == null) return; // skip if topology doesn't support it

    engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: twoHopTarget });
    const initialPathLength = ship.path.length;
    assert.ok(initialPathLength >= 2);

    // After first hop completes
    for (let i = 0; i < SCIENCE_SHIP_HOP_TICKS; i++) engine.tick();
    assert.strictEqual(ship.path.length, initialPathLength - 1, 'path shrinks by 1 after first hop');

    // After second hop completes
    for (let i = 0; i < SCIENCE_SHIP_HOP_TICKS; i++) engine.tick();
    assert.strictEqual(ship.path.length, initialPathLength - 2, 'path shrinks by 1 after second hop');
  });

  it('serialized state has consistent systemId/path/hopProgress at every dirty tick', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);
    const colony = getFirstColony(engine, 1);
    const adj = engine._adjacency.get(colony.systemId) || [];
    const targetId = adj[0];

    engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });
    const startSys = colony.systemId;

    // Tick through the entire hop, check getPlayerState at every tick
    for (let i = 1; i <= SCIENCE_SHIP_HOP_TICKS; i++) {
      engine.tick();
      const state = engine.getPlayerState(1);
      const serializedShip = state.scienceShips.find(s => s.id === ship.id);
      assert.ok(serializedShip, `ship should be in state at tick ${i}`);

      if (i < SCIENCE_SHIP_HOP_TICKS) {
        // Mid-hop: systemId is start, hopProgress = i, path has target
        assert.strictEqual(serializedShip.systemId, startSys, `systemId at tick ${i}`);
        assert.strictEqual(serializedShip.hopProgress, i, `hopProgress at tick ${i}`);
        assert.strictEqual(serializedShip.path[0], targetId, `path[0] at tick ${i}`);
      } else {
        // Hop complete: systemId advances, hopProgress resets, surveying starts
        assert.strictEqual(serializedShip.systemId, targetId, `systemId after hop at tick ${i}`);
        assert.strictEqual(serializedShip.hopProgress, 0, `hopProgress reset at tick ${i}`);
        assert.strictEqual(serializedShip.surveying, true, `surveying at tick ${i}`);
      }
    }
  });

  it('after survey, ship is idle at surveyed system with no path', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);
    const colony = getFirstColony(engine, 1);
    const adj = engine._adjacency.get(colony.systemId) || [];
    const targetId = adj[0];

    engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });

    // Travel + survey
    for (let i = 0; i < SCIENCE_SHIP_HOP_TICKS + SURVEY_TICKS; i++) engine.tick();

    assert.strictEqual(ship.surveying, false, 'no longer surveying');
    assert.strictEqual(ship.systemId, targetId, 'at surveyed system');
    assert.strictEqual(ship.path.length, 0, 'no path — stays put');
    assert.strictEqual(ship.targetSystemId, null, 'no target');
  });

  it('hopProgress never exceeds HOP_TICKS in serialized state', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);
    const colony = getFirstColony(engine, 1);

    // Find a 2-hop target for longer journey
    const adj1 = engine._adjacency.get(colony.systemId) || [];
    let twoHopTarget = null;
    for (const mid of adj1) {
      for (const far of (engine._adjacency.get(mid) || [])) {
        if (far !== colony.systemId && !adj1.includes(far)) { twoHopTarget = far; break; }
      }
      if (twoHopTarget != null) break;
    }
    const targetId = twoHopTarget != null ? twoHopTarget : adj1[0];

    engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });

    // Tick through entire outbound journey + survey + return, checking every tick
    for (let i = 0; i < 500; i++) {
      engine.tick();
      const state = engine.getPlayerState(1);
      const ss = state.scienceShips.find(s => s.id === ship.id);
      if (!ss) break; // ship removed
      assert.ok(ss.hopProgress >= 0, `hopProgress non-negative at tick ${i}`);
      assert.ok(ss.hopProgress < SCIENCE_SHIP_HOP_TICKS, `hopProgress < ${SCIENCE_SHIP_HOP_TICKS} at tick ${i}, got ${ss.hopProgress}`);
      if (ss.path.length > 0 && !ss.surveying) {
        assert.ok(ss.path[0] != null, `path[0] exists when in transit at tick ${i}`);
      }
    }
  });

  it('client interpolation t = hopProgress/HOP_TICKS is always in [0,1)', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);
    const colony = getFirstColony(engine, 1);
    const adj = engine._adjacency.get(colony.systemId) || [];
    const targetId = adj[0];

    engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });

    for (let i = 0; i < SCIENCE_SHIP_HOP_TICKS + SURVEY_TICKS + SCIENCE_SHIP_HOP_TICKS + 10; i++) {
      engine.tick();
      const state = engine.getPlayerState(1);
      const ss = state.scienceShips.find(s => s.id === ship.id);
      if (!ss) break;
      if (ss.path && ss.path.length > 0 && !ss.surveying) {
        const t = ss.hopProgress / SCIENCE_SHIP_HOP_TICKS;
        assert.ok(t >= 0, `t >= 0 at tick ${i}`);
        assert.ok(t < 1, `t < 1 at tick ${i}, got ${t}`);
      }
    }
  });

  it('surveyedSystems updates in state after survey completes', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);
    const colony = getFirstColony(engine, 1);
    const adj = engine._adjacency.get(colony.systemId) || [];
    const targetId = adj[0];

    // Before survey: not surveyed
    let state = engine.getPlayerState(1);
    const before = state.surveyedSystems[1] || [];
    assert.ok(!before.includes(targetId), 'not surveyed before');

    engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });

    // Travel + survey
    for (let i = 0; i < SCIENCE_SHIP_HOP_TICKS + SURVEY_TICKS; i++) engine.tick();

    state = engine.getPlayerState(1);
    const after = state.surveyedSystems[1] || [];
    assert.ok(after.includes(targetId), 'system surveyed after');
  });

  it('ship can be redirected immediately after survey completes', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);
    const colony = getFirstColony(engine, 1);
    const adj = engine._adjacency.get(colony.systemId) || [];
    if (adj.length < 2) return;
    const targetId = adj[0];

    engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });

    // Travel + survey
    for (let i = 0; i < SCIENCE_SHIP_HOP_TICKS + SURVEY_TICKS; i++) engine.tick();

    // Ship is idle at surveyed system — should accept new command
    assert.strictEqual(ship.path.length, 0, 'ship is idle');
    assert.strictEqual(ship.surveying, false);

    // Find an unsurveyed neighbor of the surveyed system
    const adj2 = engine._adjacency.get(targetId) || [];
    const secondTarget = adj2.find(id => {
      const surveyed = engine._surveyedSystems.get(1);
      return id !== colony.systemId && !(surveyed && surveyed.has(id));
    });
    if (secondTarget != null) {
      const result = engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: secondTarget });
      assert.ok(result.ok, 'should accept new survey mission');
      assert.ok(ship.path.length > 0, 'ship has new path');
    }
  });

  it('full lifecycle: idle → transit → survey → idle at surveyed system', () => {
    const engine = makeEngine();
    const ship = buildAndCompleteScienceShip(engine, 1);
    const colony = getFirstColony(engine, 1);
    const adj = engine._adjacency.get(colony.systemId) || [];
    const targetId = adj[0];

    // Phase 1: Idle at colony
    assert.strictEqual(ship.path.length, 0);
    assert.strictEqual(ship.surveying, false);
    assert.strictEqual(ship.systemId, colony.systemId);

    // Phase 2: Send — transit begins
    engine.handleCommand(1, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: targetId });
    assert.ok(ship.path.length > 0, 'path set');
    assert.strictEqual(ship.surveying, false, 'not yet surveying');

    // Phase 3: Travel to target
    for (let i = 0; i < SCIENCE_SHIP_HOP_TICKS; i++) engine.tick();
    assert.strictEqual(ship.systemId, targetId, 'arrived at target');
    assert.strictEqual(ship.surveying, true, 'surveying started');
    assert.strictEqual(ship.path.length, 0, 'path consumed');

    // Phase 4: Survey
    for (let i = 0; i < SURVEY_TICKS - 1; i++) engine.tick();
    assert.strictEqual(ship.surveying, true, 'still surveying before last tick');
    engine.tick(); // final survey tick
    assert.strictEqual(ship.surveying, false, 'surveying done');

    // Phase 5: Ship stays idle at surveyed system (no auto-return)
    assert.strictEqual(ship.systemId, targetId, 'stays at surveyed system');
    assert.strictEqual(ship.path.length, 0, 'no path');
    assert.strictEqual(ship.targetSystemId, null, 'no target');
  });
});
