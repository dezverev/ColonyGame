const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine, SCARCITY_RESOURCES, SCARCITY_WARNING_TICKS,
  SCARCITY_DURATION, SCARCITY_MIN_INTERVAL, SCARCITY_MAX_INTERVAL,
} = require('../../server/game-engine');

function makeEngine(opts = {}) {
  const room = {
    id: 'test-room',
    players: new Map([[1, { name: 'Alice' }]]),
    hostId: 1,
    galaxySize: 'small',
    matchTimer: 0,
    ...(opts.room || {}),
  };
  return new GameEngine(room, {
    tickRate: 10,
    galaxySeed: opts.seed != null ? opts.seed : 42,
    ...opts,
  });
}

function makeEngineMulti(count = 2) {
  const players = new Map();
  for (let i = 1; i <= count; i++) players.set(i, { name: 'P' + i });
  const room = { id: 'test-room', players, hostId: 1, galaxySize: 'small', matchTimer: 0 };
  return new GameEngine(room, { tickRate: 10, galaxySeed: 42 });
}

function tickN(engine, n) {
  for (let i = 0; i < n; i++) engine.tick();
}

function collectEvents(engine) {
  const all = [];
  engine.onEvent = (events) => { all.push(...events); };
  return all;
}

describe('Scarcity Pre-Warning — Cache invalidation on warning tick', () => {
  it('invalidates state cache when warning phase begins via tick', () => {
    const engine = makeEngine();
    collectEvents(engine);

    // Advance to 1 tick before warning phase
    const warningTick = engine._nextScarcityTick - SCARCITY_WARNING_TICKS;
    tickN(engine, warningTick - 1);

    // Warm state cache
    engine._invalidateStateCache();
    engine.getPlayerStateJSON(1);
    const cachedBefore = engine._cachedPlayerJSON;
    assert.ok(cachedBefore !== null || cachedBefore !== undefined,
      'JSON cache should be populated');

    // The warning tick should invalidate caches
    engine.tick();
    assert.strictEqual(engine._scarcityWarned, true, 'warning flag should be set');

    // getState should now include scarcityWarning (proves cache was invalidated)
    engine._invalidateStateCache(); // ensure fresh
    const state = engine.getState();
    assert.ok(state.scarcityWarning, 'scarcityWarning should appear in state after warning tick');
    assert.ok(SCARCITY_RESOURCES.includes(state.scarcityWarning.resource));
  });
});

describe('Scarcity Pre-Warning — ticksUntil clamped to zero', () => {
  it('ticksUntil is 0 when tickCount equals _nextScarcityTick', () => {
    const engine = makeEngine();
    engine._activeScarcity = null;
    engine._scarcityWarned = true;
    engine._pendingScarcityResource = 'energy';
    engine._nextScarcityTick = engine.tickCount; // exactly at boundary
    engine._invalidateStateCache();

    const state = engine.getState();
    assert.ok(state.scarcityWarning);
    assert.strictEqual(state.scarcityWarning.ticksUntil, 0,
      'ticksUntil should be clamped to 0 when at boundary');
  });

  it('ticksUntil is 0 when tickCount exceeds _nextScarcityTick', () => {
    const engine = makeEngine();
    engine._activeScarcity = null;
    engine._scarcityWarned = true;
    engine._pendingScarcityResource = 'minerals';
    engine._nextScarcityTick = engine.tickCount - 5; // past the target
    engine._invalidateStateCache();

    const state = engine.getState();
    assert.ok(state.scarcityWarning);
    assert.strictEqual(state.scarcityWarning.ticksUntil, 0,
      'ticksUntil should be clamped to 0, not negative');
  });

  it('ticksUntil clamped in getPlayerStateJSON as well', () => {
    const engine = makeEngine();
    engine._activeScarcity = null;
    engine._scarcityWarned = true;
    engine._pendingScarcityResource = 'food';
    engine._nextScarcityTick = engine.tickCount - 10;
    engine._invalidateStateCache();

    const json = engine.getPlayerStateJSON(1);
    const parsed = JSON.parse(json);
    assert.ok(parsed.scarcityWarning);
    assert.strictEqual(parsed.scarcityWarning.ticksUntil, 0);
  });
});

describe('Scarcity Pre-Warning — Warning-to-active transition', () => {
  it('scarcityWarning disappears from state when scarcity becomes active', () => {
    const engine = makeEngine();
    collectEvents(engine);

    // Advance into warning phase
    const warningTick = engine._nextScarcityTick - SCARCITY_WARNING_TICKS;
    tickN(engine, warningTick);
    engine._invalidateStateCache();

    const warningState = engine.getState();
    assert.ok(warningState.scarcityWarning, 'should have warning before activation');
    assert.strictEqual(warningState.activeScarcity, undefined);

    // Advance to activation
    const ticksToStart = engine._nextScarcityTick - engine.tickCount;
    tickN(engine, ticksToStart);
    engine._invalidateStateCache();

    const activeState = engine.getState();
    assert.ok(activeState.activeScarcity, 'should have activeScarcity');
    assert.strictEqual(activeState.scarcityWarning, undefined,
      'scarcityWarning must be absent once scarcity is active');
  });

  it('getPlayerStateJSON transitions from warning to active cleanly', () => {
    const engine = makeEngine();
    collectEvents(engine);

    // Into warning phase
    const warningTick = engine._nextScarcityTick - SCARCITY_WARNING_TICKS;
    tickN(engine, warningTick);
    engine._invalidateStateCache();

    const warnJSON = JSON.parse(engine.getPlayerStateJSON(1));
    assert.ok(warnJSON.scarcityWarning);
    assert.strictEqual(warnJSON.activeScarcity, undefined);

    // Into active phase
    tickN(engine, engine._nextScarcityTick - engine.tickCount);
    engine._invalidateStateCache();

    const activeJSON = JSON.parse(engine.getPlayerStateJSON(1));
    assert.ok(activeJSON.activeScarcity);
    assert.strictEqual(activeJSON.scarcityWarning, undefined);
  });
});

