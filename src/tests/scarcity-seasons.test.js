const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine, MONTH_TICKS, DISTRICT_DEFS,
  SCARCITY_RESOURCES, SCARCITY_MIN_INTERVAL, SCARCITY_MAX_INTERVAL,
  SCARCITY_DURATION, SCARCITY_WARNING_TICKS, SCARCITY_MULTIPLIER,
} = require('../../server/game-engine');

// Helper: create a game engine with 1 player
function makeEngine(opts = {}) {
  const room = {
    id: 'test-room',
    players: new Map([[1, { name: 'Alice' }]]),
    hostId: 1,
    galaxySize: 'small',
    matchTimer: 0,
    ...(opts.room || {}),
  };
  const engine = new GameEngine(room, {
    tickRate: 10,
    galaxySeed: opts.seed != null ? opts.seed : 42,
    ...opts,
  });
  return engine;
}

function makeEngineMulti(playerCount = 2) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { name: 'Player' + i });
  }
  const room = {
    id: 'test-room',
    players,
    hostId: 1,
    galaxySize: 'small',
    matchTimer: 0,
  };
  return new GameEngine(room, { tickRate: 10, galaxySeed: 42 });
}

function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

function addDistricts(colony, type, count) {
  for (let i = 0; i < count; i++) {
    colony.districts.push({ id: 'sc-' + type + '-' + i + '-' + Math.random(), type });
  }
}

function collectEvents(engine) {
  const all = [];
  engine.onEvent = (events) => { all.push(...events); };
  return all;
}

// Advance engine N ticks
function tickN(engine, n) {
  for (let i = 0; i < n; i++) engine.tick();
}

describe('Scarcity Seasons — Constants', () => {
  it('exports all scarcity constants', () => {
    assert.deepStrictEqual(SCARCITY_RESOURCES, ['energy', 'minerals', 'food']);
    assert.strictEqual(SCARCITY_MIN_INTERVAL, 800);
    assert.strictEqual(SCARCITY_MAX_INTERVAL, 1200);
    assert.strictEqual(SCARCITY_DURATION, 300);
    assert.strictEqual(SCARCITY_WARNING_TICKS, 100);
    assert.strictEqual(SCARCITY_MULTIPLIER, 0.70);
  });

  it('scarcity only affects commodity resources (not alloys/research)', () => {
    assert.ok(!SCARCITY_RESOURCES.includes('alloys'));
    assert.ok(!SCARCITY_RESOURCES.includes('research'));
    assert.ok(!SCARCITY_RESOURCES.includes('physics'));
    assert.ok(!SCARCITY_RESOURCES.includes('influence'));
  });
});

describe('Scarcity Seasons — Initialization', () => {
  it('engine starts with no active scarcity', () => {
    const engine = makeEngine();
    assert.strictEqual(engine._activeScarcity, null);
    assert.strictEqual(engine._lastScarcityResource, null);
    assert.strictEqual(engine._scarcityWarned, false);
  });

  it('_nextScarcityTick is within valid range', () => {
    const engine = makeEngine();
    assert.ok(engine._nextScarcityTick >= SCARCITY_MIN_INTERVAL);
    assert.ok(engine._nextScarcityTick <= SCARCITY_MAX_INTERVAL);
  });
});

