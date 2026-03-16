const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, DIPLOMACY_PING_TYPES, DIPLOMACY_PING_COOLDOWN } = require('../../server/game-engine');

function makeRoom(playerCount = 2) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set('p' + i, { id: 'p' + i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 'p1', maxPlayers: 8, status: 'playing', players, matchTimer: 0 };
}

function makeEngine(playerCount = 2) {
  const engine = new GameEngine(makeRoom(playerCount), { tickRate: 10 });
  engine.start();
  return engine;
}

describe('Diplomacy Ping — Event Payload Structure', () => {
  it('target event should include senderName and targetName', () => {
    const engine = makeEngine();
    engine._pendingEvents = [];
    engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'peace' });

    const targetEvent = engine._pendingEvents.find(e => e.eventType === 'diplomacyPing' && e.playerId === 'p2');
    assert.ok(targetEvent, 'target should receive event');
    assert.strictEqual(targetEvent.senderName, 'Player1');
    assert.strictEqual(targetEvent.targetName, 'Player2');
    assert.strictEqual(targetEvent.senderId, 'p1');
    assert.strictEqual(targetEvent.targetId, 'p2');
    assert.strictEqual(targetEvent.pingType, 'peace');
    // Target event should NOT have direction field
    assert.strictEqual(targetEvent.direction, undefined);
  });

  it('sender confirmation event should include direction=sent and names', () => {
    const engine = makeEngine();
    engine._pendingEvents = [];
    engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'rival' });

    const senderEvent = engine._pendingEvents.find(e => e.eventType === 'diplomacyPing' && e.playerId === 'p1');
    assert.ok(senderEvent, 'sender should receive confirmation event');
    assert.strictEqual(senderEvent.direction, 'sent');
    assert.strictEqual(senderEvent.senderName, 'Player1');
    assert.strictEqual(senderEvent.targetName, 'Player2');
    assert.strictEqual(senderEvent.pingType, 'rival');
  });

  it('each ping type should produce correct pingType in events', () => {
    for (const pingType of DIPLOMACY_PING_TYPES) {
      const engine = makeEngine();
      engine._pendingEvents = [];
      engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType });

      const events = engine._pendingEvents.filter(e => e.eventType === 'diplomacyPing');
      assert.strictEqual(events.length, 2, `should emit 2 events for ${pingType}`);
      for (const evt of events) {
        assert.strictEqual(evt.pingType, pingType, `event pingType should be ${pingType}`);
      }
    }
  });
});

describe('Diplomacy Ping — Cooldown Boundaries', () => {
  it('ping should fail one tick before cooldown expires', () => {
    const engine = makeEngine();
    engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'peace' });

    // Advance to 1 tick before cooldown expires
    engine.tickCount += DIPLOMACY_PING_COOLDOWN - 1;

    const result = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'warning' });
    assert.ok(result.error);
    assert.match(result.error, /cooldown/i);
  });

  it('ping should succeed exactly when cooldown expires', () => {
    const engine = makeEngine();
    engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'peace' });

    // Advance exactly to cooldown expiry
    engine.tickCount += DIPLOMACY_PING_COOLDOWN;

    const result = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'warning' });
    assert.ok(result.ok);
  });

  it('cooldown resets after second ping', () => {
    const engine = makeEngine();
    engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'peace' });
    engine.tickCount += DIPLOMACY_PING_COOLDOWN;
    engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'warning' });

    // Should be on cooldown again immediately
    const result = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'alliance' });
    assert.ok(result.error);
    assert.match(result.error, /cooldown/i);

    // Advance past second cooldown
    engine.tickCount += DIPLOMACY_PING_COOLDOWN;
    const r2 = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'alliance' });
    assert.ok(r2.ok);
  });
});

describe('Diplomacy Ping — State Isolation', () => {
  it('_pingCooldowns should not appear in getPlayerState', () => {
    const engine = makeEngine();
    engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'peace' });

    const state = engine.getPlayerState('p1');
    const json = JSON.stringify(state);
    assert.ok(!json.includes('_pingCooldowns'), 'state should not serialize _pingCooldowns');
    assert.ok(!json.includes('pingCooldown'), 'state should not contain ping cooldown data');
  });

  it('_pingCooldowns should not appear in getPlayerStateJSON', () => {
    const engine = makeEngine();
    engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'peace' });

    const json = engine.getPlayerStateJSON('p1');
    assert.ok(!json.includes('_pingCooldowns'), 'JSON should not contain _pingCooldowns');
    assert.ok(!json.includes('pingCooldown'), 'JSON should not contain ping cooldown data');
  });

  it('ping events should not affect resource state', () => {
    const engine = makeEngine();
    const stateBefore = JSON.parse(JSON.stringify(engine.playerStates.get('p1').resources));
    engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'peace' });
    const stateAfter = engine.playerStates.get('p1').resources;
    assert.deepStrictEqual(stateAfter, stateBefore, 'resources should not change after ping');
  });

  it('ping events should not affect diplomacy stances', () => {
    const engine = makeEngine();
    const diplomacyBefore = JSON.parse(JSON.stringify(engine._serializeDiplomacy('p1')));
    engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'rival' });
    const diplomacyAfter = engine._serializeDiplomacy('p1');
    assert.deepStrictEqual(diplomacyAfter, diplomacyBefore, 'diplomacy stances should not change after ping');
  });
});