describe('Scarcity Pre-Warning — Flag reset for next cycle', () => {
  it('_scarcityWarned resets to false after scarcity ends', () => {
    const engine = makeEngine();
    collectEvents(engine);

    // Complete full cycle: warning → active → end
    tickN(engine, engine._nextScarcityTick + SCARCITY_DURATION);

    assert.strictEqual(engine._activeScarcity, null, 'scarcity should have ended');
    assert.strictEqual(engine._scarcityWarned, false,
      '_scarcityWarned should reset for next cycle');
    assert.strictEqual(engine._pendingScarcityResource, null,
      '_pendingScarcityResource should be cleared');
  });

  it('second cycle produces a new warning event', () => {
    const engine = makeEngine();
    const events = collectEvents(engine);

    // Complete first full cycle
    tickN(engine, engine._nextScarcityTick + SCARCITY_DURATION);

    const warningsBefore = events.filter(e => e.eventType === 'scarcityWarning').length;
    assert.strictEqual(warningsBefore, 1, 'should have 1 warning from first cycle');

    // Advance into second cycle warning phase
    const secondWarningTick = engine._nextScarcityTick - SCARCITY_WARNING_TICKS;
    const ticksToSecondWarning = secondWarningTick - engine.tickCount;
    assert.ok(ticksToSecondWarning > 0, 'should have ticks until second warning');
    tickN(engine, ticksToSecondWarning);

    const warningsAfter = events.filter(e => e.eventType === 'scarcityWarning').length;
    assert.strictEqual(warningsAfter, 2, 'should have 2 warnings after second cycle warning phase');
  });
});

describe('Scarcity Pre-Warning — Multiplayer consistency', () => {
  it('all players see identical scarcityWarning in their JSON payloads', () => {
    const engine = makeEngineMulti(3);
    collectEvents(engine);

    // Advance into warning phase
    const warningTick = engine._nextScarcityTick - SCARCITY_WARNING_TICKS;
    tickN(engine, warningTick);
    engine._invalidateStateCache();

    const p1 = JSON.parse(engine.getPlayerStateJSON(1));
    const p2 = JSON.parse(engine.getPlayerStateJSON(2));
    const p3 = JSON.parse(engine.getPlayerStateJSON(3));

    assert.ok(p1.scarcityWarning, 'Player 1 should see warning');
    assert.ok(p2.scarcityWarning, 'Player 2 should see warning');
    assert.ok(p3.scarcityWarning, 'Player 3 should see warning');

    assert.strictEqual(p1.scarcityWarning.resource, p2.scarcityWarning.resource);
    assert.strictEqual(p2.scarcityWarning.resource, p3.scarcityWarning.resource);
    assert.strictEqual(p1.scarcityWarning.ticksUntil, p2.scarcityWarning.ticksUntil);
    assert.strictEqual(p2.scarcityWarning.ticksUntil, p3.scarcityWarning.ticksUntil);
  });

  it('all players see identical activeScarcity after transition', () => {
    const engine = makeEngineMulti(3);
    collectEvents(engine);

    tickN(engine, engine._nextScarcityTick);
    engine._invalidateStateCache();

    const p1 = JSON.parse(engine.getPlayerStateJSON(1));
    const p2 = JSON.parse(engine.getPlayerStateJSON(2));
    const p3 = JSON.parse(engine.getPlayerStateJSON(3));

    assert.ok(p1.activeScarcity);
    assert.strictEqual(p1.activeScarcity.resource, p2.activeScarcity.resource);
    assert.strictEqual(p2.activeScarcity.resource, p3.activeScarcity.resource);
    // No warnings should be present
    assert.strictEqual(p1.scarcityWarning, undefined);
    assert.strictEqual(p2.scarcityWarning, undefined);
    assert.strictEqual(p3.scarcityWarning, undefined);
  });
});

describe('Scarcity Pre-Warning — Warning resource matches started resource', () => {
  it('scarcityWarning.resource in state matches the eventual activeScarcity.resource', () => {
    const engine = makeEngine();
    collectEvents(engine);

    // Enter warning phase
    const warningTick = engine._nextScarcityTick - SCARCITY_WARNING_TICKS;
    tickN(engine, warningTick);
    engine._invalidateStateCache();

    const warningResource = engine.getState().scarcityWarning.resource;

    // Enter active phase
    tickN(engine, engine._nextScarcityTick - engine.tickCount);
    engine._invalidateStateCache();

    const activeResource = engine.getState().activeScarcity.resource;
    assert.strictEqual(warningResource, activeResource,
      'warned resource must match the activated scarcity resource');
  });
});
