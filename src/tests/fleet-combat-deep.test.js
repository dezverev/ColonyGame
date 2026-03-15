const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  CORVETTE_COST, CORVETTE_BUILD_TIME, CORVETTE_HOP_TICKS,
  CORVETTE_HP, CORVETTE_ATTACK, MAX_CORVETTES,
  FLEET_COMBAT_MAX_ROUNDS, FLEET_BATTLE_WON_VP, FLEET_SHIP_LOST_VP,
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

// Helper: create a 3-player game engine
function createEngine3P() {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  players.set('p2', { name: 'Player 2' });
  players.set('p3', { name: 'Player 3' });
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  const engine = new GameEngine(room, { tickRate: 10 });
  return engine;
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

// ── Draw Scenario ──

describe('Fleet Combat — Draw (mutual destruction)', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('should award no battlesWon when both sides are destroyed', () => {
    spawnCorvette(engine, 'p1', 0);
    spawnCorvette(engine, 'p2', 0);

    engine._checkFleetCombat();

    assert.strictEqual(engine._militaryShips.length, 0, 'all ships destroyed');
    assert.strictEqual(engine._battlesWon.get('p1') || 0, 0, 'p1 should not get battleWon for draw');
    assert.strictEqual(engine._battlesWon.get('p2') || 0, 0, 'p2 should not get battleWon for draw');
  });

  it('should track ships lost for both sides in draw', () => {
    spawnCorvette(engine, 'p1', 0);
    spawnCorvette(engine, 'p2', 0);

    engine._checkFleetCombat();

    assert.strictEqual(engine._shipsLost.get('p1'), 1);
    assert.strictEqual(engine._shipsLost.get('p2'), 1);
  });

  it('combatResult should have winnerId=null in draw', () => {
    const events = [];
    engine.onEvent = (evts) => { events.push(...evts); };
    spawnCorvette(engine, 'p1', 0);
    spawnCorvette(engine, 'p2', 0);

    engine._checkFleetCombat();
    const flushed = engine._flushEvents();
    const result = flushed.find(e => e.eventType === 'combatResult');
    assert.strictEqual(result.winnerId, null, 'draw should have null winner');
  });
});

// ── Simultaneous Damage ──

describe('Fleet Combat — Simultaneous Damage', () => {
  it('ship at 1 HP still deals damage before dying', () => {
    const engine = createEngine();
    // p1: 1 HP, 3 attack. p2: 10 HP, 3 attack.
    // Simultaneous: p1 hits p2 for 3 before dying. p2 should end at 7 HP.
    spawnCorvette(engine, 'p1', 0, { hp: 1, attack: 3 });
    spawnCorvette(engine, 'p2', 0, { hp: 10, attack: 3 });

    engine._checkFleetCombat();

    const p2Ship = engine._militaryShips.find(s => s.ownerId === 'p2');
    assert.ok(p2Ship, 'p2 ship should survive');
    assert.strictEqual(p2Ship.hp, 7, 'p2 should have taken 3 damage from dying p1 ship');
    assert.strictEqual(engine._militaryShips.filter(s => s.ownerId === 'p1').length, 0, 'p1 ship destroyed');
  });

  it('both ships at low HP should both die simultaneously', () => {
    const engine = createEngine();
    spawnCorvette(engine, 'p1', 0, { hp: 2, attack: 5 });
    spawnCorvette(engine, 'p2', 0, { hp: 2, attack: 5 });

    engine._checkFleetCombat();

    assert.strictEqual(engine._militaryShips.length, 0, 'both ships should die');
  });
});

// ── Multiple Combats in Same Tick ──

describe('Fleet Combat — Multiple Systems', () => {
  it('resolves combat independently in different systems', () => {
    const engine = createEngine();
    // Combat in system 0: p1 wins (2v1)
    spawnCorvette(engine, 'p1', 0);
    spawnCorvette(engine, 'p1', 0);
    spawnCorvette(engine, 'p2', 0);

    // Combat in system 1: p2 wins (2v1)
    spawnCorvette(engine, 'p2', 1);
    spawnCorvette(engine, 'p2', 1);
    spawnCorvette(engine, 'p1', 1);

    engine._checkFleetCombat();

    // Both should have won one battle
    assert.strictEqual(engine._battlesWon.get('p1'), 1, 'p1 won battle in system 0');
    assert.strictEqual(engine._battlesWon.get('p2'), 1, 'p2 won battle in system 1');
  });

  it('ships lost accumulate across multiple battles', () => {
    const engine = createEngine();
    // System 0: p1 2v1 p2 — p2 loses 1
    spawnCorvette(engine, 'p1', 0);
    spawnCorvette(engine, 'p1', 0);
    spawnCorvette(engine, 'p2', 0);

    // System 1: p2 2v1 p1 — p1 loses 1
    spawnCorvette(engine, 'p2', 1);
    spawnCorvette(engine, 'p2', 1);
    spawnCorvette(engine, 'p1', 1);

    engine._checkFleetCombat();

    // Both lost at least 1 ship
    assert.ok((engine._shipsLost.get('p1') || 0) >= 1, 'p1 lost ships');
    assert.ok((engine._shipsLost.get('p2') || 0) >= 1, 'p2 lost ships');
  });
});

