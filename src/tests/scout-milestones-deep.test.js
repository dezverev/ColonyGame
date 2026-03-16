const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { GameEngine, SCOUT_MILESTONES } = require('../../server/game-engine');

function makeRoom(playerCount = 1) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set('p' + i, { id: 'p' + i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 'p1', maxPlayers: 8, status: 'playing', players, matchTimer: 0 };
}

function makeEngine(playerCount = 1) {
  const engine = new GameEngine(makeRoom(playerCount), { tickRate: 10 });
  engine.start();
  return engine;
}

function addSurveyedSystems(engine, playerId, count) {
  if (!engine._surveyedSystems.has(playerId)) {
    engine._surveyedSystems.set(playerId, new Set());
  }
  const surveyedSet = engine._surveyedSystems.get(playerId);
  let added = 0;
  for (let i = 0; i < engine.galaxy.systems.length && added < count; i++) {
    if (!surveyedSet.has(i)) {
      surveyedSet.add(i);
      added++;
    }
  }
}

function findUnsurveyed(engine, playerId) {
  const surveyedSet = engine._surveyedSystems.get(playerId) || new Set();
  const idx = engine.galaxy.systems.findIndex((s, i) => !surveyedSet.has(i));
  return idx;
}

describe('Scout Milestones Deep — Silent Rejection', () => {
  it('should NOT emit scoutMilestone event when milestone already claimed by another player', () => {
    const engine = makeEngine(2);
    const events = [];
    engine._emitEvent = (type, playerId, details, broadcast) => {
      events.push({ type, playerId, details, broadcast });
    };

    // Player 1 claims the 3-system milestone
    addSurveyedSystems(engine, 'p1', 2);
    engine._completeSurvey({ id: 's1', ownerId: 'p1', systemId: findUnsurveyed(engine, 'p1') });
    const milestoneEventsAfterP1 = events.filter(e => e.type === 'scoutMilestone');
    assert.strictEqual(milestoneEventsAfterP1.length, 1, 'p1 should trigger exactly 1 milestone event');

    // Player 2 also reaches 3 surveys — should NOT fire a scoutMilestone event
    events.length = 0;
    addSurveyedSystems(engine, 'p2', 2);
    engine._completeSurvey({ id: 's2', ownerId: 'p2', systemId: findUnsurveyed(engine, 'p2') });
    const milestoneEventsAfterP2 = events.filter(e => e.type === 'scoutMilestone');
    assert.strictEqual(milestoneEventsAfterP2.length, 0, 'p2 should NOT trigger milestone event for already-claimed threshold');

    engine.stop();
  });
});

describe('Scout Milestones Deep — Multiple Events per Survey', () => {
  it('should emit 3 milestone events when player jumps from 0 to 8 surveys with all unclaimed', () => {
    const engine = makeEngine();
    const events = [];
    engine._emitEvent = (type, playerId, details, broadcast) => {
      events.push({ type, playerId, details, broadcast });
    };

    // Pre-seed 7 surveys (bypassing _completeSurvey), then trigger 8th via _completeSurvey
    addSurveyedSystems(engine, 'p1', 7);
    engine._completeSurvey({ id: 's1', ownerId: 'p1', systemId: findUnsurveyed(engine, 'p1') });

    const milestoneEvents = events.filter(e => e.type === 'scoutMilestone');
    assert.strictEqual(milestoneEvents.length, 3, 'Should fire events for thresholds 3, 5, and 8');

    const thresholds = milestoneEvents.map(e => e.details.threshold).sort((a, b) => a - b);
    assert.deepStrictEqual(thresholds, [3, 5, 8]);

    const vpValues = milestoneEvents.map(e => e.details.vp).sort((a, b) => a - b);
    assert.deepStrictEqual(vpValues, [10, 15, 20]);

    engine.stop();
  });

  it('should emit 2 milestone events when jumping from 0 to 5 surveys', () => {
    const engine = makeEngine();
    const events = [];
    engine._emitEvent = (type, playerId, details, broadcast) => {
      events.push({ type, playerId, details, broadcast });
    };

    addSurveyedSystems(engine, 'p1', 4);
    engine._completeSurvey({ id: 's1', ownerId: 'p1', systemId: findUnsurveyed(engine, 'p1') });

    const milestoneEvents = events.filter(e => e.type === 'scoutMilestone');
    assert.strictEqual(milestoneEvents.length, 2, 'Should fire events for thresholds 3 and 5');

    const thresholds = milestoneEvents.map(e => e.details.threshold).sort((a, b) => a - b);
    assert.deepStrictEqual(thresholds, [3, 5]);

    engine.stop();
  });
});