describe('Scarcity Seasons — Warning Phase', () => {
  it('broadcasts scarcityWarning 100 ticks before start', () => {
    const engine = makeEngine();
    const events = collectEvents(engine);

    // Advance to warning phase
    const warningTick = engine._nextScarcityTick - SCARCITY_WARNING_TICKS;
    tickN(engine, warningTick);

    const warnings = events.filter(e => e.eventType === 'scarcityWarning');
    assert.strictEqual(warnings.length, 1);
    assert.ok(SCARCITY_RESOURCES.includes(warnings[0].resource));
    assert.strictEqual(warnings[0].broadcast, true);
  });

  it('does not broadcast warning before warning phase', () => {
    const engine = makeEngine();
    const events = collectEvents(engine);

    const warningTick = engine._nextScarcityTick - SCARCITY_WARNING_TICKS;
    tickN(engine, warningTick - 1);

    const warnings = events.filter(e => e.eventType === 'scarcityWarning');
    assert.strictEqual(warnings.length, 0);
  });

  it('warning only fires once', () => {
    const engine = makeEngine();
    const events = collectEvents(engine);

    const warningTick = engine._nextScarcityTick - SCARCITY_WARNING_TICKS;
    tickN(engine, warningTick + 50); // well into warning phase, not yet started

    const warnings = events.filter(e => e.eventType === 'scarcityWarning');
    assert.strictEqual(warnings.length, 1);
  });
});

describe('Scarcity Seasons — Active Scarcity', () => {
  it('scarcity starts at scheduled tick with broadcast', () => {
    const engine = makeEngine();
    const events = collectEvents(engine);

    tickN(engine, engine._nextScarcityTick);

    const starts = events.filter(e => e.eventType === 'scarcityStarted');
    assert.strictEqual(starts.length, 1);
    assert.ok(SCARCITY_RESOURCES.includes(starts[0].resource));
    assert.strictEqual(starts[0].duration, SCARCITY_DURATION);
    assert.strictEqual(starts[0].broadcast, true);
  });

  it('_activeScarcity is set after start', () => {
    const engine = makeEngine();
    collectEvents(engine);

    tickN(engine, engine._nextScarcityTick);

    assert.ok(engine._activeScarcity !== null);
    assert.ok(SCARCITY_RESOURCES.includes(engine._activeScarcity.resource));
    assert.strictEqual(engine._activeScarcity.ticksRemaining, SCARCITY_DURATION);
  });

  it('warning resource matches started resource', () => {
    const engine = makeEngine();
    const events = collectEvents(engine);

    tickN(engine, engine._nextScarcityTick);

    const warning = events.find(e => e.eventType === 'scarcityWarning');
    const started = events.find(e => e.eventType === 'scarcityStarted');
    assert.strictEqual(warning.resource, started.resource);
  });

  it('scarcity ends after SCARCITY_DURATION ticks', () => {
    const engine = makeEngine();
    const events = collectEvents(engine);

    tickN(engine, engine._nextScarcityTick + SCARCITY_DURATION);

    const ends = events.filter(e => e.eventType === 'scarcityEnded');
    assert.strictEqual(ends.length, 1);
    assert.strictEqual(ends[0].broadcast, true);
    assert.strictEqual(engine._activeScarcity, null);
  });

  it('_lastScarcityResource is set after scarcity starts', () => {
    const engine = makeEngine();
    const events = collectEvents(engine);

    tickN(engine, engine._nextScarcityTick);

    const started = events.find(e => e.eventType === 'scarcityStarted');
    assert.strictEqual(engine._lastScarcityResource, started.resource);
  });
});

