const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const FogOfWar = require('../public/js/fog-of-war.js');
const { GameEngine, COLONY_SHIP_BUILD_TIME, COLONY_SHIP_HOP_TICKS } = require('../../server/game-engine');

// ===== Fog of War — additional edge cases =====

describe('FogOfWar — cyclic graphs', () => {
  it('should handle a ring graph without infinite loop', () => {
    // Ring: 0-1-2-3-4-0
    const adj = FogOfWar.buildAdjacency([[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]], 5);
    const known = FogOfWar.computeVisibility([0], adj, 2);
    // From 0: depth 0={0}, depth 1={1,4}, depth 2={2,3}
    assert.strictEqual(known.size, 5, 'Should visit all nodes in ring at depth 2');
  });

  it('should respect depth limit in ring even when shortcut exists', () => {
    // Ring of 6: 0-1-2-3-4-5-0
    const adj = FogOfWar.buildAdjacency(
      [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]], 6
    );
    const known = FogOfWar.computeVisibility([0], adj, 1);
    // Depth 1 from 0: {0, 1, 5} only
    assert.strictEqual(known.size, 3);
    assert.ok(known.has(0));
    assert.ok(known.has(1));
    assert.ok(known.has(5));
    assert.ok(!known.has(3), 'Node 3 is 3 hops away via either direction');
  });
});

describe('FogOfWar — duplicate and edge-case sources', () => {
  const adj = FogOfWar.buildAdjacency([[0, 1], [1, 2], [2, 3]], 4);

  it('should handle duplicate source IDs without double-counting', () => {
    const known = FogOfWar.computeVisibility([1, 1, 1], adj, 1);
    assert.strictEqual(known.size, 3); // 0, 1, 2
    assert.ok(known.has(0));
    assert.ok(known.has(1));
    assert.ok(known.has(2));
  });

  it('should handle systemId 0 as valid (not falsy-skipped)', () => {
    const known = FogOfWar.computeVisibility([0], adj, 0);
    assert.strictEqual(known.size, 1);
    assert.ok(known.has(0), 'System 0 should be a valid source');
  });
});

describe('FogOfWar — getOwnedSystemIds with systemId 0', () => {
  it('should include colonies at systemId 0', () => {
    const colonies = [
      { ownerId: 'p1', systemId: 0 },
      { ownerId: 'p1', systemId: 5 },
    ];
    const ids = FogOfWar.getOwnedSystemIds(colonies, 'p1');
    assert.deepStrictEqual(ids, [0, 5]);
  });

  it('should skip colonies with null/undefined systemId', () => {
    const colonies = [
      { ownerId: 'p1', systemId: null },
      { ownerId: 'p1', systemId: undefined },
      { ownerId: 'p1', systemId: 3 },
    ];
    const ids = FogOfWar.getOwnedSystemIds(colonies, 'p1');
    assert.deepStrictEqual(ids, [3]);
  });
});

describe('FogOfWar — large depth on small graph', () => {
  it('should not crash when depth exceeds graph diameter', () => {
    const adj = FogOfWar.buildAdjacency([[0, 1], [1, 2]], 3);
    const known = FogOfWar.computeVisibility([0], adj, 100);
    assert.strictEqual(known.size, 3, 'Should visit all reachable nodes');
  });
});

// ===== Per-player JSON caching =====

function makeRoom(playerCount = 2) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { id: i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 1, maxPlayers: 8, status: 'playing', players };
}

describe('JSON caching — getStateJSON', () => {
  it('should cache full state JSON on second call', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    for (let i = 0; i < 10; i++) engine.tick();
    const json1 = engine.getStateJSON();
    const json2 = engine.getStateJSON();
    assert.strictEqual(json1, json2, 'Full state JSON should be reference-equal (cached)');
    engine.stop();
  });

  it('should invalidate full state JSON cache on command', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    for (let i = 0; i < 10; i++) engine.tick();
    const json1 = engine.getStateJSON();
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: 'e1', districtType: 'mining' });
    const json2 = engine.getStateJSON();
    assert.notStrictEqual(json1, json2, 'Cache should invalidate after command');
    engine.stop();
  });
});

describe('JSON caching — per-player isolation', () => {
  it('different players get different cached JSON', () => {
    const engine = new GameEngine(makeRoom(3), { tickRate: 10 });
    for (let i = 0; i < 10; i++) engine.tick();
    const p1 = engine.getPlayerStateJSON(1);
    const p2 = engine.getPlayerStateJSON(2);
    // Different players should have different payloads (own colonies differ)
    assert.notStrictEqual(p1, p2, 'Different players should get different JSON');

    // Parse to check they contain the right player as first in players array
    const state1 = JSON.parse(p1);
    const state2 = JSON.parse(p2);
    assert.strictEqual(state1.players[0].id, 1);
    assert.strictEqual(state2.players[0].id, 2);
    engine.stop();
  });

  it('per-player cache map is cleared for all players on state change', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    for (let i = 0; i < 10; i++) engine.tick();
    // Prime both player caches
    engine.getPlayerStateJSON(1);
    engine.getPlayerStateJSON(2);
    assert.strictEqual(engine._cachedPlayerJSON.size, 2, 'Both players should be cached');
    // Player 1 command should clear the entire per-player cache map
    engine.playerStates.get(1).resources.minerals = 9999;
    const p1ColonyIds = engine._playerColonies.get(1) || [];
    engine.handleCommand(1, { type: 'buildDistrict', colonyId: p1ColonyIds[0], districtType: 'generator' });
    assert.strictEqual(engine._cachedPlayerJSON.size, 0, 'All player caches should be cleared');
    engine.stop();
  });
});

