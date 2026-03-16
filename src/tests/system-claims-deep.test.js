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

function getColonySystems(engine) {
  const set = new Set();
  for (const c of engine.colonies.values()) set.add(c.systemId);
  return set;
}

function findClaimable(engine, playerId) {
  const colonySystems = getColonySystems(engine);
  for (const colonyId of (engine._playerColonies.get(playerId) || [])) {
    const colony = engine.colonies.get(colonyId);
    if (!colony) continue;
    for (const nId of (engine._adjacency.get(colony.systemId) || [])) {
      if (!colonySystems.has(nId)) return nId;
    }
  }
  return null;
}

function findClaimableHabitable(engine, playerId) {
  const colonySystems = getColonySystems(engine);
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

describe('System claims deep — military ship proximity', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should allow claim via military ship in target system', () => {
    giveInfluence(engine, 'p1', 100);
    const colonySystems = getColonySystems(engine);

    // Find a system two hops from colony (not adjacent to colony) where we can place a corvette
    const colonyIds = engine._playerColonies.get('p1') || [];
    const colony = engine.colonies.get(colonyIds[0]);
    const neighbors = engine._adjacency.get(colony.systemId) || [];
    let targetId = null;
    for (const nId of neighbors) {
      if (!colonySystems.has(nId)) {
        // Find a neighbor of the neighbor that isn't adjacent to any colony
        for (const nnId of (engine._adjacency.get(nId) || [])) {
          if (!colonySystems.has(nnId) && nnId !== colony.systemId) {
            targetId = nnId;
            break;
          }
        }
        if (targetId) break;
      }
    }
    if (targetId === null) return; // skip if galaxy too connected

    // Place a military ship at the target
    const corvettes = engine._militaryShipsByPlayer.get('p1') || [];
    if (corvettes.length === 0) return;
    corvettes[0].systemId = targetId;
    corvettes[0].path = [];

    const result = engine.handleCommand('p1', { type: 'claimSystem', systemId: targetId });
    assert.ok(result.ok, `Expected ok but got: ${result.error}`);
    assert.strictEqual(engine._systemClaims.get(targetId), 'p1');
  });

  it('should allow claim via colony ship in target system', () => {
    giveInfluence(engine, 'p1', 100);
    const colonySystems = getColonySystems(engine);
    const colonyIds = engine._playerColonies.get('p1') || [];
    const colony = engine.colonies.get(colonyIds[0]);

    // Find non-colony neighbor
    let targetId = null;
    for (const nId of (engine._adjacency.get(colony.systemId) || [])) {
      if (!colonySystems.has(nId)) { targetId = nId; break; }
    }
    if (targetId === null) return;

    // Inject a colony ship at the target
    const ship = { id: 'test-cs-prox', ownerId: 'p1', systemId: targetId, targetSystemId: null, path: [], hopProgress: 0 };
    engine._colonyShips.push(ship);
    let pArr = engine._colonyShipsByPlayer.get('p1');
    if (!pArr) { pArr = []; engine._colonyShipsByPlayer.set('p1', pArr); }
    pArr.push(ship);

    const result = engine.handleCommand('p1', { type: 'claimSystem', systemId: targetId });
    assert.ok(result.ok, `Expected ok but got: ${result.error}`);
  });
});

describe('System claims deep — moving ships excluded from proximity', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should not count a ship with a non-empty path for proximity', () => {
    giveInfluence(engine, 'p1', 100);
    const colonySystems = getColonySystems(engine);

    // Find all reachable systems from colonies (to exclude them)
    const reachableFromColonies = new Set();
    for (const colonyId of (engine._playerColonies.get('p1') || [])) {
      const c = engine.colonies.get(colonyId);
      if (c) {
        reachableFromColonies.add(c.systemId);
        for (const n of (engine._adjacency.get(c.systemId) || [])) reachableFromColonies.add(n);
      }
    }

    // Find a far system not reachable from colonies
    let farId = null;
    for (let i = 0; i < engine.galaxy.systems.length; i++) {
      if (!reachableFromColonies.has(i) && !colonySystems.has(i)) { farId = i; break; }
    }
    if (farId === null) return;

    // Remove all p1 ships from their current systems and place one "in transit" at the far system
    const sciShips = engine._scienceShipsByPlayer.get('p1') || [];
    for (const ship of sciShips) {
      ship.systemId = farId;
      ship.path = [farId + 1]; // non-empty path means in transit
    }

    const result = engine.handleCommand('p1', { type: 'claimSystem', systemId: farId });
    assert.ok(result.error, 'Should reject claim from in-transit ship');
    assert.match(result.error, /ship or colony/i);
  });
});

describe('System claims deep — string systemId coercion', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should accept systemId as a string and coerce to number', () => {
    giveInfluence(engine, 'p1', 100);
    const sysId = findClaimable(engine, 'p1');
    assert.ok(sysId !== null);

    const result = engine.handleCommand('p1', { type: 'claimSystem', systemId: String(sysId) });
    assert.ok(result.ok, `Expected ok but got: ${result.error}`);
    assert.strictEqual(engine._systemClaims.get(sysId), 'p1');
  });

  it('should reject NaN systemId', () => {
    const result = engine.handleCommand('p1', { type: 'claimSystem', systemId: 'notanumber' });
    assert.ok(result.error);
    assert.match(result.error, /Missing systemId/i);
  });
});

