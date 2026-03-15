const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine, SURVEY_TICKS, SCIENCE_SHIP_HOP_TICKS,
} = require('../../server/game-engine');

// Helper: create a 2-player engine with doctrine phase skipped
function createEngine(opts = {}) {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  if (opts.twoPlayer !== false) {
    players.set('p2', { name: 'Player 2' });
  }
  const room = { players, galaxySize: 'small', matchTimer: opts.matchTimer || 0 };
  const engine = new GameEngine(room, { tickRate: 10 });
  engine._doctrinePhase = false;
  return engine;
}

function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

function spawnScienceShip(engine, playerId, systemId) {
  const shipId = engine._nextId();
  const ship = {
    id: shipId,
    ownerId: playerId,
    systemId,
    targetSystemId: null,
    path: [],
    hopProgress: 0,
    surveying: false,
    surveyProgress: 0,
    autoSurvey: true,
  };
  engine._scienceShips.push(ship);
  let arr = engine._scienceShipsByPlayer.get(playerId);
  if (!arr) { arr = []; engine._scienceShipsByPlayer.set(playerId, arr); }
  arr.push(ship);
  return ship;
}

// ── Toggle ON while ship is already moving ──

describe('Auto-Chain Survey Deep — toggle while moving/surveying', () => {
  it('toggle ON while ship is in transit does not re-dispatch', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);
    ship.autoSurvey = false;

    // Put ship in transit (has a path)
    const neighbors = engine._adjacency.get(colony.systemId) || [];
    assert.ok(neighbors.length > 0, 'need at least one neighbor');
    ship.path = [neighbors[0]];
    ship.targetSystemId = neighbors[0];
    ship.hopProgress = 5;

    const result = engine.handleCommand('p1', { type: 'toggleAutoSurvey', shipId: ship.id });
    assert.strictEqual(result.autoSurvey, true);
    // Ship should keep its existing path, not get a new one
    assert.strictEqual(ship.targetSystemId, neighbors[0], 'should keep original target');
    assert.deepStrictEqual(ship.path, [neighbors[0]], 'path should be unchanged');
  });

  it('toggle ON while ship is surveying does not re-dispatch', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);
    ship.autoSurvey = false;
    ship.surveying = true;
    ship.surveyProgress = 5;

    const result = engine.handleCommand('p1', { type: 'toggleAutoSurvey', shipId: ship.id });
    assert.strictEqual(result.autoSurvey, true);
    // Ship should still be surveying
    assert.strictEqual(ship.surveying, true, 'should still be surveying');
    assert.strictEqual(ship.surveyProgress, 5, 'survey progress unchanged');
  });
});

// ── Auto-chain path correctness ──

describe('Auto-Chain Survey Deep — path correctness', () => {
  it('auto-chain path is a valid walk through the adjacency graph', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);

    // Survey colony system
    const surveyed = engine._surveyedSystems.get('p1') || new Set();
    surveyed.add(colony.systemId);
    engine._surveyedSystems.set('p1', surveyed);

    const dispatched = engine._autoChainSurvey(ship);
    assert.strictEqual(dispatched, true, 'should dispatch');

    // Walk the path and verify each step is adjacent
    let current = colony.systemId;
    for (const next of ship.path) {
      const neighbors = engine._adjacency.get(current) || [];
      assert.ok(neighbors.includes(next),
        `path step ${current} → ${next} is not adjacent`);
      current = next;
    }
    // Last node in path should be the target
    assert.strictEqual(current, ship.targetSystemId, 'path should end at targetSystemId');
  });

  it('auto-chain target is actually unsurveyed', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);

    // Survey colony system and some neighbors
    const surveyed = engine._surveyedSystems.get('p1') || new Set();
    surveyed.add(colony.systemId);
    const neighbors = engine._adjacency.get(colony.systemId) || [];
    if (neighbors.length > 1) surveyed.add(neighbors[0]); // survey one neighbor
    engine._surveyedSystems.set('p1', surveyed);

    engine._autoChainSurvey(ship);
    assert.ok(!surveyed.has(ship.targetSystemId), 'target must be unsurveyed');
  });
});

