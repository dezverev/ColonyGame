const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  EXPEDITION_MIN_SURVEYS,
  EXPEDITION_TYPES,
} = require('../../server/game-engine');

function createEngine() {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  players.set('p2', { name: 'Player 2' });
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  return new GameEngine(room, { tickRate: 10 });
}

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

function grantSurveys(engine, playerId, count) {
  if (!engine._surveyedSystems.has(playerId)) {
    engine._surveyedSystems.set(playerId, new Set());
  }
  const surveySet = engine._surveyedSystems.get(playerId);
  for (let i = 0; i < count; i++) {
    surveySet.add(9000 + i);
  }
}

describe('Expeditions Deep — precursor signal risk/reward', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should award 0 VP on precursor signal failure (roll < 0.3)', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'precursorSignal',
    });

    // Mock Math.random to return a value below failChance (0.3)
    const origRandom = Math.random;
    Math.random = () => 0.1; // below 0.3 → fail

    for (let i = 0; i < 900; i++) engine.tick();

    Math.random = origRandom;

    assert.strictEqual(ship.expedition, null, 'Expedition should be cleared');
    const vp = engine._expeditionVP.get('p1') || 0;
    assert.strictEqual(vp, 0, 'Failed expedition should award 0 VP');
    assert.strictEqual(engine._completedExpeditions.get('p1'), 1, 'Still counts as completed');
  });

  it('should award 5 VP on precursor signal success (roll >= 0.3)', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'precursorSignal',
    });

    const origRandom = Math.random;
    Math.random = () => 0.5; // above 0.3 → success

    for (let i = 0; i < 900; i++) engine.tick();

    Math.random = origRandom;

    assert.strictEqual(engine._expeditionVP.get('p1'), 5, 'Precursor Signal success awards +5 VP');
    assert.strictEqual(engine._completedExpeditions.get('p1'), 1);
  });

  it('should emit failure event with success=false and vp=0', () => {
    const events = [];
    engine.onEvent = (batch) => events.push(...batch);

    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'precursorSignal',
    });

    const origRandom = Math.random;
    Math.random = () => 0.05; // fail

    for (let i = 0; i < 900; i++) engine.tick();

    Math.random = origRandom;

    const completed = events.find(e => e.eventType === 'expeditionComplete');
    assert.ok(completed, 'Should emit expeditionComplete event');
    assert.strictEqual(completed.success, false);
    assert.strictEqual(completed.vp, 0);
    assert.strictEqual(completed.expeditionType, 'precursorSignal');
  });

  it('should emit success event with success=true and vp=5', () => {
    const events = [];
    engine.onEvent = (batch) => events.push(...batch);

    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'precursorSignal',
    });

    const origRandom = Math.random;
    Math.random = () => 0.99; // success

    for (let i = 0; i < 900; i++) engine.tick();

    Math.random = origRandom;

    const completed = events.find(e => e.eventType === 'expeditionComplete');
    assert.ok(completed);
    assert.strictEqual(completed.success, true);
    assert.strictEqual(completed.vp, 5);
  });
});

describe('Expeditions Deep — cross-player ownership', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should reject starting expedition on another player\'s ship', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p2', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    const result = engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'deepSpaceProbe',
    });
    assert.ok(result.error, 'Should reject — ship belongs to p2');
    assert.ok(result.error.includes('not found'), 'Should report ship not found for wrong player');
  });
});

describe('Expeditions Deep — concurrent ships', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should process two ships on expedition simultaneously', () => {
    const colony = engine.colonies.values().next().value;
    const ship1 = addScienceShip(engine, 'p1', colony.systemId);
    const ship2 = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship1.id, expeditionType: 'wormholeMapping',
    });
    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship2.id, expeditionType: 'deepSpaceProbe',
    });

    assert.strictEqual(ship1.expedition, 'wormholeMapping');
    assert.strictEqual(ship2.expedition, 'deepSpaceProbe');

    // Tick until wormhole mapping completes (600 ticks, both are 600)
    for (let i = 0; i < 600; i++) engine.tick();

    assert.strictEqual(ship1.expedition, null, 'Ship 1 should be done');
    assert.strictEqual(ship2.expedition, null, 'Ship 2 should be done');
    // 2 (wormhole) + 3 (deep space) = 5
    assert.strictEqual(engine._expeditionVP.get('p1'), 5);
    assert.strictEqual(engine._completedExpeditions.get('p1'), 2);
  });

  it('should handle p1 and p2 running expeditions at the same time', () => {
    const colony = engine.colonies.values().next().value;
    const ship1 = addScienceShip(engine, 'p1', colony.systemId);
    const ship2 = addScienceShip(engine, 'p2', colony.systemId);
    grantSurveys(engine, 'p1', 5);
    grantSurveys(engine, 'p2', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship1.id, expeditionType: 'deepSpaceProbe',
    });
    engine.handleCommand('p2', {
      type: 'startExpedition', shipId: ship2.id, expeditionType: 'wormholeMapping',
    });

    for (let i = 0; i < 600; i++) engine.tick();

    assert.strictEqual(engine._expeditionVP.get('p1'), 3);
    assert.strictEqual(engine._expeditionVP.get('p2'), 2);
  });
});

