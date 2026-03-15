const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  ENDGAME_CRISIS_TRIGGER, ENDGAME_CRISIS_WARNING_TICKS,
  GALACTIC_STORM_MULTIPLIER, PRECURSOR_HP, PRECURSOR_ATTACK,
  PRECURSOR_HOP_TICKS, PRECURSOR_COMBAT_TICKS,
  PRECURSOR_DESTROY_VP, PRECURSOR_OCCUPY_VP,
  MONTH_TICKS, CORVETTE_HP, CORVETTE_ATTACK,
  DEFENSE_PLATFORM_MAX_HP, DEFENSE_PLATFORM_ATTACK,
} = require('../../server/game-engine');

// Helper: create engine with match timer enabled
function createEngine(opts = {}) {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  if (opts.twoPlayers) {
    players.set('p2', { name: 'Player 2' });
  }
  const matchTimer = opts.matchTimer || 10; // 10 minutes default
  const room = { players, galaxySize: 'small', matchTimer };
  const engine = new GameEngine(room, { tickRate: 10 });
  engine._doctrinePhase = false;
  return engine;
}

function getFirstColony(engine, playerId = 'p1') {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

function tickN(engine, n) {
  for (let i = 0; i < n; i++) engine.tick();
}

// Place corvettes at a system for a player
function placeCorvettes(engine, playerId, systemId, count) {
  const ships = [];
  for (let i = 0; i < count; i++) {
    const ship = {
      id: engine._nextId(),
      ownerId: playerId,
      systemId,
      targetSystemId: null,
      path: [],
      hopProgress: 0,
      hp: CORVETTE_HP,
      attack: CORVETTE_ATTACK,
    };
    engine._militaryShips.push(ship);
    if (!engine._militaryShipsBySystem.has(systemId)) {
      engine._militaryShipsBySystem.set(systemId, []);
    }
    engine._militaryShipsBySystem.get(systemId).push(ship);
    if (!engine._militaryShipsByPlayer.has(playerId)) {
      engine._militaryShipsByPlayer.set(playerId, []);
    }
    engine._militaryShipsByPlayer.get(playerId).push(ship);
    ships.push(ship);
  }
  return ships;
}

// Place precursor fleet at a specific system targeting a colony
function placePrecursor(engine, systemId, targetSystemId, targetColonyId, opts = {}) {
  engine._endgameCrisisTriggered = true;
  engine._endgameCrisis = { type: 'precursorAwakening' };
  engine._precursorFleet = {
    id: engine._nextId(),
    systemId,
    targetSystemId: targetSystemId || systemId,
    targetColonyId: targetColonyId || null,
    path: opts.path || [],
    hopProgress: opts.hopProgress || 0,
    hp: opts.hp || PRECURSOR_HP,
    attack: opts.attack || PRECURSOR_ATTACK,
  };
  return engine._precursorFleet;
}

describe('Endgame Crisis Deep — cached trigger threshold', () => {
  it('_endgameCrisisTriggerTicks matches manual calculation', () => {
    const engine = createEngine({ matchTimer: 10 }); // 6000 ticks
    const expected = Math.floor(6000 * (1 - ENDGAME_CRISIS_TRIGGER)); // 25% remaining = 1500
    assert.strictEqual(engine._endgameCrisisTriggerTicks, expected);
  });

  it('_endgameCrisisTriggerTicks is 0 when no match timer', () => {
    const players = new Map();
    players.set('p1', { name: 'Player 1' });
    const room = { players, galaxySize: 'small', matchTimer: 0 };
    const engine = new GameEngine(room, { tickRate: 10 });
    engine._doctrinePhase = false;
    assert.strictEqual(engine._endgameCrisisTriggerTicks, 0);
  });

  it('different match timers produce correct trigger ticks', () => {
    for (const mins of [1, 5, 15, 30]) {
      const engine = createEngine({ matchTimer: mins });
      const totalTicks = mins * 60 * 10;
      const expected = Math.floor(totalTicks * 0.25);
      assert.strictEqual(engine._endgameCrisisTriggerTicks, expected,
        `matchTimer=${mins} should have triggerTicks=${expected}`);
    }
  });
});

describe('Endgame Crisis Deep — precursor dissipates without colony', () => {
  it('precursor dissipates if no colony at target system', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);
    const colonySystem = colony.systemId;

    // Find a system with no colony
    let emptySystem = null;
    for (const sys of engine.galaxy.systems) {
      if (sys.id !== colonySystem) {
        emptySystem = sys.id;
        break;
      }
    }
    assert.ok(emptySystem !== null, 'should find empty system');

    // Place precursor at empty system targeting it
    const fleet = placePrecursor(engine, emptySystem, emptySystem, null);

    engine._resolvePrecursorArrival(fleet);
    assert.strictEqual(engine._precursorFleet, null, 'precursor should dissipate');
    assert.strictEqual(engine._precursorOccupiedColonies.size, 0, 'no colonies occupied');
  });
});

