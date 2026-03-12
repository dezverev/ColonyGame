// Galaxy generation module — procedural star systems with hyperlane connections
// Used by game-engine.js on game start to create the galaxy map

const STAR_TYPES = {
  yellow: { color: '#f9d71c', label: 'Yellow Star', weight: 30 },
  red:    { color: '#e74c3c', label: 'Red Dwarf',   weight: 30 },
  blue:   { color: '#3498db', label: 'Blue Giant',   weight: 15 },
  white:  { color: '#ecf0f1', label: 'White Star',   weight: 20 },
  orange: { color: '#e67e22', label: 'Orange Star',  weight: 5 },
};

// Habitable types: 80%+ hab. Marginal: 60%. Uninhabitable: 0%.
const PLANET_TYPES = {
  continental: { habitability: 80, label: 'Continental', weight: 15 },
  ocean:       { habitability: 80, label: 'Ocean',       weight: 10 },
  tropical:    { habitability: 80, label: 'Tropical',    weight: 10 },
  arctic:      { habitability: 60, label: 'Arctic',      weight: 10 },
  desert:      { habitability: 60, label: 'Desert',      weight: 10 },
  arid:        { habitability: 60, label: 'Arid',        weight: 10 },
  barren:      { habitability: 0,  label: 'Barren',      weight: 15 },
  molten:      { habitability: 0,  label: 'Molten',      weight: 10 },
  gasGiant:    { habitability: 0,  label: 'Gas Giant',   weight: 10 },
};

const GALAXY_SIZES = {
  small:  { systems: 50,  radius: 200 },
  medium: { systems: 100, radius: 300 },
  large:  { systems: 200, radius: 450 },
};

// Star name syllables for procedural generation
const NAME_PREFIXES = [
  'Sol', 'Veg', 'Sir', 'Bet', 'Alp', 'Tau', 'Kep', 'Pro', 'Arc',
  'Ald', 'Pol', 'Rig', 'Den', 'Alt', 'Ant', 'Cap', 'For', 'Lyn',
  'Nor', 'Pav', 'Ser', 'Vel', 'Zet', 'Omi', 'Sig', 'Del', 'Gam',
  'Eta', 'The', 'Iot', 'Kap', 'Lam', 'Rho', 'Phi', 'Chi', 'Psi',
];

const NAME_SUFFIXES = [
  'aris', 'ion', 'ius', 'ara', 'eon', 'ica', 'una', 'oris',
  'enna', 'alis', 'axis', 'exa', 'ura', 'entis', 'olus',
  'andri', 'ella', 'anis', 'eron', 'ova', 'ux', 'ix', 'ax',
  'or', 'en', 'an', 'us', 'is', 'os', 'um', 'es',
];

const NAME_DESIGNATIONS = [
  'Prime', 'Major', 'Minor', 'Alpha', 'Beta', 'Gamma',
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII',
];

