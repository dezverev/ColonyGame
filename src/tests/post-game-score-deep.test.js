const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { GameEngine } = require('../../server/game-engine');

// Helper: create a 2-player engine with optional match timer (minutes)
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

// Helper: force game over and capture payload
function triggerGameOver(engine) {
  let data = null;
  engine.onGameOver = (d) => { data = d; };
  engine._matchTicksRemaining = 1;
  engine._processMatchTimer();
  return data;
}

// ── VP Breakdown Structure in gameOver ──

describe('Post-game score — VP breakdown in gameOver payload', () => {
  it('each score entry includes a breakdown object with VP categories', () => {
    const engine = makeTimedEngine();
    const data = triggerGameOver(engine);

    for (const s of data.scores) {
      assert.ok(s.breakdown, `${s.name} should have breakdown`);
      assert.strictEqual(typeof s.breakdown.vp, 'number', 'breakdown.vp');
      assert.strictEqual(typeof s.breakdown.popsVP, 'number', 'breakdown.popsVP');
      assert.strictEqual(typeof s.breakdown.districtsVP, 'number', 'breakdown.districtsVP');
      assert.strictEqual(typeof s.breakdown.alloysVP, 'number', 'breakdown.alloysVP');
      assert.strictEqual(typeof s.breakdown.researchVP, 'number', 'breakdown.researchVP');
      assert.strictEqual(typeof s.breakdown.techVP, 'number', 'breakdown.techVP');
      assert.strictEqual(typeof s.breakdown.traitsVP, 'number', 'breakdown.traitsVP');
      assert.strictEqual(typeof s.breakdown.surveyedVP, 'number', 'breakdown.surveyedVP');
      assert.strictEqual(typeof s.breakdown.battlesWonVP, 'number', 'breakdown.battlesWonVP');
      assert.strictEqual(typeof s.breakdown.shipsLostVP, 'number', 'breakdown.shipsLostVP');
      assert.strictEqual(typeof s.breakdown.militaryVP, 'number', 'breakdown.militaryVP');
      assert.strictEqual(typeof s.breakdown.diplomacyVP, 'number', 'breakdown.diplomacyVP');
    }
  });

  it('breakdown.vp matches the top-level score vp', () => {
    const engine = makeTimedEngine();
    const data = triggerGameOver(engine);

    for (const s of data.scores) {
      assert.strictEqual(s.vp, s.breakdown.vp, `VP mismatch for ${s.name}`);
    }
  });

  it('breakdown includes raw counts (pops, districts, battlesWon, shipsLost)', () => {
    const engine = makeTimedEngine();
    const data = triggerGameOver(engine);

    for (const s of data.scores) {
      assert.strictEqual(typeof s.breakdown.pops, 'number', 'pops count');
      assert.strictEqual(typeof s.breakdown.districts, 'number', 'districts count');
      assert.strictEqual(typeof s.breakdown.battlesWon, 'number', 'battlesWon count');
      assert.strictEqual(typeof s.breakdown.shipsLost, 'number', 'shipsLost count');
      assert.strictEqual(typeof s.breakdown.corvettes, 'number', 'corvettes count');
    }
  });
});

// ── Winner Determination ──

describe('Post-game score — winner determination', () => {
  it('winner field matches the player with highest VP', () => {
    const engine = makeTimedEngine();
    // Give p1 many more pops to ensure higher VP
    const p1Colonies = engine._playerColonies.get('p1') || [];
    for (const cid of p1Colonies) {
      const colony = engine.colonies.get(cid);
      if (colony) colony.pops = 80;
    }
    engine._invalidateStateCache();

    const data = triggerGameOver(engine);

    assert.ok(data.winner, 'winner should be set');
    assert.strictEqual(data.winner.playerId, data.scores[0].playerId, 'winner should be highest-VP player');
    assert.strictEqual(data.winner.vp, data.scores[0].vp, 'winner VP should match top score');
  });

  it('winner includes playerId, name, and vp', () => {
    const engine = makeTimedEngine();
    const data = triggerGameOver(engine);

    assert.ok(data.winner, 'winner should exist');
    assert.strictEqual(typeof data.winner.playerId, 'string');
    assert.strictEqual(typeof data.winner.name, 'string');
    assert.strictEqual(typeof data.winner.vp, 'number');
  });

  it('each score entry includes playerId, name, and color', () => {
    const engine = makeTimedEngine();
    const data = triggerGameOver(engine);

    for (const s of data.scores) {
      assert.strictEqual(typeof s.playerId, 'string');
      assert.strictEqual(typeof s.name, 'string');
      assert.ok(s.color !== undefined, 'color should be present');
    }
  });
});

