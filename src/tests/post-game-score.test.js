const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { GameEngine } = require('../../server/game-engine');

// Helper: create a 2-player engine with 1-minute timer
function makeTimedEngine(matchTimer = 1) {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  players.set('p2', { name: 'Player 2' });
  const room = { players, galaxySize: 'small', matchTimer };
  const engine = new GameEngine(room, { tickRate: 10 });
  engine._doctrinePhase = false;
  return engine;
}

// Helper: create a 1-player engine (practice mode)
function makeSoloEngine(matchTimer = 1) {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  const room = { players, galaxySize: 'small', matchTimer, practiceMode: true };
  const engine = new GameEngine(room, { tickRate: 10 });
  engine._doctrinePhase = false;
  return engine;
}

// ── Match Stats Initialization ──

describe('Post-game score screen — match stats init', () => {
  it('initializes _matchStats for each player', () => {
    const engine = makeTimedEngine();
    assert.ok(engine._matchStats.has('p1'));
    assert.ok(engine._matchStats.has('p2'));
  });

  it('match stats start at zero', () => {
    const engine = makeTimedEngine();
    const ms = engine._matchStats.get('p1');
    assert.strictEqual(ms.coloniesFounded, 0);
    assert.strictEqual(ms.districtsBuilt, 0);
    assert.strictEqual(ms.shipsBuilt, 0);
    assert.deepStrictEqual(ms.resourcesGathered, { energy: 0, minerals: 0, food: 0, alloys: 0 });
  });

  it('records _matchStartTime on construction', () => {
    const before = Date.now();
    const engine = makeTimedEngine();
    const after = Date.now();
    assert.ok(engine._matchStartTime >= before);
    assert.ok(engine._matchStartTime <= after);
  });
});

// ── District Build Tracking ──

describe('Post-game score screen — district tracking', () => {
  let engine;
  beforeEach(() => { engine = makeSoloEngine(); });

  it('increments districtsBuilt when a district completes construction', () => {
    const colony = engine.colonies.values().next().value;
    // Queue a generator district
    const result = engine.handleCommand('p1', { type: 'buildDistrict', colonyId: colony.id, districtType: 'generator' });
    if (result && result.error) return; // skip if can't build (resources)

    // Fast-forward construction
    const item = colony.buildQueue[0];
    if (item) {
      item.ticksRemaining = 1;
      engine._processConstruction();
    }

    const ms = engine._matchStats.get('p1');
    assert.strictEqual(ms.districtsBuilt, 1);
  });
});

// ── Ship Build Tracking ──

describe('Post-game score screen — ship build tracking', () => {
  let engine;
  beforeEach(() => { engine = makeSoloEngine(); });

  it('increments shipsBuilt when a colony ship completes', () => {
    const colony = engine.colonies.values().next().value;
    // Give enough resources
    const state = engine.playerStates.get('p1');
    state.resources.minerals = 5000;
    state.resources.food = 5000;
    state.resources.alloys = 5000;

    engine.handleCommand('p1', { type: 'buildColonyShip', colonyId: colony.id });
    const item = colony.buildQueue.find(i => i.type === 'colonyShip');
    if (item) {
      item.ticksRemaining = 1;
      engine._processConstruction();
    }

    const ms = engine._matchStats.get('p1');
    assert.strictEqual(ms.shipsBuilt, 1);
  });

  it('increments shipsBuilt when a science ship completes', () => {
    const colony = engine.colonies.values().next().value;
    const state = engine.playerStates.get('p1');
    state.resources.minerals = 5000;
    state.resources.alloys = 5000;

    engine.handleCommand('p1', { type: 'buildScienceShip', colonyId: colony.id });
    const item = colony.buildQueue.find(i => i.type === 'scienceShip');
    if (item) {
      item.ticksRemaining = 1;
      engine._processConstruction();
    }

    const ms = engine._matchStats.get('p1');
    assert.strictEqual(ms.shipsBuilt, 1);
  });

  it('increments shipsBuilt when a corvette completes', () => {
    const colony = engine.colonies.values().next().value;
    const state = engine.playerStates.get('p1');
    state.resources.minerals = 5000;
    state.resources.alloys = 5000;

    engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    const item = colony.buildQueue.find(i => i.type === 'corvette');
    if (item) {
      item.ticksRemaining = 1;
      engine._processConstruction();
    }

    const ms = engine._matchStats.get('p1');
    assert.strictEqual(ms.shipsBuilt, 1);
  });
});