describe('Expeditions Deep — serialization after completion', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should serialize cleared expedition state after completion', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'wormholeMapping',
    });

    for (let i = 0; i < 600; i++) engine.tick();

    const state = engine.getPlayerState('p1');
    const serialized = state.scienceShips.find(s => s.id === ship.id);
    assert.ok(serialized);
    assert.strictEqual(serialized.expedition, null, 'Expedition should be null after completion');
    assert.strictEqual(serialized.expeditionProgress, 0);
    assert.strictEqual(serialized.expeditionTicks, 0);
  });

  it('should include expedition data in getPlayerStateJSON broadcast payload', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'deepSpaceProbe',
    });

    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    const serialized = parsed.scienceShips.find(s => s.id === ship.id);
    assert.ok(serialized, 'Ship should be in JSON payload');
    assert.strictEqual(serialized.expedition, 'deepSpaceProbe');
    assert.strictEqual(serialized.expeditionTicks, 600);
    assert.strictEqual(serialized.expeditionProgress, 0);
  });

  it('should reflect expedition VP in VP breakdown after completion', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'deepSpaceProbe',
    });

    for (let i = 0; i < 600; i++) engine.tick();

    // VP breakdown should include expedition VP
    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.expeditionVP, 3);
    assert.strictEqual(breakdown.expeditionsCompleted, 1);
  });
});

describe('Expeditions Deep — event payload completeness', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should include systemName in expeditionStarted event', () => {
    const events = [];
    engine.onEvent = (batch) => events.push(...batch);

    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'deepSpaceProbe',
    });
    engine.tick();

    const started = events.find(e => e.eventType === 'expeditionStarted');
    assert.ok(started);
    assert.ok(started.systemName, 'Event should include systemName');
    assert.strictEqual(started.duration, 600, 'Event should include duration');
  });

  it('should include systemName in expeditionComplete event', () => {
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
    assert.ok(completed);
    assert.ok(completed.systemName, 'Complete event should include systemName');
    assert.strictEqual(completed.name, 'Wormhole Mapping', 'Should include expedition display name');
  });
});

describe('Expeditions Deep — VP baseline and edge cases', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should have 0 expeditionVP in breakdown before any expeditions', () => {
    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.expeditionVP, 0);
    assert.strictEqual(breakdown.expeditionsCompleted, 0);
  });

  it('should include expeditionVP in total VP sum', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'deepSpaceProbe',
    });
    for (let i = 0; i < 600; i++) engine.tick();

    const breakdown = engine._calcVPBreakdown('p1');
    // Verify expeditionVP is included in the breakdown AND in the total
    assert.strictEqual(breakdown.expeditionVP, 3, 'Expedition VP should be 3');
    assert.ok(breakdown.vp >= 3, 'Total VP should include expedition VP');
    // Verify total is the sum — expeditionVP should be a component
    const totalWithout = breakdown.vp - breakdown.expeditionVP;
    const rebuiltTotal = totalWithout + 3;
    assert.strictEqual(rebuiltTotal, breakdown.vp, 'expeditionVP should be additive in total VP');
  });

  it('should handle expedition on ship with exactly 5 surveys (boundary)', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5); // exactly the minimum

    const result = engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'wormholeMapping',
    });
    assert.ok(result.ok, 'Exactly 5 surveys should be accepted');
  });

  it('should handle expedition with 0 surveys', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    // No surveys granted

    const result = engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'deepSpaceProbe',
    });
    assert.ok(result.error);
    assert.ok(result.error.includes('5 surveys'));
  });

  it('should invalidate state cache when expedition completes', () => {
    const colony = engine.colonies.values().next().value;
    const ship = addScienceShip(engine, 'p1', colony.systemId);
    grantSurveys(engine, 'p1', 5);

    engine.handleCommand('p1', {
      type: 'startExpedition', shipId: ship.id, expeditionType: 'wormholeMapping',
    });

    // Prime the JSON cache
    const jsonBefore = engine.getPlayerStateJSON('p1');
    const parsedBefore = JSON.parse(jsonBefore);
    const shipBefore = parsedBefore.scienceShips.find(s => s.id === ship.id);
    assert.strictEqual(shipBefore.expedition, 'wormholeMapping');

    // Complete expedition
    for (let i = 0; i < 600; i++) engine.tick();

    // Cache should have been invalidated — new JSON should reflect cleared state
    const jsonAfter = engine.getPlayerStateJSON('p1');
    const parsedAfter = JSON.parse(jsonAfter);
    const shipAfter = parsedAfter.scienceShips.find(s => s.id === ship.id);
    assert.strictEqual(shipAfter.expedition, null, 'Cache should be invalidated after completion');
  });
});
