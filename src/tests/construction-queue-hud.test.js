const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine } = require('../../server/game-engine');

function createEngine(playerCount = 1) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set('p' + i, { name: 'Player ' + i });
  }
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  return new GameEngine(room, { tickRate: 10 });
}

function getColony(engine, playerId) {
  const ids = engine._playerColonies.get(playerId) || [];
  return engine.colonies.get(ids[0]);
}

describe('Construction Queue HUD', () => {

  describe('Build queue serialization', () => {
    it('serializes district build queue items with ticksRemaining', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'housing' });
      const state = engine.getPlayerState('p1');
      const sc = state.colonies[0];
      assert.strictEqual(sc.buildQueue.length, 1);
      assert.strictEqual(sc.buildQueue[0].type, 'housing');
      assert.ok(sc.buildQueue[0].ticksRemaining > 0);
      assert.ok(sc.buildQueue[0].id);
    });

    it('serializes building queue items with ticksRemaining', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 1000;
      ps.resources.energy = 500;
      engine._invalidateStateCache();

      engine.handleCommand('p1', { type: 'buildBuilding', colonyId: col.id, buildingType: 'researchLab' });
      const state = engine.getPlayerState('p1');
      const sc = state.colonies[0];
      assert.strictEqual(sc.buildingQueue.length, 1);
      assert.strictEqual(sc.buildingQueue[0].type, 'researchLab');
      assert.ok(sc.buildingQueue[0].ticksRemaining > 0);
    });

    it('serializes ship build queue items correctly', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 500;
      ps.resources.alloys = 200;
      engine._invalidateStateCache();

      engine.handleCommand('p1', { type: 'buildScienceShip', colonyId: col.id });
      const state = engine.getPlayerState('p1');
      const sc = state.colonies[0];
      const sciItem = sc.buildQueue.find(q => q.type === 'scienceShip');
      assert.ok(sciItem, 'science ship should be in build queue');
      assert.ok(sciItem.ticksRemaining > 0);
    });
  });

  describe('Queue capacity enforcement', () => {
    it('rejects when build queue is full (3 items)', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 5000;
      ps.resources.energy = 5000;
      engine._invalidateStateCache();

      engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'housing' });
      engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'generator' });
      engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'mining' });

      const result = engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'agriculture' });
      assert.ok(result.error);
      assert.ok(result.error.toLowerCase().includes('queue full'));
    });
  });

  describe('Cancel refund (50%)', () => {
    it('refunds 50% of district cost on demolish from queue', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      const mineralsBefore = ps.resources.minerals;

      engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'housing' });
      const mineralsAfterBuild = ps.resources.minerals;
      assert.strictEqual(mineralsBefore - mineralsAfterBuild, 100);

      const queuedId = col.buildQueue[0].id;
      engine.handleCommand('p1', { type: 'demolish', colonyId: col.id, districtId: queuedId });
      assert.strictEqual(ps.resources.minerals, mineralsAfterBuild + 50, 'should refund 50%');
      assert.strictEqual(col.buildQueue.length, 0);
    });

    it('refunds 50% of building cost on cancel', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 1000;
      ps.resources.energy = 500;
      engine._invalidateStateCache();

      const mineralsBefore = ps.resources.minerals;
      const energyBefore = ps.resources.energy;

      engine.handleCommand('p1', { type: 'buildBuilding', colonyId: col.id, buildingType: 'researchLab' });
      assert.strictEqual(col.buildingQueue.length, 1);

      const bqId = col.buildingQueue[0].id;
      engine.handleCommand('p1', { type: 'demolish', colonyId: col.id, districtId: bqId });

      // Research lab costs 200m + 50e, refund = 100m + 25e
      assert.strictEqual(ps.resources.minerals, mineralsBefore - 200 + 100);
      assert.strictEqual(ps.resources.energy, energyBefore - 50 + 25);
    });
  });

  describe('Net production for deficit warnings', () => {
    it('includes net production per colony in serialized state', () => {
      const engine = createEngine();
      const state = engine.getPlayerState('p1');
      const colony = state.colonies[0];

      assert.ok(colony.netProduction);
      assert.ok('energy' in colony.netProduction);
      assert.ok('minerals' in colony.netProduction);
      assert.ok('food' in colony.netProduction);
      assert.ok('alloys' in colony.netProduction);
    });

    it('net production reflects built districts', () => {
      const engine = createEngine();
      const state = engine.getPlayerState('p1');
      const colony = state.colonies[0];
      const initialEnergy = colony.netProduction.energy;

      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 1000;
      engine._invalidateStateCache();

      const col = getColony(engine, 'p1');
      engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'generator' });
      col.buildQueue[0].ticksRemaining = 0;
      engine.tick();

      const updated = engine.getPlayerState('p1');
      assert.ok(updated.colonies[0].netProduction.energy > initialEnergy);
    });
  });

  describe('Multi-item queue ETA', () => {
    it('cumulative ticks across queue items', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 5000;
      ps.resources.energy = 5000;
      engine._invalidateStateCache();

      engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'housing' });
      engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'generator' });

      const state = engine.getPlayerState('p1');
      const sc = state.colonies[0];
      assert.strictEqual(sc.buildQueue.length, 2);
      const totalTicks = sc.buildQueue.reduce((sum, q) => sum + q.ticksRemaining, 0);
      assert.ok(totalTicks > 0);
      // Both items have their full ticks since only the first processes
      assert.strictEqual(totalTicks, sc.buildQueue[0].ticksRemaining + sc.buildQueue[1].ticksRemaining);
    });
  });

  describe('Ship cost verification', () => {
    it('colony ship cost matches SHIP_UI mirror', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 1000;
      ps.resources.food = 500;
      ps.resources.alloys = 500;
      engine._invalidateStateCache();

      const mBefore = ps.resources.minerals;
      const fBefore = ps.resources.food;
      const aBefore = ps.resources.alloys;

      engine.handleCommand('p1', { type: 'buildColonyShip', colonyId: col.id });

      assert.strictEqual(mBefore - ps.resources.minerals, 175);
      assert.strictEqual(fBefore - ps.resources.food, 75);
      assert.strictEqual(aBefore - ps.resources.alloys, 75);
    });

    it('science ship cost matches SHIP_UI mirror', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 500;
      ps.resources.alloys = 200;
      engine._invalidateStateCache();

      const mBefore = ps.resources.minerals;
      const aBefore = ps.resources.alloys;

      engine.handleCommand('p1', { type: 'buildScienceShip', colonyId: col.id });

      assert.strictEqual(mBefore - ps.resources.minerals, 100);
      assert.strictEqual(aBefore - ps.resources.alloys, 50);
    });
  });

  describe('Corvette in build queue', () => {
    it('corvette appears in build queue with correct type', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 5000;
      ps.resources.alloys = 5000;
      engine._invalidateStateCache();

      engine.handleCommand('p1', { type: 'buildCorvette', colonyId: col.id });
      const state = engine.getPlayerState('p1');
      const sc = state.colonies[0];

      const corvItem = sc.buildQueue.find(q => q.type === 'corvette');
      assert.ok(corvItem);
      assert.ok(corvItem.ticksRemaining > 0);
    });
  });

  describe('Mixed queue — districts and ships', () => {
    it('districts and ships coexist in build queue', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 5000;
      ps.resources.alloys = 5000;
      ps.resources.food = 5000;
      engine._invalidateStateCache();

      engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'housing' });
      engine.handleCommand('p1', { type: 'buildScienceShip', colonyId: col.id });

      const state = engine.getPlayerState('p1');
      const sc = state.colonies[0];
      assert.strictEqual(sc.buildQueue.length, 2);

      const types = sc.buildQueue.map(q => q.type);
      assert.ok(types.includes('housing'));
      assert.ok(types.includes('scienceShip'));

      // Each item has its own ticksRemaining
      for (const q of sc.buildQueue) {
        assert.ok(q.ticksRemaining > 0);
        assert.ok(q.id);
      }
    });
  });
});
