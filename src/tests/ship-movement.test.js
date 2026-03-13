const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const ShipMovement = require('../public/js/ship-movement.js');

// Test galaxy: 3 systems in a line
//   sys0 (0,0,0) ——— sys1 (100,0,0) ——— sys2 (200,0,0)
const systems = [
  { id: 0, x: 0, y: 0, z: 0 },
  { id: 1, x: 100, y: 0, z: 0 },
  { id: 2, x: 200, y: 0, z: 0 },
];

const HOP_TICKS = 30; // science ship
const Y_OFFSET = 4;

describe('ShipMovement — reconcile', () => {
  beforeEach(() => ShipMovement.clear());

  it('creates initial state on first reconcile', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 0 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 1000);
    const state = ShipMovement.getState('s1');
    assert.ok(state);
    assert.strictEqual(state.systemId, 0);
    assert.strictEqual(state.nextSystemId, 1);
    assert.strictEqual(state.hopProgress, 0);
    assert.strictEqual(state.hopTicks, HOP_TICKS);
  });

  it('adopts server hopProgress when server is ahead', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 5 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 1000);

    // Server advances to 15
    ship.hopProgress = 15;
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 1500);
    assert.strictEqual(ShipMovement.getState('s1').hopProgress, 15);
  });

  it('keeps client progress when slightly ahead of server (no rubber-band)', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 10 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 1000);

    // Client advances to 12 via frame ticks
    const state = ShipMovement.getState('s1');
    state.hopProgress = 12;

    // Server sends 10 (behind us by 2 — within tolerance)
    ship.hopProgress = 10;
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 1500);
    // Should NOT snap back — keep our 12
    assert.strictEqual(ShipMovement.getState('s1').hopProgress, 12);
  });

  it('snaps to server when client drifts more than 3 ticks ahead', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 10 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 1000);

    // Client somehow gets to 15
    const state = ShipMovement.getState('s1');
    state.hopProgress = 15;

    // Server says 10 — we're 5 ahead, over the 3-tick tolerance
    ship.hopProgress = 10;
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 1500);
    assert.strictEqual(ShipMovement.getState('s1').hopProgress, 10);
  });

  it('handles segment change (hop completed on server)', () => {
    // Ship was on segment 0→1
    const ship = { systemId: 0, path: [1, 2], hopProgress: 25 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 1000);

    // Server says hop complete: now on segment 1→2
    const ship2 = { systemId: 1, path: [2], hopProgress: 3 };
    ShipMovement.reconcile('s1', ship2, HOP_TICKS, Y_OFFSET, 1500);
    const state = ShipMovement.getState('s1');
    assert.strictEqual(state.systemId, 1);
    assert.strictEqual(state.nextSystemId, 2);
    assert.strictEqual(state.hopProgress, 3);
  });

  it('handles ship becoming idle (path empty)', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 20 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 1000);

    // Ship arrived and is now idle
    const ship2 = { systemId: 1, path: [], hopProgress: 0 };
    ShipMovement.reconcile('s1', ship2, HOP_TICKS, Y_OFFSET, 1500);
    const state = ShipMovement.getState('s1');
    assert.strictEqual(state.nextSystemId, null);
    assert.strictEqual(state.systemId, 1);
  });

  it('handles ship redirected to a different target', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 10 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 1000);

    // Redirected: now heading to system 2 directly
    const ship2 = { systemId: 0, path: [2], hopProgress: 0 };
    ShipMovement.reconcile('s1', ship2, HOP_TICKS, Y_OFFSET, 1500);
    const state = ShipMovement.getState('s1');
    assert.strictEqual(state.systemId, 0);
    assert.strictEqual(state.nextSystemId, 2);
    assert.strictEqual(state.hopProgress, 0);
  });
});

