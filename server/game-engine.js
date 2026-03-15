const { generateGalaxy, assignStartingSystems, bestHabitablePlanet } = require('./galaxy');

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1'];

// District definitions: type -> { produces, consumes, cost, buildTime }
// Production/consumption is per "month" (every 100 ticks = 10 seconds)
const DISTRICT_DEFS = {
  housing:     { produces: {}, consumes: { energy: 1 }, housing: 5, jobs: 0, cost: { minerals: 100 }, buildTime: 200 },
  generator:   { produces: { energy: 6 }, consumes: {}, housing: 0, jobs: 1, cost: { minerals: 100 }, buildTime: 300 },
  mining:      { produces: { minerals: 6 }, consumes: {}, housing: 0, jobs: 1, cost: { minerals: 100 }, buildTime: 300 },
  agriculture: { produces: { food: 6 }, consumes: {}, housing: 0, jobs: 1, cost: { minerals: 100 }, buildTime: 300 },
  industrial:  { produces: { alloys: 4 }, consumes: { energy: 3 }, housing: 0, jobs: 1, cost: { minerals: 200 }, buildTime: 400 },
  research:    { produces: { physics: 4, society: 4, engineering: 4 }, consumes: { energy: 4 }, housing: 0, jobs: 1, cost: { minerals: 200, energy: 20 }, buildTime: 400 },
};

// Planet types and their habitability ranges
const PLANET_TYPES = {
  continental: { habitability: 80, label: 'Continental' },
  ocean:       { habitability: 80, label: 'Ocean' },
  tropical:    { habitability: 80, label: 'Tropical' },
  arctic:      { habitability: 60, label: 'Arctic' },
  desert:      { habitability: 60, label: 'Desert' },
  arid:        { habitability: 60, label: 'Arid' },
  barren:      { habitability: 0,  label: 'Barren' },
  molten:      { habitability: 0,  label: 'Molten' },
  gasGiant:    { habitability: 0,  label: 'Gas Giant' },
};

// Planet type signature bonuses: additive per working district of matching type
const PLANET_BONUSES = {
  continental: { agriculture: { food: 1 } },
  ocean:       { agriculture: { food: 1 }, research: { physics: 1, society: 1, engineering: 1 } },
  tropical:    { agriculture: { food: 2 } },
  arctic:      { mining: { minerals: 1 }, research: { physics: 1, society: 1, engineering: 1 } },
  desert:      { mining: { minerals: 2 } },
  arid:        { generator: { energy: 1 }, industrial: { alloys: 1 } },
};

// Colony personality traits: 4+ districts of same type earns a trait
// Only one trait per colony (highest count wins, ties broken by order below)
const COLONY_TRAITS = {
  research:    { name: 'Academy World',  threshold: 4, bonus: { physics: 0.10, society: 0.10, engineering: 0.10 } },
  industrial:  { name: 'Forge World',    threshold: 4, bonus: { alloys: 0.10 } },
  mining:      { name: 'Mining Colony',  threshold: 4, bonus: { minerals: 0.10 } },
  agriculture: { name: 'Breadbasket',    threshold: 4, bonus: { food: 0.10 } },
  generator:   { name: 'Power Hub',      threshold: 4, bonus: { energy: 0.10 } },
};

// Colony ship constants
const COLONY_SHIP_COST = { minerals: 200, food: 100, alloys: 100 };
const COLONY_SHIP_BUILD_TIME = 600; // 60 seconds at 10Hz
const COLONY_SHIP_HOP_TICKS = 50;   // 5 seconds per hyperlane hop
const MAX_COLONIES = 5;
const COLONY_SHIP_STARTING_POPS = 2;

// Science ship constants
const SCIENCE_SHIP_COST = { minerals: 100, alloys: 50 };
const SCIENCE_SHIP_BUILD_TIME = 300; // 30 seconds at 10Hz
const SCIENCE_SHIP_HOP_TICKS = 30;  // 3 seconds per hyperlane hop (faster than colony ships)
const MAX_SCIENCE_SHIPS = 3;
const SURVEY_TICKS = 100; // 10 seconds to survey a system
const ANOMALY_CHANCE = 0.20; // 20% chance per planet
const ANOMALY_TYPES = [
  { type: 'ancientRuins', label: 'Ancient Ruins', reward: { research: { physics: 50, society: 50, engineering: 50 } } },
  { type: 'mineralDeposit', label: 'Mineral Deposit', reward: { minerals: 100 } },
  { type: 'habitableMoon', label: 'Habitable Moon', reward: { planetSizeBonus: 2 } },
  { type: 'precursorArtifact', label: 'Precursor Artifact', reward: { influence: 25 } },
  { type: 'derelictShip', label: 'Derelict Ship', reward: { alloys: 50 } },
];

// Colony crisis event constants
const CRISIS_MIN_TICKS = 500;  // Minimum ticks between crises per colony
const CRISIS_MAX_TICKS = 800;  // Maximum ticks between crises per colony
const CRISIS_CHOICE_TICKS = 200; // 20 seconds to decide
const CRISIS_IMMUNITY_TICKS = 300; // 30 seconds immunity after resolution

const CRISIS_TYPES = {
  seismic: {
    type: 'seismic',
    label: 'Seismic Activity',
    description: 'Tremors threaten your colony infrastructure.',
    choices: [
      { id: 'evacuate', label: 'Evacuate', description: 'Lose 1 district, save all pops' },
      { id: 'reinforce', label: 'Reinforce', description: 'Spend 100 minerals — 70% success, 30% lose district + 1 pop', cost: { minerals: 100 } },
    ],
  },
  plague: {
    type: 'plague',
    label: 'Plague Outbreak',
    description: 'A deadly plague is spreading through the colony.',
    choices: [
      { id: 'quarantine', label: 'Quarantine', description: 'Growth halted for 300 ticks, no pop loss' },
      { id: 'rushCure', label: 'Rush Cure', description: 'Spend 50 energy + 50 food — 80% cured, 20% spreads', cost: { energy: 50, food: 50 } },
    ],
  },
  powerSurge: {
    type: 'powerSurge',
    label: 'Power Surge',
    description: 'Unstable energy grid threatens colony systems.',
    choices: [
      { id: 'shutDown', label: 'Shut Down', description: 'All districts disabled for 100 ticks' },
      { id: 'rideItOut', label: 'Ride It Out', description: '+50% energy for 200 ticks, but 25% chance to lose a generator' },
    ],
  },
  laborUnrest: {
    type: 'laborUnrest',
    label: 'Labor Unrest',
    description: 'Workers are striking across 3 districts.',
    choices: [
      { id: 'negotiate', label: 'Negotiate', description: 'Spend 25 influence to resume immediately', cost: { influence: 25 } },
      { id: 'wait', label: 'Wait It Out', description: 'Strike ends in 300 ticks' },
    ],
  },
};

const CRISIS_TYPE_KEYS = Object.keys(CRISIS_TYPES);

// Edict definitions: empire-wide temporary bonuses that spend influence
const EDICT_DEFS = {
  mineralRush: {
    name: 'Mineral Rush',
    description: '+50% mining output for 5 months',
    cost: 50,
    duration: 5, // months
    effect: { type: 'productionBonus', resource: 'minerals', multiplier: 1.5 },
  },
  populationDrive: {
    name: 'Population Drive',
    description: '+100% pop growth speed for 5 months',
    cost: 75,
    duration: 5,
    effect: { type: 'growthBonus', multiplier: 0.5 }, // halves growth ticks = double speed
  },
  researchGrant: {
    name: 'Research Grant',
    description: '+50% research output for 5 months',
    cost: 50,
    duration: 5,
    effect: { type: 'productionBonus', resource: 'research', multiplier: 1.5 },
  },
  emergencyReserves: {
    name: 'Emergency Reserves',
    description: 'Instantly grants +100 energy, +100 minerals, +100 food',
    cost: 25,
    duration: 0, // instant — no ongoing effect
    effect: { type: 'instant', grants: { energy: 100, minerals: 100, food: 100 } },
  },
};

const INFLUENCE_BASE_INCOME = 2;  // +2 influence/colony/month (capital building)
const INFLUENCE_TRAIT_INCOME = 1; // +1 influence/month per colony with a personality trait
const INFLUENCE_CAP = 200;        // Max influence stockpile

// Scarcity season constants
const SCARCITY_RESOURCES = ['energy', 'minerals', 'food']; // commodity resources only
const SCARCITY_MIN_INTERVAL = 800;   // minimum ticks between scarcity seasons
const SCARCITY_MAX_INTERVAL = 1200;  // maximum ticks between scarcity seasons
const SCARCITY_DURATION = 300;       // 30 seconds at 10Hz
const SCARCITY_WARNING_TICKS = 100;  // 10 seconds advance warning
const SCARCITY_MULTIPLIER = 0.70;    // -30% production during scarcity

const MONTH_TICKS = 100; // 1 "month" = 100 ticks = 10 seconds at 10Hz
const BROADCAST_EVERY = 3; // broadcast state every N ticks (~3.3Hz at 10Hz tick rate)

// Game speed: tick interval in ms per speed level (1-5)
// Speed 1 = 0.5x, Speed 2 = 1x (default), Speed 3 = 2x, Speed 4 = 3x, Speed 5 = 5x
const SPEED_INTERVALS = {
  1: 200,  // 5 Hz — half speed
  2: 100,  // 10 Hz — normal
  3: 50,   // 20 Hz — double
  4: 33,   // ~30 Hz — triple
  5: 20,   // 50 Hz — 5x
};
const SPEED_LABELS = { 1: '0.5x', 2: '1x', 3: '2x', 4: '3x', 5: '5x' };
const DEFAULT_SPEED = 2;

// Mini tech tree: 3 tiers × 3 tracks — research costs tuned for 20-minute matches
const TECH_TREE = {
  improved_power_plants: {
    track: 'physics', tier: 1,
    name: 'Improved Power Plants',
    description: '+25% Generator output',
    cost: 150,
    effect: { type: 'districtBonus', district: 'generator', multiplier: 1.25 },
    requires: null,
  },
  frontier_medicine: {
    track: 'society', tier: 1,
    name: 'Frontier Medicine',
    description: '+25% pop growth speed',
    cost: 150,
    effect: { type: 'growthBonus', multiplier: 0.75 },
    requires: null,
  },
  improved_mining: {
    track: 'engineering', tier: 1,
    name: 'Improved Mining',
    description: '+25% Mining output',
    cost: 150,
    effect: { type: 'districtBonus', district: 'mining', multiplier: 1.25 },
    requires: null,
  },
  advanced_reactors: {
    track: 'physics', tier: 2,
    name: 'Advanced Reactors',
    description: '+50% Generator output',
    cost: 500,
    effect: { type: 'districtBonus', district: 'generator', multiplier: 1.5 },
    requires: 'improved_power_plants',
  },
  gene_crops: {
    track: 'society', tier: 2,
    name: 'Gene Crops',
    description: '+50% Agriculture output',
    cost: 500,
    effect: { type: 'districtBonus', district: 'agriculture', multiplier: 1.5 },
    requires: 'frontier_medicine',
  },
  deep_mining: {
    track: 'engineering', tier: 2,
    name: 'Deep Mining',
    description: '+50% Mining output',
    cost: 500,
    effect: { type: 'districtBonus', district: 'mining', multiplier: 1.5 },
    requires: 'improved_mining',
  },
  fusion_reactors: {
    track: 'physics', tier: 3,
    name: 'Fusion Reactors',
    description: '+100% Generator output, generators produce +1 alloy',
    cost: 1000,
    effect: { type: 'districtBonus', district: 'generator', multiplier: 2.0, alloysBonus: 1 },
    requires: 'advanced_reactors',
  },
  genetic_engineering: {
    track: 'society', tier: 3,
    name: 'Genetic Engineering',
    description: '+100% Agriculture output, pop growth halved',
    cost: 1000,
    effect: { type: 'districtBonusAndGrowth', district: 'agriculture', multiplier: 2.0, growthMultiplier: 0.5 },
    requires: 'gene_crops',
  },
  automated_mining: {
    track: 'engineering', tier: 3,
    name: 'Automated Mining',
    description: '+100% Mining output, mining costs 0 jobs',
    cost: 1000,
    effect: { type: 'districtBonus', district: 'mining', multiplier: 2.0, jobOverride: 0 },
    requires: 'deep_mining',
  },
};

// Pop growth thresholds: food surplus -> ticks per new pop
const GROWTH_BASE_TICKS = 400;       // 40 seconds — base growth rate
const GROWTH_FAST_TICKS = 300;       // 30 seconds — food surplus > 5
const GROWTH_FASTEST_TICKS = 200;    // 20 seconds — food surplus > 10