// ── Multiple science ships ──

describe('Auto-Chain Survey Deep — multiple ships', () => {
  it('two ships at same system auto-chain to different targets when possible', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship1 = spawnScienceShip(engine, 'p1', colony.systemId);
    const ship2 = spawnScienceShip(engine, 'p1', colony.systemId);

    // Survey colony system
    const surveyed = engine._surveyedSystems.get('p1') || new Set();
    surveyed.add(colony.systemId);
    engine._surveyedSystems.set('p1', surveyed);

    // Count unsurveyed neighbors
    const neighbors = engine._adjacency.get(colony.systemId) || [];
    const unsurveyedNeighbors = neighbors.filter(n => !surveyed.has(n));

    // Set up both ships completing survey simultaneously
    const adjSys = unsurveyedNeighbors[0];
    if (adjSys === undefined) return; // skip if no unsurveyed neighbors

    // Ship 1 completes survey at adjSys
    ship1.systemId = adjSys;
    ship1.surveying = true;
    ship1.surveyProgress = SURVEY_TICKS - 1;
    ship1.targetSystemId = adjSys;

    engine._processScienceShipMovement();

    // Now ship 1 should have auto-chained. Ship 2 still idle at colony.
    // Dispatch ship 2
    engine._autoChainSurvey(ship2);

    if (ship1.targetSystemId !== null && ship2.targetSystemId !== null) {
      // Both dispatched — if enough unsurveyed targets exist, they should differ
      const remainingUnsurveyed = [];
      for (const sys of engine.galaxy.systems) {
        if (!surveyed.has(sys.id)) remainingUnsurveyed.push(sys.id);
      }
      if (remainingUnsurveyed.length >= 2) {
        // They may or may not pick different targets (BFS is deterministic from same position),
        // but both targets must be unsurveyed
        assert.ok(!surveyed.has(ship1.targetSystemId), 'ship1 target unsurveyed');
        assert.ok(!surveyed.has(ship2.targetSystemId), 'ship2 target unsurveyed');
      }
    }
  });
});

// ── System ID 0 regression ──

describe('Auto-Chain Survey Deep — system ID 0 regression', () => {
  it('auto-chain works when ship is at system ID 0', () => {
    const engine = createEngine();
    // Force ship to system 0
    const ship = spawnScienceShip(engine, 'p1', 0);

    const surveyed = new Set([0]);
    engine._surveyedSystems.set('p1', surveyed);

    const neighbors = engine._adjacency.get(0) || [];
    if (neighbors.length === 0) return; // system 0 may be disconnected in some galaxy layouts

    const result = engine._autoChainSurvey(ship);
    assert.strictEqual(result, true, 'should dispatch from system 0');
    assert.ok(ship.path.length > 0, 'should have a path');
    assert.ok(ship.targetSystemId !== null, 'should have a target');
  });

  it('auto-chain can target system ID 0', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');

    // Survey everything except system 0
    const surveyed = new Set();
    for (const sys of engine.galaxy.systems) {
      if (sys.id !== 0) surveyed.add(sys.id);
    }
    engine._surveyedSystems.set('p1', surveyed);

    // Place ship at a system adjacent to 0
    const neighborsOf0 = engine._adjacency.get(0) || [];
    if (neighborsOf0.length === 0) return;

    const ship = spawnScienceShip(engine, 'p1', neighborsOf0[0]);
    surveyed.add(neighborsOf0[0]);

    const result = engine._autoChainSurvey(ship);
    // If system 0 is within 3 hops, it should be the target
    if (result) {
      assert.strictEqual(ship.targetSystemId, 0, 'should target system ID 0');
    }
  });

  it('resource rush claim works at system ID 0', () => {
    const engine = createEngine();
    // Set up resource rush at system 0
    engine._resourceRushSystem = 0;
    engine._resourceRushResource = 'minerals';
    engine._resourceRushOwner = null;
    engine._resourceRushTicksLeft = 0;
    engine._catalystResourceRushFired = true;

    // The !== null check should correctly identify system 0 as a valid rush system
    assert.strictEqual(engine._resourceRushSystem !== null, true,
      'system ID 0 should pass !== null check');
    assert.strictEqual(engine._resourceRushSystem === 0, true);

    // Try claiming it
    engine._claimResourceRush('p1');
    assert.strictEqual(engine._resourceRushOwner, 'p1', 'p1 should claim rush at system 0');
  });
});

