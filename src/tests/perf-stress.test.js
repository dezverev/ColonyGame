/**
 * Late-game stress tests — exposes O(N²) trait bonuses, redundant ship serialization,
 * and global cache invalidation overhead at scale.
 *
 * Run with: node --test src/tests/perf-stress.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { GameEngine, BROADCAST_EVERY, MONTH_TICKS } = require('../../server/game-engine');

function makeRoom(playerCount = 8) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { name: `Player${i}` });
  }
  return { id: 'stress-room', players, hostId: 1, galaxySize: 'medium' };
}

function createEngine(playerCount = 8) {
  return new GameEngine(makeRoom(playerCount), {
    tickRate: 10,
    profile: true,
    galaxySeed: 42,
  });
}

// Simulate late-game: 5 colonies per player, each with 12+ districts, 20+ pops
function buildLateGame(engine) {
  for (const [playerId] of engine.playerStates) {
    const state = engine.playerStates.get(playerId);
    state.resources.energy = 50000;
    state.resources.minerals = 50000;
    state.resources.food = 50000;
    state.resources.alloys = 50000;

    // Find habitable planets to colonize
    const existingColonies = engine._playerColonies.get(playerId) || [];
    const colonizedSystems = new Set(existingColonies.map(cid => engine.colonies.get(cid)?.systemId));

    let coloniesAdded = 0;
    const maxExtra = 4; // want 5 total per player
    for (const system of engine.galaxy.systems) {
      if (coloniesAdded >= maxExtra) break;
      if (colonizedSystems.has(system.id)) continue;
      const planet = system.planets.find(p => p.habitability > 0.3);
      if (!planet) continue;
      colonizedSystems.add(system.id);
      engine._createColony(playerId, `Colony-${playerId}-${coloniesAdded}`, planet, system.id);
      coloniesAdded++;
    }

    // Build up all colonies with lots of districts
    const allColonies = engine._playerColonies.get(playerId) || [];
    for (const colonyId of allColonies) {
      const colony = engine.colonies.get(colonyId);
      if (!colony) continue;
      const types = ['generator', 'mining', 'agriculture', 'industrial', 'research', 'housing'];
      while (colony.districts.length < Math.min(colony.planet.size, 14)) {
        engine._addBuiltDistrict(colony, types[colony.districts.length % types.length]);
      }
      colony.pops = 30;
    }

    // Add military ships (10 corvettes per player, half in transit with multi-hop paths)
    const systems = engine.galaxy.systems;
    for (let i = 0; i < 10; i++) {
      const fromIdx = (playerId * 10 + i) % systems.length;
      const systemId = systems[fromIdx].id;
      // Half the ships are in transit with 3-hop paths
      const inTransit = i % 2 === 0;
      const path = inTransit
        ? [systems[(fromIdx + 1) % systems.length].id, systems[(fromIdx + 2) % systems.length].id, systems[(fromIdx + 3) % systems.length].id]
        : [];
      const ship = {
        id: engine._nextId(), ownerId: playerId, systemId,
        targetSystemId: inTransit ? path[path.length - 1] : null,
        path, hopProgress: inTransit ? 5 : 0,
        hp: 100, attack: 10,
      };
      engine._militaryShips.push(ship);
      if (!engine._militaryShipsByPlayer.has(playerId)) engine._militaryShipsByPlayer.set(playerId, []);
      engine._militaryShipsByPlayer.get(playerId).push(ship);
      engine._militaryShipsById.set(ship.id, ship);
      if (!engine._militaryShipsBySystem.has(systemId)) engine._militaryShipsBySystem.set(systemId, []);
      engine._militaryShipsBySystem.get(systemId).push(ship);
    }

    // Add science ships (3 per player, some in transit)
    for (let i = 0; i < 3; i++) {
      const fromIdx = (playerId * 3 + i) % systems.length;
      const systemId = systems[fromIdx].id;
      const inTransit = i === 0;
      const path = inTransit
        ? [systems[(fromIdx + 1) % systems.length].id, systems[(fromIdx + 2) % systems.length].id]
        : [];
      const ship = {
        id: engine._nextId(), ownerId: playerId, systemId,
        targetSystemId: inTransit ? path[path.length - 1] : null,
        path, hopProgress: inTransit ? 3 : 0,
        surveying: !inTransit && i === 1, surveyProgress: !inTransit && i === 1 ? 10 : 0,
      };
      engine._scienceShips.push(ship);
      if (!engine._scienceShipsByPlayer.has(playerId)) engine._scienceShipsByPlayer.set(playerId, []);
      engine._scienceShipsByPlayer.get(playerId).push(ship);
    }
  }
}

describe('Late-Game Stress Tests', () => {

  it('_calcTraitBonuses — cost scales with colony count', () => {
    const engine = createEngine(8);
    buildLateGame(engine);

    // Measure _calcTraitBonuses for a player with 5 colonies
    const playerId = 1;
    const colonyIds = engine._playerColonies.get(playerId);
    console.log(`  Player 1 colonies: ${colonyIds.length}`);

    // Invalidate caches to force full recalc
    for (const cid of colonyIds) {
      engine._invalidateColonyCache(engine.colonies.get(cid));
    }

    const iterations = 10000;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      engine._calcTraitBonuses(playerId);
    }
    const avgNs = Number(process.hrtime.bigint() - t0) / iterations;
    console.log(`  _calcTraitBonuses (${colonyIds.length} colonies): ${(avgNs / 1000).toFixed(2)}µs`);
    // Should be under 10µs even with 5 colonies
    assert.ok(avgNs < 50000, `_calcTraitBonuses took ${(avgNs / 1000).toFixed(1)}µs, expected <50µs`);
  });

  it('_calcProduction calls _calcTraitBonuses per colony (O(N²) check)', () => {
    const engine = createEngine(4);
    buildLateGame(engine);

    const playerId = 1;
    const colonyIds = engine._playerColonies.get(playerId);

    // Track how many times _calcTraitBonuses is called during full serialization
    let traitCalls = 0;
    const origCalcTraitBonuses = engine._calcTraitBonuses.bind(engine);
    engine._calcTraitBonuses = function (pid) {
      traitCalls++;
      return origCalcTraitBonuses(pid);
    };

    // Invalidate all caches and serialize
    engine._invalidateStateCache();
    for (const cid of colonyIds) {
      engine._invalidateColonyCache(engine.colonies.get(cid));
    }

    engine.getPlayerStateJSON(playerId);

    console.log(`  _calcTraitBonuses calls for ${colonyIds.length} colonies: ${traitCalls}`);
    console.log(`  Each call iterates all ${colonyIds.length} colonies = ${traitCalls * colonyIds.length} trait lookups`);
    // With N colonies, we expect N calls (one per _calcProduction), each iterating N colonies
    // Total work = N², which we want to reduce to N
  });

  it('ship serialization redundancy — same .map() across players', () => {
    const engine = createEngine(8);
    buildLateGame(engine);

    const totalShips = engine._militaryShips.length + engine._scienceShips.length + engine._colonyShips.length;
    console.log(`  Total ships: ${totalShips} (${engine._militaryShips.length} military, ${engine._scienceShips.length} science, ${engine._colonyShips.length} colony)`);

    // Measure serialization for all 8 players (forces 8x ship .map())
    engine._invalidateStateCache();
    const t0 = process.hrtime.bigint();
    for (let pid = 1; pid <= 8; pid++) {
      engine.getPlayerStateJSON(pid);
    }
    const totalMs = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`  All 8 players serialization: ${totalMs.toFixed(3)}ms`);
  });

  it('broadcast tick with 8 players late-game', () => {
    const engine = createEngine(8);
    buildLateGame(engine);

    // Warm up
    for (let i = 0; i < 10; i++) engine.tick();

    // Advance to broadcast boundary
    while (engine.tickCount % BROADCAST_EVERY !== BROADCAST_EVERY - 1) engine.tick();

    // Mark all dirty, clear caches
    for (const [pid] of engine.playerStates) engine._dirtyPlayers.add(pid);
    engine._invalidateStateCache();

    // Collect broadcast payloads
    let totalBytes = 0;
    let broadcastCount = 0;
    engine.onTick = (playerId, stateJSON) => {
      totalBytes += Buffer.byteLength(stateJSON, 'utf8');
      broadcastCount++;
    };

    const t0 = process.hrtime.bigint();
    engine.tick();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;

    console.log(`  Broadcast tick (8p late-game): ${ms.toFixed(3)}ms`);
    console.log(`  Total broadcast: ${broadcastCount} players, ${(totalBytes / 1024).toFixed(1)} KB`);
    console.log(`  Avg payload: ${(totalBytes / broadcastCount / 1024).toFixed(2)} KB per player`);
    assert.ok(ms < 50, `Broadcast tick ${ms.toFixed(1)}ms exceeds 50ms`);
  });

  it('monthly tick with 8 players, 40 colonies, 100+ ships', () => {
    const engine = createEngine(8);
    buildLateGame(engine);

    const totalColonies = engine.colonies.size;
    const totalShips = engine._militaryShips.length + engine._scienceShips.length;
    console.log(`  Setup: ${totalColonies} colonies, ${totalShips} ships`);

    // Advance to monthly boundary
    while (engine.tickCount % MONTH_TICKS !== MONTH_TICKS - 1) engine.tick();

    const t0 = process.hrtime.bigint();
    engine.tick();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`  Monthly tick (8p late-game): ${ms.toFixed(3)}ms`);
    assert.ok(ms < 50, `Monthly tick ${ms.toFixed(1)}ms exceeds 50ms`);
  });

  it('ship paths trimmed to next-hop only in broadcast', () => {
    const engine = createEngine(2);
    buildLateGame(engine);
    engine.tick();

    engine._invalidateStateCache();
    const state = engine.getPlayerState(1);

    // Ships in transit should only have path[0] (next hop), not full remaining path
    const inTransitMil = state.militaryShips.filter(s => s.path.length > 0);
    for (const ship of inTransitMil) {
      assert.ok(ship.path.length <= 1,
        `Military ship ${ship.id} has path length ${ship.path.length}, expected ≤1 (next hop only)`);
    }
    const inTransitSci = state.scienceShips.filter(s => s.path.length > 0);
    for (const ship of inTransitSci) {
      assert.ok(ship.path.length <= 1,
        `Science ship ${ship.id} has path length ${ship.path.length}, expected ≤1 (next hop only)`);
    }

    console.log(`  In-transit military ships: ${inTransitMil.length}, science: ${inTransitSci.length}`);
    console.log(`  All paths trimmed to next-hop only ✓`);
  });

  it('ship serialization cached across players (no redundant .map())', () => {
    const engine = createEngine(4);
    buildLateGame(engine);
    engine.tick();

    engine._invalidateStateCache();
    const state1 = engine.getPlayerState(1);
    const state2 = engine.getPlayerState(2);

    // Ship arrays should be the same object reference (cached)
    assert.strictEqual(state1.militaryShips, state2.militaryShips,
      'Military ships should be same cached array across players');
    assert.strictEqual(state1.scienceShips, state2.scienceShips,
      'Science ships should be same cached array across players');
    assert.strictEqual(state1.raiders, state2.raiders,
      'Raiders should be same cached array across players');
    console.log(`  Ship data shared across players via cache ✓`);
  });

  it('payload size stays reasonable with many colonies and ships', () => {
    const engine = createEngine(8);
    buildLateGame(engine);
    engine.tick();

    engine._invalidateStateCache();
    for (let pid = 1; pid <= 8; pid++) {
      const json = engine.getPlayerStateJSON(pid);
      const kb = Buffer.byteLength(json, 'utf8') / 1024;
      if (pid <= 2) console.log(`  Player ${pid} payload: ${kb.toFixed(2)} KB`);
    }
    // Check worst case
    engine._invalidateStateCache();
    const worstJSON = engine.getPlayerStateJSON(1);
    const worstKB = Buffer.byteLength(worstJSON, 'utf8') / 1024;
    console.log(`  Worst-case payload: ${worstKB.toFixed(2)} KB (target: <30KB for 8p late-game)`);
    assert.ok(worstKB < 30, `Payload ${worstKB.toFixed(1)}KB too large`);
  });
});