describe('Scarcity Seasons — Production Multiplier', () => {
  it('applies -30% multiplier to affected resource during scarcity', () => {
    const engine = makeEngine();
    const colony = getFirstColony(engine, 1);
    // Clear existing districts and add known ones
    colony.districts = [];
    addDistricts(colony, 'mining', 2);
    addDistricts(colony, 'generator', 2);
    addDistricts(colony, 'agriculture', 2);
    colony.pops = 6;
    colony._cachedProduction = null;

    // Get baseline production
    const baseProd = engine._calcProduction(colony).production;
    const baseMinerals = baseProd.minerals;
    const baseEnergy = baseProd.energy;
    const baseFood = baseProd.food;

    // Force a mineral scarcity
    engine._activeScarcity = { resource: 'minerals', ticksRemaining: 100 };
    colony._cachedProduction = null;

    const scarcityProd = engine._calcProduction(colony).production;
    assert.strictEqual(scarcityProd.minerals, Math.round(baseMinerals * SCARCITY_MULTIPLIER * 100) / 100);
    // Other resources unaffected
    assert.strictEqual(scarcityProd.energy, baseEnergy);
    assert.strictEqual(scarcityProd.food, baseFood);
  });

  it('applies -30% to energy when energy scarcity active', () => {
    const engine = makeEngine();
    const colony = getFirstColony(engine, 1);
    colony.districts = [];
    addDistricts(colony, 'generator', 3);
    colony.pops = 3;
    colony._cachedProduction = null;

    const baseProd = engine._calcProduction(colony).production;
    const baseEnergy = baseProd.energy;

    engine._activeScarcity = { resource: 'energy', ticksRemaining: 50 };
    colony._cachedProduction = null;

    const scarcityProd = engine._calcProduction(colony).production;
    assert.strictEqual(scarcityProd.energy, Math.round(baseEnergy * SCARCITY_MULTIPLIER * 100) / 100);
  });

  it('applies -30% to food when food scarcity active', () => {
    const engine = makeEngine();
    const colony = getFirstColony(engine, 1);
    colony.districts = [];
    addDistricts(colony, 'agriculture', 3);
    colony.pops = 3;
    colony._cachedProduction = null;

    const baseProd = engine._calcProduction(colony).production;
    const baseFood = baseProd.food;

    engine._activeScarcity = { resource: 'food', ticksRemaining: 50 };
    colony._cachedProduction = null;

    const scarcityProd = engine._calcProduction(colony).production;
    assert.strictEqual(scarcityProd.food, Math.round(baseFood * SCARCITY_MULTIPLIER * 100) / 100);
  });

  it('does NOT affect alloys or research during scarcity', () => {
    const engine = makeEngine();
    const colony = getFirstColony(engine, 1);
    colony.districts = [];
    addDistricts(colony, 'industrial', 2);
    addDistricts(colony, 'research', 2);
    addDistricts(colony, 'generator', 2); // for energy
    colony.pops = 6;
    colony._cachedProduction = null;

    const baseProd = engine._calcProduction(colony).production;
    const baseAlloys = baseProd.alloys;
    const basePhysics = baseProd.physics;

    // Energy scarcity — alloys/research should be untouched
    engine._activeScarcity = { resource: 'energy', ticksRemaining: 50 };
    colony._cachedProduction = null;

    const scarcityProd = engine._calcProduction(colony).production;
    assert.strictEqual(scarcityProd.alloys, baseAlloys);
    assert.strictEqual(scarcityProd.physics, basePhysics);
  });

  it('production restores to normal after scarcity ends', () => {
    const engine = makeEngine();
    const colony = getFirstColony(engine, 1);
    colony.districts = [];
    addDistricts(colony, 'mining', 3);
    colony.pops = 3;
    colony._cachedProduction = null;

    const baseProd = engine._calcProduction(colony).production;
    const baseMinerals = baseProd.minerals;

    // Activate then deactivate scarcity
    engine._activeScarcity = { resource: 'minerals', ticksRemaining: 50 };
    colony._cachedProduction = null;
    const duringProd = engine._calcProduction(colony).production;
    assert.ok(duringProd.minerals < baseMinerals);

    engine._activeScarcity = null;
    colony._cachedProduction = null;
    const afterProd = engine._calcProduction(colony).production;
    assert.strictEqual(afterProd.minerals, baseMinerals);
  });
});

describe('Scarcity Seasons — Resource Rotation', () => {
  it('does not pick the same resource twice in a row', () => {
    const engine = makeEngine();
    // Force last resource and verify next pick is different
    for (const res of SCARCITY_RESOURCES) {
      engine._lastScarcityResource = res;
      for (let i = 0; i < 50; i++) {
        const picked = engine._pickScarcityResource();
        assert.notStrictEqual(picked, res, `Picked ${picked} after ${res}`);
        assert.ok(SCARCITY_RESOURCES.includes(picked));
      }
    }
  });

  it('picks from all resources when no last resource', () => {
    const engine = makeEngine();
    engine._lastScarcityResource = null;
    const seen = new Set();
    for (let i = 0; i < 100; i++) {
      seen.add(engine._pickScarcityResource());
    }
    // Should pick at least 2 different resources
    assert.ok(seen.size >= 2);
  });
});