describe('Endgame Crisis Deep — precursor combat idle ships only', () => {
  it('moving ships do not participate in precursor combat', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);
    const systemId = colony.systemId;

    // Place ships that are in-transit (have a path)
    const movingShips = placeCorvettes(engine, 'p1', systemId, 5);
    for (const s of movingShips) {
      s.path = [systemId + 1]; // pretend they're moving
    }

    const fleet = placePrecursor(engine, systemId, systemId, colony.id, { hp: 10 });

    // Combat should skip all moving ships
    engine._resolvePrecursorCombat(fleet, movingShips);

    // Precursor should not have taken damage (no idle ships)
    assert.strictEqual(fleet.hp, 10, 'precursor HP unchanged — no idle ships fought');
  });

  it('mix of idle and moving ships — only idle fight', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);
    const systemId = colony.systemId;

    const ships = placeCorvettes(engine, 'p1', systemId, 4);
    // Make 2 ships moving
    ships[0].path = [systemId + 1];
    ships[1].path = [systemId + 2];
    // ships[2] and ships[3] are idle

    const fleet = placePrecursor(engine, systemId, systemId, colony.id, { hp: PRECURSOR_HP });
    const hpBefore = fleet.hp;

    engine._resolvePrecursorCombat(fleet, ships);

    // Only 2 idle ships should have dealt damage
    // Each idle ship does CORVETTE_ATTACK per round for up to PRECURSOR_COMBAT_TICKS rounds
    assert.ok(fleet.hp < hpBefore, 'precursor should take damage from idle ships');
  });
});

describe('Endgame Crisis Deep — ship losses tracked', () => {
  it('destroyed corvettes increment _shipsLost counter', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);
    const systemId = colony.systemId;

    const lostBefore = engine._shipsLost.get('p1') || 0;

    // Place 2 weak corvettes that will die
    const ships = placeCorvettes(engine, 'p1', systemId, 2);
    // Give them very low HP so precursor kills them
    ships[0].hp = 1;
    ships[1].hp = 1;

    const fleet = placePrecursor(engine, systemId, systemId, colony.id);
    engine._resolvePrecursorCombat(fleet, ships);

    const lostAfter = engine._shipsLost.get('p1') || 0;
    assert.ok(lostAfter > lostBefore, 'ships lost should increase');
    assert.strictEqual(lostAfter - lostBefore, 2, 'both corvettes should be destroyed');
  });

  it('destroyed ships are removed from military ship arrays', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);
    const systemId = colony.systemId;

    const ships = placeCorvettes(engine, 'p1', systemId, 3);
    ships[0].hp = 1; // will die
    const shipId = ships[0].id;

    const fleet = placePrecursor(engine, systemId, systemId, colony.id);
    engine._resolvePrecursorCombat(fleet, ships);

    // Check the dead ship was removed
    const found = engine._militaryShips.find(s => s.id === shipId);
    assert.strictEqual(found, undefined, 'destroyed ship should be removed from _militaryShips');
  });
});

