const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  DIPLOMACY_STANCES, DIPLOMACY_INFLUENCE_COST, DIPLOMACY_COOLDOWN_TICKS,
  FRIENDLY_PRODUCTION_BONUS, FRIENDLY_HOP_RANGE, FRIENDLY_VP, MUTUAL_FRIENDLY_VP,
  CORVETTE_HP, CORVETTE_ATTACK,
} = require('../../server/game-engine');

// ── Helpers ──

function createEngine(opts = {}) {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  players.set('p2', { name: 'Player 2' });
  if (opts.threePlayer || opts.fourPlayer) {
    players.set('p3', { name: 'Player 3' });
  }
  if (opts.fourPlayer) {
    players.set('p4', { name: 'Player 4' });
  }
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  return new GameEngine(room, { tickRate: 10 });
}

function giveResources(engine, playerId) {
  const state = engine.playerStates.get(playerId);
  state.resources.minerals = 10000;
  state.resources.alloys = 10000;
  state.resources.energy = 10000;
  state.resources.food = 10000;
  state.resources.influence = 1000;
}

function spawnCorvette(engine, playerId, systemId, overrides = {}) {
  const ship = {
    id: 'corvette_' + (engine._idCounter++),
    ownerId: playerId,
    systemId,
    targetSystemId: null,
    path: [],
    hopProgress: 0,
    hp: overrides.hp != null ? overrides.hp : CORVETTE_HP,
    attack: overrides.attack != null ? overrides.attack : CORVETTE_ATTACK,
  };
  engine._addMilitaryShip(ship);
  return ship;
}

function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

function makeHostile(engine, from, to) {
  giveResources(engine, from);
  engine.handleCommand(from, { type: 'setDiplomacy', targetPlayerId: to, stance: 'hostile' });
}

function makeFriendly(engine, p1, p2) {
  giveResources(engine, p1);
  engine.handleCommand(p1, { type: 'setDiplomacy', targetPlayerId: p2, stance: 'friendly' });
  engine.handleCommand(p2, { type: 'acceptDiplomacy', targetPlayerId: p1 });
}

// ── Cooldown Isolation ──

describe('Diplomacy Cooldown — Per-Target Isolation', () => {
  it('cooldown toward p2 does not block stance change toward p3', () => {
    const engine = createEngine({ threePlayer: true });
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    // p1 is on cooldown toward p2, but should be free to act on p3
    const result = engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p3', stance: 'hostile' });
    assert.ok(result.ok, 'Cooldown should be per-target, not global');
  });

  it('target player gets cooldown too after mutual hostile declaration', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    // p2 got auto-set to hostile — they should also have a cooldown
    giveResources(engine, 'p2');
    const result = engine.handleCommand('p2', { type: 'setDiplomacy', targetPlayerId: 'p1', stance: 'neutral' });
    assert.ok(result.error, 'Target of war declaration should have cooldown');
    assert.ok(result.error.includes('cooldown'));
  });
});

// ── Occupation Progress Reset ──

describe('Occupation Progress Reset on Stance Change', () => {
  it('occupation progress resets when relationship changes from hostile to neutral', () => {
    const engine = createEngine();
    makeHostile(engine, 'p1', 'p2');

    const colony2 = getFirstColony(engine, 'p2');
    const systemId = colony2.systemId;
    spawnCorvette(engine, 'p1', systemId);

    // Progress occupation a few ticks
    engine._processOccupation();
    engine._processOccupation();
    assert.strictEqual(colony2.occupationProgress, 2, 'Should have 2 ticks of occupation progress');

    // p1 goes neutral (skip cooldown)
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS + 1;
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'neutral' });
    // p2 also needs to go neutral for _areHostile to return false
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS * 2 + 2;
    engine.handleCommand('p2', { type: 'setDiplomacy', targetPlayerId: 'p1', stance: 'neutral' });

    engine._processOccupation();
    assert.strictEqual(colony2.occupationProgress, 0, 'Occupation progress should reset when no longer hostile');
  });

  it('friendly ships should not progress occupation', () => {
    const engine = createEngine();
    makeFriendly(engine, 'p1', 'p2');

    const colony2 = getFirstColony(engine, 'p2');
    const systemId = colony2.systemId;
    spawnCorvette(engine, 'p1', systemId);

    engine._processOccupation();
    assert.strictEqual(colony2.occupationProgress, 0, 'Friendly ships should not progress occupation');
  });
});