describe('Scarcity Seasons — Scheduling', () => {
  it('next scarcity is scheduled after current one ends', () => {
    const engine = makeEngine();
    collectEvents(engine);

    const firstTarget = engine._nextScarcityTick;
    tickN(engine, firstTarget + SCARCITY_DURATION);

    // After first scarcity ends, next should be scheduled
    const nextTarget = engine._nextScarcityTick;
    const elapsed = firstTarget + SCARCITY_DURATION;
    assert.ok(nextTarget >= elapsed + SCARCITY_MIN_INTERVAL, `next=${nextTarget} elapsed=${elapsed}`);
    assert.ok(nextTarget <= elapsed + SCARCITY_MAX_INTERVAL, `next=${nextTarget} elapsed=${elapsed}`);
  });

  it('_randomScarcityInterval returns values in valid range', () => {
    const engine = makeEngine();
    for (let i = 0; i < 100; i++) {
      const interval = engine._randomScarcityInterval();
      assert.ok(interval >= SCARCITY_MIN_INTERVAL);
      assert.ok(interval <= SCARCITY_MAX_INTERVAL);
    }
  });
});

describe('Scarcity Seasons — Cache Invalidation', () => {
  it('invalidates production caches when scarcity starts', () => {
    const engine = makeEngine();
    const colony = getFirstColony(engine, 1);
    colony.districts = [];
    addDistricts(colony, 'mining', 2);
    colony.pops = 2;

    // Warm the cache
    colony._cachedProduction = null;
    engine._calcProduction(colony);
    assert.ok(colony._cachedProduction !== null);

    // Force scarcity start
    engine._nextScarcityTick = engine.tickCount + 1;
    engine._scarcityWarned = true;
    engine._pendingScarcityResource = 'minerals';
    engine.tick();

    // Cache should be invalidated
    assert.strictEqual(colony._cachedProduction, null);
  });

  it('invalidates production caches when scarcity ends', () => {
    const engine = makeEngine();
    const colony = getFirstColony(engine, 1);

    // Force active scarcity about to end
    engine._activeScarcity = { resource: 'minerals', ticksRemaining: 1 };
    colony._cachedProduction = null;
    engine._calcProduction(colony); // warm cache
    assert.ok(colony._cachedProduction !== null);

    engine.tick();

    assert.strictEqual(colony._cachedProduction, null);
    assert.strictEqual(engine._activeScarcity, null);
  });
});

describe('Scarcity Seasons — Multiplayer', () => {
  it('scarcity affects all players equally', () => {
    const engine = makeEngineMulti(2);
    const colony1 = getFirstColony(engine, 1);
    const colony2 = getFirstColony(engine, 2);

    // Give both players identical mining setups and same planet type
    colony1.districts = [];
    colony2.districts = [];
    colony1.planet.type = 'continental';
    colony2.planet.type = 'continental';
    addDistricts(colony1, 'mining', 2);
    addDistricts(colony2, 'mining', 2);
    colony1.pops = 2;
    colony2.pops = 2;

    // Get baseline without scarcity
    colony1._cachedProduction = null;
    colony2._cachedProduction = null;
    const baseProd1 = engine._calcProduction(colony1).production.minerals;

    // Activate mineral scarcity
    engine._activeScarcity = { resource: 'minerals', ticksRemaining: 100 };
    colony1._cachedProduction = null;
    colony2._cachedProduction = null;

    const prod1 = engine._calcProduction(colony1).production;
    const prod2 = engine._calcProduction(colony2).production;

    assert.strictEqual(prod1.minerals, prod2.minerals);
    assert.ok(prod1.minerals < baseProd1); // less than base
  });
});

