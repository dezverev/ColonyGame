const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine, TECH_TREE, MONTH_TICKS, TOTAL_TECHS,
  MILITARY_VICTORY_OCCUPATIONS, ECONOMIC_VICTORY_ALLOYS, ECONOMIC_VICTORY_TRAITS,
  CORVETTE_MAINTENANCE, COLONY_TRAITS,
} = require('../../server/game-engine');

function makeRoom(playerCount = 2, options = {}) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { id: i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 1, maxPlayers: 4, status: 'playing', players, ...options };
}

function makeColony(id, ownerId, systemId, overrides = {}) {
  return {
    id, name: overrides.name || id, ownerId, systemId,
    planet: overrides.planet || { type: 'Continental', size: 16, habitability: 80 },
    pops: overrides.pops || 8,
    districts: overrides.districts || [],
    buildQueue: [], occupiedBy: overrides.occupiedBy || null,
    crisisState: null, nextCrisisTick: 999999,
    defensePlatform: null, occupationProgress: 0,
    isStartingColony: false, playerBuiltDistricts: 0,
    growthProgress: 0, disabledDistricts: new Set(),
    _cachedHousing: null, _cachedJobs: null, _cachedProduction: null,
  };
}

function makeEngine(playerCount = 2, opts = {}) {
  let gameOverData = null;
  const engine = new GameEngine(makeRoom(playerCount, opts.roomOpts || {}), {
    tickRate: 10,
    onGameOver: (data) => { gameOverData = data; },
  });
  // Skip doctrine phase and endgame crisis to avoid interference
  engine._doctrinePhase = false;
  engine._endgameCrisisTriggered = true;
  return { engine, getGameOver: () => gameOverData };
}

// Advance to next monthly tick (tick divisible by MONTH_TICKS)
function tickToMonth(engine) {
  do { engine.tick(); } while (engine.tickCount % MONTH_TICKS !== 0);
}

// ── Victory Condition Constants ──
describe('Victory condition constants', () => {
  it('TOTAL_TECHS matches actual TECH_TREE count', () => {
    assert.strictEqual(TOTAL_TECHS, Object.keys(TECH_TREE).length);
  });

  it('MILITARY_VICTORY_OCCUPATIONS is 3', () => {
    assert.strictEqual(MILITARY_VICTORY_OCCUPATIONS, 3);
  });

  it('ECONOMIC_VICTORY_ALLOYS is 500', () => {
    assert.strictEqual(ECONOMIC_VICTORY_ALLOYS, 500);
  });

  it('ECONOMIC_VICTORY_TRAITS is 3', () => {
    assert.strictEqual(ECONOMIC_VICTORY_TRAITS, 3);
  });
});

// ── Scientific Victory ──
describe('Scientific Victory — complete all 9 techs', () => {
  it('triggers instant-win when a player completes all techs', () => {
    const { engine, getGameOver } = makeEngine(2, { roomOpts: { matchTimer: 20 } });
    const state = engine.playerStates.get(1);

    // Give player 1 all 9 techs
    state.completedTechs = Object.keys(TECH_TREE);
    assert.strictEqual(state.completedTechs.length, TOTAL_TECHS);

    // Tick to monthly processing
    tickToMonth(engine);

    const gd = getGameOver();
    assert.ok(gd, 'gameOver should have fired');
    assert.strictEqual(gd.victoryType, 'scientific');
    assert.strictEqual(gd.winner.playerId, 1);
  });

  it('does NOT trigger with only 8/9 techs', () => {
    const { engine, getGameOver } = makeEngine(2, { roomOpts: { matchTimer: 20 } });
    const state = engine.playerStates.get(1);

    const allTechs = Object.keys(TECH_TREE);
    state.completedTechs = allTechs.slice(0, allTechs.length - 1);
    assert.strictEqual(state.completedTechs.length, TOTAL_TECHS - 1);

    tickToMonth(engine);

    assert.strictEqual(getGameOver(), null, 'gameOver should NOT fire with 8 techs');
  });

  it('victory progress shows correct tech count', () => {
    const { engine } = makeEngine(1);
    const state = engine.playerStates.get(1);
    state.completedTechs = ['improved_power_plants', 'frontier_medicine', 'improved_mining'];

    const progress = engine._calcVictoryProgress(1);
    assert.strictEqual(progress.scientific.current, 3);
    assert.strictEqual(progress.scientific.target, TOTAL_TECHS);
  });
});

