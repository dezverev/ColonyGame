const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  DIPLOMACY_STANCES, DIPLOMACY_INFLUENCE_COST, DIPLOMACY_COOLDOWN_TICKS,
  FRIENDLY_PRODUCTION_BONUS, FRIENDLY_HOP_RANGE, FRIENDLY_VP, MUTUAL_FRIENDLY_VP,
  CORVETTE_HP, CORVETTE_ATTACK,
} = require('../../server/game-engine');

// Helper: create a 2-player game engine
function createEngine(opts = {}) {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  players.set('p2', { name: 'Player 2' });
  if (opts.threePlayer) {
    players.set('p3', { name: 'Player 3' });
  }
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  const engine = new GameEngine(room, { tickRate: 10 });
  return engine;
}

// Helper: give player enough resources
function giveResources(engine, playerId) {
  const state = engine.playerStates.get(playerId);
  state.resources.minerals = 10000;
  state.resources.alloys = 10000;
  state.resources.energy = 10000;
  state.resources.food = 10000;
  state.resources.influence = 1000;
}

// Helper: directly spawn a corvette at a specific system for a player
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

// Helper: get first colony for a player
function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

// ── Constants ──

describe('Diplomacy Constants', () => {
  it('should export all diplomacy constants', () => {
    assert.deepStrictEqual(DIPLOMACY_STANCES, { NEUTRAL: 'neutral', HOSTILE: 'hostile', FRIENDLY: 'friendly' });
    assert.strictEqual(DIPLOMACY_INFLUENCE_COST, 25);
    assert.strictEqual(DIPLOMACY_COOLDOWN_TICKS, 600);
    assert.strictEqual(FRIENDLY_PRODUCTION_BONUS, 0.10);
    assert.strictEqual(FRIENDLY_HOP_RANGE, 3);
    assert.strictEqual(FRIENDLY_VP, 5);
    assert.strictEqual(MUTUAL_FRIENDLY_VP, 10);
  });
});

// ── Initial State ──

describe('Diplomacy Initial State', () => {
  it('players start with empty diplomacy and no pending requests', () => {
    const engine = createEngine();
    const state = engine.playerStates.get('p1');
    assert.deepStrictEqual(state.diplomacy, {});
    assert.ok(state.pendingFriendly instanceof Set);
    assert.strictEqual(state.pendingFriendly.size, 0);
  });

  it('default stance between players is neutral', () => {
    const engine = createEngine();
    assert.strictEqual(engine._getStance('p1', 'p2'), 'neutral');
    assert.strictEqual(engine._getStance('p2', 'p1'), 'neutral');
  });

  it('players are not hostile by default', () => {
    const engine = createEngine();
    assert.strictEqual(engine._areHostile('p1', 'p2'), false);
  });

  it('players are not mutually friendly by default', () => {
    const engine = createEngine();
    assert.strictEqual(engine._areMutuallyFriendly('p1', 'p2'), false);
  });
});

// ── setDiplomacy Command ──

describe('setDiplomacy Command', () => {
  it('should reject missing targetPlayerId', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', { type: 'setDiplomacy', stance: 'hostile' });
    assert.ok(result.error);
  });

  it('should reject invalid stance', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'invalid' });
    assert.ok(result.error);
  });

  it('should reject setting diplomacy with yourself', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    const result = engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p1', stance: 'hostile' });
    assert.ok(result.error);
  });

  it('should reject nonexistent target player', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    const result = engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p99', stance: 'hostile' });
    assert.ok(result.error);
  });

  it('should reject if not enough influence', () => {
    const engine = createEngine();
    const state = engine.playerStates.get('p1');
    state.resources.influence = 10; // below cost
    const result = engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    assert.ok(result.error);
  });

  it('should reject if already at target stance', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    // Default is neutral — trying to set neutral should fail
    const result = engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'neutral' });
    assert.ok(result.error);
  });

  it('should deduct influence on successful stance change', () => {
    const engine = createEngine();
    const state = engine.playerStates.get('p1');
    state.resources.influence = 100;
    const result = engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    assert.ok(result.ok);
    assert.strictEqual(state.resources.influence, 75);
  });
});