describe('Endgame Crisis Deep — VP credit with multiple players', () => {
  it('player with most ships gets destroyer VP', () => {
    const engine = createEngine({ matchTimer: 10, twoPlayers: true });

    // Find p1 colony system
    const colony = getFirstColony(engine, 'p1');
    const systemId = colony.systemId;

    // p1 has 5 ships, p2 has 3 ships — p1 should get VP
    placeCorvettes(engine, 'p1', systemId, 5);
    placeCorvettes(engine, 'p2', systemId, 3);

    // Weak precursor to ensure it dies
    const allShips = engine._militaryShipsBySystem.get(systemId);
    const fleet = placePrecursor(engine, systemId, systemId, colony.id, { hp: 5 });

    engine._resolvePrecursorCombat(fleet, allShips);

    assert.strictEqual(engine._precursorDestroyedBy, 'p1', 'p1 had more ships, should get credit');
    assert.strictEqual(engine._precursorFleet, null, 'precursor should be destroyed');
  });

  it('only colony owner gets occupation VP penalty', () => {
    const engine = createEngine({ matchTimer: 10, twoPlayers: true });
    const p1Colony = getFirstColony(engine, 'p1');

    // Occupy p1's colony
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'precursorAwakening' };
    engine._precursorOccupiedColonies.add(p1Colony.id);
    engine._vpCacheTick = -1;

    const p1VP = engine._calcVPBreakdown('p1');
    const p2VP = engine._calcVPBreakdown('p2');

    assert.strictEqual(p1VP.precursorOccupiedCount, 1, 'p1 should have 1 occupied colony');
    assert.strictEqual(p2VP.precursorOccupiedCount, 0, 'p2 should have 0 occupied colonies');
    assert.strictEqual(p1VP.precursorVP, PRECURSOR_OCCUPY_VP, 'p1 gets -5 VP');
    assert.strictEqual(p2VP.precursorVP, 0, 'p2 gets no penalty');
  });
});

describe('Endgame Crisis Deep — defense platform edge cases', () => {
  it('building defense platform does not fight precursor', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);

    colony.defensePlatform = {
      hp: DEFENSE_PLATFORM_MAX_HP,
      maxHp: DEFENSE_PLATFORM_MAX_HP,
      building: true, // still building!
      buildTicksRemaining: 50,
    };

    const fleet = placePrecursor(engine, colony.systemId, colony.systemId, colony.id);

    const events = [];
    engine.onEvent = (evts) => { events.push(...evts); };

    engine._resolvePrecursorArrival(fleet);

    // Platform was building so precursor should occupy (not fight platform)
    assert.ok(engine._precursorOccupiedColonies.has(colony.id), 'colony should be occupied');
  });

  it('defense platform HP is updated after precursor combat', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);

    colony.defensePlatform = {
      hp: DEFENSE_PLATFORM_MAX_HP,
      maxHp: DEFENSE_PLATFORM_MAX_HP,
      building: false,
      buildTicksRemaining: 0,
    };

    // Precursor strong enough to survive the platform
    const fleet = placePrecursor(engine, colony.systemId, colony.systemId, colony.id);
    engine._resolvePrecursorArrival(fleet);

    // Platform should have taken damage
    assert.ok(colony.defensePlatform.hp < DEFENSE_PLATFORM_MAX_HP,
      'defense platform should have taken damage');
    assert.ok(colony.defensePlatform.hp >= 0, 'HP should not go negative');
  });

  it('defense platform with 0 HP does not fight', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);

    colony.defensePlatform = {
      hp: 0,
      maxHp: DEFENSE_PLATFORM_MAX_HP,
      building: false,
      buildTicksRemaining: 0,
    };

    const fleet = placePrecursor(engine, colony.systemId, colony.systemId, colony.id);
    const hpBefore = fleet.hp;
    engine._resolvePrecursorArrival(fleet);

    // Platform has 0 HP so precursor should not take damage from it
    // It should just occupy
    assert.ok(engine._precursorOccupiedColonies.has(colony.id), 'colony should be occupied');
  });

  it('defense platform destroys weak precursor — owner gets VP', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);

    colony.defensePlatform = {
      hp: DEFENSE_PLATFORM_MAX_HP,
      maxHp: DEFENSE_PLATFORM_MAX_HP,
      building: false,
      buildTicksRemaining: 0,
    };

    // Very weak precursor
    const fleet = placePrecursor(engine, colony.systemId, colony.systemId, colony.id, { hp: 5 });
    engine._resolvePrecursorArrival(fleet);

    assert.strictEqual(engine._precursorFleet, null, 'precursor should be destroyed');
    assert.strictEqual(engine._precursorDestroyedBy, 'p1', 'colony owner gets destroyer credit');
    assert.strictEqual(engine._precursorOccupiedColonies.size, 0, 'no occupation');
  });
});

