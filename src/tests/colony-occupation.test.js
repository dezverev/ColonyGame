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
  const engine = new GameEngine(room, { tickRate: 10 });
  return engine;
}

// Helper: get first colony for a player
function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

// Helper: give player enough resources
function giveResources(engine, playerId) {
  const state = engine.playerStates.get(playerId);
  state.resources.minerals = 10000;
  state.resources.alloys = 10000;
  state.resources.energy = 10000;
  state.resources.food = 10000;
}

// Helper: set two players as hostile (required for occupation)
function setHostile(engine, p1, p2) {
  const s1 = engine.playerStates.get(p1);
  const s2 = engine.playerStates.get(p2);
  if (s1) s1.diplomacy[p2] = { stance: 'hostile', cooldownTick: 0 };
  if (s2) s2.diplomacy[p1] = { stance: 'hostile', cooldownTick: 0 };
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

// ── Constants ──

describe('Colony Occupation Constants', () => {
  it('should export occupation constants', () => {
    assert.strictEqual(OCCUPATION_TICKS, 300);
    assert.strictEqual(OCCUPATION_PRODUCTION_MULT, 0.5);
    assert.strictEqual(OCCUPATION_ATTACKER_VP, 3);
    assert.strictEqual(OCCUPATION_DEFENDER_VP, -5);
  });

  it('occupation VP values should be asymmetric (defender loses more than attacker gains)', () => {
    assert.ok(Math.abs(OCCUPATION_DEFENDER_VP) > OCCUPATION_ATTACKER_VP);
  });
});

// ── Colony initial state ──

describe('Colony Occupation Initial State', () => {
  it('new colonies should have null occupiedBy and 0 occupationProgress', () => {
    const engine = createEngine();
    const colony = getFirstColony(engine, 'p1');
    assert.strictEqual(colony.occupiedBy, null);
    assert.strictEqual(colony.occupationProgress, 0);
  });
});

// ── Occupation progress ──

describe('Colony Occupation Progress', () => {
  let engine, p1Colony, p2Colony;

  beforeEach(() => {
    engine = createEngine();
    setHostile(engine, 'p1', 'p2');
    p1Colony = getFirstColony(engine, 'p1');
    p2Colony = getFirstColony(engine, 'p2');
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
  });

  it('should increment occupationProgress when attacker ships present and no defender ships', () => {
    // Place p1 corvette at p2 colony system
    spawnCorvette(engine, 'p1', p2Colony.systemId);

    engine._processOccupation();

    assert.strictEqual(p2Colony.occupationProgress, 1);
    assert.strictEqual(p2Colony.occupiedBy, null); // not yet complete
  });

  it('should not increment progress when defender ships are present', () => {
    spawnCorvette(engine, 'p1', p2Colony.systemId);
    spawnCorvette(engine, 'p2', p2Colony.systemId);

    engine._processOccupation();

    assert.strictEqual(p2Colony.occupationProgress, 0);
  });

  it('should not increment progress when only defender ships are present', () => {
    spawnCorvette(engine, 'p2', p2Colony.systemId);

    engine._processOccupation();

    assert.strictEqual(p2Colony.occupationProgress, 0);
  });

  it('should not increment progress when no ships are present', () => {
    engine._processOccupation();

    assert.strictEqual(p2Colony.occupationProgress, 0);
  });

  it('should reset progress when attacker ships leave', () => {
    // Build up some progress
    spawnCorvette(engine, 'p1', p2Colony.systemId);
    for (let i = 0; i < 50; i++) engine._processOccupation();
    assert.strictEqual(p2Colony.occupationProgress, 50);

    // Remove attacker ships
    const ships = engine._militaryShipsBySystem.get(p2Colony.systemId) || [];
    for (const s of [...ships]) engine._removeMilitaryShip(s);

    engine._processOccupation();
    assert.strictEqual(p2Colony.occupationProgress, 0);
  });

  it('should reset progress when defender ships arrive', () => {
    spawnCorvette(engine, 'p1', p2Colony.systemId);
    for (let i = 0; i < 50; i++) engine._processOccupation();
    assert.strictEqual(p2Colony.occupationProgress, 50);

    // Defender arrives
    spawnCorvette(engine, 'p2', p2Colony.systemId);

    engine._processOccupation();
    assert.strictEqual(p2Colony.occupationProgress, 0);
  });

  it('should ignore ships in transit (with non-empty path)', () => {
    const ship = spawnCorvette(engine, 'p1', p2Colony.systemId);
    ship.path = [1, 2, 3]; // in transit

    engine._processOccupation();

    assert.strictEqual(p2Colony.occupationProgress, 0);
  });

  it('should complete occupation after OCCUPATION_TICKS', () => {
    spawnCorvette(engine, 'p1', p2Colony.systemId);

    for (let i = 0; i < OCCUPATION_TICKS; i++) {
      engine._processOccupation();
    }

    assert.strictEqual(p2Colony.occupiedBy, 'p1');
    assert.strictEqual(p2Colony.occupationProgress, OCCUPATION_TICKS);
  });
});

// ── Occupation events ──

describe('Colony Occupation Events', () => {
  let engine, p2Colony;

  beforeEach(() => {
    engine = createEngine();
    setHostile(engine, 'p1', 'p2');
    p2Colony = getFirstColony(engine, 'p2');
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
  });

  it('should emit colonyOccupied event when occupation completes', () => {
    spawnCorvette(engine, 'p1', p2Colony.systemId);

    for (let i = 0; i < OCCUPATION_TICKS; i++) {
      engine._processOccupation();
    }
    const events = engine._flushEvents() || [];

    const occupiedEvt = events.find(e => e.eventType === 'colonyOccupied');
    assert.ok(occupiedEvt, 'should emit colonyOccupied event');
    assert.strictEqual(occupiedEvt.colonyId, p2Colony.id);
    assert.strictEqual(occupiedEvt.occupantId, 'p1');
    assert.strictEqual(occupiedEvt.broadcast, true);
  });

  it('should emit colonyLiberated event when defender recaptures', () => {
    // Occupy the colony
    spawnCorvette(engine, 'p1', p2Colony.systemId);
    for (let i = 0; i < OCCUPATION_TICKS; i++) {
      engine._processOccupation();
    }
    assert.strictEqual(p2Colony.occupiedBy, 'p1');

    // Remove attacker, add defender
    const ships = engine._militaryShipsBySystem.get(p2Colony.systemId) || [];
    for (const s of [...ships]) engine._removeMilitaryShip(s);
    spawnCorvette(engine, 'p2', p2Colony.systemId);

    // Flush old events, then process liberation
    engine._flushEvents();
    engine._processOccupation();
    const events = engine._flushEvents() || [];

    const libEvt = events.find(e => e.eventType === 'colonyLiberated');
    assert.ok(libEvt, 'should emit colonyLiberated event');
    assert.strictEqual(libEvt.colonyId, p2Colony.id);
    assert.strictEqual(libEvt.liberatedFrom, 'p1');
    assert.strictEqual(libEvt.broadcast, true);
  });
});

// ── Production penalty ──

describe('Occupation Production Penalty', () => {
  let engine, p2Colony;

  beforeEach(() => {
    engine = createEngine();
    p2Colony = getFirstColony(engine, 'p2');
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
  });

  it('should halve production when colony is occupied', () => {
    // Get normal production
    const { production: normalProd } = engine._calcProduction(p2Colony);
    const normalEnergy = normalProd.energy;

    // Occupy the colony
    p2Colony.occupiedBy = 'p1';
    p2Colony._cachedProduction = null;

    const { production: occProd } = engine._calcProduction(p2Colony);

    // Energy production should be halved (if it was positive)
    if (normalEnergy > 0) {
      assert.strictEqual(occProd.energy, Math.round(normalEnergy * 0.5 * 100) / 100);
    }
  });

  it('should not modify consumption when occupied', () => {
    const { consumption: normalCons } = engine._calcProduction(p2Colony);

    p2Colony.occupiedBy = 'p1';
    p2Colony._cachedProduction = null;

    const { consumption: occCons } = engine._calcProduction(p2Colony);

    assert.strictEqual(occCons.food, normalCons.food);
    assert.strictEqual(occCons.energy, normalCons.energy);
  });

  it('should restore full production when liberated', () => {
    const { production: normalProd } = engine._calcProduction(p2Colony);

    p2Colony.occupiedBy = 'p1';
    p2Colony._cachedProduction = null;
    engine._calcProduction(p2Colony); // compute occupied production

    p2Colony.occupiedBy = null;
    p2Colony._cachedProduction = null;

    const { production: restoredProd } = engine._calcProduction(p2Colony);

    assert.strictEqual(restoredProd.energy, normalProd.energy);
    assert.strictEqual(restoredProd.minerals, normalProd.minerals);
  });
});

// ── VP integration ──

describe('Occupation VP', () => {
  let engine, p2Colony;

  beforeEach(() => {
    engine = createEngine();
    p2Colony = getFirstColony(engine, 'p2');
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
  });

  it('attacker should gain VP for occupied colonies', () => {
    const vpBefore = engine._calcVPBreakdown('p1');

    p2Colony.occupiedBy = 'p1';
    engine._vpCacheTick = -1;

    const vpAfter = engine._calcVPBreakdown('p1');

    assert.strictEqual(vpAfter.coloniesOccupying, 1);
    assert.strictEqual(vpAfter.occupiedAttackerVP, OCCUPATION_ATTACKER_VP);
    assert.strictEqual(vpAfter.vp, vpBefore.vp + OCCUPATION_ATTACKER_VP);
  });

  it('defender should lose VP for occupied colonies', () => {
    const vpBefore = engine._calcVPBreakdown('p2');

    p2Colony.occupiedBy = 'p1';
    engine._vpCacheTick = -1;

    const vpAfter = engine._calcVPBreakdown('p2');

    assert.strictEqual(vpAfter.coloniesOccupied, 1);
    assert.strictEqual(vpAfter.occupiedDefenderVP, OCCUPATION_DEFENDER_VP);
    assert.strictEqual(vpAfter.vp, vpBefore.vp + OCCUPATION_DEFENDER_VP);
  });

  it('VP should reset when colony is liberated', () => {
    p2Colony.occupiedBy = 'p1';
    engine._vpCacheTick = -1;
    const vpOccupied = engine._calcVPBreakdown('p1');
    assert.strictEqual(vpOccupied.coloniesOccupying, 1);

    p2Colony.occupiedBy = null;
    engine._vpCacheTick = -1;

    const vpLiberated = engine._calcVPBreakdown('p1');
    assert.strictEqual(vpLiberated.coloniesOccupying, 0);
    assert.strictEqual(vpLiberated.occupiedAttackerVP, 0);
  });

  it('empty VP breakdown should include occupation fields', () => {
    engine._vpCacheTick = -1;
    const breakdown = engine._calcVPBreakdown('nonexistent');
    assert.strictEqual(breakdown.coloniesOccupying, 0);
    assert.strictEqual(breakdown.occupiedAttackerVP, 0);
    assert.strictEqual(breakdown.coloniesOccupied, 0);
    assert.strictEqual(breakdown.occupiedDefenderVP, 0);
  });
});

// ── Liberation ──

describe('Colony Liberation', () => {
  let engine, p2Colony;

  beforeEach(() => {
    engine = createEngine();
    p2Colony = getFirstColony(engine, 'p2');
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
  });

  it('should liberate colony when defender has ships and occupier does not', () => {
    // Occupy
    p2Colony.occupiedBy = 'p1';
    p2Colony.occupationProgress = OCCUPATION_TICKS;

    // Defender arrives, no attacker
    spawnCorvette(engine, 'p2', p2Colony.systemId);

    engine._processOccupation();

    assert.strictEqual(p2Colony.occupiedBy, null);
    assert.strictEqual(p2Colony.occupationProgress, 0);
  });

  it('should NOT liberate when both occupier and defender have ships', () => {
    p2Colony.occupiedBy = 'p1';
    p2Colony.occupationProgress = OCCUPATION_TICKS;

    spawnCorvette(engine, 'p1', p2Colony.systemId);
    spawnCorvette(engine, 'p2', p2Colony.systemId);

    engine._processOccupation();

    // Still occupied — both present, no change
    assert.strictEqual(p2Colony.occupiedBy, 'p1');
  });

  it('should NOT liberate when only occupier has ships', () => {
    p2Colony.occupiedBy = 'p1';
    p2Colony.occupationProgress = OCCUPATION_TICKS;

    spawnCorvette(engine, 'p1', p2Colony.systemId);

    engine._processOccupation();

    assert.strictEqual(p2Colony.occupiedBy, 'p1');
  });

  it('should invalidate production cache on liberation', () => {
    p2Colony.occupiedBy = 'p1';
    p2Colony.occupationProgress = OCCUPATION_TICKS;
    p2Colony._cachedProduction = { fake: true };

    spawnCorvette(engine, 'p2', p2Colony.systemId);
    engine._processOccupation();

    assert.strictEqual(p2Colony._cachedProduction, null);
  });
});

// ── Serialization ──

describe('Colony Occupation Serialization', () => {
  let engine, p2Colony;

  beforeEach(() => {
    engine = createEngine();
    p2Colony = getFirstColony(engine, 'p2');
  });

  it('should not include occupation fields when unoccupied and no progress', () => {
    const serialized = engine._serializeColony(p2Colony);
    assert.strictEqual(serialized.occupiedBy, undefined);
    assert.strictEqual(serialized.occupationProgress, undefined);
  });

  it('should include occupationProgress when in progress but not yet occupied', () => {
    p2Colony.occupationProgress = 50;
    p2Colony._cachedProduction = null;

    const serialized = engine._serializeColony(p2Colony);
    assert.strictEqual(serialized.occupiedBy, undefined);
    assert.strictEqual(serialized.occupationProgress, 50);
  });

  it('should include both fields when colony is occupied', () => {
    p2Colony.occupiedBy = 'p1';
    p2Colony.occupationProgress = OCCUPATION_TICKS;
    p2Colony._cachedProduction = null;

    const serialized = engine._serializeColony(p2Colony);
    assert.strictEqual(serialized.occupiedBy, 'p1');
    assert.strictEqual(serialized.occupationProgress, OCCUPATION_TICKS);
  });

  it('should include occupation data in getPlayerState broadcast', () => {
    p2Colony.occupiedBy = 'p1';
    p2Colony.occupationProgress = OCCUPATION_TICKS;
    p2Colony._cachedProduction = null;
    engine._invalidateStateCache();

    const stateJSON = engine.getPlayerStateJSON('p2');
    const state = JSON.parse(stateJSON);
    const colony = state.colonies.find(c => c.id === p2Colony.id);
    assert.ok(colony, 'colony should be in state');
    assert.strictEqual(colony.occupiedBy, 'p1');
    assert.strictEqual(colony.occupationProgress, OCCUPATION_TICKS);
  });
});

// ── Tick integration ──

describe('Colony Occupation Tick Integration', () => {
  let engine, p2Colony;

  beforeEach(() => {
    engine = createEngine();
    setHostile(engine, 'p1', 'p2');
    p2Colony = getFirstColony(engine, 'p2');
    giveResources(engine, 'p1');
    giveResources(engine, 'p2');
  });

  it('should process occupation in tick loop', () => {
    spawnCorvette(engine, 'p1', p2Colony.systemId);

    // Run a few ticks
    for (let i = 0; i < 10; i++) engine.tick();

    assert.ok(p2Colony.occupationProgress > 0, 'occupation should progress during ticks');
    assert.strictEqual(p2Colony.occupiedBy, null); // not enough ticks
  });

  it('full occupation through tick loop', () => {
    spawnCorvette(engine, 'p1', p2Colony.systemId);

    // Run enough ticks to complete occupation
    for (let i = 0; i < OCCUPATION_TICKS + 10; i++) engine.tick();

    assert.strictEqual(p2Colony.occupiedBy, 'p1');
  });
});

// ── Edge cases ──

describe('Colony Occupation Edge Cases', () => {
  it('should not occupy own colony', () => {
    const engine = createEngine();
    const p1Colony = getFirstColony(engine, 'p1');

    // Place own corvette at own colony
    spawnCorvette(engine, 'p1', p1Colony.systemId);

    engine._processOccupation();

    assert.strictEqual(p1Colony.occupationProgress, 0);
    assert.strictEqual(p1Colony.occupiedBy, null);
  });

  it('should handle colony in system with no galaxy data', () => {
    const engine = createEngine();
    setHostile(engine, 'p1', 'p2');
    const p2Colony = getFirstColony(engine, 'p2');
    giveResources(engine, 'p1');

    // Remove galaxy data
    engine.galaxy = null;

    spawnCorvette(engine, 'p1', p2Colony.systemId);

    // Should not throw
    for (let i = 0; i < OCCUPATION_TICKS; i++) {
      engine._processOccupation();
    }

    assert.strictEqual(p2Colony.occupiedBy, 'p1');
  });

  it('3-player scenario: only first non-owner hostile attacker occupies', () => {
    const players = new Map();
    players.set('p1', { name: 'Player 1' });
    players.set('p2', { name: 'Player 2' });
    players.set('p3', { name: 'Player 3' });
    const room = { players, galaxySize: 'small', matchTimer: 0 };
    const engine = new GameEngine(room, { tickRate: 10 });
    setHostile(engine, 'p1', 'p2');
    setHostile(engine, 'p3', 'p2');

    const p2Colony = getFirstColony(engine, 'p2');

    // Both p1 and p3 have ships at p2's colony
    spawnCorvette(engine, 'p1', p2Colony.systemId);
    spawnCorvette(engine, 'p3', p2Colony.systemId);

    for (let i = 0; i < OCCUPATION_TICKS; i++) {
      engine._processOccupation();
    }

    // One of them should have occupied (whichever is first in the Set iteration)
    assert.ok(p2Colony.occupiedBy !== null, 'colony should be occupied');
    assert.ok(p2Colony.occupiedBy !== 'p2', 'should not be occupied by the owner');
  });

  it('should not double-occupy an already occupied colony by a third party', () => {
    const players = new Map();
    players.set('p1', { name: 'Player 1' });
    players.set('p2', { name: 'Player 2' });
    players.set('p3', { name: 'Player 3' });
    const room = { players, galaxySize: 'small', matchTimer: 0 };
    const engine = new GameEngine(room, { tickRate: 10 });

    const p2Colony = getFirstColony(engine, 'p2');
    giveResources(engine, 'p1');
    giveResources(engine, 'p3');

    // p1 occupies
    p2Colony.occupiedBy = 'p1';
    p2Colony.occupationProgress = OCCUPATION_TICKS;

    // p3 shows up
    spawnCorvette(engine, 'p3', p2Colony.systemId);

    engine._processOccupation();

    // Should still be occupied by p1 (the continue skips already-occupied colonies)
    assert.strictEqual(p2Colony.occupiedBy, 'p1');
  });
});