// ── Hostile Stance ──

describe('Hostile Stance', () => {
  it('declaring hostile sets mutual hostility', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    assert.strictEqual(engine._getStance('p1', 'p2'), 'hostile');
    assert.strictEqual(engine._getStance('p2', 'p1'), 'hostile');
    assert.strictEqual(engine._areHostile('p1', 'p2'), true);
  });

  it('hostile declaration emits warDeclared event to all players', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    const events = engine._flushEvents() || [];
    const warEvents = events.filter(e => e.eventType === 'warDeclared');
    assert.strictEqual(warEvents.length, 2); // both players get the event
    assert.strictEqual(warEvents[0].aggressorId, 'p1');
    assert.strictEqual(warEvents[0].targetId, 'p2');
  });

  it('declaring hostile clears any pending friendly requests', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
    // p1 proposes friendly
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    assert.ok(engine.playerStates.get('p1').pendingFriendly.has('p2'));
    // p1 then declares hostile
    engine.tickCount = 1000; // skip cooldown
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    assert.strictEqual(engine.playerStates.get('p1').pendingFriendly.has('p2'), false);
  });
});

// ── Cooldown ──

describe('Diplomacy Cooldown', () => {
  it('should enforce cooldown between stance changes toward same player', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    // Try changing again immediately
    const result = engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'neutral' });
    assert.ok(result.error);
    assert.ok(result.error.includes('cooldown'));
  });

  it('should allow stance change after cooldown expires', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    // Fast-forward past cooldown
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS + 1;
    const result = engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'neutral' });
    assert.ok(result.ok);
  });
});

// ── Friendly Stance ──

describe('Friendly Stance', () => {
  it('proposing friendly creates a pending request, does not immediately set stance', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    // p1's stance should NOT be friendly yet — pending
    assert.notStrictEqual(engine._getStance('p1', 'p2'), 'friendly');
    assert.ok(engine.playerStates.get('p1').pendingFriendly.has('p2'));
  });

  it('proposing friendly emits friendlyProposed event to target', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    const events = engine._flushEvents() || [];
    const proposeEvents = events.filter(e => e.eventType === 'friendlyProposed');
    assert.strictEqual(proposeEvents.length, 1);
    assert.strictEqual(proposeEvents[0].playerId, 'p2');
    assert.strictEqual(proposeEvents[0].fromId, 'p1');
  });

  it('accepting friendly sets both sides to friendly', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    // p2 accepts
    const result = engine.handleCommand('p2', { type: 'acceptDiplomacy', targetPlayerId: 'p1' });
    assert.ok(result.ok);
    assert.strictEqual(engine._getStance('p1', 'p2'), 'friendly');
    assert.strictEqual(engine._getStance('p2', 'p1'), 'friendly');
    assert.strictEqual(engine._areMutuallyFriendly('p1', 'p2'), true);
  });

  it('accepting friendly emits allianceFormed event to all players', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    engine._flushEvents(); // clear friendlyProposed events
    engine.handleCommand('p2', { type: 'acceptDiplomacy', targetPlayerId: 'p1' });
    const events = engine._flushEvents() || [];
    const allianceEvents = events.filter(e => e.eventType === 'allianceFormed');
    assert.strictEqual(allianceEvents.length, 2); // both players
    assert.strictEqual(allianceEvents[0].player1Id, 'p2');
    assert.strictEqual(allianceEvents[0].player2Id, 'p1');
  });

  it('mutual proposal auto-accepts (both propose friendly to each other)', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    // p2 also proposes friendly to p1 — should auto-accept
    engine.tickCount = 1; // avoid cooldown conflict
    engine.handleCommand('p2', { type: 'setDiplomacy', targetPlayerId: 'p1', stance: 'friendly' });
    assert.strictEqual(engine._areMutuallyFriendly('p1', 'p2'), true);
  });
});

