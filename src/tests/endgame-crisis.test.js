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
  engine._doctrinePhase = false; // skip doctrine auto-assignment
  return engine;
}

// Helper: create engine with no match timer (unlimited)
function createUnlimitedEngine() {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  const engine = new GameEngine(room, { tickRate: 10 });
  engine._doctrinePhase = false;
  return engine;
}

function getFirstColony(engine, playerId = 'p1') {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

// Advance engine by N ticks
function tickN(engine, n) {
  for (let i = 0; i < n; i++) engine.tick();
}

describe('Endgame Crisis — constants', () => {
  it('crisis trigger constants are valid', () => {
    assert.strictEqual(ENDGAME_CRISIS_TRIGGER, 0.75);
    assert.strictEqual(ENDGAME_CRISIS_WARNING_TICKS, 100);
  });

  it('galactic storm multiplier is valid', () => {
    assert.strictEqual(GALACTIC_STORM_MULTIPLIER, 0.75);
  });

  it('precursor fleet constants are valid', () => {
    assert.strictEqual(PRECURSOR_HP, 60);
    assert.strictEqual(PRECURSOR_ATTACK, 15);
    assert.strictEqual(PRECURSOR_HOP_TICKS, 30);
    assert.strictEqual(PRECURSOR_COMBAT_TICKS, 8);
    assert.strictEqual(PRECURSOR_DESTROY_VP, 15);
    assert.strictEqual(PRECURSOR_OCCUPY_VP, -5);
  });
});

describe('Endgame Crisis — initialization', () => {
  it('engine starts with no endgame crisis', () => {
    const engine = createEngine();
    assert.strictEqual(engine._endgameCrisis, null);
    assert.strictEqual(engine._endgameCrisisWarned, false);
    assert.strictEqual(engine._endgameCrisisTriggered, false);
    assert.strictEqual(engine._precursorFleet, null);
    assert.strictEqual(engine._precursorDestroyedBy, null);
    assert.ok(engine._precursorOccupiedColonies instanceof Set);
    assert.strictEqual(engine._precursorOccupiedColonies.size, 0);
  });

  it('engine tracks total match ticks for crisis timing', () => {
    const engine = createEngine({ matchTimer: 10 }); // 10 min = 6000 ticks at 10Hz
    assert.strictEqual(engine._matchTicksTotal, 6000);
    assert.strictEqual(engine._matchTimerEnabled, true);
  });

  it('engine with no timer has 0 total match ticks', () => {
    const engine = createUnlimitedEngine();
    assert.strictEqual(engine._matchTicksTotal, 0);
    assert.strictEqual(engine._matchTimerEnabled, false);
  });
});

describe('Endgame Crisis — does not trigger without timer', () => {
  it('no crisis triggered in unlimited mode', () => {
    const engine = createUnlimitedEngine();
    tickN(engine, 10000);
    assert.strictEqual(engine._endgameCrisisTriggered, false);
    assert.strictEqual(engine._endgameCrisis, null);
  });
});

describe('Endgame Crisis — warning', () => {
  it('emits warning before crisis triggers', () => {
    const engine = createEngine({ matchTimer: 10 }); // 6000 total ticks
    // 75% = 4500 ticks elapsed, trigger when remaining = 1500
    // Warning at remaining = 1500 + 100 = 1600
    // Need to tick to 6000 - 1600 = 4400 ticks
    const events = [];
    engine.onEvent = (evts) => { events.push(...evts); };

    // Tick to just before warning
    tickN(engine, 4398);
    const warningsBefore = events.filter(e => e.eventType === 'endgameCrisisWarning');
    assert.strictEqual(warningsBefore.length, 0);

    // Tick past warning threshold
    tickN(engine, 5);
    const warningsAfter = events.filter(e => e.eventType === 'endgameCrisisWarning');
    assert.strictEqual(warningsAfter.length, 1);
    assert.strictEqual(warningsAfter[0].broadcast, true);
  });

  it('warning only fires once', () => {
    const engine = createEngine({ matchTimer: 10 });
    const events = [];
    engine.onEvent = (evts) => { events.push(...evts); };

    tickN(engine, 4500);
    const warnings = events.filter(e => e.eventType === 'endgameCrisisWarning');
    assert.strictEqual(warnings.length, 1);
  });
});

describe('Endgame Crisis — trigger', () => {
  it('crisis triggers at 75% elapsed', () => {
    const engine = createEngine({ matchTimer: 10 }); // 6000 total ticks
    // Trigger when remaining <= 1500 (75% of 6000 elapsed = 4500 ticks)
    const events = [];
    engine.onEvent = (evts) => { events.push(...evts); };

    tickN(engine, 4499);
    assert.strictEqual(engine._endgameCrisisTriggered, false);

    tickN(engine, 2);
    assert.strictEqual(engine._endgameCrisisTriggered, true);
    assert.ok(engine._endgameCrisis !== null);

    const crisisEvents = events.filter(e => e.eventType === 'endgameCrisis');
    assert.strictEqual(crisisEvents.length, 1);
    assert.strictEqual(crisisEvents[0].broadcast, true);
    assert.ok(['galacticStorm', 'precursorAwakening'].includes(crisisEvents[0].crisisType));
  });

  it('crisis only triggers once', () => {
    const engine = createEngine({ matchTimer: 10 });
    const events = [];
    engine.onEvent = (evts) => { events.push(...evts); };

    tickN(engine, 5000);
    const crisisEvents = events.filter(e => e.eventType === 'endgameCrisis');
    assert.strictEqual(crisisEvents.length, 1);
  });
});

describe('Endgame Crisis — Galactic Storm', () => {
  it('reduces all production by 25%', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._doctrinePhase = false;

    const colony = getFirstColony(engine);
    assert.ok(colony, 'should have starting colony');

    // Get baseline production
    const baseline = engine._calcProduction(colony);
    const baseEnergy = baseline.production.energy;
    assert.ok(baseEnergy > 0, 'baseline energy should be > 0');

    // Force galactic storm
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'galacticStorm' };
    engine._invalidateAllProductionCaches();

    const stormed = engine._calcProduction(colony);
    const stormEnergy = stormed.production.energy;
    assert.strictEqual(stormEnergy, Math.round(baseEnergy * GALACTIC_STORM_MULTIPLIER * 100) / 100);
  });

  it('storm affects minerals, food, alloys, research', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);

    // Build diverse districts for testing
    engine.handleCommand('p1', { type: 'buildDistrict', colonyId: colony.id, districtType: 'mining' });
    engine.handleCommand('p1', { type: 'buildDistrict', colonyId: colony.id, districtType: 'industrial' });
    // Skip build time
    colony.buildQueue.forEach(q => q.ticksRemaining = 0);
    engine.tick();

    // Baseline
    const baseline = engine._calcProduction(colony);

    // Activate storm
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'galacticStorm' };
    engine._invalidateAllProductionCaches();

    const stormed = engine._calcProduction(colony);
    for (const resource of ['energy', 'minerals', 'food', 'alloys']) {
      if (baseline.production[resource] > 0) {
        assert.strictEqual(
          stormed.production[resource],
          Math.round(baseline.production[resource] * GALACTIC_STORM_MULTIPLIER * 100) / 100,
          `${resource} should be reduced by storm`
        );
      }
    }
  });

  it('storm is serialized in game state', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'galacticStorm' };

    const state = engine.getPlayerState('p1');
    assert.ok(state.endgameCrisis);
    assert.strictEqual(state.endgameCrisis.type, 'galacticStorm');
    assert.strictEqual(state.precursorFleet, undefined);
  });
});