// ── Friendly Proposal Stance Revert ──

describe('Friendly Proposal — Stance Not Prematurely Set', () => {
  it('proposing friendly from neutral keeps stance as neutral', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    assert.strictEqual(engine._getStance('p1', 'p2'), 'neutral', 'Stance should remain neutral until accepted');
  });

  it('proposing friendly from hostile reverts to neutral (not hostile)', () => {
    const engine = createEngine();
    makeHostile(engine, 'p1', 'p2');
    // Skip cooldown
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS + 1;
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    // p1 proposed friendly — should revert to neutral (since code does: hostile ? neutral : currentStance)
    assert.strictEqual(engine._getStance('p1', 'p2'), 'neutral', 'Stance should revert to neutral when proposing friendly from hostile');
  });

  it('pending friendly request is tracked on proposer side', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    assert.ok(engine.playerStates.get('p1').pendingFriendly.has('p2'));
    assert.strictEqual(engine.playerStates.get('p2').pendingFriendly.has('p1'), false,
      'Target should not have a pending request from proposer');
  });
});

// ── Accept Diplomacy — Influence and Cooldown ──

describe('acceptDiplomacy — Influence and Cooldown', () => {
  it('accepting friendly does not cost influence', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    const p2State = engine.playerStates.get('p2');
    const influenceBefore = p2State.resources.influence;
    engine.handleCommand('p2', { type: 'acceptDiplomacy', targetPlayerId: 'p1' });
    assert.strictEqual(p2State.resources.influence, influenceBefore, 'Accepting friendly should not cost influence');
  });

  it('accepting friendly sets cooldown on both players', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.tickCount = 100;
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    engine.handleCommand('p2', { type: 'acceptDiplomacy', targetPlayerId: 'p1' });
    const p1Entry = engine.playerStates.get('p1').diplomacy['p2'];
    const p2Entry = engine.playerStates.get('p2').diplomacy['p1'];
    assert.ok(p1Entry.cooldownTick >= 100 + DIPLOMACY_COOLDOWN_TICKS);
    assert.ok(p2Entry.cooldownTick >= 100 + DIPLOMACY_COOLDOWN_TICKS);
  });

  it('accepting clears pending requests in both directions', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    engine.handleCommand('p2', { type: 'acceptDiplomacy', targetPlayerId: 'p1' });
    assert.strictEqual(engine.playerStates.get('p1').pendingFriendly.size, 0);
    assert.strictEqual(engine.playerStates.get('p2').pendingFriendly.size, 0);
  });

  it('accepting missing targetPlayerId returns error', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', { type: 'acceptDiplomacy' });
    assert.ok(result.error);
  });
});

// ── Multiple Alliances and VP Stacking ──

describe('Diplomacy VP — Multi-Player Stacking', () => {
  it('multiple mutual friendships stack VP', () => {
    const engine = createEngine({ fourPlayer: true });
    makeFriendly(engine, 'p1', 'p2');
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS + 1;
    makeFriendly(engine, 'p1', 'p3');
    engine._vpCacheTick = -1;
    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.mutualFriendlyCount, 2);
    assert.strictEqual(breakdown.diplomacyVP, MUTUAL_FRIENDLY_VP * 2);
  });

  it('hostile stance gives zero diplomacy VP', () => {
    const engine = createEngine();
    makeHostile(engine, 'p1', 'p2');
    engine._vpCacheTick = -1;
    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.diplomacyVP, 0);
    assert.strictEqual(breakdown.friendlyCount, 0);
    assert.strictEqual(breakdown.mutualFriendlyCount, 0);
  });

  it('mixed stances compute VP correctly (one friendly, one hostile)', () => {
    const engine = createEngine({ threePlayer: true });
    makeFriendly(engine, 'p1', 'p2');
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS + 1;
    makeHostile(engine, 'p1', 'p3');
    engine._vpCacheTick = -1;
    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.mutualFriendlyCount, 1);
    assert.strictEqual(breakdown.diplomacyVP, MUTUAL_FRIENDLY_VP);
  });
});

// ── War Declaration Doesn't Affect Third Party Alliances ──

