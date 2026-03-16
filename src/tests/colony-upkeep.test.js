const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { GameEngine, COLONY_UPKEEP, MONTH_TICKS } = require('../../server/game-engine');

function makeRoom(playerCount = 1) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set('p' + i, { id: 'p' + i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 'p1', maxPlayers: 4, status: 'playing', players, matchTimer: 0 };
}

function makeEngine(playerCount = 1) {
  const engine = new GameEngine(makeRoom(playerCount), { tickRate: 10 });
  engine.start();
  return engine;
}

function getColony(engine, playerId = 'p1') {
  const ids = engine._playerColonies.get(playerId);
  return engine.colonies.get(ids[0]);
}

function addColony(engine, playerId) {
  // Find a habitable planet not already colonized
  for (const system of engine.galaxy.systems) {
    for (const planet of system.planets) {
      if (planet.habitability > 0 && !planet.colonized) {
        planet.colonized = true;
        return engine._createColony(playerId, 'Colony ' + Math.random().toString(36).slice(2, 6), planet, system.id);
      }
    }
  }
  throw new Error('No habitable planet found');
}

function setEnergy(engine, playerId, amount) {
  engine.playerStates.get(playerId).resources.energy = amount;
}

function getEnergy(engine, playerId) {
  return engine.playerStates.get(playerId).resources.energy;
}

describe('Colony Upkeep Constants', () => {
  it('COLONY_UPKEEP should define costs for 5 colony tiers', () => {
    assert.deepStrictEqual(COLONY_UPKEEP, [0, 3, 8, 15, 25]);
  });
});