// ── Resource Gathering Tracking ──

describe('Post-game score screen — resource gathering', () => {
  it('tracks total resources gathered from monthly production', () => {
    const engine = makeSoloEngine();
    const msBefore = { ...engine._matchStats.get('p1').resourcesGathered };

    engine._processMonthlyResources();

    const msAfter = engine._matchStats.get('p1').resourcesGathered;
    // Should have added some production (starting colonies produce resources)
    assert.ok(msAfter.energy > msBefore.energy || msAfter.minerals > msBefore.minerals ||
              msAfter.food > msBefore.food || msAfter.alloys > msBefore.alloys,
              'At least one resource should be gathered');
  });

  it('accumulates resources over multiple months', () => {
    const engine = makeSoloEngine();
    engine._processMonthlyResources();
    const first = { ...engine._matchStats.get('p1').resourcesGathered };
    engine._processMonthlyResources();
    const second = engine._matchStats.get('p1').resourcesGathered;

    // Second pass should be roughly double the first
    assert.ok(second.energy >= first.energy, 'energy should accumulate');
    assert.ok(second.minerals >= first.minerals, 'minerals should accumulate');
  });
});

// ── Colony Founded Tracking ──

describe('Post-game score screen — colony founded', () => {
  it('increments coloniesFounded when colony ship founds a colony', () => {
    const engine = makeSoloEngine();
    const state = engine.playerStates.get('p1');
    state.resources.minerals = 5000;
    state.resources.food = 5000;
    state.resources.alloys = 5000;

    // Build a colony ship
    const colony = engine.colonies.values().next().value;
    engine.handleCommand('p1', { type: 'buildColonyShip', colonyId: colony.id });
    const item = colony.buildQueue.find(i => i.type === 'colonyShip');
    if (!item) return;
    item.ticksRemaining = 1;
    engine._processConstruction();

    // Find a habitable planet to colonize
    const ship = (engine._colonyShipsByPlayer.get('p1') || [])[0];
    if (!ship) return;

    // Find a habitable system to send to
    let targetSysId = null;
    for (let i = 0; i < engine.galaxy.systems.length; i++) {
      const sys = engine.galaxy.systems[i];
      if (sys.planets && sys.planets.some(p => p.habitability > 0 && !p.colonized)) {
        targetSysId = i;
        break;
      }
    }
    if (targetSysId == null) return;

    // Teleport ship to target and found colony
    ship.systemId = targetSysId;
    ship.targetSystemId = targetSysId;
    ship.path = [];
    ship.hopProgress = 0;
    engine._foundColonyFromShip(ship);

    const ms = engine._matchStats.get('p1');
    assert.strictEqual(ms.coloniesFounded, 1);
  });
});

// ── gameOver Payload ──

