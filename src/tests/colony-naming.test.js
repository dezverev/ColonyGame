const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine, COLONY_NAMES, PLANET_TYPES,
} = require('../../server/game-engine');

// Helper: create a 2-player game engine
function createEngine() {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  players.set('p2', { name: 'Player 2' });
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  const engine = new GameEngine(room, { tickRate: 10 });
  return engine;
}

// Helper: get first colony for a player
function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(colonyIds[0]);
}

// ── COLONY_NAMES constant ──

describe('Colony Names Constant', () => {
  it('should have names for every habitable planet type', () => {
    const habitableTypes = Object.keys(PLANET_TYPES).filter(t => PLANET_TYPES[t].habitability > 0);
    for (const type of habitableTypes) {
      assert.ok(COLONY_NAMES[type], `Missing names for planet type: ${type}`);
      assert.ok(Array.isArray(COLONY_NAMES[type]), `Names for ${type} should be array`);
    }
  });

  it('should have at least 8 names per planet type', () => {
    for (const [type, names] of Object.entries(COLONY_NAMES)) {
      assert.ok(names.length >= 8, `${type} has only ${names.length} names, need 8+`);
    }
  });

  it('should have no duplicate names within a planet type', () => {
    for (const [type, names] of Object.entries(COLONY_NAMES)) {
      const unique = new Set(names);
      assert.strictEqual(unique.size, names.length, `${type} has duplicate names`);
    }
  });

  it('should have no duplicate names across all planet types', () => {
    const allNames = [];
    for (const names of Object.values(COLONY_NAMES)) {
      allNames.push(...names);
    }
    const unique = new Set(allNames);
    assert.strictEqual(unique.size, allNames.length, 'Duplicate names across planet types');
  });
});

// ── _generateColonyName method ──

describe('Colony Name Generation', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  it('should return a name from the correct planet type list', () => {
    const name = engine._generateColonyName('arctic');
    assert.ok(COLONY_NAMES.arctic.includes(name), `"${name}" not in arctic names`);
  });

  it('should not repeat names across multiple calls', () => {
    const names = new Set();
    for (let i = 0; i < 5; i++) {
      names.add(engine._generateColonyName('desert'));
    }
    assert.strictEqual(names.size, 5, 'Generated duplicate names');
  });

  it('should exhaust all names before using fallback', () => {
    const desertNames = COLONY_NAMES.desert;
    // Count how many desert names are already used by starting colonies
    const alreadyUsed = desertNames.filter(n => engine._usedColonyNames.has(n)).length;
    const remaining = desertNames.length - alreadyUsed;
    const generated = [];
    for (let i = 0; i < remaining; i++) {
      generated.push(engine._generateColonyName('desert'));
    }
    // All generated names should be from the list
    for (const name of generated) {
      assert.ok(desertNames.includes(name), `"${name}" not in desert names`);
    }
    // All names should be unique
    assert.strictEqual(new Set(generated).size, remaining);
    // Next call should be a fallback
    const fallback = engine._generateColonyName('desert');
    assert.ok(fallback.startsWith('Colony desert-'), `Should be fallback after exhaustion, got "${fallback}"`);
  });

  it('should use fallback naming when all names exhausted', () => {
    const oceanNames = COLONY_NAMES.ocean;
    // Exhaust all ocean names (some may already be used by starting colonies)
    for (let i = 0; i < oceanNames.length; i++) {
      engine._generateColonyName('ocean');
    }
    // Next one should be a fallback
    const fallback = engine._generateColonyName('ocean');
    assert.ok(fallback.startsWith('Colony ocean-'), `Fallback "${fallback}" should start with "Colony ocean-"`);
  });

  it('should generate unique fallback names', () => {
    const tropicalNames = COLONY_NAMES.tropical;
    // Exhaust all tropical names (some may already be used by starting colonies)
    for (let i = 0; i < tropicalNames.length; i++) {
      engine._generateColonyName('tropical');
    }
    const fb1 = engine._generateColonyName('tropical');
    const fb2 = engine._generateColonyName('tropical');
    assert.ok(fb1.startsWith('Colony tropical-'), `First fallback "${fb1}" should start with "Colony tropical-"`);
    assert.ok(fb2.startsWith('Colony tropical-'), `Second fallback "${fb2}" should start with "Colony tropical-"`);
    assert.notStrictEqual(fb1, fb2, 'Fallback names should be unique');
  });

  it('should fall back to continental names for unknown planet type', () => {
    const name = engine._generateColonyName('volcanic');
    assert.ok(COLONY_NAMES.continental.includes(name), `"${name}" should come from continental list for unknown type`);
  });

  it('should track used names in _usedColonyNames set', () => {
    assert.strictEqual(engine._usedColonyNames.size > 0, true, 'Starting colonies should use names');
    const before = engine._usedColonyNames.size;
    engine._generateColonyName('arid');
    assert.strictEqual(engine._usedColonyNames.size, before + 1);
  });
});

// ── Starting colony names ──

describe('Starting Colony Procedural Names', () => {
  it('should give starting colonies procedural names (not system + Colony)', () => {
    const engine = createEngine();
    const colony1 = getFirstColony(engine, 'p1');
    const colony2 = getFirstColony(engine, 'p2');
    // Names should not end with ' Colony' (old pattern)
    assert.ok(!colony1.name.endsWith(' Colony'), `Starting colony name "${colony1.name}" should be procedural, not system-based`);
    assert.ok(!colony2.name.endsWith(' Colony'), `Starting colony name "${colony2.name}" should be procedural, not system-based`);
  });

  it('should give different names to different players starting colonies', () => {
    const engine = createEngine();
    const colony1 = getFirstColony(engine, 'p1');
    const colony2 = getFirstColony(engine, 'p2');
    assert.notStrictEqual(colony1.name, colony2.name, 'Two starting colonies should have different names');
  });

  it('should use names from the correct planet type list', () => {
    const engine = createEngine();
    const colony1 = getFirstColony(engine, 'p1');
    const planetType = colony1.planet.type;
    const validNames = COLONY_NAMES[planetType];
    assert.ok(validNames.includes(colony1.name), `"${colony1.name}" not in ${planetType} names`);
  });
});

// ── Colony ship founding names ──

describe('Colony Ship Founding Procedural Names', () => {
  it('should give founded colonies procedural names', () => {
    const engine = createEngine();
    // Manually call _generateColonyName to simulate founding
    const name = engine._generateColonyName('ocean');
    assert.ok(COLONY_NAMES.ocean.includes(name), `Founded colony name "${name}" should be from ocean list`);
  });

  it('should not reuse names already taken by starting colonies', () => {
    const engine = createEngine();
    const usedByStart = new Set(engine._usedColonyNames);
    // Generate more names of the same type as starting colonies
    const colony1 = getFirstColony(engine, 'p1');
    const type = colony1.planet.type;
    const newName = engine._generateColonyName(type);
    assert.ok(!usedByStart.has(newName), `New colony name "${newName}" should not duplicate a starting colony name`);
  });
});

// ── Serialization ──

describe('Colony Name Serialization', () => {
  it('should include procedural name in player state JSON', () => {
    const engine = createEngine();
    const state = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(state);
    const colony = parsed.colonies[0];
    assert.ok(colony.name, 'Colony should have a name in serialized state');
    assert.ok(!colony.name.endsWith(' Colony'), `Serialized name "${colony.name}" should be procedural`);
  });
});