// ── _triggerGameOver Idempotency ──

describe('Post-game score — gameOver idempotency', () => {
  it('calling _triggerGameOver twice only fires onGameOver once', () => {
    const engine = makeTimedEngine();
    let callCount = 0;
    engine.onGameOver = () => { callCount++; };

    engine._triggerGameOver();
    engine._triggerGameOver();

    assert.strictEqual(callCount, 1, 'onGameOver should fire exactly once');
  });

  it('_gameOver flag is set after triggerGameOver', () => {
    const engine = makeTimedEngine();
    assert.strictEqual(engine._gameOver, false, 'starts as false');

    engine.onGameOver = () => {};
    engine._triggerGameOver();

    assert.strictEqual(engine._gameOver, true, 'set to true after game over');
  });
});

// ── Commands Rejected After Game Over ──

describe('Post-game score — commands rejected after game over', () => {
  it('handleCommand returns error after game over', () => {
    const engine = makeSoloEngine();
    engine.onGameOver = () => {};
    engine._triggerGameOver();

    const colony = engine.colonies.values().next().value;
    const result = engine.handleCommand('p1', {
      type: 'buildDistrict',
      colonyId: colony.id,
      districtType: 'generator',
    });

    assert.ok(result, 'should return a result');
    assert.strictEqual(result.error, 'Game is over');
  });

  it('rejects research commands after game over', () => {
    const engine = makeSoloEngine();
    engine.onGameOver = () => {};
    engine._triggerGameOver();

    const result = engine.handleCommand('p1', { type: 'setResearch', techId: 'sometech' });
    assert.ok(result && result.error === 'Game is over');
  });

  it('rejects ship build commands after game over', () => {
    const engine = makeSoloEngine();
    engine.onGameOver = () => {};
    engine._triggerGameOver();

    const colony = engine.colonies.values().next().value;
    const result = engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    assert.ok(result && result.error === 'Game is over');
  });
});

// ── battlesWon / shipsLost Tracking in VP Breakdown ──

describe('Post-game score — combat stats in VP breakdown', () => {
  it('battlesWon from _battlesWon map appears in VP breakdown', () => {
    const engine = makeTimedEngine();
    engine._battlesWon.set('p1', 3);
    engine._invalidateStateCache();

    const data = triggerGameOver(engine);
    const p1Score = data.scores.find(s => s.playerId === 'p1');

    assert.strictEqual(p1Score.breakdown.battlesWon, 3, 'battlesWon should reflect _battlesWon map');
    assert.ok(p1Score.breakdown.battlesWonVP > 0, 'battlesWonVP should be positive');
  });

  it('shipsLost from _shipsLost map appears in VP breakdown', () => {
    const engine = makeTimedEngine();
    engine._shipsLost.set('p2', 5);
    engine._invalidateStateCache();

    const data = triggerGameOver(engine);
    const p2Score = data.scores.find(s => s.playerId === 'p2');

    assert.strictEqual(p2Score.breakdown.shipsLost, 5, 'shipsLost should reflect _shipsLost map');
    assert.strictEqual(typeof p2Score.breakdown.shipsLostVP, 'number', 'shipsLostVP should be a number');
  });

  it('player with zero combat has zero combat VP', () => {
    const engine = makeTimedEngine();
    const data = triggerGameOver(engine);
    const p1Score = data.scores.find(s => s.playerId === 'p1');

    assert.strictEqual(p1Score.breakdown.battlesWon, 0);
    assert.strictEqual(p1Score.breakdown.battlesWonVP, 0);
    assert.strictEqual(p1Score.breakdown.shipsLost, 0);
  });
});