// Seeded PRNG (mulberry32) for deterministic galaxy generation
function mulberry32(seed) {
  let s = seed | 0;
  return function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Weighted random selection from an object with { weight } values
function weightedPick(rng, items) {
  const entries = Object.entries(items);
  let totalWeight = 0;
  for (const [, val] of entries) totalWeight += val.weight;
  let roll = rng() * totalWeight;
  for (const [key, val] of entries) {
    roll -= val.weight;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

// Generate a unique star name
function generateName(rng, usedNames) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const prefix = NAME_PREFIXES[Math.floor(rng() * NAME_PREFIXES.length)];
    const suffix = NAME_SUFFIXES[Math.floor(rng() * NAME_SUFFIXES.length)];
    let name = prefix + suffix;
    // ~30% chance of designation
    if (rng() < 0.3) {
      name += ' ' + NAME_DESIGNATIONS[Math.floor(rng() * NAME_DESIGNATIONS.length)];
    }
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  // Fallback: numbered
  const n = usedNames.size;
  const name = `System-${n}`;
  usedNames.add(name);
  return name;
}

// Poisson disc sampling in 2D for even system distribution
// Returns array of {x, z} positions within radius
function poissonDisc(rng, count, radius, minDist) {
  const points = [];
  const cellSize = minDist / Math.SQRT2;
  const gridW = Math.ceil((radius * 2) / cellSize);
  const grid = new Array(gridW * gridW).fill(-1);

  function gridIdx(x, z) {
    const gx = Math.floor((x + radius) / cellSize);
    const gz = Math.floor((z + radius) / cellSize);
    if (gx < 0 || gx >= gridW || gz < 0 || gz >= gridW) return -1;
    return gz * gridW + gx;
  }

  // Start from center-ish
  const startX = (rng() - 0.5) * radius * 0.3;
  const startZ = (rng() - 0.5) * radius * 0.3;
  points.push({ x: startX, z: startZ });
  grid[gridIdx(startX, startZ)] = 0;
  const active = [0];

  const maxAttempts = 30;

  while (active.length > 0 && points.length < count) {
    const activeIdx = Math.floor(rng() * active.length);
    const pt = points[active[activeIdx]];
    let found = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = rng() * Math.PI * 2;
      const dist = minDist + rng() * minDist; // between minDist and 2*minDist
      const nx = pt.x + Math.cos(angle) * dist;
      const nz = pt.z + Math.sin(angle) * dist;

      // Check bounds (within circle)
      if (nx * nx + nz * nz > radius * radius) continue;

      // Check grid neighbors for conflicts
      const gi = gridIdx(nx, nz);
      if (gi < 0) continue;

      let tooClose = false;
      const gx = Math.floor((nx + radius) / cellSize);
      const gz = Math.floor((nz + radius) / cellSize);
      for (let dz = -2; dz <= 2 && !tooClose; dz++) {
        for (let dx = -2; dx <= 2 && !tooClose; dx++) {
          const ngx = gx + dx, ngz = gz + dz;
          if (ngx < 0 || ngx >= gridW || ngz < 0 || ngz >= gridW) continue;
          const ni = ngz * gridW + ngx;
          if (grid[ni] < 0) continue;
          const other = points[grid[ni]];
          const ddx = nx - other.x, ddz = nz - other.z;
          if (ddx * ddx + ddz * ddz < minDist * minDist) tooClose = true;
        }
      }

      if (!tooClose) {
        const idx = points.length;
        points.push({ x: nx, z: nz });
        grid[gi] = idx;
        active.push(idx);
        found = true;
        break;
      }
    }

    if (!found) {
      active.splice(activeIdx, 1);
    }
  }

  return points;
}

// Distance squared between two points
function distSq(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz;
}

// Generate hyperlane connections using relative neighborhood graph + k-nearest supplement
// Produces a connected graph with avg 3-4 edges per node
function generateHyperlanes(systems, rng) {
  const n = systems.length;
  if (n <= 1) return [];

  const edges = new Set(); // "i-j" where i < j
  const adjacency = new Array(n).fill(null).map(() => []);

  function addEdge(i, j) {
    const a = Math.min(i, j), b = Math.max(i, j);
    const key = `${a}-${b}`;
    if (edges.has(key)) return false;
    edges.add(key);
    adjacency[a].push(b);
    adjacency[b].push(a);
    return true;
  }

  // Phase 1: Relative Neighborhood Graph — connect i-j if no third point k
  // is closer to both i and j than they are to each other
  // This naturally creates sparse, planar-ish connections
  const distCache = new Array(n);
  for (let i = 0; i < n; i++) {
    distCache[i] = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      distCache[i][j] = distSq(systems[i], systems[j]);
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dij = distCache[i][j];
      let isRNG = true;
      for (let k = 0; k < n; k++) {
        if (k === i || k === j) continue;
        if (distCache[i][k] < dij && distCache[j][k] < dij) {
          isRNG = false;
          break;
        }
      }
      if (isRNG) addEdge(i, j);
    }
  }

  // Phase 2: Ensure connectivity using BFS — connect isolated components
  function bfsComponent(start) {
    const visited = new Set();
    const queue = [start];
    visited.add(start);
    while (queue.length > 0) {
      const node = queue.shift();
      for (const neighbor of adjacency[node]) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    return visited;
  }

  const mainComponent = bfsComponent(0);
  if (mainComponent.size < n) {
    // Find all components, connect each isolated one to nearest node in main component
    const unvisited = new Set();
    for (let i = 0; i < n; i++) {
      if (!mainComponent.has(i)) unvisited.add(i);
    }

    while (unvisited.size > 0) {
      const start = unvisited.values().next().value;
      const component = bfsComponent(start);

      // Find nearest pair between this component and main
      let bestDist = Infinity, bestI = -1, bestJ = -1;
      for (const ci of component) {
        for (const mi of mainComponent) {
          const d = distCache[ci][mi];
          if (d < bestDist) {
            bestDist = d;
            bestI = ci;
            bestJ = mi;
          }
        }
      }

      if (bestI >= 0) addEdge(bestI, bestJ);

      // Merge into main component
      for (const ci of component) {
        mainComponent.add(ci);
        unvisited.delete(ci);
      }
    }
  }

  // Phase 3: Supplement low-degree nodes — ensure each has at least 2 connections
  for (let i = 0; i < n; i++) {
    if (adjacency[i].length >= 2) continue;
    // Find nearest unconnected systems
    const neighbors = new Set(adjacency[i]);
    const candidates = [];
    for (let j = 0; j < n; j++) {
      if (j === i || neighbors.has(j)) continue;
      candidates.push({ idx: j, dist: distCache[i][j] });
    }
    candidates.sort((a, b) => a.dist - b.dist);
    for (const c of candidates) {
      if (adjacency[i].length >= 2) break;
      addEdge(i, c.idx);
    }
  }

  // Phase 4: Prune high-degree nodes — cap at 6 connections (remove longest edges)
  for (let i = 0; i < n; i++) {
    while (adjacency[i].length > 6) {
      // Find longest edge
      let worstDist = 0, worstJ = -1;
      for (const j of adjacency[i]) {
        // Don't prune if it would leave j with only 1 connection
        if (adjacency[j].length <= 2) continue;
        const d = distCache[i][j];
        if (d > worstDist) {
          worstDist = d;
          worstJ = j;
        }
      }
      if (worstJ < 0) break; // can't safely prune more
      const a = Math.min(i, worstJ), b = Math.max(i, worstJ);
      edges.delete(`${a}-${b}`);
      adjacency[i] = adjacency[i].filter(x => x !== worstJ);
      adjacency[worstJ] = adjacency[worstJ].filter(x => x !== i);
    }
  }

  // Convert edges to array of [i, j] pairs
  const result = [];
  for (const key of edges) {
    const [a, b] = key.split('-').map(Number);
    result.push([a, b]);
  }
  return result;
}

// Generate planets for a star system
function generatePlanets(rng, starType) {
  const planetCount = 1 + Math.floor(rng() * 6); // 1-6 planets
  const planets = [];

  for (let orbit = 0; orbit < planetCount; orbit++) {
    const type = weightedPick(rng, PLANET_TYPES);
    const typeInfo = PLANET_TYPES[type];

    // Size depends on type: gas giants are large, others vary
    let size;
    if (type === 'gasGiant') {
      size = 0; // not colonizable, no districts
    } else if (typeInfo.habitability > 0) {
      size = 8 + Math.floor(rng() * 13); // 8-20 for habitable
    } else {
      size = 6 + Math.floor(rng() * 10); // 6-15 for barren/molten
    }

    planets.push({
      orbit: orbit + 1,
      type,
      size,
      habitability: typeInfo.habitability,
      surveyed: false,
    });
  }

  return planets;
}

// Main galaxy generation function
// Returns { systems: [...], hyperlanes: [[i,j], ...] }
function generateGalaxy(options = {}) {
  const size = options.size || 'small';
  const seed = options.seed != null ? options.seed : Math.floor(Math.random() * 2147483647);
  const rng = mulberry32(seed);

  const config = GALAXY_SIZES[size] || GALAXY_SIZES.small;
  const targetCount = config.systems;
  const radius = config.radius;
  const minDist = radius * 2 / Math.sqrt(targetCount) * 0.8; // adaptive spacing

  // Generate positions via Poisson disc sampling
  const positions = poissonDisc(rng, targetCount, radius, minDist);

  // Create star systems
  const usedNames = new Set();
  const systems = positions.map((pos, index) => {
    const starType = weightedPick(rng, STAR_TYPES);
    const name = generateName(rng, usedNames);
    const planets = generatePlanets(rng, starType);

    return {
      id: index,
      name,
      x: Math.round(pos.x * 100) / 100,
      y: 0, // flat galaxy plane
      z: Math.round(pos.z * 100) / 100,
      starType,
      starColor: STAR_TYPES[starType].color,
      planets,
      owner: null,    // playerId or null
      surveyed: {},   // playerId -> true
    };
  });

  // Generate hyperlane connections
  const hyperlanes = generateHyperlanes(systems, rng);

  return {
    seed,
    size,
    systems,
    hyperlanes,
  };
}

// Assign starting systems to players — one system per player, spread apart
function assignStartingSystems(galaxy, playerIds) {
  const systems = galaxy.systems;
  const n = systems.length;
  if (n === 0 || playerIds.length === 0) return {};

  // Find habitable systems (have at least one habitable planet)
  const habitable = systems.filter(s =>
    s.planets.some(p => p.habitability >= 60)
  );

  // If not enough habitable systems, use any systems
  const pool = habitable.length >= playerIds.length ? habitable : systems;

  // Greedy spread: pick systems maximizing minimum distance to already-picked
  const assignments = {}; // playerId -> systemId
  const picked = [];

  for (const playerId of playerIds) {
    let bestSystem = null;
    let bestMinDist = -1;

    for (const sys of pool) {
      if (picked.some(p => p.id === sys.id)) continue;

      if (picked.length === 0) {
        // First player: pick closest to edge for spread
        const edgeDist = Math.sqrt(sys.x * sys.x + sys.z * sys.z);
        if (edgeDist > bestMinDist) {
          bestMinDist = edgeDist;
          bestSystem = sys;
        }
      } else {
        // Subsequent players: maximize minimum distance to all picked
        let minDist = Infinity;
        for (const p of picked) {
          const d = distSq(sys, p);
          if (d < minDist) minDist = d;
        }
        if (minDist > bestMinDist) {
          bestMinDist = minDist;
          bestSystem = sys;
        }
      }
    }

    if (bestSystem) {
      assignments[playerId] = bestSystem.id;
      bestSystem.owner = playerId;
      // Mark all planets as surveyed for starting system
      bestSystem.surveyed[playerId] = true;
      for (const planet of bestSystem.planets) {
        planet.surveyed = true; // starting system is fully surveyed
      }
      picked.push(bestSystem);
    }
  }

  return assignments;
}

// Find the best habitable planet in a system for colonization
function bestHabitablePlanet(system) {
  let best = null;
  for (const planet of system.planets) {
    if (planet.habitability < 20) continue;
    if (!best || planet.habitability > best.habitability ||
        (planet.habitability === best.habitability && planet.size > best.size)) {
      best = planet;
    }
  }
  return best;
}

module.exports = {
  generateGalaxy,
  assignStartingSystems,
  bestHabitablePlanet,
  STAR_TYPES,
  PLANET_TYPES: PLANET_TYPES,
  GALAXY_SIZES,
  // Exported for testing
  mulberry32,
  poissonDisc,
  generateHyperlanes,
  generateName,
  weightedPick,
};
