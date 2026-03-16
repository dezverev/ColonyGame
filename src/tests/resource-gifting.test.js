const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine, GIFT_MIN_AMOUNT, GIFT_COOLDOWN_TICKS, GIFT_ALLOWED_RESOURCES,
} = require('../../server/game-engine');

// Helper: create a 2-player engine
function makeTwoPlayerEngine() {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  players.set('p2', { name: 'Player 2' });
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  const engine = new GameEngine(room, { tickRate: 10 });
  engine._doctrinePhase = false;
  return engine;
}

// ── Constants ──

describe('Resource Gifting — constants', () => {
  it('minimum gift amount is 25', () => {
    assert.strictEqual(GIFT_MIN_AMOUNT, 25);
  });
  it('cooldown is 200 ticks', () => {
    assert.strictEqual(GIFT_COOLDOWN_TICKS, 200);
  });
  it('allowed resources are energy, minerals, food, alloys', () => {
    assert.deepStrictEqual(GIFT_ALLOWED_RESOURCES, ['energy', 'minerals', 'food', 'alloys']);
  });
});

// ── Happy path ──

describe('Resource Gifting — happy path', () => {
  let engine;
  beforeEach(() => { engine = makeTwoPlayerEngine(); });

  it('transfers energy from sender to target', () => {
    const p1 = engine.playerStates.get('p1');
    const p2 = engine.playerStates.get('p2');
    const p1EnergyBefore = p1.resources.energy;
    const p2EnergyBefore = p2.resources.energy;

    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 50 });
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(p1.resources.energy, p1EnergyBefore - 50);
    assert.strictEqual(p2.resources.energy, p2EnergyBefore + 50);
  });

  it('transfers minerals from sender to target', () => {
    const p1 = engine.playerStates.get('p1');
    const p2 = engine.playerStates.get('p2');
    const p1Before = p1.resources.minerals;
    const p2Before = p2.resources.minerals;

    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'minerals', amount: 100 });
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(p1.resources.minerals, p1Before - 100);
    assert.strictEqual(p2.resources.minerals, p2Before + 100);
  });

  it('transfers food from sender to target', () => {
    const p1 = engine.playerStates.get('p1');
    const p2 = engine.playerStates.get('p2');
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'food', amount: 25 });
    assert.deepStrictEqual(result, { ok: true });
  });

  it('transfers alloys from sender to target', () => {
    const p1 = engine.playerStates.get('p1');
    const p2 = engine.playerStates.get('p2');
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'alloys', amount: 25 });
    assert.deepStrictEqual(result, { ok: true });
  });

  it('emits resourceGift events to both players', () => {
    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 30 });
    const events = engine._flushEvents() || [];
    const giftEvents = events.filter(e => e.eventType === 'resourceGift');
    assert.strictEqual(giftEvents.length, 2);

    const sentEvent = giftEvents.find(e => e.playerId === 'p1');
    assert.ok(sentEvent);
    assert.strictEqual(sentEvent.direction, 'sent');
    assert.strictEqual(sentEvent.resource, 'energy');
    assert.strictEqual(sentEvent.amount, 30);
    assert.strictEqual(sentEvent.targetId, 'p2');

    const receivedEvent = giftEvents.find(e => e.playerId === 'p2');
    assert.ok(receivedEvent);
    assert.strictEqual(receivedEvent.direction, 'received');
    assert.strictEqual(receivedEvent.senderId, 'p1');
  });

  it('sets gift cooldown after successful gift', () => {
    engine.tickCount = 100;
    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });
    assert.strictEqual(engine._giftCooldowns.get('p1'), 100 + GIFT_COOLDOWN_TICKS);
  });
});

// ── Validation ──

describe('Resource Gifting — validation', () => {
  let engine;
  beforeEach(() => { engine = makeTwoPlayerEngine(); });

  it('rejects missing targetPlayerId', () => {
    const result = engine.handleCommand('p1', { type: 'giftResources', resource: 'energy', amount: 50 });
    assert.ok(result.error);
  });

  it('rejects gifting to yourself', () => {
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p1', resource: 'energy', amount: 50 });
    assert.strictEqual(result.error, 'Cannot gift resources to yourself');
  });

  it('rejects invalid resource type', () => {
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'influence', amount: 50 });
    assert.strictEqual(result.error, 'Invalid resource type');
  });

  it('rejects research as gift resource', () => {
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'research', amount: 50 });
    assert.strictEqual(result.error, 'Invalid resource type');
  });

  it('rejects amount below minimum', () => {
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 24 });
    assert.ok(result.error.includes('Minimum'));
  });

  it('rejects non-integer amount', () => {
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25.5 });
    assert.strictEqual(result.error, 'Amount must be a whole number');
  });

  it('rejects NaN amount', () => {
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: NaN });
    assert.ok(result.error);
  });

  it('rejects negative amount', () => {
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: -50 });
    assert.ok(result.error);
  });

  it('rejects when sender lacks resources', () => {
    engine.playerStates.get('p1').resources.energy = 10;
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });
    assert.strictEqual(result.error, 'Not enough resources');
  });

  it('rejects unknown target player', () => {
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p999', resource: 'energy', amount: 25 });
    assert.strictEqual(result.error, 'Target player not found');
  });
});

// ── Cooldown ──

describe('Resource Gifting — cooldown', () => {
  let engine;
  beforeEach(() => { engine = makeTwoPlayerEngine(); });

  it('rejects second gift during cooldown', () => {
    engine.tickCount = 100;
    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });
    engine.tickCount = 100 + GIFT_COOLDOWN_TICKS - 1; // still in cooldown
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'minerals', amount: 25 });
    assert.strictEqual(result.error, 'Gift on cooldown');
  });

  it('allows gift after cooldown expires', () => {
    engine.tickCount = 100;
    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });
    engine.tickCount = 100 + GIFT_COOLDOWN_TICKS; // cooldown expired
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'minerals', amount: 25 });
    assert.deepStrictEqual(result, { ok: true });
  });

  it('cooldown is per-sender (p2 can gift while p1 is on cooldown)', () => {
    engine.tickCount = 100;
    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });
    engine.tickCount = 101;
    const result = engine.handleCommand('p2', { type: 'giftResources', targetPlayerId: 'p1', resource: 'energy', amount: 25 });
    assert.deepStrictEqual(result, { ok: true });
  });
});

// ── Edge cases ──

describe('Resource Gifting — edge cases', () => {
  let engine;
  beforeEach(() => { engine = makeTwoPlayerEngine(); });

  it('exact minimum amount (25) succeeds', () => {
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });
    assert.deepStrictEqual(result, { ok: true });
  });

  it('gifting exact balance succeeds and leaves sender at 0', () => {
    const p1 = engine.playerStates.get('p1');
    p1.resources.alloys = 50;
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'alloys', amount: 50 });
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(p1.resources.alloys, 0);
  });

  it('rejects during game over', () => {
    engine._gameOver = true;
    const result = engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });
    assert.strictEqual(result.error, 'Game is over');
  });

  it('marks both players dirty after gift', () => {
    engine._dirtyPlayers.clear();
    engine.handleCommand('p1', { type: 'giftResources', targetPlayerId: 'p2', resource: 'energy', amount: 25 });
    assert.ok(engine._dirtyPlayers.has('p1'));
    assert.ok(engine._dirtyPlayers.has('p2'));
  });
});