describe('ShipMovement — advance', () => {
  beforeEach(() => ShipMovement.clear());

  it('returns null for unknown ship', () => {
    const pos = ShipMovement.advance('nope', 1000, 1, false, systems);
    assert.strictEqual(pos, null);
  });

  it('returns null for idle ship (no nextSystemId)', () => {
    const ship = { systemId: 0, path: [], hopProgress: 0 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 1000);
    const pos = ShipMovement.advance('s1', 1100, 1, false, systems);
    assert.strictEqual(pos, null);
  });

  it('returns correct position at start of hop', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 0 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 1000);
    const pos = ShipMovement.advance('s1', 1000, 1, false, systems);
    assert.ok(pos);
    // At hopProgress=0, should be at system 0
    assert.ok(Math.abs(pos.x - 0) < 0.1, `x should be ~0, got ${pos.x}`);
    assert.ok(Math.abs(pos.z - 0) < 0.1, `z should be ~0, got ${pos.z}`);
    assert.strictEqual(pos.y, Y_OFFSET); // yOffset
  });

  it('returns correct position at midpoint of hop', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 15 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 1000);
    const pos = ShipMovement.advance('s1', 1000, 1, false, systems);
    assert.ok(pos);
    // At hopProgress=15/30 = 50%, should be at x=50
    assert.ok(Math.abs(pos.x - 50) < 0.1, `x should be ~50, got ${pos.x}`);
  });

  it('advances position forward each frame based on game speed', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 0 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 1000);

    // Advance 200ms at gameSpeed=1 → 5 ticks/sec * 0.2s = 1 tick
    // (speed 1 = 200ms interval = 5 ticks/sec)
    const pos = ShipMovement.advance('s1', 1200, 1, false, systems);
    const state = ShipMovement.getState('s1');
    assert.ok(Math.abs(state.hopProgress - 1) < 0.01,
      `hopProgress should be ~1 after 200ms at speed 1, got ${state.hopProgress}`);
    // Position should be 1/30 * 100 = 3.33
    assert.ok(Math.abs(pos.x - 100 / 30) < 0.5, `x should be ~3.3, got ${pos.x}`);
  });

  it('advances faster at higher game speed', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 0 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 1000);

    // Advance 100ms at gameSpeed=3 → 20 ticks/sec * 0.1s = 2 ticks
    // (speed 3 = 50ms interval = 20 ticks/sec)
    ShipMovement.advance('s1', 1100, 3, false, systems);
    const state = ShipMovement.getState('s1');
    assert.ok(Math.abs(state.hopProgress - 2) < 0.01,
      `hopProgress should be ~2 after 100ms at speed 3, got ${state.hopProgress}`);
  });

  it('does not advance when paused', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 5 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 1000);

    ShipMovement.advance('s1', 2000, 2, true, systems); // 1 second, paused
    const state = ShipMovement.getState('s1');
    assert.strictEqual(state.hopProgress, 5);
  });

  it('clamps hopProgress so it never reaches hopTicks', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 28 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 1000);

    // Advance 1 full second at speed 5 → would be 50 ticks, way past 30
    ShipMovement.advance('s1', 2000, 5, false, systems);
    const state = ShipMovement.getState('s1');
    assert.ok(state.hopProgress < HOP_TICKS,
      `hopProgress should be clamped below ${HOP_TICKS}, got ${state.hopProgress}`);
    assert.ok(state.hopProgress >= HOP_TICKS - 0.5,
      `hopProgress should be near cap, got ${state.hopProgress}`);
  });

  it('position stays on the line between systems', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 0 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 0);

    // Advance through multiple frames
    for (let t = 100; t <= 2000; t += 100) {
      const pos = ShipMovement.advance('s1', t, 2, false, systems);
      if (!pos) continue;
      // sys0=(0,0,0) to sys1=(100,0,0): z should always be 0, x in [0,100]
      assert.ok(pos.x >= -0.1, `x should be >= 0, got ${pos.x} at t=${t}`);
      assert.ok(pos.x <= 100.1, `x should be <= 100, got ${pos.x} at t=${t}`);
      assert.ok(Math.abs(pos.z) < 0.1, `z should be ~0, got ${pos.z} at t=${t}`);
    }
  });
});

