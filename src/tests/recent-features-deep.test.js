const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine, GIFT_MIN_AMOUNT, GIFT_COOLDOWN_TICKS, GIFT_ALLOWED_RESOURCES,
  MONTH_TICKS, DIPLOMACY_STANCES,
  CATALYST_RESOURCE_RUSH_PCT, CATALYST_RUSH_DURATION, CATALYST_RUSH_INCOME,
  CATALYST_TECH_AUCTION_PCT, CATALYST_AUCTION_WINDOW,
} = require('../../server/game-engine');

// Helper: create a 2-player engine
function makeTwoPlayerEngine(matchMinutes = 20) {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  players.set('p2', { name: 'Player 2' });
  const room = { players, galaxySize: 'small', matchTimer: matchMinutes };
  const engine = new GameEngine(room, { tickRate: 10 });
  engine._doctrinePhase = false;
  return engine;
}

function advanceTo(engine, pct) {
  const ticksElapsed = Math.floor(engine._matchTicksTotal * pct);
  engine._matchTicksRemaining = engine._matchTicksTotal - ticksElapsed;
  engine.tickCount = ticksElapsed;
}

function processCatalystAndFlush(engine) {
  engine._processCatalystEvents();
  return engine._flushEvents() || [];
}

// ══════════════════════════════════════════════════════
// Deferred State Cache Invalidation (perf change)
// ══════════════════════════════════════════════════════

describe('Deferred State Cache — _stateCacheDirty flag', () => {
  let engine;
  beforeEach(() => { engine = makeTwoPlayerEngine(); });

  it('_stateCacheDirty starts true after construction (constructor invalidates)', () => {
    assert.strictEqual(engine._stateCacheDirty, true);
  });

  it('_invalidateStateCache sets dirty flag to true', () => {
    engine._invalidateStateCache();
    assert.strictEqual(engine._stateCacheDirty, true);
  });

  it('getPlayerStateJSON clears dirty flag on read', () => {
    engine._invalidateStateCache();
    assert.strictEqual(engine._stateCacheDirty, true);

    engine.getPlayerStateJSON('p1');
    assert.strictEqual(engine._stateCacheDirty, false);
  });

  it('multiple invalidations between reads result in single Map.clear()', () => {
    // Prime cache
    engine.getPlayerStateJSON('p1');
    engine.getPlayerStateJSON('p2');
    assert.strictEqual(engine._cachedPlayerJSON.size, 2);

    // Multiple invalidations
    engine._invalidateStateCache();
    engine._invalidateStateCache();
    engine._invalidateStateCache();
    assert.strictEqual(engine._stateCacheDirty, true);
    // Map is NOT cleared yet (deferred)
    assert.strictEqual(engine._cachedPlayerJSON.size, 2);

    // Read triggers the deferred clear
    engine.getPlayerStateJSON('p1');
    assert.strictEqual(engine._stateCacheDirty, false);
    // Only p1 re-cached now
    assert.strictEqual(engine._cachedPlayerJSON.size, 1);
  });

  it('cached JSON is stale after invalidation — fresh read returns updated data', () => {
    const json1 = engine.getPlayerStateJSON('p1');
    const parsed1 = JSON.parse(json1);
    const me1 = parsed1.players.find(p => p.id === 'p1');
    const energyBefore = me1.resources.energy;

    // Mutate state and invalidate
    engine.playerStates.get('p1').resources.energy += 999;
    engine._invalidateStateCache();

    const json2 = engine.getPlayerStateJSON('p1');
    const parsed2 = JSON.parse(json2);
    const me2 = parsed2.players.find(p => p.id === 'p1');
    assert.strictEqual(me2.resources.energy, energyBefore + 999);
    assert.notStrictEqual(json1, json2);
  });

  it('without invalidation, cached JSON is returned (same reference)', () => {
    const json1 = engine.getPlayerStateJSON('p1');
    const json2 = engine.getPlayerStateJSON('p1');
    assert.strictEqual(json1, json2, 'should be same cached string reference');
  });

  it('dirty flag is set by resource gifting', () => {
    engine.getPlayerStateJSON('p1'); // prime
    engine._stateCacheDirty = false;

    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });
    assert.strictEqual(engine._stateCacheDirty, true);
  });
});

// ══════════════════════════════════════════════════════
// Resource Gifting — additional edge cases
// ══════════════════════════════════════════════════════

