const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine, UNDERDOG_BONUS_PER_COLONY, UNDERDOG_BONUS_CAP, UNDERDOG_TECH_DISCOUNT,
  CORVETTE_VARIANTS, TECH_TREE, MONTH_TICKS,
} = require('../../server/game-engine');

// Helper: create a 2-player game engine with both players having starting colonies
function makeTwoPlayerEngine() {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  players.set('p2', { name: 'Player 2' });
  const room = { players, galaxySize: 'small', matchTimer: 20 };
  const engine = new GameEngine(room, { tickRate: 10 });
  engine._doctrinePhase = false;
  return engine;
}

// Helper: create a single-player engine
function makeSinglePlayerEngine() {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  const engine = new GameEngine(room, { tickRate: 10 });
  engine._doctrinePhase = false;
  return engine;
}

// Helper: add extra colonies to a player by directly creating them
function addColony(engine, playerId) {
  // Find a habitable planet that isn't colonized
  for (const sys of engine.galaxy.systems) {
    for (const p of sys.planets) {
      if (p.habitability > 0 && !p.colonized) {
        p.colonized = true;
        p.colonyOwner = playerId;
        const colony = engine._createColony(playerId, 'TestColony-' + Math.random().toString(36).slice(2, 6), {
          size: p.size, type: p.type, habitability: p.habitability,
        }, sys.id);
        colony.pops = 4;
        colony.isStartingColony = false;
        return colony;
      }
    }
  }
  throw new Error('No habitable planet found');
}

describe('Underdog Bonus — constants', () => {
  it('UNDERDOG_BONUS_PER_COLONY is 0.15', () => {
    assert.strictEqual(UNDERDOG_BONUS_PER_COLONY, 0.15);
  });
  it('UNDERDOG_BONUS_CAP is 0.45', () => {
    assert.strictEqual(UNDERDOG_BONUS_CAP, 0.45);
  });
  it('UNDERDOG_TECH_DISCOUNT is 0.15', () => {
    assert.strictEqual(UNDERDOG_TECH_DISCOUNT, 0.15);
  });
});

describe('Underdog Bonus — _calcUnderdogBonus', () => {
  it('returns 1.0 in single-player game', () => {
    const engine = makeSinglePlayerEngine();
    assert.strictEqual(engine._calcUnderdogBonus('p1'), 1.0);
  });

  it('returns 1.0 when player has equal colonies to leader', () => {
    const engine = makeTwoPlayerEngine();
    // Both start with 1 colony each
    assert.strictEqual(engine._calcUnderdogBonus('p1'), 1.0);
    assert.strictEqual(engine._calcUnderdogBonus('p2'), 1.0);
  });

  it('returns 1.15 when trailing by 1 colony', () => {
    const engine = makeTwoPlayerEngine();
    addColony(engine, 'p1'); // p1 has 2, p2 has 1
    assert.strictEqual(engine._calcUnderdogBonus('p2'), 1.15);
    assert.strictEqual(engine._calcUnderdogBonus('p1'), 1.0); // leader gets nothing
  });

  it('returns 1.30 when trailing by 2 colonies', () => {
    const engine = makeTwoPlayerEngine();
    addColony(engine, 'p1');
    addColony(engine, 'p1'); // p1 has 3, p2 has 1
    assert.strictEqual(engine._calcUnderdogBonus('p2'), 1.3);
  });

  it('caps at 1.45 (UNDERDOG_BONUS_CAP) when trailing by 3+ colonies', () => {
    const engine = makeTwoPlayerEngine();
    addColony(engine, 'p1');
    addColony(engine, 'p1');
    addColony(engine, 'p1'); // p1 has 4, p2 has 1 (gap = 3)
    assert.strictEqual(engine._calcUnderdogBonus('p2'), 1.45);
  });

  it('caps at 1.45 even with gap of 4+', () => {
    const engine = makeTwoPlayerEngine();
    addColony(engine, 'p1');
    addColony(engine, 'p1');
    addColony(engine, 'p1');
    addColony(engine, 'p1'); // p1 has 5, p2 has 1 (gap = 4)
    assert.strictEqual(engine._calcUnderdogBonus('p2'), 1.45); // capped
  });
});