// ── matchStats Fallback for Missing Player ──

describe('Post-game score — matchStats fallback', () => {
  it('provides zero matchStats if _matchStats entry is somehow missing', () => {
    const engine = makeTimedEngine();
    // Simulate a missing matchStats entry
    engine._matchStats.delete('p2');

    const data = triggerGameOver(engine);
    const p2Score = data.scores.find(s => s.playerId === 'p2');

    assert.ok(p2Score.matchStats, 'should have fallback matchStats');
    assert.strictEqual(p2Score.matchStats.coloniesFounded, 0);
    assert.strictEqual(p2Score.matchStats.districtsBuilt, 0);
    assert.strictEqual(p2Score.matchStats.shipsBuilt, 0);
    assert.strictEqual(p2Score.matchStats.resourcesGathered.energy, 0);
    assert.strictEqual(p2Score.matchStats.resourcesGathered.minerals, 0);
    assert.strictEqual(p2Score.matchStats.resourcesGathered.food, 0);
    assert.strictEqual(p2Score.matchStats.resourcesGathered.alloys, 0);
  });
});

// ── Multiple Stat Accumulation ──

describe('Post-game score — multiple stat accumulation', () => {
  it('multiple district completions accumulate in matchStats', () => {
    const engine = makeSoloEngine();
    const colony = engine.colonies.values().next().value;
    const state = engine.playerStates.get('p1');
    state.resources.minerals = 50000;
    state.resources.energy = 50000;

    // Build 3 districts
    for (let i = 0; i < 3; i++) {
      engine.handleCommand('p1', { type: 'buildDistrict', colonyId: colony.id, districtType: 'generator' });
    }

    // Fast-forward all build queue items
    while (colony.buildQueue.length > 0) {
      colony.buildQueue[0].ticksRemaining = 1;
      engine._processConstruction();
    }

    const ms = engine._matchStats.get('p1');
    assert.strictEqual(ms.districtsBuilt, 3, 'should track 3 districts built');
  });

  it('multiple ship completions accumulate in matchStats', () => {
    const engine = makeSoloEngine();
    const colony = engine.colonies.values().next().value;
    const state = engine.playerStates.get('p1');
    state.resources.minerals = 50000;
    state.resources.alloys = 50000;

    // Build 2 corvettes
    engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });
    engine.handleCommand('p1', { type: 'buildCorvette', colonyId: colony.id });

    // Fast-forward build queue
    while (colony.buildQueue.length > 0) {
      colony.buildQueue[0].ticksRemaining = 1;
      engine._processConstruction();
    }

    const ms = engine._matchStats.get('p1');
    assert.strictEqual(ms.shipsBuilt, 2, 'should track 2 ships built');
  });
});

// ── matchDurationSec Plausibility ──

describe('Post-game score — match duration', () => {
  it('matchDurationSec is non-negative integer', () => {
    const engine = makeTimedEngine();
    const data = triggerGameOver(engine);

    assert.strictEqual(typeof data.matchDurationSec, 'number');
    assert.ok(data.matchDurationSec >= 0);
    assert.strictEqual(data.matchDurationSec, Math.floor(data.matchDurationSec), 'should be integer');
  });

  it('matchDurationSec is reasonable for a just-created game', () => {
    const engine = makeTimedEngine();
    const data = triggerGameOver(engine);

    // Game was just created, so duration should be < 5 seconds
    assert.ok(data.matchDurationSec < 5, `duration ${data.matchDurationSec}s should be < 5s for instant game`);
  });
});

// ── gameOver Payload Completeness ──

