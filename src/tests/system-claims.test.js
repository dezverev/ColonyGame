const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { GameEngine, SYSTEM_CLAIM_INFLUENCE_COST, SYSTEM_CLAIM_VP } = require('../../server/game-engine');

function createEngine() {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  players.set('p2', { name: 'Player 2' });
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  return new GameEngine(room, { tickRate: 10 });
}

function giveInfluence(engine, playerId, amount) {
  engine.playerStates.get(playerId).resources.influence = amount;
}

// Find an adjacent system without a colony
function findClaimable(engine, playerId) {
  const colonySystems = new Set();
  for (const c of engine.colonies.values()) colonySystems.add(c.systemId);

  for (const colonyId of (engine._playerColonies.get(playerId) || [])) {
    const colony = engine.colonies.get(colonyId);
    if (!colony) continue;
    for (const nId of (engine._adjacency.get(colony.systemId) || [])) {
      if (!colonySystems.has(nId)) return nId;
    }
  }
  return null;
}

// Find an adjacent system with a habitable planet
function findClaimableHabitable(engine, playerId) {
  const colonySystems = new Set();
  for (const c of engine.colonies.values()) colonySystems.add(c.systemId);

  for (const colonyId of (engine._playerColonies.get(playerId) || [])) {
    const colony = engine.colonies.get(colonyId);
    if (!colony) continue;
    for (const nId of (engine._adjacency.get(colony.systemId) || [])) {
      if (colonySystems.has(nId)) continue;
      const nSys = engine.galaxy.systems[nId];
      if (nSys.planets && nSys.planets.some(p => p.habitability >= 20 && !p.colonized)) return nId;
    }
  }
  return null;
}

describe('System claims — constants', () => {
  it('should export claim constants', () => {
    assert.strictEqual(SYSTEM_CLAIM_INFLUENCE_COST, 25);
    assert.strictEqual(SYSTEM_CLAIM_VP, 1);
  });
});