describe('Colony Upkeep Scaling', () => {
  let engine;

  beforeEach(() => {
    engine = makeEngine();
  });

  it('1 colony should have zero upkeep', () => {
    // Player starts with 1 colony — set energy high and process monthly
    setEnergy(engine, 'p1', 10000);
    // Zero out all districts to isolate upkeep (remove production/consumption noise)
    const colony = getColony(engine, 'p1');
    colony.districts = [];
    colony.buildings = [];
    colony.pops = 0;
    engine._invalidateColonyCache(colony);

    const before = getEnergy(engine, 'p1');
    engine._processMonthlyResources();
    const after = getEnergy(engine, 'p1');

    // No colony upkeep for 1 colony — energy change should be 0 from upkeep
    // (no districts means no production/consumption either)
    assert.strictEqual(after, before);
  });

  it('2 colonies should cost 3 energy/month upkeep', () => {
    const colony1 = getColony(engine, 'p1');
    colony1.districts = [];
    colony1.buildings = [];
    colony1.pops = 0;
    engine._invalidateColonyCache(colony1);

    const colony2 = addColony(engine, 'p1');
    colony2.districts = [];
    colony2.buildings = [];
    colony2.pops = 0;
    engine._invalidateColonyCache(colony2);

    setEnergy(engine, 'p1', 10000);
    const before = getEnergy(engine, 'p1');
    engine._processMonthlyResources();
    const after = getEnergy(engine, 'p1');

    assert.strictEqual(before - after, 3);
  });

  it('3 colonies should cost 3+8=11 energy/month upkeep', () => {
    const colony1 = getColony(engine, 'p1');
    colony1.districts = [];
    colony1.buildings = [];
    colony1.pops = 0;
    engine._invalidateColonyCache(colony1);

    for (let i = 0; i < 2; i++) {
      const c = addColony(engine, 'p1');
      c.districts = [];
      c.buildings = [];
      c.pops = 0;
      engine._invalidateColonyCache(c);
    }

    setEnergy(engine, 'p1', 10000);
    const before = getEnergy(engine, 'p1');
    engine._processMonthlyResources();
    const after = getEnergy(engine, 'p1');

    assert.strictEqual(before - after, 11); // 3 + 8
  });

  it('4 colonies should cost 3+8+15=26 energy/month upkeep', () => {
    const colony1 = getColony(engine, 'p1');
    colony1.districts = [];
    colony1.buildings = [];
    colony1.pops = 0;
    engine._invalidateColonyCache(colony1);

    for (let i = 0; i < 3; i++) {
      const c = addColony(engine, 'p1');
      c.districts = [];
      c.buildings = [];
      c.pops = 0;
      engine._invalidateColonyCache(c);
    }

    setEnergy(engine, 'p1', 10000);
    const before = getEnergy(engine, 'p1');
    engine._processMonthlyResources();
    const after = getEnergy(engine, 'p1');

    assert.strictEqual(before - after, 26); // 3 + 8 + 15
  });

  it('5 colonies should cost 3+8+15+25=51 energy/month upkeep', () => {
    const colony1 = getColony(engine, 'p1');
    colony1.districts = [];
    colony1.buildings = [];
    colony1.pops = 0;
    engine._invalidateColonyCache(colony1);

    for (let i = 0; i < 4; i++) {
      const c = addColony(engine, 'p1');
      c.districts = [];
      c.buildings = [];
      c.pops = 0;
      engine._invalidateColonyCache(c);
    }

    setEnergy(engine, 'p1', 10000);
    const before = getEnergy(engine, 'p1');
    engine._processMonthlyResources();
    const after = getEnergy(engine, 'p1');

    assert.strictEqual(before - after, 51); // 3 + 8 + 15 + 25
  });

  it('colony upkeep can push energy negative (deficit system handles it)', () => {
    const colony1 = getColony(engine, 'p1');
    colony1.districts = [];
    colony1.buildings = [];
    colony1.pops = 0;
    engine._invalidateColonyCache(colony1);

    for (let i = 0; i < 4; i++) {
      const c = addColony(engine, 'p1');
      c.districts = [];
      c.buildings = [];
      c.pops = 0;
      engine._invalidateColonyCache(c);
    }

    setEnergy(engine, 'p1', 10); // Only 10 energy, upkeep is 51
    engine._processMonthlyResources();

    assert.strictEqual(getEnergy(engine, 'p1'), 10 - 51);
    assert.ok(getEnergy(engine, 'p1') < 0);
  });

  it('colony upkeep should appear in income summary (getPlayerSummary)', () => {
    const colony1 = getColony(engine, 'p1');
    colony1.districts = [];
    colony1.buildings = [];
    colony1.pops = 0;
    engine._invalidateColonyCache(colony1);

    const colony2 = addColony(engine, 'p1');
    colony2.districts = [];
    colony2.buildings = [];
    colony2.pops = 0;
    engine._invalidateColonyCache(colony2);

    const summary = engine._getPlayerSummary('p1');
    // 2 colonies: upkeep = 3, no districts = no production/consumption
    assert.strictEqual(summary.income.energy, -3);
  });

  it('6+ colonies should cap at COLONY_UPKEEP[4]=25 per extra colony', () => {
    const colony1 = getColony(engine, 'p1');
    colony1.districts = [];
    colony1.buildings = [];
    colony1.pops = 0;
    engine._invalidateColonyCache(colony1);

    for (let i = 0; i < 5; i++) {
      const c = addColony(engine, 'p1');
      c.districts = [];
      c.buildings = [];
      c.pops = 0;
      engine._invalidateColonyCache(c);
    }

    setEnergy(engine, 'p1', 10000);
    const before = getEnergy(engine, 'p1');
    engine._processMonthlyResources();
    const after = getEnergy(engine, 'p1');

    // 6 colonies: 3 + 8 + 15 + 25 + 25 = 76
    assert.strictEqual(before - after, 76);
  });

  it('different players have independent colony upkeep', () => {
    const engine2 = makeEngine(2);

    // p1: strip starting colony
    const c1 = getColony(engine2, 'p1');
    c1.districts = [];
    c1.buildings = [];
    c1.pops = 0;
    engine2._invalidateColonyCache(c1);

    // p2: strip starting colony + add 1 more
    const ids2 = engine2._playerColonies.get('p2');
    const c2 = engine2.colonies.get(ids2[0]);
    c2.districts = [];
    c2.buildings = [];
    c2.pops = 0;
    engine2._invalidateColonyCache(c2);

    const c2b = addColony(engine2, 'p2');
    c2b.districts = [];
    c2b.buildings = [];
    c2b.pops = 0;
    engine2._invalidateColonyCache(c2b);

    setEnergy(engine2, 'p1', 10000);
    setEnergy(engine2, 'p2', 10000);

    engine2._processMonthlyResources();

    // p1 has 1 colony = 0 upkeep, p2 has 2 colonies = 3 upkeep
    assert.strictEqual(getEnergy(engine2, 'p1'), 10000);
    assert.strictEqual(getEnergy(engine2, 'p2'), 10000 - 3);
  });
});