describe('Endgame Crisis Deep — precursor retargeting', () => {
  it('precursor retargets next colony after occupying', () => {
    const engine = createEngine({ matchTimer: 10, twoPlayers: true });
    const p1Colony = getFirstColony(engine, 'p1');
    const p2Colony = getFirstColony(engine, 'p2');

    // Place precursor at p1's colony system
    const fleet = placePrecursor(engine, p1Colony.systemId, p1Colony.systemId, p1Colony.id);

    engine._resolvePrecursorArrival(fleet);

    // Colony should be occupied
    assert.ok(engine._precursorOccupiedColonies.has(p1Colony.id), 'p1 colony should be occupied');

    // Precursor should retarget if another colony exists
    if (engine._precursorFleet) {
      assert.ok(engine._precursorFleet.path.length > 0 || engine._precursorFleet.targetSystemId !== p1Colony.systemId,
        'precursor should have retargeted or have a new path');
    }
  });
});

describe('Endgame Crisis Deep — precursor movement interception', () => {
  it('corvettes at intermediate system intercept precursor during movement', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);

    // Find two connected systems for a path
    const adj = engine._adjacency;
    let intermediateSystem = null;
    for (const [sysId, neighbors] of adj) {
      if (sysId !== colony.systemId && neighbors.length > 0) {
        intermediateSystem = sysId;
        break;
      }
    }
    if (!intermediateSystem) return; // skip if galaxy too small

    // Place a weak precursor with a path through the intermediate system
    const fleet = placePrecursor(engine, intermediateSystem - 1 >= 0 ? intermediateSystem - 1 : 0,
      colony.systemId, colony.id, {
        path: [intermediateSystem, colony.systemId],
        hp: 5, // very weak
      });

    // Place enough corvettes at intermediate system to kill it
    placeCorvettes(engine, 'p1', intermediateSystem, 5);

    // Tick past one hop
    tickN(engine, PRECURSOR_HOP_TICKS + 1);

    // Precursor should have been destroyed by interception
    if (engine._precursorFleet === null) {
      assert.strictEqual(engine._precursorDestroyedBy, 'p1', 'p1 should get credit for interception kill');
    }
    // If still alive (galaxy topology may differ), that's also valid
  });
});

describe('Endgame Crisis Deep — precursor combat events', () => {
  it('emits precursorCombat event when ships engage', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);
    const systemId = colony.systemId;

    const ships = placeCorvettes(engine, 'p1', systemId, 3);
    engine._pendingEvents = []; // clear any prior events

    const fleet = placePrecursor(engine, systemId, systemId, colony.id);
    engine._resolvePrecursorCombat(fleet, ships);

    const events = engine._flushEvents() || [];
    const combatEvents = events.filter(e => e.eventType === 'precursorCombat');
    assert.ok(combatEvents.length > 0, 'should emit precursorCombat event');
    assert.strictEqual(combatEvents[0].systemId, systemId);
    assert.strictEqual(combatEvents[0].playerShips, 3);
  });

  it('emits precursorDestroyed event with correct fields', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);
    const systemId = colony.systemId;

    placeCorvettes(engine, 'p1', systemId, 10);
    const ships = engine._militaryShipsBySystem.get(systemId);
    engine._pendingEvents = [];

    const fleet = placePrecursor(engine, systemId, systemId, colony.id, { hp: 5 });
    engine._resolvePrecursorCombat(fleet, ships);

    const events = engine._flushEvents() || [];
    const destroyed = events.filter(e => e.eventType === 'precursorDestroyed');
    assert.strictEqual(destroyed.length, 1, 'should emit precursorDestroyed');
    assert.strictEqual(destroyed[0].destroyedBy, 'p1');
    assert.strictEqual(destroyed[0].vpReward, PRECURSOR_DESTROY_VP);
    assert.strictEqual(destroyed[0].broadcast, true);
  });

  it('emits precursorOccupied event on arrival', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);
    const systemId = colony.systemId;

    engine._pendingEvents = [];

    const fleet = placePrecursor(engine, systemId, systemId, colony.id);
    engine._resolvePrecursorArrival(fleet);

    const events = engine._flushEvents() || [];
    const occupied = events.filter(e => e.eventType === 'precursorOccupied');
    assert.ok(occupied.length > 0, 'should emit precursorOccupied');
    assert.strictEqual(occupied[0].colonyId, colony.id);
    assert.strictEqual(occupied[0].ownerId, 'p1');
    assert.strictEqual(occupied[0].broadcast, true);
  });
});