describe('System claims — claimSystem command', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should claim a system adjacent to a colony', () => {
    giveInfluence(engine, 'p1', 50);
    const sysId = findClaimable(engine, 'p1');
    assert.ok(sysId !== null, 'Should find a claimable system');

    const result = engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });
    assert.ok(result.ok, `Expected ok but got: ${result.error}`);
    assert.strictEqual(engine._systemClaims.get(sysId), 'p1');
    assert.strictEqual(engine.playerStates.get('p1').resources.influence, 50 - SYSTEM_CLAIM_INFLUENCE_COST);
  });

  it('should claim via ship presence in target system', () => {
    giveInfluence(engine, 'p1', 50);
    const sciShips = engine._scienceShipsByPlayer.get('p1') || [];
    if (sciShips.length === 0) return;

    const ship = sciShips[0];
    // Move ship to a non-colony system
    const colonySystems = new Set();
    for (const c of engine.colonies.values()) colonySystems.add(c.systemId);

    let targetId = null;
    for (const nId of (engine._adjacency.get(ship.systemId) || [])) {
      if (!colonySystems.has(nId)) { targetId = nId; break; }
    }
    if (targetId === null) return;

    // Move ship to a neighbor of that system so the target is 2 hops away
    let farId = null;
    for (const nId of (engine._adjacency.get(targetId) || [])) {
      if (!colonySystems.has(nId) && nId !== ship.systemId) { farId = nId; break; }
    }

    // Place ship directly in the target system
    ship.systemId = targetId;
    ship.path = [];
    const result = engine.handleCommand('p1', { type: 'claimSystem', systemId: targetId });
    assert.ok(result.ok, `Expected ok but got: ${result.error}`);
  });

  it('should reject missing systemId', () => {
    const result = engine.handleCommand('p1', { type: 'claimSystem' });
    assert.ok(result.error);
    assert.match(result.error, /Missing systemId/i);
  });

  it('should reject invalid systemId', () => {
    const result = engine.handleCommand('p1', { type: 'claimSystem', systemId: 99999 });
    assert.ok(result.error);
    assert.match(result.error, /Invalid system/i);
  });

  it('should reject claiming own already-claimed system', () => {
    giveInfluence(engine, 'p1', 100);
    const sysId = findClaimable(engine, 'p1');
    assert.ok(sysId !== null);

    engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });
    const result = engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });
    assert.ok(result.error);
    assert.match(result.error, /already claimed/i);
  });

  it('should reject claiming system claimed by another player', () => {
    giveInfluence(engine, 'p1', 100);
    giveInfluence(engine, 'p2', 100);

    const sysId = findClaimable(engine, 'p1');
    assert.ok(sysId !== null);

    engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });

    // Put p2's science ship on the target system
    const sciShips2 = engine._scienceShipsByPlayer.get('p2') || [];
    if (sciShips2.length > 0) {
      sciShips2[0].systemId = sysId;
      sciShips2[0].path = [];
    }

    const result = engine.handleCommand('p2', { type: 'claimSystem', systemId: sysId });
    assert.ok(result.error);
    assert.match(result.error, /already claimed/i);
  });

  it('should reject claiming a system with a colony', () => {
    giveInfluence(engine, 'p1', 100);
    const colonyIds = engine._playerColonies.get('p1') || [];
    const colony = engine.colonies.get(colonyIds[0]);

    const result = engine.handleCommand('p1', { type: 'claimSystem', systemId: colony.systemId });
    assert.ok(result.error);
    assert.match(result.error, /already has a colony/i);
  });

  it('should reject claiming system without proximity', () => {
    giveInfluence(engine, 'p1', 100);

    // Collect all systems within reach of player (colonies + ships + their neighbors)
    const reachable = new Set();
    const colonySystems = new Set();
    for (const c of engine.colonies.values()) colonySystems.add(c.systemId);

    for (const colonyId of (engine._playerColonies.get('p1') || [])) {
      const c = engine.colonies.get(colonyId);
      if (c) {
        reachable.add(c.systemId);
        for (const n of (engine._adjacency.get(c.systemId) || [])) reachable.add(n);
      }
    }
    for (const ship of (engine._scienceShipsByPlayer.get('p1') || [])) {
      if (!ship.path || ship.path.length === 0) {
        reachable.add(ship.systemId);
        for (const n of (engine._adjacency.get(ship.systemId) || [])) reachable.add(n);
      }
    }
    for (const ship of (engine._militaryShipsByPlayer.get('p1') || [])) {
      if (!ship.path || ship.path.length === 0) {
        reachable.add(ship.systemId);
        for (const n of (engine._adjacency.get(ship.systemId) || [])) reachable.add(n);
      }
    }
    for (const ship of (engine._colonyShipsByPlayer.get('p1') || [])) {
      if (!ship.path || ship.path.length === 0) {
        reachable.add(ship.systemId);
        for (const n of (engine._adjacency.get(ship.systemId) || [])) reachable.add(n);
      }
    }

    let farId = null;
    for (let i = 0; i < engine.galaxy.systems.length; i++) {
      if (!reachable.has(i) && !colonySystems.has(i)) { farId = i; break; }
    }
    if (farId === null) return; // skip if galaxy is too connected

    const result = engine.handleCommand('p1', { type: 'claimSystem', systemId: farId });
    assert.ok(result.error);
    assert.match(result.error, /ship or colony/i);
  });

  it('should reject claiming with insufficient influence', () => {
    giveInfluence(engine, 'p1', 10);
    const sysId = findClaimable(engine, 'p1');
    if (sysId === null) return;

    const result = engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });
    assert.ok(result.error);
    assert.match(result.error, /influence/i);
  });
});

