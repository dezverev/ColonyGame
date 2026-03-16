const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, PLANET_TYPES } = require('../../server/game-engine.js');
const { generateGalaxy, assignStartingSystems, bestHabitablePlanet } = require('../../server/galaxy.js');

function createEngine(seed, playerCount = 1) {
  const players = new Map();
  for (let i = 0; i < playerCount; i++) {
    players.set(`p${i + 1}`, { name: `Player ${i + 1}` });
  }
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  return new GameEngine(room, { tickRate: 10, galaxySeed: seed });
}

const VALID_PLANET_TYPES = ['continental', 'ocean', 'tropical', 'arctic', 'desert', 'arid', 'barren', 'molten', 'gasGiant'];
const VALID_STAR_TYPES = ['yellow', 'red', 'blue', 'white', 'orange'];

// ── Galaxy generation: planet data invariants ──

describe('System View data — planet generation invariants', () => {
  it('every system has 1-6 planets', () => {
    const galaxy = generateGalaxy({ size: 'small', seed: 42 });
    for (const sys of galaxy.systems) {
      assert.ok(sys.planets.length >= 1, `System ${sys.id} has ${sys.planets.length} planets (min 1)`);
      assert.ok(sys.planets.length <= 6, `System ${sys.id} has ${sys.planets.length} planets (max 6)`);
    }
  });

  it('planet orbits are sequential 1-based integers', () => {
    const galaxy = generateGalaxy({ size: 'small', seed: 77 });
    for (const sys of galaxy.systems) {
      for (let i = 0; i < sys.planets.length; i++) {
        assert.strictEqual(sys.planets[i].orbit, i + 1,
          `System ${sys.id} planet ${i} orbit should be ${i + 1}, got ${sys.planets[i].orbit}`);
      }
    }
  });

  it('habitable planets have size 8-20, barren/molten 6-15, gas giants 0', () => {
    const galaxy = generateGalaxy({ size: 'medium', seed: 100 });
    for (const sys of galaxy.systems) {
      for (const p of sys.planets) {
        if (p.type === 'gasGiant') {
          assert.strictEqual(p.size, 0, `Gas giant should have size 0`);
        } else if (p.habitability > 0) {
          assert.ok(p.size >= 8 && p.size <= 20,
            `Habitable ${p.type} size should be 8-20, got ${p.size}`);
        } else {
          assert.ok(p.size >= 6 && p.size <= 15,
            `Uninhabitable ${p.type} size should be 6-15, got ${p.size}`);
        }
      }
    }
  });

  it('planet habitability matches PLANET_TYPES definition', () => {
    const galaxy = generateGalaxy({ size: 'small', seed: 200 });
    for (const sys of galaxy.systems) {
      for (const p of sys.planets) {
        const expected = PLANET_TYPES[p.type];
        assert.ok(expected, `Unknown planet type: ${p.type}`);
        assert.strictEqual(p.habitability, expected.habitability,
          `${p.type} habitability should be ${expected.habitability}, got ${p.habitability}`);
      }
    }
  });

  it('all planets start unsurveyed', () => {
    const galaxy = generateGalaxy({ size: 'small', seed: 300 });
    for (const sys of galaxy.systems) {
      for (const p of sys.planets) {
        assert.strictEqual(p.surveyed, false,
          `Planet in system ${sys.id} should start unsurveyed`);
      }
    }
  });
});

// ── System data shape for system-view consumption ──

describe('System View data — getInitState system shape', () => {
  it('systems have all fields required by SystemView.buildSystem', () => {
    const engine = createEngine(42);
    const init = engine.getInitState();

    for (const sys of init.galaxy.systems) {
      assert.ok(typeof sys.id === 'number', 'system should have numeric id');
      assert.ok(typeof sys.name === 'string' && sys.name.length > 0, 'system should have non-empty name');
      assert.ok(typeof sys.x === 'number', 'system should have x coordinate');
      assert.ok(typeof sys.y === 'number', 'system should have y coordinate');
      assert.ok(typeof sys.z === 'number', 'system should have z coordinate');
      assert.ok(VALID_STAR_TYPES.includes(sys.starType),
        `system starType should be valid, got ${sys.starType}`);
      assert.ok(typeof sys.starColor === 'string' && sys.starColor.startsWith('#'),
        `system starColor should be hex string, got ${sys.starColor}`);
      assert.ok(Array.isArray(sys.planets), 'system should have planets array');
    }
  });

  it('planets in init state have orbit, type, size, habitability', () => {
    const engine = createEngine(55);
    const init = engine.getInitState();

    let totalPlanets = 0;
    for (const sys of init.galaxy.systems) {
      for (const p of sys.planets) {
        totalPlanets++;
        assert.ok(typeof p.orbit === 'number' && p.orbit >= 1, 'planet needs orbit >= 1');
        assert.ok(VALID_PLANET_TYPES.includes(p.type), `valid planet type, got ${p.type}`);
        assert.ok(typeof p.size === 'number' && p.size >= 0, 'planet needs size >= 0');
        assert.ok(typeof p.habitability === 'number', 'planet needs habitability');
      }
    }
    assert.ok(totalPlanets > 0, 'should have planets in galaxy');
  });

  it('galaxy init includes hyperlanes array', () => {
    const engine = createEngine(42);
    const init = engine.getInitState();

    assert.ok(Array.isArray(init.galaxy.hyperlanes), 'should have hyperlanes array');
    assert.ok(init.galaxy.hyperlanes.length > 0, 'should have some hyperlanes');
    for (const lane of init.galaxy.hyperlanes) {
      assert.ok(Array.isArray(lane) && lane.length === 2,
        'each hyperlane should be a [from, to] pair');
    }
  });
});

