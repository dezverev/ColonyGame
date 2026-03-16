const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  SURFACE_ANOMALY_TYPES,
  SURFACE_ANOMALY_KEYS,
  SURFACE_ANOMALY_MIN,
  SURFACE_ANOMALY_MAX,
} = require('../../server/game-engine');

function createEngine() {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  players.set('p2', { name: 'Player 2' });
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  return new GameEngine(room, { tickRate: 10 });
}

function getColony(engine, playerId) {
  const ids = engine._playerColonies.get(playerId) || [];
  return ids.length > 0 ? engine.colonies.get(ids[0]) : null;
}

// Set up a colony with controlled anomalies and trigger discovery at slot 0
// by directly adding a district and calling _discoverSurfaceAnomaly (avoids 300-tick loop)
function setupWithDiscovery(engine, anomalyType, districtType) {
  const colony = getColony(engine, 'p1');
  colony.districts = [];
  colony.buildQueue = [];
  engine._invalidateColonyCache(colony);
  const anomalyId = engine._nextId();
  colony.surfaceAnomalies = [{
    id: anomalyId, slot: 0, type: anomalyType, discovered: false, choicePending: false,
  }];
  // Directly add a district at slot 0 and trigger discovery
  engine._addBuiltDistrict(colony, districtType || 'mining');
  engine._discoverSurfaceAnomaly(colony, 0);
  return { colony, anomaly: colony.surfaceAnomalies[0] };
}

describe('Surface Anomalies — constants', () => {
  it('should export surface anomaly constants', () => {
    assert.ok(SURFACE_ANOMALY_TYPES);
    assert.ok(SURFACE_ANOMALY_KEYS.length >= 2);
    assert.strictEqual(SURFACE_ANOMALY_MIN, 1);
    assert.strictEqual(SURFACE_ANOMALY_MAX, 3);
  });

  it('should have output and choice category types', () => {
    const categories = new Set(Object.values(SURFACE_ANOMALY_TYPES).map(t => t.category));
    assert.ok(categories.has('output'));
    assert.ok(categories.has('choice'));
  });

  it('choice anomalies should have choices with ids and rewards', () => {
    for (const [key, def] of Object.entries(SURFACE_ANOMALY_TYPES)) {
      if (def.category === 'choice') {
        assert.ok(def.choices.length >= 2, `${key} should have at least 2 choices`);
        for (const c of def.choices) {
          assert.ok(c.id, `${key} choice missing id`);
          assert.ok(c.label, `${key} choice missing label`);
          assert.ok(Object.keys(c.reward).length > 0, `${key} choice missing reward`);
        }
      }
    }
  });
});

describe('Surface Anomalies — generation', () => {
  it('should generate anomalies on colony creation', () => {
    const engine = createEngine();
    const colony = getColony(engine, 'p1');
    assert.ok(colony.surfaceAnomalies);
    assert.ok(colony.surfaceAnomalies.length >= SURFACE_ANOMALY_MIN);
    assert.ok(colony.surfaceAnomalies.length <= SURFACE_ANOMALY_MAX);
  });

  it('anomalies should have valid slots within planet size', () => {
    const engine = createEngine();
    const colony = getColony(engine, 'p1');
    for (const a of colony.surfaceAnomalies) {
      assert.ok(a.slot >= 0);
      assert.ok(a.slot < colony.planet.size);
    }
  });

  it('anomalies should have unique slots', () => {
    const engine = createEngine();
    const colony = getColony(engine, 'p1');
    const slots = colony.surfaceAnomalies.map(a => a.slot);
    assert.strictEqual(slots.length, new Set(slots).size);
  });

  it('anomalies should have valid types', () => {
    const engine = createEngine();
    const colony = getColony(engine, 'p1');
    for (const a of colony.surfaceAnomalies) {
      assert.ok(SURFACE_ANOMALY_TYPES[a.type], `Unknown type: ${a.type}`);
    }
  });

  it('anomalies start undiscovered', () => {
    const engine = createEngine();
    const colony = getColony(engine, 'p1');
    for (const a of colony.surfaceAnomalies) {
      assert.strictEqual(a.discovered, false);
      assert.strictEqual(a.choicePending, false);
    }
  });
});

