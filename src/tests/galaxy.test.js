const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  generateGalaxy,
  assignStartingSystems,
  bestHabitablePlanet,
  STAR_TYPES,
  PLANET_TYPES,
  GALAXY_SIZES,
  mulberry32,
  poissonDisc,
  generateHyperlanes,
  generateName,
  weightedPick,
} = require('../../server/galaxy');

// ─── Seeded PRNG ───────────────────────────────────────────────

describe('mulberry32 PRNG', () => {
  it('produces deterministic sequence from same seed', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      assert.strictEqual(rng1(), rng2());
    }
  });

  it('produces values in [0, 1)', () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      assert.ok(v >= 0 && v < 1, `Value ${v} out of range`);
    }
  });

  it('different seeds produce different sequences', () => {
    const rng1 = mulberry32(1);
    const rng2 = mulberry32(2);
    let same = 0;
    for (let i = 0; i < 20; i++) {
      if (rng1() === rng2()) same++;
    }
    assert.ok(same < 5, 'Different seeds should produce mostly different values');
  });
});

// ─── Name Generation ───────────────────────────────────────────

describe('generateName', () => {
  it('generates unique names', () => {
    const rng = mulberry32(100);
    const used = new Set();
    for (let i = 0; i < 50; i++) {
      generateName(rng, used);
    }
    assert.strictEqual(used.size, 50);
  });

  it('names are non-empty strings', () => {
    const rng = mulberry32(200);
    const used = new Set();
    const name = generateName(rng, used);
    assert.ok(typeof name === 'string' && name.length > 0);
  });
});

// ─── Poisson Disc Sampling ─────────────────────────────────────

describe('poissonDisc', () => {
  it('generates points within radius', () => {
    const rng = mulberry32(300);
    const points = poissonDisc(rng, 50, 200, 30);
    for (const p of points) {
      const dist = Math.sqrt(p.x * p.x + p.z * p.z);
      assert.ok(dist <= 200, `Point (${p.x}, ${p.z}) outside radius 200, dist=${dist}`);
    }
  });

  it('respects minimum distance between points', () => {
    const rng = mulberry32(400);
    const minDist = 30;
    const points = poissonDisc(rng, 50, 200, minDist);
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[i].x - points[j].x;
        const dz = points[i].z - points[j].z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        assert.ok(dist >= minDist * 0.99, `Points ${i} and ${j} too close: ${dist} < ${minDist}`);
      }
    }
  });

  it('generates approximately the requested count', () => {
    const rng = mulberry32(500);
    const points = poissonDisc(rng, 50, 200, 25);
    // Poisson disc may not hit exact count but should be close
    assert.ok(points.length >= 30, `Too few points: ${points.length}`);
    assert.ok(points.length <= 80, `Too many points: ${points.length}`);
  });
});

// ─── Hyperlane Generation ──────────────────────────────────────

