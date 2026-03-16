const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  EXPEDITION_MIN_SURVEYS,
  EXPEDITION_TYPES,
  SURVEY_TICKS,
} = require('../../server/game-engine');

function createEngine() {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  players.set('p2', { name: 'Player 2' });
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  return new GameEngine(room, { tickRate: 10 });
}

// Give a player a science ship idle at a specific system
function addScienceShip(engine, playerId, systemId) {
  const id = engine._nextId();
  const ship = {
    id, ownerId: playerId, systemId,
    targetSystemId: null, path: [], hopProgress: 0,
    surveying: false, surveyProgress: 0, autoSurvey: false,
    expedition: null, expeditionProgress: 0, expeditionTicks: 0,
  };
  engine._scienceShips.push(ship);
  if (!engine._scienceShipsByPlayer.has(playerId)) {
    engine._scienceShipsByPlayer.set(playerId, []);
  }
  engine._scienceShipsByPlayer.get(playerId).push(ship);
  return ship;
}

// Give a player enough surveys to unlock expeditions
function grantSurveys(engine, playerId, count) {
  if (!engine._surveyedSystems.has(playerId)) {
    engine._surveyedSystems.set(playerId, new Set());
  }
  const surveySet = engine._surveyedSystems.get(playerId);
  // Add fake system IDs — just need count to pass threshold
  for (let i = 0; i < count; i++) {
    surveySet.add(9000 + i);
  }
}

describe('Expeditions — constants', () => {
  it('should export expedition constants', () => {
    assert.strictEqual(EXPEDITION_MIN_SURVEYS, 5);
    assert.ok(EXPEDITION_TYPES.deepSpaceProbe);
    assert.ok(EXPEDITION_TYPES.precursorSignal);
    assert.ok(EXPEDITION_TYPES.wormholeMapping);
  });

  it('should have correct expedition definitions', () => {
    assert.strictEqual(EXPEDITION_TYPES.deepSpaceProbe.ticks, 600);
    assert.strictEqual(EXPEDITION_TYPES.deepSpaceProbe.vp, 3);
    assert.strictEqual(EXPEDITION_TYPES.deepSpaceProbe.risk, false);

    assert.strictEqual(EXPEDITION_TYPES.precursorSignal.ticks, 900);
    assert.strictEqual(EXPEDITION_TYPES.precursorSignal.vp, 5);
    assert.strictEqual(EXPEDITION_TYPES.precursorSignal.risk, true);
    assert.strictEqual(EXPEDITION_TYPES.precursorSignal.failChance, 0.3);

    assert.strictEqual(EXPEDITION_TYPES.wormholeMapping.ticks, 600);
    assert.strictEqual(EXPEDITION_TYPES.wormholeMapping.vp, 2);
    assert.strictEqual(EXPEDITION_TYPES.wormholeMapping.risk, false);
  });
});

describe('Expeditions — startExpedition command', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should start a deep space probe expedition', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    const result = engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'deepSpaceProbe',
    });
    assert.ok(result.ok, `Expected ok but got: ${result.error}`);
    assert.strictEqual(ship.expedition, 'deepSpaceProbe');
    assert.strictEqual(ship.expeditionProgress, 0);
    assert.strictEqual(ship.expeditionTicks, 600);
  });

  it('should reject if fewer than 5 surveys', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 4);

    const result = engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'deepSpaceProbe',
    });
    assert.ok(result.error);
    assert.ok(result.error.includes('5 surveys'));
  });

  it('should reject unknown expedition type', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    const result = engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'bogusExpedition',
    });
    assert.ok(result.error);
    assert.ok(result.error.includes('Unknown expedition'));
  });

  it('should reject if ship not found', () => {
    grantSurveys(engine, 'p1', 5);
    const result = engine.handleCommand('p1', {
      type: 'startExpedition', shipId: 'nonexistent', expeditionType: 'deepSpaceProbe',
    });
    assert.ok(result.error);
    assert.ok(result.error.includes('not found'));
  });

  it('should reject if ship is in transit', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);
    ship.path = [1, 2]; // simulate in-transit

    const result = engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'deepSpaceProbe',
    });
    assert.ok(result.error);
    assert.ok(result.error.includes('transit'));
  });

  it('should reject if ship is currently surveying', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);
    ship.surveying = true;

    const result = engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'deepSpaceProbe',
    });
    assert.ok(result.error);
    assert.ok(result.error.includes('surveying'));
  });

  it('should reject if ship is already on an expedition', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);
    ship.expedition = 'deepSpaceProbe';

    const result = engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'wormholeMapping',
    });
    assert.ok(result.error);
    assert.ok(result.error.includes('already on an expedition'));
  });

  it('should reject missing shipId', () => {
    grantSurveys(engine, 'p1', 5);
    const result = engine.handleCommand('p1', {
      type: 'startExpedition', expeditionType: 'deepSpaceProbe',
    });
    assert.ok(result.error);
  });

  it('should reject missing expeditionType', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);
    const result = engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id,
    });
    assert.ok(result.error);
  });

  it('should disable autoSurvey when expedition starts', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    ship.autoSurvey = true;
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'deepSpaceProbe',
    });
    assert.strictEqual(ship.autoSurvey, false);
  });
});

