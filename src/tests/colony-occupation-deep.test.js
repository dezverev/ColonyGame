const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  CORVETTE_HP, CORVETTE_ATTACK,
  OCCUPATION_TICKS, OCCUPATION_PRODUCTION_MULT,
  OCCUPATION_ATTACKER_VP, OCCUPATION_DEFENDER_VP,
} = require('../../server/game-engine');

// Helper: create a 2-player game engine
function createEngine() {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  players.set('p2', { name: 'Player 2' });
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  return new GameEngine(room, { tickRate: 10 });
}

// Helper: create a 3-player game engine
function create3PlayerEngine() {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  players.set('p2', { name: 'Player 2' });
  players.set('p3', { name: 'Player 3' });
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  return new GameEngine(room, { tickRate: 10 });
}

function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

function giveResources(engine, playerId) {
  const state = engine.playerStates.get(playerId);
  state.resources.minerals = 10000;
  state.resources.alloys = 10000;
  state.resources.energy = 10000;
  state.resources.food = 10000;
}

function setHostile(engine, p1, p2) {
  const s1 = engine.playerStates.get(p1);
  const s2 = engine.playerStates.get(p2);
  if (s1) s1.diplomacy[p2] = { stance: 'hostile', cooldownTick: 0 };
  if (s2) s2.diplomacy[p1] = { stance: 'hostile', cooldownTick: 0 };
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

// ── Production penalty — all resources ──

describe('Occupation Production — All Resources', () => {
  let engine, p2Colony;

  beforeEach(() => {
    engine = createEngine();
    setHostile(engine, 'p1', 'p2');
    p2Colony = getFirstColony(engine, 'p2');
    giveResources(engine, 'p2');
  });

  it('should halve minerals production when occupied', () => {
    const { production: normalProd } = engine._calcProduction(p2Colony);
    const normalMinerals = normalProd.minerals;

    p2Colony.occupiedBy = 'p1';
    p2Colony._cachedProduction = null;

    const { production: occProd } = engine._calcProduction(p2Colony);

    if (normalMinerals > 0) {
      assert.strictEqual(occProd.minerals, Math.round(normalMinerals * OCCUPATION_PRODUCTION_MULT * 100) / 100,
        'minerals should be halved');
    }
  });

  it('should halve food production when occupied', () => {
    const { production: normalProd } = engine._calcProduction(p2Colony);
    const normalFood = normalProd.food;

    p2Colony.occupiedBy = 'p1';
    p2Colony._cachedProduction = null;

    const { production: occProd } = engine._calcProduction(p2Colony);

    if (normalFood > 0) {
      assert.strictEqual(occProd.food, Math.round(normalFood * OCCUPATION_PRODUCTION_MULT * 100) / 100,
        'food should be halved');
    }
  });

  it('should halve alloys production when occupied', () => {
    const { production: normalProd } = engine._calcProduction(p2Colony);
    const normalAlloys = normalProd.alloys;

    p2Colony.occupiedBy = 'p1';
    p2Colony._cachedProduction = null;

    const { production: occProd } = engine._calcProduction(p2Colony);

    if (normalAlloys > 0) {
      assert.strictEqual(occProd.alloys, Math.round(normalAlloys * OCCUPATION_PRODUCTION_MULT * 100) / 100,
        'alloys should be halved');
    }
  });

  it('should not halve production values that are zero or negative', () => {
    // Zero out all production by clearing districts
    p2Colony.districts = [];
    p2Colony._cachedProduction = null;
    p2Colony._cachedJobs = null;
    p2Colony._cachedHousing = null;

    const { production: baseProd } = engine._calcProduction(p2Colony);

    p2Colony.occupiedBy = 'p1';
    p2Colony._cachedProduction = null;

    const { production: occProd } = engine._calcProduction(p2Colony);

    // Resources that are 0 or negative should remain unchanged
    for (const resource of Object.keys(baseProd)) {
      if (baseProd[resource] <= 0) {
        assert.strictEqual(occProd[resource], baseProd[resource],
          `${resource} with value ${baseProd[resource]} should not be modified by occupation`);
      }
    }
  });
});

// ── Occupied colony persistence with no ships ──

describe('Occupation — Status Quo With No Ships', () => {
  it('occupied colony should remain occupied when no ships are in system', () => {
    const engine = createEngine();
    const p2Colony = getFirstColony(engine, 'p2');

    // Set up already-occupied state
    p2Colony.occupiedBy = 'p1';
    p2Colony.occupationProgress = OCCUPATION_TICKS;

    // No ships anywhere — process occupation
    engine._processOccupation();

    assert.strictEqual(p2Colony.occupiedBy, 'p1', 'occupation should persist with no ships');
    assert.strictEqual(p2Colony.occupationProgress, OCCUPATION_TICKS, 'progress should not change');
  });

  it('occupied colony should remain occupied when only third-party ships present', () => {
    const engine = create3PlayerEngine();
    const p2Colony = getFirstColony(engine, 'p2');

    p2Colony.occupiedBy = 'p1';
    p2Colony.occupationProgress = OCCUPATION_TICKS;

    // p3 has ships but is neither defender (p2) nor occupier (p1)
    spawnCorvette(engine, 'p3', p2Colony.systemId);

    engine._processOccupation();

    assert.strictEqual(p2Colony.occupiedBy, 'p1', 'third-party ships should not trigger liberation');
  });
});

// ── Liberation when occupier ships are in transit ──

describe('Occupation — Liberation Via In-Transit Ships', () => {
  it('should liberate when occupier ships are present but all in transit', () => {
    const engine = createEngine();
    const p2Colony = getFirstColony(engine, 'p2');

    p2Colony.occupiedBy = 'p1';
    p2Colony.occupationProgress = OCCUPATION_TICKS;

    // Occupier ship is in system but in transit
    const attackerShip = spawnCorvette(engine, 'p1', p2Colony.systemId);
    attackerShip.path = [1, 2, 3]; // in transit

    // Defender has idle ship
    spawnCorvette(engine, 'p2', p2Colony.systemId);

    engine._processOccupation();

    assert.strictEqual(p2Colony.occupiedBy, null, 'in-transit occupier ships should not block liberation');
    assert.strictEqual(p2Colony.occupationProgress, 0);
  });

  it('should not start occupation when all attacker ships are in transit', () => {
    const engine = createEngine();
    const p2Colony = getFirstColony(engine, 'p2');

    const ship = spawnCorvette(engine, 'p1', p2Colony.systemId);
    ship.path = [1, 2, 3]; // in transit

    engine._processOccupation();

    assert.strictEqual(p2Colony.occupationProgress, 0,
      'in-transit attacker ships should not start occupation');
  });
});

// ── Multiple colonies VP stacking ──

describe('Occupation VP — Multiple Colonies', () => {
  it('attacker VP should stack for multiple occupied colonies', () => {
    const engine = create3PlayerEngine();
    const p2Colony = getFirstColony(engine, 'p2');
    const p3Colony = getFirstColony(engine, 'p3');

    // p1 occupies both p2 and p3 colonies
    p2Colony.occupiedBy = 'p1';
    p3Colony.occupiedBy = 'p1';
    engine._vpCacheTick = -1;

    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.coloniesOccupying, 2);
    assert.strictEqual(breakdown.occupiedAttackerVP, 2 * OCCUPATION_ATTACKER_VP);
  });

  it('defender VP penalty should stack for multiple occupied colonies', () => {
    const engine = createEngine();
    const p1Colonies = engine._playerColonies.get('p1') || [];

    // Give p1 a second colony if they don't have one
    // Just occupy however many they have
    for (const colId of p1Colonies) {
      const col = engine.colonies.get(colId);
      col.occupiedBy = 'p2';
    }
    engine._vpCacheTick = -1;

    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.coloniesOccupied, p1Colonies.length);
    assert.strictEqual(breakdown.occupiedDefenderVP, p1Colonies.length * OCCUPATION_DEFENDER_VP);
  });
});