describe('Diplomacy Ping — Multi-Player Scenarios', () => {
  it('4 players can all ping each other independently', () => {
    const engine = makeEngine(4);

    const r1 = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'peace' });
    const r2 = engine.handleCommand('p2', { type: 'diplomacyPing', targetPlayerId: 'p3', pingType: 'warning' });
    const r3 = engine.handleCommand('p3', { type: 'diplomacyPing', targetPlayerId: 'p4', pingType: 'alliance' });
    const r4 = engine.handleCommand('p4', { type: 'diplomacyPing', targetPlayerId: 'p1', pingType: 'rival' });

    assert.ok(r1.ok, 'p1→p2 should succeed');
    assert.ok(r2.ok, 'p2→p3 should succeed');
    assert.ok(r3.ok, 'p3→p4 should succeed');
    assert.ok(r4.ok, 'p4→p1 should succeed');
  });

  it('reciprocal pings should both work (p1→p2 and p2→p1)', () => {
    const engine = makeEngine();
    const r1 = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'peace' });
    const r2 = engine.handleCommand('p2', { type: 'diplomacyPing', targetPlayerId: 'p1', pingType: 'rival' });
    assert.ok(r1.ok);
    assert.ok(r2.ok);
  });

  it('should generate exactly 2 events per successful ping', () => {
    const engine = makeEngine(4);
    engine._pendingEvents = [];

    engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p3', pingType: 'warning' });

    const events = engine._pendingEvents.filter(e => e.eventType === 'diplomacyPing');
    assert.strictEqual(events.length, 2);
    // One for each player involved
    const playerIds = events.map(e => e.playerId).sort();
    assert.deepStrictEqual(playerIds, ['p1', 'p3']);
  });
});

describe('Diplomacy Ping — Edge Cases', () => {
  it('should handle empty string pingType', () => {
    const engine = makeEngine();
    const result = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: '' });
    assert.ok(result.error);
    assert.match(result.error, /Invalid ping type/);
  });

  it('should handle numeric pingType', () => {
    const engine = makeEngine();
    const result = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 42 });
    assert.ok(result.error);
    assert.match(result.error, /Invalid ping type/);
  });

  it('should handle null pingType', () => {
    const engine = makeEngine();
    const result = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: null });
    assert.ok(result.error);
    assert.match(result.error, /Invalid ping type/);
  });

  it('should handle empty string targetPlayerId', () => {
    const engine = makeEngine();
    const result = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: '', pingType: 'peace' });
    assert.ok(result.error);
  });

  it('first ping at tick 0 should succeed', () => {
    const engine = makeEngine();
    engine.tickCount = 0;
    const result = engine.handleCommand('p1', { type: 'diplomacyPing', targetPlayerId: 'p2', pingType: 'peace' });
    assert.ok(result.ok);
  });
});

describe('Foundry Cost — 250 Mineral Boundary', () => {
  it('should succeed with exactly 250 minerals', () => {
    const engine = makeEngine();
    const ps = engine.playerStates.get('p1');
    ps.resources.minerals = 250;
    ps.resources.energy = 200;
    ps.resources.alloys = 200;
    const colony = engine.colonies.get(engine._playerColonies.get('p1')[0]);
    const result = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'foundry' });
    assert.ok(result.ok, 'should succeed with exactly 250 minerals');
    assert.strictEqual(ps.resources.minerals, 0, 'should deduct all 250 minerals');
  });

  it('should fail with 249 minerals', () => {
    const engine = makeEngine();
    const ps = engine.playerStates.get('p1');
    ps.resources.minerals = 249;
    ps.resources.energy = 200;
    ps.resources.alloys = 200;
    const colony = engine.colonies.get(engine._playerColonies.get('p1')[0]);
    const result = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'foundry' });
    assert.ok(result.error);
    assert.match(result.error, /Not enough/);
  });

  it('Foundry cancellation should refund 125 minerals (50% of 250)', () => {
    const engine = makeEngine();
    const ps = engine.playerStates.get('p1');
    ps.resources.minerals = 500;
    ps.resources.energy = 200;
    ps.resources.alloys = 200;
    const colony = engine.colonies.get(engine._playerColonies.get('p1')[0]);
    const buildResult = engine.handleCommand('p1', { type: 'buildBuilding', colonyId: colony.id, buildingType: 'foundry' });
    assert.ok(buildResult.ok);
    // minerals: 500 - 250 = 250
    assert.strictEqual(ps.resources.minerals, 250);

    const result = engine.handleCommand('p1', { type: 'demolish', colonyId: colony.id, districtId: buildResult.id });
    assert.ok(result.ok);
    // minerals: 250 + 125 = 375
    assert.strictEqual(ps.resources.minerals, 375);
  });
});
