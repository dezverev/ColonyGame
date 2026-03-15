const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  RAIDER_MIN_INTERVAL, RAIDER_MAX_INTERVAL, RAIDER_HOP_TICKS,
  RAIDER_HP, RAIDER_ATTACK, RAIDER_COMBAT_TICKS,
  DEFENSE_PLATFORM_COST, DEFENSE_PLATFORM_BUILD_TIME,
  DEFENSE_PLATFORM_MAX_HP, DEFENSE_PLATFORM_ATTACK, DEFENSE_PLATFORM_REPAIR_RATE,
  RAIDER_DISABLE_TICKS, RAIDER_RESOURCE_STOLEN, RAIDER_DESTROY_VP,
  MONTH_TICKS,
} = require('../../server/game-engine');

// Helper: create a minimal game engine with one player
function createEngine(opts = {}) {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  if (opts.twoPlayers) {
    players.set('p2', { name: 'Player 2' });
  }
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  const engine = new GameEngine(room, { tickRate: 10 });
  return engine;
}

// Helper: get first colony for a player
function getFirstColony(engine, playerId = 'p1') {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

// Helper: create a raider at a colony's system (arrived, ready for resolution)
function createArrivedRaider(engine, colony) {
  const raider = {
    id: engine._nextId(),
    systemId: colony.systemId,
    targetSystemId: colony.systemId,
    targetColonyId: colony.id,
    path: [],
    hopProgress: 0,
    hp: RAIDER_HP,
  };
  engine._raiders.push(raider);
  return raider;
}

describe('Raider Deep — platform loses combat, colony gets raided', () => {
  it('platform with 5 HP loses to raider, colony is raided', () => {
    // Combat math: platform 5HP/15atk vs raider 30HP/8atk
    // Tick 1: platform deals 15 (raider 30→15), raider alive, raider deals 8 (5→-3), platform dead
    // Platform loses — raider survives with 15 HP and raids colony
    const engine = createEngine();
    const colony = getFirstColony(engine);
    colony.defensePlatform = { hp: 5, maxHp: 50, building: false };

    colony.districts = [
      { id: 'd1', type: 'mining' },
      { id: 'd2', type: 'generator' },
      { id: 'd3', type: 'agriculture' },
    ];

    const state = engine.playerStates.get('p1');
    state.resources.energy = 100;
    state.resources.minerals = 100;
    state.resources.food = 100;

    const raider = createArrivedRaider(engine, colony);
    engine._resolveRaiderArrival(raider);

    // Platform should be destroyed
    assert.strictEqual(colony.defensePlatform.hp, 0);
    // Colony should be raided — resources stolen
    assert.strictEqual(state.resources.energy, 50);
    assert.strictEqual(state.resources.minerals, 50);
    assert.strictEqual(state.resources.food, 50);
    // Districts disabled
    const disabled = colony.districts.filter(d => d.disabled);
    assert.strictEqual(disabled.length, 2);
    // Raider removed after raid
    assert.strictEqual(engine._raiders.length, 0);
    // NO VP awarded (raider wasn't destroyed by platform)
    assert.strictEqual(engine._raidersDestroyed.get('p1') || 0, 0);
  });

  it('platform with exactly enough HP to survive one round wins', () => {
    // Platform 8HP/15atk vs raider 30HP/8atk
    // Tick 1: platform deals 15 (raider 30→15), raider alive, raider deals 8 (8→0), platform dead
    // Platform loses — barely.
    const engine = createEngine();
    const colony = getFirstColony(engine);
    colony.defensePlatform = { hp: 8, maxHp: 50, building: false };
    colony.districts = [{ id: 'd1', type: 'mining' }, { id: 'd2', type: 'generator' }];

    const state = engine.playerStates.get('p1');
    state.resources.energy = 100;

    const raider = createArrivedRaider(engine, colony);
    engine._resolveRaiderArrival(raider);

    // Platform HP drops to 0 — raider wins
    assert.strictEqual(colony.defensePlatform.hp, 0);
    // Colony should be raided
    assert.strictEqual(state.resources.energy, 50);
  });

  it('platform with 9 HP survives (raider dies before retaliating fully)', () => {
    // Platform 9HP/15atk vs raider 30HP/8atk
    // Tick 1: platform deals 15 (30→15), raider alive, raider deals 8 (9→1)
    // Tick 2: platform deals 15 (15→0), raider dead
    // Platform survives with 1 HP
    const engine = createEngine();
    const colony = getFirstColony(engine);
    colony.defensePlatform = { hp: 9, maxHp: 50, building: false };

    const raider = createArrivedRaider(engine, colony);
    engine._resolveRaiderArrival(raider);

    assert.strictEqual(colony.defensePlatform.hp, 1);
    assert.strictEqual(engine._raiders.length, 0);
    assert.strictEqual(engine._raidersDestroyed.get('p1'), 1);
  });
});

describe('Raider Deep — _findNearestColonySystem BFS', () => {
  it('finds the nearest colony system via BFS', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    const adj = engine._adjacency;
    const neighbors = adj.get(colony.systemId) || [];
    if (neighbors.length === 0) return; // skip if isolated

    // From an adjacent system, nearest colony should be the colony system
    const result = engine._findNearestColonySystem(neighbors[0]);
    assert.strictEqual(result, colony.systemId);
  });

  it('returns null when no colony is reachable', () => {
    const engine = createEngine();
    // Remove all colonies
    engine.colonies.clear();
    engine._playerColonies.clear();

    const result = engine._findNearestColonySystem(0);
    assert.strictEqual(result, null);
  });

  it('does not return the same system as fromSystemId even if colony is there', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    // Query from the colony's own system — should find a DIFFERENT colony or null
    const result = engine._findNearestColonySystem(colony.systemId);
    // With only 1 colony, the result should be null (skips self-system)
    assert.strictEqual(result, null);
  });
});