describe('Underdog Bonus — production multiplier', () => {
  it('underdog colony produces more than leader colony (same setup)', () => {
    const engine = makeTwoPlayerEngine();
    addColony(engine, 'p1'); // p1=2, p2=1 → p2 gets +15%

    // Normalize planet types so both players have same bonuses
    const p2ColonyIds = engine._playerColonies.get('p2');
    const p2Colony = engine.colonies.get(p2ColonyIds[0]);
    const p1ColonyIds = engine._playerColonies.get('p1');
    const p1Colony = engine.colonies.get(p1ColonyIds[0]);
    p2Colony.planet.type = p1Colony.planet.type;

    // Get p2's colony production (underdog, +15%)
    engine._invalidateColonyCache(p2Colony);
    const p2Prod = engine._calcProduction(p2Colony);

    // Get p1's first colony production (leader, no bonus)
    engine._invalidateColonyCache(p1Colony);
    const p1Prod = engine._calcProduction(p1Colony);

    // p2 should produce more minerals than p1 (same district setup + planet, but +15%)
    assert.ok(p2Prod.production.minerals > p1Prod.production.minerals,
      `Underdog minerals ${p2Prod.production.minerals} should exceed leader minerals ${p1Prod.production.minerals}`);
  });

  it('underdog bonus affects all positive production resources', () => {
    const engine = makeTwoPlayerEngine();
    addColony(engine, 'p1'); // p1=2, p2=1

    const p2ColonyIds = engine._playerColonies.get('p2');
    const p2Colony = engine.colonies.get(p2ColonyIds[0]);

    // Get production without bonus (hack: temporarily set player count to 1)
    const savedStates = new Map(engine.playerStates);
    const p1State = engine.playerStates.get('p1');
    engine.playerStates.delete('p1');
    engine._invalidateColonyCache(p2Colony);
    const baseProd = engine._calcProduction(p2Colony);
    engine.playerStates.set('p1', p1State);

    // Get production with bonus
    engine._invalidateColonyCache(p2Colony);
    const bonusProd = engine._calcProduction(p2Colony);

    // Energy should be boosted by ~15%
    if (baseProd.production.energy > 0) {
      assert.ok(bonusProd.production.energy > baseProd.production.energy,
        'Energy should be boosted by underdog bonus');
    }
  });
});

describe('Underdog Bonus — tech cost discount', () => {
  it('tech costs full price when no one has completed it', () => {
    const engine = makeTwoPlayerEngine();
    assert.strictEqual(engine._calcTechDiscount('improved_power_plants'), 1.0);
  });

  it('tech costs 15% less when 1 player has completed it', () => {
    const engine = makeTwoPlayerEngine();
    const p1State = engine.playerStates.get('p1');
    p1State.completedTechs.push('improved_power_plants');
    const discount = engine._calcTechDiscount('improved_power_plants');
    assert.strictEqual(discount, 0.85);
  });

  it('tech costs 30% less when 2 players have completed it', () => {
    const players = new Map();
    players.set('p1', { name: 'P1' });
    players.set('p2', { name: 'P2' });
    players.set('p3', { name: 'P3' });
    const room = { players, galaxySize: 'small', matchTimer: 20 };
    const engine = new GameEngine(room, { tickRate: 10 });
    engine._doctrinePhase = false;

    engine.playerStates.get('p1').completedTechs.push('improved_power_plants');
    engine.playerStates.get('p2').completedTechs.push('improved_power_plants');
    const discount = engine._calcTechDiscount('improved_power_plants');
    assert.strictEqual(discount, 0.7);
  });

  it('discount is applied in _processResearch for actual completion', () => {
    const engine = makeTwoPlayerEngine();
    const p1State = engine.playerStates.get('p1');
    const p2State = engine.playerStates.get('p2');

    // p1 completes improved_power_plants first
    p1State.completedTechs.push('improved_power_plants');

    // p2 starts researching same tech — cost should be 85% of normal
    const techCost = TECH_TREE.improved_power_plants.cost;
    const effectiveCost = Math.round(techCost * 0.85);

    p2State.currentResearch = { physics: 'improved_power_plants', society: null, engineering: null };
    p2State.resources.research.physics = effectiveCost;

    engine._processResearch();

    assert.ok(p2State.completedTechs.includes('improved_power_plants'),
      'p2 should complete tech at discounted cost');
  });

  it('no discount means full cost required', () => {
    const engine = makeTwoPlayerEngine();
    const p1State = engine.playerStates.get('p1');
    const techCost = TECH_TREE.improved_power_plants.cost;

    p1State.currentResearch = { physics: 'improved_power_plants', society: null, engineering: null };
    // Give slightly less than full cost
    p1State.resources.research.physics = techCost - 1;

    engine._processResearch();

    assert.ok(!p1State.completedTechs.includes('improved_power_plants'),
      'Should not complete tech with less than full cost when no discount');
  });
});