describe('System claims — colonization blocking', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should block sendColonyShip to enemy-claimed system', () => {
    giveInfluence(engine, 'p1', 100);
    const sysId = findClaimableHabitable(engine, 'p1');
    if (sysId === null) return;

    engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });

    // Give p2 a colony ship at the target system
    const ship = { id: 'test-cs', ownerId: 'p2', systemId: sysId, targetSystemId: null, path: [], hopProgress: 0 };
    engine._colonyShips.push(ship);
    let pArr = engine._colonyShipsByPlayer.get('p2');
    if (!pArr) { pArr = []; engine._colonyShipsByPlayer.set('p2', pArr); }
    pArr.push(ship);

    const result = engine.handleCommand('p2', { type: 'sendColonyShip', shipId: 'test-cs', targetSystemId: sysId });
    assert.ok(result.error);
    assert.match(result.error, /claimed/i);
  });

  it('should allow sendColonyShip to own claimed system', () => {
    giveInfluence(engine, 'p1', 100);
    const sysId = findClaimableHabitable(engine, 'p1');
    if (sysId === null) return;

    engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });

    // Give p1 a colony ship near the target
    const colonyIds = engine._playerColonies.get('p1') || [];
    const colony = engine.colonies.get(colonyIds[0]);
    const ship = { id: 'test-cs', ownerId: 'p1', systemId: colony.systemId, targetSystemId: null, path: [], hopProgress: 0 };
    engine._colonyShips.push(ship);
    let pArr = engine._colonyShipsByPlayer.get('p1');
    if (!pArr) { pArr = []; engine._colonyShipsByPlayer.set('p1', pArr); }
    pArr.push(ship);

    const result = engine.handleCommand('p1', { type: 'sendColonyShip', shipId: 'test-cs', targetSystemId: sysId });
    if (result.error) {
      // Should not fail due to claim
      assert.ok(!result.error.match(/claimed/i), `Should not fail due to claim, but got: ${result.error}`);
    }
  });

  it('should block colony founding on arrival at enemy-claimed system', () => {
    giveInfluence(engine, 'p1', 100);
    const sysId = findClaimableHabitable(engine, 'p1');
    if (sysId === null) return;

    engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });

    // Simulate p2's colony ship arriving
    const ship = { id: 'test-cs-arrive', ownerId: 'p2', systemId: sysId, targetSystemId: sysId, path: [], hopProgress: 0 };
    engine._colonyShips.push(ship);
    let pArr = engine._colonyShipsByPlayer.get('p2');
    if (!pArr) { pArr = []; engine._colonyShipsByPlayer.set('p2', pArr); }
    pArr.push(ship);

    const coloniesBefore = engine.colonies.size;
    engine._foundColonyFromShip(ship);
    assert.strictEqual(engine.colonies.size, coloniesBefore, 'No colony should be created in enemy-claimed system');
  });
});

describe('System claims — VP', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should award VP per claimed system', () => {
    giveInfluence(engine, 'p1', 200);

    const vpBefore = engine._calcVPBreakdown('p1');
    assert.strictEqual(vpBefore.claimedSystems, 0);
    assert.strictEqual(vpBefore.claimsVP, 0);

    // Claim adjacent systems
    const colonyIds = engine._playerColonies.get('p1') || [];
    const colony = engine.colonies.get(colonyIds[0]);
    const sys = engine.galaxy.systems[colony.systemId];
    const colonySystems = new Set();
    for (const c of engine.colonies.values()) colonySystems.add(c.systemId);

    let claimed = 0;
    for (const nId of (engine._adjacency.get(colony.systemId) || [])) {
      if (!colonySystems.has(nId) && claimed < 2) {
        const r = engine.handleCommand('p1', { type: 'claimSystem', systemId: nId });
        if (r.ok) claimed++;
      }
    }
    assert.ok(claimed > 0, 'Should claim at least one system');

    engine._vpCacheTick = -1;
    const vpAfter = engine._calcVPBreakdown('p1');
    assert.strictEqual(vpAfter.claimedSystems, claimed);
    assert.strictEqual(vpAfter.claimsVP, claimed * SYSTEM_CLAIM_VP);
    assert.ok(vpAfter.vp > vpBefore.vp);
  });
});

describe('System claims — serialization', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should include systemClaims in getPlayerState', () => {
    giveInfluence(engine, 'p1', 100);
    const sysId = findClaimable(engine, 'p1');
    assert.ok(sysId !== null);

    engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });

    const state = engine.getPlayerState('p1');
    assert.ok(state.systemClaims);
    assert.strictEqual(state.systemClaims[sysId], 'p1');
  });

  it('should include systemClaims in getPlayerStateJSON', () => {
    giveInfluence(engine, 'p1', 100);
    const sysId = findClaimable(engine, 'p1');
    assert.ok(sysId !== null);

    engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });

    const json = engine.getPlayerStateJSON('p1');
    const parsed = JSON.parse(json);
    assert.ok(parsed.systemClaims);
    assert.strictEqual(parsed.systemClaims[String(sysId)], 'p1');
  });
});

describe('System claims — events', () => {
  it('should emit systemClaimed event', () => {
    const engine = createEngine();
    giveInfluence(engine, 'p1', 100);
    const sysId = findClaimable(engine, 'p1');
    assert.ok(sysId !== null);

    // Clear any pending events from game start
    engine._pendingEvents = [];

    engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });

    const claimEvts = engine._pendingEvents.filter(e => e.eventType === 'systemClaimed');
    assert.ok(claimEvts.length >= 1, 'Should emit systemClaimed event');
    assert.strictEqual(claimEvts[0].playerId, 'p1');
    assert.strictEqual(claimEvts[0].systemId, sysId);
    assert.ok(claimEvts[0].systemName);
  });
});