class GameEngine {
  constructor(room, options = {}) {
    this.room = room;
    this.tickRate = options.tickRate || 10;
    this.tickInterval = null;
    this.tickCount = 0;
    this._idCounter = 0;
    this.playerStates = new Map();
    this.colonies = new Map(); // colonyId -> colony
    this._playerColonies = new Map(); // playerId -> colonyId[]
    this._colonyShips = []; // { id, ownerId, systemId, targetSystemId, path, hopProgress }
    this._scienceShips = []; // { id, ownerId, systemId, targetSystemId, path, hopProgress, surveying, surveyProgress }
    this._surveyedSystems = new Map(); // playerId -> Set of surveyed systemIds (persistent fog penetration)
    this.onTick = options.onTick || null;
    this.onEvent = options.onEvent || null;
    this.onGameOver = options.onGameOver || null;
    this._dirtyPlayers = new Set(); // per-player dirty tracking
    this._cachedState = null; // cached serialized state
    this._cachedStateJSON = null; // cached JSON string for broadcast
    this._cachedPlayerJSON = new Map(); // playerId -> cached per-player JSON string
    this._pendingEvents = []; // events to flush with next broadcast
    this._vpCache = new Map(); // playerId -> VP, cleared on invalidation
    this._vpBreakdownCache = new Map(); // playerId -> full VP breakdown
    this._vpCacheTick = -1;   // tick when VP cache was last computed
    this._summaryCache = new Map(); // playerId -> summary, tick-scoped
    this._summaryCacheTick = -1;
    this._techModCache = new Map(); // playerId -> { district, growth } — cleared on tech completion
    this._gameOver = false; // true after game ends

    // Game speed & pause
    this._gameSpeed = DEFAULT_SPEED;
    this._paused = false;
    this.onSpeedChange = options.onSpeedChange || null;

    // Match timer: minutes from room settings, 0 = unlimited
    const matchMinutes = Number(room.matchTimer) || 0;
    this._matchTicksRemaining = matchMinutes > 0 ? matchMinutes * 60 * (options.tickRate || 10) : 0;
    this._matchTimerEnabled = matchMinutes > 0;
    this._warned2min = false;
    this._warned30sec = false;

    // Tick profiling — enabled via GAME_DEBUG=1 env var or options.profile
    this._profile = options.profile || (typeof process !== 'undefined' && process.env.GAME_DEBUG === '1');
    this._tickTimings = []; // circular buffer of last 100 tick durations (ms)
    this._tickTimingsIdx = 0;
    this._tickTimingsMax = 100;

    // Colony crisis tracking — crisisState stored on colony objects, nextCrisisTick for scheduling
    this._crisisRng = 0; // simple counter for deterministic-ish crisis type picking

    // Scarcity season tracking
    this._activeScarcity = null; // { resource, ticksRemaining } when active
    this._lastScarcityResource = null; // prevent same resource twice in a row
    this._nextScarcityTick = this._randomScarcityInterval(); // first scarcity scheduled
    this._scarcityWarned = false; // true after warning broadcast, before scarcity starts

    this._initPlayerStates();

    // Generate galaxy
    const galaxySize = room.galaxySize || 'small';
    const galaxySeed = options.galaxySeed != null ? options.galaxySeed : Math.floor(Math.random() * 2147483647);
    this.galaxy = generateGalaxy({ size: galaxySize, seed: galaxySeed });

    // Build adjacency list from hyperlanes (cached for BFS pathfinding)
    this._adjacency = this._buildAdjacencyList();

    // Assign starting systems to players and place colonies
    const playerIds = [...this.playerStates.keys()];
    this._startingSystems = assignStartingSystems(this.galaxy, playerIds);
    this._initStartingColonies();

    // Mark all players dirty so first tick broadcasts initial state
    for (const [playerId] of this.playerStates) this._dirtyPlayers.add(playerId);
  }

  _nextId() {
    return `e${++this._idCounter}`;
  }

  _initPlayerStates() {
    let colorIndex = 0;
    for (const [playerId, player] of this.room.players) {
      this.playerStates.set(playerId, {
        id: playerId,
        name: player.name,
        color: PLAYER_COLORS[colorIndex++ % PLAYER_COLORS.length],
        resources: {
          energy: 100,
          minerals: 300,
          food: 100,
          alloys: 50,
          research: { physics: 0, society: 0, engineering: 0 },
          influence: 100,
        },
        currentResearch: { physics: null, society: null, engineering: null },
        researchProgress: {},
        completedTechs: [],
        activeEdict: null, // { type, monthsRemaining } or null
      });
    }
  }

  _initStartingColonies() {
    for (const [playerId] of this.playerStates) {
      // Use starting system's best habitable planet, or fallback defaults
      const systemId = this._startingSystems[playerId];
      let planet = { size: 16, type: 'continental', habitability: 80 };
      let systemName = 'Home';

      if (systemId != null && this.galaxy) {
        const system = this.galaxy.systems[systemId];
        if (system) {
          systemName = system.name;
          const best = bestHabitablePlanet(system);
          if (best) {
            planet = { size: best.size, type: best.type, habitability: best.habitability };
            best.colonized = true;
            best.colonyOwner = playerId;
          }
        }
      }

      const colony = this._createColony(playerId, systemName + ' Colony', planet, systemId);
      colony.isStartingColony = true;
      // Start with 4 pre-built districts (instant, no construction time)
      this._addBuiltDistrict(colony, 'generator');
      this._addBuiltDistrict(colony, 'mining');
      this._addBuiltDistrict(colony, 'agriculture');
      this._addBuiltDistrict(colony, 'agriculture');
    }
  }

  _createColony(ownerId, name, planet, systemId) {
    const id = this._nextId();
    const colony = {
      id,
      ownerId,
      name,
      systemId: systemId != null ? systemId : null,
      planet: {
        size: planet.size,         // max districts
        type: planet.type,
        habitability: planet.habitability,
      },
      districts: [],               // built districts: { id, type }
      buildQueue: [],              // { id, type, ticksRemaining }
      isStartingColony: false,     // true for initial colonies, no build discount
      playerBuiltDistricts: 0,    // count of districts player has built (not pre-built)
      pops: 8,                     // starting population
      growthProgress: 0,           // ticks accumulated toward next pop
      crisisState: null,           // active crisis: { type, ticksRemaining, resolved, disabledIds, quarantineTicks, strikeTicks, energyBoostTicks }
      nextCrisisTick: 0,           // tick when next crisis can occur (set on colony creation)
      _cachedHousing: null,        // cached derived values
      _cachedJobs: null,
      _cachedProduction: null,
    };
    // Schedule first crisis: current tick + random delay
    // First crisis has a grace period of 1500+ ticks (~2.5 min) so early game isn't punishing
    colony.nextCrisisTick = this.tickCount + 1500 + Math.floor(Math.random() * (CRISIS_MAX_TICKS - CRISIS_MIN_TICKS));
    this.colonies.set(id, colony);
    // Maintain player -> colonies index
    if (!this._playerColonies.has(ownerId)) {
      this._playerColonies.set(ownerId, []);
    }
    this._playerColonies.get(ownerId).push(id);
    this._dirtyPlayers.add(ownerId);
    this._invalidateStateCache();
    return colony;
  }

  _addBuiltDistrict(colony, type) {
    const id = this._nextId();
    colony.districts.push({ id, type });
    this._invalidateColonyCache(colony);
    return id;
  }

  _emitEvent(eventType, playerId, details, broadcast = false) {
    this._pendingEvents.push({ eventType, playerId, broadcast, ...details });
  }

  _flushEvents() {
    if (this._pendingEvents.length === 0) return null;
    const events = this._pendingEvents;
    this._pendingEvents = [];
    return events;
  }

  _invalidateStateCache() {
    this._cachedState = null;
    this._cachedStateJSON = null;
    this._cachedPlayerJSON.clear();
  }

  _invalidateColonyCache(colony) {
    colony._cachedHousing = null;
    colony._cachedJobs = null;
    colony._cachedProduction = null;
    colony._cachedTrait = undefined; // undefined = not computed, null = no trait
    this._dirtyPlayers.add(colony.ownerId);
    this._invalidateStateCache();
    this._vpCacheTick = -1; // VP depends on colonies — invalidate
    this._summaryCacheTick = -1; // summary depends on colonies
  }

  // Invalidate production caches for ALL colonies of a player.
  // Needed when trait bonuses change — they're empire-wide and affect all colonies.
  _invalidatePlayerProductionCaches(playerId) {
    const colonyIds = this._playerColonies.get(playerId) || [];
    for (const colonyId of colonyIds) {
      const colony = this.colonies.get(colonyId);
      if (colony) colony._cachedProduction = null;
    }
  }

  // Count total districts (built + in queue)
  _totalDistricts(colony) {
    return colony.districts.length + colony.buildQueue.length;
  }

  // Calculate housing capacity for a colony (cached)
  _calcHousing(colony) {
    if (colony._cachedHousing !== null) return colony._cachedHousing;
    let housing = 10; // base housing from capital
    for (const d of colony.districts) {
      if (d.disabled) continue; // disabled districts provide no housing
      const def = DISTRICT_DEFS[d.type];
      if (def) housing += def.housing;
    }
    colony._cachedHousing = housing;
    return housing;
  }

  // Calculate jobs provided by districts (cached)
  _calcJobs(colony) {
    if (colony._cachedJobs !== null) return colony._cachedJobs;
    const playerState = this.playerStates.get(colony.ownerId);
    const techMods = this._getTechModifiers(playerState);
    let jobs = 0;
    for (const d of colony.districts) {
      if (d.disabled) continue; // disabled districts provide no jobs
      const def = DISTRICT_DEFS[d.type];
      if (!def) continue;
      // T3 Automated Mining: mining districts cost 0 jobs
      const jobCount = (techMods.jobOverride[d.type] !== undefined) ? techMods.jobOverride[d.type] : def.jobs;
      jobs += jobCount;
    }
    colony._cachedJobs = jobs;
    return jobs;
  }

  // Calculate colony personality trait based on district composition
  // Returns { type, name, bonus } or null if no trait earned
  // Cached on the colony object — invalidated by _invalidateColonyCache
  _calcColonyTrait(colony) {
    if (colony._cachedTrait !== undefined) return colony._cachedTrait;
    const counts = {};
    for (const d of colony.districts) {
      if (d.disabled) continue;
      if (!COLONY_TRAITS[d.type]) continue;
      counts[d.type] = (counts[d.type] || 0) + 1;
    }
    let bestType = null;
    let bestCount = 0;
    for (const [type, count] of Object.entries(counts)) {
      if (count >= COLONY_TRAITS[type].threshold && count > bestCount) {
        bestCount = count;
        bestType = type;
      }
    }
    if (!bestType) {
      colony._cachedTrait = null;
      return null;
    }
    const traitDef = COLONY_TRAITS[bestType];
    colony._cachedTrait = { type: bestType, name: traitDef.name, bonus: traitDef.bonus };
    return colony._cachedTrait;
  }

  // Calculate empire-wide trait bonuses for a player (sum across all colonies)
  // Returns { resource: multiplier } e.g. { alloys: 0.20 } for 2 Forge Worlds
  _calcTraitBonuses(playerId) {
    const colonyIds = this._playerColonies.get(playerId) || [];
    const bonuses = {};
    for (const colonyId of colonyIds) {
      const colony = this.colonies.get(colonyId);
      if (!colony) continue;
      const trait = this._calcColonyTrait(colony);
      if (!trait) continue;
      for (const [resource, amount] of Object.entries(trait.bonus)) {
        bonuses[resource] = (bonuses[resource] || 0) + amount;
      }
    }
    return bonuses;
  }

  // Calculate per-month production for a colony (cached — invalidated on district/pop changes)
  _calcProduction(colony) {
    if (colony._cachedProduction !== null) return colony._cachedProduction;
    const production = { energy: 0, minerals: 0, food: 0, alloys: 0, physics: 0, society: 0, engineering: 0 };
    const consumption = { energy: 0, minerals: 0, food: 0, alloys: 0 };

    const jobs = this._calcJobs(colony);
    const workingPops = Math.min(colony.pops, jobs);

    // Get tech modifiers for production bonuses
    const playerState = this.playerStates.get(colony.ownerId);
    const techMods = this._getTechModifiers(playerState);

    // Planet type signature bonuses — lookup once per colony (planet type is constant)
    const planetBonus = PLANET_BONUSES[colony.planet.type] || null;

    // Assign pops to districts in order — each working district needs 1 pop
    // (unless tech overrides jobs to 0, e.g., Automated Mining)
    let assignedPops = 0;
    for (const d of colony.districts) {
      const def = DISTRICT_DEFS[d.type];
      if (!def) continue;

      // Disabled districts produce nothing, consume nothing, provide no jobs
      if (d.disabled) continue;

      // Effective job cost (T3 Automated Mining makes mining districts cost 0 jobs)
      const effectiveJobs = (techMods.jobOverride[d.type] !== undefined) ? techMods.jobOverride[d.type] : def.jobs;

      // Jobless districts (e.g., housing, or districts with tech job override) still consume resources
      if (effectiveJobs === 0 && def.jobs === 0) {
        // Naturally jobless (housing) — consume only, no production
        for (const [resource, amount] of Object.entries(def.consumes)) {
          consumption[resource] = (consumption[resource] || 0) + amount;
        }
        continue;
      }

      // Check if this district needs a pop to work
      if (effectiveJobs > 0) {
        if (assignedPops >= workingPops) break;
        assignedPops++;
      }
      // effectiveJobs === 0 but def.jobs > 0 means tech override — produces without consuming a pop

      const districtMod = techMods.district[d.type] || 1;
      for (const [resource, amount] of Object.entries(def.produces)) {
        production[resource] = (production[resource] || 0) + (amount * districtMod);
      }
      // T3 Fusion Reactors: generators produce bonus alloys per district
      const alloysExtra = techMods.alloysBonus[d.type];
      if (alloysExtra) {
        production.alloys = (production.alloys || 0) + alloysExtra;
      }
      // Planet type signature bonuses (additive, after tech modifier)
      const districtBonus = planetBonus && planetBonus[d.type];
      if (districtBonus) {
        for (const [resource, amount] of Object.entries(districtBonus)) {
          production[resource] = (production[resource] || 0) + amount;
        }
      }
      for (const [resource, amount] of Object.entries(def.consumes)) {
        consumption[resource] = (consumption[resource] || 0) + amount;
      }
    }

    // Unemployed pops produce 1 research each
    const unemployed = Math.max(0, colony.pops - jobs);
    production.physics += unemployed;
    production.society += unemployed;
    production.engineering += unemployed;

    // Pops consume 1 food each per month
    consumption.food = colony.pops;

    // Apply empire-wide colony trait bonuses (multiplicative on production)
    const traitBonuses = this._calcTraitBonuses(colony.ownerId);
    for (const [resource, bonus] of Object.entries(traitBonuses)) {
      if (production[resource]) {
        production[resource] = Math.round(production[resource] * (1 + bonus) * 100) / 100;
      }
    }

    // Edict production bonuses (multiplicative, after trait bonuses)
    const playerEdict = this.playerStates.get(colony.ownerId)?.activeEdict;
    if (playerEdict) {
      const edictDef = EDICT_DEFS[playerEdict.type];
      if (edictDef && edictDef.effect.type === 'productionBonus') {
        if (edictDef.effect.resource === 'minerals' && production.minerals > 0) {
          production.minerals = Math.round(production.minerals * edictDef.effect.multiplier * 100) / 100;
        } else if (edictDef.effect.resource === 'research') {
          if (production.physics > 0) production.physics = Math.round(production.physics * edictDef.effect.multiplier * 100) / 100;
          if (production.society > 0) production.society = Math.round(production.society * edictDef.effect.multiplier * 100) / 100;
          if (production.engineering > 0) production.engineering = Math.round(production.engineering * edictDef.effect.multiplier * 100) / 100;
        }
      }
    }

    // Scarcity season: -30% production for the affected resource
    if (this._activeScarcity) {
      const sr = this._activeScarcity.resource;
      if (production[sr] > 0) {
        production[sr] = Math.round(production[sr] * SCARCITY_MULTIPLIER * 100) / 100;
      }
    }

    // Power surge energy boost: +50% energy production during energyBoostTicks
    if (colony.crisisState && colony.crisisState.energyBoostTicks > 0 && production.energy > 0) {
      production.energy = Math.round(production.energy * 1.5 * 100) / 100;
    }

    const result = { production, consumption };
    colony._cachedProduction = result;
    return result;
  }