describe('Scout Milestones Deep — Set Idempotency', () => {
  it('should not double-count when surveying the same system twice', () => {
    const engine = makeEngine();

    // Pre-seed 2 surveys
    addSurveyedSystems(engine, 'p1', 2);
    const alreadySurveyed = [...engine._surveyedSystems.get('p1')][0];

    // Survey the same system again — Set.add is idempotent
    engine._completeSurvey({ id: 's1', ownerId: 'p1', systemId: alreadySurveyed });

    // Count should still be 2, not 3 — milestone should NOT be claimed
    assert.strictEqual(engine._surveyedSystems.get('p1').size, 2, 'Surveyed count should not increase for duplicate system');
    assert.strictEqual(engine._scoutMilestones[3], null, 'Threshold-3 milestone should not be claimed with only 2 unique surveys');

    engine.stop();
  });
});

describe('Scout Milestones Deep — VP Cache Consistency', () => {
  it('VP breakdown should immediately reflect milestone claimed via _completeSurvey', () => {
    const engine = makeEngine();

    addSurveyedSystems(engine, 'p1', 2);
    engine._vpCacheTick = -1;
    const beforeBreakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(beforeBreakdown.scoutMilestonesVP, 0, 'No milestones before completing 3rd survey');

    // Complete 3rd survey — should claim threshold-3
    engine._completeSurvey({ id: 's1', ownerId: 'p1', systemId: findUnsurveyed(engine, 'p1') });

    engine._vpCacheTick = -1; // force VP recalc
    const afterBreakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(afterBreakdown.scoutMilestonesVP, 10, 'VP should include +10 from threshold-3 milestone');

    engine.stop();
  });

  it('total VP should include scoutMilestonesVP in the sum', () => {
    const engine = makeEngine();
    engine._scoutMilestones[3] = 'p1';
    engine._scoutMilestones[5] = 'p1';
    engine._vpCacheTick = -1;

    const breakdown = engine._calcVPBreakdown('p1');
    // Recalculate expected total by summing all VP components
    const expectedTotal = breakdown.popsVP + breakdown.districtsVP + breakdown.alloysVP +
      breakdown.researchVP + breakdown.techVP + breakdown.traitsVP + breakdown.surveyedVP +
      breakdown.scoutMilestonesVP + breakdown.raidersVP + breakdown.militaryVP +
      breakdown.battlesWonVP + breakdown.shipsLostVP + breakdown.occupiedAttackerVP +
      breakdown.occupiedDefenderVP + breakdown.diplomacyVP +
      (breakdown.precursorVP || 0) + (breakdown.catalystVP || 0);
    assert.strictEqual(breakdown.vp, expectedTotal, 'Total VP should equal sum of all components including scoutMilestonesVP');

    engine.stop();
  });
});

describe('Scout Milestones Deep — getPlayerState Serialization', () => {
  it('getPlayerState() should include scoutMilestones', () => {
    const engine = makeEngine();
    engine._scoutMilestones[3] = 'p1';
    engine._scoutMilestones[8] = 'p1';

    const state = engine.getPlayerState('p1');
    assert.ok(state.scoutMilestones, 'getPlayerState should include scoutMilestones');
    assert.strictEqual(state.scoutMilestones[3], 'p1');
    assert.strictEqual(state.scoutMilestones[5], null);
    assert.strictEqual(state.scoutMilestones[8], 'p1');

    engine.stop();
  });

  it('serialized scoutMilestones should be a shallow copy (not a reference)', () => {
    const engine = makeEngine();
    engine._scoutMilestones[3] = 'p1';

    const state1 = engine.getState();
    // Mutate the returned object
    state1.scoutMilestones[3] = 'TAMPERED';

    // Internal state should be unaffected
    assert.strictEqual(engine._scoutMilestones[3], 'p1', 'Internal milestone state should not be affected by external mutation');

    engine.stop();
  });

  it('getPlayerStateJSON should produce valid JSON with milestone data', () => {
    const engine = makeEngine(2);
    engine._scoutMilestones[3] = 'p1';
    engine._scoutMilestones[5] = 'p2';

    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);

    assert.strictEqual(parsed.scoutMilestones['3'], 'p1');
    assert.strictEqual(parsed.scoutMilestones['5'], 'p2');
    assert.strictEqual(parsed.scoutMilestones['8'], null);

    engine.stop();
  });
});

