const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, TECH_TREE } = require('../../server/game-engine');

// ── Helpers ──

function makeRoom(playerCount = 1, options = {}) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { id: i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 1, maxPlayers: 4, status: 'playing', players, ...options };
}

function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

function addDistricts(colony, type, count) {
  for (let i = 0; i < count; i++) {
    colony.districts.push({ type, buildProgress: null });
  }
}

// ── _calcPopVP static method ──

describe('VP Rebalance — _calcPopVP diminishing returns', () => {
  it('0 pops = 0 VP', () => {
    assert.strictEqual(GameEngine._calcPopVP(0), 0);
  });

  it('1 pop = 2 VP (tier 1: ×2)', () => {
    assert.strictEqual(GameEngine._calcPopVP(1), 2);
  });

  it('10 pops = 20 VP (tier 1: ×2)', () => {
    assert.strictEqual(GameEngine._calcPopVP(10), 20);
  });

  it('20 pops = 40 VP (tier 1 cap: 20×2)', () => {
    assert.strictEqual(GameEngine._calcPopVP(20), 40);
  });

  it('21 pops = 42 VP (20×2 + 1×1.5 rounded)', () => {
    assert.strictEqual(GameEngine._calcPopVP(21), 42);
  });

  it('30 pops = 55 VP (40 + 10×1.5)', () => {
    assert.strictEqual(GameEngine._calcPopVP(30), 55);
  });

  it('40 pops = 70 VP (40 + 20×1.5)', () => {
    assert.strictEqual(GameEngine._calcPopVP(40), 70);
  });

  it('41 pops = 71 VP (40 + 30 + 1×1)', () => {
    assert.strictEqual(GameEngine._calcPopVP(41), 71);
  });

  it('50 pops = 80 VP (40 + 30 + 10×1)', () => {
    assert.strictEqual(GameEngine._calcPopVP(50), 80);
  });

  it('100 pops = 130 VP (40 + 30 + 60×1)', () => {
    assert.strictEqual(GameEngine._calcPopVP(100), 130);
  });
});

// ── Trait VP increase: +5 → +10 ──

describe('VP Rebalance — trait VP increased to +10', () => {
  it('1 trait = 10 VP', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = getFirstColony(engine, 1);
    colony.districts = [];
    colony.planet.type = 'barren';
    addDistricts(colony, 'mining', 4); // barren + 4 mining = Rugged Frontier trait
    colony.pops = 0;
    const state = engine.playerStates.get(1);
    state.resources.alloys = 0;
    state.resources.research = { physics: 0, society: 0, engineering: 0 };
    state.completedTechs = [];
    engine._vpCacheTick = -1;

    const bd = engine._calcVPBreakdown(1);
    assert.strictEqual(bd.traits, 1);
    assert.strictEqual(bd.traitsVP, 10);
  });

  it('3 traits = 30 VP', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    // Need 3 colonies each with a trait
    const state = engine.playerStates.get(1);
    state.resources.alloys = 0;
    state.resources.research = { physics: 0, society: 0, engineering: 0 };
    state.completedTechs = [];

    // Set up first colony with trait
    const c1 = getFirstColony(engine, 1);
    c1.districts = [];
    c1.planet.type = 'barren';
    addDistricts(c1, 'mining', 4);
    c1.pops = 0;

    // Create 2 more colonies with traits
    for (let i = 0; i < 2; i++) {
      const colId = `extra-${i}`;
      const col = {
        id: colId, ownerId: 1, name: `Colony ${i}`,
        planet: { type: 'ocean', size: 16, habitability: 60 },
        districts: [], pops: 0,
        _cachedProduction: null, _cachedJobs: null, _cachedHousing: null,
      };
      addDistricts(col, 'agriculture', 4); // ocean + 4 agri = Breadbasket trait
      engine.colonies.set(colId, col);
      engine._playerColonies.get(1).push(colId);
    }
    engine._vpCacheTick = -1;

    const bd = engine._calcVPBreakdown(1);
    assert.strictEqual(bd.traits, 3);
    assert.strictEqual(bd.traitsVP, 30);
  });
});