  // Process monthly resource production for all colonies of a player
  _processMonthlyResources() {
    for (const [playerId, state] of this.playerStates) {
      const colonyIds = this._playerColonies.get(playerId);
      if (!colonyIds) continue;

      for (const colonyId of colonyIds) {
        const colony = this.colonies.get(colonyId);
        if (!colony) continue;
        const { production, consumption } = this._calcProduction(colony);

        // Apply production
        state.resources.energy += production.energy;
        state.resources.minerals += production.minerals;
        state.resources.food += production.food;
        state.resources.alloys += production.alloys;
        state.resources.research.physics += production.physics;
        state.resources.research.society += production.society;
        state.resources.research.engineering += production.engineering;

        // Apply consumption
        state.resources.energy -= consumption.energy;
        state.resources.minerals -= consumption.minerals;
        state.resources.food -= consumption.food;
        state.resources.alloys -= consumption.alloys;
      }

      // Emit foodDeficit event after all colony processing for this player
      if (state.resources.food < 0) {
        this._emitEvent('foodDeficit', playerId, {
          food: state.resources.food,
        });
      }
      this._dirtyPlayers.add(playerId);
    }
    this._invalidateStateCache();
    this._vpCacheTick = -1; // resources changed — VP depends on alloys/research
  }

  // Process edict duration countdown (called monthly)
  _processEdicts() {
    for (const [playerId, state] of this.playerStates) {
      if (!state.activeEdict) continue;
      state.activeEdict.monthsRemaining--;
      if (state.activeEdict.monthsRemaining <= 0) {
        const edictDef = EDICT_DEFS[state.activeEdict.type];
        this._emitEvent('edictExpired', playerId, {
          edictType: state.activeEdict.type,
          edictName: edictDef ? edictDef.name : state.activeEdict.type,
        });
        state.activeEdict = null;
        // Invalidate production caches — edict modifiers changed
        this._invalidatePlayerProductionCaches(playerId);
        this._invalidateStateCache();
      }
      this._dirtyPlayers.add(playerId);
    }
  }

  // Process influence income from colonies (called monthly)
  _processInfluenceIncome() {
    for (const [playerId, state] of this.playerStates) {
      const colonyIds = this._playerColonies.get(playerId);
      if (!colonyIds || colonyIds.length === 0) continue;

      // Base income: +2 per colony (capital building)
      let income = colonyIds.length * INFLUENCE_BASE_INCOME;

      // Trait bonus: +1 per colony with an active personality trait
      for (const colonyId of colonyIds) {
        const colony = this.colonies.get(colonyId);
        if (!colony) continue;
        if (this._calcColonyTrait(colony)) {
          income += INFLUENCE_TRAIT_INCOME;
        }
      }

      state.resources.influence += income;
      // Cap at INFLUENCE_CAP
      if (state.resources.influence > INFLUENCE_CAP) {
        state.resources.influence = INFLUENCE_CAP;
      }

      this._dirtyPlayers.add(playerId);
    }
    this._invalidateStateCache();
  }

  // Generate a random interval for the next scarcity season
  _randomScarcityInterval() {
    return SCARCITY_MIN_INTERVAL + Math.floor(Math.random() * (SCARCITY_MAX_INTERVAL - SCARCITY_MIN_INTERVAL + 1));
  }

