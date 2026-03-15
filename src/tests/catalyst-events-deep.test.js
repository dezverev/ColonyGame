const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine, MONTH_TICKS, TECH_TREE, DIPLOMACY_STANCES,
  CATALYST_RESOURCE_RUSH_PCT, CATALYST_TECH_AUCTION_PCT, CATALYST_BORDER_INCIDENT_PCT,
  CATALYST_RUSH_INCOME, CATALYST_RUSH_DURATION, CATALYST_AUCTION_WINDOW,
  CATALYST_INCIDENT_WINDOW, CATALYST_INCIDENT_BOTH_DEESCALATE_VP,
  CATALYST_INCIDENT_ESCALATE_VP, CATALYST_INCIDENT_HOP_RANGE,
  CORVETTE_HOP_TICKS,
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

// ── Resource Rush — auto-claim via military ship arrival ──

describe('Catalyst Events Deep — Resource Rush auto-claim', () => {
  it('military ship arriving at rush system auto-claims for owner', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.30);
    processCatalystAndFlush(engine);

    const rushSystemId = engine._resourceRushSystem;
    assert.ok(rushSystemId, 'rush system should be set');

    // Manually set up a military ship arriving at the rush system
    const ship = {
      id: 'corvette-test',
      ownerId: 'p1',
      systemId: 'sys-other',
      path: [rushSystemId],
      hopProgress: CORVETTE_HOP_TICKS - 1, // about to arrive
      targetSystemId: rushSystemId,
      hp: 50,
      maxHp: 50,
      firepower: 10,
    };
    engine._militaryShips.push(ship);
    engine._militaryShipsBySystem.set('sys-other', [ship]);

    // Process movement — ship should arrive and claim
    engine._processMilitaryShipMovement();

    assert.strictEqual(engine._resourceRushOwner, 'p1', 'p1 should have claimed the rush');
    assert.strictEqual(engine._resourceRushTicksLeft, CATALYST_RUSH_DURATION);
  });

  it('military ship does not auto-claim if rush already claimed', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.30);
    processCatalystAndFlush(engine);

    // p1 claims first
    engine._claimResourceRush('p1');

    const rushSystemId = engine._resourceRushSystem;
    const ship = {
      id: 'corvette-test-2',
      ownerId: 'p2',
      systemId: 'sys-other',
      path: [rushSystemId],
      hopProgress: CORVETTE_HOP_TICKS - 1,
      targetSystemId: rushSystemId,
      hp: 50,
      maxHp: 50,
      firepower: 10,
    };
    engine._militaryShips.push(ship);
    engine._militaryShipsBySystem.set('sys-other', [ship]);

    engine._processMilitaryShipMovement();

    // Still p1's claim
    assert.strictEqual(engine._resourceRushOwner, 'p1');
  });
});

// ── Resource Rush — income timing ──

describe('Catalyst Events Deep — Rush income timing', () => {
  it('rush income is NOT granted on non-month ticks', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.30);
    processCatalystAndFlush(engine);
    engine._claimResourceRush('p1');

    const resource = engine._resourceRushResource;
    const before = engine.playerStates.get('p1').resources[resource];

    // Process on a non-month tick
    engine.tickCount = MONTH_TICKS + 1; // not divisible by MONTH_TICKS
    engine._resourceRushTicksLeft = 100;
    processCatalystAndFlush(engine);

    const after = engine.playerStates.get('p1').resources[resource];
    assert.strictEqual(after, before, 'should not grant income on non-month tick');
  });

  it('rush ticksLeft decrements each catalyst processing', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.30);
    processCatalystAndFlush(engine);
    engine._claimResourceRush('p1');

    const before = engine._resourceRushTicksLeft;
    assert.strictEqual(before, CATALYST_RUSH_DURATION);

    engine.tickCount = 1; // non-month tick
    processCatalystAndFlush(engine);

    assert.strictEqual(engine._resourceRushTicksLeft, before - 1);
  });
});

// ── Resource Rush — trigger fallback paths ──