// ── Dirty player tracking ──

describe('Occupation — Dirty Player Tracking', () => {
  let engine, p2Colony;

  beforeEach(() => {
    engine = createEngine();
    setHostile(engine, 'p1', 'p2');
    p2Colony = getFirstColony(engine, 'p2');
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
  });

  it('should mark both attacker and defender as dirty on occupation complete', () => {
    spawnCorvette(engine, 'p1', p2Colony.systemId);
    engine._dirtyPlayers.clear();

    for (let i = 0; i < OCCUPATION_TICKS; i++) {
      engine._processOccupation();
    }

    assert.ok(engine._dirtyPlayers.has('p1'), 'attacker should be marked dirty');
    assert.ok(engine._dirtyPlayers.has('p2'), 'defender should be marked dirty');
  });

  it('should mark both defender and former occupier as dirty on liberation', () => {
    p2Colony.occupiedBy = 'p1';
    p2Colony.occupationProgress = OCCUPATION_TICKS;

    spawnCorvette(engine, 'p2', p2Colony.systemId);
    engine._dirtyPlayers.clear();

    engine._processOccupation();

    assert.ok(engine._dirtyPlayers.has('p2'), 'defender should be marked dirty on liberation');
    assert.ok(engine._dirtyPlayers.has('p1'), 'former occupier should be marked dirty on liberation');
  });
});

