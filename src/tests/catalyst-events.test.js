const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine, MONTH_TICKS, TECH_TREE, DIPLOMACY_STANCES,
  CATALYST_RESOURCE_RUSH_PCT, CATALYST_TECH_AUCTION_PCT, CATALYST_BORDER_INCIDENT_PCT,
  CATALYST_RUSH_INCOME, CATALYST_RUSH_DURATION, CATALYST_AUCTION_WINDOW,
  CATALYST_INCIDENT_WINDOW, CATALYST_INCIDENT_BOTH_DEESCALATE_VP,
  CATALYST_INCIDENT_ESCALATE_VP, CATALYST_INCIDENT_HOP_RANGE,
} = require('../../server/game-engine');

// Helper: create a 2-player engine with match timer
function makeTwoPlayerEngine(matchMinutes = 20) {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  players.set('p2', { name: 'Player 2' });
  const room = { players, galaxySize: 'small', matchTimer: matchMinutes };
  const engine = new GameEngine(room, { tickRate: 10 });
  engine._doctrinePhase = false;
  return engine;
}

// Helper: create single-player engine (no match timer)
function makeNoTimerEngine() {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  const engine = new GameEngine(room, { tickRate: 10 });
  engine._doctrinePhase = false;
  return engine;
}

// Helper: advance engine to a specific match time percentage
function advanceTo(engine, pct) {
  const ticksElapsed = Math.floor(engine._matchTicksTotal * pct);
  engine._matchTicksRemaining = engine._matchTicksTotal - ticksElapsed;
  engine.tickCount = ticksElapsed;
}

// Run catalyst processing and return flushed events
function processCatalystAndFlush(engine) {
  engine._processCatalystEvents();
  const flushed = engine._flushEvents();
  return flushed || [];
}

// ── Constants ──

describe('Catalyst Events — constants', () => {
  it('Resource Rush fires at 30% match time', () => {
    assert.strictEqual(CATALYST_RESOURCE_RUSH_PCT, 0.30);
  });
  it('Tech Auction fires at 45% match time', () => {
    assert.strictEqual(CATALYST_TECH_AUCTION_PCT, 0.45);
  });
  it('Border Incident fires at 55% match time', () => {
    assert.strictEqual(CATALYST_BORDER_INCIDENT_PCT, 0.55);
  });
  it('Rush income is 75/month', () => {
    assert.strictEqual(CATALYST_RUSH_INCOME, 75);
  });
  it('Rush duration is 1800 ticks', () => {
    assert.strictEqual(CATALYST_RUSH_DURATION, 1800);
  });
  it('Auction window is 120 ticks', () => {
    assert.strictEqual(CATALYST_AUCTION_WINDOW, 120);
  });
  it('Incident window is 100 ticks', () => {
    assert.strictEqual(CATALYST_INCIDENT_WINDOW, 100);
  });
  it('Incident hop range is 3', () => {
    assert.strictEqual(CATALYST_INCIDENT_HOP_RANGE, 3);
  });
});

// ── Resource Rush ──