  // Pick a scarcity resource, avoiding the last one used
  _pickScarcityResource() {
    const candidates = SCARCITY_RESOURCES.filter(r => r !== this._lastScarcityResource);
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Process scarcity seasons — called every tick
  _processScarcitySeason() {
    // Active scarcity: count down and end when done
    if (this._activeScarcity) {
      this._activeScarcity.ticksRemaining--;
      if (this._activeScarcity.ticksRemaining <= 0) {
        const endedResource = this._activeScarcity.resource;
        this._activeScarcity = null;
        // Invalidate all production caches — multiplier removed
        this._invalidateAllProductionCaches();
        this._invalidateStateCache();
        // Broadcast scarcity ended
        this._emitEvent('scarcityEnded', null, { resource: endedResource }, true);
        // Schedule next scarcity
        this._nextScarcityTick = this.tickCount + this._randomScarcityInterval();
        this._scarcityWarned = false;
      }
      return;
    }

    // Warning phase: broadcast warning 100 ticks before start
    if (!this._scarcityWarned && this.tickCount >= this._nextScarcityTick - SCARCITY_WARNING_TICKS) {
      const resource = this._pickScarcityResource();
      this._pendingScarcityResource = resource;
      this._scarcityWarned = true;
      this._emitEvent('scarcityWarning', null, { resource }, true);
    }

    // Start scarcity when scheduled tick arrives
    if (this.tickCount >= this._nextScarcityTick) {
      const resource = this._pendingScarcityResource || this._pickScarcityResource();
      this._activeScarcity = { resource, ticksRemaining: SCARCITY_DURATION };
      this._lastScarcityResource = resource;
      this._pendingScarcityResource = null;
      // Invalidate all production caches — multiplier now applies
      this._invalidateAllProductionCaches();
      this._invalidateStateCache();
      // Broadcast scarcity started
      this._emitEvent('scarcityStarted', null, { resource, duration: SCARCITY_DURATION }, true);
    }
  }

  // Invalidate production caches for ALL colonies (scarcity affects everyone)
  // Also marks all colony-owning players dirty so the next broadcast sends updated production.
  _invalidateAllProductionCaches() {
    for (const [, colony] of this.colonies) {
      colony._cachedProduction = null;
      this._dirtyPlayers.add(colony.ownerId);
    }
    this._summaryCacheTick = -1;
  }

  // Process construction queues
  _processConstruction() {
    for (const [, colony] of this.colonies) {
      if (colony.buildQueue.length === 0) continue;
      // Mark owner dirty — ticksRemaining changed, client needs updated progress
      this._dirtyPlayers.add(colony.ownerId);
      const item = colony.buildQueue[0];
      item.ticksRemaining--;
      if (item.ticksRemaining <= 0) {
        colony.buildQueue.shift();

        if (item.type === 'colonyShip') {
          // Spawn colony ship at colony's system
          const shipId = this._nextId();
          this._colonyShips.push({
            id: shipId,
            ownerId: colony.ownerId,
            systemId: colony.systemId,
            targetSystemId: null,
            path: [],
            hopProgress: 0,
          });
          const ownerName = (this.playerStates.get(colony.ownerId) || {}).name || 'Unknown';
          this._emitEvent('constructionComplete', colony.ownerId, {
            colonyId: colony.id,
            colonyName: colony.name,
            districtType: 'colonyShip',
            shipId,
            playerName: ownerName,
          }, true);
        } else if (item.type === 'scienceShip') {
          // Spawn science ship at colony's system
          const shipId = this._nextId();
          this._scienceShips.push({
            id: shipId,
            ownerId: colony.ownerId,
            systemId: colony.systemId,
            targetSystemId: null,
            path: [],
            hopProgress: 0,
            surveying: false,
            surveyProgress: 0,
          });
          const ownerName = (this.playerStates.get(colony.ownerId) || {}).name || 'Unknown';
          this._emitEvent('constructionComplete', colony.ownerId, {
            colonyId: colony.id,
            colonyName: colony.name,
            districtType: 'scienceShip',
            shipId,
            playerName: ownerName,
          }, true);
        } else {
          const traitBefore = this._calcColonyTrait(colony);
          this._addBuiltDistrict(colony, item.type);
          const ownerName = (this.playerStates.get(colony.ownerId) || {}).name || 'Unknown';
          this._emitEvent('constructionComplete', colony.ownerId, {
            colonyId: colony.id,
            colonyName: colony.name,
            districtType: item.type,
            playerName: ownerName,
          }, true);
          // Check if a new colony trait was earned or changed
          const traitAfter = this._calcColonyTrait(colony);
          if (traitAfter && (!traitBefore || traitBefore.type !== traitAfter.type)) {
            // Trait bonuses are empire-wide — invalidate all sibling colonies' production caches
            this._invalidatePlayerProductionCaches(colony.ownerId);
            this._emitEvent('colonyTraitEarned', colony.ownerId, {
              colonyId: colony.id,
              colonyName: colony.name,
              traitType: traitAfter.type,
              traitName: traitAfter.name,
              playerName: ownerName,
            }, true);
          }
        }

        if (colony.buildQueue.length === 0) {
          this._emitEvent('queueEmpty', colony.ownerId, {
            colonyId: colony.id,
            colonyName: colony.name,
          });
        }
      }
    }
  }

  // Process population: starvation deaths (monthly) and growth (every tick)
  _processPopStarvation() {
    for (const [, colony] of this.colonies) {
      const state = this.playerStates.get(colony.ownerId);
      if (!state) continue;

      // Pop dies if food deficit
      if (state.resources.food < 0 && colony.pops > 1) {
        colony.pops--;
        colony.growthProgress = 0; // reset growth on starvation
        this._invalidateColonyCache(colony); // production depends on pops
      }
    }
  }

  // Process pop growth every tick — increment growthProgress when food surplus > 0
  _processPopGrowth() {
    for (const [, colony] of this.colonies) {
      // Plague quarantine halts growth
      if (colony.crisisState && colony.crisisState.quarantineTicks > 0) continue;

      const housing = this._calcHousing(colony);
      if (colony.pops >= housing) continue;

      const { production, consumption } = this._calcProduction(colony);
      const foodSurplus = production.food - consumption.food;

      if (foodSurplus <= 0) continue;

      // Determine growth speed based on food surplus
      let growthTarget;
      if (foodSurplus > 10) {
        growthTarget = GROWTH_FASTEST_TICKS;
      } else if (foodSurplus > 5) {
        growthTarget = GROWTH_FAST_TICKS;
      } else {
        growthTarget = GROWTH_BASE_TICKS;
      }

      // Apply growth tech modifier (e.g., Frontier Medicine reduces ticks needed)
      const playerState = this.playerStates.get(colony.ownerId);
      const techMods = this._getTechModifiers(playerState);
      if (techMods.growth !== 1) {
        growthTarget = Math.floor(growthTarget * techMods.growth);
      }

      // Apply edict growth bonus (Population Drive: halves growth ticks)
      if (playerState.activeEdict) {
        const edictDef = EDICT_DEFS[playerState.activeEdict.type];
        if (edictDef && edictDef.effect.type === 'growthBonus') {
          growthTarget = Math.floor(growthTarget * edictDef.effect.multiplier);
        }
      }

      colony.growthProgress++;
      // Throttle growth-progress broadcasts to every 10 ticks (~1Hz) — progress bar
      // doesn't need per-tick updates. Actual pop growth (below) always marks dirty.
      if (this.tickCount % 10 === 0) {
        this._dirtyPlayers.add(colony.ownerId);
      }
      if (colony.growthProgress >= growthTarget) {
        colony.pops++;
        colony.growthProgress = 0;
        this._invalidateColonyCache(colony); // production depends on pops

        // Pop milestone: fire on multiples of 5
        if (colony.pops % 5 === 0) {
          const ownerName = (this.playerStates.get(colony.ownerId) || {}).name || 'Unknown';
          this._emitEvent('popMilestone', colony.ownerId, {
            colonyId: colony.id,
            colonyName: colony.name,
            pops: colony.pops,
            playerName: ownerName,
          }, true);
        }

        // Housing full: fire when pops reach housing cap
        const newHousing = this._calcHousing(colony);
        if (colony.pops >= newHousing) {
          this._emitEvent('housingFull', colony.ownerId, {
            colonyId: colony.id,
            colonyName: colony.name,
            pops: colony.pops,
            housing: newHousing,
          });
        }
      }
    }
  }

  // Process energy deficit: disable/re-enable districts based on energy balance
  // Called after monthly resource processing
  _processEnergyDeficit() {
    for (const [playerId, state] of this.playerStates) {
      const colonyIds = this._playerColonies.get(playerId);
      if (!colonyIds) continue;

      // --- DISABLE phase: energy stockpile < 0 ---
      if (state.resources.energy < 0) {
        // Gather all enabled, energy-consuming districts across player colonies
        const candidates = [];
        for (const colonyId of colonyIds) {
          const colony = this.colonies.get(colonyId);
          if (!colony) continue;
          for (const d of colony.districts) {
            if (d.disabled) continue;
            const def = DISTRICT_DEFS[d.type];
            if (!def) continue;
            const energyCost = def.consumes.energy || 0;
            if (energyCost > 0) {
              candidates.push({ district: d, colony, energyCost, energyProd: def.produces.energy || 0 });
            }
          }
        }
        // Sort by energy consumption descending (disable highest consumers first)
        candidates.sort((a, b) => b.energyCost - a.energyCost);

        for (const c of candidates) {
          if (state.resources.energy >= 0) break;
          c.district.disabled = true;
          // Reverse this month's impact: add back consumption, subtract production
          state.resources.energy += c.energyCost;
          state.resources.energy -= c.energyProd;
          this._invalidateColonyCache(c.colony);
          this._emitEvent('districtDisabled', playerId, {
            colonyId: c.colony.id,
            colonyName: c.colony.name,
            districtId: c.district.id,
            districtType: c.district.type,
          });
        }
      }

      // --- RE-ENABLE phase: try to bring back disabled districts (cheapest first) ---
      // Only if energy is non-negative after any disables
      if (state.resources.energy >= 0) {
        const disabled = [];
        for (const colonyId of colonyIds) {
          const colony = this.colonies.get(colonyId);
          if (!colony) continue;
          for (const d of colony.districts) {
            if (!d.disabled) continue;
            const def = DISTRICT_DEFS[d.type];
            if (!def) continue;
            const energyCost = def.consumes.energy || 0;
            disabled.push({ district: d, colony, energyCost, energyProd: def.produces.energy || 0 });
          }
        }
        // Sort by energy consumption ascending (re-enable cheapest first)
        disabled.sort((a, b) => a.energyCost - b.energyCost);

        // Calculate net energy once, then adjust incrementally as we re-enable
        let currentNetEnergy = this._calcPlayerNetEnergy(playerId);

        for (const c of disabled) {
          const netChange = c.energyProd - c.energyCost;
          if (currentNetEnergy + netChange >= 0) {
            delete c.district.disabled;
            this._invalidateColonyCache(c.colony);
            currentNetEnergy += netChange; // adjust incrementally
            this._emitEvent('districtEnabled', playerId, {
              colonyId: c.colony.id,
              colonyName: c.colony.name,
              districtId: c.district.id,
              districtType: c.district.type,
            });
          }
        }
      }
    }
  }

  // --- Colony Crisis Processing ---

  // Pick a crisis type deterministically using a simple counter
  _pickCrisisType() {
    const idx = this._crisisRng % CRISIS_TYPE_KEYS.length;
    this._crisisRng++;
    return CRISIS_TYPE_KEYS[idx];
  }

  // Schedule next crisis for a colony (after resolution or initial)
  _scheduleCrisis(colony) {
    // Scale crisis interval by colony count: +100 ticks per colony beyond 3
    // Prevents late-game micro fatigue with many colonies
    const colonyCount = (this._playerColonies.get(colony.ownerId) || []).length;
    const extraDelay = Math.max(0, colonyCount - 3) * 100;
    colony.nextCrisisTick = this.tickCount + CRISIS_IMMUNITY_TICKS + CRISIS_MIN_TICKS + extraDelay +
      Math.floor(Math.random() * (CRISIS_MAX_TICKS - CRISIS_MIN_TICKS));
  }

  // Process colony crises — called every tick
  _processColonyCrises() {
    for (const [, colony] of this.colonies) {
      // Skip if colony has < 2 districts (too small for crises)
      if (colony.districts.length < 2) continue;

      // Process active crisis effects (ongoing effects like plague pop loss, strike timers)
      if (colony.crisisState) {
        this._processCrisisEffects(colony);
        continue; // don't trigger new crisis while one is active
      }

      // Check if it's time for a new crisis
      if (this.tickCount >= colony.nextCrisisTick) {
        this._triggerCrisis(colony);
      }
    }
  }

  // Trigger a new crisis on a colony
  _triggerCrisis(colony) {
    const crisisKey = this._pickCrisisType();
    const crisisDef = CRISIS_TYPES[crisisKey];

    // For labor unrest, pick 3 random enabled districts to disable
    let disabledIds = new Set();
    if (crisisKey === 'laborUnrest') {
      const enabled = colony.districts.filter(d => !d.disabled);
      // Shuffle and pick up to 3
      for (let i = enabled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [enabled[i], enabled[j]] = [enabled[j], enabled[i]];
      }
      disabledIds = new Set(enabled.slice(0, 3).map(d => d.id));
      for (const d of colony.districts) {
        if (disabledIds.has(d.id)) {
          d.disabled = true;
        }
      }
      this._invalidateColonyCache(colony);
    }

    colony.crisisState = {
      type: crisisKey,
      ticksRemaining: CRISIS_CHOICE_TICKS,
      resolved: false,
      disabledIds,          // labor unrest: which districts were disabled
      quarantineTicks: 0,   // plague quarantine countdown
      strikeTicks: 0,       // labor unrest wait countdown
      energyBoostTicks: 0,  // power surge ride-it-out boost countdown
      shutdownTicks: 0,     // power surge shutdown countdown
    };

    this._dirtyPlayers.add(colony.ownerId);
    this._invalidateStateCache();

    // Broadcast crisis event to all players
    const ownerName = (this.playerStates.get(colony.ownerId) || {}).name || 'Unknown';
    this._emitEvent('crisisStarted', colony.ownerId, {
      colonyId: colony.id,
      colonyName: colony.name,
      crisisType: crisisKey,
      crisisLabel: crisisDef.label,
      ticksRemaining: CRISIS_CHOICE_TICKS,
      playerName: ownerName,
    }, true);
  }

  // Process ongoing crisis effects each tick
  _processCrisisEffects(colony) {
    const crisis = colony.crisisState;

    // Plague quarantine: count down, then clear
    if (crisis.quarantineTicks > 0) {
      crisis.quarantineTicks--;
      if (crisis.quarantineTicks <= 0) {
        colony.crisisState = null;
        this._scheduleCrisis(colony);
        this._dirtyPlayers.add(colony.ownerId);
        this._invalidateStateCache();
        this._emitEvent('crisisResolved', colony.ownerId, {
          colonyId: colony.id,
          colonyName: colony.name,
          crisisType: 'plague',
          outcome: 'Quarantine lifted',
        });
      }
      return;
    }

    // Labor unrest wait: count down, then re-enable districts
    if (crisis.strikeTicks > 0) {
      crisis.strikeTicks--;
      if (crisis.strikeTicks <= 0) {
        // Re-enable struck districts
        for (const d of colony.districts) {
          if (crisis.disabledIds.has(d.id)) {
            delete d.disabled;
          }
        }
        this._invalidateColonyCache(colony);
        colony.crisisState = null;
        this._scheduleCrisis(colony);
        this._emitEvent('crisisResolved', colony.ownerId, {
          colonyId: colony.id,
          colonyName: colony.name,
          crisisType: 'laborUnrest',
          outcome: 'Strike ended',
        });
      }
      this._dirtyPlayers.add(colony.ownerId);
      return;
    }

    // Power surge shutdown: count down, then re-enable all
    if (crisis.shutdownTicks > 0) {
      crisis.shutdownTicks--;
      if (crisis.shutdownTicks <= 0) {
        for (const d of colony.districts) {
          if (d.disabled) delete d.disabled;
        }
        this._invalidateColonyCache(colony);
        colony.crisisState = null;
        this._scheduleCrisis(colony);
        this._emitEvent('crisisResolved', colony.ownerId, {
          colonyId: colony.id,
          colonyName: colony.name,
          crisisType: 'powerSurge',
          outcome: 'Systems back online',
        });
      }
      this._dirtyPlayers.add(colony.ownerId);
      return;
    }

    // Power surge energy boost: count down
    if (crisis.energyBoostTicks > 0) {
      crisis.energyBoostTicks--;
      if (crisis.energyBoostTicks <= 0) {
        colony.crisisState = null;
        this._scheduleCrisis(colony);
        this._invalidateColonyCache(colony); // remove energy boost
        this._dirtyPlayers.add(colony.ownerId);
        this._emitEvent('crisisResolved', colony.ownerId, {
          colonyId: colony.id,
          colonyName: colony.name,
          crisisType: 'powerSurge',
          outcome: 'Energy surge subsided',
        });
      }
      this._dirtyPlayers.add(colony.ownerId);
      return;
    }

    // Unresolved crisis: count down choice timer
    if (!crisis.resolved) {
      crisis.ticksRemaining--;
      // Throttle dirty marking to every 10 ticks
      if (this.tickCount % 10 === 0) {
        this._dirtyPlayers.add(colony.ownerId);
      }
      if (crisis.ticksRemaining <= 0) {
        // Auto-resolve with worst outcome
        this._autoResolveCrisis(colony);
      }
    }
  }

  // Auto-resolve crisis with worst outcome when timer expires
  _autoResolveCrisis(colony) {
    const crisis = colony.crisisState;
    switch (crisis.type) {
      case 'seismic':
        // Worst: lose district + 1 pop
        this._resolveCrisisSeismic(colony, 'reinforce', true); // force failure
        break;
      case 'plague':
        // Worst: lose 1 pop, no cure
        if (colony.pops > 1) colony.pops--;
        colony.crisisState = null;
        this._scheduleCrisis(colony);
        this._invalidateColonyCache(colony);
        this._emitEvent('crisisResolved', colony.ownerId, {
          colonyId: colony.id,
          colonyName: colony.name,
          crisisType: 'plague',
          outcome: 'Plague unchecked — 1 pop lost',
        });
        break;
      case 'powerSurge':
        // Worst: lose a generator
        this._resolveCrisisPowerSurge(colony, 'rideItOut', true); // force failure
        break;
      case 'laborUnrest':
        // Worst: strike continues for 300 ticks (already disabled)
        crisis.resolved = true;
        crisis.strikeTicks = 300;
        this._dirtyPlayers.add(colony.ownerId);
        this._emitEvent('crisisResolved', colony.ownerId, {
          colonyId: colony.id,
          colonyName: colony.name,
          crisisType: 'laborUnrest',
          outcome: 'Unrest continues — strike for 300 ticks',
        });
        break;
    }
  }

  // Resolve seismic crisis
  _resolveCrisisSeismic(colony, choice, forceFailure = false) {
    if (choice === 'evacuate') {
      // Lose 1 district (last built), save pops
      if (colony.districts.length > 0) {
        colony.districts.pop();
      }
      this._invalidateColonyCache(colony);
      colony.crisisState = null;
      this._scheduleCrisis(colony);
      this._emitEvent('crisisResolved', colony.ownerId, {
        colonyId: colony.id,
        colonyName: colony.name,
        crisisType: 'seismic',
        outcome: 'Evacuated — 1 district lost, pops safe',
      });
    } else {
      // Reinforce: 70% success, 30% fail (lose district + 1 pop)
      const success = !forceFailure && Math.random() < 0.7;
      if (success) {
        colony.crisisState = null;
        this._scheduleCrisis(colony);
        this._emitEvent('crisisResolved', colony.ownerId, {
          colonyId: colony.id,
          colonyName: colony.name,
          crisisType: 'seismic',
          outcome: 'Reinforcement succeeded — no damage',
        });
      } else {
        if (colony.districts.length > 0) colony.districts.pop();
        if (colony.pops > 1) colony.pops--;
        this._invalidateColonyCache(colony);
        colony.crisisState = null;
        this._scheduleCrisis(colony);
        this._emitEvent('crisisResolved', colony.ownerId, {
          colonyId: colony.id,
          colonyName: colony.name,
          crisisType: 'seismic',
          outcome: 'Reinforcement failed — district + 1 pop lost',
        });
      }
    }
    this._dirtyPlayers.add(colony.ownerId);
  }

  // Resolve plague crisis
  _resolveCrisisPlague(colony, choice, forceFailure = false) {
    if (choice === 'quarantine') {
      // Growth halted for 300 ticks, no pop loss
      colony.crisisState.resolved = true;
      colony.crisisState.quarantineTicks = 300;
      colony.growthProgress = 0; // reset growth
      this._dirtyPlayers.add(colony.ownerId);
      this._emitEvent('crisisResolved', colony.ownerId, {
        colonyId: colony.id,
        colonyName: colony.name,
        crisisType: 'plague',
        outcome: 'Quarantine in effect — growth halted 300 ticks',
      });
    } else {
      // Rush Cure: 80% success, 20% spreads (lose 1 pop)
      const success = !forceFailure && Math.random() < 0.8;
      if (success) {
        colony.crisisState = null;
        this._scheduleCrisis(colony);
        this._dirtyPlayers.add(colony.ownerId);
        this._emitEvent('crisisResolved', colony.ownerId, {
          colonyId: colony.id,
          colonyName: colony.name,
          crisisType: 'plague',
          outcome: 'Cure successful — plague eradicated!',
        });
      } else {
        if (colony.pops > 1) colony.pops--;
        this._invalidateColonyCache(colony);
        colony.crisisState = null;
        this._scheduleCrisis(colony);
        this._dirtyPlayers.add(colony.ownerId);
        this._emitEvent('crisisResolved', colony.ownerId, {
          colonyId: colony.id,
          colonyName: colony.name,
          crisisType: 'plague',
          outcome: 'Cure failed — plague spread, 1 pop lost',
        });
      }
    }
  }

  // Resolve power surge crisis
  _resolveCrisisPowerSurge(colony, choice, forceFailure = false) {
    if (choice === 'shutDown') {
      // Disable all districts for 100 ticks
      for (const d of colony.districts) {
        d.disabled = true;
      }
      this._invalidateColonyCache(colony);
      colony.crisisState.resolved = true;
      colony.crisisState.shutdownTicks = 100;
      this._dirtyPlayers.add(colony.ownerId);
      this._emitEvent('crisisResolved', colony.ownerId, {
        colonyId: colony.id,
        colonyName: colony.name,
        crisisType: 'powerSurge',
        outcome: 'Emergency shutdown — districts offline for 100 ticks',
      });
    } else {
      // Ride it out: 25% chance to lose a generator
      const failed = forceFailure || Math.random() < 0.25;
      if (failed) {
        // Find and remove a generator district
        const genIdx = colony.districts.findIndex(d => d.type === 'generator' && !d.disabled);
        if (genIdx !== -1) {
          colony.districts.splice(genIdx, 1);
        }
        this._invalidateColonyCache(colony);
        colony.crisisState = null;
        this._scheduleCrisis(colony);
        this._dirtyPlayers.add(colony.ownerId);
        this._emitEvent('crisisResolved', colony.ownerId, {
          colonyId: colony.id,
          colonyName: colony.name,
          crisisType: 'powerSurge',
          outcome: 'Power surge damaged generator — district lost',
        });
      } else {
        // Success: +50% energy for 200 ticks (applied via energyBoostTicks)
        colony.crisisState.resolved = true;
        colony.crisisState.energyBoostTicks = 200;
        this._invalidateColonyCache(colony); // production recalc for energy boost
        this._dirtyPlayers.add(colony.ownerId);
        this._emitEvent('crisisResolved', colony.ownerId, {
          colonyId: colony.id,
          colonyName: colony.name,
          crisisType: 'powerSurge',
          outcome: 'Surge harnessed — +50% energy for 200 ticks!',
        });
      }
    }
  }

  // Resolve labor unrest crisis
  _resolveCrisisLaborUnrest(colony, choice) {
    if (choice === 'negotiate') {
      // Re-enable struck districts immediately
      for (const d of colony.districts) {
        if (colony.crisisState.disabledIds.has(d.id)) {
          delete d.disabled;
        }
      }
      this._invalidateColonyCache(colony);
      colony.crisisState = null;
      this._scheduleCrisis(colony);
      this._dirtyPlayers.add(colony.ownerId);
      this._emitEvent('crisisResolved', colony.ownerId, {
        colonyId: colony.id,
        colonyName: colony.name,
        crisisType: 'laborUnrest',
        outcome: 'Negotiations successful — work resumed',
      });
    } else {
      // Wait it out: strike lasts 300 ticks
      colony.crisisState.resolved = true;
      colony.crisisState.strikeTicks = 300;
      this._dirtyPlayers.add(colony.ownerId);
      this._emitEvent('crisisResolved', colony.ownerId, {
        colonyId: colony.id,
        colonyName: colony.name,
        crisisType: 'laborUnrest',
        outcome: 'Waiting out strike — 300 ticks until resolution',
      });
    }
  }

  // Main resolve command — called from handleCommand
  resolveCrisis(playerId, colonyId, choiceId) {
    const colony = this.colonies.get(colonyId);
    if (!colony) return { error: 'Colony not found' };
    if (colony.ownerId !== playerId) return { error: 'Not your colony' };
    if (!colony.crisisState) return { error: 'No active crisis' };
    if (colony.crisisState.resolved) return { error: 'Crisis already resolved' };

    const crisisDef = CRISIS_TYPES[colony.crisisState.type];
    if (!crisisDef) return { error: 'Unknown crisis type' };

    // Validate choice
    const validChoices = crisisDef.choices.map(c => c.id);
    if (!validChoices.includes(choiceId)) return { error: 'Invalid choice' };

    // Check resource cost
    const choiceDef = crisisDef.choices.find(c => c.id === choiceId);
    if (choiceDef.cost) {
      const state = this.playerStates.get(playerId);
      for (const [resource, amount] of Object.entries(choiceDef.cost)) {
        if (!Number.isFinite(state.resources[resource]) || state.resources[resource] < amount) {
          return { error: `Not enough ${resource}` };
        }
      }
      // Deduct resources
      for (const [resource, amount] of Object.entries(choiceDef.cost)) {
        state.resources[resource] -= amount;
      }
    }

    // Dispatch to type-specific resolution
    switch (colony.crisisState.type) {
      case 'seismic': this._resolveCrisisSeismic(colony, choiceId); break;
      case 'plague': this._resolveCrisisPlague(colony, choiceId); break;
      case 'powerSurge': this._resolveCrisisPowerSurge(colony, choiceId); break;
      case 'laborUnrest': this._resolveCrisisLaborUnrest(colony, choiceId); break;
    }

    this._invalidateStateCache();
    return { ok: true };
  }

  // Calculate net energy production/month across all colonies for a player
  _calcPlayerNetEnergy(playerId) {
    const colonyIds = this._playerColonies.get(playerId) || [];
    let net = 0;
    for (const colonyId of colonyIds) {
      const colony = this.colonies.get(colonyId);
      if (!colony) continue;
      const { production, consumption } = this._calcProduction(colony);
      net += (production.energy || 0) - (consumption.energy || 0);
    }
    return net;
  }

  // Build adjacency list from hyperlanes (called once at construction)
  _buildAdjacencyList() {
    if (!this.galaxy) return new Map();
    const adj = new Map();
    for (const [a, b] of this.galaxy.hyperlanes) {
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push(b);
      adj.get(b).push(a);
    }
    return adj;
  }

  // BFS shortest path between two systems along hyperlanes
  // Returns array of system IDs from (excluding) start to target, or null if unreachable
  _findPath(fromSystemId, toSystemId) {
    if (fromSystemId === toSystemId) return [];
    if (!this.galaxy) return null;

    const adj = this._adjacency;
    const visited = new Set([fromSystemId]);
    const parent = new Map();
    const queue = [fromSystemId];
    let found = false;

    while (queue.length > 0) {
      const current = queue.shift();
      const neighbors = adj.get(current) || [];
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        parent.set(neighbor, current);
        if (neighbor === toSystemId) { found = true; break; }
        queue.push(neighbor);
      }
      if (found) break;
    }

    if (!found) return null;

    // Reconstruct path from target back to start
    const path = [];
    let node = toSystemId;
    while (node !== fromSystemId) {
      path.push(node);
      node = parent.get(node);
    }
    path.reverse();
    return path;
  }

