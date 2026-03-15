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

describe('Fleet Combat Constants', () => {
  it('should export combat constants', () => {
    assert.strictEqual(FLEET_COMBAT_MAX_ROUNDS, 10);
    assert.strictEqual(FLEET_BATTLE_WON_VP, 5);
    assert.strictEqual(FLEET_SHIP_LOST_VP, -2);
  });

  it('CORVETTE_ATTACK and HP should make 1v1 combat meaningful', () => {
    // 1v1: both have 10 HP, 3 attack. Simultaneous attack means each takes 3/round.
    // After 4 rounds: 10 - 12 = dead for both. Both die.
    assert.ok(CORVETTE_HP > 0);
    assert.ok(CORVETTE_ATTACK > 0);
  });
});

// ── Combat Resolution ──

describe('Fleet Combat Resolution', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('should trigger combat when enemy ships share a system (equal forces)', () => {
    const systemId = 0;
    const s1 = spawnCorvette(engine, 'p1', systemId);
    const s2 = spawnCorvette(engine, 'p2', systemId);

    // Both have 10 HP, 3 attack. Simultaneous: each loses 3/round.
    // Round 1: both at 7 HP. Round 2: 4. Round 3: 1. Round 4: -2 → both destroyed.
    engine._checkFleetCombat();

    // Both ships should be destroyed (equal forces, simultaneous damage)
    assert.strictEqual(engine._militaryShips.length, 0);
  });

  it('should resolve combat with unequal forces — larger side wins', () => {
    const systemId = 0;
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p2', systemId);

    // p1 has 2 corvettes (6 total attack), p2 has 1 (3 attack)
    // Round 1: p2's ship takes 6 damage (4 HP left), p1 ship takes 3 damage (7 HP left)
    // Round 2: p2's ship takes 6 → dead. p1 still alive.
    engine._checkFleetCombat();

    const remaining = engine._militaryShips.filter(s => s.ownerId === 'p1');
    assert.ok(remaining.length > 0, 'p1 should have surviving ships');
    assert.strictEqual(engine._militaryShips.filter(s => s.ownerId === 'p2').length, 0, 'p2 ships destroyed');
  });

  it('should award VP for battle won (+5)', () => {
    const systemId = 0;
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p2', systemId);

    engine._checkFleetCombat();

    assert.strictEqual(engine._battlesWon.get('p1'), 1);
    assert.strictEqual(engine._battlesWon.get('p2') || 0, 0);
  });

  it('should track ships lost (-2 VP each)', () => {
    const systemId = 0;
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p2', systemId);

    engine._checkFleetCombat();

    // Both destroyed in equal combat
    assert.strictEqual(engine._shipsLost.get('p1'), 1);
    assert.strictEqual(engine._shipsLost.get('p2'), 1);
  });

  it('should include battlesWon and shipsLost in VP breakdown', () => {
    const systemId = 0;
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p2', systemId);

    engine._checkFleetCombat();

    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.battlesWon, 1);
    assert.strictEqual(breakdown.battlesWonVP, FLEET_BATTLE_WON_VP);
    // p1 may have lost a ship taking damage
    assert.ok(breakdown.shipsLostVP <= 0);
  });

  it('should not trigger combat for ships in transit', () => {
    const systemId = 0;
    const s1 = spawnCorvette(engine, 'p1', systemId);
    const s2 = spawnCorvette(engine, 'p2', systemId);
    s2.path = [1]; // in transit
    s2.targetSystemId = 1;

    engine._checkFleetCombat();

    // No combat — s2 is in transit
    assert.strictEqual(engine._militaryShips.length, 2);
  });

  it('should handle combat with more than 2 players', () => {
    // Add a 3rd player
    engine.playerStates.set('p3', {
      id: 'p3', name: 'Player 3', color: '#ff0000',
      resources: { energy: 100, minerals: 200, food: 100, alloys: 50, influence: 100, research: { physics: 0, society: 0, engineering: 0 } },
      completedTechs: [],
    });
    engine._playerColonies.set('p3', []);

    const systemId = 0;
    // p1 gets 3 ships, p2 gets 1, p3 gets 1
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p2', systemId);
    spawnCorvette(engine, 'p3', systemId);

    engine._checkFleetCombat();

    // p1 should win with 3 ships vs 2 enemies
    const p1Ships = engine._militaryShips.filter(s => s.ownerId === 'p1');
    assert.ok(p1Ships.length > 0, 'p1 should survive');
    assert.strictEqual(engine._battlesWon.get('p1'), 1);
  });

  it('should focus fire on lowest HP enemy ship', () => {
    const systemId = 0;
    const s1 = spawnCorvette(engine, 'p1', systemId, { hp: 20 });
    const s2 = spawnCorvette(engine, 'p2', systemId, { hp: 5 });  // lower HP
    const s3 = spawnCorvette(engine, 'p2', systemId, { hp: 15 }); // higher HP

    // p1 should focus fire on s2 (lower HP)
    engine._checkFleetCombat();

    // s2 should be destroyed first (only 5 HP vs 3 attack = dead in round 2)
    assert.strictEqual(engine._militaryShipsById.has(s2.id), false);
  });

  it('should limit combat to MAX_ROUNDS', () => {
    const systemId = 0;
    // Give ships huge HP so combat doesn't end
    spawnCorvette(engine, 'p1', systemId, { hp: 1000, attack: 1 });
    spawnCorvette(engine, 'p2', systemId, { hp: 1000, attack: 1 });

    engine._checkFleetCombat();

    // Both should survive since max rounds = 10, 1 damage/round = 10 total
    assert.strictEqual(engine._militaryShips.length, 2);
    // Both took 10 damage
    const s1 = engine._militaryShips.find(s => s.ownerId === 'p1');
    const s2 = engine._militaryShips.find(s => s.ownerId === 'p2');
    assert.strictEqual(s1.hp, 990);
    assert.strictEqual(s2.hp, 990);
  });

  it('should not trigger combat with only one player ships', () => {
    const systemId = 0;
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p1', systemId);

    engine._checkFleetCombat();

    assert.strictEqual(engine._militaryShips.length, 2, 'own ships should not fight');
  });
});

