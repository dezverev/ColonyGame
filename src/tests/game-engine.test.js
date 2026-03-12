const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, UNIT_DEFS, calcDamage } = require('../../server/game-engine');

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

describe('UNIT_DEFS', () => {
  it('has all four unit types with required fields', () => {
    const requiredFields = ['hp', 'atk', 'armor', 'speed', 'range', 'cooldown', 'cost', 'supplyCost', 'bonusVs'];
    for (const type of ['worker', 'soldier', 'archer', 'cavalry']) {
      assert.ok(UNIT_DEFS[type], `Missing unit def: ${type}`);
      for (const field of requiredFields) {
        assert.ok(field in UNIT_DEFS[type], `${type} missing field: ${field}`);
      }
    }
  });

  it('has correct stat values per design spec', () => {
    assert.strictEqual(UNIT_DEFS.soldier.armor, 2);
    assert.strictEqual(UNIT_DEFS.archer.range, 5);
    assert.strictEqual(UNIT_DEFS.cavalry.speed, 3.5);
    assert.strictEqual(UNIT_DEFS.cavalry.supplyCost, 2);
    assert.strictEqual(UNIT_DEFS.worker.armor, 0);
  });

  it('costs are gold/wood/stone objects', () => {
    for (const type of ['worker', 'soldier', 'archer', 'cavalry']) {
      const cost = UNIT_DEFS[type].cost;
      assert.ok(Number.isFinite(cost.gold));
      assert.ok(Number.isFinite(cost.wood));
      assert.ok(Number.isFinite(cost.stone));
    }
  });
});

describe('calcDamage', () => {
  it('soldier vs archer has 1.5x bonus', () => {
    // soldier: 10 atk * 1.5 bonus - 0 armor = 15
    assert.strictEqual(calcDamage('soldier', 'archer'), 15);
  });

  it('archer vs cavalry has 1.5x bonus', () => {
    // archer: 8 atk * 1.5 bonus - 1 armor = 11
    assert.strictEqual(calcDamage('archer', 'cavalry'), 11);
  });

  it('cavalry vs soldier has 1.5x bonus', () => {
    // cavalry: 12 atk * 1.5 bonus - 2 armor = 16
    assert.strictEqual(calcDamage('cavalry', 'soldier'), 16);
  });

  it('worker vs military has 0.5x penalty', () => {
    // worker: 3 atk * 0.5 - 2 armor = max(1, -0.5) = 1
    assert.strictEqual(calcDamage('worker', 'soldier'), 1);
  });

  it('no bonus is 1.0x multiplier', () => {
    // soldier vs soldier: 10 atk * 1.0 - 2 armor = 8
    assert.strictEqual(calcDamage('soldier', 'soldier'), 8);
  });

  it('damage is at least 1', () => {
    // worker vs soldier: 3 * 0.5 - 2 = -0.5 -> max(1, ...) = 1
    assert.ok(calcDamage('worker', 'soldier') >= 1);
  });
});

describe('Unit creation with expanded stats', () => {
  it('units have armor, range, and cooldown fields', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getState();
    for (const unit of state.units) {
      assert.ok('armor' in unit, `Unit ${unit.id} missing armor`);
      assert.ok('range' in unit, `Unit ${unit.id} missing range`);
      assert.ok('cooldown' in unit, `Unit ${unit.id} missing cooldown`);
    }
  });

  it('creates cavalry with correct stats', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const cav = engine._createUnit(1, 'cavalry', 10, 10);
    assert.strictEqual(cav.hp, 70);
    assert.strictEqual(cav.atk, 12);
    assert.strictEqual(cav.armor, 1);
    assert.strictEqual(cav.speed, 3.5);
    assert.strictEqual(cav.range, 1);
    assert.strictEqual(cav.cooldown, 1.3);
  });

  it('unknown unit type falls back to worker', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const unit = engine._createUnit(1, 'dragon', 10, 10);
    assert.strictEqual(unit.hp, UNIT_DEFS.worker.hp);
    assert.strictEqual(unit.type, 'dragon');
  });
});