describe('Diplomacy — Third Party Independence', () => {
  it('declaring war on p2 does not affect friendly alliance with p3', () => {
    const engine = createEngine({ threePlayer: true });
    makeFriendly(engine, 'p1', 'p3');
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS + 1;
    makeHostile(engine, 'p1', 'p2');
    assert.strictEqual(engine._areMutuallyFriendly('p1', 'p3'), true, 'Alliance with p3 should survive');
    assert.strictEqual(engine._areHostile('p1', 'p2'), true, 'War with p2 should exist');
    assert.strictEqual(engine._areHostile('p2', 'p3'), false, 'p2 and p3 should remain neutral');
  });

  it('p3 neutral ships survive combat between hostile p1 and p2 in 3-player system', () => {
    const engine = createEngine({ threePlayer: true });
    makeHostile(engine, 'p1', 'p2');
    const colony1 = getFirstColony(engine, 'p1');
    const systemId = colony1.systemId;
    // Spawn many ships to ensure combat is decisive
    for (let i = 0; i < 5; i++) spawnCorvette(engine, 'p1', systemId);
    for (let i = 0; i < 5; i++) spawnCorvette(engine, 'p2', systemId);
    spawnCorvette(engine, 'p3', systemId);
    engine._checkFleetCombat();
    const p3Ships = engine._militaryShipsByPlayer.get('p3') || [];
    assert.strictEqual(p3Ships.length, 1, 'Neutral p3 ship must survive hostile combat between p1 and p2');
  });
});

// ── Serialization Edge Cases ──

describe('Diplomacy Serialization — Edge Cases', () => {
  it('stanceTowardMe shows neutral for players with no diplomacy entry', () => {
    const engine = createEngine({ threePlayer: true });
    engine._invalidateStateCache();
    const state = engine.getPlayerState('p1');
    const p3 = state.players.find(p => p.id === 'p3');
    assert.strictEqual(p3.stanceTowardMe, 'neutral', 'Default stanceTowardMe should be neutral');
  });

  it('pendingFriendly serializes as array', () => {
    const engine = createEngine({ threePlayer: true });
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    engine.tickCount = 1; // avoid cooldown
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p3', stance: 'friendly' });
    const serialized = engine._serializeDiplomacy('p1');
    assert.ok(Array.isArray(serialized.pendingFriendly));
    assert.strictEqual(serialized.pendingFriendly.length, 2);
    assert.ok(serialized.pendingFriendly.includes('p2'));
    assert.ok(serialized.pendingFriendly.includes('p3'));
  });

  it('getPlayerStateJSON includes diplomacy data', () => {
    const engine = createEngine();
    makeHostile(engine, 'p1', 'p2');
    engine._invalidateStateCache();
    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    const me = parsed.players.find(p => p.id === 'p1');
    assert.ok(me.diplomacy, 'JSON state should include diplomacy');
    assert.strictEqual(me.diplomacy.stances['p2'].stance, 'hostile');
  });

  it('serialized diplomacy survives JSON roundtrip', () => {
    const engine = createEngine();
    makeFriendly(engine, 'p1', 'p2');
    const serialized = engine._serializeDiplomacy('p1');
    const roundtripped = JSON.parse(JSON.stringify(serialized));
    assert.deepStrictEqual(roundtripped.stances['p2'].stance, 'friendly');
    assert.ok(Array.isArray(roundtripped.pendingFriendly));
  });
});

// ── Cache Invalidation ──

describe('Diplomacy — Cache Invalidation', () => {
  it('war declaration that breaks alliance invalidates production caches', () => {
    const engine = createEngine();
    makeFriendly(engine, 'p1', 'p2');
    const colony1 = getFirstColony(engine, 'p1');
    // Populate production cache
    engine._calcProduction(colony1);
    assert.notStrictEqual(colony1._cachedProduction, null, 'Cache should be populated');
    // Break alliance with war
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS + 1;
    makeHostile(engine, 'p1', 'p2');
    // Production caches must be invalidated so the friendly bonus is removed
    assert.strictEqual(colony1._cachedProduction, null,
      'Production cache should be invalidated when alliance is broken by war');
  });

  it('VP cache invalidates on every diplomacy change', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine._vpCacheTick = 999; // set to some positive value
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    assert.strictEqual(engine._vpCacheTick, -1, 'VP cache should be invalidated');
  });

  it('accepting friendly invalidates production caches for all colonies', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    // Populate caches
    for (const colony of engine.colonies.values()) {
      engine._calcProduction(colony);
    }
    // Accept
    engine.handleCommand('p2', { type: 'acceptDiplomacy', targetPlayerId: 'p1' });
    // All colony caches should be cleared
    for (const colony of engine.colonies.values()) {
      assert.strictEqual(colony._cachedProduction, null,
        `Colony ${colony.id} production cache should be invalidated after alliance formation`);
    }
  });
});