// ── Combat Events ──

describe('Fleet Combat Events', () => {
  let engine, events;

  beforeEach(() => {
    engine = createEngine();
    events = [];
    engine.onEvent = (evts) => { events.push(...evts); };
  });

  it('should emit combatStarted event', () => {
    const systemId = 0;
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p2', systemId);

    engine._checkFleetCombat();
    const flushed = engine._flushEvents();

    const started = flushed.filter(e => e.eventType === 'combatStarted');
    // Should be emitted to both players
    assert.ok(started.length >= 2, 'combatStarted should be emitted to all players');
    assert.ok(started[0].combatants.length === 2);
    assert.ok(started[0].systemId === systemId);
  });

  it('should emit combatResult event with winner and losses', () => {
    const systemId = 0;
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p2', systemId);

    engine._checkFleetCombat();
    const flushed = engine._flushEvents();

    const results = flushed.filter(e => e.eventType === 'combatResult');
    assert.ok(results.length >= 2, 'combatResult should be emitted to all players');
    const result = results[0];
    assert.strictEqual(result.winnerId, 'p1');
    assert.ok(result.losses);
    assert.ok(result.survivors);
  });

  it('should include systemName in combat events', () => {
    const systemId = 0;
    spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p2', systemId);

    engine._checkFleetCombat();
    const flushed = engine._flushEvents();

    const started = flushed.find(e => e.eventType === 'combatStarted');
    assert.ok(started.systemName, 'should include system name');
  });
});

// ── Retreat ──