describe('generateHyperlanes', () => {
  it('produces a connected graph', () => {
    const rng = mulberry32(600);
    const systems = poissonDisc(rng, 20, 150, 25).map((p, i) => ({ ...p, id: i }));
    const edges = generateHyperlanes(systems, rng);

    // BFS connectivity check
    const adj = new Map();
    for (const s of systems) adj.set(s.id, []);
    for (const [a, b] of edges) {
      adj.get(a).push(b);
      adj.get(b).push(a);
    }
    const visited = new Set();
    const queue = [0];
    visited.add(0);
    while (queue.length > 0) {
      const node = queue.shift();
      for (const neighbor of adj.get(node)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    assert.strictEqual(visited.size, systems.length, 'Graph should be fully connected');
  });

  it('each system has at least 2 connections', () => {
    const rng = mulberry32(700);
    const systems = poissonDisc(rng, 30, 200, 30).map((p, i) => ({ ...p, id: i }));
    const edges = generateHyperlanes(systems, rng);

    const degree = new Map();
    for (const s of systems) degree.set(s.id, 0);
    for (const [a, b] of edges) {
      degree.set(a, degree.get(a) + 1);
      degree.set(b, degree.get(b) + 1);
    }
    for (const [id, deg] of degree) {
      assert.ok(deg >= 2, `System ${id} has only ${deg} connections`);
    }
  });

  it('no system has more than 6 connections', () => {
    const rng = mulberry32(800);
    const systems = poissonDisc(rng, 40, 200, 25).map((p, i) => ({ ...p, id: i }));
    const edges = generateHyperlanes(systems, rng);

    const degree = new Map();
    for (const s of systems) degree.set(s.id, 0);
    for (const [a, b] of edges) {
      degree.set(a, degree.get(a) + 1);
      degree.set(b, degree.get(b) + 1);
    }
    for (const [id, deg] of degree) {
      assert.ok(deg <= 6, `System ${id} has ${deg} connections (max 6)`);
    }
  });

  it('returns empty for 0 or 1 systems', () => {
    const rng = mulberry32(900);
    assert.deepStrictEqual(generateHyperlanes([], rng), []);
    assert.deepStrictEqual(generateHyperlanes([{ id: 0, x: 0, z: 0 }], rng), []);
  });
});

// ─── Full Galaxy Generation ────────────────────────────────────

describe('generateGalaxy', () => {
  it('generates a small galaxy with correct structure', () => {
    const galaxy = generateGalaxy({ size: 'small', seed: 1000 });
    assert.ok(galaxy.systems.length > 0, 'Should have systems');
    assert.ok(galaxy.hyperlanes.length > 0, 'Should have hyperlanes');
    assert.strictEqual(galaxy.size, 'small');
    assert.strictEqual(galaxy.seed, 1000);

    // Check system structure
    const sys = galaxy.systems[0];
    assert.ok(typeof sys.id === 'number');
    assert.ok(typeof sys.name === 'string' && sys.name.length > 0);
    assert.ok(typeof sys.x === 'number');
    assert.ok(typeof sys.z === 'number');
    assert.ok(Object.keys(STAR_TYPES).includes(sys.starType));
    assert.ok(Array.isArray(sys.planets) && sys.planets.length >= 1);
  });

  it('is deterministic with same seed', () => {
    const g1 = generateGalaxy({ size: 'small', seed: 2000 });
    const g2 = generateGalaxy({ size: 'small', seed: 2000 });
    assert.strictEqual(g1.systems.length, g2.systems.length);
    assert.strictEqual(g1.hyperlanes.length, g2.hyperlanes.length);
    for (let i = 0; i < g1.systems.length; i++) {
      assert.strictEqual(g1.systems[i].name, g2.systems[i].name);
      assert.strictEqual(g1.systems[i].x, g2.systems[i].x);
      assert.strictEqual(g1.systems[i].z, g2.systems[i].z);
      assert.strictEqual(g1.systems[i].starType, g2.systems[i].starType);
      assert.strictEqual(g1.systems[i].planets.length, g2.systems[i].planets.length);
    }
  });

  it('different seeds produce different galaxies', () => {
    const g1 = generateGalaxy({ size: 'small', seed: 3000 });
    const g2 = generateGalaxy({ size: 'small', seed: 3001 });
    // At least some system names should differ
    let diffs = 0;
    const len = Math.min(g1.systems.length, g2.systems.length);
    for (let i = 0; i < len; i++) {
      if (g1.systems[i].name !== g2.systems[i].name) diffs++;
    }
    assert.ok(diffs > 0, 'Different seeds should produce different system names');
  });

  it('generates correct number of systems for each size', () => {
    for (const [size, config] of Object.entries(GALAXY_SIZES)) {
      const galaxy = generateGalaxy({ size, seed: 4000 });
      // Poisson disc may not hit exact target, but should be within ~30%
      const target = config.systems;
      assert.ok(galaxy.systems.length >= target * 0.5,
        `${size} galaxy has too few systems: ${galaxy.systems.length} (target: ${target})`);
      assert.ok(galaxy.systems.length <= target * 1.5,
        `${size} galaxy has too many systems: ${galaxy.systems.length} (target: ${target})`);
    }
  });

  it('all systems have valid planets', () => {
    const galaxy = generateGalaxy({ size: 'small', seed: 5000 });
    for (const sys of galaxy.systems) {
      assert.ok(sys.planets.length >= 1 && sys.planets.length <= 6,
        `System ${sys.name} has ${sys.planets.length} planets`);
      for (const planet of sys.planets) {
        assert.ok(Object.keys(PLANET_TYPES).includes(planet.type),
          `Invalid planet type: ${planet.type}`);
        assert.ok(typeof planet.orbit === 'number' && planet.orbit >= 1);
        assert.ok(typeof planet.size === 'number' && planet.size >= 0);
        assert.ok(typeof planet.habitability === 'number');
        assert.strictEqual(planet.surveyed, false);
      }
    }
  });

  it('galaxy has habitable planets', () => {
    const galaxy = generateGalaxy({ size: 'small', seed: 6000 });
    let habitableCount = 0;
    for (const sys of galaxy.systems) {
      for (const p of sys.planets) {
        if (p.habitability >= 60) habitableCount++;
      }
    }
    assert.ok(habitableCount >= 5, `Too few habitable planets: ${habitableCount}`);
  });

  it('hyperlanes reference valid system indices', () => {
    const galaxy = generateGalaxy({ size: 'small', seed: 7000 });
    const n = galaxy.systems.length;
    for (const [a, b] of galaxy.hyperlanes) {
      assert.ok(a >= 0 && a < n, `Hyperlane endpoint ${a} out of range`);
      assert.ok(b >= 0 && b < n, `Hyperlane endpoint ${b} out of range`);
      assert.ok(a !== b, 'Self-loop detected');
    }
  });
});

// ─── Starting System Assignment ────────────────────────────────

describe('assignStartingSystems', () => {
  it('assigns one system per player', () => {
    const galaxy = generateGalaxy({ size: 'small', seed: 8000 });
    const assignments = assignStartingSystems(galaxy, ['p1', 'p2', 'p3']);
    assert.strictEqual(Object.keys(assignments).length, 3);
    assert.ok(assignments.p1 != null);
    assert.ok(assignments.p2 != null);
    assert.ok(assignments.p3 != null);
  });

  it('assigns different systems to each player', () => {
    const galaxy = generateGalaxy({ size: 'small', seed: 9000 });
    const assignments = assignStartingSystems(galaxy, ['p1', 'p2', 'p3', 'p4']);
    const systemIds = Object.values(assignments);
    const unique = new Set(systemIds);
    assert.strictEqual(unique.size, systemIds.length, 'Each player should get a unique system');
  });

  it('marks starting systems as owned and surveyed', () => {
    const galaxy = generateGalaxy({ size: 'small', seed: 10000 });
    const assignments = assignStartingSystems(galaxy, ['p1', 'p2']);
    for (const [playerId, systemId] of Object.entries(assignments)) {
      const sys = galaxy.systems[systemId];
      assert.strictEqual(sys.owner, playerId);
      assert.strictEqual(sys.surveyed[playerId], true);
    }
  });

  it('spreads players apart', () => {
    const galaxy = generateGalaxy({ size: 'medium', seed: 11000 });
    const assignments = assignStartingSystems(galaxy, ['p1', 'p2']);
    const s1 = galaxy.systems[assignments.p1];
    const s2 = galaxy.systems[assignments.p2];
    const dist = Math.sqrt((s1.x - s2.x) ** 2 + (s1.z - s2.z) ** 2);
    // Should be spread apart — at least 30% of galaxy radius
    const minExpected = GALAXY_SIZES.medium.radius * 0.3;
    assert.ok(dist >= minExpected, `Players too close: ${dist} (expected > ${minExpected})`);
  });

  it('handles empty player list', () => {
    const galaxy = generateGalaxy({ size: 'small', seed: 12000 });
    const assignments = assignStartingSystems(galaxy, []);
    assert.deepStrictEqual(assignments, {});
  });
});

// ─── Best Habitable Planet ─────────────────────────────────────

describe('bestHabitablePlanet', () => {
  it('picks highest habitability planet', () => {
    const system = {
      planets: [
        { type: 'barren', habitability: 0, size: 10 },
        { type: 'arctic', habitability: 60, size: 12 },
        { type: 'continental', habitability: 80, size: 14 },
      ],
    };
    const best = bestHabitablePlanet(system);
    assert.strictEqual(best.type, 'continental');
    assert.strictEqual(best.habitability, 80);
  });

  it('picks larger planet on tie', () => {
    const system = {
      planets: [
        { type: 'continental', habitability: 80, size: 10 },
        { type: 'ocean', habitability: 80, size: 16 },
      ],
    };
    const best = bestHabitablePlanet(system);
    assert.strictEqual(best.size, 16);
  });

  it('returns null for system with only uninhabitable planets', () => {
    const system = {
      planets: [
        { type: 'barren', habitability: 0, size: 10 },
        { type: 'gasGiant', habitability: 0, size: 0 },
      ],
    };
    assert.strictEqual(bestHabitablePlanet(system), null);
  });
});

// ─── Integration with GameEngine ───────────────────────────────

describe('Galaxy integration with GameEngine', () => {
  const { GameEngine } = require('../../server/game-engine');

  function makeRoom(playerCount = 1) {
    const room = {
      id: 'test-room',
      matchTimer: 0,
      galaxySize: 'small',
      players: new Map(),
    };
    for (let i = 1; i <= playerCount; i++) {
      room.players.set(i, { id: i, name: `Player ${i}` });
    }
    return room;
  }

  it('game engine generates galaxy on start', () => {
    const engine = new GameEngine(makeRoom(), { galaxySeed: 42 });
    assert.ok(engine.galaxy, 'Engine should have a galaxy');
    assert.ok(engine.galaxy.systems.length > 0, 'Galaxy should have systems');
    assert.ok(engine.galaxy.hyperlanes.length > 0, 'Galaxy should have hyperlanes');
  });

  it('starting colony is placed on a galaxy planet', () => {
    const engine = new GameEngine(makeRoom(), { galaxySeed: 42 });
    const state = engine.getState();
    const colony = state.colonies[0];
    assert.ok(colony.systemId != null, 'Colony should have a systemId');
    assert.ok(colony.name.length > 0, 'Colony should have a name');
  });

  it('getInitState includes galaxy data', () => {
    const engine = new GameEngine(makeRoom(), { galaxySeed: 42 });
    const initState = engine.getInitState();
    assert.ok(initState.galaxy, 'initState should include galaxy');
    assert.ok(Array.isArray(initState.galaxy.systems));
    assert.ok(Array.isArray(initState.galaxy.hyperlanes));
    assert.strictEqual(initState.galaxy.seed, 42);
  });

  it('multiplayer assigns different starting systems', () => {
    const engine = new GameEngine(makeRoom(3), { galaxySeed: 42 });
    const state = engine.getState();
    const systemIds = state.colonies.map(c => c.systemId);
    const unique = new Set(systemIds);
    assert.strictEqual(unique.size, 3, 'Each player should start in a different system');
  });

  it('galaxy generation is deterministic via seed', () => {
    const e1 = new GameEngine(makeRoom(), { galaxySeed: 99 });
    const e2 = new GameEngine(makeRoom(), { galaxySeed: 99 });
    assert.strictEqual(e1.galaxy.systems.length, e2.galaxy.systems.length);
    for (let i = 0; i < e1.galaxy.systems.length; i++) {
      assert.strictEqual(e1.galaxy.systems[i].name, e2.galaxy.systems[i].name);
    }
  });
});

// ─── weightedPick ─────────────────────────────────────────────

describe('weightedPick', () => {
  it('returns a valid key from the items', () => {
    const rng = mulberry32(50);
    const items = { a: { weight: 1 }, b: { weight: 1 }, c: { weight: 1 } };
    for (let i = 0; i < 50; i++) {
      const result = weightedPick(rng, items);
      assert.ok(['a', 'b', 'c'].includes(result), `Got unexpected key: ${result}`);
    }
  });

  it('heavily weighted item is picked most often', () => {
    const rng = mulberry32(60);
    const items = { rare: { weight: 1 }, common: { weight: 99 } };
    let commonCount = 0;
    for (let i = 0; i < 200; i++) {
      if (weightedPick(rng, items) === 'common') commonCount++;
    }
    assert.ok(commonCount > 150, `Common should dominate, got ${commonCount}/200`);
  });

  it('single item always returns that item', () => {
    const rng = mulberry32(70);
    const items = { only: { weight: 5 } };
    assert.strictEqual(weightedPick(rng, items), 'only');
  });
});

// ─── Name Generation — Edge Cases ─────────────────────────────

describe('generateName — edge cases', () => {
  it('falls back to System-N when all name combos are taken', () => {
    const rng = mulberry32(80);
    // Pre-fill the used set with every possible prefix+suffix combo
    // so that all 100 attempts in generateName will collide
    const used = new Set();
    const prefixes = [
      'Sol', 'Veg', 'Sir', 'Bet', 'Alp', 'Tau', 'Kep', 'Pro', 'Arc',
      'Ald', 'Pol', 'Rig', 'Den', 'Alt', 'Ant', 'Cap', 'For', 'Lyn',
      'Nor', 'Pav', 'Ser', 'Vel', 'Zet', 'Omi', 'Sig', 'Del', 'Gam',
      'Eta', 'The', 'Iot', 'Kap', 'Lam', 'Rho', 'Phi', 'Chi', 'Psi',
    ];
    const suffixes = [
      'aris', 'ion', 'ius', 'ara', 'eon', 'ica', 'una', 'oris',
      'enna', 'alis', 'axis', 'exa', 'ura', 'entis', 'olus',
      'andri', 'ella', 'anis', 'eron', 'ova', 'ux', 'ix', 'ax',
      'or', 'en', 'an', 'us', 'is', 'os', 'um', 'es',
    ];
    const designations = [
      'Prime', 'Major', 'Minor', 'Alpha', 'Beta', 'Gamma',
      'I', 'II', 'III', 'IV', 'V', 'VI', 'VII',
    ];
    for (const p of prefixes) {
      for (const s of suffixes) {
        used.add(p + s);
        for (const d of designations) {
          used.add(p + s + ' ' + d);
        }
      }
    }
    const name = generateName(rng, used);
    assert.ok(name.startsWith('System-'), `Expected System-N fallback, got: ${name}`);
  });
});

// ─── Planet Generation Details ────────────────────────────────

describe('generatePlanets detail checks', () => {
  it('gas giants have size 0', () => {
    // Generate galaxies until we find a gas giant
    let found = false;
    for (let i = 0; i < 200 && !found; i++) {
      const galaxy = generateGalaxy({ size: 'small', seed: 1000 + i });
      for (const sys of galaxy.systems) {
        for (const p of sys.planets) {
          if (p.type === 'gasGiant') {
            assert.strictEqual(p.size, 0, 'Gas giant should have size 0');
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
    assert.ok(found, 'Should find at least one gas giant across multiple galaxies');
  });

  it('habitable planets have size 8-20', () => {
    const galaxy = generateGalaxy({ size: 'medium', seed: 2222 });
    for (const sys of galaxy.systems) {
      for (const p of sys.planets) {
        if (p.habitability >= 60 && p.type !== 'gasGiant') {
          assert.ok(p.size >= 8 && p.size <= 20,
            `Habitable ${p.type} has invalid size ${p.size}`);
        }
      }
    }
  });

  it('barren/molten planets have size 6-15', () => {
    const galaxy = generateGalaxy({ size: 'medium', seed: 3333 });
    for (const sys of galaxy.systems) {
      for (const p of sys.planets) {
        if (p.habitability === 0 && p.type !== 'gasGiant') {
          assert.ok(p.size >= 6 && p.size <= 15,
            `Uninhabitable ${p.type} has invalid size ${p.size}`);
        }
      }
    }
  });

  it('all planets have orbit numbers 1 through count', () => {
    const galaxy = generateGalaxy({ size: 'small', seed: 4444 });
    for (const sys of galaxy.systems) {
      for (let i = 0; i < sys.planets.length; i++) {
        assert.strictEqual(sys.planets[i].orbit, i + 1,
          `Planet orbit mismatch in ${sys.name}`);
      }
    }
  });
});

// ─── Galaxy Generation — Default Options ──────────────────────

describe('generateGalaxy — defaults and invalid input', () => {
  it('generates a galaxy with no options (all defaults)', () => {
    const galaxy = generateGalaxy();
    assert.ok(galaxy.systems.length > 0);
    assert.ok(galaxy.hyperlanes.length > 0);
    assert.strictEqual(galaxy.size, 'small');
    assert.ok(typeof galaxy.seed === 'number');
  });

  it('falls back to small for unknown galaxy size', () => {
    const galaxy = generateGalaxy({ size: 'gigantic', seed: 5555 });
    // Should use GALAXY_SIZES.small fallback
    assert.ok(galaxy.systems.length >= 25 && galaxy.systems.length <= 75,
      `System count ${galaxy.systems.length} not in small range`);
  });

  it('all system names are unique', () => {
    const galaxy = generateGalaxy({ size: 'medium', seed: 6666 });
    const names = galaxy.systems.map(s => s.name);
    const unique = new Set(names);
    assert.strictEqual(unique.size, names.length, 'Duplicate system names found');
  });

  it('no duplicate hyperlanes', () => {
    const galaxy = generateGalaxy({ size: 'small', seed: 7777 });
    const edgeSet = new Set();
    for (const [a, b] of galaxy.hyperlanes) {
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      assert.ok(!edgeSet.has(key), `Duplicate hyperlane: ${key}`);
      edgeSet.add(key);
    }
  });
});

// ─── Starting System Assignment — Edge Cases ──────────────────

describe('assignStartingSystems — edge cases', () => {
  it('assigns starting systems with habitable planets (>=60 habitability)', () => {
    const galaxy = generateGalaxy({ size: 'small', seed: 8888 });
    const assignments = assignStartingSystems(galaxy, ['p1', 'p2']);
    for (const [, systemId] of Object.entries(assignments)) {
      const sys = galaxy.systems[systemId];
      const hasHabitable = sys.planets.some(p => p.habitability >= 60);
      assert.ok(hasHabitable,
        `Starting system ${sys.name} has no habitable planet`);
    }
  });

  it('marks all starting system planets as surveyed', () => {
    const g = generateGalaxy({ size: 'small', seed: 10101 });
    const a = assignStartingSystems(g, ['p1']);
    const startSys = g.systems[a.p1];
    for (const planet of startSys.planets) {
      assert.strictEqual(planet.surveyed, true,
        `Planet orbit ${planet.orbit} in starting system should be surveyed`);
    }
  });

  it('handles more players than habitable systems gracefully', () => {
    // Create a tiny galaxy manually with few habitable systems
    const galaxy = {
      systems: [
        { id: 0, x: 0, z: 0, planets: [{ habitability: 80, size: 12, surveyed: false }], owner: null, surveyed: {} },
        { id: 1, x: 100, z: 0, planets: [{ habitability: 0, size: 10, surveyed: false }], owner: null, surveyed: {} },
        { id: 2, x: 0, z: 100, planets: [{ habitability: 0, size: 10, surveyed: false }], owner: null, surveyed: {} },
      ],
      hyperlanes: [[0, 1], [1, 2]],
    };
    // 3 players but only 1 habitable system — should fall back to using all systems
    const assignments = assignStartingSystems(galaxy, ['p1', 'p2', 'p3']);
    assert.strictEqual(Object.keys(assignments).length, 3);
    const ids = new Set(Object.values(assignments));
    assert.strictEqual(ids.size, 3, 'Each player gets a unique system');
  });
});

// ─── bestHabitablePlanet — Boundary Cases ─────────────────────

describe('bestHabitablePlanet — boundary cases', () => {
  it('returns planet with exactly 20 habitability (minimum threshold)', () => {
    const system = {
      planets: [
        { type: 'barren', habitability: 0, size: 10 },
        { type: 'arid', habitability: 20, size: 8 },
      ],
    };
    const best = bestHabitablePlanet(system);
    assert.ok(best !== null);
    assert.strictEqual(best.habitability, 20);
  });

  it('returns null for planet with habitability 19 (below threshold)', () => {
    const system = {
      planets: [
        { type: 'barren', habitability: 19, size: 10 },
      ],
    };
    assert.strictEqual(bestHabitablePlanet(system), null);
  });

  it('handles empty planets array', () => {
    const system = { planets: [] };
    assert.strictEqual(bestHabitablePlanet(system), null);
  });
});

// ─── GameEngine Galaxy Integration — Deep Checks ──────────────

describe('GameEngine galaxy integration — deep checks', () => {
  const { GameEngine } = require('../../server/game-engine');

  function makeRoom(playerCount = 1) {
    const room = {
      id: 'test-room',
      matchTimer: 0,
      galaxySize: 'small',
      players: new Map(),
    };
    for (let i = 1; i <= playerCount; i++) {
      room.players.set(i, { id: i, name: `Player ${i}` });
    }
    return room;
  }

  it('colony systemId matches an actual galaxy system', () => {
    const engine = new GameEngine(makeRoom(), { galaxySeed: 42 });
    const state = engine.getState();
    const colony = state.colonies[0];
    const systemIds = engine.galaxy.systems.map(s => s.id);
    assert.ok(systemIds.includes(colony.systemId),
      `Colony systemId ${colony.systemId} not found in galaxy systems`);
  });

  it('colony planet type matches the galaxy planet data', () => {
    const engine = new GameEngine(makeRoom(), { galaxySeed: 42 });
    const colony = [...engine.colonies.values()][0];
    const system = engine.galaxy.systems[colony.systemId];
    const colonizedPlanet = system.planets.find(p => p.colonized);
    assert.ok(colonizedPlanet, 'Starting planet should be marked as colonized');
    assert.strictEqual(colony.planet.type, colonizedPlanet.type);
    assert.strictEqual(colony.planet.size, colonizedPlanet.size);
    assert.strictEqual(colony.planet.habitability, colonizedPlanet.habitability);
  });

  it('starting planet is marked colonized with correct owner', () => {
    const engine = new GameEngine(makeRoom(), { galaxySeed: 42 });
    const colony = [...engine.colonies.values()][0];
    const system = engine.galaxy.systems[colony.systemId];
    const colonizedPlanet = system.planets.find(p => p.colonized);
    assert.strictEqual(colonizedPlanet.colonyOwner, 1);
  });

  it('getInitState galaxy does not include surveyed hash (only owner)', () => {
    const engine = new GameEngine(makeRoom(), { galaxySeed: 42 });
    const initState = engine.getInitState();
    // Systems in initState should have owner but the surveyed hash is stripped
    const sys = initState.galaxy.systems[0];
    assert.ok('owner' in sys, 'Should include owner');
    assert.ok(!('surveyed' in sys), 'Should not include surveyed hash in client payload');
  });

  it('room galaxySize setting is used by game engine', () => {
    const room = makeRoom();
    room.galaxySize = 'medium';
    const engine = new GameEngine(room, { galaxySeed: 42 });
    assert.strictEqual(engine.galaxy.size, 'medium');
    assert.ok(engine.galaxy.systems.length >= 50,
      `Medium galaxy should have >=50 systems, got ${engine.galaxy.systems.length}`);
  });
});

// ─── Room Manager Galaxy Size Validation ──────────────────────

describe('Room Manager — galaxy size validation', () => {
  const { RoomManager } = require('../../server/room-manager');

  it('accepts valid galaxy sizes', () => {
    const rm = new RoomManager();
    for (const size of ['small', 'medium', 'large']) {
      const room = rm.createRoom(`host-${size}`, `Host`, `Room ${size}`, { galaxySize: size });
      assert.strictEqual(room.galaxySize, size);
    }
  });

  it('defaults to small for invalid galaxy size', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('host1', 'Host', 'Room', { galaxySize: 'huge' });
    assert.strictEqual(room.galaxySize, 'small');
  });

  it('defaults to small when galaxy size not specified', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('host2', 'Host', 'Room', {});
    assert.strictEqual(room.galaxySize, 'small');
  });
});