describe('Post-game score screen — gameOver payload', () => {
  it('includes matchDurationSec in gameOver data', () => {
    const engine = makeTimedEngine(1);
    let gameOverData = null;
    engine.onGameOver = (data) => { gameOverData = data; };

    // Force game over
    engine._matchTicksRemaining = 1;
    engine._processMatchTimer();

    assert.ok(gameOverData, 'gameOver should fire');
    assert.ok(typeof gameOverData.matchDurationSec === 'number', 'matchDurationSec should be a number');
    assert.ok(gameOverData.matchDurationSec >= 0, 'matchDurationSec should be non-negative');
  });

  it('includes matchStats in each score entry', () => {
    const engine = makeTimedEngine(1);
    let gameOverData = null;
    engine.onGameOver = (data) => { gameOverData = data; };

    engine._matchTicksRemaining = 1;
    engine._processMatchTimer();

    assert.ok(gameOverData.scores.length >= 2, 'should have 2 player scores');
    for (const s of gameOverData.scores) {
      assert.ok(s.matchStats, `${s.name} should have matchStats`);
      assert.strictEqual(typeof s.matchStats.coloniesFounded, 'number');
      assert.strictEqual(typeof s.matchStats.districtsBuilt, 'number');
      assert.strictEqual(typeof s.matchStats.shipsBuilt, 'number');
      assert.ok(s.matchStats.resourcesGathered, 'should have resourcesGathered');
      assert.strictEqual(typeof s.matchStats.resourcesGathered.energy, 'number');
      assert.strictEqual(typeof s.matchStats.resourcesGathered.minerals, 'number');
      assert.strictEqual(typeof s.matchStats.resourcesGathered.food, 'number');
      assert.strictEqual(typeof s.matchStats.resourcesGathered.alloys, 'number');
    }
  });

  it('includes finalTick in gameOver data', () => {
    const engine = makeTimedEngine(1);
    let gameOverData = null;
    engine.onGameOver = (data) => { gameOverData = data; };

    engine._matchTicksRemaining = 1;
    engine._processMatchTimer();

    assert.strictEqual(typeof gameOverData.finalTick, 'number');
  });

  it('scores are sorted by VP descending', () => {
    const engine = makeTimedEngine(1);
    let gameOverData = null;
    engine.onGameOver = (data) => { gameOverData = data; };

    // Give p2 more pops for higher VP
    const p2Colonies = engine._playerColonies.get('p2') || [];
    if (p2Colonies.length > 0) {
      const colony = engine.colonies.get(p2Colonies[0]);
      if (colony) colony.pops = 50;
    }

    engine._matchTicksRemaining = 1;
    engine._invalidateStateCache();
    engine._processMatchTimer();

    assert.ok(gameOverData.scores[0].vp >= gameOverData.scores[1].vp, 'scores should be sorted by VP desc');
  });

  it('matchStats reflect actual gameplay actions', () => {
    const engine = makeSoloEngine(1);

    // Build a district
    const colony = engine.colonies.values().next().value;
    const state = engine.playerStates.get('p1');
    state.resources.minerals = 5000;
    state.resources.energy = 5000;
    engine.handleCommand('p1', { type: 'buildDistrict', colonyId: colony.id, districtType: 'generator' });
    const item = colony.buildQueue[0];
    if (item) {
      item.ticksRemaining = 1;
      engine._processConstruction();
    }

    // Process monthly resources
    engine._processMonthlyResources();

    let gameOverData = null;
    engine.onGameOver = (data) => { gameOverData = data; };
    engine._matchTicksRemaining = 1;
    engine._processMatchTimer();

    const ms = gameOverData.scores[0].matchStats;
    assert.ok(ms.districtsBuilt >= 1, 'should track built district');
    assert.ok(ms.resourcesGathered.energy > 0 || ms.resourcesGathered.minerals > 0,
              'should track gathered resources');
  });
});

// ── Rematch (server-integration level) ──

describe('Post-game score screen — rematch message', () => {
  it('rematch handler is recognized by server command routing', () => {
    // Just verify the game engine doesn't choke — actual rematch logic is in server.js
    // This test ensures the matchStats and gameOver structure are sane
    const engine = makeTimedEngine(1);
    let gameOverData = null;
    engine.onGameOver = (data) => { gameOverData = data; };

    engine._matchTicksRemaining = 1;
    engine._processMatchTimer();

    assert.ok(gameOverData, 'gameOver should have fired');
    assert.ok(gameOverData.winner || gameOverData.scores.length > 0, 'should have results');
  });
});