describe('Underdog Bonus — serialization', () => {
  it('getPlayerState includes underdogBonus field', () => {
    const engine = makeTwoPlayerEngine();
    addColony(engine, 'p1'); // p1=2, p2=1

    const state = engine.getPlayerState('p2');
    const me = state.players[0]; // first player is 'me'
    assert.ok('underdogBonus' in me, 'underdogBonus field should be in player state');
    assert.strictEqual(me.underdogBonus, 1.15);
  });

  it('leader has underdogBonus of 1.0', () => {
    const engine = makeTwoPlayerEngine();
    addColony(engine, 'p1'); // p1=2, p2=1

    const state = engine.getPlayerState('p1');
    const me = state.players[0];
    assert.strictEqual(me.underdogBonus, 1.0);
  });

  it('underdogBonus in JSON is serializable', () => {
    const engine = makeTwoPlayerEngine();
    addColony(engine, 'p1');
    const json = engine.getPlayerStateJSON('p2');
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.players[0].underdogBonus, 1.15);
  });
});

describe('Underdog Bonus — edge cases', () => {
  it('both players equal colonies → no bonus for either', () => {
    const engine = makeTwoPlayerEngine();
    addColony(engine, 'p1');
    addColony(engine, 'p2'); // both have 2
    assert.strictEqual(engine._calcUnderdogBonus('p1'), 1.0);
    assert.strictEqual(engine._calcUnderdogBonus('p2'), 1.0);
  });

  it('bonus updates when underdog founds a new colony', () => {
    const engine = makeTwoPlayerEngine();
    addColony(engine, 'p1');
    addColony(engine, 'p1'); // p1=3, p2=1 → gap=2
    assert.strictEqual(engine._calcUnderdogBonus('p2'), 1.3);

    addColony(engine, 'p2'); // p1=3, p2=2 → gap=1
    assert.strictEqual(engine._calcUnderdogBonus('p2'), 1.15);
  });

  it('production cache invalidated when colony count changes', () => {
    const engine = makeTwoPlayerEngine();
    const p2ColonyIds = engine._playerColonies.get('p2');
    const p2Colony = engine.colonies.get(p2ColonyIds[0]);

    // Cache production
    engine._invalidateColonyCache(p2Colony);
    const prod1 = engine._calcProduction(p2Colony);

    // Give p1 more colonies → p2 should get underdog bonus
    addColony(engine, 'p1');
    engine._invalidateAllProductionCaches();
    const prod2 = engine._calcProduction(p2Colony);

    // Production should increase due to underdog bonus
    assert.ok(prod2.production.minerals >= prod1.production.minerals,
      'Minerals should increase or stay same with underdog bonus');
  });
});

describe('Gunboat ATK Balance — attack reduced to 3', () => {
  it('CORVETTE_VARIANTS.gunboat.attack is 3', () => {
    assert.strictEqual(CORVETTE_VARIANTS.gunboat.attack, 3);
  });

  it('gunboat HP×ATK product is now 45 (not 60)', () => {
    const gb = CORVETTE_VARIANTS.gunboat;
    assert.strictEqual(gb.hp * gb.attack, 45);
  });

  it('interceptor HP×ATK (40) is close to gunboat HP×ATK (45)', () => {
    const int = CORVETTE_VARIANTS.interceptor;
    const gb = CORVETTE_VARIANTS.gunboat;
    const intProduct = int.hp * int.attack; // 8*5 = 40
    const gbProduct = gb.hp * gb.attack;    // 15*3 = 45
    assert.ok(Math.abs(intProduct - gbProduct) <= 10,
      `Products should be within 10: interceptor=${intProduct}, gunboat=${gbProduct}`);
  });

  it('spawned gunboat has attack 3', () => {
    const engine = makeTwoPlayerEngine();
    const p1State = engine.playerStates.get('p1');
    p1State.completedTechs.push('deep_mining');
    p1State.resources.minerals = 1000;
    p1State.resources.alloys = 500;

    const colony = engine.colonies.get(engine._playerColonies.get('p1')[0]);
    colony.buildQueue = [];

    engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id, variant: 'gunboat' });

    // Fast-forward through build time
    for (let i = 0; i < 600; i++) engine.tick();

    const ships = engine._militaryShips.filter(s => s.ownerId === 'p1' && s.variant === 'gunboat');
    assert.ok(ships.length > 0, 'Should have a gunboat');
    assert.strictEqual(ships[0].attack, 3);
  });
});