// ── Colonized planet flag propagation ──

describe('System View data — colonized planet flag', () => {
  it('starting colony planet is marked colonized in system data', () => {
    const engine = createEngine(42);
    const init = engine.getInitState();

    // Find the player's starting colony
    const playerState = engine.getPlayerState('p1');
    assert.ok(playerState.colonies.length > 0, 'player should have starting colony');

    const colony = playerState.colonies[0];
    const systemId = colony.systemId;

    // Find system in init galaxy data
    const system = init.galaxy.systems.find(s => s.id === systemId);
    assert.ok(system, 'colony system should exist in galaxy');

    // At least one planet should be colonized
    const colonizedPlanets = system.planets.filter(p => p.colonized);
    assert.ok(colonizedPlanets.length >= 1,
      'starting system should have at least one colonized planet');
  });

  it('non-starting systems have no colonized planets initially', () => {
    const engine = createEngine(42);
    const init = engine.getInitState();
    const playerState = engine.getPlayerState('p1');
    const colonySystemIds = new Set(playerState.colonies.map(c => c.systemId));

    for (const sys of init.galaxy.systems) {
      if (colonySystemIds.has(sys.id)) continue;
      const colonized = sys.planets.filter(p => p.colonized);
      assert.strictEqual(colonized.length, 0,
        `Non-starting system ${sys.id} should have no colonized planets, found ${colonized.length}`);
    }
  });
});

// ── Star type consistency ──

describe('System View data — star type consistency', () => {
  it('starColor matches starType across all systems', () => {
    const STAR_COLOR_MAP = {
      yellow: '#f9d71c',
      red:    '#e74c3c',
      blue:   '#3498db',
      white:  '#ecf0f1',
      orange: '#e67e22',
    };

    const engine = createEngine(42);
    const init = engine.getInitState();

    for (const sys of init.galaxy.systems) {
      const expected = STAR_COLOR_MAP[sys.starType];
      assert.strictEqual(sys.starColor, expected,
        `System ${sys.id} starColor should be ${expected} for ${sys.starType}, got ${sys.starColor}`);
    }
  });

  it('all five star types appear across a medium galaxy', () => {
    const galaxy = generateGalaxy({ size: 'medium', seed: 42 });
    const starTypes = new Set(galaxy.systems.map(s => s.starType));

    for (const type of VALID_STAR_TYPES) {
      assert.ok(starTypes.has(type),
        `Star type ${type} should appear in medium galaxy`);
    }
  });

  it('all planet types appear across a medium galaxy', () => {
    const galaxy = generateGalaxy({ size: 'medium', seed: 42 });
    const planetTypes = new Set();
    for (const sys of galaxy.systems) {
      for (const p of sys.planets) planetTypes.add(p.type);
    }

    for (const type of VALID_PLANET_TYPES) {
      assert.ok(planetTypes.has(type),
        `Planet type ${type} should appear in medium galaxy`);
    }
  });
});

// ── bestHabitablePlanet utility ──

describe('System View data — bestHabitablePlanet', () => {
  it('returns planet with highest habitability', () => {
    const system = {
      planets: [
        { orbit: 1, type: 'barren', size: 10, habitability: 0 },
        { orbit: 2, type: 'desert', size: 12, habitability: 60 },
        { orbit: 3, type: 'continental', size: 16, habitability: 80 },
      ],
    };
    const best = bestHabitablePlanet(system);
    assert.strictEqual(best.type, 'continental');
    assert.strictEqual(best.habitability, 80);
  });

  it('breaks habitability tie by size', () => {
    const system = {
      planets: [
        { orbit: 1, type: 'continental', size: 10, habitability: 80 },
        { orbit: 2, type: 'ocean', size: 18, habitability: 80 },
      ],
    };
    const best = bestHabitablePlanet(system);
    assert.strictEqual(best.size, 18, 'should pick larger planet on tie');
  });

  it('returns null for system with only uninhabitable planets', () => {
    const system = {
      planets: [
        { orbit: 1, type: 'barren', size: 10, habitability: 0 },
        { orbit: 2, type: 'gasGiant', size: 0, habitability: 0 },
        { orbit: 3, type: 'molten', size: 8, habitability: 0 },
      ],
    };
    const best = bestHabitablePlanet(system);
    assert.strictEqual(best, null, 'should return null for no habitable planets');
  });

  it('returns null for system with empty planets array', () => {
    const system = { planets: [] };
    const best = bestHabitablePlanet(system);
    assert.strictEqual(best, null, 'should return null for empty planets');
  });
});

