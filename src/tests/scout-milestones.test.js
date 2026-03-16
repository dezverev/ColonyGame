const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { GameEngine, SCOUT_MILESTONES } = require('../../server/game-engine');
const { formatGameEvent, TOAST_TYPE_MAP } = require('../public/js/toast-format');

function makeRoom(playerCount = 1) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set('p' + i, { id: 'p' + i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 'p1', maxPlayers: 4, status: 'playing', players, matchTimer: 0 };
}

function makeEngine(playerCount = 1) {
  const engine = new GameEngine(makeRoom(playerCount), { tickRate: 10 });
  engine.start();
  return engine;
}

// Manually add surveyed systems and trigger milestone checks via _completeSurvey
function addSurveyedSystems(engine, playerId, count) {
  if (!engine._surveyedSystems.has(playerId)) {
    engine._surveyedSystems.set(playerId, new Set());
  }
  const surveyedSet = engine._surveyedSystems.get(playerId);
  // Add systems to the surveyed set (using system indices from galaxy)
  let added = 0;
  for (let i = 0; i < engine.galaxy.systems.length && added < count; i++) {
    if (!surveyedSet.has(i)) {
      surveyedSet.add(i);
      added++;
    }
  }
}

describe('Scout Milestones Constants', () => {
  it('SCOUT_MILESTONES should define 3 thresholds with VP bonuses', () => {
    assert.deepStrictEqual(SCOUT_MILESTONES, { 3: 10, 5: 15, 8: 20 });
  });
});

describe('Scout Milestones Initialization', () => {
  it('should initialize _scoutMilestones with null values', () => {
    const engine = makeEngine();
    assert.deepStrictEqual(engine._scoutMilestones, { 3: null, 5: null, 8: null });
    engine.stop();
  });
});

describe('Scout Milestone Claiming via _completeSurvey', () => {
  let engine;

  beforeEach(() => {
    engine = makeEngine(2);
  });

  it('should award +10 VP milestone when player surveys 3 systems', () => {
    // Pre-seed 2 surveyed systems, then complete survey on a 3rd
    addSurveyedSystems(engine, 'p1', 2);
    assert.strictEqual(engine._surveyedSystems.get('p1').size, 2);

    // Create a science ship at a system to trigger _completeSurvey
    const unsurveyed = engine.galaxy.systems.find((s, i) => !engine._surveyedSystems.get('p1').has(i));
    const ship = { id: 's1', ownerId: 'p1', systemId: engine.galaxy.systems.indexOf(unsurveyed) };

    engine._completeSurvey(ship);

    assert.strictEqual(engine._scoutMilestones[3], 'p1');
    assert.strictEqual(engine._scoutMilestones[5], null);
    assert.strictEqual(engine._scoutMilestones[8], null);
    engine.stop();
  });

  it('should award +15 VP milestone when player surveys 5 systems', () => {
    addSurveyedSystems(engine, 'p1', 4);

    const unsurveyed = engine.galaxy.systems.find((s, i) => !engine._surveyedSystems.get('p1').has(i));
    const ship = { id: 's1', ownerId: 'p1', systemId: engine.galaxy.systems.indexOf(unsurveyed) };

    engine._completeSurvey(ship);

    assert.strictEqual(engine._scoutMilestones[3], 'p1');
    assert.strictEqual(engine._scoutMilestones[5], 'p1');
    assert.strictEqual(engine._scoutMilestones[8], null);
    engine.stop();
  });

  it('should award all milestones when player surveys 8+ systems at once', () => {
    addSurveyedSystems(engine, 'p1', 7);

    const unsurveyed = engine.galaxy.systems.find((s, i) => !engine._surveyedSystems.get('p1').has(i));
    const ship = { id: 's1', ownerId: 'p1', systemId: engine.galaxy.systems.indexOf(unsurveyed) };

    engine._completeSurvey(ship);

    assert.strictEqual(engine._scoutMilestones[3], 'p1');
    assert.strictEqual(engine._scoutMilestones[5], 'p1');
    assert.strictEqual(engine._scoutMilestones[8], 'p1');
    engine.stop();
  });

  it('should be first-come-first-served — second player cannot claim same milestone', () => {
    // Player 1 claims the 3-system milestone
    addSurveyedSystems(engine, 'p1', 2);
    const unsurveyed1 = engine.galaxy.systems.find((s, i) => !engine._surveyedSystems.get('p1').has(i));
    engine._completeSurvey({ id: 's1', ownerId: 'p1', systemId: engine.galaxy.systems.indexOf(unsurveyed1) });
    assert.strictEqual(engine._scoutMilestones[3], 'p1');

    // Player 2 also surveys 3 systems — should NOT claim the milestone
    addSurveyedSystems(engine, 'p2', 2);
    const p2Surveyed = engine._surveyedSystems.get('p2');
    const unsurveyed2 = engine.galaxy.systems.find((s, i) => !p2Surveyed.has(i));
    engine._completeSurvey({ id: 's2', ownerId: 'p2', systemId: engine.galaxy.systems.indexOf(unsurveyed2) });

    // Milestone still belongs to p1
    assert.strictEqual(engine._scoutMilestones[3], 'p1');
    engine.stop();
  });

  it('should allow different players to claim different milestones', () => {
    // Player 1 claims 3-system milestone
    addSurveyedSystems(engine, 'p1', 2);
    const unsurveyed1 = engine.galaxy.systems.find((s, i) => !engine._surveyedSystems.get('p1').has(i));
    engine._completeSurvey({ id: 's1', ownerId: 'p1', systemId: engine.galaxy.systems.indexOf(unsurveyed1) });

    // Player 2 claims 5-system milestone (p1's 3 is already taken, but 5 is open)
    addSurveyedSystems(engine, 'p2', 4);
    const p2Surveyed = engine._surveyedSystems.get('p2');
    const unsurveyed2 = engine.galaxy.systems.find((s, i) => !p2Surveyed.has(i));
    engine._completeSurvey({ id: 's2', ownerId: 'p2', systemId: engine.galaxy.systems.indexOf(unsurveyed2) });

    assert.strictEqual(engine._scoutMilestones[3], 'p1');
    assert.strictEqual(engine._scoutMilestones[5], 'p2');
    engine.stop();
  });

  it('should emit scoutMilestone event with correct details', () => {
    const events = [];
    engine._emitEvent = (type, playerId, details, broadcast) => {
      events.push({ type, playerId, details, broadcast });
    };

    addSurveyedSystems(engine, 'p1', 2);
    const unsurveyed = engine.galaxy.systems.find((s, i) => !engine._surveyedSystems.get('p1').has(i));
    engine._completeSurvey({ id: 's1', ownerId: 'p1', systemId: engine.galaxy.systems.indexOf(unsurveyed) });

    const milestoneEvents = events.filter(e => e.type === 'scoutMilestone');
    assert.strictEqual(milestoneEvents.length, 1);
    assert.strictEqual(milestoneEvents[0].details.threshold, 3);
    assert.strictEqual(milestoneEvents[0].details.vp, 10);
    assert.strictEqual(milestoneEvents[0].broadcast, true);
    engine.stop();
  });
});