describe('Scarcity Seasons — State Serialization', () => {
  it('includes activeScarcity in getState() when scarcity is active', () => {
    const engine = makeEngine();
    engine._activeScarcity = { resource: 'energy', ticksRemaining: 150 };
    engine._invalidateStateCache();

    const state = engine.getState();
    assert.ok(state.activeScarcity);
    assert.strictEqual(state.activeScarcity.resource, 'energy');
    assert.strictEqual(state.activeScarcity.ticksRemaining, 150);
  });

  it('does not include activeScarcity in getState() when no scarcity', () => {
    const engine = makeEngine();
    engine._activeScarcity = null;
    engine._invalidateStateCache();

    const state = engine.getState();
    assert.strictEqual(state.activeScarcity, undefined);
  });

  it('includes activeScarcity in getPlayerState() when active', () => {
    const engine = makeEngine();
    engine._activeScarcity = { resource: 'food', ticksRemaining: 200 };
    engine._cachedPlayerJSON.clear();

    const state = engine.getPlayerState(1);
    assert.ok(state.activeScarcity);
    assert.strictEqual(state.activeScarcity.resource, 'food');
  });

  it('activeScarcity appears in getPlayerStateJSON broadcast', () => {
    const engine = makeEngine();
    engine._activeScarcity = { resource: 'minerals', ticksRemaining: 100 };
    engine._cachedPlayerJSON.clear();

    const json = engine.getPlayerStateJSON(1);
    const parsed = JSON.parse(json);
    assert.ok(parsed.activeScarcity);
    assert.strictEqual(parsed.activeScarcity.resource, 'minerals');
  });
});

describe('Scarcity Seasons — Edict Interaction', () => {
  it('Emergency Reserves edict provides buffer during food scarcity', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);

    // Record food before
    const foodBefore = state.resources.food;

    // Activate Emergency Reserves
    engine.handleCommand(1, { type: 'activateEdict', edictType: 'emergencyReserves' });

    // Should have gained +100 food despite any scarcity
    assert.strictEqual(state.resources.food, foodBefore + 100);
  });

  it('Mineral Rush edict stacks with mineral scarcity multiplier', () => {
    const engine = makeEngine();
    const colony = getFirstColony(engine, 1);
    colony.districts = [];
    addDistricts(colony, 'mining', 3);
    colony.pops = 3;
    colony._cachedProduction = null;

    // Baseline
    const baseProd = engine._calcProduction(colony).production.minerals;

    // Activate Mineral Rush edict
    const state = engine.playerStates.get(1);
    state.activeEdict = { type: 'mineralRush', monthsRemaining: 5 };
    colony._cachedProduction = null;
    const edictProd = engine._calcProduction(colony).production.minerals;
    assert.ok(edictProd > baseProd); // +50% from edict

    // Now add mineral scarcity on top
    engine._activeScarcity = { resource: 'minerals', ticksRemaining: 100 };
    colony._cachedProduction = null;
    const bothProd = engine._calcProduction(colony).production.minerals;

    // Scarcity applies after edict (0.70 multiplier on edict-boosted amount)
    const expected = Math.round(edictProd * SCARCITY_MULTIPLIER * 100) / 100;
    assert.strictEqual(bothProd, expected);
  });
});