// ── Cache invalidation ──

describe('Occupation — Cache Invalidation', () => {
  let engine, p2Colony;

  beforeEach(() => {
    engine = createEngine();
    setHostile(engine, 'p1', 'p2');
    p2Colony = getFirstColony(engine, 'p2');
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
  });

  it('should invalidate production cache when occupation completes', () => {
    p2Colony._cachedProduction = { fake: true };
    spawnCorvette(engine, 'p1', p2Colony.systemId);

    for (let i = 0; i < OCCUPATION_TICKS; i++) {
      engine._processOccupation();
    }

    assert.strictEqual(p2Colony._cachedProduction, null, 'production cache should be cleared on occupation');
  });

  it('should invalidate state cache when occupation progress changes', () => {
    // Force a cached state
    engine.getPlayerStateJSON('p2');

    spawnCorvette(engine, 'p1', p2Colony.systemId);
    engine._processOccupation();

    // After occupation progress, state cache should be invalidated
    // (meaning next call should reflect new progress)
    const stateJSON = engine.getPlayerStateJSON('p2');
    const state = JSON.parse(stateJSON);
    const colony = state.colonies.find(c => c.id === p2Colony.id);
    assert.strictEqual(colony.occupationProgress, 1, 'state should reflect updated progress');
  });

  it('should reset VP cache on occupation complete', () => {
    spawnCorvette(engine, 'p1', p2Colony.systemId);

    // Prime the VP cache
    engine._calcVPBreakdown('p1');
    const cachedTick = engine._vpCacheTick;

    for (let i = 0; i < OCCUPATION_TICKS; i++) {
      engine._processOccupation();
    }

    assert.strictEqual(engine._vpCacheTick, -1, 'VP cache should be invalidated on occupation');
  });

  it('should reset VP cache on liberation', () => {
    p2Colony.occupiedBy = 'p1';
    p2Colony.occupationProgress = OCCUPATION_TICKS;

    engine._calcVPBreakdown('p1');

    spawnCorvette(engine, 'p2', p2Colony.systemId);
    engine._processOccupation();

    assert.strictEqual(engine._vpCacheTick, -1, 'VP cache should be invalidated on liberation');
  });
});

// ── Event payload completeness ──

describe('Occupation — Event Payload Details', () => {
  let engine, p2Colony;

  beforeEach(() => {
    engine = createEngine();
    setHostile(engine, 'p1', 'p2');
    p2Colony = getFirstColony(engine, 'p2');
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
  });

  it('colonyOccupied event should include colonyName, systemName, and occupantName', () => {
    spawnCorvette(engine, 'p1', p2Colony.systemId);

    for (let i = 0; i < OCCUPATION_TICKS; i++) {
      engine._processOccupation();
    }
    const events = engine._flushEvents() || [];

    const evt = events.find(e => e.eventType === 'colonyOccupied');
    assert.ok(evt, 'should emit colonyOccupied');
    assert.strictEqual(evt.colonyName, p2Colony.name, 'should include colony name');
    assert.ok(evt.systemName, 'should include system name');
    assert.strictEqual(evt.occupantName, 'Player 1', 'should include occupant display name');
    assert.strictEqual(evt.systemId, p2Colony.systemId, 'should include system ID');
  });

  it('colonyLiberated event should include colonyName and systemName', () => {
    p2Colony.occupiedBy = 'p1';
    p2Colony.occupationProgress = OCCUPATION_TICKS;

    spawnCorvette(engine, 'p2', p2Colony.systemId);
    engine._flushEvents();
    engine._processOccupation();
    const events = engine._flushEvents() || [];

    const evt = events.find(e => e.eventType === 'colonyLiberated');
    assert.ok(evt, 'should emit colonyLiberated');
    assert.strictEqual(evt.colonyName, p2Colony.name, 'should include colony name');
    assert.ok(evt.systemName, 'should include system name');
    assert.strictEqual(evt.colonyId, p2Colony.id, 'should include colony ID');
  });
});