// ── Military Victory ──
describe('Military Victory — occupy 3+ enemy colonies', () => {
  it('triggers instant-win when occupying 3 enemy colonies', () => {
    const { engine, getGameOver } = makeEngine(2, { roomOpts: { matchTimer: 20 } });

    // Set 3 of player 2's colonies as occupied by player 1
    let occupiedCount = 0;
    for (const colony of engine.colonies.values()) {
      if (colony.ownerId === 2 && occupiedCount < 3) {
        colony.occupiedBy = 1;
        occupiedCount++;
      }
    }
    // Player 2 only has 1 colony by default, so create more
    // Instead, let's create additional colonies for player 2
    const systems = engine.galaxy.systems;
    const usedSystems = new Set();
    for (const c of engine.colonies.values()) usedSystems.add(c.systemId);

    // Find 2 more unused systems and create colonies for player 2
    let added = 0;
    for (const sys of systems) {
      if (usedSystems.has(sys.id)) continue;
      if (added >= 2) break;
      const colId = `colony_p2_extra_${added}`;
      engine.colonies.set(colId, makeColony(colId, 2, sys.id, { occupiedBy: 1 }));
      if (!engine._playerColonies.has(2)) engine._playerColonies.set(2, []);
      engine._playerColonies.get(2).push(colId);
      usedSystems.add(sys.id);
      added++;
    }

    // Also set the original colony as occupied
    for (const colony of engine.colonies.values()) {
      if (colony.ownerId === 2) colony.occupiedBy = 1;
    }

    // Verify at least 3 occupied
    let totalOccupied = 0;
    for (const colony of engine.colonies.values()) {
      if (colony.occupiedBy === 1 && colony.ownerId !== 1) totalOccupied++;
    }
    assert.ok(totalOccupied >= 3, `Should have 3+ occupied, got ${totalOccupied}`);

    tickToMonth(engine);

    const gd = getGameOver();
    assert.ok(gd, 'gameOver should have fired');
    assert.strictEqual(gd.victoryType, 'military');
    assert.strictEqual(gd.winner.playerId, 1);
  });

  it('does NOT trigger with only 2 occupied colonies', () => {
    const { engine, getGameOver } = makeEngine(2, { roomOpts: { matchTimer: 20 } });

    // Create 2 extra colonies for player 2 and occupy them
    const systems = engine.galaxy.systems;
    const usedSystems = new Set();
    for (const c of engine.colonies.values()) usedSystems.add(c.systemId);

    let added = 0;
    for (const sys of systems) {
      if (usedSystems.has(sys.id)) continue;
      if (added >= 1) break;
      const colId = `colony_p2_extra_${added}`;
      engine.colonies.set(colId, makeColony(colId, 2, sys.id, { occupiedBy: 1 }));
      if (!engine._playerColonies.has(2)) engine._playerColonies.set(2, []);
      engine._playerColonies.get(2).push(colId);
      usedSystems.add(sys.id);
      added++;
    }

    // Set original + 1 extra = 2 occupied
    for (const colony of engine.colonies.values()) {
      if (colony.ownerId === 2) colony.occupiedBy = 1;
    }

    let totalOccupied = 0;
    for (const colony of engine.colonies.values()) {
      if (colony.occupiedBy === 1 && colony.ownerId !== 1) totalOccupied++;
    }
    assert.strictEqual(totalOccupied, 2);

    tickToMonth(engine);

    assert.strictEqual(getGameOver(), null, 'gameOver should NOT fire with only 2 occupations');
  });

  it('occupying own colonies does not count toward military victory', () => {
    const { engine, getGameOver } = makeEngine(1, { roomOpts: { matchTimer: 20 } });

    // Set player 1's own colony as occupied by themselves (shouldn't count)
    for (const colony of engine.colonies.values()) {
      if (colony.ownerId === 1) colony.occupiedBy = 1;
    }

    tickToMonth(engine);
    assert.strictEqual(getGameOver(), null);
  });

  it('victory progress shows correct occupation count', () => {
    const { engine } = makeEngine(2);

    // Set player 2's colony as occupied by player 1
    for (const colony of engine.colonies.values()) {
      if (colony.ownerId === 2) colony.occupiedBy = 1;
    }

    const progress = engine._calcVictoryProgress(1);
    assert.strictEqual(progress.military.current, 1);
    assert.strictEqual(progress.military.target, MILITARY_VICTORY_OCCUPATIONS);
  });
});