// ── Influence Edge Cases ──

describe('Diplomacy — Influence Deduction Edge Cases', () => {
  it('influence deducted even when proposing friendly (proposal costs influence)', () => {
    const engine = createEngine();
    const state = engine.playerStates.get('p1');
    state.resources.influence = 100;
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    assert.strictEqual(state.resources.influence, 75, 'Friendly proposal should deduct influence');
  });

  it('influence deducted for neutral transition', () => {
    const engine = createEngine();
    makeHostile(engine, 'p1', 'p2');
    const state = engine.playerStates.get('p1');
    state.resources.influence = 100;
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS + 1;
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'neutral' });
    assert.strictEqual(state.resources.influence, 75, 'Neutral transition should deduct influence');
  });

  it('exactly enough influence allows stance change', () => {
    const engine = createEngine();
    const state = engine.playerStates.get('p1');
    state.resources.influence = DIPLOMACY_INFLUENCE_COST; // exactly 25
    const result = engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    assert.ok(result.ok, 'Exactly enough influence should succeed');
    assert.strictEqual(state.resources.influence, 0);
  });

  it('one less than needed influence rejects', () => {
    const engine = createEngine();
    const state = engine.playerStates.get('p1');
    state.resources.influence = DIPLOMACY_INFLUENCE_COST - 1;
    const result = engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    assert.ok(result.error);
  });

  it('NaN influence rejects stance change', () => {
    const engine = createEngine();
    const state = engine.playerStates.get('p1');
    state.resources.influence = NaN;
    const result = engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    assert.ok(result.error, 'NaN influence should be rejected');
  });
});

// ── Multiple Pending Requests ──

describe('Diplomacy — Multiple Pending Friendly Requests', () => {
  it('player can have pending requests to multiple targets', () => {
    const engine = createEngine({ threePlayer: true });
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    engine.tickCount = 1;
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p3', stance: 'friendly' });
    assert.ok(engine.playerStates.get('p1').pendingFriendly.has('p2'));
    assert.ok(engine.playerStates.get('p1').pendingFriendly.has('p3'));
  });

  it('accepting one proposal does not affect other pending proposals', () => {
    const engine = createEngine({ threePlayer: true });
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    engine.tickCount = 1;
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p3', stance: 'friendly' });
    // p2 accepts
    engine.handleCommand('p2', { type: 'acceptDiplomacy', targetPlayerId: 'p1' });
    assert.strictEqual(engine._areMutuallyFriendly('p1', 'p2'), true);
    // p3 request should still be pending
    assert.ok(engine.playerStates.get('p1').pendingFriendly.has('p3'),
      'Pending request to p3 should still exist after p2 accepts');
  });

  it('war declaration clears only the specific pending request', () => {
    const engine = createEngine({ threePlayer: true });
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    engine.tickCount = 1;
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p3', stance: 'friendly' });
    // Declare war on p2 (skip cooldown)
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS + 1;
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    assert.strictEqual(engine.playerStates.get('p1').pendingFriendly.has('p2'), false);
    assert.ok(engine.playerStates.get('p1').pendingFriendly.has('p3'),
      'Pending request to p3 should survive war with p2');
  });
});

// ── _areHostile Asymmetry ──

describe('_areHostile — Asymmetric Behavior', () => {
  it('one-sided hostile (after one player reverts) still counts as hostile', () => {
    const engine = createEngine();
    makeHostile(engine, 'p1', 'p2');
    // p1 reverts to neutral
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS + 1;
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'neutral' });
    assert.strictEqual(engine._getStance('p1', 'p2'), 'neutral');
    assert.strictEqual(engine._getStance('p2', 'p1'), 'hostile');
    assert.strictEqual(engine._areHostile('p1', 'p2'), true,
      'One-sided hostility should still enable combat');
  });

  it('combat triggers between one-sided hostile pair', () => {
    const engine = createEngine();
    makeHostile(engine, 'p1', 'p2');
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS + 1;
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'neutral' });
    // p1 is neutral toward p2, p2 is still hostile toward p1
    const colony1 = getFirstColony(engine, 'p1');
    spawnCorvette(engine, 'p1', colony1.systemId);
    spawnCorvette(engine, 'p2', colony1.systemId);
    engine._checkFleetCombat();
    assert.ok(engine._militaryShips.length < 2,
      'Combat should trigger even with one-sided hostility');
  });
});

