const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine } = require('../../server/game-engine');

function makeRoom(playerCount = 2) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { id: i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 1, maxPlayers: 4, map: 'default', status: 'playing', players };
}

describe('GameEngine', () => {
  it('initializes with player states and starting units', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const state = engine.getInitState();
    assert.strictEqual(state.mapWidth, 50);
    assert.strictEqual(state.players.length, 2);
    assert.ok(state.units.length >= 6); // 3 workers per player
    assert.ok(state.buildings.length >= 2); // 1 townhall per player
  });

  it('assigns different colors to players', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const state = engine.getState();
    const colors = state.players.map(p => p.color);
    assert.notStrictEqual(colors[0], colors[1]);
  });

  it('creates starting resources', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const state = engine.getState();
    for (const p of state.players) {
      assert.strictEqual(p.gold, 200);
      assert.strictEqual(p.wood, 100);
      assert.strictEqual(p.stone, 50);
    }
  });

  it('moves units toward target', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    const unit = state.units[0];
    const startX = unit.x;
    engine.handleCommand(1, { type: 'moveUnits', unitIds: [unit.id], targetX: startX + 10, targetY: unit.y });
    engine.tick();
    const after = engine.getState();
    const movedUnit = after.units.find(u => u.id === unit.id);
    assert.ok(movedUnit.x > startX);
  });

  it('rejects commands for units owned by other players', () => {
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const state = engine.getState();
    const p1Unit = state.units.find(u => u.ownerId === 1);
    engine.handleCommand(2, { type: 'moveUnits', unitIds: [p1Unit.id], targetX: 0, targetY: 0 });
    engine.tick();
    const after = engine.getState();
    const unit = after.units.find(u => u.id === p1Unit.id);
    assert.strictEqual(unit.state, 'idle');
  });

  it('validates numeric inputs', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    const unit = state.units[0];
    // Should not crash on NaN
    engine.handleCommand(1, { type: 'moveUnits', unitIds: [unit.id], targetX: NaN, targetY: 0 });
    engine.tick();
    const after = engine.getState();
    const u = after.units.find(u => u.id === unit.id);
    assert.strictEqual(u.state, 'idle');
  });

  it('unit arrives at destination', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    const unit = state.units[0];
    engine.handleCommand(1, { type: 'moveUnits', unitIds: [unit.id], targetX: unit.x + 0.05, targetY: unit.y });
    engine.tick();
    const after = engine.getState();
    const u = after.units.find(u => u.id === unit.id);
    assert.strictEqual(u.state, 'idle');
  });

  it('start/stop tick loop', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 100 });
    engine.start();
    assert.ok(engine.tickInterval);
    engine.stop();
    assert.strictEqual(engine.tickInterval, null);
  });
});