describe('JSON caching — colony ship commands invalidate cache', () => {
  it('buildColonyShip invalidates per-player cache', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    for (let i = 0; i < 10; i++) engine.tick();
    const state = engine.playerStates.get(1);
    state.resources.minerals = 500;
    state.resources.food = 300;
    state.resources.alloys = 300;
    // Prime cache
    const json1 = engine.getPlayerStateJSON(1);
    const colony = engine.colonies.values().next().value;
    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    const json2 = engine.getPlayerStateJSON(1);
    assert.notStrictEqual(json1, json2, 'Cache should invalidate after buildColonyShip');
    engine.stop();
  });
});

// ===== Colony ship serialization — path integrity after JSON.stringify =====

describe('Colony ship serialization — path not corrupted', () => {
  it('getState serialization does not mutate ship path', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.minerals = 500;
    state.resources.food = 300;
    state.resources.alloys = 300;
    const colony = engine.colonies.values().next().value;
    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();

    const ship = engine._colonyShips[0];
    // Find a habitable target
    let targetSysId = null;
    for (const sys of engine.galaxy.systems) {
      if (sys.id === ship.systemId) continue;
      if (sys.planets && sys.planets.some(p => p.habitability >= 20 && !p.colonized)) {
        targetSysId = sys.id; break;
      }
    }
    if (targetSysId == null) { engine.stop(); return; }

    engine.handleCommand(1, { type: 'sendColonyShip', shipId: ship.id, targetSystemId: targetSysId });
    const pathBefore = [...ship.path];
    assert.ok(pathBefore.length > 0, 'Ship should have a path');

    // Serialize multiple times — should not mutate path
    engine.getStateJSON();
    engine._invalidateStateCache();
    engine.getPlayerStateJSON(1);

    assert.deepStrictEqual(ship.path, pathBefore, 'Ship path should not be mutated by serialization');
    engine.stop();
  });

  it('getPlayerState includes correct colony ship data', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.minerals = 500;
    state.resources.food = 300;
    state.resources.alloys = 300;
    const colony = engine.colonies.values().next().value;
    engine.handleCommand(1, { type: 'buildColonyShip', colonyId: colony.id });
    for (let i = 0; i < COLONY_SHIP_BUILD_TIME; i++) engine.tick();

    const playerState = engine.getPlayerState(1);
    assert.ok(Array.isArray(playerState.colonyShips));
    assert.strictEqual(playerState.colonyShips.length, 1);
    assert.strictEqual(playerState.colonyShips[0].ownerId, 1);
    assert.ok(Array.isArray(playerState.colonyShips[0].path));
    engine.stop();
  });
});

// ===== getPlayerState — only own colonies, others summarized =====

describe('getPlayerState — data isolation', () => {
  it('should only include own colonies in detail', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    for (let i = 0; i < 10; i++) engine.tick();
    const p1State = engine.getPlayerState(1);
    const p2State = engine.getPlayerState(2);

    // Player 1's state should contain only player 1's colonies
    for (const col of p1State.colonies) {
      assert.strictEqual(col.ownerId, 1, 'Player 1 state should only have player 1 colonies');
    }
    // Player 2's state should contain only player 2's colonies
    for (const col of p2State.colonies) {
      assert.strictEqual(col.ownerId, 2, 'Player 2 state should only have player 2 colonies');
    }
    engine.stop();
  });

  it('should include other players as summaries without resources', () => {
    const engine = new GameEngine(makeRoom(3), { tickRate: 10 });
    for (let i = 0; i < 10; i++) engine.tick();
    const p1State = engine.getPlayerState(1);

    // First player in array is self (with resources)
    assert.strictEqual(p1State.players[0].id, 1);
    assert.ok(p1State.players[0].resources, 'Own player should have resources');

    // Other players should NOT have resources
    const others = p1State.players.filter(p => p.id !== 1);
    assert.strictEqual(others.length, 2);
    for (const other of others) {
      assert.strictEqual(other.resources, undefined, `Player ${other.id} should not have resources in player 1's state`);
    }
    engine.stop();
  });
});

// ===== Cache invalidation — _invalidateStateCache clears all 3 caches =====

describe('_invalidateStateCache — consistency', () => {
  it('should clear full-state, full-JSON, and per-player caches', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    for (let i = 0; i < 10; i++) engine.tick();
    // Prime all caches
    engine.getState();
    engine.getStateJSON();
    engine.getPlayerStateJSON(1);
    engine.getPlayerStateJSON(2);

    // Invalidate
    engine._invalidateStateCache();

    // Verify no stale cache (call again, should recompute — not reference-equal if state changed)
    // We can at least verify the internal fields are null/cleared
    assert.strictEqual(engine._cachedState, null);
    assert.strictEqual(engine._cachedStateJSON, null);
    assert.strictEqual(engine._cachedPlayerJSON.size, 0);
    engine.stop();
  });
});