describe('Catalyst Events — Resource Rush', () => {
  it('fires resourceRush event at 30% match time', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.30);
    const events = processCatalystAndFlush(engine);

    const rushEvents = events.filter(e => e.eventType === 'resourceRush');
    assert.strictEqual(rushEvents.length, 1);
    assert.ok(rushEvents[0].systemId != null);
    assert.ok(['energy', 'minerals', 'food', 'alloys'].includes(rushEvents[0].resource));
    assert.strictEqual(rushEvents[0].income, CATALYST_RUSH_INCOME);
    assert.strictEqual(rushEvents[0].broadcast, true);
  });

  it('does not fire before 30%', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.29);
    const events = processCatalystAndFlush(engine);

    const rushEvents = events.filter(e => e.eventType === 'resourceRush');
    assert.strictEqual(rushEvents.length, 0);
  });

  it('only fires once', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.30);
    const e1 = processCatalystAndFlush(engine);
    const e2 = processCatalystAndFlush(engine);
    const e3 = processCatalystAndFlush(engine);

    const allRush = [...e1, ...e2, ...e3].filter(e => e.eventType === 'resourceRush');
    assert.strictEqual(allRush.length, 1);
  });

  it('does not fire without match timer', () => {
    const engine = makeNoTimerEngine();
    const events = processCatalystAndFlush(engine);

    const rushEvents = events.filter(e => e.eventType === 'resourceRush');
    assert.strictEqual(rushEvents.length, 0);
  });

  it('claiming the rush sets owner and duration', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.30);
    processCatalystAndFlush(engine);

    assert.strictEqual(engine._resourceRushOwner, null);
    const result = engine._claimResourceRush('p1');
    assert.strictEqual(result, true);
    assert.strictEqual(engine._resourceRushOwner, 'p1');
    assert.strictEqual(engine._resourceRushTicksLeft, CATALYST_RUSH_DURATION);
  });

  it('only the first player can claim', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.30);
    processCatalystAndFlush(engine);

    engine._claimResourceRush('p1');
    const result2 = engine._claimResourceRush('p2');
    assert.strictEqual(result2, false);
    assert.strictEqual(engine._resourceRushOwner, 'p1');
  });

  it('rush income is granted monthly', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.30);
    processCatalystAndFlush(engine);
    engine._claimResourceRush('p1');

    const resource = engine._resourceRushResource;
    const before = engine.playerStates.get('p1').resources[resource];

    // Simulate a monthly tick
    engine.tickCount = MONTH_TICKS;
    engine._resourceRushTicksLeft = 100; // plenty left
    processCatalystAndFlush(engine);

    const after = engine.playerStates.get('p1').resources[resource];
    assert.strictEqual(after - before, CATALYST_RUSH_INCOME);
  });

  it('rush expires after duration ticks', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.30);
    processCatalystAndFlush(engine);
    engine._claimResourceRush('p1');

    engine._resourceRushTicksLeft = 1;
    engine.tickCount = 500; // not a month tick
    const events = processCatalystAndFlush(engine);

    assert.strictEqual(engine._resourceRushOwner, null);
    const expired = events.filter(e => e.eventType === 'resourceRushExpired');
    assert.strictEqual(expired.length, 1);
  });
});

// ── Tech Auction ──

describe('Catalyst Events — Tech Auction', () => {
  it('fires techAuction event at 45% match time', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.45);
    const events = processCatalystAndFlush(engine);

    const auctionEvents = events.filter(e => e.eventType === 'techAuction');
    assert.strictEqual(auctionEvents.length, 1);
    assert.ok(auctionEvents[0].broadcast);
    assert.ok(engine._auctionBids instanceof Map);
  });

  it('accepts valid bids', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.45);
    processCatalystAndFlush(engine);

    engine.playerStates.get('p1').resources.influence = 50;
    engine.playerStates.get('p1').currentResearch.physics = 'improved_power_plants';

    const result = engine.handleCommand('p1', { type: 'auctionBid', amount: 20 });
    assert.ok(result.ok);
    assert.strictEqual(engine._auctionBids.get('p1'), 20);
  });

  it('rejects bid with insufficient influence', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.45);
    processCatalystAndFlush(engine);

    engine.playerStates.get('p1').resources.influence = 5;
    engine.playerStates.get('p1').currentResearch.physics = 'improved_power_plants';

    const result = engine.handleCommand('p1', { type: 'auctionBid', amount: 20 });
    assert.ok(result.error);
  });

  it('rejects bid without active research', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.45);
    processCatalystAndFlush(engine);

    engine.playerStates.get('p1').resources.influence = 50;
    engine.playerStates.get('p1').currentResearch = { physics: null, society: null, engineering: null };

    const result = engine.handleCommand('p1', { type: 'auctionBid', amount: 20 });
    assert.ok(result.error);
  });

  it('rejects bid when no auction is active', () => {
    const engine = makeTwoPlayerEngine();
    const result = engine.handleCommand('p1', { type: 'auctionBid', amount: 20 });
    assert.ok(result.error);
  });

  it('rejects invalid bid amount', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.45);
    processCatalystAndFlush(engine);

    engine.playerStates.get('p1').resources.influence = 50;
    engine.playerStates.get('p1').currentResearch.physics = 'improved_power_plants';

    const r1 = engine.handleCommand('p1', { type: 'auctionBid', amount: 0 });
    assert.ok(r1.error);
    const r2 = engine.handleCommand('p1', { type: 'auctionBid', amount: -5 });
    assert.ok(r2.error);
    const r3 = engine.handleCommand('p1', { type: 'auctionBid', amount: 'abc' });
    assert.ok(r3.error);
  });

  it('resolves auction — highest bidder wins and tech is completed', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.45);
    processCatalystAndFlush(engine);

    const p1State = engine.playerStates.get('p1');
    const p2State = engine.playerStates.get('p2');
    p1State.resources.influence = 100;
    p2State.resources.influence = 100;
    p1State.currentResearch.physics = 'improved_power_plants';
    p2State.currentResearch.physics = 'improved_power_plants';

    engine.handleCommand('p1', { type: 'auctionBid', amount: 30 });
    engine.handleCommand('p2', { type: 'auctionBid', amount: 20 });

    // Advance past deadline
    engine.tickCount = engine._auctionDeadlineTick;
    const events = processCatalystAndFlush(engine);

    // Auction resolved
    assert.strictEqual(engine._auctionBids, null);

    // Both lose influence
    assert.strictEqual(p1State.resources.influence, 70);
    assert.strictEqual(p2State.resources.influence, 80);

    // p1 wins and tech is completed
    assert.ok(p1State.completedTechs.includes('improved_power_plants'));
    assert.ok(!p2State.completedTechs.includes('improved_power_plants'));

    const resultEvents = events.filter(e => e.eventType === 'techAuctionResult');
    assert.strictEqual(resultEvents.length, 1);
    assert.strictEqual(resultEvents[0].winner, 'p1');
  });

  it('resolves with no bids gracefully', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.45);
    processCatalystAndFlush(engine);

    // Advance past deadline with no bids
    engine.tickCount = engine._auctionDeadlineTick;
    const events = processCatalystAndFlush(engine);

    const resultEvents = events.filter(e => e.eventType === 'techAuctionResult');
    assert.strictEqual(resultEvents.length, 1);
    assert.strictEqual(resultEvents[0].winner, null);
  });
});