// ── Deterministic galaxy seeding ──

describe('System View data — deterministic seeding', () => {
  it('same seed produces identical galaxy', () => {
    const g1 = generateGalaxy({ size: 'small', seed: 42 });
    const g2 = generateGalaxy({ size: 'small', seed: 42 });

    assert.strictEqual(g1.systems.length, g2.systems.length);
    for (let i = 0; i < g1.systems.length; i++) {
      assert.strictEqual(g1.systems[i].name, g2.systems[i].name);
      assert.strictEqual(g1.systems[i].starType, g2.systems[i].starType);
      assert.strictEqual(g1.systems[i].planets.length, g2.systems[i].planets.length);
      for (let j = 0; j < g1.systems[i].planets.length; j++) {
        assert.deepStrictEqual(g1.systems[i].planets[j], g2.systems[i].planets[j]);
      }
    }
  });

  it('different seeds produce different galaxies', () => {
    const g1 = generateGalaxy({ size: 'small', seed: 42 });
    const g2 = generateGalaxy({ size: 'small', seed: 999 });

    // Name of first system should differ (extremely unlikely to match)
    const namesDiffer = g1.systems[0].name !== g2.systems[0].name;
    const typesDiffer = g1.systems[0].starType !== g2.systems[0].starType;
    assert.ok(namesDiffer || typesDiffer,
      'Different seeds should produce different galaxies');
  });
});

// ── SystemView module API (Node.js, no THREE) ──

describe('SystemView module — getSelectedPlanet after buildSystem', () => {
  const SystemView = require('../public/js/system-view.js');

  it('getSystemData returns null after buildSystem without scene', () => {
    // Without THREE/scene, buildSystem returns early, systemData stays null
    SystemView.buildSystem({
      id: 0, name: 'Test', starType: 'yellow', starColor: '#f9d71c',
      planets: [{ orbit: 1, type: 'continental', size: 16, habitability: 80 }],
    });
    // No scene means data isn't stored
    assert.strictEqual(SystemView.getSystemData(), null);
  });

  it('getSelectedPlanet returns null when no planet selected', () => {
    assert.strictEqual(SystemView.getSelectedPlanet(), null);
  });

  it('destroy does not throw even when called multiple times', () => {
    assert.doesNotThrow(() => {
      SystemView.destroy();
      SystemView.destroy();
      SystemView.destroy();
    });
  });
});

// ── Multi-player system ownership ──

describe('System View data — multi-player ownership', () => {
  it('each player gets a different starting system', () => {
    const engine = createEngine(42, 3);
    const init = engine.getInitState();

    const systemIds = new Set();
    for (let i = 1; i <= 3; i++) {
      const state = engine.getPlayerState(`p${i}`);
      assert.ok(state.colonies.length > 0, `Player ${i} should have a colony`);
      const sysId = state.colonies[0].systemId;
      assert.ok(!systemIds.has(sysId),
        `Player ${i} system ${sysId} should be unique`);
      systemIds.add(sysId);
    }
  });

  it('system owner field is set for starting systems in init data', () => {
    const engine = createEngine(42, 2);
    const init = engine.getInitState();

    const ownedSystems = init.galaxy.systems.filter(s => s.owner);
    assert.ok(ownedSystems.length >= 2,
      `Should have at least 2 owned systems, got ${ownedSystems.length}`);

    const owners = new Set(ownedSystems.map(s => s.owner));
    assert.ok(owners.has('p1'), 'p1 should own a system');
    assert.ok(owners.has('p2'), 'p2 should own a system');
  });
});

// ── Galaxy size configurations ──

describe('System View data — galaxy sizes', () => {
  it('small galaxy has ~50 systems', () => {
    const galaxy = generateGalaxy({ size: 'small', seed: 42 });
    assert.ok(galaxy.systems.length >= 30 && galaxy.systems.length <= 60,
      `Small galaxy should have ~50 systems, got ${galaxy.systems.length}`);
  });

  it('medium galaxy has ~100 systems', () => {
    const galaxy = generateGalaxy({ size: 'medium', seed: 42 });
    assert.ok(galaxy.systems.length >= 70 && galaxy.systems.length <= 120,
      `Medium galaxy should have ~100 systems, got ${galaxy.systems.length}`);
  });

  it('large galaxy has ~200 systems', () => {
    const galaxy = generateGalaxy({ size: 'large', seed: 42 });
    assert.ok(galaxy.systems.length >= 150 && galaxy.systems.length <= 250,
      `Large galaxy should have ~200 systems, got ${galaxy.systems.length}`);
  });
});