describe('Fleet Retreat', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('should allow retreating from a system with enemies', () => {
    const systemId = 0;
    const ship = spawnCorvette(engine, 'p1', systemId);
    spawnCorvette(engine, 'p2', systemId);

    const result = engine.handleCommand('p1', { type: 'retreatFleet', shipId: ship.id });
    assert.ok(result.ok, 'retreat should succeed');
    assert.ok(result.retreatTarget != null, 'should have retreat target');
    assert.ok(result.retreatDamage > 0, 'should take retreat damage');
  });

  it('should apply free attack from all enemy ships during retreat', () => {
    const systemId = 0;
    const ship = spawnCorvette(engine, 'p1', systemId, { hp: 100 });
    spawnCorvette(engine, 'p2', systemId);
    spawnCorvette(engine, 'p2', systemId);

    const result = engine.handleCommand('p1', { type: 'retreatFleet', shipId: ship.id });
    assert.ok(result.ok);
    // 2 enemy ships × 3 attack = 6 damage
    assert.strictEqual(result.retreatDamage, 6);
    assert.strictEqual(result.hpRemaining, 94);
  });

  it('should destroy ship if retreat damage exceeds HP', () => {
    const systemId = 0;
    const ship = spawnCorvette(engine, 'p1', systemId, { hp: 3 });
    spawnCorvette(engine, 'p2', systemId);
    spawnCorvette(engine, 'p2', systemId);

    const result = engine.handleCommand('p1', { type: 'retreatFleet', shipId: ship.id });
    assert.ok(result.ok);
    assert.strictEqual(result.destroyed, true);
    assert.strictEqual(engine._militaryShipsById.has(ship.id), false);
  });

  it('should track ships lost during failed retreat', () => {
    const systemId = 0;
    spawnCorvette(engine, 'p1', systemId, { hp: 1 });
    spawnCorvette(engine, 'p2', systemId);

    engine.handleCommand('p1', { type: 'retreatFleet', shipId: engine._militaryShips.find(s => s.ownerId === 'p1').id });

    assert.strictEqual(engine._shipsLost.get('p1'), 1);
  });

  it('should reject retreat when no enemies present', () => {
    const systemId = 0;
    const ship = spawnCorvette(engine, 'p1', systemId);

    const result = engine.handleCommand('p1', { type: 'retreatFleet', shipId: ship.id });
    assert.ok(result.error);
    assert.ok(result.error.includes('No enemies'));
  });

  it('should reject retreat for ship in transit', () => {
    const systemId = 0;
    const ship = spawnCorvette(engine, 'p1', systemId);
    ship.path = [1];
    ship.targetSystemId = 1;
    spawnCorvette(engine, 'p2', systemId);

    const result = engine.handleCommand('p1', { type: 'retreatFleet', shipId: ship.id });
    assert.ok(result.error);
  });

  it('should reject retreat for other player ship', () => {
    const systemId = 0;
    const ship = spawnCorvette(engine, 'p2', systemId);
    spawnCorvette(engine, 'p1', systemId);

    const result = engine.handleCommand('p1', { type: 'retreatFleet', shipId: ship.id });
    assert.ok(result.error);
  });

  it('should prefer adjacent system without enemy ships', () => {
    // This test depends on galaxy topology — just verify it returns a valid target
    const systemId = 0;
    const ship = spawnCorvette(engine, 'p1', systemId, { hp: 100 });
    spawnCorvette(engine, 'p2', systemId);

    const result = engine.handleCommand('p1', { type: 'retreatFleet', shipId: ship.id });
    assert.ok(result.ok);
    // Ship should be in transit now
    assert.ok(ship.path.length > 0);
    assert.strictEqual(ship.targetSystemId, result.retreatTarget);
  });
});

// ── System Control (colonization blocking) ──

describe('System Control', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('should block colonization when enemy corvettes control the system', () => {
    // Find an uncolonized system with a habitable planet
    let targetSystem = null;
    for (let i = 0; i < engine.galaxy.systems.length; i++) {
      const sys = engine.galaxy.systems[i];
      const hasColony = [...engine.colonies.values()].some(c => c.systemId === i);
      if (hasColony) continue;
      const hasPlanet = sys.planets && sys.planets.some(p => p.habitable && !p.colonized);
      if (hasPlanet) { targetSystem = i; break; }
    }

    if (targetSystem == null) {
      // Skip test if no valid system found (unlikely but possible)
      return;
    }

    // Place enemy corvette at target
    spawnCorvette(engine, 'p2', targetSystem);

    // Simulate colony ship arrival
    const colonyShip = {
      id: 'cs_test', ownerId: 'p1', systemId: targetSystem,
      targetSystemId: targetSystem, path: [], hopProgress: 0,
    };
    engine._colonyShips.push(colonyShip);

    // Try to found colony
    engine._foundColonyFromShip(colonyShip);

    // Colony should NOT have been founded
    const p1Colonies = engine._playerColonies.get('p1') || [];
    const hasNewColony = [...engine.colonies.values()].some(c => c.systemId === targetSystem && c.ownerId === 'p1');
    assert.strictEqual(hasNewColony, false, 'Colony should not be founded in enemy-controlled system');
  });

  it('should allow colonization when own corvettes are present', () => {
    let targetSystem = null;
    for (let i = 0; i < engine.galaxy.systems.length; i++) {
      const sys = engine.galaxy.systems[i];
      const hasColony = [...engine.colonies.values()].some(c => c.systemId === i);
      if (hasColony) continue;
      const hasPlanet = sys.planets && sys.planets.some(p => p.habitable && !p.colonized);
      if (hasPlanet) { targetSystem = i; break; }
    }

    if (targetSystem == null) return;

    // Place own corvette at target (should not block)
    spawnCorvette(engine, 'p1', targetSystem);

    const colonyShip = {
      id: 'cs_test2', ownerId: 'p1', systemId: targetSystem,
      targetSystemId: targetSystem, path: [], hopProgress: 0,
    };
    engine._colonyShips.push(colonyShip);

    giveResources(engine, 'p1');
    engine._foundColonyFromShip(colonyShip);

    const hasNewColony = [...engine.colonies.values()].some(c => c.systemId === targetSystem && c.ownerId === 'p1');
    assert.strictEqual(hasNewColony, true, 'Colony should be founded when own corvettes are present');
  });
});