// ── Non-Combatant Event Broadcast ──

describe('Fleet Combat — Event Broadcast', () => {
  it('non-combatant players receive combatStarted events', () => {
    const engine = createEngine3P();
    const events = [];
    engine.onEvent = (evts) => { events.push(...evts); };

    spawnCorvette(engine, 'p1', 0);
    spawnCorvette(engine, 'p2', 0);

    engine._checkFleetCombat();
    const flushed = engine._flushEvents();

    // p3 should receive combatStarted even though not fighting
    const p3Started = flushed.filter(e => e.eventType === 'combatStarted' && e.playerId === 'p3');
    assert.ok(p3Started.length > 0, 'p3 should receive combatStarted as observer');
  });

  it('non-combatant players receive combatResult events', () => {
    const engine = createEngine3P();
    const events = [];
    engine.onEvent = (evts) => { events.push(...evts); };

    spawnCorvette(engine, 'p1', 0);
    spawnCorvette(engine, 'p1', 0);
    spawnCorvette(engine, 'p2', 0);

    engine._checkFleetCombat();
    const flushed = engine._flushEvents();

    const p3Result = flushed.filter(e => e.eventType === 'combatResult' && e.playerId === 'p3');
    assert.ok(p3Result.length > 0, 'p3 should receive combatResult as observer');
  });
});

// ── retreatFleet Input Validation ──

describe('Fleet Retreat — Input Validation', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('should reject retreat with missing shipId', () => {
    const result = engine.handleCommand('p1', { type: 'retreatFleet' });
    assert.ok(result.error, 'should return error');
    assert.ok(result.error.includes('Missing'), 'error should mention missing shipId');
  });

  it('should reject retreat with nonexistent shipId', () => {
    const result = engine.handleCommand('p1', { type: 'retreatFleet', shipId: 'fake_id' });
    assert.ok(result.error, 'should return error');
  });

  it('should reject retreat with null shipId', () => {
    const result = engine.handleCommand('p1', { type: 'retreatFleet', shipId: null });
    assert.ok(result.error, 'should return error for null shipId');
  });
});

// ── retreatFleet Event Emission ──

describe('Fleet Retreat — Event on Destruction', () => {
  it('emits combatResult event when ship is destroyed during retreat', () => {
    const engine = createEngine();
    const events = [];
    engine.onEvent = (evts) => { events.push(...evts); };

    const ship = spawnCorvette(engine, 'p1', 0, { hp: 1 });
    spawnCorvette(engine, 'p2', 0);

    engine.handleCommand('p1', { type: 'retreatFleet', shipId: ship.id });
    const flushed = engine._flushEvents();

    const retreatResult = flushed.find(e => e.eventType === 'combatResult' && e.retreatFailed);
    assert.ok(retreatResult, 'should emit combatResult with retreatFailed=true');
    assert.strictEqual(retreatResult.shipId, ship.id);
  });

  it('does not emit combatResult when retreat succeeds', () => {
    const engine = createEngine();
    const events = [];
    engine.onEvent = (evts) => { events.push(...evts); };

    const ship = spawnCorvette(engine, 'p1', 0, { hp: 100 });
    spawnCorvette(engine, 'p2', 0);

    engine.handleCommand('p1', { type: 'retreatFleet', shipId: ship.id });
    const flushed = engine._flushEvents() || [];

    const retreatResult = flushed.find(e => e.eventType === 'combatResult' && e.retreatFailed);
    assert.strictEqual(retreatResult, undefined, 'no combatResult for successful retreat');
  });
});

// ── Index Integrity ──