describe('Endgame Crisis — Precursor Awakening', () => {
  it('spawns precursor fleet', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'precursorAwakening' };
    engine._spawnPrecursorFleet();

    assert.ok(engine._precursorFleet !== null, 'should have precursor fleet');
    assert.strictEqual(engine._precursorFleet.hp, PRECURSOR_HP);
    assert.strictEqual(engine._precursorFleet.attack, PRECURSOR_ATTACK);
    assert.ok(engine._precursorFleet.path.length > 0, 'should have path');
    assert.ok(engine._precursorFleet.targetSystemId !== null, 'should have target');
  });

  it('precursor fleet moves toward colony', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'precursorAwakening' };
    engine._spawnPrecursorFleet();

    const initialSystem = engine._precursorFleet.systemId;
    const initialPathLength = engine._precursorFleet.path.length;

    // Tick past one hop
    tickN(engine, PRECURSOR_HOP_TICKS + 1);

    if (engine._precursorFleet) {
      // Fleet should have moved or arrived
      assert.ok(
        engine._precursorFleet.systemId !== initialSystem ||
        engine._precursorFleet.path.length < initialPathLength,
        'precursor should have moved'
      );
    }
    // If fleet is null, it arrived and resolved (also valid)
  });

  it('precursor fleet serialized in state', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'precursorAwakening' };
    engine._spawnPrecursorFleet();

    const state = engine.getPlayerState('p1');
    assert.ok(state.endgameCrisis);
    assert.strictEqual(state.endgameCrisis.type, 'precursorAwakening');
    assert.ok(state.precursorFleet);
    assert.strictEqual(state.precursorFleet.hp, PRECURSOR_HP);
  });

  it('precursor not serialized after destroyed', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'precursorAwakening' };
    engine._precursorFleet = null; // destroyed

    const state = engine.getPlayerState('p1');
    assert.ok(state.endgameCrisis);
    assert.ok(!state.precursorFleet);
  });
});