describe('Catalyst Events Deep — Rush fallback paths', () => {
  it('picks unclaimed system when all are surveyed', () => {
    const engine = makeTwoPlayerEngine();

    // Mark all systems as surveyed by p1
    const allSystemIds = engine.galaxy.systems.map(s => s.id);
    const surveyed = engine._surveyedSystems.get('p1') || new Set();
    for (const sid of allSystemIds) surveyed.add(sid);
    engine._surveyedSystems.set('p1', surveyed);

    advanceTo(engine, 0.30);
    const events = processCatalystAndFlush(engine);

    // Should still fire (using unclaimed fallback)
    assert.strictEqual(engine._catalystResourceRushFired, true);
    // If there are unclaimed systems, a rush system should be set
    const colonizedSystems = new Set();
    for (const [, colony] of engine.colonies) colonizedSystems.add(colony.systemId);
    const unclaimed = allSystemIds.filter(s => !colonizedSystems.has(s));
    if (unclaimed.length > 0) {
      assert.ok(engine._resourceRushSystem, 'should pick an unclaimed system');
    }
  });
});

// ── Tech Auction — duplicate bid overwrites ──

describe('Catalyst Events Deep — Tech Auction bid updates', () => {
  it('player can update their bid with a new amount', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.45);
    processCatalystAndFlush(engine);

    const p1State = engine.playerStates.get('p1');
    p1State.resources.influence = 100;
    p1State.currentResearch.physics = 'improved_power_plants';

    engine.handleCommand('p1', { type: 'auctionBid', amount: 20 });
    assert.strictEqual(engine._auctionBids.get('p1'), 20);

    engine.handleCommand('p1', { type: 'auctionBid', amount: 40 });
    assert.strictEqual(engine._auctionBids.get('p1'), 40, 'bid should be updated to 40');
  });

  it('updated bid deducts the new amount (not cumulative)', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.45);
    processCatalystAndFlush(engine);

    const p1State = engine.playerStates.get('p1');
    p1State.resources.influence = 100;
    p1State.currentResearch.physics = 'improved_power_plants';

    engine.handleCommand('p1', { type: 'auctionBid', amount: 20 });
    engine.handleCommand('p1', { type: 'auctionBid', amount: 50 });

    // Resolve
    engine.tickCount = engine._auctionDeadlineTick;
    processCatalystAndFlush(engine);

    // Should deduct 50 (the final bid), not 70
    assert.strictEqual(p1State.resources.influence, 50);
  });
});

// ── Tech Auction — T2 preference ──

describe('Catalyst Events Deep — Tech Auction T2 preference', () => {
  it('auction winner completes T2 research over T1 when both active', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.45);
    processCatalystAndFlush(engine);

    const p1State = engine.playerStates.get('p1');
    p1State.resources.influence = 100;

    // Find a T1 and T2 tech in different tracks
    let t1Tech = null;
    let t2Tech = null;
    for (const [techId, def] of Object.entries(TECH_TREE)) {
      if (def.tier === 1 && !t1Tech) t1Tech = { id: techId, track: def.track };
      if (def.tier === 2 && !t2Tech) t2Tech = { id: techId, track: def.track };
      if (t1Tech && t2Tech && t1Tech.track !== t2Tech.track) break;
    }

    if (t1Tech && t2Tech && t1Tech.track !== t2Tech.track) {
      p1State.currentResearch[t1Tech.track] = t1Tech.id;
      p1State.currentResearch[t2Tech.track] = t2Tech.id;

      engine.handleCommand('p1', { type: 'auctionBid', amount: 10 });
      engine.tickCount = engine._auctionDeadlineTick;
      processCatalystAndFlush(engine);

      assert.ok(p1State.completedTechs.includes(t2Tech.id), 'T2 tech should be completed');
      assert.ok(!p1State.completedTechs.includes(t1Tech.id), 'T1 tech should still be in progress');
    }
  });
});

// ── Tech Auction — tie-breaking ──

describe('Catalyst Events Deep — Tech Auction ties', () => {
  it('tied bids still resolve with a winner (last highest wins)', () => {
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
    engine.handleCommand('p2', { type: 'auctionBid', amount: 30 });

    engine.tickCount = engine._auctionDeadlineTick;
    const events = processCatalystAndFlush(engine);

    const results = events.filter(e => e.eventType === 'techAuctionResult');
    assert.strictEqual(results.length, 1);
    // Winner should be one of the two players
    assert.ok(['p1', 'p2'].includes(results[0].winner), 'one player should win the tie');
    // Both should lose influence
    assert.strictEqual(p1State.resources.influence, 70);
    assert.strictEqual(p2State.resources.influence, 70);
  });
});

// ── Border Incident — _forceHostile clears pendingFriendly ──