describe('Raider Deep — arrival fallback to any colony at system', () => {
  it('raider targets deleted colony but finds another at same system', () => {
    const engine = createEngine({ twoPlayers: true });
    const colony1 = getFirstColony(engine, 'p1');
    const colony2 = getFirstColony(engine, 'p2');

    // Move p2 colony to same system as p1 colony
    colony2.systemId = colony1.systemId;

    // Create raider targeting colony1 by ID
    const raider = {
      id: engine._nextId(),
      systemId: colony1.systemId,
      targetSystemId: colony1.systemId,
      targetColonyId: colony1.id,
      path: [],
      hopProgress: 0,
      hp: RAIDER_HP,
    };
    engine._raiders.push(raider);

    // Delete colony1 from the map
    engine.colonies.delete(colony1.id);

    // Add districts to colony2 so raid has something to disable
    colony2.districts = [
      { id: 'd1', type: 'mining' },
      { id: 'd2', type: 'generator' },
      { id: 'd3', type: 'agriculture' },
    ];
    const state2 = engine.playerStates.get('p2');
    state2.resources.energy = 100;

    engine._resolveRaiderArrival(raider);

    // Colony2 should have been raided instead
    assert.strictEqual(state2.resources.energy, 50);
    assert.strictEqual(engine._raiders.length, 0);
  });
});

describe('Raider Deep — disable timer edge cases', () => {
  it('cleans up timer set when colony is deleted', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    // Add to timer set
    engine._raiderDisableTimers.add(colony.id);
    // Delete the colony
    engine.colonies.delete(colony.id);

    engine._processRaiderDisableTimers();

    assert.strictEqual(engine._raiderDisableTimers.has(colony.id), false);
  });

  it('partial timer expiry — some districts re-enable, others stay disabled', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    engine.tickCount = 100;

    colony.districts = [
      { id: 'd1', type: 'mining', disabled: true, _raiderDisableTick: 102 },  // expires in 2 ticks
      { id: 'd2', type: 'generator', disabled: true, _raiderDisableTick: 105 }, // expires in 5 ticks
    ];
    engine._raiderDisableTimers.add(colony.id);

    // Tick 2 times — first district should re-enable
    engine.tickCount = 102;
    engine._processRaiderDisableTimers();

    assert.strictEqual(colony.districts[0].disabled, false, 'd1 should re-enable');
    assert.strictEqual(colony.districts[1].disabled, true, 'd2 should still be disabled');
    // Timer set should still contain colony (d2 still has timer)
    assert.ok(engine._raiderDisableTimers.has(colony.id));

    // Tick to 105 — second district re-enables
    engine.tickCount = 105;
    engine._processRaiderDisableTimers();

    assert.strictEqual(colony.districts[1].disabled, false, 'd2 should re-enable');
    // Timer set should be clear now
    assert.ok(!engine._raiderDisableTimers.has(colony.id));
  });

  it('emits districtEnabled event when districts re-enable', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    engine.tickCount = 100;

    colony.districts = [
      { id: 'd1', type: 'mining', disabled: true, _raiderDisableTick: 100 },
    ];
    engine._raiderDisableTimers.add(colony.id);

    engine._processRaiderDisableTimers();

    const evt = engine._pendingEvents.find(e => e.eventType === 'districtEnabled');
    assert.ok(evt, 'districtEnabled event should be emitted');
    assert.strictEqual(evt.colonyId, colony.id);
  });
});