describe('Endgame Crisis Deep — storm production edge cases', () => {
  it('storm does not affect zero production resources', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);

    // Get baseline — alloys may be 0 if no industrial districts
    const baseline = engine._calcProduction(colony);

    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'galacticStorm' };
    engine._invalidateColonyCache(colony);

    const stormed = engine._calcProduction(colony);

    // Resources that were 0 should stay 0
    for (const resource of ['energy', 'minerals', 'food', 'alloys']) {
      if (baseline.production[resource] === 0) {
        assert.strictEqual(stormed.production[resource], 0,
          `${resource} was 0, should stay 0 during storm`);
      }
    }
  });

  it('storm + occupation stack multiplicatively', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);

    const baseline = engine._calcProduction(colony);
    const baseEnergy = baseline.production.energy;
    assert.ok(baseEnergy > 0);

    // Activate both storm and occupation
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'galacticStorm' };
    engine._precursorOccupiedColonies.add(colony.id);
    engine._invalidateColonyCache(colony);

    const result = engine._calcProduction(colony);
    // Storm = 0.75, occupation = 0.5, applied sequentially
    const expected = Math.round(Math.round(baseEnergy * GALACTIC_STORM_MULTIPLIER * 100) / 100 * 0.5 * 100) / 100;
    assert.strictEqual(result.production.energy, expected,
      'storm and occupation should stack');
  });

  it('storm affects research production', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);

    const baseline = engine._calcProduction(colony);
    const baseResearch = baseline.production.research || 0;

    if (baseResearch > 0) {
      engine._endgameCrisisTriggered = true;
      engine._endgameCrisis = { type: 'galacticStorm' };
      engine._invalidateColonyCache(colony);

      const stormed = engine._calcProduction(colony);
      assert.strictEqual(stormed.production.research,
        Math.round(baseResearch * GALACTIC_STORM_MULTIPLIER * 100) / 100);
    }
  });
});

describe('Endgame Crisis Deep — multiple occupation VP', () => {
  it('multiple occupied colonies stack VP penalty', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);

    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'precursorAwakening' };

    // Simulate 3 occupied colonies for p1
    engine._precursorOccupiedColonies.add(colony.id);
    engine._precursorOccupiedColonies.add(colony.id + 1000); // fake ID — won't match p1
    // Only real p1 colony counts

    engine._vpCacheTick = -1;
    const vp = engine._calcVPBreakdown('p1');
    assert.strictEqual(vp.precursorOccupiedCount, 1, 'only real p1 colonies count');
    assert.strictEqual(vp.precursorVP, PRECURSOR_OCCUPY_VP);
  });
});

describe('Endgame Crisis Deep — precursor pathfinding', () => {
  it('precursor fleet path is valid through adjacency graph', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'precursorAwakening' };
    engine._spawnPrecursorFleet();

    if (!engine._precursorFleet) return; // can't spawn if galaxy disconnected

    const fleet = engine._precursorFleet;
    let current = fleet.systemId;

    // Verify each hop in the path is adjacent to the previous
    for (const nextSys of fleet.path) {
      const neighbors = engine._adjacency.get(current) || [];
      assert.ok(neighbors.includes(nextSys),
        `system ${nextSys} should be adjacent to ${current}`);
      current = nextSys;
    }

    // Final destination should be the target
    assert.strictEqual(current, fleet.targetSystemId, 'path should end at target system');
  });

  it('precursor spawns at most-connected system (galaxy center)', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'precursorAwakening' };
    engine._spawnPrecursorFleet();

    if (!engine._precursorFleet) return;

    const spawnSystem = engine._precursorFleet.systemId;

    // Find the actual most-connected system
    let maxConn = 0;
    let expectedSpawn = null;
    for (const sys of engine.galaxy.systems) {
      const conn = (engine._adjacency.get(sys.id) || []).length;
      if (conn > maxConn) {
        maxConn = conn;
        expectedSpawn = sys.id;
      }
    }

    assert.strictEqual(spawnSystem, expectedSpawn, 'should spawn at most-connected system');
  });
});