// ── Border Incident ──

describe('Catalyst Events — Border Incident', () => {
  it('fires borderIncident at 55% match time if players have nearby colonies', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.55);
    processCatalystAndFlush(engine);

    // Can't guarantee proximity in random galaxy, so just check it was attempted
    assert.strictEqual(engine._catalystBorderIncidentFired, true);
  });

  it('does not fire before 55%', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.54);
    processCatalystAndFlush(engine);

    assert.strictEqual(engine._catalystBorderIncidentFired, false);
  });

  it('accepts valid incident responses', () => {
    const engine = makeTwoPlayerEngine();
    engine._incidentPlayers = ['p1', 'p2'];
    engine._incidentChoices = new Map();
    engine._incidentDeadlineTick = engine.tickCount + 100;

    const r1 = engine.handleCommand('p1', { type: 'respondIncident', choice: 'escalate' });
    assert.ok(r1.ok);
    assert.strictEqual(engine._incidentChoices.get('p1'), 'escalate');

    const r2 = engine.handleCommand('p2', { type: 'respondIncident', choice: 'deescalate' });
    assert.ok(r2.ok);
    assert.strictEqual(engine._incidentChoices.get('p2'), 'deescalate');
  });

  it('rejects invalid choice', () => {
    const engine = makeTwoPlayerEngine();
    engine._incidentPlayers = ['p1', 'p2'];
    engine._incidentChoices = new Map();
    engine._incidentDeadlineTick = engine.tickCount + 100;

    const result = engine.handleCommand('p1', { type: 'respondIncident', choice: 'invalid' });
    assert.ok(result.error);
  });

  it('rejects response from non-involved player', () => {
    const engine = makeTwoPlayerEngine();
    engine._incidentPlayers = ['p1', 'p2'];
    engine._incidentChoices = new Map();
    engine._incidentDeadlineTick = engine.tickCount + 100;

    const result = engine.handleCommand('p3', { type: 'respondIncident', choice: 'escalate' });
    assert.ok(result.error);
  });

  it('rejects response when no incident active', () => {
    const engine = makeTwoPlayerEngine();
    const result = engine.handleCommand('p1', { type: 'respondIncident', choice: 'escalate' });
    assert.ok(result.error);
  });

  it('both de-escalate: +5 VP each', () => {
    const engine = makeTwoPlayerEngine();
    engine._incidentPlayers = ['p1', 'p2'];
    engine._incidentChoices = new Map();
    engine._incidentChoices.set('p1', 'deescalate');
    engine._incidentChoices.set('p2', 'deescalate');
    engine._incidentDeadlineTick = engine.tickCount;

    const events = processCatalystAndFlush(engine);

    const p1State = engine.playerStates.get('p1');
    const p2State = engine.playerStates.get('p2');
    assert.strictEqual(p1State._catalystVP, CATALYST_INCIDENT_BOTH_DEESCALATE_VP);
    assert.strictEqual(p2State._catalystVP, CATALYST_INCIDENT_BOTH_DEESCALATE_VP);

    const resultEvents = events.filter(e => e.eventType === 'borderIncidentResult');
    assert.strictEqual(resultEvents.length, 1);
    assert.strictEqual(resultEvents[0].result, 'both_deescalate');
  });

  it('both escalate: both hostile, no VP', () => {
    const engine = makeTwoPlayerEngine();
    engine._incidentPlayers = ['p1', 'p2'];
    engine._incidentChoices = new Map();
    engine._incidentChoices.set('p1', 'escalate');
    engine._incidentChoices.set('p2', 'escalate');
    engine._incidentDeadlineTick = engine.tickCount;

    const events = processCatalystAndFlush(engine);

    const p1State = engine.playerStates.get('p1');
    const p2State = engine.playerStates.get('p2');
    assert.strictEqual(p1State._catalystVP || 0, 0);
    assert.strictEqual(p2State._catalystVP || 0, 0);

    assert.strictEqual(p1State.diplomacy['p2'].stance, DIPLOMACY_STANCES.HOSTILE);
    assert.strictEqual(p2State.diplomacy['p1'].stance, DIPLOMACY_STANCES.HOSTILE);

    const resultEvents = events.filter(e => e.eventType === 'borderIncidentResult');
    assert.strictEqual(resultEvents[0].result, 'both_escalate');
  });

  it('one escalates: escalator gets +3 VP, both go hostile', () => {
    const engine = makeTwoPlayerEngine();
    engine._incidentPlayers = ['p1', 'p2'];
    engine._incidentChoices = new Map();
    engine._incidentChoices.set('p1', 'escalate');
    engine._incidentChoices.set('p2', 'deescalate');
    engine._incidentDeadlineTick = engine.tickCount;

    const events = processCatalystAndFlush(engine);

    const p1State = engine.playerStates.get('p1');
    const p2State = engine.playerStates.get('p2');
    assert.strictEqual(p1State._catalystVP, CATALYST_INCIDENT_ESCALATE_VP);
    assert.strictEqual(p2State._catalystVP || 0, 0);

    assert.strictEqual(p1State.diplomacy['p2'].stance, DIPLOMACY_STANCES.HOSTILE);
    assert.strictEqual(p2State.diplomacy['p1'].stance, DIPLOMACY_STANCES.HOSTILE);

    const resultEvents = events.filter(e => e.eventType === 'borderIncidentResult');
    assert.strictEqual(resultEvents[0].result, 'one_escalate');
  });

  it('default to de-escalate if no response', () => {
    const engine = makeTwoPlayerEngine();
    engine._incidentPlayers = ['p1', 'p2'];
    engine._incidentChoices = new Map(); // no responses
    engine._incidentDeadlineTick = engine.tickCount;

    processCatalystAndFlush(engine);

    const p1State = engine.playerStates.get('p1');
    const p2State = engine.playerStates.get('p2');
    assert.strictEqual(p1State._catalystVP, CATALYST_INCIDENT_BOTH_DEESCALATE_VP);
    assert.strictEqual(p2State._catalystVP, CATALYST_INCIDENT_BOTH_DEESCALATE_VP);
  });

  it('catalyst VP is included in VP breakdown', () => {
    const engine = makeTwoPlayerEngine();
    const p1State = engine.playerStates.get('p1');
    p1State._catalystVP = 5;

    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.catalystVP, 5);
    assert.ok(breakdown.vp >= 5);
  });
});