describe('Catalyst Events Deep — _forceHostile side effects', () => {
  it('clears pendingFriendly between the two players', () => {
    const engine = makeTwoPlayerEngine();
    const p1State = engine.playerStates.get('p1');
    const p2State = engine.playerStates.get('p2');

    // Set up pending friendly
    p1State.pendingFriendly.add('p2');
    p2State.pendingFriendly.add('p1');

    engine._forceHostile('p1', 'p2');

    assert.strictEqual(p1State.pendingFriendly.has('p2'), false, 'p1 pendingFriendly toward p2 should be cleared');
    assert.strictEqual(p2State.pendingFriendly.has('p1'), false, 'p2 pendingFriendly toward p1 should be cleared');
    assert.strictEqual(p1State.diplomacy['p2'].stance, DIPLOMACY_STANCES.HOSTILE);
    assert.strictEqual(p2State.diplomacy['p1'].stance, DIPLOMACY_STANCES.HOSTILE);
  });

  it('marks both players as dirty', () => {
    const engine = makeTwoPlayerEngine();
    engine._dirtyPlayers.clear();

    engine._forceHostile('p1', 'p2');

    assert.ok(engine._dirtyPlayers.has('p1'));
    assert.ok(engine._dirtyPlayers.has('p2'));
  });
});

// ── Serialization — JSON broadcast payload ──

describe('Catalyst Events Deep — JSON serialization (broadcast payload)', () => {
  it('resourceRush appears in getPlayerStateJSON', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.30);
    processCatalystAndFlush(engine);

    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    assert.ok(parsed.resourceRush, 'resourceRush should be in JSON payload');
    assert.strictEqual(parsed.resourceRush.systemId, engine._resourceRushSystem);
    assert.strictEqual(parsed.resourceRush.resource, engine._resourceRushResource);
    assert.strictEqual(parsed.resourceRush.owner, null);
  });

  it('techAuction appears in getPlayerStateJSON during active auction', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.45);
    processCatalystAndFlush(engine);

    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    assert.ok(parsed.techAuction, 'techAuction should be in JSON payload');
    assert.strictEqual(parsed.techAuction.deadlineTick, engine._auctionDeadlineTick);
  });

  it('borderIncident appears in getPlayerStateJSON for involved player', () => {
    const engine = makeTwoPlayerEngine();
    engine._incidentPlayers = ['p1', 'p2'];
    engine._incidentChoices = new Map();
    engine._incidentDeadlineTick = 999;
    engine._invalidateStateCache();

    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    assert.ok(parsed.borderIncident, 'borderIncident should be in JSON payload');
    assert.strictEqual(parsed.borderIncident.involved, true);
    assert.strictEqual(parsed.borderIncident.hasResponded, false);
  });

  it('catalyst state absent from JSON when events inactive', () => {
    const engine = makeTwoPlayerEngine();
    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.resourceRush, undefined);
    assert.strictEqual(parsed.techAuction, undefined);
    assert.strictEqual(parsed.borderIncident, undefined);
  });

  it('techAuction hasBid reflects per-player bid state', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.45);
    processCatalystAndFlush(engine);

    const p1State = engine.playerStates.get('p1');
    p1State.resources.influence = 50;
    p1State.currentResearch.physics = 'improved_power_plants';
    engine.handleCommand('p1', { type: 'auctionBid', amount: 10 });
    engine._invalidateStateCache();

    const p1Json = JSON.parse(engine.getPlayerStateJSON('p1'));
    const p2Json = JSON.parse(engine.getPlayerStateJSON('p2'));
    assert.strictEqual(p1Json.techAuction.hasBid, true, 'p1 has bid');
    assert.strictEqual(p2Json.techAuction.hasBid, false, 'p2 has not bid');
  });
});

// ── Cache invalidation ──

describe('Catalyst Events Deep — cache invalidation', () => {
  it('claiming rush invalidates state cache', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.30);
    processCatalystAndFlush(engine);

    // Prime the cache
    engine.getPlayerStateJSON('p1');
    assert.ok(engine._cachedPlayerJSON.get('p1'), 'cache should be primed');

    engine._claimResourceRush('p1');
    assert.strictEqual(engine._cachedPlayerJSON.get('p1'), undefined, 'cache should be invalidated after claim');
  });

  it('rush income on month tick invalidates state cache', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.30);
    processCatalystAndFlush(engine);
    engine._claimResourceRush('p1');

    // Prime cache
    engine.getPlayerStateJSON('p1');

    engine.tickCount = MONTH_TICKS;
    engine._resourceRushTicksLeft = 100;
    processCatalystAndFlush(engine);

    // Cache should be invalidated because resource changed
    assert.strictEqual(engine._cachedPlayerJSON.get('p1'), undefined, 'cache invalidated after rush income');
  });
});

