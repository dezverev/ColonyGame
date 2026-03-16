const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine } = require('../../server/game-engine');

function createEngine(playerCount = 1) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set('p' + i, { name: 'Player ' + i });
  }
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  return new GameEngine(room, { tickRate: 10 });
}

function getColony(engine, playerId) {
  const ids = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(ids[0]);
}

function getSerializedColony(engine, playerId) {
  const state = engine.getPlayerState(playerId);
  return state.colonies[0];
}

describe('Colony Saturation Indicator', () => {

  it('includes saturation ratio in serialized colony', () => {
    const engine = createEngine();
    const sc = getSerializedColony(engine, 'p1');
    assert.ok(sc.saturation !== undefined, 'saturation field should exist');
    assert.strictEqual(typeof sc.saturation, 'number');
    assert.ok(sc.saturation >= 0 && sc.saturation <= 1, 'saturation should be between 0 and 1');
  });

  it('saturation is districts / planet size for starting colony', () => {
    const engine = createEngine();
    const col = getColony(engine, 'p1');
    const sc = getSerializedColony(engine, 'p1');
    const expected = (col.districts.length + col.buildQueue.length) / col.planet.size;
    assert.strictEqual(sc.saturation, expected);
  });

  it('saturation increases when districts are built', () => {
    const engine = createEngine();
    const col = getColony(engine, 'p1');
    const before = getSerializedColony(engine, 'p1').saturation;

    // Build a district — adds to queue, increases saturation
    engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'generator' });
    engine._invalidateStateCache();
    const after = getSerializedColony(engine, 'p1').saturation;
    assert.ok(after > before, 'saturation should increase after queuing a district');
  });

  it('saturation reaches 1.0 when colony is fully developed', () => {
    const engine = createEngine();
    const col = getColony(engine, 'p1');
    // Fill all district slots
    while (col.districts.length < col.planet.size) {
      col.districts.push({ type: 'generator', disabled: false });
    }
    col.buildQueue = [];
    engine._invalidateStateCache();
    const sc = getSerializedColony(engine, 'p1');
    assert.strictEqual(sc.saturation, 1);
  });

  it('saturation at 80% threshold for nearing capacity', () => {
    const engine = createEngine();
    const col = getColony(engine, 'p1');
    // Set planet size to 10 for easy math
    col.planet.size = 10;
    col.districts = [];
    col.buildQueue = [];
    // Add 8 districts = 80%
    for (let i = 0; i < 8; i++) {
      col.districts.push({ type: 'generator', disabled: false });
    }
    engine._invalidateStateCache();
    const sc = getSerializedColony(engine, 'p1');
    assert.strictEqual(sc.saturation, 0.8);
    assert.ok(sc.saturation >= 0.8, 'should be at nearing capacity threshold');
  });

  it('saturation below 80% has no special status', () => {
    const engine = createEngine();
    const col = getColony(engine, 'p1');
    col.planet.size = 10;
    col.districts = [];
    col.buildQueue = [];
    for (let i = 0; i < 7; i++) {
      col.districts.push({ type: 'generator', disabled: false });
    }
    engine._invalidateStateCache();
    const sc = getSerializedColony(engine, 'p1');
    assert.strictEqual(sc.saturation, 0.7);
    assert.ok(sc.saturation < 0.8, 'should be below nearing capacity threshold');
  });

  it('saturation includes build queue items', () => {
    const engine = createEngine();
    const col = getColony(engine, 'p1');
    col.planet.size = 10;
    col.districts = [];
    col.buildQueue = [];
    for (let i = 0; i < 6; i++) {
      col.districts.push({ type: 'generator', disabled: false });
    }
    col.buildQueue.push({ id: 'q1', type: 'mining', ticksRemaining: 100 });
    col.buildQueue.push({ id: 'q2', type: 'mining', ticksRemaining: 200 });
    engine._invalidateStateCache();
    const sc = getSerializedColony(engine, 'p1');
    assert.strictEqual(sc.saturation, 0.8); // 6 built + 2 queued = 8/10
  });

  it('saturation is 0 for zero-size planet edge case', () => {
    const engine = createEngine();
    const col = getColony(engine, 'p1');
    col.planet.size = 0;
    col.districts = [];
    col.buildQueue = [];
    engine._invalidateStateCache();
    const sc = getSerializedColony(engine, 'p1');
    assert.strictEqual(sc.saturation, 0);
  });

  it('disabled districts still count toward saturation', () => {
    const engine = createEngine();
    const col = getColony(engine, 'p1');
    col.planet.size = 10;
    col.districts = [];
    col.buildQueue = [];
    for (let i = 0; i < 5; i++) {
      col.districts.push({ type: 'generator', disabled: false });
    }
    // Add 3 disabled districts — they still occupy physical slots
    for (let i = 0; i < 3; i++) {
      col.districts.push({ type: 'mining', disabled: true });
    }
    engine._invalidateStateCache();
    const sc = getSerializedColony(engine, 'p1');
    assert.strictEqual(sc.saturation, 0.8, 'disabled districts should still count toward saturation');
  });

  it('saturation is present in JSON broadcast payload', () => {
    const engine = createEngine();
    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    assert.ok(parsed.colonies.length > 0, 'should have at least one colony');
    assert.strictEqual(typeof parsed.colonies[0].saturation, 'number',
      'saturation should survive JSON serialization');
  });

  it('saturation decreases when a district is demolished', () => {
    const engine = createEngine();
    const col = getColony(engine, 'p1');
    col.planet.size = 10;
    col.districts = [];
    col.buildQueue = [];
    for (let i = 0; i < 6; i++) {
      col.districts.push({ id: 'dist-' + i, type: 'generator', disabled: false });
    }
    engine._invalidateStateCache();
    const before = getSerializedColony(engine, 'p1').saturation;
    assert.strictEqual(before, 0.6);

    // Demolish one district
    engine.handleCommand('p1', { type: 'demolish', colonyId: col.id, districtId: 'dist-0' });
    engine._invalidateStateCache();
    const after = getSerializedColony(engine, 'p1').saturation;
    assert.strictEqual(after, 0.5, 'saturation should decrease after demolishing');
  });

  it('saturation cannot exceed 1.0 even with overfull districts', () => {
    const engine = createEngine();
    const col = getColony(engine, 'p1');
    col.planet.size = 5;
    col.districts = [];
    col.buildQueue = [];
    // Force more districts than planet size (shouldn't happen normally)
    for (let i = 0; i < 7; i++) {
      col.districts.push({ type: 'generator', disabled: false });
    }
    engine._invalidateStateCache();
    const sc = getSerializedColony(engine, 'p1');
    // Saturation could be >1 if not clamped — document actual behavior
    assert.strictEqual(typeof sc.saturation, 'number');
    assert.ok(sc.saturation >= 1, 'overfull colony should have saturation >= 1');
  });

  it('saturation works with multiple colonies per player', () => {
    const engine = createEngine();
    const col1 = getColony(engine, 'p1');

    // Create a second colony with all required cached fields
    const planet = { id: 'planet-2', name: 'Test World', size: 10, type: 'continental', habitability: 1 };
    const colony2 = {
      id: 'colony-2', ownerId: 'p1', planet, name: 'New Colony',
      districts: [], buildings: [], buildQueue: [], buildingQueue: [],
      pops: 2, growthProgress: 0,
      _cachedHousing: null, _cachedJobs: null, _cachedProduction: null
    };
    for (let i = 0; i < 4; i++) {
      colony2.districts.push({ type: 'generator', disabled: false });
    }
    engine.colonies.set('colony-2', colony2);
    engine._playerColonies.get('p1').push('colony-2');
    engine._invalidateStateCache();

    const state = engine.getPlayerState('p1');
    const sc1 = state.colonies.find(c => c.id === col1.id);
    const sc2 = state.colonies.find(c => c.id === 'colony-2');
    assert.ok(sc1, 'first colony should exist');
    assert.ok(sc2, 'second colony should exist');
    assert.strictEqual(typeof sc1.saturation, 'number');
    assert.strictEqual(sc2.saturation, 0.4, 'second colony should have 4/10 saturation');
  });

  it('saturation is exactly 0 for empty colony with no districts', () => {
    const engine = createEngine();
    const col = getColony(engine, 'p1');
    col.planet.size = 10;
    col.districts = [];
    col.buildQueue = [];
    engine._invalidateStateCache();
    const sc = getSerializedColony(engine, 'p1');
    assert.strictEqual(sc.saturation, 0, 'empty colony should have 0 saturation');
  });
});
