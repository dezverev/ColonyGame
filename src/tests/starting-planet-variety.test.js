const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, PLANET_TYPES } = require('../../server/game-engine');

const HABITABLE_TYPES = ['continental', 'ocean', 'tropical', 'arctic', 'desert', 'arid'];

function makeRoom(playerCount = 2, options = {}) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { id: i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 1, maxPlayers: 4, status: 'playing', players, ...options };
}

function getColonies(engine) {
  return [...engine.colonies.values()];
}

describe('Starting Planet Variety', () => {
  it('starting planet type is a habitable type', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = getColonies(engine)[0];
    assert.ok(HABITABLE_TYPES.includes(colony.planet.type),
      `Starting planet type "${colony.planet.type}" should be habitable`);
  });

  it('starting planet size is between 12 and 20', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = getColonies(engine)[0];
    assert.ok(colony.planet.size >= 12, `Starting planet size ${colony.planet.size} should be >= 12`);
    assert.ok(colony.planet.size <= 20, `Starting planet size ${colony.planet.size} should be <= 20`);
  });

  it('starting planet habitability matches its type', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = getColonies(engine)[0];
    const expected = PLANET_TYPES[colony.planet.type].habitability;
    assert.strictEqual(colony.planet.habitability, expected,
      `Habitability should match type ${colony.planet.type}`);
  });

  it('fairness mode gives all players same planet type and size', () => {
    // fairStartingPlanets defaults to true
    const engine = new GameEngine(makeRoom(4), { tickRate: 10 });
    const colonies = getColonies(engine);
    const types = colonies.map(c => c.planet.type);
    const sizes = colonies.map(c => c.planet.size);
    // All types should be the same
    assert.strictEqual(new Set(types).size, 1,
      `All players should have same planet type in fair mode, got: ${types.join(', ')}`);
    // All sizes should be the same
    assert.strictEqual(new Set(sizes).size, 1,
      `All players should have same planet size in fair mode, got: ${sizes.join(', ')}`);
  });

  it('fairness mode off allows different planet types/sizes', () => {
    // Run multiple times to check randomness produces variety
    const typeSeen = new Set();
    const sizeSeen = new Set();
    for (let trial = 0; trial < 20; trial++) {
      const engine = new GameEngine(makeRoom(4, { fairStartingPlanets: false }), { tickRate: 10 });
      const colonies = getColonies(engine);
      for (const c of colonies) {
        typeSeen.add(c.planet.type);
        sizeSeen.add(c.planet.size);
      }
    }
    // With 80 random draws from 6 types, should see more than 1
    assert.ok(typeSeen.size > 1,
      `Non-fair mode should produce variety in planet types, only saw: ${[...typeSeen].join(', ')}`);
    assert.ok(sizeSeen.size > 1,
      `Non-fair mode should produce variety in planet sizes, only saw: ${[...sizeSeen].join(', ')}`);
  });

  it('non-fair mode planets still have valid types and sizes', () => {
    const engine = new GameEngine(makeRoom(4, { fairStartingPlanets: false }), { tickRate: 10 });
    const colonies = getColonies(engine);
    for (const c of colonies) {
      assert.ok(HABITABLE_TYPES.includes(c.planet.type),
        `Planet type "${c.planet.type}" should be habitable`);
      assert.ok(c.planet.size >= 12 && c.planet.size <= 20,
        `Planet size ${c.planet.size} should be 12-20`);
    }
  });

  it('galaxy planet data is updated to match starting planet', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = getColonies(engine)[0];
    const system = engine.galaxy.systems[colony.systemId];
    const colonizedPlanet = system.planets.find(p => p.colonized);
    assert.ok(colonizedPlanet, 'Should find colonized planet in system');
    assert.strictEqual(colonizedPlanet.type, colony.planet.type,
      'Galaxy planet type should match colony planet type');
    assert.strictEqual(colonizedPlanet.size, colony.planet.size,
      'Galaxy planet size should match colony planet size');
  });

  it('serialized state reflects starting planet variety', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = getColonies(engine)[0];
    const state = engine.getState();
    const serialized = state.colonies[0];
    assert.strictEqual(serialized.planet.type, colony.planet.type);
    assert.strictEqual(serialized.planet.size, colony.planet.size);
  });

  it('fair mode produces variety across games', () => {
    const typesSeen = new Set();
    const sizesSeen = new Set();
    for (let i = 0; i < 30; i++) {
      const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
      const colony = getColonies(engine)[0];
      typesSeen.add(colony.planet.type);
      sizesSeen.add(colony.planet.size);
    }
    // With 30 trials from 6 types, should see more than 1 type
    assert.ok(typesSeen.size > 1,
      `Fair mode should still produce different types across games, only saw: ${[...typesSeen].join(', ')}`);
    assert.ok(sizesSeen.size > 1,
      `Fair mode should still produce different sizes across games, only saw: ${[...sizesSeen].join(', ')}`);
  });

  it('room defaults to fairStartingPlanets=true', () => {
    // Room without explicit setting
    const engine = new GameEngine(makeRoom(2), { tickRate: 10 });
    const colonies = getColonies(engine);
    const types = colonies.map(c => c.planet.type);
    const sizes = colonies.map(c => c.planet.size);
    assert.strictEqual(new Set(types).size, 1, 'Default should be fair mode');
    assert.strictEqual(new Set(sizes).size, 1, 'Default should be fair mode');
  });

  it('starting colony retains all standard properties', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const colony = getColonies(engine)[0];
    assert.strictEqual(colony.isStartingColony, true);
    assert.strictEqual(colony.districts.length, 4, 'Should have 4 pre-built districts');
    assert.ok(colony.pops >= 8, 'Should have starting pops');
    assert.ok(colony.systemId != null, 'Should be placed in a system');
  });
});

describe('Starting Planet Variety — Room Settings', () => {
  const { RoomManager } = require('../../server/room-manager');

  it('room defaults fairStartingPlanets to true', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Test', 'host1', 'Host');
    assert.strictEqual(room.fairStartingPlanets, true);
  });

  it('room respects fairStartingPlanets=false', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Test', 'host1', 'Host', { fairStartingPlanets: false });
    assert.strictEqual(room.fairStartingPlanets, false);
  });

  it('room respects fairStartingPlanets=true explicitly', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Test', 'host1', 'Host', { fairStartingPlanets: true });
    assert.strictEqual(room.fairStartingPlanets, true);
  });
});