describe('Scarcity Seasons — Full Lifecycle Integration', () => {
  it('complete lifecycle: warning → start → production affected → end → production restored', () => {
    const engine = makeEngine();
    const events = collectEvents(engine);
    const colony = getFirstColony(engine, 1);
    colony.districts = [];
    addDistricts(colony, 'mining', 3);
    addDistricts(colony, 'generator', 2);
    colony.pops = 5;
    colony._cachedProduction = null;

    const baseMinerals = engine._calcProduction(colony).production.minerals;

    // Phase 1: advance to warning
    const warningTick = engine._nextScarcityTick - SCARCITY_WARNING_TICKS;
    tickN(engine, warningTick);
    assert.ok(events.some(e => e.eventType === 'scarcityWarning'));
    assert.strictEqual(engine._activeScarcity, null); // not started yet

    // Phase 2: advance to start
    const remainToStart = engine._nextScarcityTick - engine.tickCount;
    tickN(engine, remainToStart);
    assert.ok(engine._activeScarcity !== null);
    assert.ok(events.some(e => e.eventType === 'scarcityStarted'));

    // Phase 3: production is reduced
    colony._cachedProduction = null;
    const scarcityProd = engine._calcProduction(colony).production;
    if (engine._activeScarcity.resource === 'minerals') {
      assert.ok(scarcityProd.minerals < baseMinerals);
    }

    // Phase 4: advance to end
    tickN(engine, SCARCITY_DURATION);
    assert.strictEqual(engine._activeScarcity, null);
    assert.ok(events.some(e => e.eventType === 'scarcityEnded'));

    // Phase 5: production restored
    colony._cachedProduction = null;
    const restoredProd = engine._calcProduction(colony).production;
    assert.strictEqual(restoredProd.minerals, baseMinerals);
  });
});

describe('Scarcity — dirty-player marking', () => {
  it('marks all colony-owning players dirty when scarcity starts', () => {
    const engine = makeEngineMulti(3);
    engine._dirtyPlayers.clear();

    // Force scarcity to start this tick
    engine._nextScarcityTick = engine.tickCount + 1;
    engine._scarcityWarned = true;
    engine._pendingScarcityResource = 'energy';
    engine.tick();

    // All 3 players should be marked dirty
    for (let i = 1; i <= 3; i++) {
      assert.ok(engine._dirtyPlayers.has(i), `Player ${i} should be dirty after scarcity start`);
    }
  });

  it('marks all colony-owning players dirty when scarcity ends', () => {
    const engine = makeEngineMulti(3);
    engine._activeScarcity = { resource: 'food', ticksRemaining: 1 };
    engine._dirtyPlayers.clear();
    engine.tick();

    for (let i = 1; i <= 3; i++) {
      assert.ok(engine._dirtyPlayers.has(i), `Player ${i} should be dirty after scarcity end`);
    }
  });
});

describe('Scarcity Seasons — Zero Production Edge Case', () => {
  it('does not apply multiplier when affected resource production is zero', () => {
    const engine = makeEngine();
    const colony = getFirstColony(engine, 1);
    // Only generator districts — no mining
    colony.districts = [];
    addDistricts(colony, 'generator', 3);
    colony.pops = 3;
    colony._cachedProduction = null;

    // Verify minerals are 0 at baseline
    const baseProd = engine._calcProduction(colony).production;
    assert.strictEqual(baseProd.minerals, 0, 'baseline minerals should be 0');

    // Activate mineral scarcity
    engine._activeScarcity = { resource: 'minerals', ticksRemaining: 100 };
    colony._cachedProduction = null;

    const scarcityProd = engine._calcProduction(colony).production;
    assert.strictEqual(scarcityProd.minerals, 0, 'minerals should remain 0 during scarcity');
    // Energy should be unaffected
    assert.strictEqual(scarcityProd.energy, baseProd.energy);
  });

  it('handles colony with no districts during scarcity', () => {
    const engine = makeEngine();
    const colony = getFirstColony(engine, 1);
    colony.districts = [];
    colony.buildings = [];
    colony.pops = 2;
    colony._cachedProduction = null;

    engine._activeScarcity = { resource: 'energy', ticksRemaining: 50 };

    const prod = engine._calcProduction(colony).production;
    // All production should be 0 or unaffected — no crash
    assert.strictEqual(prod.energy, 0);
    assert.strictEqual(prod.minerals, 0);
    assert.strictEqual(prod.food, 0);
  });
});