describe('Surface Anomalies — output discovery', () => {
  it('should discover output anomaly when district built on slot and apply +50% bonus', () => {
    const engine = createEngine();
    const { colony, anomaly } = setupWithDiscovery(engine, 'richDeposit', 'generator');

    const district = colony.districts[0];
    assert.ok(district, 'District should exist at slot 0');
    assert.strictEqual(district.anomalyBonus, 0.5);
    assert.strictEqual(anomaly.discovered, true);
    assert.strictEqual(anomaly.choicePending, false);
  });

  it('output anomaly should boost production by 50%', () => {
    const engine = createEngine();
    const colony = getColony(engine, 'p1');
    colony.districts = [];
    colony.buildQueue = [];
    colony.buildings = [];
    colony.pops = 20;
    colony.surfaceAnomalies = [];
    engine._invalidateColonyCache(colony);

    // Add generator without anomaly bonus
    engine._addBuiltDistrict(colony, 'generator');
    engine._invalidateColonyCache(colony);
    const { production: prodBefore } = engine._calcProduction(colony);
    const energyWithout = prodBefore.energy;

    // Add anomaly bonus to district 0
    colony.districts[0].anomalyBonus = 0.5;
    engine._invalidateColonyCache(colony);
    const { production: prodAfter } = engine._calcProduction(colony);
    const energyWith = prodAfter.energy;

    // Generator produces 6 energy base, +50% anomaly adds 3 base energy
    // Other modifiers (traits, etc.) may shift final ratio, so check relative increase
    assert.ok(energyWith > energyWithout, `${energyWith} should be > ${energyWithout}`);
    // At minimum, anomaly should add 50% of the base district output (3 energy)
    assert.ok(energyWith - energyWithout >= 2.5, `Bonus should be at least 2.5, got ${energyWith - energyWithout}`);
  });

  it('no bonus on slot without anomaly', () => {
    const engine = createEngine();
    const colony = getColony(engine, 'p1');
    colony.districts = [];
    colony.buildQueue = [];
    colony.surfaceAnomalies = [{
      id: engine._nextId(), slot: 5, type: 'richDeposit', discovered: false, choicePending: false,
    }];
    engine._invalidateColonyCache(colony);

    // Add district at slot 0 — anomaly is at slot 5, so no match
    engine._addBuiltDistrict(colony, 'generator');
    engine._discoverSurfaceAnomaly(colony, 0);

    const district = colony.districts[0];
    assert.ok(!district.anomalyBonus, 'No anomaly bonus on non-anomaly slot');
    assert.strictEqual(colony.surfaceAnomalies[0].discovered, false);
  });
});

describe('Surface Anomalies — choice discovery', () => {
  it('should set choicePending when district built on choice anomaly slot', () => {
    const engine = createEngine();
    const { anomaly } = setupWithDiscovery(engine, 'ancientRuins');

    assert.strictEqual(anomaly.discovered, true);
    assert.strictEqual(anomaly.choicePending, true);
  });

  it('should emit surfaceAnomalyDiscovered event for choice anomaly', () => {
    const engine = createEngine();
    const { anomaly } = setupWithDiscovery(engine, 'ancientRuins');

    const events = engine._flushEvents() || [];
    const discoveryEvent = events.find(e => e.eventType === 'surfaceAnomalyDiscovered' && e.category === 'choice');
    assert.ok(discoveryEvent, 'Should emit surfaceAnomalyDiscovered event');
    assert.strictEqual(discoveryEvent.anomalyType, 'ancientRuins');
    assert.ok(discoveryEvent.choices);
    assert.ok(discoveryEvent.anomalyId);
  });
});