// ── Economic Victory ──
describe('Economic Victory — 500+ alloys AND 3+ traits', () => {
  it('triggers instant-win with 500 alloys and 3 colony traits', () => {
    const { engine, getGameOver } = makeEngine(1, { roomOpts: { matchTimer: 20 } });
    const state = engine.playerStates.get(1);

    // Give 500 alloys
    state.resources.alloys = 500;

    // Create 3 colonies with traits (need 4+ districts of same type for a trait)
    const systems = engine.galaxy.systems;
    const usedSystems = new Set();
    for (const c of engine.colonies.values()) usedSystems.add(c.systemId);

    // First, set up the existing colony with a trait (4 mining districts)
    const existingColonyId = (engine._playerColonies.get(1) || [])[0];
    const existingColony = engine.colonies.get(existingColonyId);
    existingColony.districts = [
      { type: 'mining', disabled: false },
      { type: 'mining', disabled: false },
      { type: 'mining', disabled: false },
      { type: 'mining', disabled: false },
    ];

    // Create 2 more colonies with traits
    let colNum = 0;
    for (const sys of systems) {
      if (usedSystems.has(sys.id)) continue;
      if (colNum >= 2) break;
      const colId = `trait_colony_${colNum}`;
      const distType = colNum === 0 ? 'generator' : 'agriculture';
      const districts = Array.from({ length: 4 }, () => ({ type: distType, disabled: false }));
      engine.colonies.set(colId, makeColony(colId, 1, sys.id, { districts }));
      engine._playerColonies.get(1).push(colId);
      usedSystems.add(sys.id);
      colNum++;
    }

    tickToMonth(engine);

    const gd = getGameOver();
    assert.ok(gd, 'gameOver should have fired');
    assert.strictEqual(gd.victoryType, 'economic');
    assert.strictEqual(gd.winner.playerId, 1);
  });

  it('does NOT trigger with 500 alloys but only 2 traits', () => {
    const { engine, getGameOver } = makeEngine(1, { roomOpts: { matchTimer: 20 } });
    const state = engine.playerStates.get(1);

    state.resources.alloys = 500;

    // Set up existing colony with a trait
    const existingColonyId = (engine._playerColonies.get(1) || [])[0];
    const existingColony = engine.colonies.get(existingColonyId);
    existingColony.districts = [
      { type: 'mining', disabled: false },
      { type: 'mining', disabled: false },
      { type: 'mining', disabled: false },
      { type: 'mining', disabled: false },
    ];

    // Create 1 more colony with a trait (total 2)
    const systems = engine.galaxy.systems;
    const usedSystems = new Set();
    for (const c of engine.colonies.values()) usedSystems.add(c.systemId);
    for (const sys of systems) {
      if (usedSystems.has(sys.id)) continue;
      const colId = `trait_colony_extra`;
      const districts = Array.from({ length: 4 }, () => ({ type: 'generator', disabled: false }));
      engine.colonies.set(colId, makeColony(colId, 1, sys.id, { districts }));
      engine._playerColonies.get(1).push(colId);
      break;
    }

    tickToMonth(engine);

    assert.strictEqual(getGameOver(), null, 'gameOver should NOT fire with only 2 traits');
  });

  it('does NOT trigger with 3 traits but only 499 alloys', () => {
    const { engine, getGameOver } = makeEngine(1, { roomOpts: { matchTimer: 20 } });
    const state = engine.playerStates.get(1);

    state.resources.alloys = 499;

    // Set up 3 colonies with traits
    const existingColonyId = (engine._playerColonies.get(1) || [])[0];
    const existingColony = engine.colonies.get(existingColonyId);
    existingColony.districts = [
      { type: 'mining', disabled: false },
      { type: 'mining', disabled: false },
      { type: 'mining', disabled: false },
      { type: 'mining', disabled: false },
    ];

    const systems = engine.galaxy.systems;
    const usedSystems = new Set();
    for (const c of engine.colonies.values()) usedSystems.add(c.systemId);

    let colNum = 0;
    for (const sys of systems) {
      if (usedSystems.has(sys.id)) continue;
      if (colNum >= 2) break;
      const colId = `trait_colony_${colNum}`;
      const distType = colNum === 0 ? 'generator' : 'agriculture';
      const districts = Array.from({ length: 4 }, () => ({ type: distType, disabled: false }));
      engine.colonies.set(colId, makeColony(colId, 1, sys.id, { districts }));
      engine._playerColonies.get(1).push(colId);
      usedSystems.add(sys.id);
      colNum++;
    }

    tickToMonth(engine);

    assert.strictEqual(getGameOver(), null, 'gameOver should NOT fire with 499 alloys');
  });

  it('victory progress shows correct alloy/trait counts', () => {
    const { engine } = makeEngine(1);
    const state = engine.playerStates.get(1);
    state.resources.alloys = 250;

    // Give existing colony a trait
    const colonyId = (engine._playerColonies.get(1) || [])[0];
    const colony = engine.colonies.get(colonyId);
    colony.districts = [
      { type: 'mining', disabled: false },
      { type: 'mining', disabled: false },
      { type: 'mining', disabled: false },
      { type: 'mining', disabled: false },
    ];

    const progress = engine._calcVictoryProgress(1);
    assert.strictEqual(progress.economic.alloys, 250);
    assert.strictEqual(progress.economic.alloysTarget, ECONOMIC_VICTORY_ALLOYS);
    assert.strictEqual(progress.economic.traits, 1);
    assert.strictEqual(progress.economic.traitsTarget, ECONOMIC_VICTORY_TRAITS);
  });
});