  // Process colony ship movement each tick
  _processColonyShipMovement() {
    const arrivals = [];
    for (const ship of this._colonyShips) {
      if (!ship.path || ship.path.length === 0) continue;

      ship.hopProgress++;
      // Throttle dirty marking to every 5 ticks for ship movement animation
      if (this.tickCount % 5 === 0) {
        this._dirtyPlayers.add(ship.ownerId);
      }

      if (ship.hopProgress >= COLONY_SHIP_HOP_TICKS) {
        // Arrived at next system in path
        ship.systemId = ship.path.shift();
        ship.hopProgress = 0;
        this._dirtyPlayers.add(ship.ownerId);

        if (ship.path.length === 0) {
          // Arrived at final destination
          arrivals.push(ship);
        }
      }
    }

    // Process arrivals — found colonies
    for (const ship of arrivals) {
      this._foundColonyFromShip(ship);
    }

    // Ship state was mutated — clear cached JSON for fresh broadcasts
    if (this._dirtyPlayers.size > 0) this._invalidateStateCache();
  }

  // Remove a colony ship by reference (in-place splice, no new array)
  _removeColonyShip(ship) {
    const idx = this._colonyShips.indexOf(ship);
    if (idx !== -1) this._colonyShips.splice(idx, 1);
  }

  // Found a new colony when colony ship arrives
  _foundColonyFromShip(ship) {
    const system = this.galaxy.systems[ship.targetSystemId];
    if (!system) return;

    // Find the target planet (best habitable planet in the system)
    const planet = bestHabitablePlanet(system);
    if (!planet) return;

    // Check colony cap again (could have changed during transit)
    const colonyIds = this._playerColonies.get(ship.ownerId) || [];
    if (colonyIds.length >= MAX_COLONIES) {
      this._emitEvent('colonyShipFailed', ship.ownerId, {
        systemName: system.name,
        reason: 'Colony cap reached',
      });
      this._removeColonyShip(ship);
      this._dirtyPlayers.add(ship.ownerId);
      return;
    }

    // Check planet not already colonized
    if (planet.colonized) {
      this._emitEvent('colonyShipFailed', ship.ownerId, {
        systemName: system.name,
        reason: 'Planet already colonized',
      });
      this._removeColonyShip(ship);
      this._dirtyPlayers.add(ship.ownerId);
      return;
    }

    // Mark planet as colonized
    planet.colonized = true;
    planet.colonyOwner = ship.ownerId;
    system.owner = ship.ownerId;

    // Create colony with reduced starting pops (2 instead of 8)
    const colony = this._createColony(ship.ownerId, system.name + ' Colony', {
      size: planet.size,
      type: planet.type,
      habitability: planet.habitability,
    }, ship.targetSystemId);
    colony.pops = COLONY_SHIP_STARTING_POPS;
    colony.isStartingColony = false;

    // Remove ship
    this._removeColonyShip(ship);

    // Emit colony founded event (broadcast to all players)
    const playerState = this.playerStates.get(ship.ownerId);
    this._emitEvent('colonyFounded', ship.ownerId, {
      colonyId: colony.id,
      colonyName: colony.name,
      systemName: system.name,
      planetType: planet.type,
      playerName: playerState ? playerState.name : 'Unknown',
    }, true);

    this._invalidateStateCache();
    this._vpCacheTick = -1;
  }

  // Process science ship movement and surveying each tick
  _processScienceShipMovement() {
    const completed = [];
    for (const ship of this._scienceShips) {
      // Ship is surveying a system
      if (ship.surveying) {
        ship.surveyProgress++;
        if (this.tickCount % 5 === 0) this._dirtyPlayers.add(ship.ownerId);
        if (ship.surveyProgress >= SURVEY_TICKS) {
          completed.push(ship);
        }
        continue;
      }

      // Ship is traveling
      if (!ship.path || ship.path.length === 0) continue;

      ship.hopProgress++;
      if (this.tickCount % 5 === 0) this._dirtyPlayers.add(ship.ownerId);

      if (ship.hopProgress >= SCIENCE_SHIP_HOP_TICKS) {
        ship.systemId = ship.path.shift();
        ship.hopProgress = 0;
        this._dirtyPlayers.add(ship.ownerId);

        if (ship.path.length === 0) {
          // Arrived at destination — only survey if this is the survey target (not a return trip)
          const surveyed = this._surveyedSystems.get(ship.ownerId);
          const alreadySurveyed = surveyed && surveyed.has(ship.systemId);
          if (ship.targetSystemId === ship.systemId && !alreadySurveyed) {
            ship.surveying = true;
            ship.surveyProgress = 0;
          } else {
            // Return trip complete — ship is idle
            ship.targetSystemId = null;
          }
        }
      }
    }

    // Process completed surveys
    for (const ship of completed) {
      this._completeSurvey(ship);
    }

    // Ship state was mutated (hopProgress, systemId, path) — clear cached JSON
    // so the next broadcast serializes fresh data instead of stale values.
    if (this._dirtyPlayers.size > 0) this._invalidateStateCache();
  }