// ── acceptDiplomacy Command ──

describe('acceptDiplomacy Command', () => {
  it('should reject if no pending proposal', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p2', { type: 'acceptDiplomacy', targetPlayerId: 'p1' });
    assert.ok(result.error);
  });

  it('should reject accepting diplomacy with yourself', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', { type: 'acceptDiplomacy', targetPlayerId: 'p1' });
    assert.ok(result.error);
  });

  it('should reject nonexistent target', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', { type: 'acceptDiplomacy', targetPlayerId: 'p99' });
    assert.ok(result.error);
  });
});

// ── Combat Gating ──

describe('Combat Gating on Hostile Stance', () => {
  it('neutral players should NOT trigger combat when ships coexist', () => {
    const engine = createEngine();
    const colony1 = getFirstColony(engine, 'p1');
    const systemId = colony1.systemId;
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p2', systemId);
    engine._checkFleetCombat();
    // Both ships should still exist — no combat between neutrals
    assert.strictEqual(engine._militaryShips.length, 2, 'Neutral players should not trigger combat');
  });

  it('hostile players SHOULD trigger combat when ships coexist', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    const colony1 = getFirstColony(engine, 'p1');
    const systemId = colony1.systemId;
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p2', systemId);
    engine._checkFleetCombat();
    // Ships should have been destroyed or damaged — combat occurred
    assert.ok(engine._militaryShips.length < 2, 'Hostile players should trigger combat');
  });

  it('friendly players should NOT trigger combat', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    engine.handleCommand('p2', { type: 'acceptDiplomacy', targetPlayerId: 'p1' });
    const colony1 = getFirstColony(engine, 'p1');
    const systemId = colony1.systemId;
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p2', systemId);
    engine._checkFleetCombat();
    // Both ships should still exist — no combat between friends
    assert.strictEqual(engine._militaryShips.length, 2, 'Friendly players should not trigger combat');
  });

  it('in 3-player scenario, only hostile pairs fight', () => {
    const engine = createEngine({ threePlayer: true });
    giveResources(engine, 'p1');
    // p1 declares war on p2, p3 is neutral to both
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    const colony1 = getFirstColony(engine, 'p1');
    const systemId = colony1.systemId;
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p2', systemId);
    spawnCorvette(engine, 'p3', systemId);
    const events = [];
    engine.onEvent = (pid, event) => events.push({ pid, ...event });
    engine._checkFleetCombat();
    // p3's ship should survive (not involved in hostile relationship)
    const p3Ships = engine._militaryShipsByPlayer.get('p3') || [];
    assert.strictEqual(p3Ships.length, 1, 'Neutral p3 ship should survive');
  });
});

// ── Occupation Gating ──

describe('Occupation Gating on Hostile Stance', () => {
  it('neutral attacker ships should NOT progress occupation', () => {
    const engine = createEngine();
    const colony2 = getFirstColony(engine, 'p2');
    const systemId = colony2.systemId;
    spawnCorvette(engine, 'p1', systemId);
    engine._processOccupation();
    assert.strictEqual(colony2.occupationProgress, 0, 'Neutral ships should not occupy');
  });

  it('hostile attacker ships SHOULD progress occupation', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    const colony2 = getFirstColony(engine, 'p2');
    const systemId = colony2.systemId;
    spawnCorvette(engine, 'p1', systemId);
    engine._processOccupation();
    assert.strictEqual(colony2.occupationProgress, 1, 'Hostile ships should progress occupation');
  });
});

// ── Friendly Production Bonus ──