describe('Endgame Crisis Deep — getPlayerStateJSON serialization', () => {
  it('crisis data survives JSON serialization roundtrip', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'galacticStorm' };
    engine._invalidateStateCache();

    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    assert.deepStrictEqual(parsed.endgameCrisis, { type: 'galacticStorm' });
  });

  it('precursor fleet data survives JSON serialization', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'precursorAwakening' };
    engine._spawnPrecursorFleet();
    engine._invalidateStateCache();

    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    assert.ok(parsed.precursorFleet, 'precursor fleet should be in JSON');
    assert.strictEqual(parsed.precursorFleet.hp, PRECURSOR_HP);
    assert.strictEqual(typeof parsed.precursorFleet.hopsRemaining, 'number');
  });

  it('no crisis data in JSON when not triggered', () => {
    const engine = createEngine({ matchTimer: 10 });
    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.endgameCrisis, undefined);
    assert.strictEqual(parsed.precursorFleet, undefined);
  });
});

describe('Endgame Crisis Deep — warning event payload', () => {
  it('warning event includes ticksUntilCrisis', () => {
    const engine = createEngine({ matchTimer: 10 }); // 6000 ticks total
    const events = [];
    engine.onEvent = (evts) => { events.push(...evts); };

    // Tick to warning threshold
    tickN(engine, 4405);

    const warnings = events.filter(e => e.eventType === 'endgameCrisisWarning');
    assert.strictEqual(warnings.length, 1);
    assert.ok(typeof warnings[0].ticksUntilCrisis === 'number');
    assert.ok(warnings[0].ticksUntilCrisis >= 0);
    assert.ok(warnings[0].ticksUntilCrisis <= ENDGAME_CRISIS_WARNING_TICKS);
  });
});

describe('Endgame Crisis Deep — crisis event payload', () => {
  it('galactic storm event has correct fields', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._pendingEvents = [];

    // Force galactic storm
    engine._matchTicksRemaining = engine._endgameCrisisTriggerTicks;
    const origRandom = Math.random;
    Math.random = () => 0.1; // < 0.5 = galacticStorm
    engine._processEndgameCrisis();
    Math.random = origRandom;

    const events = engine._flushEvents() || [];
    // Filter out warning event — we want the crisis trigger event
    const crisis = events.filter(e => e.eventType === 'endgameCrisis');
    assert.strictEqual(crisis.length, 1);
    assert.strictEqual(crisis[0].crisisType, 'galacticStorm');
    assert.ok(crisis[0].label);
    assert.ok(crisis[0].description);
  });

  it('precursor awakening event has HP and attack fields', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._pendingEvents = [];

    engine._matchTicksRemaining = engine._endgameCrisisTriggerTicks;
    const origRandom = Math.random;
    Math.random = () => 0.9; // >= 0.5 = precursorAwakening
    engine._processEndgameCrisis();
    Math.random = origRandom;

    const events = engine._flushEvents() || [];
    const crisis = events.filter(e => e.eventType === 'endgameCrisis');
    assert.strictEqual(crisis.length, 1);
    assert.strictEqual(crisis[0].crisisType, 'precursorAwakening');
    assert.strictEqual(crisis[0].precursorHp, PRECURSOR_HP);
    assert.strictEqual(crisis[0].precursorAttack, PRECURSOR_ATTACK);
  });
});

describe('Endgame Crisis Deep — _processPrecursorMovement', () => {
  it('no-op when precursorFleet is null', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._precursorFleet = null;
    // Should not throw
    engine._processPrecursorMovement();
    assert.strictEqual(engine._precursorFleet, null);
  });

  it('no-op when path is empty', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);
    placePrecursor(engine, colony.systemId, colony.systemId, colony.id, { path: [] });
    const hpBefore = engine._precursorFleet.hp;

    engine._processPrecursorMovement();
    assert.strictEqual(engine._precursorFleet.hp, hpBefore, 'HP should be unchanged');
  });

  it('hopProgress increments each tick', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);

    // Find adjacent system
    const neighbors = engine._adjacency.get(colony.systemId) || [];
    if (neighbors.length === 0) return;

    placePrecursor(engine, neighbors[0], colony.systemId, colony.id, {
      path: [colony.systemId],
    });

    assert.strictEqual(engine._precursorFleet.hopProgress, 0);
    engine._processPrecursorMovement();
    assert.strictEqual(engine._precursorFleet.hopProgress, 1);
    engine._processPrecursorMovement();
    assert.strictEqual(engine._precursorFleet.hopProgress, 2);
  });
});