describe('Resource Gifting Deep — input validation edge cases', () => {
  let engine;
  beforeEach(() => { engine = makeTwoPlayerEngine(); });

  it('rejects string amount', () => {
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: '50' });
    assert.ok(result.error, 'string amount should be rejected');
  });

  it('rejects Infinity amount', () => {
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: Infinity });
    assert.ok(result.error, 'Infinity amount should be rejected');
  });

  it('rejects -Infinity amount', () => {
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: -Infinity });
    assert.ok(result.error, '-Infinity amount should be rejected');
  });

  it('rejects amount = 0', () => {
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 0 });
    assert.ok(result.error, 'zero amount should be rejected');
  });

  it('rejects null amount', () => {
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: null });
    assert.ok(result.error, 'null amount should be rejected');
  });

  it('rejects undefined resource', () => {
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: undefined, amount: 25 });
    assert.ok(result.error);
  });

  it('rejects empty string resource', () => {
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: '', amount: 25 });
    assert.ok(result.error);
  });

  it('rejects amount that exceeds sender balance by 1', () => {
    engine.playerStates.get('p1').resources.energy = 30;
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 31 });
    assert.strictEqual(result.error, 'Not enough resources');
  });
});

describe('Resource Gifting Deep — large transfer integrity', () => {
  let engine;
  beforeEach(() => { engine = makeTwoPlayerEngine(); });

  it('large gift transfers exact amount without floating point drift', () => {
    const p1 = engine.playerStates.get('p1');
    const p2 = engine.playerStates.get('p2');
    p1.resources.minerals = 10000;
    const p2Before = p2.resources.minerals;

    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'minerals', amount: 9999 });
    assert.strictEqual(p1.resources.minerals, 1);
    assert.strictEqual(p2.resources.minerals, p2Before + 9999);
  });

  it('back-to-back gifts between players (after cooldown) net correctly', () => {
    const p1 = engine.playerStates.get('p1');
    const p2 = engine.playerStates.get('p2');
    const p1EnergyStart = p1.resources.energy;
    const p2EnergyStart = p2.resources.energy;

    // p1 sends 50 to p2
    engine.tickCount = 0;
    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 50 });

    // p2 sends 30 back to p1
    engine.handleCommand('p2', { type: 'giftResources', targetPlayerId: 'p1', resource: 'energy', amount: 30 });

    assert.strictEqual(p1.resources.energy, p1EnergyStart - 50 + 30);
    assert.strictEqual(p2.resources.energy, p2EnergyStart + 50 - 30);
  });
});

describe('Resource Gifting Deep — event payload completeness', () => {
  let engine;
  beforeEach(() => { engine = makeTwoPlayerEngine(); });

  it('sent event contains all required fields', () => {
    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'minerals', amount: 100 });
    const events = engine._flushEvents() || [];
    const sent = events.find(e => e.eventType === 'resourceGift' && e.playerId === 'p1');

    assert.strictEqual(sent.direction, 'sent');
    assert.strictEqual(sent.resource, 'minerals');
    assert.strictEqual(sent.amount, 100);
    assert.strictEqual(sent.targetId, 'p2');
    assert.strictEqual(sent.senderId, 'p1');
    assert.strictEqual(sent.senderName, 'Player 1');
    assert.strictEqual(sent.targetName, 'Player 2');
  });

  it('received event contains sender name for display', () => {
    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'food', amount: 25 });
    const events = engine._flushEvents() || [];
    const received = events.find(e => e.eventType === 'resourceGift' && e.playerId === 'p2');

    assert.strictEqual(received.direction, 'received');
    assert.strictEqual(received.senderName, 'Player 1');
    assert.strictEqual(received.targetName, 'Player 2');
  });
});

describe('Resource Gifting Deep — cooldown boundary precision', () => {
  let engine;
  beforeEach(() => { engine = makeTwoPlayerEngine(); });

  it('gift at tick 0 sets cooldown expiry to exactly GIFT_COOLDOWN_TICKS', () => {
    engine.tickCount = 0;
    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });
    assert.strictEqual(engine._giftCooldowns.get('p1'), GIFT_COOLDOWN_TICKS);
  });

  it('blocked at cooldownExpiry - 1, allowed at exactly cooldownExpiry', () => {
    engine.tickCount = 500;
    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });
    const expiry = engine._giftCooldowns.get('p1');

    engine.tickCount = expiry - 1;
    const blocked = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });
    assert.strictEqual(blocked.error, 'Gift on cooldown');

    engine.tickCount = expiry;
    const allowed = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });
    assert.deepStrictEqual(allowed, { ok: true });
  });

  it('cooldown resets after second gift', () => {
    engine.tickCount = 0;
    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });

    engine.tickCount = GIFT_COOLDOWN_TICKS;
    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });

    assert.strictEqual(engine._giftCooldowns.get('p1'), GIFT_COOLDOWN_TICKS + GIFT_COOLDOWN_TICKS);
  });
});

