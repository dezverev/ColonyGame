const { describe, it } = require('node:test');
const assert = require('node:assert');
const FogOfWar = require('../public/js/fog-of-war.js');

describe('FogOfWar', () => {
  describe('buildAdjacency', () => {
    it('should build correct adjacency list from hyperlanes', () => {
      const adj = FogOfWar.buildAdjacency([[0, 1], [1, 2], [2, 3]], 4);
      assert.strictEqual(adj.length, 4);
      assert.deepStrictEqual(adj[0], [1]);
      assert.deepStrictEqual(adj[1], [0, 2]);
      assert.deepStrictEqual(adj[2], [1, 3]);
      assert.deepStrictEqual(adj[3], [2]);
    });

    it('should handle empty hyperlanes', () => {
      const adj = FogOfWar.buildAdjacency([], 3);
      assert.strictEqual(adj.length, 3);
      assert.deepStrictEqual(adj[0], []);
      assert.deepStrictEqual(adj[1], []);
      assert.deepStrictEqual(adj[2], []);
    });

    it('should handle branching connections', () => {
      // Star topology: 0 connected to 1,2,3
      const adj = FogOfWar.buildAdjacency([[0, 1], [0, 2], [0, 3]], 4);
      assert.deepStrictEqual(adj[0].sort(), [1, 2, 3]);
      assert.deepStrictEqual(adj[1], [0]);
      assert.deepStrictEqual(adj[2], [0]);
      assert.deepStrictEqual(adj[3], [0]);
    });
  });

  describe('computeVisibility', () => {
    // Linear chain: 0-1-2-3-4-5
    const linearAdj = FogOfWar.buildAdjacency(
      [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]], 6
    );

    it('should return source systems at depth 0', () => {
      const known = FogOfWar.computeVisibility([2], linearAdj, 0);
      assert.strictEqual(known.size, 1);
      assert.ok(known.has(2));
    });

    it('should BFS to depth 1', () => {
      const known = FogOfWar.computeVisibility([2], linearAdj, 1);
      assert.strictEqual(known.size, 3);
      assert.ok(known.has(1));
      assert.ok(known.has(2));
      assert.ok(known.has(3));
    });

    it('should BFS to default depth 2', () => {
      const known = FogOfWar.computeVisibility([2], linearAdj);
      assert.strictEqual(known.size, 5); // 0,1,2,3,4
      assert.ok(known.has(0));
      assert.ok(known.has(1));
      assert.ok(known.has(2));
      assert.ok(known.has(3));
      assert.ok(known.has(4));
      assert.ok(!known.has(5)); // 3 hops away
    });

    it('should handle multiple source systems', () => {
      const known = FogOfWar.computeVisibility([0, 5], linearAdj);
      // From 0: 0,1,2. From 5: 3,4,5. Union = all 6
      assert.strictEqual(known.size, 6);
    });

    it('should handle empty source list', () => {
      const known = FogOfWar.computeVisibility([], linearAdj);
      assert.strictEqual(known.size, 0);
    });

    it('should handle source at graph edge', () => {
      const known = FogOfWar.computeVisibility([0], linearAdj);
      assert.strictEqual(known.size, 3); // 0,1,2
      assert.ok(known.has(0));
      assert.ok(known.has(1));
      assert.ok(known.has(2));
      assert.ok(!known.has(3));
    });

    it('should handle disconnected graph', () => {
      // Two disconnected components: 0-1, 2-3
      const adj = FogOfWar.buildAdjacency([[0, 1], [2, 3]], 4);
      const known = FogOfWar.computeVisibility([0], adj);
      assert.strictEqual(known.size, 2); // 0,1 only
      assert.ok(known.has(0));
      assert.ok(known.has(1));
      assert.ok(!known.has(2));
      assert.ok(!known.has(3));
    });

    it('should handle branching graph at depth 2', () => {
      // Star: center=0, spokes to 1,2,3,4. Each spoke extends: 1-5, 2-6, 3-7, 4-8
      const adj = FogOfWar.buildAdjacency(
        [[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [2, 6], [3, 7], [4, 8]], 9
      );
      const known = FogOfWar.computeVisibility([0], adj);
      // Depth 0: {0}, Depth 1: {1,2,3,4}, Depth 2: {5,6,7,8}
      assert.strictEqual(known.size, 9);
    });

    it('should ignore invalid source IDs', () => {
      const known = FogOfWar.computeVisibility([-1, 999], linearAdj);
      assert.strictEqual(known.size, 0);
    });
  });

  describe('getOwnedSystemIds', () => {
    it('should extract system IDs for a player', () => {
      const colonies = [
        { ownerId: 'p1', systemId: 3 },
        { ownerId: 'p2', systemId: 7 },
        { ownerId: 'p1', systemId: 12 },
      ];
      const ids = FogOfWar.getOwnedSystemIds(colonies, 'p1');
      assert.deepStrictEqual(ids, [3, 12]);
    });

    it('should return empty for no colonies', () => {
      assert.deepStrictEqual(FogOfWar.getOwnedSystemIds([], 'p1'), []);
      assert.deepStrictEqual(FogOfWar.getOwnedSystemIds(null, 'p1'), []);
    });

    it('should return empty for unknown player', () => {
      const colonies = [{ ownerId: 'p1', systemId: 3 }];
      assert.deepStrictEqual(FogOfWar.getOwnedSystemIds(colonies, 'p99'), []);
    });
  });

  describe('FOG_VISIBILITY_DEPTH', () => {
    it('should be 2', () => {
      assert.strictEqual(FogOfWar.FOG_VISIBILITY_DEPTH, 2);
    });
  });

  describe('integration: full visibility computation', () => {
    it('should compute correct visibility for a small galaxy', () => {
      // 10-system galaxy: 0-1-2-3-4-5-6-7-8-9 (linear)
      const hyperlanes = [];
      for (let i = 0; i < 9; i++) hyperlanes.push([i, i + 1]);
      const adj = FogOfWar.buildAdjacency(hyperlanes, 10);

      // Player owns system 0
      const colonies = [{ ownerId: 'player1', systemId: 0 }];
      const ownedIds = FogOfWar.getOwnedSystemIds(colonies, 'player1');
      const known = FogOfWar.computeVisibility(ownedIds, adj);

      assert.strictEqual(known.size, 3); // 0,1,2
      assert.ok(known.has(0));
      assert.ok(known.has(1));
      assert.ok(known.has(2));
      assert.ok(!known.has(3));
    });

    it('should expand visibility when player colonizes new system', () => {
      const hyperlanes = [];
      for (let i = 0; i < 9; i++) hyperlanes.push([i, i + 1]);
      const adj = FogOfWar.buildAdjacency(hyperlanes, 10);

      // Player owns system 0 and 4
      const colonies = [
        { ownerId: 'player1', systemId: 0 },
        { ownerId: 'player1', systemId: 4 },
      ];
      const ownedIds = FogOfWar.getOwnedSystemIds(colonies, 'player1');
      const known = FogOfWar.computeVisibility(ownedIds, adj);

      // From 0: 0,1,2. From 4: 2,3,4,5,6. Union = 0-6
      assert.strictEqual(known.size, 7);
      for (let i = 0; i <= 6; i++) assert.ok(known.has(i));
      assert.ok(!known.has(7));
    });

    it('should not reveal other player colonies beyond fog range', () => {
      const hyperlanes = [];
      for (let i = 0; i < 9; i++) hyperlanes.push([i, i + 1]);
      const adj = FogOfWar.buildAdjacency(hyperlanes, 10);

      // Player1 at 0, Player2 at 8
      const colonies = [
        { ownerId: 'player1', systemId: 0 },
        { ownerId: 'player2', systemId: 8 },
      ];
      const p1Known = FogOfWar.computeVisibility(
        FogOfWar.getOwnedSystemIds(colonies, 'player1'), adj
      );
      // Player1 sees 0,1,2 only — system 8 is far away
      assert.ok(!p1Known.has(8));
      assert.strictEqual(p1Known.size, 3);
    });
  });
});
