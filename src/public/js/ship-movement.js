/**
 * Ship movement interpolation — client-side tick simulation with server reconciliation.
 *
 * The client advances each ship's position smoothly every frame at the known game speed.
 * When a server update arrives, the client reconciles: it adopts the server's hopProgress
 * if the server is ahead, keeps its own if slightly ahead (drift tolerance), and snaps to
 * the server on segment changes. This eliminates rubber-banding (no snap backward) while
 * keeping ships visually in sync with the server.
 *
 * Pure functions — no DOM, no Three.js, fully testable.
 */
(function () {

  // Server tick intervals by game speed (must match server/game-engine.js SPEED_INTERVALS)
  const SPEED_INTERVALS = { 1: 200, 2: 100, 3: 50, 4: 33, 5: 20 };

  // Per-ship persistent render state
  // Key: string shipId (e.g. 's1' for science ship 1, 'c0' for colony ship 0)
  // Value: { systemId, nextSystemId, hopProgress, hopTicks, yOffset, lastTime }
  const _shipRender = new Map();

  /**
   * Called on each server state update for a ship in transit.
   * Reconciles client render state with server truth.
   *
   * @param {string} shipId - Unique render key (e.g. 's1')
   * @param {object} serverShip - Server ship data { systemId, path, hopProgress, ... }
   * @param {number} hopTicks - Ticks per hop (30 for science, 50 for colony)
   * @param {number} yOffset - Height offset for rendering
   * @param {number} now - Current timestamp (performance.now())
   */
  function reconcile(shipId, serverShip, hopTicks, yOffset, now) {
    const entry = _shipRender.get(shipId);
    const isTransit = serverShip.path && serverShip.path.length > 0;

    if (!entry) {
      // First time seeing this ship — adopt server state
      _shipRender.set(shipId, {
        systemId: serverShip.systemId,
        nextSystemId: isTransit ? serverShip.path[0] : null,
        hopProgress: serverShip.hopProgress || 0,
        hopTicks: hopTicks,
        yOffset: yOffset,
        lastTime: now,
      });
      return;
    }

    entry.hopTicks = hopTicks;
    entry.yOffset = yOffset;

    if (!isTransit) {
      // Ship is idle/surveying — stop rendering transit
      entry.nextSystemId = null;
      entry.systemId = serverShip.systemId;
      entry.hopProgress = 0;
      entry.lastTime = now;
      return;
    }

    const sameSegment = entry.nextSystemId != null &&
      entry.systemId === serverShip.systemId &&
      entry.nextSystemId === serverShip.path[0];

    if (sameSegment) {
      // Same hop segment — reconcile without snapping backward.
      // Accept the server value if it's ahead of us (we were slow).
      // If we're slightly ahead (predicted forward), keep ours — the server will catch up.
      // If we've drifted more than 3 ticks ahead, snap to server (something's wrong).
      const serverHP = serverShip.hopProgress || 0;
      if (serverHP >= entry.hopProgress) {
        entry.hopProgress = serverHP;
      } else if (entry.hopProgress - serverHP > 3) {
        entry.hopProgress = serverHP;
      }
      // else: keep our slightly-ahead prediction
    } else {
      // Different segment (hop completed, or redirected) — adopt server state.
      // This is visually seamless because the end of the old segment and the
      // start of the new one are at the same system position.
      entry.systemId = serverShip.systemId;
      entry.nextSystemId = serverShip.path[0];
      entry.hopProgress = serverShip.hopProgress || 0;
    }
    entry.lastTime = now;
  }

  /**
   * Called every render frame. Advances the ship's position forward at the
   * expected game tick rate and returns the world position.
   *
   * @param {string} shipId - Unique render key
   * @param {number} now - Current timestamp
   * @param {number} gameSpeed - Game speed multiplier (1-5)
   * @param {boolean} paused - Whether the game is paused
   * @param {Array} systems - Galaxy systems array (indexed by systemId)
   * @returns {{x,y,z}|null} World position, or null if not in transit
   */
  function advance(shipId, now, gameSpeed, paused, systems) {
    const entry = _shipRender.get(shipId);
    if (!entry || entry.nextSystemId == null) return null;

    if (!paused) {
      const dt = (now - entry.lastTime) / 1000; // seconds
      // Server tick rate = 1000 / SPEED_INTERVALS[gameSpeed] ticks per second
      const interval = SPEED_INTERVALS[gameSpeed] || 100;
      const ticksPerSec = 1000 / interval;
      const ticksAdvance = ticksPerSec * dt;
      // Advance but never past hopTicks - 0.5 (leave room for server to confirm hop)
      entry.hopProgress = Math.min(entry.hopProgress + ticksAdvance, entry.hopTicks - 0.5);
    }
    entry.lastTime = now;

    const fromSys = systems[entry.systemId];
    const toSys = systems[entry.nextSystemId];
    if (!fromSys || !toSys) return null;

    const t = entry.hopProgress / entry.hopTicks;
    return {
      x: fromSys.x + (toSys.x - fromSys.x) * t,
      y: (fromSys.y || 0) + ((toSys.y || 0) - (fromSys.y || 0)) * t + entry.yOffset,
      z: fromSys.z + (toSys.z - fromSys.z) * t,
    };
  }

  /**
   * Get the current render state for a ship (for testing/debugging).
   */
  function getState(shipId) {
    return _shipRender.get(shipId) || null;
  }

  /**
   * Clear all render state (e.g. on game restart).
   */
  function clear() {
    _shipRender.clear();
  }

  const ShipMovement = { reconcile, advance, getState, clear };

  if (typeof window !== 'undefined') {
    window.ShipMovement = ShipMovement;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ShipMovement;
  }
})();