// ── T3 tech VP increase: +20 → +30 ──

describe('VP Rebalance — T3 tech VP increased to +30', () => {
  it('single T3 tech = +30 VP', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 0;
    state.completedTechs = ['improved_power_plants', 'advanced_reactors', 'fusion_reactors'];
    engine._vpCacheTick = -1;

    const bd = engine._calcVPBreakdown(1);
    // T1: 5, T2: 10, T3: 30 = 45
    assert.strictEqual(bd.techVP, 45);
  });

  it('all 9 techs = 135 total techVP (3×5 + 3×10 + 3×30)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 0;
    state.completedTechs = Object.keys(TECH_TREE);
    engine._vpCacheTick = -1;

    const bd = engine._calcVPBreakdown(1);
    assert.strictEqual(bd.techVP, 135);
  });

  it('T1 and T2 techs unchanged (+5 and +10)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 0;
    state.completedTechs = ['improved_power_plants']; // T1
    engine._vpCacheTick = -1;
    assert.strictEqual(engine._calcVPBreakdown(1).techVP, 5);

    state.completedTechs = ['advanced_reactors']; // T2
    engine._vpCacheTick = -1;
    assert.strictEqual(engine._calcVPBreakdown(1).techVP, 10);
  });
});

// ── Exploration VP ──

describe('VP Rebalance — exploration VP (+1 per 5 surveyed systems)', () => {
  it('0 surveyed systems = 0 exploration VP', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine._vpCacheTick = -1;

    const bd = engine._calcVPBreakdown(1);
    assert.strictEqual(bd.surveyed, 0);
    assert.strictEqual(bd.surveyedVP, 0);
  });

  it('4 surveyed systems = 0 exploration VP (below threshold)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine._surveyedSystems.set(1, new Set(['s1', 's2', 's3', 's4']));
    engine._vpCacheTick = -1;

    const bd = engine._calcVPBreakdown(1);
    assert.strictEqual(bd.surveyed, 4);
    assert.strictEqual(bd.surveyedVP, 0);
  });

  it('5 surveyed systems = 1 exploration VP', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    engine._surveyedSystems.set(1, new Set(['s1', 's2', 's3', 's4', 's5']));
    engine._vpCacheTick = -1;

    const bd = engine._calcVPBreakdown(1);
    assert.strictEqual(bd.surveyed, 5);
    assert.strictEqual(bd.surveyedVP, 1);
  });

  it('10 surveyed systems = 2 exploration VP', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const systems = new Set();
    for (let i = 0; i < 10; i++) systems.add(`s${i}`);
    engine._surveyedSystems.set(1, systems);
    engine._vpCacheTick = -1;

    const bd = engine._calcVPBreakdown(1);
    assert.strictEqual(bd.surveyed, 10);
    assert.strictEqual(bd.surveyedVP, 2);
  });

  it('23 surveyed systems = 4 exploration VP (floor)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const systems = new Set();
    for (let i = 0; i < 23; i++) systems.add(`s${i}`);
    engine._surveyedSystems.set(1, systems);
    engine._vpCacheTick = -1;

    const bd = engine._calcVPBreakdown(1);
    assert.strictEqual(bd.surveyed, 23);
    assert.strictEqual(bd.surveyedVP, 4);
  });

  it('exploration VP included in total VP', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    // Zero out other VP sources
    const colony = getFirstColony(engine, 1);
    colony.pops = 0;
    colony.districts = [];
    state.resources.alloys = 0;
    state.resources.research = { physics: 0, society: 0, engineering: 0 };
    state.completedTechs = [];

    const systems = new Set();
    for (let i = 0; i < 15; i++) systems.add(`s${i}`);
    engine._surveyedSystems.set(1, systems);
    engine._vpCacheTick = -1;

    const bd = engine._calcVPBreakdown(1);
    assert.strictEqual(bd.surveyedVP, 3);
    assert.strictEqual(bd.vp, 3); // only exploration VP, everything else zeroed
  });

  it('exploration VP in empty breakdown for unknown player', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const bd = engine._calcVPBreakdown(999);
    assert.strictEqual(bd.surveyed, 0);
    assert.strictEqual(bd.surveyedVP, 0);
  });
});