describe('Surface Anomalies — resolveAnomaly command', () => {
  it('should resolve choice anomaly and grant reward (salvage)', () => {
    const engine = createEngine();
    const { colony, anomaly } = setupWithDiscovery(engine, 'ancientRuins');
    engine._flushEvents();

    const state = engine.playerStates.get('p1');
    const mineralsBefore = state.resources.minerals;

    const result = engine.handleCommand('p1', {
      type: 'resolveAnomaly',
      colonyId: colony.id,
      anomalyId: anomaly.id,
      choiceId: 'salvage',
    });

    assert.ok(result.ok);
    assert.strictEqual(anomaly.choicePending, false);
    assert.ok(state.resources.minerals >= mineralsBefore + 200);
  });

  it('should resolve choice anomaly and grant research reward (study)', () => {
    const engine = createEngine();
    const { colony, anomaly } = setupWithDiscovery(engine, 'ancientRuins');
    engine._flushEvents();

    const state = engine.playerStates.get('p1');

    const result = engine.handleCommand('p1', {
      type: 'resolveAnomaly',
      colonyId: colony.id,
      anomalyId: anomaly.id,
      choiceId: 'study',
    });

    assert.ok(result.ok);
    assert.ok(state.resources.research.physics >= 100);
    assert.ok(state.resources.research.society >= 100);
    assert.ok(state.resources.research.engineering >= 100);
  });

  it('should reject resolve for wrong player', () => {
    const engine = createEngine();
    const { colony, anomaly } = setupWithDiscovery(engine, 'ancientRuins');

    const result = engine.handleCommand('p2', {
      type: 'resolveAnomaly',
      colonyId: colony.id,
      anomalyId: anomaly.id,
      choiceId: 'salvage',
    });

    assert.ok(result.error);
    assert.ok(result.error.includes('Not your colony'));
  });

  it('should reject resolve for invalid choice', () => {
    const engine = createEngine();
    const { colony, anomaly } = setupWithDiscovery(engine, 'ancientRuins');

    const result = engine.handleCommand('p1', {
      type: 'resolveAnomaly',
      colonyId: colony.id,
      anomalyId: anomaly.id,
      choiceId: 'nonexistent',
    });

    assert.ok(result.error);
    assert.ok(result.error.includes('Invalid choice'));
  });

  it('should reject resolve for undiscovered anomaly', () => {
    const engine = createEngine();
    const colony = getColony(engine, 'p1');
    colony.districts = [];
    colony.buildQueue = [];
    engine._invalidateColonyCache(colony);
    colony.surfaceAnomalies = [{
      id: engine._nextId(), slot: 5, type: 'ancientRuins', discovered: false, choicePending: false,
    }];
    const anomaly = colony.surfaceAnomalies[0];

    const result = engine.handleCommand('p1', {
      type: 'resolveAnomaly',
      colonyId: colony.id,
      anomalyId: anomaly.id,
      choiceId: 'salvage',
    });

    assert.ok(result.error);
    assert.ok(result.error.includes('not yet discovered'));
  });

  it('should reject resolve when no choice is pending', () => {
    const engine = createEngine();
    const { colony, anomaly } = setupWithDiscovery(engine, 'ancientRuins');
    engine._flushEvents();

    // Resolve once
    engine.handleCommand('p1', {
      type: 'resolveAnomaly',
      colonyId: colony.id,
      anomalyId: anomaly.id,
      choiceId: 'salvage',
    });

    // Try again
    const result = engine.handleCommand('p1', {
      type: 'resolveAnomaly',
      colonyId: colony.id,
      anomalyId: anomaly.id,
      choiceId: 'salvage',
    });

    assert.ok(result.error);
    assert.ok(result.error.includes('No choice pending'));
  });

  it('should reject resolve with missing parameters', () => {
    const engine = createEngine();
    const result = engine.handleCommand('p1', { type: 'resolveAnomaly' });
    assert.ok(result.error);
    assert.ok(result.error.includes('Missing parameters'));
  });

  it('should emit surfaceAnomalyResolved event', () => {
    const engine = createEngine();
    const { colony, anomaly } = setupWithDiscovery(engine, 'ancientRuins');
    engine._flushEvents();

    engine.handleCommand('p1', {
      type: 'resolveAnomaly',
      colonyId: colony.id,
      anomalyId: anomaly.id,
      choiceId: 'salvage',
    });

    const events = engine._flushEvents() || [];
    const resolved = events.find(e => e.eventType === 'surfaceAnomalyResolved');
    assert.ok(resolved, 'Should emit surfaceAnomalyResolved event');
    assert.strictEqual(resolved.anomalyType, 'ancientRuins');
    assert.strictEqual(resolved.choiceLabel, 'Salvage Materials');
    assert.deepStrictEqual(resolved.reward, { minerals: 200 });
  });
});

describe('Surface Anomalies — precursorCache choice', () => {
  it('should grant alloys for weapons choice', () => {
    const engine = createEngine();
    const { colony, anomaly } = setupWithDiscovery(engine, 'precursorCache');
    engine._flushEvents();

    const state = engine.playerStates.get('p1');
    const alloysBefore = state.resources.alloys;

    const result = engine.handleCommand('p1', {
      type: 'resolveAnomaly',
      colonyId: colony.id,
      anomalyId: anomaly.id,
      choiceId: 'weapons',
    });

    assert.ok(result.ok);
    assert.ok(state.resources.alloys >= alloysBefore + 150);
  });
});