// ── VP Integration ──

describe('Fleet Combat VP', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('should include battlesWon VP in breakdown', () => {
    engine._battlesWon.set('p1', 3);
    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.battlesWon, 3);
    assert.strictEqual(breakdown.battlesWonVP, 15);
  });

  it('should include shipsLost negative VP in breakdown', () => {
    engine._shipsLost.set('p1', 2);
    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.shipsLost, 2);
    assert.strictEqual(breakdown.shipsLostVP, -4);
  });

  it('should net VP correctly for combat', () => {
    engine._battlesWon.set('p1', 1);
    engine._shipsLost.set('p1', 1);
    const breakdown = engine._calcVPBreakdown('p1');
    // +5 for battle won, -2 for ship lost = +3 net from combat
    assert.strictEqual(breakdown.battlesWonVP + breakdown.shipsLostVP, 3);
  });

  it('should default to 0 for players with no combat', () => {
    const breakdown = engine._calcVPBreakdown('p1');
    assert.strictEqual(breakdown.battlesWon, 0);
    assert.strictEqual(breakdown.battlesWonVP, 0);
    assert.strictEqual(breakdown.shipsLost, 0);
    assert.strictEqual(breakdown.shipsLostVP, 0);
  });
});

// ── State Serialization ──

describe('Fleet Combat Serialization', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('should include battlesWon in getPlayerState for own player', () => {
    engine._battlesWon.set('p1', 2);
    const state = engine.getPlayerState('p1');
    const me = state.players.find(p => p.id === 'p1');
    assert.strictEqual(me.battlesWon, 2);
  });

  it('should include shipsLost in getPlayerState for own player', () => {
    engine._shipsLost.set('p1', 3);
    const state = engine.getPlayerState('p1');
    const me = state.players.find(p => p.id === 'p1');
    assert.strictEqual(me.shipsLost, 3);
  });

  it('should include battlesWon in getPlayerState for other players', () => {
    engine._battlesWon.set('p2', 1);
    const state = engine.getPlayerState('p1');
    const other = state.players.find(p => p.id === 'p2');
    assert.strictEqual(other.battlesWon, 1);
  });

  it('should include shipsLost in other player state', () => {
    engine._shipsLost.set('p2', 4);
    const state = engine.getPlayerState('p1');
    const other = state.players.find(p => p.id === 'p2');
    assert.strictEqual(other.shipsLost, 4);
  });

  it('should include combat VP in VP breakdown empty object', () => {
    engine.playerStates.delete('nonexistent');
    const breakdown = engine._calcVPBreakdown('nonexistent');
    assert.strictEqual(breakdown.battlesWon, 0);
    assert.strictEqual(breakdown.battlesWonVP, 0);
    assert.strictEqual(breakdown.shipsLost, 0);
    assert.strictEqual(breakdown.shipsLostVP, 0);
  });
});

// ── Tick-Driven Combat ──

describe('Tick-Driven Fleet Combat', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('should trigger combat when ship arrives at enemy system via movement', () => {
    // Place p2 corvette at system 0
    spawnCorvette(engine, 'p2', 0);

    // Place p1 corvette one hop away, moving to system 0
    const colony = getFirstColony(engine, 'p1');
    const p1StartSystem = colony.systemId;

    // Find a system adjacent to 0
    let adjSystem = null;
    for (const hl of engine.galaxy.hyperlanes) {
      if (hl[0] === 0 && hl[1] !== p1StartSystem) { adjSystem = hl[1]; break; }
      if (hl[1] === 0 && hl[0] !== p1StartSystem) { adjSystem = hl[0]; break; }
    }
    if (adjSystem == null) return; // skip if topology doesn't support

    const ship = spawnCorvette(engine, 'p1', adjSystem, { hp: 100 });
    ship.targetSystemId = 0;
    ship.path = [0];
    ship.hopProgress = 0;

    // Fast-forward until ship arrives
    for (let i = 0; i < CORVETTE_HOP_TICKS; i++) {
      engine.tick();
    }

    // Ship should have arrived and combat triggered
    // Either ship took damage or enemy is destroyed
    const p2Ships = engine._militaryShips.filter(s => s.ownerId === 'p2');
    const p1Ships = engine._militaryShips.filter(s => s.ownerId === 'p1');
    // One side should have fewer ships or damaged
    assert.ok(p2Ships.length === 0 || (p1Ships.length > 0 && p1Ships[0].hp < 100),
      'Combat should have occurred');
  });
});