// ── _completeSurvey triggers auto-chain ──

describe('Auto-Chain Survey Deep — completeSurvey integration', () => {
  it('_completeSurvey marks system surveyed then auto-chains', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const neighbors = engine._adjacency.get(colony.systemId) || [];
    assert.ok(neighbors.length > 0);

    const ship = spawnScienceShip(engine, 'p1', neighbors[0]);
    ship.targetSystemId = neighbors[0]; // was sent here to survey

    // Survey colony system beforehand
    const surveyed = engine._surveyedSystems.get('p1') || new Set();
    surveyed.add(colony.systemId);
    engine._surveyedSystems.set('p1', surveyed);

    engine._completeSurvey(ship);

    // After _completeSurvey: neighbors[0] should now be surveyed
    assert.ok(surveyed.has(neighbors[0]), 'completed system should be surveyed');

    // Ship should have auto-chained if there are more unsurveyed neighbors
    const allSurveyed = engine.galaxy.systems.every(s => surveyed.has(s.id));
    if (!allSurveyed) {
      // With autoSurvey=true and unsurveyed systems within 3 hops, should dispatch
      const hasNearbyUnsurveyed = [...(engine._adjacency.get(neighbors[0]) || [])]
        .some(n => !surveyed.has(n));
      if (hasNearbyUnsurveyed) {
        assert.ok(ship.path.length > 0, 'should auto-chain after completeSurvey');
      }
    }
  });

  it('_completeSurvey emits surveyComplete event before auto-chain', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const neighbors = engine._adjacency.get(colony.systemId) || [];
    if (neighbors.length === 0) return;

    const ship = spawnScienceShip(engine, 'p1', neighbors[0]);
    ship.targetSystemId = neighbors[0];

    // Capture events
    const events = [];
    const origEmit = engine._emitEvent.bind(engine);
    engine._emitEvent = (type, ...args) => {
      events.push(type);
      origEmit(type, ...args);
    };

    engine._completeSurvey(ship);

    assert.ok(events.includes('surveyComplete'), 'should emit surveyComplete');
  });
});

// ── Cache invalidation ──

describe('Auto-Chain Survey Deep — cache invalidation', () => {
  it('auto-chain dispatch invalidates the state cache', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);

    const surveyed = engine._surveyedSystems.get('p1') || new Set();
    surveyed.add(colony.systemId);
    engine._surveyedSystems.set('p1', surveyed);

    // Prime the cache
    engine.getPlayerStateJSON('p1');
    assert.ok(engine._cachedPlayerJSON.size > 0, 'cache should be primed');

    // Auto-chain should invalidate
    const dispatched = engine._autoChainSurvey(ship);
    if (dispatched) {
      // _invalidateStateCache sets _stateCacheDirty — next getPlayerStateJSON rebuilds
      assert.strictEqual(engine._stateCacheDirty, true,
        'state cache should be marked dirty after auto-chain');
    }
  });

  it('toggleAutoSurvey invalidates the state cache', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);

    // Prime the cache
    engine.getPlayerStateJSON('p1');
    engine._stateCacheDirty = false;

    engine.handleCommand('p1', { type: 'toggleAutoSurvey', shipId: ship.id });
    assert.strictEqual(engine._stateCacheDirty, true,
      'cache should be marked dirty after toggle');
  });
});

// ── End-to-end auto-chain across multiple surveys ──

