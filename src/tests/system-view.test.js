const { describe, it } = require('node:test');
const assert = require('node:assert');

// system-view.js requires THREE in browser — in Node it exports the module API
// but skips rendering. We test the module structure and that init data flows work.
const SystemView = require('../public/js/system-view.js');

describe('SystemView module', () => {
  it('should export all required API methods', () => {
    assert.strictEqual(typeof SystemView.init, 'function');
    assert.strictEqual(typeof SystemView.buildSystem, 'function');
    assert.strictEqual(typeof SystemView.render, 'function');
    assert.strictEqual(typeof SystemView.destroy, 'function');
    assert.strictEqual(typeof SystemView.getSystemData, 'function');
    assert.strictEqual(typeof SystemView.getSelectedPlanet, 'function');
    assert.strictEqual(typeof SystemView.setOnPlanetSelect, 'function');
    assert.strictEqual(typeof SystemView.setOnBack, 'function');
  });

  it('should return null system data before buildSystem', () => {
    assert.strictEqual(SystemView.getSystemData(), null);
  });

  it('should return null selected planet when nothing selected', () => {
    assert.strictEqual(SystemView.getSelectedPlanet(), null);
  });

  it('should accept setOnPlanetSelect callback without error', () => {
    assert.doesNotThrow(() => {
      SystemView.setOnPlanetSelect(() => {});
    });
  });

  it('should accept setOnBack callback without error', () => {
    assert.doesNotThrow(() => {
      SystemView.setOnBack(() => {});
    });
  });

  it('should not throw on init without DOM/THREE', () => {
    // init gracefully returns when container or THREE missing
    assert.doesNotThrow(() => {
      SystemView.init(null);
    });
  });

  it('should not throw on buildSystem without scene', () => {
    assert.doesNotThrow(() => {
      SystemView.buildSystem({
        id: 0, name: 'Test', starType: 'yellow', starColor: '#f9d71c',
        planets: [{ orbit: 1, type: 'continental', size: 16, habitability: 80 }],
      });
    });
  });

  it('should not throw on render without scene', () => {
    assert.doesNotThrow(() => {
      SystemView.render();
    });
  });

  it('should not throw on destroy without renderer', () => {
    assert.doesNotThrow(() => {
      SystemView.destroy();
    });
  });
});

// Test that system data from game-engine getInitState has the correct shape for SystemView
describe('SystemView data integration', () => {
  const { GameEngine } = require('../../server/game-engine.js');

  function createEngine(seed) {
    const players = new Map();
    players.set('p1', { name: 'Player 1' });
    const room = { players, galaxySize: 'small', matchTimer: 0 };
    return new GameEngine(room, { tickRate: 10, galaxySeed: seed });
  }

  it('should receive system data with planets from gameInit', () => {
    const engine = createEngine(42);

    const initState = engine.getInitState();
    assert.ok(initState.galaxy, 'should have galaxy data');
    assert.ok(initState.galaxy.systems.length > 0, 'should have systems');

    // Every system should have planets array
    for (const sys of initState.galaxy.systems) {
      assert.ok(Array.isArray(sys.planets), `System ${sys.id} should have planets array`);
      assert.ok(sys.starType, `System ${sys.id} should have starType`);
      assert.ok(sys.starColor, `System ${sys.id} should have starColor`);
      assert.ok(typeof sys.name === 'string', `System ${sys.id} should have name`);

      for (const planet of sys.planets) {
        assert.ok(typeof planet.orbit === 'number', 'planet should have orbit number');
        assert.ok(typeof planet.type === 'string', 'planet should have type string');
        assert.ok(typeof planet.size === 'number', 'planet should have size number');
        assert.ok(typeof planet.habitability === 'number', 'planet should have habitability number');
      }
    }
  });

  it('should have planets with valid orbit numbers (1-based)', () => {
    const engine = createEngine(123);

    const initState = engine.getInitState();
    for (const sys of initState.galaxy.systems) {
      for (const planet of sys.planets) {
        assert.ok(planet.orbit >= 1, `orbit should be >= 1, got ${planet.orbit}`);
      }
    }
  });

  it('should have known planet types', () => {
    const VALID_TYPES = ['continental', 'ocean', 'tropical', 'arctic', 'desert', 'arid', 'barren', 'molten', 'gasGiant'];
    const engine = createEngine(999);

    const initState = engine.getInitState();
    for (const sys of initState.galaxy.systems) {
      for (const planet of sys.planets) {
        assert.ok(VALID_TYPES.includes(planet.type), `Unknown planet type: ${planet.type}`);
      }
    }
  });

  it('gas giants should have size 0', () => {
    const engine = createEngine(42);

    const initState = engine.getInitState();
    let foundGasGiant = false;
    for (const sys of initState.galaxy.systems) {
      for (const planet of sys.planets) {
        if (planet.type === 'gasGiant') {
          foundGasGiant = true;
          assert.strictEqual(planet.size, 0, 'gas giant should have size 0');
        }
      }
    }
    // With seed 42 there should be at least one gas giant in 50 systems
    assert.ok(foundGasGiant, 'Should find at least one gas giant with seed 42');
  });
});
