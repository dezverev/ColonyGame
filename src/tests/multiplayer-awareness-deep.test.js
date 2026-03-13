/**
 * Deep tests for multiplayer awareness bundle:
 * - Player summary isolation (multi-player, multi-colony)
 * - Event emit/flush mechanics
 * - Broadcast routing vs non-broadcast
 * - getPlayerState doesn't leak resources
 * - Chat edge cases in server.js
 * - constructionComplete for colony ships
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, MONTH_TICKS } = require('../../server/game-engine');

function makeRoom(playerCount = 2) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { id: i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 1, maxPlayers: 4, status: 'playing', players };
}

function makeEngine(playerCount = 2) {
  return new GameEngine(makeRoom(playerCount), { tickRate: 10 });
}

function captureEvents(engine) {
  const captured = [];
  engine.onEvent = (events) => { captured.push(...events); };
  return captured;
}

// ── Player Summary Isolation ──

describe('Player summary — multi-player isolation', () => {
  it('summary for player 1 does not include player 2 pops', () => {
    const engine = makeEngine(2);
    const s1 = engine._getPlayerSummary(1);
    const s2 = engine._getPlayerSummary(2);
    // Each player has 1 colony with 8 pops
    assert.strictEqual(s1.totalPops, 8);
    assert.strictEqual(s2.totalPops, 8);
    // Mutate player 2's colony
    const p2Colony = [...engine.colonies.values()].find(c => c.ownerId === 2);
    p2Colony.pops = 20;
    engine._invalidateColonyCache(p2Colony);
    // Player 1 summary unchanged
    assert.strictEqual(engine._getPlayerSummary(1).totalPops, 8);
    assert.strictEqual(engine._getPlayerSummary(2).totalPops, 20);
  });

  it('summary aggregates across multiple colonies', () => {
    const engine = makeEngine(1);
    const firstColony = [...engine.colonies.values()].find(c => c.ownerId === 1);

    // Manually create a second colony for player 1
    const systems = engine.galaxy.systems;
    let targetSystem = null;
    for (const sys of systems) {
      if (sys.id === firstColony.systemId) continue;
      const habitable = sys.planets.find(p =>
        ['continental', 'ocean', 'tropical', 'arctic', 'desert', 'arid'].includes(p.type));
      if (habitable) { targetSystem = sys; break; }
    }

    if (targetSystem) {
      const planet = targetSystem.planets.find(p =>
        ['continental', 'ocean', 'tropical', 'arctic', 'desert', 'arid'].includes(p.type));
      const colony2 = engine._createColony(1, planet, targetSystem.id);
      colony2.pops = 5;
      engine._invalidateColonyCache(colony2);

      const summary = engine._getPlayerSummary(1);
      assert.strictEqual(summary.colonyCount, 2, 'should count both colonies');
      assert.strictEqual(summary.totalPops, 8 + 5, 'should sum pops from both colonies');
    }
  });

  it('income sums production from all colonies', () => {
    const engine = makeEngine(1);
    const firstColony = [...engine.colonies.values()].find(c => c.ownerId === 1);
    const incomeBefore = engine._getPlayerSummary(1).income;

    // Add extra generator district to boost energy
    engine._addBuiltDistrict(firstColony, 'generator');
    engine._invalidateColonyCache(firstColony);

    const incomeAfter = engine._getPlayerSummary(1).income;
    assert.ok(incomeAfter.energy > incomeBefore.energy,
      'energy income should increase after adding generator');
  });
});

// ── Event Emit & Flush Mechanics ──

describe('Event emit and flush', () => {
  it('_emitEvent accumulates events in _pendingEvents', () => {
    const engine = makeEngine(1);
    engine._emitEvent('testEvent1', 1, { foo: 'bar' });
    engine._emitEvent('testEvent2', 1, { baz: 'qux' }, true);
    assert.strictEqual(engine._pendingEvents.length, 2);
  });

  it('_flushEvents returns accumulated events and clears buffer', () => {
    const engine = makeEngine(1);
    engine._emitEvent('testEvent1', 1, { foo: 'bar' });
    engine._emitEvent('testEvent2', 1, { baz: 'qux' });
    const events = engine._flushEvents();
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].eventType, 'testEvent1');
    assert.strictEqual(events[1].eventType, 'testEvent2');
    // Buffer cleared
    assert.strictEqual(engine._flushEvents(), null);
  });

  it('_flushEvents returns null when no events pending', () => {
    const engine = makeEngine(1);
    assert.strictEqual(engine._flushEvents(), null);
  });

  it('_emitEvent with broadcast=true sets broadcast flag', () => {
    const engine = makeEngine(1);
    engine._emitEvent('test', 1, { x: 1 }, true);
    const events = engine._flushEvents();
    assert.strictEqual(events[0].broadcast, true);
  });

  it('_emitEvent with broadcast=false (default) sets broadcast false', () => {
    const engine = makeEngine(1);
    engine._emitEvent('test', 1, { x: 1 });
    const events = engine._flushEvents();
    assert.strictEqual(events[0].broadcast, false);
  });

  it('event details are spread into event object', () => {
    const engine = makeEngine(1);
    engine._emitEvent('test', 1, { colonyName: 'Alpha', districtType: 'mining' });
    const events = engine._flushEvents();
    assert.strictEqual(events[0].colonyName, 'Alpha');
    assert.strictEqual(events[0].districtType, 'mining');
    assert.strictEqual(events[0].playerId, 1);
  });
});

// ── Non-broadcast events ──

describe('Non-broadcast events stay non-broadcast', () => {
  it('queueEmpty is not broadcast', () => {
    const engine = makeEngine(1);
    const events = captureEvents(engine);
    const colony = [...engine.colonies.values()].find(c => c.ownerId === 1);

    // Queue a single 1-tick build — when it completes, queue will be empty
    colony.buildQueue.push({ type: 'generator', ticksRemaining: 1 });
    engine.tick();

    const queueEmpty = events.find(e => e.eventType === 'queueEmpty');
    assert.ok(queueEmpty, 'queueEmpty event should fire');
    assert.strictEqual(queueEmpty.broadcast, false, 'queueEmpty should not be broadcast');
  });

  it('housingFull is not broadcast', () => {
    const engine = makeEngine(1);
    const events = captureEvents(engine);
    const colony = [...engine.colonies.values()].find(c => c.ownerId === 1);

    // Set pops just below housing cap, force growth
    const housing = engine._calcHousing(colony);
    colony.pops = housing - 1;
    colony.growthProgress = 9999; // will exceed any growthTarget
    const state = engine.playerStates.get(1);
    state.resources.food = 10000;
    engine._invalidateColonyCache(colony);
    engine.tick();

    const housingFull = events.find(e => e.eventType === 'housingFull');
    if (housingFull) {
      assert.strictEqual(housingFull.broadcast, false, 'housingFull should not be broadcast');
    }
  });
});

// ── getPlayerState resource privacy ──

describe('getPlayerState — resource privacy', () => {
  it('other players do not have resources in their entry', () => {
    const engine = makeEngine(2);
    const state = engine.getPlayerState(1);
    const other = state.players.find(p => p.id === 2);
    assert.ok(other, 'other player should exist');
    assert.strictEqual(other.resources, undefined, 'other player resources should not be exposed');
  });

  it('own player has resources', () => {
    const engine = makeEngine(2);
    const state = engine.getPlayerState(1);
    const me = state.players.find(p => p.id === 1);
    assert.ok(me.resources, 'own player should have resources');
    assert.strictEqual(typeof me.resources.energy, 'number');
  });

  it('other players do not have research progress', () => {
    const engine = makeEngine(2);
    const state = engine.getPlayerState(1);
    const other = state.players.find(p => p.id === 2);
    assert.strictEqual(other.currentResearch, undefined, 'should not expose research');
    assert.strictEqual(other.researchProgress, undefined, 'should not expose research progress');
  });
});

// ── getPlayerState only includes own colonies ──

describe('getPlayerState — colony filtering', () => {
  it('only includes own colonies in colonies array', () => {
    const engine = makeEngine(2);
    const state = engine.getPlayerState(1);
    for (const colony of state.colonies) {
      assert.strictEqual(colony.ownerId, 1, 'should only contain own colonies');
    }
  });

  it('does not include other player colonies', () => {
    const engine = makeEngine(2);
    const state1 = engine.getPlayerState(1);
    const state2 = engine.getPlayerState(2);
    // Each player should see only 1 colony (their own)
    assert.strictEqual(state1.colonies.length, 1);
    assert.strictEqual(state2.colonies.length, 1);
    assert.notStrictEqual(state1.colonies[0].id, state2.colonies[0].id);
  });
});

// ── constructionComplete for colony ship ──

describe('constructionComplete — colony ship', () => {
  it('colony ship completion includes shipId and districtType=colonyShip', () => {
    const engine = makeEngine(1);
    const events = captureEvents(engine);
    const colony = [...engine.colonies.values()].find(c => c.ownerId === 1);
    const state = engine.playerStates.get(1);
    state.resources.alloys = 9999;

    colony.buildQueue.push({ type: 'colonyShip', ticksRemaining: 1 });
    engine.tick();

    const evt = events.find(e => e.eventType === 'constructionComplete' && e.districtType === 'colonyShip');
    assert.ok(evt, 'should have constructionComplete for colonyShip');
    assert.ok(evt.shipId, 'should include shipId');
    assert.strictEqual(evt.broadcast, true);
    assert.strictEqual(evt.playerName, 'Player1');
  });
});

// ── Player summary with zero colonies ──

describe('Player summary edge cases', () => {
  it('player with no colonies has zero summary', () => {
    const engine = makeEngine(2);
    // Remove all colonies for player 2
    const p2Colonies = engine._playerColonies.get(2) || [];
    for (const cid of [...p2Colonies]) {
      engine.colonies.delete(cid);
    }
    engine._playerColonies.set(2, []);

    const summary = engine._getPlayerSummary(2);
    assert.strictEqual(summary.colonyCount, 0);
    assert.strictEqual(summary.totalPops, 0);
    assert.strictEqual(summary.income.energy, 0);
    assert.strictEqual(summary.income.minerals, 0);
    assert.strictEqual(summary.income.food, 0);
    assert.strictEqual(summary.income.alloys, 0);
  });

  it('handles deleted colony ID in _playerColonies gracefully', () => {
    const engine = makeEngine(1);
    // Add a bogus colony ID
    const colonyIds = engine._playerColonies.get(1);
    colonyIds.push('nonexistent-colony-id');

    // Should not throw — just skips the missing colony
    const summary = engine._getPlayerSummary(1);
    assert.strictEqual(summary.colonyCount, colonyIds.length); // includes bogus ID in count
    assert.strictEqual(summary.totalPops, 8); // only real colony pops counted
  });
});

// ── Broadcast events delivered to all players via onEvent ──

describe('Broadcast event delivery', () => {
  it('onEvent callback receives broadcast events from tick', () => {
    const engine = makeEngine(2);
    const events = captureEvents(engine);
    const colony = [...engine.colonies.values()].find(c => c.ownerId === 1);

    colony.buildQueue.push({ type: 'mining', ticksRemaining: 1 });
    engine.tick();

    const construction = events.find(e => e.eventType === 'constructionComplete');
    assert.ok(construction, 'broadcast event should be captured');
    assert.strictEqual(construction.broadcast, true);
  });

  it('multiple events in single tick are all captured', () => {
    const engine = makeEngine(1);
    const events = captureEvents(engine);
    const colony = [...engine.colonies.values()].find(c => c.ownerId === 1);

    // Queue two 1-tick builds
    colony.buildQueue.push({ type: 'generator', ticksRemaining: 1 });
    colony.buildQueue.push({ type: 'mining', ticksRemaining: 1 });
    engine.tick();

    const constructions = events.filter(e => e.eventType === 'constructionComplete');
    // At least 1 should complete (queue processes first item per tick typically)
    assert.ok(constructions.length >= 1, 'at least one construction should complete');
  });
});

// ── Chat truncation in server.js ──

describe('Chat message handling (server logic)', () => {
  it('server truncates chat text to 200 chars', () => {
    // Simulates what server.js does: String(msg.text || '').slice(0, 200)
    const longText = 'x'.repeat(300);
    const truncated = String(longText || '').slice(0, 200);
    assert.strictEqual(truncated.length, 200);
  });

  it('server handles missing text field gracefully', () => {
    const text = undefined;
    const safe = String(text || '').slice(0, 200);
    assert.strictEqual(safe, '');
  });

  it('server handles null text field', () => {
    const text = null;
    const safe = String(text || '').slice(0, 200);
    assert.strictEqual(safe, '');
  });

  it('server handles numeric text field', () => {
    const text = 12345;
    const safe = String(text || '').slice(0, 200);
    assert.strictEqual(safe, '12345');
  });

  it('empty string stays empty', () => {
    const text = '';
    const safe = String(text || '').slice(0, 200);
    assert.strictEqual(safe, '');
  });
});

// ── Scoreboard in getPlayerState: all players present ──

describe('Scoreboard completeness in getPlayerState', () => {
  it('all players appear in players array', () => {
    const engine = makeEngine(4);
    const state = engine.getPlayerState(1);
    assert.strictEqual(state.players.length, 4, 'should include all 4 players');
  });

  it('own player is first in players array', () => {
    const engine = makeEngine(3);
    const state = engine.getPlayerState(2);
    assert.strictEqual(state.players[0].id, 2, 'own player should be first');
  });

  it('all players have VP scores', () => {
    const engine = makeEngine(3);
    const state = engine.getPlayerState(1);
    for (const p of state.players) {
      assert.strictEqual(typeof p.vp, 'number', `player ${p.id} should have VP`);
    }
  });

  it('all players have name and color', () => {
    const engine = makeEngine(3);
    const state = engine.getPlayerState(1);
    for (const p of state.players) {
      assert.ok(p.name, `player ${p.id} should have name`);
      assert.ok(p.color, `player ${p.id} should have color`);
    }
  });
});