describe('ShipMovement — no rubber-banding scenario', () => {
  beforeEach(() => ShipMovement.clear());

  it('smooth movement across multiple server updates with no backward snaps', () => {
    // Simulate: server sends updates every 300ms (BROADCAST_EVERY=3, speed 2 = 100ms/tick)
    // Game speed 2: 10 ticks/sec, hop takes 30 ticks = 3.0s real time
    const gameSpeed = 2;
    const ship = { systemId: 0, path: [1], hopProgress: 0 };

    // Initial server update at t=0
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 0);

    let lastX = -Infinity;

    // Simulate 4 seconds of rendering (60fps) with server updates every 300ms
    for (let renderTime = 16; renderTime <= 4000; renderTime += 16) {
      // Server update every 300ms
      if (renderTime > 0 && renderTime % 300 < 16) {
        // Server: 10 ticks/sec at speed 2, so in renderTime ms → renderTime/100 ticks
        const serverHP = Math.min(Math.floor(renderTime / 100), HOP_TICKS);
        if (serverHP < HOP_TICKS) {
          ship.hopProgress = serverHP;
          ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, renderTime);
        }
      }

      const pos = ShipMovement.advance('s1', renderTime, gameSpeed, false, systems);
      if (!pos) continue;

      // KEY ASSERTION: x must never decrease (no rubber-banding)
      assert.ok(pos.x >= lastX - 0.001,
        `Rubber-band detected! x went from ${lastX} to ${pos.x} at t=${renderTime}ms`);
      lastX = pos.x;
    }

    // Verify we actually moved significantly (30 ticks at 10/sec = 3s, should be near end)
    assert.ok(lastX > 80, `Ship should have moved past 80%, only reached x=${lastX}`);
  });

  it('no rubber-band when server update is slightly behind client prediction', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 10 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 0);

    // Client advances 200ms at speed 2 → 10 ticks/sec * 0.2s = 2 ticks → hp ~12
    ShipMovement.advance('s1', 200, 2, false, systems);
    const beforeX = ShipMovement.advance('s1', 200, 2, false, systems).x;

    // Server sends update: hopProgress=11 (behind our 12)
    ship.hopProgress = 11;
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 200);

    // Next frame: position should not jump backward
    const afterX = ShipMovement.advance('s1', 216, 2, false, systems).x;
    assert.ok(afterX >= beforeX - 0.001,
      `Position went backward: before=${beforeX}, after=${afterX}`);
  });
});

describe('ShipMovement — segment transitions', () => {
  beforeEach(() => ShipMovement.clear());

  it('seamless transition when server reports hop completion', () => {
    // Ship on segment 0→1, near end
    const ship = { systemId: 0, path: [1, 2], hopProgress: 28 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 0);

    // Client advances near end of segment
    ShipMovement.advance('s1', 100, 2, false, systems);
    const preHopPos = ShipMovement.advance('s1', 100, 2, false, systems);
    // Should be near system 1 (x≈100)
    assert.ok(preHopPos.x > 90, `Should be near sys1, got x=${preHopPos.x}`);

    // Server confirms hop: now on segment 1→2, hopProgress=2
    const ship2 = { systemId: 1, path: [2], hopProgress: 2 };
    ShipMovement.reconcile('s1', ship2, HOP_TICKS, Y_OFFSET, 200);

    const postHopPos = ShipMovement.advance('s1', 216, 2, false, systems);
    // Should be near system 1 still (x≈100 + small offset into new segment)
    assert.ok(postHopPos.x > 95, `Should still be near sys1 after hop, got x=${postHopPos.x}`);
    assert.ok(postHopPos.x < 120, `Should not have jumped far, got x=${postHopPos.x}`);
  });

  it('full multi-hop journey produces monotonically increasing x', () => {
    // Ship goes 0→1→2 (x: 0→100→200)
    const ship = { systemId: 0, path: [1, 2], hopProgress: 0 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 0);

    let lastX = -1;
    let t = 0;

    // First hop: 30 ticks at speed 2 = 1.5 seconds
    for (t = 16; t <= 1400; t += 16) {
      const pos = ShipMovement.advance('s1', t, 2, false, systems);
      if (!pos) continue;
      assert.ok(pos.x >= lastX - 0.001, `Backward at t=${t}: ${lastX} → ${pos.x}`);
      lastX = pos.x;
    }

    // Server: hop complete, now on segment 1→2
    const ship2 = { systemId: 1, path: [2], hopProgress: 0 };
    ShipMovement.reconcile('s1', ship2, HOP_TICKS, Y_OFFSET, t);

    // Second hop
    for (t += 16; t <= 3000; t += 16) {
      const pos = ShipMovement.advance('s1', t, 2, false, systems);
      if (!pos) continue;
      assert.ok(pos.x >= lastX - 0.001, `Backward at t=${t}: ${lastX} → ${pos.x}`);
      lastX = pos.x;
    }

    assert.ok(lastX > 150, `Should have traveled most of the way, got x=${lastX}`);
  });
});

