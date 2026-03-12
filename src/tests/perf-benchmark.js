// Performance benchmark — measures tick duration, payload sizes, serialization time
// Run: node src/tests/perf-benchmark.js

const { GameEngine, MONTH_TICKS, BROADCAST_EVERY } = require('../../server/game-engine');

function makeRoom(playerCount = 2, options = {}) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { id: i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 1, maxPlayers: 8, status: 'playing', players, ...options };
}

function benchmark(label, fn, iterations = 1000) {
  // Warmup
  for (let i = 0; i < 10; i++) fn();
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
  const avg = elapsed / iterations;
  return { label, avg, total: elapsed, iterations };
}

console.log('=== ColonyGame Performance Benchmark ===\n');

// --- Test 1: Tick duration at various player counts ---
console.log('## Tick Duration (ms)');
console.log('Players | Avg Tick | Max Tick | Budget %');
console.log('--------|----------|----------|--------');

for (const playerCount of [2, 4, 8]) {
  const engine = new GameEngine(makeRoom(playerCount), { tickRate: 10, profile: true });

  // Run 200 ticks (includes 2 monthly cycles)
  for (let i = 0; i < 200; i++) engine.tick();

  const stats = engine.getTickStats();
  console.log(`${playerCount.toString().padEnd(7)} | ${stats.avg.toFixed(4).padStart(8)} | ${stats.max.toFixed(4).padStart(8)} | ${stats.budgetPct.toFixed(2).padStart(6)}%`);
  engine.stop();
}

// --- Test 2: State payload sizes ---
console.log('\n## State Payload Sizes (bytes)');
console.log('Players | Full State | Per-Player | gameInit');
console.log('--------|------------|------------|--------');

for (const playerCount of [2, 4, 8]) {
  const engine = new GameEngine(makeRoom(playerCount), { tickRate: 10 });
  // Tick a few times to populate state
  for (let i = 0; i < 10; i++) engine.tick();

  const fullJSON = engine.getStateJSON();
  const perPlayerJSON = engine.getPlayerStateJSON(1);
  const initState = engine.getInitState();
  initState.type = 'gameInit';
  initState.yourId = 1;
  const initJSON = JSON.stringify(initState);

  console.log(`${playerCount.toString().padEnd(7)} | ${fullJSON.length.toString().padStart(10)} | ${perPlayerJSON.length.toString().padStart(10)} | ${initJSON.length.toString().padStart(7)}`);
  engine.stop();
}

// --- Test 3: Serialization time ---
console.log('\n## Serialization Time (ms)');

for (const playerCount of [2, 8]) {
  const engine = new GameEngine(makeRoom(playerCount), { tickRate: 10 });
  for (let i = 0; i < 10; i++) engine.tick();

  // Full state serialization
  const fullResult = benchmark(`Full state (${playerCount}p)`, () => {
    engine._cachedState = null;
    engine._cachedStateJSON = null;
    engine.getStateJSON();
  }, 5000);

  // Per-player serialization
  const perPlayerResult = benchmark(`Per-player (${playerCount}p)`, () => {
    engine.getPlayerStateJSON(1);
  }, 5000);

  console.log(`${fullResult.label}: ${fullResult.avg.toFixed(4)}ms`);
  console.log(`${perPlayerResult.label}: ${perPlayerResult.avg.toFixed(4)}ms`);
}

// --- Test 4: Broadcast frequency analysis ---
console.log('\n## Broadcast Analysis (100 ticks)');

for (const playerCount of [2, 4]) {
  let broadcastCount = 0;
  let totalBytes = 0;

  const engine = new GameEngine(makeRoom(playerCount), {
    tickRate: 10,
    onTick: (playerId, stateJSON) => {
      broadcastCount++;
      totalBytes += stateJSON.length;
    },
  });

  for (let i = 0; i < 100; i++) engine.tick();

  console.log(`${playerCount} players: ${broadcastCount} broadcasts, ${totalBytes} bytes total, ${(totalBytes / broadcastCount).toFixed(0)} bytes/msg avg`);
  engine.stop();
}

// --- Test 5: Galaxy generation time ---
console.log('\n## Galaxy Generation (ms)');
const { generateGalaxy } = require('../../server/galaxy');

for (const size of ['small', 'medium', 'large']) {
  const result = benchmark(`Galaxy ${size}`, () => {
    generateGalaxy({ size, seed: 12345 });
  }, 20);
  console.log(`${size}: ${result.avg.toFixed(2)}ms`);
}

console.log('\n=== Done ===');