  // Complete a survey and discover anomalies
  _completeSurvey(ship) {
    const system = this.galaxy ? this.galaxy.systems[ship.systemId] : null;
    if (!system) return;

    // Mark system as surveyed for this player (persistent fog penetration)
    if (!this._surveyedSystems.has(ship.ownerId)) {
      this._surveyedSystems.set(ship.ownerId, new Set());
    }
    this._surveyedSystems.get(ship.ownerId).add(ship.systemId);

    // Check each planet for anomalies
    const discoveries = [];
    const playerState = this.playerStates.get(ship.ownerId);
    if (system.planets) {
      for (const planet of system.planets) {
        // Seeded random based on system + planet orbit for determinism
        const roll = this._seededRandom(ship.systemId * 100 + planet.orbit);
        if (roll < ANOMALY_CHANCE) {
          const anomalyIdx = Math.floor(this._seededRandom(ship.systemId * 100 + planet.orbit + 50) * ANOMALY_TYPES.length);
          const anomaly = ANOMALY_TYPES[anomalyIdx];

          // Apply reward
          if (anomaly.reward.research && playerState) {
            for (const [track, amount] of Object.entries(anomaly.reward.research)) {
              playerState.resources.research = playerState.resources.research || { physics: 0, society: 0, engineering: 0 };
              playerState.resources.research[track] = (playerState.resources.research[track] || 0) + amount;
            }
          }
          if (anomaly.reward.minerals && playerState) {
            playerState.resources.minerals += anomaly.reward.minerals;
          }
          if (anomaly.reward.alloys && playerState) {
            playerState.resources.alloys += anomaly.reward.alloys;
          }
          if (anomaly.reward.influence && playerState) {
            playerState.resources.influence += anomaly.reward.influence;
          }
          if (anomaly.reward.planetSizeBonus) {
            planet.size += anomaly.reward.planetSizeBonus;
          }

          discoveries.push({ planetOrbit: planet.orbit, anomalyType: anomaly.type, anomalyLabel: anomaly.label });
        }
      }
    }

    // Emit survey complete event
    const ownerName = playerState ? playerState.name : 'Unknown';
    this._emitEvent('surveyComplete', ship.ownerId, {
      systemId: ship.systemId,
      systemName: system.name,
      playerName: ownerName,
      discoveries,
    }, true);

    // Emit individual anomaly events for each discovery
    for (const d of discoveries) {
      this._emitEvent('anomalyDiscovered', ship.ownerId, {
        systemName: system.name,
        anomalyType: d.anomalyType,
        anomalyLabel: d.anomalyLabel,
        planetOrbit: d.planetOrbit,
        playerName: ownerName,
      });
    }

    // Ship stays idle at surveyed system, ready for next command
    ship.surveying = false;
    ship.surveyProgress = 0;
    ship.targetSystemId = null;

    this._dirtyPlayers.add(ship.ownerId);
    this._invalidateStateCache();
    this._vpCacheTick = -1;
  }

  // Simple seeded random for survey determinism (hash-based, not stored)
  _seededRandom(seed) {
    let x = Math.sin(seed * 9301 + 49297) * 49297;
    return x - Math.floor(x);
  }

  // Send science ship back to nearest owned colony after survey
  _returnScienceShipToColony(ship) {
    const colonyIds = this._playerColonies.get(ship.ownerId) || [];
    if (colonyIds.length === 0) return; // no colonies, ship stays put

    // Find nearest colony by BFS hop count — keep the shortest path to avoid redundant BFS
    let nearestPath = null;
    let nearestSystemId = null;
    for (const colonyId of colonyIds) {
      const colony = this.colonies.get(colonyId);
      if (!colony) continue;
      const path = this._findPath(ship.systemId, colony.systemId);
      if (path && (nearestPath === null || path.length < nearestPath.length)) {
        nearestPath = path;
        nearestSystemId = colony.systemId;
      }
    }

    if (nearestPath && nearestPath.length > 0) {
      ship.targetSystemId = null; // null signals return trip (not a survey mission)
      ship.path = nearestPath;
      ship.hopProgress = 0;
    }
  }

  // Remove a science ship by reference
  _removeScienceShip(ship) {
    const idx = this._scienceShips.indexOf(ship);
    if (idx !== -1) this._scienceShips.splice(idx, 1);
  }

  // Get district output multipliers from completed techs (cached per player)
  _getTechModifiers(playerState) {
    if (!playerState || !playerState.completedTechs) return { district: {}, growth: 1, alloysBonus: {}, jobOverride: {} };

    // Return cached value if available and tech count unchanged
    const cached = this._techModCache.get(playerState.id);
    if (cached && cached._techCount === playerState.completedTechs.length) return cached;

    const modifiers = {}; // districtType -> multiplier
    let growthMultiplier = 1;
    const alloysBonus = {}; // districtType -> bonus alloys per working district
    const jobOverride = {}; // districtType -> overridden job count

    for (const techId of playerState.completedTechs) {
      const tech = TECH_TREE[techId];
      if (!tech) continue;

      if (tech.effect.type === 'districtBonus' || tech.effect.type === 'districtBonusAndGrowth') {
        const current = modifiers[tech.effect.district] || 1;
        // Use the highest multiplier (T3 supersedes T2 supersedes T1 for same district)
        if (tech.effect.multiplier > current) {
          modifiers[tech.effect.district] = tech.effect.multiplier;
        }
        // T3 bonus: generators produce extra alloys
        if (tech.effect.alloysBonus) {
          alloysBonus[tech.effect.district] = tech.effect.alloysBonus;
        }
        // T3 bonus: mining districts cost 0 jobs
        if (tech.effect.jobOverride !== undefined) {
          jobOverride[tech.effect.district] = tech.effect.jobOverride;
        }
      }
      if (tech.effect.type === 'growthBonus') {
        growthMultiplier *= tech.effect.multiplier;
      }
      // districtBonusAndGrowth: both district bonus (handled above) and growth bonus
      if (tech.effect.type === 'districtBonusAndGrowth' && tech.effect.growthMultiplier) {
        growthMultiplier *= tech.effect.growthMultiplier;
      }
    }

    const result = { district: modifiers, growth: growthMultiplier, alloysBonus, jobOverride, _techCount: playerState.completedTechs.length };
    this._techModCache.set(playerState.id, result);
    return result;
  }

  // Diminishing pop VP: first 20 pops ×2, pops 21-40 ×1.5 (rounded), pops 41+ ×1
  static _calcPopVP(totalPops) {
    if (totalPops <= 20) return totalPops * 2;
    if (totalPops <= 40) return 40 + Math.round((totalPops - 20) * 1.5);
    return 40 + 30 + (totalPops - 40);
  }

  // Full VP breakdown for a player — single source of truth for the VP formula.
  // Returns { vp, pops, popsVP, districts, districtsVP, alloys, alloysVP, totalResearch, researchVP, techs, techVP, traits, traitsVP, surveyed, surveyedVP }
  _calcVPBreakdown(playerId) {
    const cached = this._vpBreakdownCache.get(playerId);
    if (cached && this._vpCacheTick === this.tickCount) return cached;

    const state = this.playerStates.get(playerId);
    if (!state) {
      const empty = { vp: 0, pops: 0, popsVP: 0, districts: 0, districtsVP: 0, alloys: 0, alloysVP: 0, totalResearch: 0, researchVP: 0, techs: 0, techVP: 0, traits: 0, traitsVP: 0, surveyed: 0, surveyedVP: 0 };
      return empty;
    }

    // Diminishing pop VP + Districts × 1 (single pass) + count traits
    let totalPops = 0;
    let totalDistricts = 0;
    let traitCount = 0;
    const colonyIds = this._playerColonies.get(playerId) || [];
    for (const colonyId of colonyIds) {
      const colony = this.colonies.get(colonyId);
      if (colony) {
        totalPops += colony.pops;
        totalDistricts += colony.districts.length;
        if (this._calcColonyTrait(colony)) traitCount++;
      }
    }

    const popsVP = GameEngine._calcPopVP(totalPops);

    // Colony personality traits: +10 VP per active trait
    const traitsVP = traitCount * 10;

    // Alloys stockpiled / 25
    const alloysVP = Math.floor(state.resources.alloys / 25);

    // Total research / 50
    const totalResearch = (state.resources.research.physics || 0)
      + (state.resources.research.society || 0)
      + (state.resources.research.engineering || 0);
    const researchVP = Math.floor(totalResearch / 50);

    // Per-tech VP bonuses: +5 per T1 tech, +10 per T2 tech, +30 per T3 tech
    let techVP = 0;
    for (const techId of (state.completedTechs || [])) {
      const tech = TECH_TREE[techId];
      if (tech) {
        if (tech.tier === 1) techVP += 5;
        else if (tech.tier === 2) techVP += 10;
        else if (tech.tier === 3) techVP += 30;
      }
    }

    // Exploration VP: +1 per 5 systems surveyed
    const surveyedSet = this._surveyedSystems.get(playerId);
    const surveyed = surveyedSet ? surveyedSet.size : 0;
    const surveyedVP = Math.floor(surveyed / 5);

    const vp = popsVP + totalDistricts + alloysVP + researchVP + techVP + traitsVP + surveyedVP;
    const breakdown = {
      vp, pops: totalPops, popsVP,
      districts: totalDistricts, districtsVP: totalDistricts,
      alloys: state.resources.alloys, alloysVP,
      totalResearch, researchVP,
      techs: (state.completedTechs || []).length, techVP,
      traits: traitCount, traitsVP,
      surveyed, surveyedVP,
    };
    this._vpCacheTick = this.tickCount;
    this._vpBreakdownCache.set(playerId, breakdown);
    this._vpCache.set(playerId, vp);
    return breakdown;
  }

  // Calculate victory points for a player (tick-scoped cache: O(N) per broadcast instead of O(N²))
  _calcVictoryPoints(playerId) {
    if (this._vpCacheTick === this.tickCount && this._vpCache.has(playerId)) {
      return this._vpCache.get(playerId);
    }
    return this._calcVPBreakdown(playerId).vp;
  }

  // Process match timer countdown
  _processMatchTimer() {
    if (!this._matchTimerEnabled || this._gameOver) return;

    this._matchTicksRemaining--;

    // 2-minute warning (1200 ticks at 10Hz)
    const twoMinTicks = 2 * 60 * this.tickRate;
    if (!this._warned2min && this._matchTicksRemaining <= twoMinTicks && this._matchTicksRemaining > 0) {
      this._warned2min = true;
      for (const [playerId] of this.playerStates) {
        this._emitEvent('matchWarning', playerId, { secondsRemaining: 120 });
      }
    }

    // 30-second countdown (300 ticks at 10Hz)
    const thirtySec = 30 * this.tickRate;
    if (!this._warned30sec && this._matchTicksRemaining <= thirtySec && this._matchTicksRemaining > 0) {
      this._warned30sec = true;
      for (const [playerId] of this.playerStates) {
        this._emitEvent('finalCountdown', playerId, { secondsRemaining: 30 });
      }
    }

    // Timer expired — game over
    if (this._matchTicksRemaining <= 0) {
      this._matchTicksRemaining = 0;
      this._triggerGameOver();
    }
  }

  // End the game and determine winner
  _triggerGameOver() {
    if (this._gameOver) return;
    this._gameOver = true;

    const scores = [];
    for (const [playerId, state] of this.playerStates) {
      const breakdown = this._calcVPBreakdown(playerId);
      scores.push({
        playerId,
        name: state.name,
        color: state.color,
        vp: breakdown.vp,
        breakdown,
      });
    }

    // Sort by VP descending
    scores.sort((a, b) => b.vp - a.vp);
    const winner = scores.length > 0 ? scores[0] : null;

    const gameOverData = {
      winner: winner ? { playerId: winner.playerId, name: winner.name, vp: winner.vp } : null,
      scores,
      finalTick: this.tickCount,
    };

    if (this.onGameOver) {
      this.onGameOver(gameOverData);
    }

    this.stop();
  }

  // Process research each month — consume accumulated research toward active techs
  _processResearch() {
    for (const [playerId, state] of this.playerStates) {
      if (!state.currentResearch) continue;

      for (const track of ['physics', 'society', 'engineering']) {
        const techId = state.currentResearch[track];
        if (!techId) continue;

        const tech = TECH_TREE[techId];
        if (!tech) continue;

        const available = state.resources.research[track];
        if (available <= 0) continue;

        // Consume research from stockpile toward tech progress
        state.researchProgress[techId] = (state.researchProgress[techId] || 0) + available;
        state.resources.research[track] = 0;

        // Check completion
        if (state.researchProgress[techId] >= tech.cost) {
          state.completedTechs.push(techId);
          state.currentResearch[track] = null;
          delete state.researchProgress[techId];
          this._techModCache.delete(playerId); // invalidate cached modifiers

          // Invalidate production caches for all player colonies (modifiers changed)
          const colonyIds = this._playerColonies.get(playerId) || [];
          for (const cId of colonyIds) {
            const colony = this.colonies.get(cId);
            if (colony) this._invalidateColonyCache(colony);
          }

          const rPlayerName = (this.playerStates.get(playerId) || {}).name || 'Unknown';
          this._emitEvent('researchComplete', playerId, {
            techId,
            techName: tech.name,
            track,
            playerName: rPlayerName,
          }, true);
        }
      }
    }
  }