describe('Military Ship Index Integrity', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('_addMilitaryShip updates all 3 indices', () => {
    const ship = spawnCorvette(engine, 'p1', 5);

    assert.ok(engine._militaryShips.includes(ship), 'in main array');
    assert.strictEqual(engine._militaryShipsById.get(ship.id), ship, 'in byId map');
    const playerArr = engine._militaryShipsByPlayer.get('p1');
    assert.ok(playerArr && playerArr.includes(ship), 'in byPlayer map');
    const sysArr = engine._militaryShipsBySystem.get(5);
    assert.ok(sysArr && sysArr.includes(ship), 'in bySystem map');
  });

  it('_removeMilitaryShip cleans all 3 indices', () => {
    const ship = spawnCorvette(engine, 'p1', 5);
    engine._removeMilitaryShip(ship);

    assert.strictEqual(engine._militaryShips.includes(ship), false, 'removed from main array');
    assert.strictEqual(engine._militaryShipsById.has(ship.id), false, 'removed from byId map');
    const playerArr = engine._militaryShipsByPlayer.get('p1') || [];
    assert.strictEqual(playerArr.includes(ship), false, 'removed from byPlayer map');
    const sysArr = engine._militaryShipsBySystem.get(5) || [];
    assert.strictEqual(sysArr.includes(ship), false, 'removed from bySystem map');
  });

  it('multiple ships in same system maintain correct index', () => {
    const s1 = spawnCorvette(engine, 'p1', 3);
    const s2 = spawnCorvette(engine, 'p1', 3);
    const s3 = spawnCorvette(engine, 'p2', 3);

    const sysArr = engine._militaryShipsBySystem.get(3);
    assert.strictEqual(sysArr.length, 3);

    engine._removeMilitaryShip(s2);

    const sysArrAfter = engine._militaryShipsBySystem.get(3);
    assert.strictEqual(sysArrAfter.length, 2);
    assert.ok(sysArrAfter.includes(s1));
    assert.ok(sysArrAfter.includes(s3));
    assert.strictEqual(sysArrAfter.includes(s2), false);
  });

  it('_removeMilitaryShip invalidates VP cache', () => {
    const ship = spawnCorvette(engine, 'p1', 0);
    engine._vpCacheTick = 999; // pretend it's cached
    engine._removeMilitaryShip(ship);
    assert.strictEqual(engine._vpCacheTick, -1, 'VP cache should be invalidated');
  });
});

// ── JSON Serialization (broadcast payload) ──

describe('Fleet Combat — JSON Broadcast Payload', () => {
  it('getPlayerStateJSON includes battlesWon and shipsLost in parsed output', () => {
    const engine = createEngine();
    engine._battlesWon.set('p1', 2);
    engine._shipsLost.set('p1', 1);
    engine._invalidateStateCache(); // ensure fresh

    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);

    const me = parsed.players.find(p => p.id === 'p1');
    assert.strictEqual(me.battlesWon, 2, 'battlesWon in JSON payload');
    assert.strictEqual(me.shipsLost, 1, 'shipsLost in JSON payload');
  });

  it('getPlayerStateJSON reflects combat VP in total vp', () => {
    const engine = createEngine();
    engine._battlesWon.set('p1', 1);
    engine._shipsLost.set('p1', 2);
    engine._invalidateStateCache();

    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    const me = parsed.players.find(p => p.id === 'p1');

    // Verify the internal breakdown matches what the JSON reports
    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(me.vp, breakdown.vp, 'JSON VP should match breakdown VP');
    assert.strictEqual(breakdown.battlesWonVP, FLEET_BATTLE_WON_VP, 'battlesWonVP in breakdown');
    assert.strictEqual(breakdown.shipsLostVP, 2 * FLEET_SHIP_LOST_VP, 'shipsLostVP in breakdown');
  });

  it('combat stats visible for other players in JSON payload', () => {
    const engine = createEngine();
    engine._battlesWon.set('p2', 3);
    engine._shipsLost.set('p2', 1);
    engine._invalidateStateCache();

    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);

    const other = parsed.players.find(p => p.id === 'p2');
    assert.strictEqual(other.battlesWon, 3);
    assert.strictEqual(other.shipsLost, 1);
  });
});

// ── System Control Edge Cases ──