describe('Surface Anomalies — serialization', () => {
  it('should include surfaceAnomalies in serialized colony', () => {
    const engine = createEngine();
    const colony = getColony(engine, 'p1');

    const state = engine.getPlayerState('p1');
    const serialized = state.colonies.find(c => c.id === colony.id);
    assert.ok(serialized.surfaceAnomalies);
    assert.ok(serialized.surfaceAnomalies.length > 0);

    const sa = serialized.surfaceAnomalies[0];
    assert.ok(sa.id);
    assert.ok(typeof sa.slot === 'number');
    assert.ok(sa.type);
    assert.ok(sa.label);
    assert.ok(sa.category);
    assert.strictEqual(sa.discovered, false);
  });

  it('should include choices in serialized choice anomaly when pending', () => {
    const engine = createEngine();
    const { colony } = setupWithDiscovery(engine, 'ancientRuins');

    const state = engine.getPlayerState('p1');
    const serialized = state.colonies.find(c => c.id === colony.id);
    const sa = serialized.surfaceAnomalies.find(a => a.type === 'ancientRuins');
    assert.ok(sa);
    assert.strictEqual(sa.choicePending, true);
    assert.ok(sa.choices);
    assert.ok(sa.choices.length >= 2);
  });

  it('should include anomaly data in JSON payload', () => {
    const engine = createEngine();
    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    const colony = parsed.colonies[0];
    assert.ok(colony.surfaceAnomalies);
  });
});

describe('Surface Anomalies — integration with build queue', () => {
  // These tests use the full build queue + tick loop. We must disable the doctrine
  // phase to prevent auto-assigned doctrines from adding extra districts mid-tick.
  function prepareForBuild(engine) {
    // End doctrine phase so no auto-assign happens during ticks
    engine._doctrinePhase = false;
    for (const [, s] of engine.playerStates) {
      if (s.doctrine === null) s.doctrine = 'scholar'; // harmless doctrine, no extra districts
    }
  }

  it('should discover output anomaly when district completes via tick processing', () => {
    const engine = createEngine();
    prepareForBuild(engine);
    const colony = getColony(engine, 'p1');
    colony.districts = [];
    colony.buildQueue = [];
    engine._invalidateColonyCache(colony);
    colony.surfaceAnomalies = [{
      id: engine._nextId(), slot: 0, type: 'richDeposit', discovered: false, choicePending: false,
    }];

    const state = engine.playerStates.get('p1');
    state.resources.energy = 10000;
    state.resources.minerals = 10000;
    engine.handleCommand('p1', { type: 'buildDistrict', colonyId: colony.id, districtType: 'generator' });

    while (colony.buildQueue.length > 0) engine.tick();

    assert.strictEqual(colony.districts.length, 1);
    assert.strictEqual(colony.districts[0].anomalyBonus, 0.5);
    assert.strictEqual(colony.surfaceAnomalies[0].discovered, true);
  });

  it('should discover choice anomaly via tick processing and allow resolve', () => {
    const engine = createEngine();
    prepareForBuild(engine);
    const colony = getColony(engine, 'p1');
    colony.districts = [];
    colony.buildQueue = [];
    engine._invalidateColonyCache(colony);
    const anomalyId = engine._nextId();
    colony.surfaceAnomalies = [{
      id: anomalyId, slot: 0, type: 'ancientRuins', discovered: false, choicePending: false,
    }];

    const state = engine.playerStates.get('p1');
    state.resources.energy = 10000;
    state.resources.minerals = 10000;
    engine.handleCommand('p1', { type: 'buildDistrict', colonyId: colony.id, districtType: 'mining' });

    while (colony.buildQueue.length > 0) engine.tick();

    assert.strictEqual(colony.districts.length, 1);
    assert.strictEqual(colony.surfaceAnomalies[0].choicePending, true);

    const result = engine.handleCommand('p1', {
      type: 'resolveAnomaly', colonyId: colony.id, anomalyId, choiceId: 'salvage',
    });
    assert.ok(result.ok);
    assert.strictEqual(colony.surfaceAnomalies[0].choicePending, false);
  });
});