  start() {
    this.tickInterval = setInterval(() => this.tick(), SPEED_INTERVALS[this._gameSpeed]);
  }

  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  setGameSpeed(speed) {
    const s = Number(speed);
    if (!Number.isFinite(s) || s < 1 || s > 5 || Math.floor(s) !== s) {
      return { error: 'Invalid speed (1-5)' };
    }
    if (s === this._gameSpeed) return { ok: true };
    this._gameSpeed = s;
    // Restart tick interval at new rate
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = setInterval(() => this.tick(), SPEED_INTERVALS[s]);
    }
    this._broadcastSpeedState();
    return { ok: true };
  }

  togglePause() {
    this._paused = !this._paused;
    if (this._paused) {
      if (this.tickInterval) {
        clearInterval(this.tickInterval);
        this.tickInterval = null;
      }
    } else {
      if (!this.tickInterval) {
        this.tickInterval = setInterval(() => this.tick(), SPEED_INTERVALS[this._gameSpeed]);
      }
    }
    this._broadcastSpeedState();
    return { ok: true, paused: this._paused };
  }

  _broadcastSpeedState() {
    this._invalidateStateCache();
    if (this.onSpeedChange) {
      this.onSpeedChange({
        speed: this._gameSpeed,
        speedLabel: SPEED_LABELS[this._gameSpeed],
        paused: this._paused,
      });
    }
  }

  tick() {
    if (this._gameOver) return;

    const t0 = this._profile ? process.hrtime.bigint() : 0n;

    this.tickCount++;

    // Match timer countdown
    if (this._matchTimerEnabled) {
      this._processMatchTimer();
      if (this._gameOver) return; // game ended this tick
    }

    // Process construction every tick
    this._processConstruction();

    // Process colony ship movement every tick
    this._processColonyShipMovement();

    // Process science ship movement and surveying every tick
    this._processScienceShipMovement();

    // Process colony crises every tick
    this._processColonyCrises();

    // Pop growth every tick
    this._processPopGrowth();

    // Scarcity season processing every tick
    this._processScarcitySeason();

    // Monthly processing (every 100 ticks)
    if (this.tickCount % MONTH_TICKS === 0) {
      this._processMonthlyResources();
      this._processEnergyDeficit();
      this._processResearch();
      this._processPopStarvation();
      this._processEdicts();
      this._processInfluenceIncome();
    }

    // Flush events — send per-player event messages
    const events = this._flushEvents();
    if (events && this.onEvent) {
      this.onEvent(events);
    }

    // Throttled broadcast — send state at ~3.3Hz instead of every tick.
    // Dirty set accumulates between broadcasts so no updates are lost.
    if (this.onTick && this._dirtyPlayers.size > 0 && this.tickCount % BROADCAST_EVERY === 0) {
      for (const playerId of this._dirtyPlayers) {
        this.onTick(playerId, this.getPlayerStateJSON(playerId));
      }
      this._dirtyPlayers.clear();
    }

    // Record tick timing
    if (this._profile) {
      const durationMs = Number(process.hrtime.bigint() - t0) / 1e6;
      this._tickTimings[this._tickTimingsIdx % this._tickTimingsMax] = durationMs;
      this._tickTimingsIdx++;
    }
  }

  // Get tick profiling stats (available when profile=true)
  getTickStats() {
    const n = Math.min(this._tickTimingsIdx, this._tickTimingsMax);
    if (n === 0) return { avg: 0, max: 0, count: 0 };
    let sum = 0, max = 0;
    for (let i = 0; i < n; i++) {
      const v = this._tickTimings[i];
      sum += v;
      if (v > max) max = v;
    }
    return { avg: sum / n, max, count: n, budgetPct: ((sum / n) / (1000 / this.tickRate)) * 100 };
  }

  handleCommand(playerId, cmd) {
    if (this._gameOver) return { error: 'Game is over' };
    switch (cmd.type) {
      case 'buildDistrict': {
        const { colonyId, districtType } = cmd;
        if (!colonyId || !districtType) return { error: 'Missing parameters' };
        const colony = this.colonies.get(colonyId);
        if (!colony) return { error: 'Colony not found' };
        if (colony.ownerId !== playerId) return { error: 'Not your colony' };

        const def = DISTRICT_DEFS[districtType];
        if (!def) return { error: 'Invalid district type' };

        // Check max districts
        if (this._totalDistricts(colony) >= colony.planet.size) {
          return { error: 'No district slots available' };
        }

        // Check build queue limit
        if (colony.buildQueue.length >= 3) {
          return { error: 'Build queue full (max 3)' };
        }

        // Check resource cost
        const state = this.playerStates.get(playerId);
        for (const [resource, amount] of Object.entries(def.cost)) {
          if (!Number.isFinite(state.resources[resource]) || state.resources[resource] < amount) {
            return { error: `Not enough ${resource}` };
          }
        }

        // Deduct resources
        for (const [resource, amount] of Object.entries(def.cost)) {
          state.resources[resource] -= amount;
        }

        // Determine build time — first 3 player-built districts on non-starting colonies build at 50% time
        let buildTime = def.buildTime;
        if (!colony.isStartingColony && colony.playerBuiltDistricts < 3) {
          buildTime = Math.floor(buildTime * 0.5);
        }

        colony.playerBuiltDistricts++;
        const id = this._nextId();
        colony.buildQueue.push({ id, type: districtType, ticksRemaining: buildTime });
        this._dirtyPlayers.add(playerId);
        this._invalidateStateCache();
        return { ok: true, id };
      }

      case 'demolish': {
        const { colonyId, districtId } = cmd;
        if (!colonyId || !districtId) return { error: 'Missing parameters' };
        const colony = this.colonies.get(colonyId);
        if (!colony) return { error: 'Colony not found' };
        if (colony.ownerId !== playerId) return { error: 'Not your colony' };

        // Check built districts first
        const idx = colony.districts.findIndex(d => d.id === districtId);
        if (idx !== -1) {
          const traitBefore = this._calcColonyTrait(colony);
          colony.districts.splice(idx, 1);
          this._invalidateColonyCache(colony);
          // If trait changed/lost, invalidate all sibling colonies' production caches
          const traitAfter = this._calcColonyTrait(colony);
          if ((traitBefore && !traitAfter) || (traitBefore && traitAfter && traitBefore.type !== traitAfter.type)) {
            this._invalidatePlayerProductionCaches(colony.ownerId);
          }
          return { ok: true };
        }

        // Check build queue — cancel with 50% resource refund
        const qIdx = colony.buildQueue.findIndex(q => q.id === districtId);
        if (qIdx !== -1) {
          const qItem = colony.buildQueue[qIdx];
          const costTable = qItem.type === 'colonyShip' ? COLONY_SHIP_COST : qItem.type === 'scienceShip' ? SCIENCE_SHIP_COST : (DISTRICT_DEFS[qItem.type] || {}).cost;
          if (costTable) {
            const player = this.playerStates.get(playerId);
            for (const [resource, amount] of Object.entries(costTable)) {
              player.resources[resource] += Math.floor(amount / 2);
            }
          }
          colony.buildQueue.splice(qIdx, 1);
          this._dirtyPlayers.add(playerId);
          this._invalidateStateCache();
          return { ok: true };
        }

        return { error: 'District not found' };
      }

      case 'buildColonyShip': {
        const { colonyId } = cmd;
        if (!colonyId) return { error: 'Missing colonyId' };
        const colony = this.colonies.get(colonyId);
        if (!colony) return { error: 'Colony not found' };
        if (colony.ownerId !== playerId) return { error: 'Not your colony' };

        // Check colony cap
        const playerColonyCount = (this._playerColonies.get(playerId) || []).length;
        const inFlightShips = this._colonyShips.filter(s => s.ownerId === playerId).length;
        if (playerColonyCount + inFlightShips >= MAX_COLONIES) {
          return { error: `Colony cap reached (max ${MAX_COLONIES})` };
        }

        // Check build queue
        if (colony.buildQueue.length >= 3) {
          return { error: 'Build queue full (max 3)' };
        }

        // Check resources
        const state = this.playerStates.get(playerId);
        for (const [resource, amount] of Object.entries(COLONY_SHIP_COST)) {
          if (!Number.isFinite(state.resources[resource]) || state.resources[resource] < amount) {
            return { error: `Not enough ${resource}` };
          }
        }

        // Deduct resources
        for (const [resource, amount] of Object.entries(COLONY_SHIP_COST)) {
          state.resources[resource] -= amount;
        }

        const id = this._nextId();
        colony.buildQueue.push({ id, type: 'colonyShip', ticksRemaining: COLONY_SHIP_BUILD_TIME });
        this._dirtyPlayers.add(playerId);
        this._invalidateStateCache();
        return { ok: true, id };
      }

      case 'sendColonyShip': {
        const { shipId, targetSystemId } = cmd;
        if (!shipId) return { error: 'Missing shipId' };
        if (targetSystemId == null || !Number.isFinite(Number(targetSystemId))) return { error: 'Missing targetSystemId' };

        const targetSysId = Number(targetSystemId);
        const ship = this._colonyShips.find(s => s.id === shipId && s.ownerId === playerId);
        if (!ship) return { error: 'Colony ship not found' };
        if (ship.path && ship.path.length > 0) return { error: 'Ship already in transit' };

        // Validate target system exists
        if (!this.galaxy || !this.galaxy.systems[targetSysId]) {
          return { error: 'Invalid target system' };
        }

        // Check target has a habitable planet
        const targetSystem = this.galaxy.systems[targetSysId];
        const targetPlanet = bestHabitablePlanet(targetSystem);
        if (!targetPlanet) return { error: 'No habitable planet in target system' };
        if (targetPlanet.habitability < 20) return { error: 'Planet habitability too low' };
        if (targetPlanet.colonized) return { error: 'Planet already colonized' };

        // Check colony cap (including in-flight ships)
        const colCount = (this._playerColonies.get(playerId) || []).length;
        const flyingShips = this._colonyShips.filter(s => s.ownerId === playerId && s.id !== shipId && s.path && s.path.length > 0).length;
        if (colCount + flyingShips + 1 > MAX_COLONIES) {
          return { error: `Colony cap reached (max ${MAX_COLONIES})` };
        }

        // Find path via BFS
        const path = this._findPath(ship.systemId, targetSysId);
        if (!path) return { error: 'No path to target system' };

        ship.targetSystemId = targetSysId;
        ship.path = path;
        ship.hopProgress = 0;
        this._dirtyPlayers.add(playerId);
        this._invalidateStateCache();
        return { ok: true };
      }

      case 'buildScienceShip': {
        const { colonyId } = cmd;
        if (!colonyId) return { error: 'Missing colonyId' };
        const colony = this.colonies.get(colonyId);
        if (!colony) return { error: 'Colony not found' };
        if (colony.ownerId !== playerId) return { error: 'Not your colony' };

        // Check science ship cap
        const ownedScienceShips = this._scienceShips.filter(s => s.ownerId === playerId).length;
        const buildingShips = [];
        for (const [, c] of this.colonies) {
          if (c.ownerId === playerId) {
            for (const q of c.buildQueue) {
              if (q.type === 'scienceShip') buildingShips.push(q);
            }
          }
        }
        if (ownedScienceShips + buildingShips.length >= MAX_SCIENCE_SHIPS) {
          return { error: `Science ship cap reached (max ${MAX_SCIENCE_SHIPS})` };
        }

        // Check build queue
        if (colony.buildQueue.length >= 3) {
          return { error: 'Build queue full (max 3)' };
        }

        // Check resources
        const sciState = this.playerStates.get(playerId);
        for (const [resource, amount] of Object.entries(SCIENCE_SHIP_COST)) {
          if (!Number.isFinite(sciState.resources[resource]) || sciState.resources[resource] < amount) {
            return { error: `Not enough ${resource}` };
          }
        }

        // Deduct resources
        for (const [resource, amount] of Object.entries(SCIENCE_SHIP_COST)) {
          sciState.resources[resource] -= amount;
        }

        const sciId = this._nextId();
        colony.buildQueue.push({ id: sciId, type: 'scienceShip', ticksRemaining: SCIENCE_SHIP_BUILD_TIME });
        this._dirtyPlayers.add(playerId);
        this._invalidateStateCache();
        return { ok: true, id: sciId };
      }

      case 'sendScienceShip': {
        const { shipId, targetSystemId } = cmd;
        if (!shipId) return { error: 'Missing shipId' };
        if (targetSystemId == null || !Number.isFinite(Number(targetSystemId))) return { error: 'Missing targetSystemId' };

        const targetSysId = Number(targetSystemId);
        const ship = this._scienceShips.find(s => s.id === shipId && s.ownerId === playerId);
        if (!ship) return { error: 'Science ship not found' };
        if (ship.path && ship.path.length > 0) return { error: 'Ship already in transit' };
        if (ship.surveying) return { error: 'Ship is currently surveying' };

        // Validate target system exists
        if (!this.galaxy || !this.galaxy.systems[targetSysId]) {
          return { error: 'Invalid target system' };
        }

        // Check if already surveyed by this player
        const surveyed = this._surveyedSystems.get(playerId);
        if (surveyed && surveyed.has(targetSysId)) {
          return { error: 'System already surveyed' };
        }

        // Find path via BFS
        const path = this._findPath(ship.systemId, targetSysId);
        if (!path) return { error: 'No path to target system' };

        ship.targetSystemId = targetSysId;
        ship.path = path;
        ship.hopProgress = 0;
        this._dirtyPlayers.add(playerId);
        this._invalidateStateCache();
        return { ok: true };
      }

      case 'setResearch': {
        const { techId } = cmd;
        if (!techId) return { error: 'Missing techId' };
        if (typeof techId !== 'string') return { error: 'Invalid techId' };

        const tech = TECH_TREE[techId];
        if (!tech) return { error: 'Unknown technology' };

        const state = this.playerStates.get(playerId);
        if (!state) return { error: 'Player not found' };

        // Check if already completed
        if (state.completedTechs.includes(techId)) {
          return { error: 'Technology already researched' };
        }

        // Check prerequisites
        if (tech.requires && !state.completedTechs.includes(tech.requires)) {
          return { error: 'Prerequisite not met' };
        }

        // Check not already researching this tech
        if (state.currentResearch[tech.track] === techId) {
          return { error: 'Already researching this technology' };
        }

        // Set research — replaces any current research in this track (progress preserved)
        state.currentResearch[tech.track] = techId;
        this._dirtyPlayers.add(playerId);
        this._invalidateStateCache();
        return { ok: true };
      }

      case 'resolveCrisis': {
        const { colonyId, choiceId } = cmd;
        if (!colonyId || !choiceId) return { error: 'Missing parameters' };
        return this.resolveCrisis(playerId, colonyId, choiceId);
      }

      case 'activateEdict': {
        const { edictType } = cmd;
        if (!edictType || typeof edictType !== 'string') return { error: 'Missing edictType' };

        const edictDef = EDICT_DEFS[edictType];
        if (!edictDef) return { error: 'Unknown edict type' };

        const state = this.playerStates.get(playerId);
        if (!state) return { error: 'Player not found' };

        // Only one active edict at a time
        if (state.activeEdict) return { error: 'An edict is already active' };

        // Check influence cost
        if (!Number.isFinite(state.resources.influence) || state.resources.influence < edictDef.cost) {
          return { error: 'Not enough influence' };
        }

        // Deduct influence
        state.resources.influence -= edictDef.cost;

        if (edictDef.duration === 0) {
          // Instant edict (Emergency Reserves) — apply grants immediately
          for (const [resource, amount] of Object.entries(edictDef.effect.grants)) {
            state.resources[resource] = (state.resources[resource] || 0) + amount;
          }
          this._emitEvent('edictActivated', playerId, {
            edictType,
            edictName: edictDef.name,
            instant: true,
          });
        } else {
          // Duration edict — set active
          state.activeEdict = { type: edictType, monthsRemaining: edictDef.duration };
          // Invalidate production caches since edict modifiers affect production
          this._invalidatePlayerProductionCaches(playerId);
          this._emitEvent('edictActivated', playerId, {
            edictType,
            edictName: edictDef.name,
            duration: edictDef.duration,
          });
        }

        this._dirtyPlayers.add(playerId);
        this._invalidateStateCache();
        return { ok: true };
      }

      default:
        return { error: 'Unknown command' };
    }
  }

  // Summary stats for scoreboard: colony count, total pops, net income (tick-scoped cache)
  _getPlayerSummary(playerId) {
    if (this._summaryCacheTick === this.tickCount) {
      const cached = this._summaryCache.get(playerId);
      if (cached) return cached;
    } else {
      this._summaryCacheTick = this.tickCount;
      this._summaryCache.clear();
    }

    const colonyIds = this._playerColonies.get(playerId) || [];
    let totalPops = 0;
    const income = { energy: 0, minerals: 0, food: 0, alloys: 0 };
    let traitCount = 0;
    for (const colonyId of colonyIds) {
      const colony = this.colonies.get(colonyId);
      if (!colony) continue;
      totalPops += colony.pops;
      const { production, consumption } = this._calcProduction(colony);
      income.energy += production.energy - consumption.energy;
      income.minerals += production.minerals - consumption.minerals;
      income.food += production.food - consumption.food;
      income.alloys += production.alloys - consumption.alloys;
      if (this._calcColonyTrait(colony)) traitCount++;
    }
    income.influence = colonyIds.length * INFLUENCE_BASE_INCOME + traitCount * INFLUENCE_TRAIT_INCOME;
    const summary = { colonyCount: colonyIds.length, totalPops, income };
    this._summaryCache.set(playerId, summary);
    return summary;
  }

  getState() {
    if (this._cachedState) return this._cachedState;
    const playersArr = [];
    for (const p of this.playerStates.values()) {
      playersArr.push({
        id: p.id, name: p.name, color: p.color, resources: p.resources,
        currentResearch: p.currentResearch, researchProgress: p.researchProgress,
        completedTechs: p.completedTechs,
        vp: this._calcVictoryPoints(p.id),
      });
    }
    const coloniesArr = [];
    for (const c of this.colonies.values()) {
      coloniesArr.push(this._serializeColony(c));
    }
    const state = { tick: this.tickCount, players: playersArr, colonies: coloniesArr };
    // Include all colony ships
    state.colonyShips = this._colonyShips.map(s => ({
      id: s.id, ownerId: s.ownerId, systemId: s.systemId,
      targetSystemId: s.targetSystemId,
      path: s.path || [],
      hopProgress: s.hopProgress,
    }));
    state.scienceShips = this._scienceShips.map(s => ({
      id: s.id, ownerId: s.ownerId, systemId: s.systemId,
      targetSystemId: s.targetSystemId,
      path: s.path || [],
      hopProgress: s.hopProgress,
      surveying: s.surveying || false,
      surveyProgress: s.surveyProgress || 0,
    }));
    // Surveyed systems per player
    state.surveyedSystems = {};
    for (const [pid, sysSet] of this._surveyedSystems) {
      state.surveyedSystems[pid] = [...sysSet];
    }
    if (this._matchTimerEnabled) {
      state.matchTicksRemaining = this._matchTicksRemaining;
      state.matchTimerEnabled = true;
    }
    state.gameSpeed = this._gameSpeed;
    state.paused = this._paused;
    if (this._activeScarcity) {
      state.activeScarcity = { resource: this._activeScarcity.resource, ticksRemaining: this._activeScarcity.ticksRemaining };
    }
    this._cachedState = state;
    return state;
  }

  // Pre-stringified gameState payload for broadcast — no intermediate object
  getStateJSON() {
    if (this._cachedStateJSON) return this._cachedStateJSON;
    const state = this.getState();
    state.type = 'gameState';
    this._cachedStateJSON = JSON.stringify(state);
    return this._cachedStateJSON;
  }

  // Per-player state: only this player's resources and colonies + minimal other-player summary
  getPlayerState(playerId) {
    const player = this.playerStates.get(playerId);
    if (!player) return this.getState(); // fallback

    // Own resources + research state + VP + summary
    const mySummary = this._getPlayerSummary(playerId);
    const me = {
      id: player.id, name: player.name, color: player.color, resources: player.resources,
      currentResearch: player.currentResearch, researchProgress: player.researchProgress,
      completedTechs: player.completedTechs,
      activeEdict: player.activeEdict,
      vp: this._calcVictoryPoints(playerId),
      ...mySummary,
    };

    // Other players: name/color + VP for scoreboard (no resources)
    const others = [];
    for (const p of this.playerStates.values()) {
      if (p.id === playerId) continue;
      const summary = this._getPlayerSummary(p.id);
      others.push({ id: p.id, name: p.name, color: p.color, vp: this._calcVictoryPoints(p.id), ...summary });
    }

    // Own colonies (full detail)
    const myColonyIds = this._playerColonies.get(playerId) || [];
    const coloniesArr = [];
    for (const colonyId of myColonyIds) {
      const c = this.colonies.get(colonyId);
      if (!c) continue;
      coloniesArr.push(this._serializeColony(c));
    }

    const state = { tick: this.tickCount, players: [me, ...others], colonies: coloniesArr };

    // Include colony ships (own + visible others)
    state.colonyShips = this._colonyShips.map(s => ({
      id: s.id, ownerId: s.ownerId, systemId: s.systemId,
      targetSystemId: s.targetSystemId,
      path: s.path || [],
      hopProgress: s.hopProgress,
    }));

    // Include science ships
    state.scienceShips = this._scienceShips.map(s => ({
      id: s.id, ownerId: s.ownerId, systemId: s.systemId,
      targetSystemId: s.targetSystemId,
      path: s.path || [],
      hopProgress: s.hopProgress,
      surveying: s.surveying || false,
      surveyProgress: s.surveyProgress || 0,
    }));
    // Surveyed systems — only this player's surveyed set (privacy: don't leak others')
    state.surveyedSystems = {};
    const mySurveyed = this._surveyedSystems.get(playerId);
    if (mySurveyed) {
      state.surveyedSystems[playerId] = [...mySurveyed];
    }

    // Include match timer info
    if (this._matchTimerEnabled) {
      state.matchTicksRemaining = this._matchTicksRemaining;
      state.matchTimerEnabled = true;
    }
    state.gameSpeed = this._gameSpeed;
    state.paused = this._paused;
    if (this._activeScarcity) {
      state.activeScarcity = { resource: this._activeScarcity.resource, ticksRemaining: this._activeScarcity.ticksRemaining };
    }

    return state;
  }

  // Pre-stringified per-player gameState payload
  getPlayerStateJSON(playerId) {
    const cached = this._cachedPlayerJSON.get(playerId);
    if (cached) return cached;
    const state = this.getPlayerState(playerId);
    state.type = 'gameState';
    const json = JSON.stringify(state);
    this._cachedPlayerJSON.set(playerId, json);
    return json;
  }

  // Serialize a single colony (shared by getState and getPlayerState)
  _serializeColony(c) {
    const { production, consumption } = this._calcProduction(c);
    const queueArr = [];
    for (const q of c.buildQueue) {
      queueArr.push({ id: q.id, type: q.type, ticksRemaining: q.ticksRemaining });
    }
    const housing = this._calcHousing(c);
    const foodSurplus = production.food - (consumption.food || 0);
    let growthTarget = 0;
    let growthStatus = 'none';
    if (foodSurplus <= 0) {
      growthStatus = foodSurplus < 0 ? 'starving' : 'stalled';
    } else if (c.pops >= housing) {
      growthStatus = 'housing_full';
    } else {
      if (foodSurplus > 10) growthTarget = GROWTH_FASTEST_TICKS;
      else if (foodSurplus > 5) growthTarget = GROWTH_FAST_TICKS;
      else growthTarget = GROWTH_BASE_TICKS;
      if (foodSurplus > 10) growthStatus = 'rapid';
      else if (foodSurplus > 5) growthStatus = 'fast';
      else growthStatus = 'slow';
    }
    const trait = this._calcColonyTrait(c);
    // Serialize crisis state for client (if active)
    let crisisData = null;
    if (c.crisisState) {
      const crisisDef = CRISIS_TYPES[c.crisisState.type];
      crisisData = {
        type: c.crisisState.type,
        label: crisisDef ? crisisDef.label : c.crisisState.type,
        description: crisisDef ? crisisDef.description : '',
        choices: crisisDef && !c.crisisState.resolved ? crisisDef.choices : [],
        ticksRemaining: c.crisisState.ticksRemaining,
        resolved: c.crisisState.resolved,
        quarantineTicks: c.crisisState.quarantineTicks || 0,
        strikeTicks: c.crisisState.strikeTicks || 0,
        energyBoostTicks: c.crisisState.energyBoostTicks || 0,
        shutdownTicks: c.crisisState.shutdownTicks || 0,
      };
    }
    return {
      id: c.id, ownerId: c.ownerId, name: c.name, systemId: c.systemId, planet: c.planet,
      isStartingColony: c.isStartingColony, playerBuiltDistricts: c.playerBuiltDistricts,
      districts: c.districts, buildQueue: queueArr,
      pops: c.pops, housing, jobs: this._calcJobs(c),
      growthProgress: c.growthProgress, growthTarget, growthStatus,
      trait: trait ? { type: trait.type, name: trait.name } : null,
      crisis: crisisData,
      netProduction: {
        energy: production.energy - (consumption.energy || 0),
        minerals: production.minerals - (consumption.minerals || 0),
        food: foodSurplus,
        alloys: production.alloys - (consumption.alloys || 0),
        physics: production.physics, society: production.society, engineering: production.engineering,
      },
    };
  }

  getInitState() {
    const state = this.getState();
    // Include full galaxy data on init (systems, hyperlanes) — sent once
    if (this.galaxy) {
      state.galaxy = {
        seed: this.galaxy.seed,
        size: this.galaxy.size,
        systems: this.galaxy.systems.map(s => ({
          id: s.id,
          name: s.name,
          x: s.x, y: s.y, z: s.z,
          starType: s.starType,
          starColor: s.starColor,
          planets: s.planets,
          owner: s.owner,
        })),
        hyperlanes: this.galaxy.hyperlanes,
      };
    }
    return state;
  }
}