describe('System Control — Edge Cases', () => {
  it('in-transit enemy ships do not block colonization', () => {
    const engine = createEngine();
    // Find an uncolonized habitable system
    let targetSystem = null;
    for (let i = 0; i < engine.galaxy.systems.length; i++) {
      const sys = engine.galaxy.systems[i];
      const hasColony = [...engine.colonies.values()].some(c => c.systemId === i);
      if (hasColony) continue;
      const hasPlanet = sys.planets && sys.planets.some(p => p.habitable && !p.colonized);
      if (hasPlanet) { targetSystem = i; break; }
    }
    if (targetSystem == null) return;

    // Place enemy corvette in transit (has path)
    const enemyShip = spawnCorvette(engine, 'p2', targetSystem);
    enemyShip.path = [targetSystem + 1];
    enemyShip.targetSystemId = targetSystem + 1;

    // Colony ship arrives
    const colonyShip = {
      id: 'cs_transit', ownerId: 'p1', systemId: targetSystem,
      targetSystemId: targetSystem, path: [], hopProgress: 0,
    };
    engine._colonyShips.push(colonyShip);

    const state = engine.playerStates.get('p1');
    state.resources.minerals = 10000;
    state.resources.alloys = 10000;
    state.resources.energy = 10000;
    state.resources.food = 10000;

    engine._foundColonyFromShip(colonyShip);

    const hasNewColony = [...engine.colonies.values()].some(
      c => c.systemId === targetSystem && c.ownerId === 'p1'
    );
    assert.strictEqual(hasNewColony, true, 'in-transit enemies should not block colonization');
  });
});

// ── VP Cache Invalidation ──

describe('Fleet Combat — VP Cache', () => {
  it('combat invalidates VP cache', () => {
    const engine = createEngine();
    engine._vpCacheTick = 100; // pretend cached
    spawnCorvette(engine, 'p1', 0);
    spawnCorvette(engine, 'p2', 0);

    engine._checkFleetCombat();

    assert.strictEqual(engine._vpCacheTick, -1, 'VP cache should be invalidated after combat');
  });

  it('retreat that destroys ship invalidates VP cache', () => {
    const engine = createEngine();
    engine._vpCacheTick = 100;
    const ship = spawnCorvette(engine, 'p1', 0, { hp: 1 });
    spawnCorvette(engine, 'p2', 0);

    engine.handleCommand('p1', { type: 'retreatFleet', shipId: ship.id });

    assert.strictEqual(engine._vpCacheTick, -1, 'VP cache invalidated after retreat death');
  });
});

// ── Dirty Players ──

describe('Fleet Combat — Dirty Player Tracking', () => {
  it('marks all combatants as dirty after combat', () => {
    const engine = createEngine();
    engine._dirtyPlayers.clear();
    spawnCorvette(engine, 'p1', 0);
    spawnCorvette(engine, 'p2', 0);

    engine._checkFleetCombat();

    assert.ok(engine._dirtyPlayers.has('p1'), 'p1 should be dirty');
    assert.ok(engine._dirtyPlayers.has('p2'), 'p2 should be dirty');
  });
});

// ── Combat with varying fleet compositions ──

describe('Fleet Combat — Large Battles', () => {
  it('3v1 overwhelm — defender destroyed quickly', () => {
    const engine = createEngine();
    spawnCorvette(engine, 'p1', 0);
    spawnCorvette(engine, 'p1', 0);
    spawnCorvette(engine, 'p1', 0);
    spawnCorvette(engine, 'p2', 0);

    engine._checkFleetCombat();

    // 3x3=9 attack vs 10HP, 1x3=3 attack vs 10HP
    // Round 1: p2 takes 9 → 1 HP, one p1 ship takes 3 → 7HP
    // Round 2: p2 takes 9 → dead. p1 loses nobody else.
    assert.strictEqual(engine._militaryShips.filter(s => s.ownerId === 'p2').length, 0);
    assert.strictEqual(engine._militaryShips.filter(s => s.ownerId === 'p1').length, 3);
    assert.strictEqual(engine._battlesWon.get('p1'), 1);
  });

  it('focus fire kills weakest ship first in multi-ship battle', () => {
    const engine = createEngine();
    // p1: 2 corvettes
    // p2: 1 corvette with 3 HP, 1 corvette with 20 HP
    spawnCorvette(engine, 'p1', 0);
    spawnCorvette(engine, 'p1', 0);
    const weakShip = spawnCorvette(engine, 'p2', 0, { hp: 3 });
    const strongShip = spawnCorvette(engine, 'p2', 0, { hp: 20 });

    engine._checkFleetCombat();

    // weakShip (3HP) should die first since focus fire targets lowest HP
    assert.strictEqual(engine._militaryShipsById.has(weakShip.id), false, 'weak ship destroyed first');
  });
});
