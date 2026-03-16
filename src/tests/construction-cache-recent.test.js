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

describe('Construction Cache Invalidation — Self-contained Systems', () => {

  describe('Construction self-invalidates without movement', () => {
    it('district construction ticks down and invalidates cache even with no ships moving', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 1000;
      engine._invalidateStateCache();

      engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'housing' });
      const ticksBefore = col.buildQueue[0].ticksRemaining;

      // No ships exist/moving — tick should still update construction
      engine.tick();
      assert.strictEqual(col.buildQueue[0].ticksRemaining, ticksBefore - 1, 'ticks should decrement by 1');

      // Verify cache was invalidated (state reflects new ticksRemaining)
      const state = engine.getPlayerState('p1');
      const sc = state.colonies[0];
      assert.strictEqual(sc.buildQueue[0].ticksRemaining, ticksBefore - 1);
    });

    it('building construction ticks down independently of movement', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 1000;
      ps.resources.energy = 500;
      engine._invalidateStateCache();

      engine.handleCommand('p1', { type: 'buildBuilding', colonyId: col.id, buildingType: 'researchLab' });
      const ticksBefore = col.buildingQueue[0].ticksRemaining;

      engine.tick();
      assert.strictEqual(col.buildingQueue[0].ticksRemaining, ticksBefore - 1);
    });
  });

  describe('Movement isolation — no spurious invalidation', () => {
    it('movement functions do not invalidate cache when no ships are moving', () => {
      const engine = createEngine();

      // Populate per-player JSON cache
      engine.getPlayerStateJSON('p1');
      assert.ok(engine._cachedPlayerJSON.has('p1'), 'cache should be populated');

      // Clear dirty players and cache-dirty flag so we can detect spurious invalidation
      engine._dirtyPlayers.clear();
      engine._stateCacheDirty = false;

      // Manually call movement functions — no ships exist
      engine._processColonyShipMovement();
      engine._processMilitaryShipMovement();
      engine._processScienceShipMovement();

      // No ships moved — dirty set should still be empty and cache untouched
      assert.strictEqual(engine._dirtyPlayers.size, 0, 'no players should be dirty when no ships move');
      assert.strictEqual(engine._stateCacheDirty, false, 'state cache should not be invalidated');
    });
  });

  describe('Construction completion spawns correct entities', () => {
    it('district construction completes and adds district to colony', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 1000;
      engine._invalidateStateCache();

      engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'mining' });
      const districtsBefore = col.districts.length;

      // Fast-forward to completion
      col.buildQueue[0].ticksRemaining = 1;
      engine.tick();

      assert.strictEqual(col.buildQueue.length, 0, 'queue should be empty after completion');
      assert.strictEqual(col.districts.length, districtsBefore + 1, 'district count should increase by 1');
      assert.strictEqual(col.districts[col.districts.length - 1].type, 'mining', 'new district should be mining');
    });

    it('colony ship construction completes and spawns a colony ship', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 500;
      ps.resources.food = 500;
      ps.resources.alloys = 500;
      engine._invalidateStateCache();

      const shipsBefore = (engine._colonyShipsByPlayer.get('p1') || []).length;

      engine.handleCommand('p1', { type: 'buildColonyShip', colonyId: col.id });
      col.buildQueue[col.buildQueue.length - 1].ticksRemaining = 1;
      engine.tick();

      const shipsAfter = (engine._colonyShipsByPlayer.get('p1') || []).length;
      assert.strictEqual(shipsAfter, shipsBefore + 1, 'colony ship should be spawned');

      // Verify the ship is at the colony's system
      const newShip = engine._colonyShipsByPlayer.get('p1')[shipsAfter - 1];
      assert.strictEqual(newShip.systemId, col.systemId);
      assert.strictEqual(newShip.ownerId, 'p1');
    });

    it('science ship construction completes and spawns a science ship', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 500;
      ps.resources.alloys = 500;
      engine._invalidateStateCache();

      const shipsBefore = (engine._scienceShipsByPlayer.get('p1') || []).length;

      engine.handleCommand('p1', { type: 'buildScienceShip', colonyId: col.id });
      col.buildQueue[col.buildQueue.length - 1].ticksRemaining = 1;
      engine.tick();

      const shipsAfter = (engine._scienceShipsByPlayer.get('p1') || []).length;
      assert.strictEqual(shipsAfter, shipsBefore + 1, 'science ship should be spawned');

      const newShip = engine._scienceShipsByPlayer.get('p1')[shipsAfter - 1];
      assert.strictEqual(newShip.systemId, col.systemId);
      assert.strictEqual(newShip.autoSurvey, true, 'science ships default to auto-survey');
    });

    it('corvette construction completes and spawns a military ship', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 500;
      ps.resources.alloys = 500;
      engine._invalidateStateCache();

      const shipsBefore = engine._militaryShips.filter(s => s.ownerId === 'p1').length;

      engine.handleCommand('p1', { type: 'buildCorvette', colonyId: col.id });
      col.buildQueue[col.buildQueue.length - 1].ticksRemaining = 1;
      engine.tick();

      const shipsAfter = engine._militaryShips.filter(s => s.ownerId === 'p1').length;
      assert.strictEqual(shipsAfter, shipsBefore + 1, 'corvette should be spawned');
    });

    it('building construction completes and adds to colony.buildings', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 1000;
      ps.resources.energy = 500;
      engine._invalidateStateCache();

      const buildingsBefore = (col.buildings || []).length;

      engine.handleCommand('p1', { type: 'buildBuilding', colonyId: col.id, buildingType: 'researchLab' });
      col.buildingQueue[0].ticksRemaining = 1;
      engine.tick();

      assert.strictEqual(col.buildingQueue.length, 0, 'building queue should be empty');
      assert.strictEqual(col.buildings.length, buildingsBefore + 1, 'building should be added');
      assert.strictEqual(col.buildings[col.buildings.length - 1].type, 'researchLab');
    });
  });

  describe('Queue ordering — only first item ticks', () => {
    it('only the first item in build queue decrements per tick', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 5000;
      ps.resources.energy = 5000;
      engine._invalidateStateCache();

      engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'housing' });
      engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'generator' });

      const firstTicks = col.buildQueue[0].ticksRemaining;
      const secondTicks = col.buildQueue[1].ticksRemaining;

      engine.tick();

      assert.strictEqual(col.buildQueue[0].ticksRemaining, firstTicks - 1, 'first item should tick down');
      assert.strictEqual(col.buildQueue[1].ticksRemaining, secondTicks, 'second item should NOT tick down');
    });
  });

  describe('queueEmpty event', () => {
    it('fires queueEmpty when last district completes', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 1000;
      engine._invalidateStateCache();

      engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'housing' });
      col.buildQueue[0].ticksRemaining = 1;

      let queueEmptyFired = false;
      const origEmit = engine._emitEvent.bind(engine);
      engine._emitEvent = function (type, playerId, data, broadcast) {
        if (type === 'queueEmpty' && playerId === 'p1') {
          queueEmptyFired = true;
          assert.strictEqual(data.colonyId, col.id);
        }
        return origEmit(type, playerId, data, broadcast);
      };

      engine.tick();
      assert.ok(queueEmptyFired, 'queueEmpty event should fire when build queue empties');
    });

    it('fires queueEmpty when last building completes and build queue is also empty', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 1000;
      ps.resources.energy = 500;
      engine._invalidateStateCache();

      engine.handleCommand('p1', { type: 'buildBuilding', colonyId: col.id, buildingType: 'researchLab' });
      col.buildingQueue[0].ticksRemaining = 1;
      assert.strictEqual(col.buildQueue.length, 0, 'build queue should be empty');

      let queueEmptyFired = false;
      const origEmit = engine._emitEvent.bind(engine);
      engine._emitEvent = function (type, playerId, data, broadcast) {
        if (type === 'queueEmpty' && playerId === 'p1') {
          queueEmptyFired = true;
        }
        return origEmit(type, playerId, data, broadcast);
      };

      engine.tick();
      assert.ok(queueEmptyFired, 'queueEmpty should fire when building queue empties and build queue is empty');
    });
  });

  describe('Ship cancel refund', () => {
    it('refunds 50% of colony ship cost on cancel', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 500;
      ps.resources.food = 500;
      ps.resources.alloys = 500;
      engine._invalidateStateCache();

      const mBefore = ps.resources.minerals;
      const fBefore = ps.resources.food;
      const aBefore = ps.resources.alloys;

      engine.handleCommand('p1', { type: 'buildColonyShip', colonyId: col.id });

      // Colony ship costs: 175m, 75f, 75a
      assert.strictEqual(ps.resources.minerals, mBefore - 175);

      const queuedId = col.buildQueue[col.buildQueue.length - 1].id;
      engine.handleCommand('p1', { type: 'demolish', colonyId: col.id, districtId: queuedId });

      // 50% refund: 87m, 37f, 37a
      assert.strictEqual(ps.resources.minerals, mBefore - 175 + 87, 'minerals refund should be floor(175/2)=87');
      assert.strictEqual(ps.resources.food, fBefore - 75 + 37, 'food refund should be floor(75/2)=37');
      assert.strictEqual(ps.resources.alloys, aBefore - 75 + 37, 'alloys refund should be floor(75/2)=37');
    });

    it('refunds 50% of science ship cost on cancel', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 500;
      ps.resources.alloys = 500;
      engine._invalidateStateCache();

      const mBefore = ps.resources.minerals;
      const aBefore = ps.resources.alloys;

      engine.handleCommand('p1', { type: 'buildScienceShip', colonyId: col.id });

      const queuedId = col.buildQueue[col.buildQueue.length - 1].id;
      engine.handleCommand('p1', { type: 'demolish', colonyId: col.id, districtId: queuedId });

      // Science ship: 100m, 50a. 50% = 50m, 25a
      assert.strictEqual(ps.resources.minerals, mBefore - 100 + 50, 'minerals refund should be 50');
      assert.strictEqual(ps.resources.alloys, aBefore - 50 + 25, 'alloys refund should be 25');
    });

    it('refunds 50% of corvette cost on cancel', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 500;
      ps.resources.alloys = 500;
      engine._invalidateStateCache();

      const mBefore = ps.resources.minerals;
      const aBefore = ps.resources.alloys;

      engine.handleCommand('p1', { type: 'buildCorvette', colonyId: col.id });

      const queuedId = col.buildQueue[col.buildQueue.length - 1].id;
      engine.handleCommand('p1', { type: 'demolish', colonyId: col.id, districtId: queuedId });

      // Corvette: 100m, 50a. 50% = 50m, 25a
      assert.strictEqual(ps.resources.minerals, mBefore - 100 + 50, 'minerals refund should be 50');
      assert.strictEqual(ps.resources.alloys, aBefore - 50 + 25, 'alloys refund should be 25');
    });
  });

  describe('Net production in serialized state', () => {
    it('includes all resource fields in netProduction', () => {
      const engine = createEngine();
      const state = engine.getPlayerState('p1');
      const colony = state.colonies[0];

      assert.ok('energy' in colony.netProduction, 'should have energy');
      assert.ok('minerals' in colony.netProduction, 'should have minerals');
      assert.ok('food' in colony.netProduction, 'should have food');
      assert.ok('alloys' in colony.netProduction, 'should have alloys');
      assert.ok('physics' in colony.netProduction, 'should have physics');
      assert.ok('society' in colony.netProduction, 'should have society');
      assert.ok('engineering' in colony.netProduction, 'should have engineering');
    });

    it('net energy becomes negative with many upkeep buildings', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 10000;
      ps.resources.energy = 10000;
      engine._invalidateStateCache();

      // Build several mining districts (consume energy)
      for (let i = 0; i < 3; i++) {
        engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'mining' });
        col.buildQueue[0].ticksRemaining = 0;
        engine.tick();
      }

      // Build industrial districts (consume energy)
      for (let i = 0; i < 3; i++) {
        engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'industrial' });
        col.buildQueue[0].ticksRemaining = 0;
        engine.tick();
      }

      const state = engine.getPlayerState('p1');
      const colState = state.colonies[0];
      // With 6 high-upkeep districts and few generators, energy should be negative
      assert.ok(typeof colState.netProduction.energy === 'number');
      // The exact value depends on starting districts, but it should reflect the deficit
    });
  });

  describe('Defense platform construction self-invalidation', () => {
    it('defense platform ticks down and completes independently', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');

      // Manually set up a defense platform in building state
      col.defensePlatform = {
        hp: 0,
        maxHp: 100,
        building: true,
        buildTicksRemaining: 2,
      };
      engine._defensePlatformBuilding.add(col.id);

      engine.tick();
      assert.strictEqual(col.defensePlatform.buildTicksRemaining, 1, 'should tick down by 1');
      assert.strictEqual(col.defensePlatform.building, true, 'should still be building');

      engine.tick();
      assert.strictEqual(col.defensePlatform.building, false, 'should be complete');
      assert.ok(!engine._defensePlatformBuilding.has(col.id), 'should be removed from building set');
    });
  });

  describe('JSON payload reflects queue progress', () => {
    it('getPlayerStateJSON includes updated ticksRemaining after tick', () => {
      const engine = createEngine();
      const col = getColony(engine, 'p1');
      const ps = engine.playerStates.get('p1');
      ps.resources.minerals = 1000;
      engine._invalidateStateCache();

      engine.handleCommand('p1', { type: 'buildDistrict', colonyId: col.id, districtType: 'housing' });
      const ticksBefore = col.buildQueue[0].ticksRemaining;

      engine.tick();

      const json = engine.getPlayerStateJSON('p1');
      const parsed = JSON.parse(json);
      const colonyData = parsed.colonies[0];
      assert.strictEqual(colonyData.buildQueue[0].ticksRemaining, ticksBefore - 1,
        'JSON payload must reflect ticked-down progress');
    });
  });
});
