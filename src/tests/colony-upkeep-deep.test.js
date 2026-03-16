const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { GameEngine, COLONY_UPKEEP, MONTH_TICKS, DISTRICT_DEFS } = require('../../server/game-engine');

function makeRoom(playerCount = 1) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set('p' + i, { id: 'p' + i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 'p1', maxPlayers: 8, status: 'playing', players, matchTimer: 0 };
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

function stripColony(colony, engine) {
  colony.districts = [];
  colony.buildings = [];
  colony.pops = 0;
  engine._invalidateColonyCache(colony);
}

function setEnergy(engine, playerId, amount) {
  engine.playerStates.get(playerId).resources.energy = amount;
}

function getEnergy(engine, playerId) {
  return engine.playerStates.get(playerId).resources.energy;
}

describe('Colony Upkeep — Broadcast Payload', () => {
  it('upkeep should appear in getPlayerStateJSON income.energy', () => {
    const engine = makeEngine();
    const c1 = getColony(engine, 'p1');
    stripColony(c1, engine);

    const c2 = addColony(engine, 'p1');
    stripColony(c2, engine);

    const json = engine.getPlayerStateJSON('p1');
    const state = JSON.parse(json);
    const me = state.players[0];

    // 2 colonies, no districts/buildings/pops — income.energy should be -3 (upkeep only)
    assert.strictEqual(me.income.energy, -3, 'broadcast payload should include colony upkeep in income.energy');
  });

  it('upkeep should combine with district production in broadcast income', () => {
    const engine = makeEngine();
    const c1 = getColony(engine, 'p1');
    // Use continental type to avoid planet-type energy bonuses (arid gives +1 per generator)
    c1.planet.type = 'continental';
    // Keep one generator district, strip everything else
    c1.districts = [{ type: 'generator', disabled: false }];
    c1.buildings = [];
    c1.pops = 1; // need 1 pop to work the district
    engine._invalidateColonyCache(c1);

    const c2 = addColony(engine, 'p1');
    stripColony(c2, engine);

    const genDef = DISTRICT_DEFS.generator;
    const expectedProd = genDef.produces.energy - (genDef.consumes.energy || 0);

    const json = engine.getPlayerStateJSON('p1');
    const state = JSON.parse(json);
    const me = state.players[0];

    // income = generator production - 3 upkeep
    assert.strictEqual(me.income.energy, expectedProd - 3,
      'income.energy should reflect both district production and colony upkeep');
  });

  it('other players summary should include their upkeep in income', () => {
    const engine = makeEngine(2);

    // Strip all colonies for both players
    const c1 = getColony(engine, 'p1');
    stripColony(c1, engine);
    const ids2 = engine._playerColonies.get('p2');
    const c2 = engine.colonies.get(ids2[0]);
    stripColony(c2, engine);

    // Give p2 a second colony
    const c2b = addColony(engine, 'p2');
    stripColony(c2b, engine);

    // Get state from p1's perspective — p2 should appear as other with upkeep
    const json = engine.getPlayerStateJSON('p1');
    const state = JSON.parse(json);
    const p2Data = state.players.find(p => p.id === 'p2');

    assert.strictEqual(p2Data.income.energy, -3,
      'other player summary should include colony upkeep');
  });
});

describe('Colony Upkeep — Energy Deficit Cascade', () => {
  it('upkeep-induced deficit should trigger district disabling on next monthly tick', () => {
    const engine = makeEngine();
    const c1 = getColony(engine, 'p1');
    // Keep an industrial district (consumes 3 energy) so deficit system has something to disable
    // Note: mining districts consume 0 energy so the deficit handler can't disable them
    c1.districts = [{ type: 'industrial', disabled: false }];
    c1.buildings = [];
    c1.pops = 1;
    engine._invalidateColonyCache(c1);

    // Add 4 more colonies (5 total = 51 upkeep)
    for (let i = 0; i < 4; i++) {
      const c = addColony(engine, 'p1');
      stripColony(c, engine);
    }

    // Set energy just barely positive — upkeep will push it far negative
    setEnergy(engine, 'p1', 5);

    // Process monthly cycle: resources first, then deficit
    engine._processMonthlyResources();
    engine._processEnergyDeficit();

    // Energy should be negative (5 - 51 = -46 minus industrial consumption)
    assert.ok(getEnergy(engine, 'p1') < 0, 'energy should be negative after upkeep');

    // The industrial district should be disabled by the deficit handler
    const industrialDistrict = c1.districts.find(d => d.type === 'industrial');
    assert.strictEqual(industrialDistrict.disabled, true,
      'deficit handler should disable energy-consuming districts after upkeep pushes energy negative');
  });
});

describe('Colony Upkeep — Tick Integration', () => {
  it('upkeep should be deducted at month boundary (tick 100)', () => {
    const engine = makeEngine();
    const c1 = getColony(engine, 'p1');
    stripColony(c1, engine);

    const c2 = addColony(engine, 'p1');
    stripColony(c2, engine);

    setEnergy(engine, 'p1', 10000);

    // Advance to just before month boundary
    engine.tickCount = MONTH_TICKS - 1;
    engine.tick();
    // Tick at MONTH_TICKS - 1 doesn't trigger monthly processing
    // (tick() increments tickCount then checks)

    const beforeMonth = getEnergy(engine, 'p1');

    // Now tick into the month boundary
    // tickCount is now MONTH_TICKS after the previous tick incremented it
    // but monthly fires when tickCount % MONTH_TICKS === 0
    // Let's just set tickCount to MONTH_TICKS - 1 and tick once
    engine.tickCount = MONTH_TICKS - 1;
    setEnergy(engine, 'p1', 10000);
    engine.tick(); // tickCount becomes MONTH_TICKS, triggers monthly

    // 2 colonies = 3 upkeep
    assert.strictEqual(getEnergy(engine, 'p1'), 10000 - 3,
      'upkeep should be applied at month boundary tick');
  });

  it('upkeep should NOT be deducted on non-month ticks', () => {
    const engine = makeEngine();
    const c1 = getColony(engine, 'p1');
    stripColony(c1, engine);

    const c2 = addColony(engine, 'p1');
    stripColony(c2, engine);

    setEnergy(engine, 'p1', 10000);

    // Tick at a non-month boundary
    engine.tickCount = 49;
    engine.tick(); // tickCount becomes 50, not a month boundary

    assert.strictEqual(getEnergy(engine, 'p1'), 10000,
      'no upkeep should be deducted on non-month ticks');
  });
});

describe('Colony Upkeep — Summary Cache Invalidation', () => {
  it('adding a colony should change the summary on next call', () => {
    const engine = makeEngine();
    const c1 = getColony(engine, 'p1');
    stripColony(c1, engine);

    // Get summary with 1 colony
    const summary1 = engine._getPlayerSummary('p1');
    assert.strictEqual(summary1.income.energy, 0, '1 colony = 0 upkeep');

    // Add a colony — summary cache should be stale
    const c2 = addColony(engine, 'p1');
    stripColony(c2, engine);

    // Invalidate state cache (as _createColony does)
    engine._invalidateStateCache();
    // Advance tick so summary cache is invalidated (cached per tick)
    engine._summaryCacheTick = -1;

    const summary2 = engine._getPlayerSummary('p1');
    assert.strictEqual(summary2.income.energy, -3, '2 colonies = -3 upkeep after cache invalidation');
  });
});

describe('Colony Upkeep — 7+ Colony Stress', () => {
  it('7 colonies should cost 3+8+15+25+25+25=101 energy/month', () => {
    const engine = makeEngine();
    const c1 = getColony(engine, 'p1');
    stripColony(c1, engine);

    for (let i = 0; i < 6; i++) {
      const c = addColony(engine, 'p1');
      stripColony(c, engine);
    }

    setEnergy(engine, 'p1', 10000);
    engine._processMonthlyResources();

    // 7 colonies: indices 1-6 → UPKEEP[1]+[2]+[3]+[4]+[4]+[4] = 3+8+15+25+25+25 = 101
    assert.strictEqual(10000 - getEnergy(engine, 'p1'), 101,
      '7 colonies should cost 101 energy/month');
  });

  it('10 colonies should cap each extra at 25', () => {
    const engine = makeEngine();
    const c1 = getColony(engine, 'p1');
    stripColony(c1, engine);

    for (let i = 0; i < 9; i++) {
      const c = addColony(engine, 'p1');
      stripColony(c, engine);
    }

    setEnergy(engine, 'p1', 10000);
    engine._processMonthlyResources();

    // 10 colonies: 3+8+15+25*6 = 176
    assert.strictEqual(10000 - getEnergy(engine, 'p1'), 176,
      '10 colonies should cost 176 energy/month (capped at 25 per extra)');
  });
});

describe('Colony Upkeep — Upkeep + Production Combined', () => {
  it('net energy should be production minus upkeep', () => {
    const engine = makeEngine();
    const c1 = getColony(engine, 'p1');
    // Use continental type to avoid planet-type energy bonuses (arid gives +1 per generator)
    c1.planet.type = 'continental';
    // Give colony1 three generator districts
    c1.districts = [
      { type: 'generator', disabled: false },
      { type: 'generator', disabled: false },
      { type: 'generator', disabled: false },
    ];
    c1.buildings = [];
    c1.pops = 3;
    engine._invalidateColonyCache(c1);

    const c2 = addColony(engine, 'p1');
    stripColony(c2, engine);

    setEnergy(engine, 'p1', 10000);
    engine._processMonthlyResources();

    const genDef = DISTRICT_DEFS.generator;
    const genNet = genDef.produces.energy - (genDef.consumes.energy || 0);
    const expectedProduction = genNet * 3; // 3 generator districts
    const upkeep = 3; // 2 colonies

    assert.strictEqual(getEnergy(engine, 'p1'), 10000 + expectedProduction - upkeep,
      'energy should reflect both generator production and colony upkeep');
  });

  it('upkeep should be deducted even when production is positive', () => {
    const engine = makeEngine();
    const c1 = getColony(engine, 'p1');
    c1.districts = [{ type: 'generator', disabled: false }];
    c1.buildings = [];
    c1.pops = 1;
    // Force continental type to avoid planet bonus variance from random planet types
    c1.planet.type = 'continental';
    engine._invalidateColonyCache(c1);

    // 3 colonies = 11 upkeep (COLONY_UPKEEP[1] + COLONY_UPKEEP[2] = 3 + 8)
    for (let i = 0; i < 2; i++) {
      const c = addColony(engine, 'p1');
      stripColony(c, engine);
    }

    const summary = engine._getPlayerSummary('p1');
    const genDef = DISTRICT_DEFS.generator;
    const genNet = genDef.produces.energy - (genDef.consumes.energy || 0);

    assert.strictEqual(summary.income.energy, genNet - 11,
      'summary income should show production minus upkeep (3 colonies = 11)');
  });
});

describe('Colony Upkeep — Multi-Player Independence (deep)', () => {
  it('3 players with different colony counts pay independent upkeep', () => {
    const engine = makeEngine(3);

    // Strip all starting colonies
    for (const pid of ['p1', 'p2', 'p3']) {
      const ids = engine._playerColonies.get(pid);
      const c = engine.colonies.get(ids[0]);
      stripColony(c, engine);
      setEnergy(engine, pid, 10000);
    }

    // p1: 1 colony (0 upkeep)
    // p2: 3 colonies (11 upkeep)
    for (let i = 0; i < 2; i++) {
      const c = addColony(engine, 'p2');
      stripColony(c, engine);
    }
    // p3: 5 colonies (51 upkeep)
    for (let i = 0; i < 4; i++) {
      const c = addColony(engine, 'p3');
      stripColony(c, engine);
    }

    engine._processMonthlyResources();

    assert.strictEqual(getEnergy(engine, 'p1'), 10000, 'p1 (1 colony) pays 0 upkeep');
    assert.strictEqual(getEnergy(engine, 'p2'), 10000 - 11, 'p2 (3 colonies) pays 11 upkeep');
    assert.strictEqual(getEnergy(engine, 'p3'), 10000 - 51, 'p3 (5 colonies) pays 51 upkeep');
  });
});

describe('Colony Upkeep — Edge Cases', () => {
  it('player with 0 colonies should not crash', () => {
    const engine = makeEngine();
    // Remove all colonies from player
    const ids = engine._playerColonies.get('p1');
    for (const id of [...ids]) {
      engine.colonies.delete(id);
    }
    engine._playerColonies.set('p1', []);

    setEnergy(engine, 'p1', 10000);
    // Should not throw
    engine._processMonthlyResources();
    assert.strictEqual(getEnergy(engine, 'p1'), 10000, '0 colonies = 0 upkeep, no crash');
  });

  it('upkeep with exactly 0 energy should go negative', () => {
    const engine = makeEngine();
    const c1 = getColony(engine, 'p1');
    stripColony(c1, engine);

    const c2 = addColony(engine, 'p1');
    stripColony(c2, engine);

    setEnergy(engine, 'p1', 0);
    engine._processMonthlyResources();

    assert.strictEqual(getEnergy(engine, 'p1'), -3, 'upkeep from 0 energy should go to -3');
  });

  it('upkeep with already-negative energy should stack', () => {
    const engine = makeEngine();
    const c1 = getColony(engine, 'p1');
    stripColony(c1, engine);

    const c2 = addColony(engine, 'p1');
    stripColony(c2, engine);

    setEnergy(engine, 'p1', -10);
    engine._processMonthlyResources();

    assert.strictEqual(getEnergy(engine, 'p1'), -13, 'upkeep should stack on negative energy');
  });
});