// ── Catalyst VP accumulation ──

describe('Catalyst Events Deep — VP integration', () => {
  it('catalystVP is 0 by default in VP breakdown', () => {
    const engine = makeTwoPlayerEngine();
    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.catalystVP, 0);
  });

  it('catalystVP accumulates if set multiple times', () => {
    const engine = makeTwoPlayerEngine();
    const p1State = engine.playerStates.get('p1');
    p1State._catalystVP = 5;
    engine._vpCacheTick = -1;

    const breakdown1 = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown1.catalystVP, 5);

    // Simulate additional VP (e.g., from future catalyst features)
    p1State._catalystVP = 8;
    engine._vpCacheTick = -1;
    const breakdown2 = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown2.catalystVP, 8);
  });

  it('catalystVP contributes to total VP', () => {
    const engine = makeTwoPlayerEngine();
    const baseBreakdown = engine._calcVPBreakdown('p1');
    const baseVP = baseBreakdown.vp;

    engine.playerStates.get('p1')._catalystVP = 10;
    engine._vpCacheTick = -1;
    const newBreakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(newBreakdown.vp, baseVP + 10);
  });
});

// ── Edge: incident with only partial response ──

describe('Catalyst Events Deep — incident partial responses', () => {
  it('one player responds, other defaults to de-escalate', () => {
    const engine = makeTwoPlayerEngine();
    engine._incidentPlayers = ['p1', 'p2'];
    engine._incidentChoices = new Map();
    engine._incidentDeadlineTick = engine.tickCount + 100;

    // Only p1 responds
    engine.handleCommand('p1', { type: 'respondIncident', choice: 'escalate' });
    assert.strictEqual(engine._incidentChoices.get('p1'), 'escalate');
    assert.strictEqual(engine._incidentChoices.has('p2'), false);

    // Resolve at deadline
    engine.tickCount = engine._incidentDeadlineTick;
    processCatalystAndFlush(engine);

    // p1 escalated, p2 defaults to deescalate → one_escalate outcome
    const p1State = engine.playerStates.get('p1');
    assert.strictEqual(p1State._catalystVP, CATALYST_INCIDENT_ESCALATE_VP);
    assert.strictEqual(p1State.diplomacy['p2'].stance, DIPLOMACY_STANCES.HOSTILE);
  });

  it('duplicate response from same player overwrites choice', () => {
    const engine = makeTwoPlayerEngine();
    engine._incidentPlayers = ['p1', 'p2'];
    engine._incidentChoices = new Map();
    engine._incidentDeadlineTick = engine.tickCount + 100;

    engine.handleCommand('p1', { type: 'respondIncident', choice: 'escalate' });
    assert.strictEqual(engine._incidentChoices.get('p1'), 'escalate');

    engine.handleCommand('p1', { type: 'respondIncident', choice: 'deescalate' });
    assert.strictEqual(engine._incidentChoices.get('p1'), 'deescalate', 'choice should be updated');
  });
});

// ── Early exit optimization ──

describe('Catalyst Events Deep — early exit optimization', () => {
  it('returns early after all events fired and resolved', () => {
    const engine = makeTwoPlayerEngine();

    // Fire all events
    engine._catalystResourceRushFired = true;
    engine._catalystTechAuctionFired = true;
    engine._catalystBorderIncidentFired = true;
    engine._resourceRushOwner = null;
    engine._auctionBids = null;
    engine._incidentPlayers = null;

    // Processing should return immediately (no new events)
    const events = processCatalystAndFlush(engine);
    assert.strictEqual(events.length, 0);
  });

  it('does NOT early exit while rush is still active', () => {
    const engine = makeTwoPlayerEngine();

    engine._catalystResourceRushFired = true;
    engine._catalystTechAuctionFired = true;
    engine._catalystBorderIncidentFired = true;
    engine._resourceRushOwner = 'p1';
    engine._resourceRushTicksLeft = 10;
    engine._resourceRushResource = 'energy';

    // Should still process (decrement ticksLeft)
    engine.tickCount = 1;
    processCatalystAndFlush(engine);

    assert.strictEqual(engine._resourceRushTicksLeft, 9, 'should have decremented');
  });
});