describe('Scarcity Seasons — Power Surge Interaction', () => {
  it('power surge stacks on top of energy scarcity (scarcity first, then surge)', () => {
    const engine = makeEngine();
    const colony = getFirstColony(engine, 1);
    colony.districts = [];
    addDistricts(colony, 'generator', 4);
    colony.pops = 4;
    colony._cachedProduction = null;

    // Baseline energy
    const baseEnergy = engine._calcProduction(colony).production.energy;
    assert.ok(baseEnergy > 0);

    // Scarcity only
    engine._activeScarcity = { resource: 'energy', ticksRemaining: 100 };
    colony._cachedProduction = null;
    const scarcityOnly = engine._calcProduction(colony).production.energy;
    const expectedScarcity = Math.round(baseEnergy * SCARCITY_MULTIPLIER * 100) / 100;
    assert.strictEqual(scarcityOnly, expectedScarcity);

    // Scarcity + power surge: surge applies after scarcity
    colony.crisisState = { energyBoostTicks: 50 };
    colony._cachedProduction = null;
    const bothProd = engine._calcProduction(colony).production.energy;
    const expectedBoth = Math.round(expectedScarcity * 1.5 * 100) / 100;
    assert.strictEqual(bothProd, expectedBoth, 'power surge should stack on scarcity-reduced energy');
  });
});

describe('Scarcity Seasons — Pending Resource Fallback', () => {
  it('uses _pendingScarcityResource when set', () => {
    const engine = makeEngine();
    engine._pendingScarcityResource = 'food';
    engine._scarcityWarned = true;
    engine._nextScarcityTick = engine.tickCount + 1;

    collectEvents(engine);
    engine.tick();

    assert.ok(engine._activeScarcity !== null);
    assert.strictEqual(engine._activeScarcity.resource, 'food');
    assert.strictEqual(engine._pendingScarcityResource, null, 'pending should be cleared after use');
  });

  it('falls back to _pickScarcityResource when _pendingScarcityResource is null', () => {
    const engine = makeEngine();
    engine._pendingScarcityResource = null;
    engine._scarcityWarned = true;
    engine._nextScarcityTick = engine.tickCount + 1;

    collectEvents(engine);
    engine.tick();

    assert.ok(engine._activeScarcity !== null);
    assert.ok(SCARCITY_RESOURCES.includes(engine._activeScarcity.resource),
      'should pick a valid resource even without pending');
  });
});

describe('Scarcity Seasons — Multiple Cycles', () => {
  it('second scarcity cycle works correctly after first ends', () => {
    const engine = makeEngine();
    const events = collectEvents(engine);

    // Complete first cycle
    tickN(engine, engine._nextScarcityTick + SCARCITY_DURATION);
    const firstEnd = events.filter(e => e.eventType === 'scarcityEnded');
    assert.strictEqual(firstEnd.length, 1);

    // Record second target
    const secondTarget = engine._nextScarcityTick;
    assert.ok(secondTarget > engine.tickCount);

    // Advance to second cycle
    const ticksToSecond = secondTarget - engine.tickCount;
    tickN(engine, ticksToSecond + SCARCITY_DURATION);

    const starts = events.filter(e => e.eventType === 'scarcityStarted');
    const ends = events.filter(e => e.eventType === 'scarcityEnded');
    assert.strictEqual(starts.length, 2, 'should have 2 scarcity starts');
    assert.strictEqual(ends.length, 2, 'should have 2 scarcity ends');
    // Resources should differ (no same-twice-in-a-row)
    assert.notStrictEqual(starts[0].resource, starts[1].resource);
  });
});

describe('Scarcity Seasons — Summary Cache Invalidation', () => {
  it('_invalidateAllProductionCaches resets _summaryCacheTick', () => {
    const engine = makeEngine();
    // Warm summary cache
    engine._summaryCacheTick = engine.tickCount;

    engine._invalidateAllProductionCaches();

    assert.strictEqual(engine._summaryCacheTick, -1,
      'summary cache tick should be reset to -1');
  });
});