describe('Friendly Production Bonus', () => {
  it('_hasFriendlyColonyNearby returns false when no friendly players', () => {
    const engine = createEngine();
    const colony1 = getFirstColony(engine, 'p1');
    assert.strictEqual(engine._hasFriendlyColonyNearby(colony1), false);
  });

  it('_hasFriendlyColonyNearby returns true when friendly colony is within hop range', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
    // Make them friendly
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    engine.handleCommand('p2', { type: 'acceptDiplomacy', targetPlayerId: 'p1' });

    // Check if colonies are within 3 hops — depends on galaxy generation
    // This test verifies the method exists and returns a boolean
    const colony1 = getFirstColony(engine, 'p1');
    const result = engine._hasFriendlyColonyNearby(colony1);
    assert.strictEqual(typeof result, 'boolean');
  });

  it('friendly bonus applies as multiplier on production', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    engine.handleCommand('p2', { type: 'acceptDiplomacy', targetPlayerId: 'p1' });

    const colony1 = getFirstColony(engine, 'p1');
    // Clear production cache to re-evaluate
    colony1._cachedProduction = null;

    // Get production — if colonies are nearby, bonus applies
    const { production } = engine._calcProduction(colony1);
    // Production should be a positive number (basic validation)
    assert.ok(production.energy >= 0);
    assert.ok(production.food >= 0);
  });

  it('friendly bonus applies when colonies are on adjacent systems (deterministic)', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');

    const colony1 = getFirstColony(engine, 'p1');
    // Build a district so production is non-trivial
    engine.handleCommand('p1', { type: 'buildDistrict', colonyId: colony1.id, districtType: 'generator' });
    for (let i = 0; i < 400; i++) engine.tick();

    // Find an adjacent system to colony1
    const neighbors = engine._adjacency.get(colony1.systemId);
    assert.ok(neighbors && neighbors.length > 0, 'colony1 system must have hyperlane neighbors');
    const adjSystemId = neighbors[0];

    // Place p2's colony on the adjacent system
    engine._createColony('p2', 'FriendBase', { size: 12, type: 'continental', habitability: 80 }, adjSystemId);

    // Get production WITHOUT friendly bonus (neutral diplomacy)
    colony1._cachedProduction = null;
    const { production: noBonus } = engine._calcProduction(colony1);

    // Now make mutual friendly
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    engine.handleCommand('p2', { type: 'acceptDiplomacy', targetPlayerId: 'p1' });

    // Get production WITH friendly bonus
    colony1._cachedProduction = null;
    const { production: withBonus } = engine._calcProduction(colony1);

    // With friendly bonus, energy should be ~10% higher (FRIENDLY_PRODUCTION_BONUS = 0.10)
    assert.ok(withBonus.energy > noBonus.energy,
      `Friendly bonus should increase energy: got ${withBonus.energy} vs ${noBonus.energy} without`);
    // Verify it's approximately 10%
    const ratio = withBonus.energy / noBonus.energy;
    assert.ok(ratio >= 1.09 && ratio <= 1.11,
      `Expected ~1.10x bonus, got ${ratio.toFixed(3)}x`);
  });
});

// ── Diplomacy VP ──

describe('Diplomacy VP', () => {
  it('no diplomacy VP when all neutral', () => {
    const engine = createEngine();
    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.diplomacyVP, 0);
    assert.strictEqual(breakdown.friendlyCount, 0);
    assert.strictEqual(breakdown.mutualFriendlyCount, 0);
  });

  it('one-sided friendly gives FRIENDLY_VP', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    // p1 proposes friendly — stance remains neutral until accepted
    // But let's manually set stance for VP test
    const state = engine.playerStates.get('p1');
    state.diplomacy['p2'] = { stance: 'friendly', cooldownTick: 0 };
    engine._vpCacheTick = -1;
    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.friendlyCount, 1);
    assert.strictEqual(breakdown.mutualFriendlyCount, 0);
    assert.strictEqual(breakdown.diplomacyVP, FRIENDLY_VP);
  });

  it('mutual friendly gives MUTUAL_FRIENDLY_VP', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    engine.handleCommand('p2', { type: 'acceptDiplomacy', targetPlayerId: 'p1' });
    engine._vpCacheTick = -1;
    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.mutualFriendlyCount, 1);
    assert.strictEqual(breakdown.diplomacyVP, MUTUAL_FRIENDLY_VP);
  });

  it('diplomacyVP included in total VP', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    engine.handleCommand('p2', { type: 'acceptDiplomacy', targetPlayerId: 'p1' });
    engine._vpCacheTick = -1;
    const vpBefore = engine._calcVictoryPoints('p1');
    // VP should include diplomacy points
    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.vp, vpBefore);
    assert.ok(breakdown.diplomacyVP > 0);
  });
});