describe('Resource Gifting Deep — diplomacy interaction', () => {
  let engine;
  beforeEach(() => { engine = makeTwoPlayerEngine(); });

  it('can gift to hostile player (no diplomatic restriction)', () => {
    const p1State = engine.playerStates.get('p1');
    p1State.diplomacy['p2'] = { stance: DIPLOMACY_STANCES.HOSTILE };

    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });
    assert.deepStrictEqual(result, { ok: true });
  });
});

// ══════════════════════════════════════════════════════
// Resource Gifting — serialized state verification
// ══════════════════════════════════════════════════════

describe('Resource Gifting Deep — serialized state after gift', () => {
  let engine;
  beforeEach(() => { engine = makeTwoPlayerEngine(); });

  it('getPlayerStateJSON reflects updated resources after gift', () => {
    const before1 = JSON.parse(engine.getPlayerStateJSON('p1'));
    const before2 = JSON.parse(engine.getPlayerStateJSON('p2'));
    const me1 = before1.players.find(p => p.id === 'p1');
    const me2 = before2.players.find(p => p.id === 'p2');
    const e1 = me1.resources.energy;
    const e2 = me2.resources.energy;

    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 50 });

    const after1 = JSON.parse(engine.getPlayerStateJSON('p1'));
    const after2 = JSON.parse(engine.getPlayerStateJSON('p2'));
    const me1After = after1.players.find(p => p.id === 'p1');
    const me2After = after2.players.find(p => p.id === 'p2');
    assert.strictEqual(me1After.resources.energy, e1 - 50);
    assert.strictEqual(me2After.resources.energy, e2 + 50);
  });

  it('gift events appear in flushed events, not in gameState payload', () => {
    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });

    const state = JSON.parse(engine.getPlayerStateJSON('p1'));
    // Gift events are transient — delivered via events, not persisted in gameState
    assert.strictEqual(state.giftEvents, undefined);
  });
});

// ══════════════════════════════════════════════════════
// Cross-feature: Gifting + Catalyst Events
// ══════════════════════════════════════════════════════

describe('Resource Gifting Deep — catalyst interaction', () => {
  it('gifting during active resource rush does not affect rush state', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.30);
    processCatalystAndFlush(engine);
    engine._claimResourceRush('p1');

    const rushResource = engine._resourceRushResource;
    const rushTicksBefore = engine._resourceRushTicksLeft;

    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });

    assert.strictEqual(engine._resourceRushOwner, 'p1', 'rush owner unchanged');
    assert.strictEqual(engine._resourceRushTicksLeft, rushTicksBefore, 'rush ticks unchanged');
  });

  it('gifting during active tech auction does not interfere with bids', () => {
    const engine = makeTwoPlayerEngine();
    advanceTo(engine, 0.45);
    processCatalystAndFlush(engine);

    const p1State = engine.playerStates.get('p1');
    p1State.resources.influence = 100;
    p1State.currentResearch.physics = 'improved_power_plants';
    engine.handleCommand('p1', { type: 'auctionBid', amount: 30 });

    // Gift something unrelated
    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });

    // Bid should still be intact
    assert.strictEqual(engine._auctionBids.get('p1'), 30);
  });
});

// ══════════════════════════════════════════════════════
// Deferred Cache — integration with game tick
// ══════════════════════════════════════════════════════

describe('Deferred State Cache — tick integration', () => {
  it('tick processing sets dirty flag when players are dirty', () => {
    const engine = makeTwoPlayerEngine();

    // Run a monthly tick to trigger production/resource changes
    engine.tickCount = MONTH_TICKS;
    engine._matchTicksRemaining = engine._matchTicksTotal - MONTH_TICKS;
    engine.tick();

    // After tick with dirty players, dirty flag should be set
    // (tick processes production which modifies resources and marks players dirty)
    assert.strictEqual(engine._stateCacheDirty, true);
  });

  it('getPlayerStateJSON after tick returns fresh data when state mutated', () => {
    const engine = makeTwoPlayerEngine();

    // Get baseline
    const json1 = engine.getPlayerStateJSON('p1');

    // Mutate resources directly (simulating what a tick does) and invalidate
    engine.playerStates.get('p1').resources.energy += 100;
    engine._invalidateStateCache();

    const json2 = engine.getPlayerStateJSON('p1');
    assert.notStrictEqual(json1, json2, 'should return fresh JSON after invalidation');

    const parsed2 = JSON.parse(json2);
    const me = parsed2.players.find(p => p.id === 'p1');
    const parsed1 = JSON.parse(json1);
    const me1 = parsed1.players.find(p => p.id === 'p1');
    assert.strictEqual(me.resources.energy, me1.resources.energy + 100);
  });
});