// ── Integrated VP formula ──

describe('VP Rebalance — integrated formula', () => {
  it('8 pops (starting) still gives 16 popVP (under tier 1 cap)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.playerStates.get(1);
    state.resources.alloys = 0;
    engine._vpCacheTick = -1;

    const bd = engine._calcVPBreakdown(1);
    assert.strictEqual(bd.pops, 8);
    assert.strictEqual(bd.popsVP, 16);
  });

  it('25 pops gives diminished popVP (40 + round(5×1.5) = 48)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = getFirstColony(engine, 1);
    colony.pops = 25;
    engine._vpCacheTick = -1;

    const bd = engine._calcVPBreakdown(1);
    assert.strictEqual(bd.popsVP, 48); // 20×2 + round(5×1.5) = 40 + 8
  });

  it('full VP formula: pops + districts + alloys + research + tech + traits + exploration', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = getFirstColony(engine, 1);
    colony.pops = 30;
    colony.districts = [];
    colony.planet.type = 'barren';
    addDistricts(colony, 'mining', 6);

    const state = engine.playerStates.get(1);
    state.resources.alloys = 50; // 50/25 = 2 alloysVP
    state.resources.research = { physics: 100, society: 50, engineering: 50 }; // 200/50 = 4 researchVP
    state.completedTechs = ['improved_power_plants']; // +5 techVP

    // Barren + 6 mining = Rugged Frontier trait = 10 traitsVP
    const systems = new Set();
    for (let i = 0; i < 10; i++) systems.add(`s${i}`);
    engine._surveyedSystems.set(1, systems); // 10/5 = 2 surveyedVP

    engine._vpCacheTick = -1;
    const bd = engine._calcVPBreakdown(1);

    // popVP = 40 + round(10×1.5) = 40 + 15 = 55
    assert.strictEqual(bd.popsVP, 55);
    assert.strictEqual(bd.districtsVP, 6);
    assert.strictEqual(bd.alloysVP, 2);
    assert.strictEqual(bd.researchVP, 4);
    assert.strictEqual(bd.techVP, 5);
    assert.strictEqual(bd.traitsVP, 10);
    assert.strictEqual(bd.surveyedVP, 2);
    assert.strictEqual(bd.vp, 55 + 6 + 2 + 4 + 5 + 10 + 2); // 84
  });

  it('_calcVictoryPoints matches _calcVPBreakdown.vp', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = getFirstColony(engine, 1);
    colony.pops = 45; // triggers all 3 tiers
    engine._surveyedSystems.set(1, new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g']));
    engine._vpCacheTick = -1;

    const bd = engine._calcVPBreakdown(1);
    engine._vpCacheTick = -1; // force recompute
    const vp = engine._calcVictoryPoints(1);
    assert.strictEqual(vp, bd.vp);
  });

  it('gameOver breakdown includes surveyed and surveyedVP', () => {
    let gameOverData = null;
    const engine = new GameEngine(makeRoom(1), {
      tickRate: 10,
      onGameOver: (data) => { gameOverData = data; },
    });
    engine._surveyedSystems.set(1, new Set(['s1', 's2', 's3', 's4', 's5']));
    engine._triggerGameOver();

    assert.ok(gameOverData);
    const bd = gameOverData.scores[0].breakdown;
    assert.strictEqual(bd.surveyed, 5);
    assert.strictEqual(bd.surveyedVP, 1);
  });
});