// ── _triggerGameOver with victoryInfo ──
describe('_triggerGameOver with victoryType', () => {
  it('VP timer win has victoryType "vp"', () => {
    let gameOverData = null;
    const engine = new GameEngine(makeRoom(1, { matchTimer: 1 }), {
      tickRate: 10,
      onGameOver: (data) => { gameOverData = data; },
    });
    // Let timer expire
    for (let i = 0; i < 700; i++) engine.tick();

    assert.ok(gameOverData);
    assert.strictEqual(gameOverData.victoryType, 'vp');
  });

  it('instant-win sets correct winner even if not VP leader', () => {
    const { engine, getGameOver } = makeEngine(2, { roomOpts: { matchTimer: 20 } });

    // Player 2 has way more VP
    const p2 = engine.playerStates.get(2);
    p2.resources.alloys = 9999;

    // But player 1 gets all techs (scientific victory)
    const p1 = engine.playerStates.get(1);
    p1.completedTechs = Object.keys(TECH_TREE);

    tickToMonth(engine);

    const gd = getGameOver();
    assert.ok(gd);
    assert.strictEqual(gd.victoryType, 'scientific');
    assert.strictEqual(gd.winner.playerId, 1, 'Player 1 wins via science despite lower VP');
  });

  it('victoryProgress included in VP breakdown', () => {
    const { engine } = makeEngine(1);
    const breakdown = engine._calcVPBreakdown(1);
    assert.ok(breakdown.victoryProgress, 'breakdown should have victoryProgress');
    assert.ok(breakdown.victoryProgress.scientific);
    assert.ok(breakdown.victoryProgress.military);
    assert.ok(breakdown.victoryProgress.economic);
  });
});