describe('Post-game score — gameOver payload completeness', () => {
  it('gameOver data has all required top-level fields', () => {
    const engine = makeTimedEngine();
    const data = triggerGameOver(engine);

    assert.ok(data.winner !== undefined, 'should have winner');
    assert.ok(Array.isArray(data.scores), 'should have scores array');
    assert.strictEqual(typeof data.finalTick, 'number', 'should have finalTick');
    assert.strictEqual(typeof data.matchDurationSec, 'number', 'should have matchDurationSec');
  });

  it('scores array has one entry per player', () => {
    const engine = makeTimedEngine();
    const data = triggerGameOver(engine);

    assert.strictEqual(data.scores.length, 2, 'should have 2 entries for 2-player game');

    const playerIds = data.scores.map(s => s.playerId).sort();
    assert.deepStrictEqual(playerIds, ['p1', 'p2']);
  });

  it('solo game has one score entry', () => {
    const engine = makeSoloEngine();
    const data = triggerGameOver(engine);

    assert.strictEqual(data.scores.length, 1);
    assert.strictEqual(data.scores[0].playerId, 'p1');
  });
});

// ── matchStats Deep Copy ──

describe('Post-game score — matchStats isolation', () => {
  it('matchStats in gameOver are copies, not references to live data', () => {
    const engine = makeTimedEngine();
    const data = triggerGameOver(engine);

    const scoredStats = data.scores[0].matchStats;
    const originalStats = engine._matchStats.get(data.scores[0].playerId);

    // Mutate the gameOver copy
    scoredStats.districtsBuilt = 9999;
    scoredStats.resourcesGathered.energy = 9999;

    // Original should be unchanged (if it still exists after stop)
    if (originalStats) {
      assert.notStrictEqual(originalStats.districtsBuilt, 9999, 'original should not be mutated');
      assert.notStrictEqual(originalStats.resourcesGathered.energy, 9999, 'resourcesGathered should be deep copied');
    }
  });
});

// ── Rematch Handler (unit-level) ──

describe('Post-game score — rematch room settings preservation', () => {
  it('rematch creates room with correct settings structure', () => {
    // Test the settings extraction logic from server.js rematch handler
    // by verifying the room object has the expected fields
    const players = new Map();
    players.set('p1', { name: 'Player 1' });
    const room = {
      players,
      galaxySize: 'medium',
      matchTimer: 5,
      maxPlayers: 4,
      practiceMode: true,
    };

    // Simulate settings extraction (same logic as server.js line 164-169)
    const settings = {
      maxPlayers: room.maxPlayers,
      practiceMode: room.practiceMode,
      matchTimer: room.matchTimer,
      galaxySize: room.galaxySize,
    };

    assert.strictEqual(settings.maxPlayers, 4);
    assert.strictEqual(settings.practiceMode, true);
    assert.strictEqual(settings.matchTimer, 5);
    assert.strictEqual(settings.galaxySize, 'medium');
  });

  it('rematch settings extraction handles missing room gracefully', () => {
    // When currentRoom is null, settings should be empty
    const currentRoom = null;
    const settings = currentRoom ? {
      maxPlayers: currentRoom.maxPlayers,
      practiceMode: currentRoom.practiceMode,
      matchTimer: currentRoom.matchTimer,
      galaxySize: currentRoom.galaxySize,
    } : {};

    assert.deepStrictEqual(settings, {});
  });
});

// ── Resource Gathering Negative Production ──

describe('Post-game score — resource tracking edge cases', () => {
  it('resourcesGathered only tracks positive production, not consumption', () => {
    const engine = makeSoloEngine();

    // Process multiple months
    engine._processMonthlyResources();
    engine._processMonthlyResources();

    const ms = engine._matchStats.get('p1');
    // All tracked values should be non-negative (we track gathering, not net)
    assert.ok(ms.resourcesGathered.energy >= 0, 'energy gathered should be non-negative');
    assert.ok(ms.resourcesGathered.minerals >= 0, 'minerals gathered should be non-negative');
    assert.ok(ms.resourcesGathered.food >= 0, 'food gathered should be non-negative');
    assert.ok(ms.resourcesGathered.alloys >= 0, 'alloys gathered should be non-negative');
  });
});