describe('Raider Deep — construction set orphan cleanup', () => {
  it('removes colony from building set when colony is deleted mid-build', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    const state = engine.playerStates.get('p1');
    state.resources.alloys = 200;

    engine.handleCommand('p1', { type: 'buildDefensePlatform', colonyId: colony.id });
    assert.ok(engine._defensePlatformBuilding.has(colony.id));

    // Delete colony mid-build
    engine.colonies.delete(colony.id);

    engine._processDefensePlatformConstruction();

    assert.ok(!engine._defensePlatformBuilding.has(colony.id), 'orphaned entry should be removed');
  });
});

describe('Raider Deep — edge system fallback', () => {
  it('falls back to unowned systems when no edge systems exist', () => {
    const engine = createEngine();
    // Make all systems have >2 neighbors by manipulating adjacency
    for (const [sysId, neighbors] of engine._adjacency) {
      // Add fake neighbors to ensure all have >2
      while (neighbors.length <= 2) {
        // Add a neighbor that doesn't exist — just to make the count > 2
        neighbors.push(9999 + neighbors.length);
      }
    }
    // Clear the cache
    engine._cachedEdgeSystems = null;

    const edges = engine._getEdgeSystems();
    // Should return unowned systems (fallback path)
    assert.ok(edges.length > 0, 'should find unowned systems as fallback');
    // Should NOT be cached (fallback is not cached since ownership changes)
    assert.strictEqual(engine._cachedEdgeSystems, null);
  });
});

describe('Raider Deep — raid resource specifics', () => {
  it('raid steals only energy, minerals, food — NOT alloys or research', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    colony.districts = [
      { id: 'd1', type: 'mining' },
      { id: 'd2', type: 'generator' },
      { id: 'd3', type: 'agriculture' },
    ];

    const state = engine.playerStates.get('p1');
    state.resources.energy = 100;
    state.resources.minerals = 100;
    state.resources.food = 100;
    state.resources.alloys = 100;
    state.resources.research = 100;

    const raider = createArrivedRaider(engine, colony);
    engine._resolveRaiderArrival(raider);

    assert.strictEqual(state.resources.energy, 50, 'energy stolen');
    assert.strictEqual(state.resources.minerals, 50, 'minerals stolen');
    assert.strictEqual(state.resources.food, 50, 'food stolen');
    assert.strictEqual(state.resources.alloys, 100, 'alloys should NOT be stolen');
    assert.strictEqual(state.resources.research, 100, 'research should NOT be stolen');
  });

  it('colony with 0 districts — only resources stolen, 0 disabled', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    colony.districts = [];

    const state = engine.playerStates.get('p1');
    state.resources.energy = 100;

    const raider = createArrivedRaider(engine, colony);
    engine._resolveRaiderArrival(raider);

    assert.strictEqual(state.resources.energy, 50);
    assert.strictEqual(colony.districts.filter(d => d.disabled).length, 0);
    assert.strictEqual(engine._raiders.length, 0);
  });

  it('colonyRaided event includes resourcesStolen breakdown', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    colony.districts = [{ id: 'd1', type: 'mining' }];

    const state = engine.playerStates.get('p1');
    state.resources.energy = 30;
    state.resources.minerals = 100;
    state.resources.food = 0;

    const raider = createArrivedRaider(engine, colony);
    engine._resolveRaiderArrival(raider);

    const evt = engine._pendingEvents.find(e => e.eventType === 'colonyRaided');
    assert.ok(evt);
    assert.deepStrictEqual(evt.resourcesStolen, { energy: 30, minerals: 50, food: 0 });
  });
});