// ── Victory progress in player state serialization ──
describe('Victory progress in serialized state', () => {
  it('own player state includes victoryProgress', () => {
    const { engine } = makeEngine(2);
    const state = engine.getPlayerState(1);
    const me = state.players[0];
    assert.ok(me.victoryProgress, 'own state should include victoryProgress');
    assert.strictEqual(me.victoryProgress.scientific.target, TOTAL_TECHS);
  });

  it('other players state includes victoryProgress', () => {
    const { engine } = makeEngine(2);
    const state = engine.getPlayerState(1);
    const other = state.players[1];
    assert.ok(other.victoryProgress, 'other player state should include victoryProgress');
  });
});

// ── Victory check only runs on monthly tick ──
describe('Victory conditions only checked monthly', () => {
  it('does not trigger on non-monthly tick even if conditions met', () => {
    const { engine, getGameOver } = makeEngine(2, { roomOpts: { matchTimer: 20 } });
    const state = engine.playerStates.get(1);
    state.completedTechs = Object.keys(TECH_TREE);

    // Tick once (not a monthly tick)
    engine.tick();
    assert.strictEqual(getGameOver(), null, 'should not fire on tick 1');

    // Now tick to monthly
    tickToMonth(engine);
    assert.ok(getGameOver(), 'should fire on monthly tick');
  });
});

// ── Corvette maintenance balance tweak ──
describe('BALANCE: Corvette maintenance is 2 energy + 1 alloy', () => {
  it('CORVETTE_MAINTENANCE.energy is 2', () => {
    assert.strictEqual(CORVETTE_MAINTENANCE.energy, 2);
  });

  it('CORVETTE_MAINTENANCE.alloys is 1', () => {
    assert.strictEqual(CORVETTE_MAINTENANCE.alloys, 1);
  });
});

// ── Edge: no players / empty state ──
describe('Victory progress edge cases', () => {
  it('returns zeroes for unknown playerId', () => {
    const { engine } = makeEngine(1);
    const progress = engine._calcVictoryProgress(999);
    assert.strictEqual(progress.scientific.current, 0);
    assert.strictEqual(progress.military.current, 0);
    assert.strictEqual(progress.economic.alloys, 0);
    assert.strictEqual(progress.economic.traits, 0);
  });

  it('scientific victory prevents military/economic from also triggering', () => {
    const { engine, getGameOver } = makeEngine(2, { roomOpts: { matchTimer: 20 } });
    const state = engine.playerStates.get(1);

    // Meet ALL conditions simultaneously
    state.completedTechs = Object.keys(TECH_TREE);
    state.resources.alloys = 1000;

    // Set up 3 traits + 3 occupations (player 1 wins all)
    const systems = engine.galaxy.systems;
    const usedSystems = new Set();
    for (const c of engine.colonies.values()) usedSystems.add(c.systemId);

    // Make 3 extra colonies for player 2 and occupy them
    let added = 0;
    for (const sys of systems) {
      if (usedSystems.has(sys.id)) continue;
      if (added >= 3) break;
      const colId = `p2_occ_${added}`;
      engine.colonies.set(colId, makeColony(colId, 2, sys.id, { occupiedBy: 1 }));
      if (!engine._playerColonies.has(2)) engine._playerColonies.set(2, []);
      engine._playerColonies.get(2).push(colId);
      usedSystems.add(sys.id);
      added++;
    }

    tickToMonth(engine);

    const gd = getGameOver();
    assert.ok(gd);
    // Scientific is checked first in the loop, so it wins
    assert.strictEqual(gd.victoryType, 'scientific');
  });
});