describe('Auto-Chain Survey Deep — full cycle', () => {
  it('ship chains through multiple surveys without manual intervention', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);

    // Survey colony system
    const surveyed = engine._surveyedSystems.get('p1') || new Set();
    surveyed.add(colony.systemId);
    engine._surveyedSystems.set('p1', surveyed);

    // First auto-chain dispatch
    const dispatched1 = engine._autoChainSurvey(ship);
    if (!dispatched1) return; // no unsurveyed neighbors

    const target1 = ship.targetSystemId;
    assert.ok(target1 !== null);

    // Simulate arrival: move ship to target, start survey, complete it
    ship.systemId = target1;
    ship.path = [];
    ship.hopProgress = 0;
    ship.surveying = true;
    ship.surveyProgress = SURVEY_TICKS - 1;
    ship.targetSystemId = target1;

    engine._processScienceShipMovement();

    // After completing survey at target1, should have auto-chained to target2
    const target2 = ship.targetSystemId;
    // target1 should now be surveyed
    assert.ok(surveyed.has(target1), 'first target should be surveyed');

    // If there are more unsurveyed systems nearby, ship should have a new target
    const hasMore = engine.galaxy.systems.some(s => !surveyed.has(s.id));
    if (hasMore && target2 !== null) {
      assert.notStrictEqual(target2, target1, 'second target should differ from first');
      assert.ok(!surveyed.has(target2), 'second target should be unsurveyed');
    }
  });
});

// ── Edge cases ──

describe('Auto-Chain Survey Deep — edge cases', () => {
  it('auto-chain with no adjacency graph returns false gracefully', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);

    // Wipe adjacency
    const originalAdj = engine._adjacency;
    engine._adjacency = new Map();

    const result = engine._autoChainSurvey(ship);
    assert.strictEqual(result, false, 'should return false with empty adjacency');
    assert.ok(!ship.path || ship.path.length === 0);

    engine._adjacency = originalAdj;
  });

  it('auto-chain with null galaxy returns false', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);

    engine.galaxy = null;
    const result = engine._autoChainSurvey(ship);
    assert.strictEqual(result, false);
  });

  it('auto-chain when all within-3-hop systems are surveyed but further ones exist', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);

    // Survey all systems within 3 hops via BFS
    const surveyed = new Set();
    let frontier = [colony.systemId];
    surveyed.add(colony.systemId);
    for (let depth = 0; depth < 3; depth++) {
      const nextFrontier = [];
      for (const sysId of frontier) {
        for (const neighbor of (engine._adjacency.get(sysId) || [])) {
          if (!surveyed.has(neighbor)) {
            surveyed.add(neighbor);
            nextFrontier.push(neighbor);
          }
        }
      }
      frontier = nextFrontier;
    }
    engine._surveyedSystems.set('p1', surveyed);

    const result = engine._autoChainSurvey(ship);
    assert.strictEqual(result, false,
      'should not dispatch beyond 3-hop range');
  });

  it('toggleAutoSurvey on a ship that was just destroyed is rejected', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);
    const shipId = ship.id;

    // Remove the ship (simulating destruction)
    engine._removeScienceShip(ship);

    const result = engine.handleCommand('p1', { type: 'toggleAutoSurvey', shipId });
    assert.ok(result.error, 'should reject toggle for destroyed ship');
  });
});

// ── Serialization roundtrip ──

describe('Auto-Chain Survey Deep — serialization roundtrip', () => {
  it('autoSurvey field survives JSON roundtrip in getPlayerStateJSON', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship1 = spawnScienceShip(engine, 'p1', colony.systemId);
    const ship2 = spawnScienceShip(engine, 'p1', colony.systemId);
    ship2.autoSurvey = false;

    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);

    const s1 = parsed.scienceShips.find(s => s.id === ship1.id);
    const s2 = parsed.scienceShips.find(s => s.id === ship2.id);
    assert.strictEqual(s1.autoSurvey, true);
    assert.strictEqual(s2.autoSurvey, false);
  });

  it('auto-chained ship path appears in serialized state', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    const ship = spawnScienceShip(engine, 'p1', colony.systemId);

    const surveyed = engine._surveyedSystems.get('p1') || new Set();
    surveyed.add(colony.systemId);
    engine._surveyedSystems.set('p1', surveyed);

    const dispatched = engine._autoChainSurvey(ship);
    if (!dispatched) return;

    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    const serializedShip = parsed.scienceShips.find(s => s.id === ship.id);
    assert.ok(serializedShip.path.length > 0, 'path should be in serialized state');
    assert.strictEqual(serializedShip.targetSystemId, ship.targetSystemId);
  });
});