// ── Event Broadcasting ──

describe('Diplomacy Events — Broadcast Coverage', () => {
  it('warDeclared event includes aggressor and target names', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    const events = engine._flushEvents() || [];
    const warEvent = events.find(e => e.eventType === 'warDeclared');
    assert.ok(warEvent);
    assert.strictEqual(warEvent.aggressorName, 'Player 1');
    assert.strictEqual(warEvent.targetName, 'Player 2');
  });

  it('warDeclared broadcasts to all players in game', () => {
    const engine = createEngine({ threePlayer: true });
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    const events = engine._flushEvents() || [];
    const warEvents = events.filter(e => e.eventType === 'warDeclared');
    // All 3 players should get the event
    const recipients = warEvents.map(e => e.playerId);
    assert.ok(recipients.includes('p1'));
    assert.ok(recipients.includes('p2'));
    assert.ok(recipients.includes('p3'));
  });

  it('allianceFormed broadcasts to all players including third parties', () => {
    const engine = createEngine({ threePlayer: true });
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    engine._flushEvents();
    engine.handleCommand('p2', { type: 'acceptDiplomacy', targetPlayerId: 'p1' });
    const events = engine._flushEvents() || [];
    const allianceEvents = events.filter(e => e.eventType === 'allianceFormed');
    const recipients = allianceEvents.map(e => e.playerId);
    assert.ok(recipients.includes('p3'), 'Third party should also receive allianceFormed event');
  });

  it('friendlyProposed event only sent to target player', () => {
    const engine = createEngine({ threePlayer: true });
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    const events = engine._flushEvents() || [];
    const proposeEvents = events.filter(e => e.eventType === 'friendlyProposed');
    assert.strictEqual(proposeEvents.length, 1, 'Only target should receive friendlyProposed');
    assert.strictEqual(proposeEvents[0].playerId, 'p2');
  });
});

// ── Production Bonus Precision ──

describe('Friendly Production Bonus — Deterministic Behavior', () => {
  it('_hasFriendlyColonyNearby returns false for player with no allies', () => {
    const engine = createEngine();
    makeHostile(engine, 'p1', 'p2');
    const colony1 = getFirstColony(engine, 'p1');
    assert.strictEqual(engine._hasFriendlyColonyNearby(colony1), false);
  });

  it('bonus only applies to positive production values', () => {
    const engine = createEngine();
    makeFriendly(engine, 'p1', 'p2');
    const colony1 = getFirstColony(engine, 'p1');
    colony1._cachedProduction = null;
    const { production } = engine._calcProduction(colony1);
    // Verify no resource is negative (bonus should not make zero resources positive)
    for (const [resource, value] of Object.entries(production)) {
      assert.ok(value >= 0, `${resource} production should not be negative`);
    }
  });
});

// ── Re-proposing After Rejection / Withdrawal ──

describe('Diplomacy — Re-proposal and State Transitions', () => {
  it('can re-propose friendly after going neutral (cooldown permitting)', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    // Go back to hostile (skip cooldown)
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS + 1;
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    // Re-propose friendly (skip cooldown again)
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS * 2 + 2;
    const result = engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    assert.ok(result.ok, 'Should be able to re-propose friendly after hostile');
    assert.ok(engine.playerStates.get('p1').pendingFriendly.has('p2'));
  });

  it('full lifecycle: neutral → hostile → neutral → friendly → mutual friendly', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');

    // Start neutral
    assert.strictEqual(engine._getStance('p1', 'p2'), 'neutral');

    // Go hostile
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    assert.strictEqual(engine._areHostile('p1', 'p2'), true);

    // p1 goes neutral
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS + 1;
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'neutral' });
    // p2 also goes neutral
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS * 2 + 2;
    engine.handleCommand('p2', { type: 'setDiplomacy', targetPlayerId: 'p1', stance: 'neutral' });
    assert.strictEqual(engine._areHostile('p1', 'p2'), false);

    // p1 proposes friendly
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS * 3 + 3;
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    // p2 accepts
    engine.handleCommand('p2', { type: 'acceptDiplomacy', targetPlayerId: 'p1' });
    assert.strictEqual(engine._areMutuallyFriendly('p1', 'p2'), true);
  });
});