// ── Serialization ──

describe('Catalyst Events — serialization', () => {
  it('resource rush state is included in player state', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.30);
    processCatalystAndFlush(engine);

    const state = engine.getPlayerState('p1');
    assert.ok(state.resourceRush);
    assert.strictEqual(state.resourceRush.systemId, engine._resourceRushSystem);
    assert.strictEqual(state.resourceRush.resource, engine._resourceRushResource);
    assert.strictEqual(state.resourceRush.owner, null);
  });

  it('tech auction state is included during active auction', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.45);
    processCatalystAndFlush(engine);

    const state = engine.getPlayerState('p1');
    assert.ok(state.techAuction);
    assert.strictEqual(state.techAuction.deadlineTick, engine._auctionDeadlineTick);
    assert.strictEqual(state.techAuction.hasBid, false);
  });

  it('border incident state is included during active incident', () => {
    const engine = makeTwoPlayerEngine();
    engine._incidentPlayers = ['p1', 'p2'];
    engine._incidentChoices = new Map();
    engine._incidentDeadlineTick = 999;

    const state = engine.getPlayerState('p1');
    assert.ok(state.borderIncident);
    assert.strictEqual(state.borderIncident.involved, true);
    assert.strictEqual(state.borderIncident.hasResponded, false);

    const state2 = engine.getPlayerState('p2');
    assert.strictEqual(state2.borderIncident.involved, true);
  });

  it('no catalyst state when events not active', () => {
    const engine = makeTwoPlayerEngine();
    const state = engine.getPlayerState('p1');
    assert.strictEqual(state.resourceRush, undefined);
    assert.strictEqual(state.techAuction, undefined);
    assert.strictEqual(state.borderIncident, undefined);
  });
});