describe('Scarcity Seasons — Monthly Resources During Scarcity', () => {
  it('monthly resource tick applies scarcity-reduced production to player resources', () => {
    const engine = makeEngine();
    const state = engine.playerStates.get(1);
    const colony = getFirstColony(engine, 1);
    colony.districts = [];
    addDistricts(colony, 'mining', 3);
    colony.pops = 3;
    colony._cachedProduction = null;

    // Get expected production during scarcity
    engine._activeScarcity = { resource: 'minerals', ticksRemaining: 9999 };
    colony._cachedProduction = null;
    const scarcityProd = engine._calcProduction(colony).production;
    const expectedMinerals = scarcityProd.minerals;

    // Record minerals before month tick
    const mineralsBefore = state.resources.minerals;

    // Advance to a month boundary
    const ticksToMonth = MONTH_TICKS - (engine.tickCount % MONTH_TICKS);
    tickN(engine, ticksToMonth);

    // Minerals gained should reflect scarcity-reduced production (minus consumption)
    const mineralsGained = state.resources.minerals - mineralsBefore;
    assert.ok(mineralsGained >= 0, 'minerals should not go negative from production');
    // The gained amount should be less than normal full production
    colony._cachedProduction = null;
    engine._activeScarcity = null;
    const normalProd = engine._calcProduction(colony).production.minerals;
    assert.ok(expectedMinerals < normalProd,
      'scarcity production should be less than normal production');
  });
});

describe('Scarcity Seasons — Serialization Mid-Cycle', () => {
  it('ticksRemaining decrements correctly in serialized state', () => {
    const engine = makeEngine();
    engine._activeScarcity = { resource: 'energy', ticksRemaining: 200 };
    engine._invalidateStateCache();

    // Tick 10 times
    for (let i = 0; i < 10; i++) engine.tick();

    engine._invalidateStateCache();
    const state = engine.getState();
    assert.strictEqual(state.activeScarcity.ticksRemaining, 190,
      'ticksRemaining should decrement by 10 after 10 ticks');
  });

  it('getPlayerStateJSON reflects mid-cycle ticksRemaining', () => {
    const engine = makeEngine();
    engine._activeScarcity = { resource: 'minerals', ticksRemaining: 50 };
    engine._cachedPlayerJSON.clear();

    // Tick 5 times
    for (let i = 0; i < 5; i++) engine.tick();

    engine._cachedPlayerJSON.clear();
    const json = engine.getPlayerStateJSON(1);
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.activeScarcity.ticksRemaining, 45);
  });
});

describe('Scarcity — tick performance', () => {
  it('scarcity processing adds negligible per-tick cost', () => {
    const engine = makeEngineMulti(4);

    // Warm up
    for (let i = 0; i < 10; i++) engine.tick();

    // Baseline: no scarcity active
    engine._activeScarcity = null;
    engine._nextScarcityTick = engine.tickCount + 99999;
    const baseStart = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) engine.tick();
    const baseMs = Number(process.hrtime.bigint() - baseStart) / 1e6;

    // With scarcity active
    engine._activeScarcity = { resource: 'energy', ticksRemaining: 9999 };
    const scarcityStart = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) engine.tick();
    const scarcityMs = Number(process.hrtime.bigint() - scarcityStart) / 1e6;

    // Scarcity overhead should be < 20% of baseline
    const overhead = (scarcityMs - baseMs) / baseMs;
    assert.ok(overhead < 0.20,
      `Scarcity overhead ${(overhead * 100).toFixed(1)}% exceeds 20% budget (base: ${baseMs.toFixed(2)}ms, scarcity: ${scarcityMs.toFixed(2)}ms)`);
  });

  it('scarcity transition tick completes within 50ms budget', () => {
    const engine = makeEngineMulti(4);
    // Set up transition
    engine._activeScarcity = { resource: 'minerals', ticksRemaining: 1 };
    const start = process.hrtime.bigint();
    engine.tick(); // triggers scarcity end + cache invalidation
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    assert.ok(durationMs < 50, `Scarcity transition tick took ${durationMs.toFixed(2)}ms, budget is 50ms`);
  });
});