describe('Expeditions — tick processing', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should progress expedition each tick', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'wormholeMapping',
    });

    // Tick 10 times
    for (let i = 0; i < 10; i++) engine.tick();
    assert.strictEqual(ship.expeditionProgress, 10);
    assert.strictEqual(ship.expedition, 'wormholeMapping');
  });

  it('should complete expedition after full duration and award VP', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'wormholeMapping',
    });

    // Tick 600 times to complete
    for (let i = 0; i < 600; i++) engine.tick();

    assert.strictEqual(ship.expedition, null, 'Expedition should be cleared after completion');
    assert.strictEqual(ship.expeditionProgress, 0);

    // Check VP awarded
    const vp = engine._expeditionVP.get('p1');
    assert.strictEqual(vp, 2, 'Wormhole Mapping awards +2 VP');
    assert.strictEqual(engine._completedExpeditions.get('p1'), 1);
  });

  it('should include expedition VP in VP breakdown', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'deepSpaceProbe',
    });

    for (let i = 0; i < 600; i++) engine.tick();

    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.expeditionVP, 3);
    assert.strictEqual(breakdown.expeditionsCompleted, 1);
  });

  it('should not move ship while on expedition', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);
    const originalSystem = ship.systemId;

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'deepSpaceProbe',
    });

    for (let i = 0; i < 50; i++) engine.tick();
    assert.strictEqual(ship.systemId, originalSystem, 'Ship should stay at same system during expedition');
  });
});

describe('Expeditions — deep space probe (no risk)', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should always succeed and award 3 VP', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'deepSpaceProbe',
    });

    for (let i = 0; i < 600; i++) engine.tick();

    assert.strictEqual(engine._expeditionVP.get('p1'), 3);
  });
});

describe('Expeditions — multiple expeditions', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should accumulate VP from multiple expeditions', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    // First expedition
    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'wormholeMapping',
    });
    for (let i = 0; i < 600; i++) engine.tick();

    // Second expedition on same ship (now idle)
    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'deepSpaceProbe',
    });
    for (let i = 0; i < 600; i++) engine.tick();

    assert.strictEqual(engine._expeditionVP.get('p1'), 5); // 2 + 3
    assert.strictEqual(engine._completedExpeditions.get('p1'), 2);
  });
});

describe('Expeditions — serialization', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should include expedition state in getState serialization', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'deepSpaceProbe',
    });

    const state = engine.getState();
    const serialized = state.scienceShips.find(s => s.id === ship.id);
    assert.ok(serialized);
    assert.strictEqual(serialized.expedition, 'deepSpaceProbe');
    assert.strictEqual(serialized.expeditionTicks, 600);
  });

  it('should include expedition state in getPlayerState serialization', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'wormholeMapping',
    });

    const state = engine.getPlayerState('p1');
    const serialized = state.scienceShips.find(s => s.id === ship.id);
    assert.ok(serialized);
    assert.strictEqual(serialized.expedition, 'wormholeMapping');
    assert.strictEqual(serialized.expeditionTicks, 600);
  });
});

describe('Expeditions — events', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should emit expeditionStarted event', () => {
    const events = [];
    engine.onEvent = (batch) => events.push(...batch);

    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'deepSpaceProbe',
    });
    // Events are flushed on tick
    engine.tick();

    const started = events.find(e => e.eventType === 'expeditionStarted');
    assert.ok(started, 'Should emit expeditionStarted event');
    assert.strictEqual(started.expeditionType, 'deepSpaceProbe');
    assert.strictEqual(started.name, 'Deep Space Probe');
  });

  it('should emit expeditionComplete event on completion', () => {
    const events = [];
    engine.onEvent = (batch) => events.push(...batch);

    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'wormholeMapping',
    });

    for (let i = 0; i < 600; i++) engine.tick();

    const completed = events.find(e => e.eventType === 'expeditionComplete');
    assert.ok(completed, 'Should emit expeditionComplete event');
    assert.strictEqual(completed.expeditionType, 'wormholeMapping');
    assert.strictEqual(completed.success, true);
    assert.strictEqual(completed.vp, 2);
  });
});