describe('Scout Milestone VP in Breakdown', () => {
  it('should include scoutMilestonesVP in VP breakdown', () => {
    const engine = makeEngine();
    engine._scoutMilestones[3] = 'p1';
    engine._scoutMilestones[5] = 'p1';
    engine._vpCacheTick = -1;

    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.scoutMilestonesVP, 25); // 10 + 15
    assert.ok(breakdown.vp >= 25, 'Total VP should include scout milestone VP');
    engine.stop();
  });

  it('should return 0 scoutMilestonesVP when no milestones claimed', () => {
    const engine = makeEngine();
    engine._vpCacheTick = -1;

    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.scoutMilestonesVP, 0);
    engine.stop();
  });

  it('should give full 45 VP when all 3 milestones claimed by same player', () => {
    const engine = makeEngine();
    engine._scoutMilestones[3] = 'p1';
    engine._scoutMilestones[5] = 'p1';
    engine._scoutMilestones[8] = 'p1';
    engine._vpCacheTick = -1;

    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.scoutMilestonesVP, 45); // 10 + 15 + 20
    engine.stop();
  });

  it('should only count milestones owned by the player', () => {
    const engine = makeEngine(2);
    engine._scoutMilestones[3] = 'p1';
    engine._scoutMilestones[5] = 'p2';
    engine._scoutMilestones[8] = 'p1';
    engine._vpCacheTick = -1;

    const p1Breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(p1Breakdown.scoutMilestonesVP, 30); // 10 + 20

    engine._vpCacheTick = -1;
    const p2Breakdown = engine._calcVPBreakdown('p2');
    assert.strictEqual(p2Breakdown.scoutMilestonesVP, 15);
    engine.stop();
  });
});

describe('Scout Milestones in Serialization', () => {
  it('should include scoutMilestones in getState()', () => {
    const engine = makeEngine();
    engine._scoutMilestones[3] = 'p1';

    const state = engine.getState();
    assert.ok(state.scoutMilestones, 'State should have scoutMilestones');
    assert.strictEqual(state.scoutMilestones[3], 'p1');
    assert.strictEqual(state.scoutMilestones[5], null);
    assert.strictEqual(state.scoutMilestones[8], null);
    engine.stop();
  });

  it('should include scoutMilestones in getPlayerStateJSON()', () => {
    const engine = makeEngine();
    engine._scoutMilestones[5] = 'p1';

    const json = engine.getPlayerStateJSON('p1');
    const state = JSON.parse(json);
    assert.ok(state.scoutMilestones, 'Player state should have scoutMilestones');
    assert.strictEqual(state.scoutMilestones[5], 'p1');
    engine.stop();
  });
});

describe('Scout Milestone Toast Formatting', () => {
  it('TOAST_TYPE_MAP should classify scoutMilestone as positive', () => {
    assert.strictEqual(TOAST_TYPE_MAP.scoutMilestone, 'positive');
  });

  it('formatGameEvent should format scoutMilestone correctly', () => {
    const text = formatGameEvent({
      eventType: 'scoutMilestone',
      playerName: 'Alice',
      threshold: 5,
      vp: 15,
    });
    assert.ok(text.includes('Alice'), 'Should include player name');
    assert.ok(text.includes('5'), 'Should include threshold');
    assert.ok(text.includes('15'), 'Should include VP amount');
    assert.ok(text.includes('First to survey'), 'Should mention first-to-survey');
  });
});