describe('ShipMovement — tick rate matches server', () => {
  beforeEach(() => ShipMovement.clear());

  it('client advance rate matches server tick rate at speed 1 (5 ticks/sec)', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 0 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 0);
    // Speed 1 = 200ms interval = 5 ticks/sec. After 1 second → 5 ticks.
    ShipMovement.advance('s1', 1000, 1, false, systems);
    const state = ShipMovement.getState('s1');
    assert.ok(Math.abs(state.hopProgress - 5) < 0.1,
      `At speed 1, 1s should yield ~5 ticks, got ${state.hopProgress}`);
  });

  it('client advance rate matches server tick rate at speed 2 (10 ticks/sec)', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 0 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 0);
    // Speed 2 = 100ms interval = 10 ticks/sec. After 1 second → 10 ticks.
    ShipMovement.advance('s1', 1000, 2, false, systems);
    const state = ShipMovement.getState('s1');
    assert.ok(Math.abs(state.hopProgress - 10) < 0.1,
      `At speed 2, 1s should yield ~10 ticks, got ${state.hopProgress}`);
  });

  it('client advance rate matches server tick rate at speed 3 (20 ticks/sec)', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 0 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 0);
    // Speed 3 = 50ms interval = 20 ticks/sec. After 1 second → 20 ticks.
    ShipMovement.advance('s1', 1000, 3, false, systems);
    const state = ShipMovement.getState('s1');
    assert.ok(Math.abs(state.hopProgress - 20) < 0.1,
      `At speed 3, 1s should yield ~20 ticks, got ${state.hopProgress}`);
  });

  it('client advance rate matches server tick rate at speed 5 (50 ticks/sec)', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 0 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 0);
    // Speed 5 = 20ms interval = 50 ticks/sec. After 0.5 second → 25 ticks.
    ShipMovement.advance('s1', 500, 5, false, systems);
    const state = ShipMovement.getState('s1');
    assert.ok(Math.abs(state.hopProgress - 25) < 0.1,
      `At speed 5, 0.5s should yield ~25 ticks, got ${state.hopProgress}`);
  });

  it('client never drifts more than 1 tick from server over full hop at speed 2', () => {
    // Realistic simulation: speed 2, 10 ticks/sec, server broadcasts every 3 ticks (300ms)
    const ship = { systemId: 0, path: [1], hopProgress: 0 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 0);

    // Full hop: 30 ticks at 10/sec = 3000ms
    for (let t = 16; t <= 3000; t += 16) {
      ShipMovement.advance('s1', t, 2, false, systems);

      // Server update every 300ms
      if (t % 300 < 16 && t >= 300) {
        const serverHP = Math.min(Math.floor(t / 100), HOP_TICKS - 1);
        const clientHP = ShipMovement.getState('s1').hopProgress;
        const drift = Math.abs(clientHP - serverHP);
        assert.ok(drift < 1.5,
          `Drift too large at t=${t}: client=${clientHP.toFixed(1)}, server=${serverHP}, drift=${drift.toFixed(1)}`);
        ship.hopProgress = serverHP;
        ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, t);
      }
    }
  });
});

describe('ShipMovement — clear', () => {
  it('clears all state', () => {
    const ship = { systemId: 0, path: [1], hopProgress: 5 };
    ShipMovement.reconcile('s1', ship, HOP_TICKS, Y_OFFSET, 0);
    assert.ok(ShipMovement.getState('s1'));
    ShipMovement.clear();
    assert.strictEqual(ShipMovement.getState('s1'), null);
  });
});