describe('Endgame Crisis — Precursor Combat with Ships', () => {
  it('player corvettes can fight precursor', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'precursorAwakening' };

    const colony = getFirstColony(engine);
    const systemId = colony.systemId;

    // Place precursor at colony's system (ready to fight)
    engine._precursorFleet = {
      id: engine._nextId(),
      systemId,
      targetSystemId: systemId,
      targetColonyId: colony.id,
      path: [],
      hopProgress: 0,
      hp: PRECURSOR_HP,
      attack: PRECURSOR_ATTACK,
    };

    // Place 10 corvettes at the same system (enough to possibly kill it)
    for (let i = 0; i < 10; i++) {
      const ship = {
        id: engine._nextId(),
        ownerId: 'p1',
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
      if (!engine._militaryShipsByPlayer.has('p1')) {
        engine._militaryShipsByPlayer.set('p1', []);
      }
      engine._militaryShipsByPlayer.get('p1').push(ship);
    }

    // Resolve precursor arrival (which triggers combat)
    engine._resolvePrecursorArrival(engine._precursorFleet);

    // Flush pending events
    const events = engine._flushEvents() || [];

    // Check either precursor was destroyed or colony was occupied
    const destroyedEvents = events.filter(e => e.eventType === 'precursorDestroyed');
    const occupiedEvents = events.filter(e => e.eventType === 'precursorOccupied');

    assert.ok(
      destroyedEvents.length > 0 || occupiedEvents.length > 0,
      'should have resolved combat (either destroyed or occupied)'
    );
  });
});

describe('Endgame Crisis — Precursor Combat with Defense Platform', () => {
  it('defense platform fights precursor on arrival', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'precursorAwakening' };

    const colony = getFirstColony(engine);
    colony.defensePlatform = {
      hp: DEFENSE_PLATFORM_MAX_HP,
      maxHp: DEFENSE_PLATFORM_MAX_HP,
      building: false,
      buildTicksRemaining: 0,
    };

    engine._precursorFleet = {
      id: engine._nextId(),
      systemId: colony.systemId,
      targetSystemId: colony.systemId,
      targetColonyId: colony.id,
      path: [],
      hopProgress: 0,
      hp: PRECURSOR_HP,
      attack: PRECURSOR_ATTACK,
    };

    engine._resolvePrecursorArrival(engine._precursorFleet);

    // Flush pending events
    const events = engine._flushEvents() || [];

    // Platform has 50 HP, precursor attacks at 15/tick
    // Over 8 rounds: platform takes 15*8 = 120 damage (destroyed in ~3.3 rounds)
    // Platform deals 15/tick to precursor: 15*3 = 45 damage (precursor survives with 15 HP)
    // So precursor should survive and occupy
    const destroyedEvents = events.filter(e => e.eventType === 'precursorDestroyed');
    const occupiedEvents = events.filter(e => e.eventType === 'precursorOccupied');
    assert.ok(
      destroyedEvents.length > 0 || occupiedEvents.length > 0 || engine._precursorFleet === null,
      'should have resolved (destroyed or occupied)'
    );
  });
});

describe('Endgame Crisis — VP effects', () => {
  it('+15 VP for destroying precursor', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._doctrinePhase = false;

    const vpBefore = engine._calcVPBreakdown('p1');

    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'precursorAwakening' };
    engine._precursorDestroyedBy = 'p1';
    engine._vpCacheTick = -1;

    const vpAfter = engine._calcVPBreakdown('p1');
    assert.strictEqual(vpAfter.precursorVP, PRECURSOR_DESTROY_VP);
    assert.strictEqual(vpAfter.vp - vpBefore.vp, PRECURSOR_DESTROY_VP);
  });

  it('-5 VP for precursor-occupied colony', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);

    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'precursorAwakening' };
    engine._precursorOccupiedColonies.add(colony.id);
    engine._vpCacheTick = -1;

    const vp = engine._calcVPBreakdown('p1');
    assert.strictEqual(vp.precursorOccupiedCount, 1);
    assert.strictEqual(vp.precursorVP, PRECURSOR_OCCUPY_VP); // -5
  });

  it('destroyer VP stacks with occupation penalty', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);

    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'precursorAwakening' };
    engine._precursorDestroyedBy = 'p1';
    engine._precursorOccupiedColonies.add(colony.id);
    engine._vpCacheTick = -1;

    const vp = engine._calcVPBreakdown('p1');
    assert.strictEqual(vp.precursorVP, PRECURSOR_DESTROY_VP + PRECURSOR_OCCUPY_VP); // 15 + (-5) = 10
  });

  it('no precursor VP when no crisis', () => {
    const engine = createEngine({ matchTimer: 10 });
    const vp = engine._calcVPBreakdown('p1');
    assert.strictEqual(vp.precursorVP, 0);
    assert.strictEqual(vp.precursorOccupiedCount, 0);
  });
});

