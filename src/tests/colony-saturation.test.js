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
});