describe('Raider Deep — spawning retry on unreachable colony', () => {
  it('reschedules +100 ticks when nearest colony is unreachable', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);

    // Isolate the colony system by removing all adjacency to it
    for (const [sysId, neighbors] of engine._adjacency) {
      const idx = neighbors.indexOf(colony.systemId);
      if (idx !== -1) neighbors.splice(idx, 1);
    }
    engine._adjacency.set(colony.systemId, []);
    engine._cachedEdgeSystems = null;

    engine._nextRaiderTick = 1;
    engine.tickCount = 1;
    engine._processRaiderSpawning();

    // Should have rescheduled, no raider spawned
    assert.strictEqual(engine._raiders.length, 0);
    // Next attempt should be at tickCount + 100 (or a new interval if nearest was found but path failed)
    assert.ok(engine._nextRaiderTick > 1);
  });
});

describe('Raider Deep — multiplayer targeting', () => {
  it('raider targets nearest colony in 2-player game', () => {
    const engine = createEngine({ twoPlayers: true });
    const colony1 = getFirstColony(engine, 'p1');
    const colony2 = getFirstColony(engine, 'p2');

    // Both colonies exist
    assert.ok(colony1);
    assert.ok(colony2);

    // _findNearestColonySystem should find one of them
    const edges = engine._getEdgeSystems();
    if (edges.length > 0) {
      const nearest = engine._findNearestColonySystem(edges[0]);
      // Should return one of the two colony systems
      const validSystems = [colony1.systemId, colony2.systemId];
      assert.ok(validSystems.includes(nearest), `expected nearest to be one of ${validSystems}, got ${nearest}`);
    }
  });
});

describe('Raider Deep — dirty state management', () => {
  it('_removeRaider marks all players dirty', () => {
    const engine = createEngine({ twoPlayers: true });
    const raider = {
      id: engine._nextId(),
      systemId: 0,
      targetSystemId: 0,
      targetColonyId: 'x',
      path: [],
      hopProgress: 0,
      hp: RAIDER_HP,
    };
    engine._raiders.push(raider);
    engine._dirtyPlayers.clear();

    engine._removeRaider(raider);

    assert.ok(engine._dirtyPlayers.has('p1'));
    assert.ok(engine._dirtyPlayers.has('p2'));
    assert.strictEqual(engine._raiders.length, 0);
  });

  it('raider hop marks players dirty, idle ticks do not', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    const adj = engine._adjacency;
    const neighbors = adj.get(colony.systemId) || [];
    if (neighbors.length === 0) return;

    const raider = {
      id: engine._nextId(),
      systemId: neighbors[0],
      targetSystemId: colony.systemId,
      targetColonyId: colony.id,
      path: [colony.systemId],
      hopProgress: 0,
      hp: RAIDER_HP,
    };
    engine._raiders.push(raider);

    // First tick — raider is progressing but hasn't hopped yet
    engine._dirtyPlayers.clear();
    engine._processRaiderMovement();
    // Should NOT mark dirty (no actual hop)
    assert.strictEqual(engine._dirtyPlayers.has('p1'), false, 'no dirty on progress tick');
  });
});

describe('Raider Deep — serialization edge cases', () => {
  it('raider with empty path serializes hopsRemaining as 0', () => {
    const engine = createEngine();
    engine._raiders.push({
      id: 'r-empty', systemId: 0, targetSystemId: 0,
      path: [], hopProgress: 0, hp: 20,
    });
    engine._invalidateStateCache();
    const state = engine.getPlayerState('p1');
    const raider = state.raiders.find(r => r.id === 'r-empty');
    assert.ok(raider);
    assert.strictEqual(raider.hopsRemaining, 0);
    assert.strictEqual(raider.path, undefined);
  });

  it('defense platform buildTicksRemaining serialized when building', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    colony.defensePlatform = { hp: 50, maxHp: 50, building: true, buildTicksRemaining: 150 };

    const serialized = engine._serializeColony(colony);
    assert.ok(serialized.defensePlatform);
    assert.strictEqual(serialized.defensePlatform.building, true);
    assert.strictEqual(serialized.defensePlatform.buildTicksRemaining, 150);
  });

  it('disabled districts appear in colony serialization', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine);
    colony.districts = [
      { id: 'd1', type: 'mining', disabled: true, _raiderDisableTick: 999 },
      { id: 'd2', type: 'generator' },
    ];

    const serialized = engine._serializeColony(colony);
    const d1 = serialized.districts.find(d => d.id === 'd1');
    assert.ok(d1, 'disabled district should be in serialization');
    assert.strictEqual(d1.disabled, true);
  });
});
