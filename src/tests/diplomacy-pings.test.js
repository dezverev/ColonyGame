const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, DIPLOMACY_PING_TYPES, DIPLOMACY_PING_COOLDOWN } = require('../../server/game-engine');

function makeRoom(playerCount = 2) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set('p' + i, { id: 'p' + i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 'p1', maxPlayers: 4, status: 'playing', players, matchTimer: 0 };
}

function makeEngine(playerCount = 2) {
  const engine = new GameEngine(makeRoom(playerCount), { tickRate: 10 });
  engine.start();
  return engine;
}

describe('Diplomacy Ping Constants', () => {
  it('should define 4 ping types', () => {
    assert.deepStrictEqual(DIPLOMACY_PING_TYPES, ['peace', 'warning', 'alliance', 'rival']);
  });

  it('should define ping cooldown of 100 ticks', () => {
    assert.strictEqual(DIPLOMACY_PING_COOLDOWN, 100);
  });
});

describe('Diplomacy Ping Command', () => {
  it('should accept valid peace ping', () => {
    const engine = makeEngine();
    const result = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'peace' });
    assert.ok(result.ok);
  });

  it('should accept all 4 ping types', () => {
    for (const pingType of DIPLOMACY_PING_TYPES) {
      const engine = makeEngine();
      const result = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType });
      assert.ok(result.ok, `Ping type ${pingType} should be accepted`);
    }
  });

  it('should reject missing targetPlayerId', () => {
    const engine = makeEngine();
    const result = engine.handleCommand('p1', { type: 'diplomacyPing', pingType: 'peace' });
    assert.ok(result.error);
    assert.match(result.error, /Missing targetPlayerId/);
  });

  it('should reject pinging yourself', () => {
    const engine = makeEngine();
    const result = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p1', pingType: 'peace' });
    assert.ok(result.error);
    assert.match(result.error, /Cannot ping yourself/);
  });

  it('should reject invalid ping type', () => {
    const engine = makeEngine();
    const result = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'invalid' });
    assert.ok(result.error);
    assert.match(result.error, /Invalid ping type/);
  });

  it('should reject missing ping type', () => {
    const engine = makeEngine();
    const result = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2' });
    assert.ok(result.error);
    assert.match(result.error, /Invalid ping type/);
  });

  it('should reject ping to nonexistent player', () => {
    const engine = makeEngine();
    const result = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p99', pingType: 'peace' });
    assert.ok(result.error);
    assert.match(result.error, /Target player not found/);
  });

  it('should enforce cooldown between pings', () => {
    const engine = makeEngine();
    const r1 = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'peace' });
    assert.ok(r1.ok);

    // Immediate second ping should be on cooldown
    const r2 = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'warning' });
    assert.ok(r2.error);
    assert.match(r2.error, /cooldown/i);
  });

  it('should allow ping after cooldown expires', () => {
    const engine = makeEngine();
    const r1 = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'peace' });
    assert.ok(r1.ok);

    // Advance ticks past cooldown
    engine.tickCount += DIPLOMACY_PING_COOLDOWN;

    const r2 = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'warning' });
    assert.ok(r2.ok);
  });

  it('cooldown is per-sender not per-target', () => {
    const engine = new GameEngine((() => {
      const players = new Map();
      for (let i = 1; i <= 3; i++) {
        players.set('p' + i, { id: 'p' + i, name: `Player${i}`, ready: true, isHost: i === 1 });
      }
      return { id: 'test', name: 'Test', hostId: 'p1', maxPlayers: 4, status: 'playing', players, matchTimer: 0 };
    })(), { tickRate: 10 });
    engine.start();

    const r1 = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'peace' });
    assert.ok(r1.ok);

    // Same sender, different target — should still be on cooldown
    const r2 = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p3', pingType: 'peace' });
    assert.ok(r2.error);
    assert.match(r2.error, /cooldown/i);

    // Different sender should not be on cooldown
    const r3 = engine.handleCommand('p2', { type: 'diplomacyPing', targetPlayerId: 'p1', pingType: 'rival' });
    assert.ok(r3.ok);
  });

  it('should emit events to both sender and target', () => {
    const engine = makeEngine();
    engine._pendingEvents = [];
    engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'alliance' });

    const events = engine._pendingEvents.filter(e => e.eventType === 'diplomacyPing');
    assert.strictEqual(events.length, 2);

    // One event for target, one for sender
    const targetEvent = events.find(e => e.playerId === 'p2');
    const senderEvent = events.find(e => e.playerId === 'p1');

    assert.ok(targetEvent);
    assert.strictEqual(targetEvent.pingType, 'alliance');
    assert.strictEqual(targetEvent.senderId, 'p1');
    assert.strictEqual(targetEvent.targetId, 'p2');

    assert.ok(senderEvent);
    assert.strictEqual(senderEvent.direction, 'sent');
    assert.strictEqual(senderEvent.pingType, 'alliance');
  });
});