describe('System claims deep — multiple claims and influence tracking', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should deduct influence for each claim independently', () => {
    giveInfluence(engine, 'p1', 200);
    const colonyIds = engine._playerColonies.get('p1') || [];
    const colony = engine.colonies.get(colonyIds[0]);
    const colonySystems = getColonySystems(engine);

    const neighbors = (engine._adjacency.get(colony.systemId) || []).filter(n => !colonySystems.has(n));
    if (neighbors.length < 2) return;

    const r1 = engine.handleCommand('p1', { type: 'claimSystem', systemId: neighbors[0] });
    assert.ok(r1.ok);
    assert.strictEqual(engine.playerStates.get('p1').resources.influence, 200 - SYSTEM_CLAIM_INFLUENCE_COST);

    const r2 = engine.handleCommand('p1', { type: 'claimSystem', systemId: neighbors[1] });
    assert.ok(r2.ok);
    assert.strictEqual(engine.playerStates.get('p1').resources.influence, 200 - 2 * SYSTEM_CLAIM_INFLUENCE_COST);
  });

  it('should fail mid-chain when influence runs out', () => {
    giveInfluence(engine, 'p1', 40); // enough for 1, not 2
    const colonyIds = engine._playerColonies.get('p1') || [];
    const colony = engine.colonies.get(colonyIds[0]);
    const colonySystems = getColonySystems(engine);

    const neighbors = (engine._adjacency.get(colony.systemId) || []).filter(n => !colonySystems.has(n));
    if (neighbors.length < 2) return;

    const r1 = engine.handleCommand('p1', { type: 'claimSystem', systemId: neighbors[0] });
    assert.ok(r1.ok);

    const r2 = engine.handleCommand('p1', { type: 'claimSystem', systemId: neighbors[1] });
    assert.ok(r2.error, 'Second claim should fail');
    assert.match(r2.error, /influence/i);
    // First claim should still stand
    assert.strictEqual(engine._systemClaims.get(neighbors[0]), 'p1');
    assert.strictEqual(engine._systemClaims.has(neighbors[1]), false);
  });
});

describe('System claims deep — cross-player visibility', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should show p1 claims in p2 getPlayerState', () => {
    giveInfluence(engine, 'p1', 100);
    const sysId = findClaimable(engine, 'p1');
    assert.ok(sysId !== null);

    engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });

    const p2State = engine.getPlayerState('p2');
    assert.ok(p2State.systemClaims, 'p2 state should include systemClaims');
    assert.strictEqual(p2State.systemClaims[sysId], 'p1', 'p2 should see p1 claim');
  });

  it('should show p1 claims in p2 getPlayerStateJSON', () => {
    giveInfluence(engine, 'p1', 100);
    const sysId = findClaimable(engine, 'p1');
    assert.ok(sysId !== null);

    engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });

    const json = engine.getPlayerStateJSON('p2');
    const parsed = JSON.parse(json);
    assert.ok(parsed.systemClaims, 'p2 JSON should include systemClaims');
    assert.strictEqual(parsed.systemClaims[String(sysId)], 'p1');
  });

  it('should show claims in getState (full state)', () => {
    giveInfluence(engine, 'p1', 100);
    const sysId = findClaimable(engine, 'p1');
    assert.ok(sysId !== null);

    engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });

    const state = engine.getState();
    assert.ok(state.systemClaims);
    assert.strictEqual(state.systemClaims[sysId], 'p1');
  });
});

describe('System claims deep — colonyShipFailed event on arrival', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should emit colonyShipFailed event when colony ship arrives at enemy-claimed system', () => {
    giveInfluence(engine, 'p1', 100);
    const sysId = findClaimableHabitable(engine, 'p1');
    if (sysId === null) return;

    engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });

    // Clear pending events
    engine._pendingEvents = [];

    // Simulate p2 colony ship arriving
    const ship = { id: 'test-cs-evt', ownerId: 'p2', systemId: sysId, targetSystemId: sysId, path: [], hopProgress: 0 };
    engine._colonyShips.push(ship);
    let pArr = engine._colonyShipsByPlayer.get('p2');
    if (!pArr) { pArr = []; engine._colonyShipsByPlayer.set('p2', pArr); }
    pArr.push(ship);

    engine._foundColonyFromShip(ship);

    const failEvts = engine._pendingEvents.filter(e => e.eventType === 'colonyShipFailed');
    assert.ok(failEvts.length >= 1, 'Should emit colonyShipFailed event');
    assert.strictEqual(failEvts[0].playerId, 'p2');
    assert.match(failEvts[0].reason, /claimed/i);
  });

  it('should remove colony ship after failed founding at claimed system', () => {
    giveInfluence(engine, 'p1', 100);
    const sysId = findClaimableHabitable(engine, 'p1');
    if (sysId === null) return;

    engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });

    const ship = { id: 'test-cs-rm', ownerId: 'p2', systemId: sysId, targetSystemId: sysId, path: [], hopProgress: 0 };
    engine._colonyShips.push(ship);
    let pArr = engine._colonyShipsByPlayer.get('p2');
    if (!pArr) { pArr = []; engine._colonyShipsByPlayer.set('p2', pArr); }
    pArr.push(ship);

    const shipsBefore = engine._colonyShips.length;
    engine._foundColonyFromShip(ship);

    assert.ok(!engine._colonyShips.find(s => s.id === 'test-cs-rm'), 'Colony ship should be removed after failed founding');
  });
});