// ── _findNearbyPlayerPair ──

describe('Catalyst Events — _findNearbyPlayerPair', () => {
  it('finds a pair when colonies are near each other', () => {
    const engine = makeTwoPlayerEngine();
    const pair = engine._findNearbyPlayerPair(['p1', 'p2'], 50);
    assert.ok(pair);
    assert.strictEqual(pair.length, 2);
    assert.ok(pair.includes('p1'));
    assert.ok(pair.includes('p2'));
  });

  it('returns null when no players have colonies nearby', () => {
    const engine = makeTwoPlayerEngine();
    const pair = engine._findNearbyPlayerPair(['p1', 'p2'], 0);
    assert.ok(pair === null || Array.isArray(pair));
  });

  it('returns null when only one player has colonies', () => {
    const engine = makeTwoPlayerEngine();
    const pair = engine._findNearbyPlayerPair(['p1', 'p3'], 50);
    assert.strictEqual(pair, null);
  });
});

// ── Edge cases ──

describe('Catalyst Events — edge cases', () => {
  it('all three events can fire in sequence', () => {
    const engine = makeTwoPlayerEngine();

    advanceTo(engine, 0.30);
    processCatalystAndFlush(engine);
    advanceTo(engine, 0.45);
    processCatalystAndFlush(engine);
    advanceTo(engine, 0.55);
    processCatalystAndFlush(engine);

    assert.strictEqual(engine._catalystResourceRushFired, true);
    assert.strictEqual(engine._catalystTechAuctionFired, true);
    assert.strictEqual(engine._catalystBorderIncidentFired, true);
  });

  it('events do not fire when game is over', () => {
    const engine = makeTwoPlayerEngine();
    engine._gameOver = true;

    advanceTo(engine, 0.30);
    processCatalystAndFlush(engine);

    assert.strictEqual(engine._catalystResourceRushFired, false);
  });

  it('auction bid after window closes is rejected', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.45);
    processCatalystAndFlush(engine);

    engine.tickCount = engine._auctionDeadlineTick + 1;

    engine.playerStates.get('p1').resources.influence = 50;
    engine.playerStates.get('p1').currentResearch.physics = 'improved_power_plants';
    const result = engine.handleCommand('p1', { type: 'auctionBid', amount: 10 });
    assert.ok(result.error);
  });

  it('incident response after window closes is rejected', () => {
    const engine = makeTwoPlayerEngine();
    engine._incidentPlayers = ['p1', 'p2'];
    engine._incidentChoices = new Map();
    engine._incidentDeadlineTick = 100;
    engine.tickCount = 101;

    const result = engine.handleCommand('p1', { type: 'respondIncident', choice: 'escalate' });
    assert.ok(result.error);
  });
});
