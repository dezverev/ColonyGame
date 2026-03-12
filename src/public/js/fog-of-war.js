/**
 * Fog of war visibility computation.
 * Shared module for browser (IIFE) and Node.js (module.exports).
 * Computes which star systems are "known" to a player based on BFS
 * from owned systems out to a configurable hop depth along hyperlanes.
 */
(function () {
  const FOG_VISIBILITY_DEPTH = 2; // hops from owned systems

  /**
   * Build adjacency list from hyperlanes array.
   * @param {Array<[number,number]>} hyperlanes - pairs of system IDs
   * @param {number} systemCount - total number of systems
   * @returns {Array<number[]>} adjacency[systemId] = [neighborId, ...]
   */
  function buildAdjacency(hyperlanes, systemCount) {
    const adj = new Array(systemCount);
    for (let i = 0; i < systemCount; i++) adj[i] = [];
    for (const [a, b] of hyperlanes) {
      adj[a].push(b);
      adj[b].push(a);
    }
    return adj;
  }

  /**
   * BFS from a set of source system IDs out to maxDepth hops.
   * @param {number[]} sourceIds - owned system IDs
   * @param {Array<number[]>} adjacency - adjacency list
   * @param {number} maxDepth - maximum BFS depth (default FOG_VISIBILITY_DEPTH)
   * @returns {Set<number>} set of known system IDs
   */
  function computeVisibility(sourceIds, adjacency, maxDepth) {
    if (maxDepth === undefined) maxDepth = FOG_VISIBILITY_DEPTH;
    const known = new Set();
    const queue = [];

    for (const id of sourceIds) {
      if (id >= 0 && id < adjacency.length) {
        known.add(id);
        queue.push({ id, depth: 0 });
      }
    }

    let head = 0;
    while (head < queue.length) {
      const { id, depth } = queue[head++];
      if (depth >= maxDepth) continue;
      for (const neighbor of adjacency[id]) {
        if (!known.has(neighbor)) {
          known.add(neighbor);
          queue.push({ id: neighbor, depth: depth + 1 });
        }
      }
    }

    return known;
  }

  /**
   * Get owned system IDs for a player from colonies array.
   * @param {Array} colonies - colony objects with ownerId and systemId
   * @param {string} playerId - the player's ID
   * @returns {number[]} array of owned system IDs
   */
  function getOwnedSystemIds(colonies, playerId) {
    const ids = [];
    if (!colonies) return ids;
    for (const col of colonies) {
      if (col.ownerId === playerId && col.systemId != null) {
        ids.push(col.systemId);
      }
    }
    return ids;
  }

  const FogOfWar = {
    FOG_VISIBILITY_DEPTH,
    buildAdjacency,
    computeVisibility,
    getOwnedSystemIds,
  };

  if (typeof window !== 'undefined') {
    window.FogOfWar = FogOfWar;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FogOfWar;
  }
})();