module.exports = { GameEngine, DISTRICT_DEFS, PLANET_TYPES, PLANET_BONUSES, COLONY_TRAITS, EDICT_DEFS, MONTH_TICKS, BROADCAST_EVERY, TECH_TREE, GROWTH_BASE_TICKS, GROWTH_FAST_TICKS, GROWTH_FASTEST_TICKS, PLAYER_COLORS, SPEED_INTERVALS, SPEED_LABELS, DEFAULT_SPEED, COLONY_SHIP_COST, COLONY_SHIP_BUILD_TIME, COLONY_SHIP_HOP_TICKS, MAX_COLONIES, COLONY_SHIP_STARTING_POPS, SCIENCE_SHIP_COST, SCIENCE_SHIP_BUILD_TIME, SCIENCE_SHIP_HOP_TICKS, MAX_SCIENCE_SHIPS, SURVEY_TICKS, ANOMALY_CHANCE, ANOMALY_TYPES, CRISIS_TYPES, CRISIS_MIN_TICKS, CRISIS_MAX_TICKS, CRISIS_CHOICE_TICKS, CRISIS_IMMUNITY_TICKS, INFLUENCE_BASE_INCOME, INFLUENCE_TRAIT_INCOME, INFLUENCE_CAP, SCARCITY_RESOURCES, SCARCITY_MIN_INTERVAL, SCARCITY_MAX_INTERVAL, SCARCITY_DURATION, SCARCITY_WARNING_TICKS, SCARCITY_MULTIPLIER, generateGalaxy, assignStartingSystems };
