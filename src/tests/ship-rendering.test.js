/**
 * End-to-end test: server ticks → ship data → position rendering.
 * Verifies that the positions computed from server state during transit
 * are monotonically progressing along the path (no rubber-banding, no warping).
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { GameEngine, SCIENCE_SHIP_BUILD_TIME, SCIENCE_SHIP_HOP_TICKS, BROADCAST_EVERY } = require('../../server/game-engine.js');

function makeRoom(playerCount = 1) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { id: i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 1, maxPlayers: 4, status: 'playing', players };
}

function buildScienceShip(engine, playerId) {
  const state = engine.playerStates.get(playerId);
  state.resources.minerals = 500;
  state.resources.alloys = 200;
  const colonyIds = engine._playerColonies.get(playerId) || [];
  const colony = engine.colonies.get(colonyIds[0]);
  engine.handleCommand(playerId, { type: 'buildScienceShip', colonyId: colony.id });
  for (let i = 0; i < SCIENCE_SHIP_BUILD_TIME; i++) engine.tick();
  return engine._scienceShips.find(s => s.ownerId === playerId);
}

function findNeighbor(engine, systemId) {
  for (const [a, b] of engine.galaxy.hyperlanes) {
    if (a === systemId) return b;
    if (b === systemId) return a;
  }
  return null;
}

// Replicate the exact client-side position computation from galaxy-view.js _shipTargetPos
function shipTargetPos(ship, hopTicks, yOffset, systems) {
  if (!ship.path || ship.path.length === 0) return null;
  const fromSys = systems[ship.systemId];
  const toSys = systems[ship.path[0]];
  if (!fromSys || !toSys) return null;
  const t = (ship.hopProgress || 0) / hopTicks;
  return {
    x: fromSys.x + (toSys.x - fromSys.x) * t,
    y: (fromSys.y || 0) + ((toSys.y || 0) - (fromSys.y || 0)) * t + yOffset,
    z: fromSys.z + (toSys.z - fromSys.z) * t,
  };
}

describe('Ship rendering — server data produces correct positions', () => {
  let engine;
  const playerId = 1;
  let systems;
  let sciShip;
  let homeSystem;
  let targetSystem;

  beforeEach(() => {
    engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    systems = engine.galaxy.systems;
    sciShip = buildScienceShip(engine, playerId);
    assert.ok(sciShip, 'Should have built a science ship');
    homeSystem = sciShip.systemId;
    targetSystem = findNeighbor(engine, homeSystem);
    assert.ok(targetSystem !== null, 'Should find a neighbor system');
  });

  it('hopProgress increases monotonically within each hop segment', () => {
    const result = engine.handleCommand(playerId, { type: 'sendScienceShip', shipId: sciShip.id, targetSystemId: targetSystem });
    assert.ok(result.ok, `sendScienceShip failed: ${result.error}`);

    const progressValues = [];
    let arrived = false;

    for (let tick = 0; tick < 200 && !arrived; tick++) {
      engine.tick();

      // Check every tick (not just broadcast ticks) — this is what the client might see
      const state = engine.getPlayerState(playerId);
      const ship = state.scienceShips.find(s => s.id === sciShip.id);
      assert.ok(ship, 'Ship should exist');

      if (ship.path && ship.path.length > 0 && !ship.surveying) {
        progressValues.push({
          tick: engine.tickCount,
          systemId: ship.systemId,
          nextSystem: ship.path[0],
          hopProgress: ship.hopProgress,
        });
      } else if (ship.surveying || ship.path.length === 0) {
        arrived = true;
      }
    }

    assert.ok(progressValues.length > 0, 'Should have recorded transit ticks');
    assert.ok(arrived, 'Ship should have arrived');

    // Within each segment, hopProgress must be non-decreasing
    for (let i = 1; i < progressValues.length; i++) {
      const prev = progressValues[i - 1];
      const curr = progressValues[i];
      if (prev.systemId === curr.systemId && prev.nextSystem === curr.nextSystem) {
        assert.ok(curr.hopProgress >= prev.hopProgress,
          `hopProgress backward: tick ${prev.tick} hp=${prev.hopProgress} → tick ${curr.tick} hp=${curr.hopProgress}`);
      }
    }
  });

  it('world positions from server data progress forward along lane', () => {
    engine.handleCommand(playerId, { type: 'sendScienceShip', shipId: sciShip.id, targetSystemId: targetSystem });

    const homeSys = systems[homeSystem];
    const positions = [];
    let arrived = false;

    for (let tick = 0; tick < 200 && !arrived; tick++) {
      engine.tick();

      // Only check at broadcast boundaries (what client actually receives)
      if (engine.tickCount % BROADCAST_EVERY === 0) {
        const state = engine.getPlayerState(playerId);
        const ship = state.scienceShips.find(s => s.id === sciShip.id);

        if (ship.path && ship.path.length > 0 && !ship.surveying) {
          const pos = shipTargetPos(ship, SCIENCE_SHIP_HOP_TICKS, 4, systems);
          if (pos) {
            positions.push({
              tick: engine.tickCount,
              x: pos.x, z: pos.z,
              hp: ship.hopProgress,
              sysId: ship.systemId,
              nextSys: ship.path[0],
            });
          }
        } else {
          arrived = true;
        }
      }
    }

    assert.ok(positions.length >= 2, `Need multiple samples, got ${positions.length}`);

    // Within each segment, hp must increase (therefore position progresses along lane)
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1];
      const curr = positions[i];
      if (prev.sysId === curr.sysId && prev.nextSys === curr.nextSys) {
        assert.ok(curr.hp >= prev.hp,
          `Position regressed: tick ${prev.tick} hp=${prev.hp} → tick ${curr.tick} hp=${curr.hp}`);
      }
    }
  });

  it('server never sends ship back to source system during transit', () => {
    engine.handleCommand(playerId, { type: 'sendScienceShip', shipId: sciShip.id, targetSystemId: targetSystem });

    let leftHome = false;

    for (let tick = 0; tick < 200; tick++) {
      engine.tick();
      const state = engine.getPlayerState(playerId);
      const ship = state.scienceShips.find(s => s.id === sciShip.id);

      if (ship.systemId !== homeSystem) leftHome = true;
      if (leftHome && ship.systemId === homeSystem) {
        assert.fail(`Ship returned to home system at tick ${engine.tickCount}! ` +
          `path=${JSON.stringify(ship.path)} hp=${ship.hopProgress} surveying=${ship.surveying}`);
      }
    }
    assert.ok(leftHome, 'Ship should have left home');
  });

  it('every tick during transit has valid path and hopProgress in [0, HOP_TICKS)', () => {
    engine.handleCommand(playerId, { type: 'sendScienceShip', shipId: sciShip.id, targetSystemId: targetSystem });

    let arrived = false;
    for (let tick = 0; tick < 200 && !arrived; tick++) {
      engine.tick();
      const state = engine.getPlayerState(playerId);
      const ship = state.scienceShips.find(s => s.id === sciShip.id);

      if (ship.path && ship.path.length > 0 && !ship.surveying) {
        assert.ok(ship.hopProgress >= 0, `hp should be >= 0, got ${ship.hopProgress} at tick ${engine.tickCount}`);
        assert.ok(ship.hopProgress < SCIENCE_SHIP_HOP_TICKS,
          `hp should be < ${SCIENCE_SHIP_HOP_TICKS}, got ${ship.hopProgress} at tick ${engine.tickCount}`);
        assert.ok(systems[ship.systemId], `systemId ${ship.systemId} invalid at tick ${engine.tickCount}`);
        assert.ok(systems[ship.path[0]], `path[0]=${ship.path[0]} invalid at tick ${engine.tickCount}`);
      } else {
        arrived = true;
      }
    }
    assert.ok(arrived, 'Ship should arrive');
  });

  it('target position lies on the line between fromSys and toSys', () => {
    engine.handleCommand(playerId, { type: 'sendScienceShip', shipId: sciShip.id, targetSystemId: targetSystem });

    for (let tick = 0; tick < 200; tick++) {
      engine.tick();
      const state = engine.getPlayerState(playerId);
      const ship = state.scienceShips.find(s => s.id === sciShip.id);

      if (!ship.path || ship.path.length === 0 || ship.surveying) continue;

      const pos = shipTargetPos(ship, SCIENCE_SHIP_HOP_TICKS, 0, systems); // yOffset=0 for math
      if (!pos) continue;

      const fromSys = systems[ship.systemId];
      const toSys = systems[ship.path[0]];
      const t = ship.hopProgress / SCIENCE_SHIP_HOP_TICKS;

      // pos should equal lerp(fromSys, toSys, t)
      const expectedX = fromSys.x + (toSys.x - fromSys.x) * t;
      const expectedZ = fromSys.z + (toSys.z - fromSys.z) * t;
      assert.ok(Math.abs(pos.x - expectedX) < 0.001, `x off at tick ${engine.tickCount}: ${pos.x} vs ${expectedX}`);
      assert.ok(Math.abs(pos.z - expectedZ) < 0.001, `z off at tick ${engine.tickCount}: ${pos.z} vs ${expectedZ}`);
    }
  });
});

describe('Server cache bug — stale hopProgress in broadcasts', () => {
  const playerId = 1;

  it('consecutive broadcasts must have increasing hopProgress (not stale)', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const systems = engine.galaxy.systems;
    const ship = buildScienceShip(engine, playerId);
    const target = findNeighbor(engine, ship.systemId);
    engine.handleCommand(playerId, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: target });

    const broadcasts = [];
    let arrived = false;

    for (let tick = 0; tick < 200 && !arrived; tick++) {
      engine.tick();

      // Simulate broadcast: every BROADCAST_EVERY ticks when dirty
      if (engine.tickCount % BROADCAST_EVERY === 0) {
        // This is what the server actually sends — getPlayerStateJSON returns cached JSON
        const json = engine.getPlayerStateJSON(playerId);
        const state = JSON.parse(json);
        const s = state.scienceShips.find(ss => ss.id === ship.id);
        if (!s) continue;

        if (s.path && s.path.length > 0 && !s.surveying) {
          broadcasts.push({
            tick: engine.tickCount,
            systemId: s.systemId,
            nextSystem: s.path[0],
            hopProgress: s.hopProgress,
          });
        } else {
          arrived = true;
        }
      }
    }

    assert.ok(broadcasts.length >= 2, `Need multiple broadcasts, got ${broadcasts.length}`);

    // Within the same segment, hopProgress must INCREASE between broadcasts.
    // If the cache is stale, we'd see the same hopProgress repeated.
    for (let i = 1; i < broadcasts.length; i++) {
      const prev = broadcasts[i - 1];
      const curr = broadcasts[i];
      if (prev.systemId === curr.systemId && prev.nextSystem === curr.nextSystem) {
        assert.ok(curr.hopProgress > prev.hopProgress,
          `STALE CACHE: broadcast at tick ${curr.tick} has hopProgress=${curr.hopProgress}, ` +
          `same as tick ${prev.tick} hopProgress=${prev.hopProgress}. ` +
          `Server sent stale cached data!`);
      }
    }
  });
});

describe('Client extrapolation matches server — correct tick rate', () => {
  const { SPEED_INTERVALS } = require('../../server/game-engine.js');
  const playerId = 1;

  // Replicate the exact client extrapolation from galaxy-view.js _extrapolateTransitPos
  function clientExtrapolate(ship, hopTicks, gameSpeed, elapsedMs, systems) {
    if (!ship.path || ship.path.length === 0) return null;
    const fromSys = systems[ship.systemId];
    const toSys = systems[ship.path[0]];
    if (!fromSys || !toSys) return null;
    const msPerTick = SPEED_INTERVALS[gameSpeed];
    const elapsedTicks = elapsedMs / msPerTick;
    const hp = Math.min(ship.hopProgress + elapsedTicks, hopTicks - 0.5);
    const t = hp / hopTicks;
    return {
      x: fromSys.x + (toSys.x - fromSys.x) * t,
      z: fromSys.z + (toSys.z - fromSys.z) * t,
    };
  }

  it('client extrapolation at speed 2 stays within 1 tick of server after 300ms', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const systems = engine.galaxy.systems;
    const ship = buildScienceShip(engine, playerId);
    const target = findNeighbor(engine, ship.systemId);
    engine.handleCommand(playerId, { type: 'sendScienceShip', shipId: ship.id, targetSystemId: target });

    const gameSpeed = 2;
    const msPerTick = SPEED_INTERVALS[gameSpeed]; // 100ms

    // Tick a few times to get the ship moving
    for (let i = 0; i < 5; i++) engine.tick();

    // Snapshot the server state (this is what the client receives)
    const state = engine.getPlayerState(playerId);
    const serverShip = state.scienceShips.find(s => s.id === ship.id);
    if (!serverShip.path || serverShip.path.length === 0) return; // already arrived
    const snapshotHP = serverShip.hopProgress;

    // Simulate 300ms of server ticks (3 ticks at speed 2)
    for (let i = 0; i < 3; i++) engine.tick();
    const stateAfter = engine.getPlayerState(playerId);
    const serverShipAfter = stateAfter.scienceShips.find(s => s.id === ship.id);
    if (!serverShipAfter.path || serverShipAfter.path.length === 0) return;
    const serverHPAfter = serverShipAfter.hopProgress;

    // Client extrapolation: 300ms elapsed from snapshot
    const clientPos = clientExtrapolate(serverShip, SCIENCE_SHIP_HOP_TICKS, gameSpeed, 300, systems);
    const serverPos = shipTargetPos(serverShipAfter, SCIENCE_SHIP_HOP_TICKS, 0, systems);

    if (!clientPos || !serverPos) return;

    // Client predicted hp = snapshotHP + 300/100 = snapshotHP + 3
    // Server actual hp = snapshotHP + 3 (3 ticks at 100ms each)
    // They should match exactly
    const clientHP = snapshotHP + 300 / msPerTick;
    const drift = Math.abs(clientHP - serverHPAfter);
    assert.ok(drift < 1.5, `Drift too large: client predicted hp=${clientHP}, server=${serverHPAfter}, drift=${drift}`);

    // Positions should be very close
    const posDrift = Math.sqrt((clientPos.x - serverPos.x) ** 2 + (clientPos.z - serverPos.z) ** 2);
    assert.ok(posDrift < 5, `Position drift too large: ${posDrift.toFixed(1)} units`);
  });

  for (const speed of [1, 2, 3, 5]) {
    it(`SPEED_INTERVALS[${speed}] gives correct ticks/sec = ${1000 / SPEED_INTERVALS[speed]}`, () => {
      // This is the CRITICAL test: the formula msPerTick = SPEED_INTERVALS[speed]
      // must match the server's actual setInterval timing.
      const msPerTick = SPEED_INTERVALS[speed];
      const ticksPerSec = 1000 / msPerTick;

      // Server does setInterval(tick, SPEED_INTERVALS[speed])
      // So in 1 second, it runs 1000/interval ticks
      const expected = { 1: 5, 2: 10, 3: 20, 5: 50 };
      assert.strictEqual(ticksPerSec, expected[speed],
        `Speed ${speed}: ${ticksPerSec} ticks/sec, expected ${expected[speed]}`);

      // OLD WRONG formula: 100 / speed would give wrong msPerTick
      const wrongMsPerTick = 100 / speed;
      if (speed !== 5) { // speed 5 happens to be correct with wrong formula too (100/5=20)
        assert.notStrictEqual(wrongMsPerTick, msPerTick,
          `Speed ${speed}: old formula gives same result — bug not caught`);
      }
    });
  }
});