describe('Scout Milestones Deep — Edge Cases', () => {
  it('milestone events should include playerName in details', () => {
    const engine = makeEngine();
    const events = [];
    engine._emitEvent = (type, playerId, details, broadcast) => {
      events.push({ type, playerId, details, broadcast });
    };

    addSurveyedSystems(engine, 'p1', 2);
    engine._completeSurvey({ id: 's1', ownerId: 'p1', systemId: findUnsurveyed(engine, 'p1') });

    const milestoneEvent = events.find(e => e.type === 'scoutMilestone');
    assert.ok(milestoneEvent.details.playerName, 'Event details should include playerName');
    assert.strictEqual(milestoneEvent.details.playerName, 'Player1');

    engine.stop();
  });

  it('all milestone events should be broadcast (visible to all players)', () => {
    const engine = makeEngine(2);
    const events = [];
    engine._emitEvent = (type, playerId, details, broadcast) => {
      events.push({ type, playerId, details, broadcast });
    };

    // Trigger all 3 milestones at once
    addSurveyedSystems(engine, 'p1', 7);
    engine._completeSurvey({ id: 's1', ownerId: 'p1', systemId: findUnsurveyed(engine, 'p1') });

    const milestoneEvents = events.filter(e => e.type === 'scoutMilestone');
    for (const event of milestoneEvents) {
      assert.strictEqual(event.broadcast, true, `Milestone event for threshold ${event.details.threshold} should be broadcast`);
    }

    engine.stop();
  });

  it('milestones should persist across multiple _completeSurvey calls', () => {
    const engine = makeEngine();

    // Claim threshold 3
    addSurveyedSystems(engine, 'p1', 2);
    engine._completeSurvey({ id: 's1', ownerId: 'p1', systemId: findUnsurveyed(engine, 'p1') });
    assert.strictEqual(engine._scoutMilestones[3], 'p1');

    // Survey more — threshold 3 should still be p1
    engine._completeSurvey({ id: 's2', ownerId: 'p1', systemId: findUnsurveyed(engine, 'p1') });
    engine._completeSurvey({ id: 's3', ownerId: 'p1', systemId: findUnsurveyed(engine, 'p1') });
    assert.strictEqual(engine._scoutMilestones[3], 'p1', 'Threshold-3 should remain claimed by p1');
    assert.strictEqual(engine._scoutMilestones[5], 'p1', 'Threshold-5 should now be claimed by p1');

    engine.stop();
  });

  it('3-player scenario: each player claims a different milestone', () => {
    const engine = makeEngine(3);

    // p1 claims threshold 3
    addSurveyedSystems(engine, 'p1', 2);
    engine._completeSurvey({ id: 's1', ownerId: 'p1', systemId: findUnsurveyed(engine, 'p1') });

    // p2 claims threshold 5 (p1 already has 3)
    addSurveyedSystems(engine, 'p2', 4);
    engine._completeSurvey({ id: 's2', ownerId: 'p2', systemId: findUnsurveyed(engine, 'p2') });

    // p3 claims threshold 8
    addSurveyedSystems(engine, 'p3', 7);
    engine._completeSurvey({ id: 's3', ownerId: 'p3', systemId: findUnsurveyed(engine, 'p3') });

    assert.strictEqual(engine._scoutMilestones[3], 'p1');
    assert.strictEqual(engine._scoutMilestones[5], 'p2');
    assert.strictEqual(engine._scoutMilestones[8], 'p3');

    // Verify VP per player
    engine._vpCacheTick = -1;
    assert.strictEqual(engine._calcVPBreakdown('p1').scoutMilestonesVP, 10);
    engine._vpCacheTick = -1;
    assert.strictEqual(engine._calcVPBreakdown('p2').scoutMilestonesVP, 15);
    engine._vpCacheTick = -1;
    assert.strictEqual(engine._calcVPBreakdown('p3').scoutMilestonesVP, 20);

    engine.stop();
  });
});