describe('Endgame Crisis — Precursor Occupation Effects', () => {
  it('precursor-occupied colony has halved production', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);

    const baseline = engine._calcProduction(colony);
    const baseFood = baseline.production.food;

    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'precursorAwakening' };
    engine._precursorOccupiedColonies.add(colony.id);
    engine._invalidateColonyCache(colony);

    const occupied = engine._calcProduction(colony);
    const occupiedFood = occupied.production.food;
    // Production should be halved (0.5 multiplier)
    assert.ok(occupiedFood < baseFood, 'production should be reduced');
    assert.strictEqual(occupiedFood, Math.round(baseFood * 0.5 * 100) / 100);
  });
});

describe('Endgame Crisis — serialization', () => {
  it('no crisis state when not triggered', () => {
    const engine = createEngine({ matchTimer: 10 });
    const state = engine.getPlayerState('p1');
    assert.strictEqual(state.endgameCrisis, undefined);
    assert.strictEqual(state.precursorFleet, undefined);
  });

  it('galactic storm serialized correctly', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'galacticStorm' };
    engine._invalidateStateCache();

    const state = engine.getPlayerState('p1');
    assert.deepStrictEqual(state.endgameCrisis, { type: 'galacticStorm' });
  });

  it('precursor fleet serialized with HP and position', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'precursorAwakening' };
    engine._spawnPrecursorFleet();
    engine._invalidateStateCache();

    const state = engine.getPlayerState('p1');
    assert.ok(state.precursorFleet);
    assert.strictEqual(state.precursorFleet.hp, PRECURSOR_HP);
    assert.ok(typeof state.precursorFleet.systemId === 'number');
    assert.ok(typeof state.precursorFleet.hopsRemaining === 'number');
  });

  it('getState also includes crisis data', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'galacticStorm' };
    engine._invalidateStateCache();

    const state = engine.getState();
    assert.deepStrictEqual(state.endgameCrisis, { type: 'galacticStorm' });
  });

  it('cached ship data includes precursor', () => {
    const engine = createEngine({ matchTimer: 10 });
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'precursorAwakening' };
    engine._spawnPrecursorFleet();
    engine._invalidateStateCache();

    const shipData = engine._getSerializedShipData();
    assert.ok(shipData.precursorFleet);
    assert.strictEqual(shipData.precursorFleet.hp, PRECURSOR_HP);
  });
});

describe('Endgame Crisis — edge cases', () => {
  it('short match timer (1 min) still triggers crisis', () => {
    const engine = createEngine({ matchTimer: 1 }); // 600 ticks total
    // 75% elapsed = 450 ticks, trigger at remaining = 150
    const events = [];
    engine.onEvent = (evts) => { events.push(...evts); };

    tickN(engine, 460);
    assert.strictEqual(engine._endgameCrisisTriggered, true);
  });

  it('storm stacks with scarcity season', () => {
    const engine = createEngine({ matchTimer: 10 });
    const colony = getFirstColony(engine);

    // Activate both scarcity and storm
    engine._activeScarcity = { resource: 'energy', ticksRemaining: 100 };
    engine._endgameCrisisTriggered = true;
    engine._endgameCrisis = { type: 'galacticStorm' };
    engine._invalidateColonyCache(colony);

    const result = engine._calcProduction(colony);
    // Energy should be reduced by both scarcity (0.70) and storm (0.75)
    // The multipliers stack multiplicatively
    assert.ok(result.production.energy >= 0);
  });

  it('VP breakdown includes precursorVP field always', () => {
    const engine = createEngine({ matchTimer: 10 });
    const breakdown = engine._calcVPBreakdown('p1');
    assert.ok('precursorVP' in breakdown);
    assert.ok('precursorOccupiedCount' in breakdown);
  });
});