describe('System claims deep — NaN influence edge case', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should reject claim when influence is NaN', () => {
    engine.playerStates.get('p1').resources.influence = NaN;
    const sysId = findClaimable(engine, 'p1');
    if (sysId === null) return;

    const result = engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });
    assert.ok(result.error, 'Should reject NaN influence');
    assert.match(result.error, /influence/i);
  });

  it('should reject claim when influence is Infinity', () => {
    engine.playerStates.get('p1').resources.influence = Infinity;
    const sysId = findClaimable(engine, 'p1');
    if (sysId === null) return;

    const result = engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });
    assert.ok(result.error, 'Should reject Infinity influence');
    assert.match(result.error, /influence/i);
  });
});

describe('System claims deep — adjacency-based claim', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should allow claim for a system adjacent to a ship (not directly in system)', () => {
    giveInfluence(engine, 'p1', 100);
    const colonySystems = getColonySystems(engine);

    // Find a system 2 hops from colony, place ship at 1 hop, claim 2nd hop
    const colonyIds = engine._playerColonies.get('p1') || [];
    const colony = engine.colonies.get(colonyIds[0]);
    const hop1Neighbors = (engine._adjacency.get(colony.systemId) || []).filter(n => !colonySystems.has(n));
    if (hop1Neighbors.length === 0) return;

    const hop1 = hop1Neighbors[0];
    const hop2Neighbors = (engine._adjacency.get(hop1) || []).filter(n => !colonySystems.has(n) && n !== colony.systemId);
    if (hop2Neighbors.length === 0) return;

    const hop2 = hop2Neighbors[0];

    // Place a science ship at hop1 (adjacent to hop2)
    const sciShips = engine._scienceShipsByPlayer.get('p1') || [];
    if (sciShips.length === 0) return;
    sciShips[0].systemId = hop1;
    sciShips[0].path = [];

    const result = engine.handleCommand('p1', { type: 'claimSystem', systemId: hop2 });
    assert.ok(result.ok, `Expected ok but got: ${result.error}`);
    assert.strictEqual(engine._systemClaims.get(hop2), 'p1');
  });
});

describe('System claims deep — VP accumulation with multiple claims', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should correctly sum VP for multiple claims', () => {
    giveInfluence(engine, 'p1', 300);
    const colonyIds = engine._playerColonies.get('p1') || [];
    const colony = engine.colonies.get(colonyIds[0]);
    const colonySystems = getColonySystems(engine);

    const neighbors = (engine._adjacency.get(colony.systemId) || []).filter(n => !colonySystems.has(n));
    const claimCount = Math.min(neighbors.length, 3);
    if (claimCount === 0) return;

    for (let i = 0; i < claimCount; i++) {
      engine.handleCommand('p1', { type: 'claimSystem', systemId: neighbors[i] });
    }

    engine._vpCacheTick = -1;
    const vp = engine._calcVPBreakdown('p1');
    assert.strictEqual(vp.claimedSystems, claimCount);
    assert.strictEqual(vp.claimsVP, claimCount * SYSTEM_CLAIM_VP);
  });

  it('should not count claims by other players in VP', () => {
    giveInfluence(engine, 'p1', 100);
    giveInfluence(engine, 'p2', 100);

    // p1 claims a system
    const sysId1 = findClaimable(engine, 'p1');
    assert.ok(sysId1 !== null);
    engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId1 });

    // p2 claims a different system
    const sysId2 = findClaimable(engine, 'p2');
    assert.ok(sysId2 !== null);
    engine.handleCommand('p2', { type: 'claimSystem', systemId: sysId2 });

    engine._vpCacheTick = -1;
    const vp1 = engine._calcVPBreakdown('p1');
    const vp2 = engine._calcVPBreakdown('p2');

    assert.strictEqual(vp1.claimedSystems, 1, 'p1 should have exactly 1 claim');
    assert.strictEqual(vp2.claimedSystems, 1, 'p2 should have exactly 1 claim');
  });
});

describe('System claims deep — cache invalidation', () => {
  let engine;
  beforeEach(() => { engine = createEngine(); });

  it('should mark claiming player as dirty', () => {
    giveInfluence(engine, 'p1', 100);
    const sysId = findClaimable(engine, 'p1');
    assert.ok(sysId !== null);

    engine._dirtyPlayers.clear();
    engine.handleCommand('p1', { type: 'claimSystem', systemId: sysId });

    assert.ok(engine._dirtyPlayers.has('p1'), 'Claiming player should be marked dirty');
  });
});