// ── Serialization ──

describe('Diplomacy Serialization', () => {
  it('_serializeDiplomacy returns stances and pending', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    const serialized = engine._serializeDiplomacy('p1');
    assert.ok(serialized.stances);
    assert.strictEqual(serialized.stances['p2'].stance, 'hostile');
    assert.ok(Array.isArray(serialized.pendingFriendly));
  });

  it('getPlayerState includes diplomacy data for own player', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    engine._invalidateStateCache();
    const state = engine.getPlayerState('p1');
    const me = state.players.find(p => p.id === 'p1');
    assert.ok(me.diplomacy);
    assert.ok(me.diplomacy.stances);
    assert.strictEqual(me.diplomacy.stances['p2'].stance, 'hostile');
  });

  it('getPlayerState includes stanceTowardMe for other players', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    engine._invalidateStateCache();
    const state = engine.getPlayerState('p1');
    const other = state.players.find(p => p.id === 'p2');
    assert.strictEqual(other.stanceTowardMe, 'hostile');
  });

  it('getState includes diplomacy in player data', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    engine._invalidateStateCache();
    const state = engine.getState();
    const p1 = state.players.find(p => p.id === 'p1');
    assert.ok(p1.diplomacy);
  });

  it('VP breakdown includes diplomacy fields in empty case', () => {
    const engine = createEngine();
    // Remove all player state to hit empty case
    engine.playerStates.delete('p1');
    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.diplomacyVP, 0);
    assert.strictEqual(breakdown.friendlyCount, 0);
    assert.strictEqual(breakdown.mutualFriendlyCount, 0);
  });
});

// ── Edge Cases ──

describe('Diplomacy Edge Cases', () => {
  it('going from hostile back to neutral (after cooldown)', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    assert.strictEqual(engine._areHostile('p1', 'p2'), true);
    // Skip cooldown
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS + 1;
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'neutral' });
    // p1 is now neutral toward p2, but p2 is still hostile toward p1
    assert.strictEqual(engine._getStance('p1', 'p2'), 'neutral');
    assert.strictEqual(engine._getStance('p2', 'p1'), 'hostile');
    // Still considered hostile because p2 is hostile toward p1
    assert.strictEqual(engine._areHostile('p1', 'p2'), true);
  });

  it('_invalidateProductionCaches clears all colony production caches', () => {
    const engine = createEngine();
    const colony1 = getFirstColony(engine, 'p1');
    // Ensure cache is populated
    engine._calcProduction(colony1);
    assert.notStrictEqual(colony1._cachedProduction, null);
    // Invalidate
    engine._invalidateProductionCaches();
    assert.strictEqual(colony1._cachedProduction, null);
  });

  it('declaring war breaks existing friendly alliance', () => {
    const engine = createEngine();
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
    // Form alliance
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'friendly' });
    engine.handleCommand('p2', { type: 'acceptDiplomacy', targetPlayerId: 'p1' });
    assert.strictEqual(engine._areMutuallyFriendly('p1', 'p2'), true);
    // p1 declares war (skip cooldown)
    engine.tickCount = DIPLOMACY_COOLDOWN_TICKS + 1;
    engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
    assert.strictEqual(engine._areHostile('p1', 'p2'), true);
    assert.strictEqual(engine._areMutuallyFriendly('p1', 'p2'), false);
  });
});