// ── Progress reset edge cases ──

describe('Occupation — Progress Reset Edge Cases', () => {
  it('should reset progress when only in-transit attacker ships remain', () => {
    const engine = createEngine();
    setHostile(engine, 'p1', 'p2');
    const p2Colony = getFirstColony(engine, 'p2');

    // Build up some progress with idle ship
    const ship = spawnCorvette(engine, 'p1', p2Colony.systemId);
    for (let i = 0; i < 50; i++) engine._processOccupation();
    assert.strictEqual(p2Colony.occupationProgress, 50);

    // Ship starts moving (in transit)
    ship.path = [1, 2, 3];

    engine._processOccupation();
    assert.strictEqual(p2Colony.occupationProgress, 0,
      'progress should reset when attacker ships become in-transit');
  });

  it('should not allow occupation progress to exceed OCCUPATION_TICKS via continued processing', () => {
    const engine = createEngine();
    setHostile(engine, 'p1', 'p2');
    const p2Colony = getFirstColony(engine, 'p2');

    spawnCorvette(engine, 'p1', p2Colony.systemId);

    // Run well past OCCUPATION_TICKS
    for (let i = 0; i < OCCUPATION_TICKS + 50; i++) {
      engine._processOccupation();
    }

    // Once occupied, the `continue` at line 2302 prevents further increments
    assert.strictEqual(p2Colony.occupationProgress, OCCUPATION_TICKS,
      'progress should not exceed OCCUPATION_TICKS');
    assert.strictEqual(p2Colony.occupiedBy, 'p1');
  });

  it('should handle colony with null systemId gracefully', () => {
    const engine = createEngine();
    const p2Colony = getFirstColony(engine, 'p2');

    p2Colony.systemId = null;

    // Should skip this colony without throwing
    assert.doesNotThrow(() => {
      engine._processOccupation();
    });
    assert.strictEqual(p2Colony.occupationProgress, 0);
  });
});

// ── Serialization in gameInit (not just gameState) ──

describe('Occupation — Serialization in Player View', () => {
  it('attacker VP in state view should reflect occupation bonus', () => {
    const engine = createEngine();
    const p2Colony = getFirstColony(engine, 'p2');

    // Get baseline VP
    engine._invalidateStateCache();
    const baseJSON = engine.getPlayerStateJSON('p1');
    const baseState = JSON.parse(baseJSON);
    const baseVP = baseState.players[0].vp;

    // Occupy p2's colony
    p2Colony.occupiedBy = 'p1';
    p2Colony.occupationProgress = OCCUPATION_TICKS;
    p2Colony._cachedProduction = null;
    engine._vpCacheTick = -1;
    engine._invalidateStateCache();

    const stateJSON = engine.getPlayerStateJSON('p1');
    const state = JSON.parse(stateJSON);

    assert.strictEqual(state.players[0].vp, baseVP + OCCUPATION_ATTACKER_VP,
      'attacker VP should include occupation bonus in broadcast state');
  });

  it('unoccupied colonies should not have occupation fields in serialized output', () => {
    const engine = createEngine();
    const p1Colony = getFirstColony(engine, 'p1');
    engine._invalidateStateCache();

    const stateJSON = engine.getPlayerStateJSON('p1');
    const state = JSON.parse(stateJSON);
    const colony = state.colonies.find(c => c.id === p1Colony.id);

    assert.strictEqual(colony.occupiedBy, undefined, 'should not include occupiedBy when null');
    assert.strictEqual(colony.occupationProgress, undefined, 'should not include occupationProgress when 0');
  });
});
