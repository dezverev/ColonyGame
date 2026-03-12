const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1'];

// District definitions: type -> { produces, consumes, cost, buildTime }
// Production/consumption is per "month" (every 100 ticks = 10 seconds)
const DISTRICT_DEFS = {
  housing:     { produces: {}, consumes: { energy: 1 }, housing: 5, jobs: 0, cost: { minerals: 100 }, buildTime: 200 },
  generator:   { produces: { energy: 6 }, consumes: {}, housing: 0, jobs: 1, cost: { minerals: 100 }, buildTime: 300 },
  mining:      { produces: { minerals: 6 }, consumes: {}, housing: 0, jobs: 1, cost: { minerals: 100 }, buildTime: 300 },
  agriculture: { produces: { food: 6 }, consumes: {}, housing: 0, jobs: 1, cost: { minerals: 100 }, buildTime: 300 },
  industrial:  { produces: { alloys: 3 }, consumes: { energy: 3 }, housing: 0, jobs: 1, cost: { minerals: 200 }, buildTime: 400 },
  research:    { produces: { physics: 3, society: 3, engineering: 3 }, consumes: { energy: 4 }, housing: 0, jobs: 1, cost: { minerals: 200, energy: 20 }, buildTime: 400 },
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

const MONTH_TICKS = 100; // 1 "month" = 100 ticks = 10 seconds at 10Hz
const BROADCAST_EVERY = 3; // broadcast state every N ticks (~3.3Hz at 10Hz tick rate)

// Mini tech tree: 2 tiers × 3 tracks — research costs tuned for 20-minute matches
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
    this.onTick = options.onTick || null;
    this.onEvent = options.onEvent || null;
    this.onGameOver = options.onGameOver || null;
    this._dirtyPlayers = new Set(); // per-player dirty tracking
    this._cachedState = null; // cached serialized state
    this._cachedStateJSON = null; // cached JSON string for broadcast
    this._pendingEvents = []; // events to flush with next broadcast
    this._vpCache = new Map(); // playerId -> VP, cleared on invalidation
    this._vpCacheTick = -1;   // tick when VP cache was last computed
    this._gameOver = false; // true after game ends

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

    this._initPlayerStates();
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
      });
    }
  }

  _initStartingColonies() {
    for (const [playerId] of this.playerStates) {
      const colony = this._createColony(playerId, `Colony ${playerId}`, {
        size: 16,
        type: 'continental',
        habitability: 80,
      });
      // Start with 4 pre-built districts (instant, no construction time)
      this._addBuiltDistrict(colony, 'generator');
      this._addBuiltDistrict(colony, 'mining');
      this._addBuiltDistrict(colony, 'agriculture');
      this._addBuiltDistrict(colony, 'agriculture');
    }
  }

  _createColony(ownerId, name, planet) {
    const id = this._nextId();
    const colony = {
      id,
      ownerId,
      name,
      planet: {
        size: planet.size,         // max districts
        type: planet.type,
        habitability: planet.habitability,
      },
      districts: [],               // built districts: { id, type }
      buildQueue: [],              // { id, type, ticksRemaining }
      pops: 8,                     // starting population
      growthProgress: 0,           // ticks accumulated toward next pop
      _cachedHousing: null,        // cached derived values
      _cachedJobs: null,
      _cachedProduction: null,
    };
    this.colonies.set(id, colony);
    // Maintain player -> colonies index
    if (!this._playerColonies.has(ownerId)) {
      this._playerColonies.set(ownerId, []);
    }
    this._playerColonies.get(ownerId).push(id);
    this._dirtyPlayers.add(ownerId);
    this._cachedState = null;
    this._cachedStateJSON = null;
    return colony;
  }

  _addBuiltDistrict(colony, type) {
    const id = this._nextId();
    colony.districts.push({ id, type });
    this._invalidateColonyCache(colony);
    return id;
  }

  _emitEvent(eventType, playerId, details) {
    this._pendingEvents.push({ eventType, playerId, ...details });
  }

  _flushEvents() {
    if (this._pendingEvents.length === 0) return null;
    const events = this._pendingEvents;
    this._pendingEvents = [];
    return events;
  }

  _invalidateColonyCache(colony) {
    colony._cachedHousing = null;
    colony._cachedJobs = null;
    colony._cachedProduction = null;
    this._dirtyPlayers.add(colony.ownerId);
    this._cachedState = null;
    this._cachedStateJSON = null;
    this._vpCacheTick = -1; // VP depends on colonies — invalidate
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
    let jobs = 0;
    for (const d of colony.districts) {
      if (d.disabled) continue; // disabled districts provide no jobs
      const def = DISTRICT_DEFS[d.type];
      if (def) jobs += def.jobs;
    }
    colony._cachedJobs = jobs;
    return jobs;
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

    // Assign pops to districts in order — each working district needs 1 pop
    let assignedPops = 0;
    for (const d of colony.districts) {
      const def = DISTRICT_DEFS[d.type];
      if (!def) continue;

      // Disabled districts produce nothing, consume nothing, provide no jobs
      if (d.disabled) continue;

      // Jobless districts (e.g., housing) still consume resources
      if (def.jobs === 0) {
        for (const [resource, amount] of Object.entries(def.consumes)) {
          consumption[resource] = (consumption[resource] || 0) + amount;
        }
        continue;
      }

      if (assignedPops >= workingPops) break;
      assignedPops++;

      const districtMod = techMods.district[d.type] || 1;
      for (const [resource, amount] of Object.entries(def.produces)) {
        production[resource] = (production[resource] || 0) + (amount * districtMod);
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
    this._cachedState = null;
    this._cachedStateJSON = null;
    this._vpCacheTick = -1; // resources changed — VP depends on alloys/research
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
        this._addBuiltDistrict(colony, item.type);
        this._emitEvent('constructionComplete', colony.ownerId, {
          colonyId: colony.id,
          colonyName: colony.name,
          districtType: item.type,
        });
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

      colony.growthProgress++;
      // Mark owner dirty — growth progress changed, client needs updated progress bar
      this._dirtyPlayers.add(colony.ownerId);
      if (colony.growthProgress >= growthTarget) {
        colony.pops++;
        colony.growthProgress = 0;
        this._invalidateColonyCache(colony); // production depends on pops

        // Pop milestone: fire on multiples of 5
        if (colony.pops % 5 === 0) {
          this._emitEvent('popMilestone', colony.ownerId, {
            colonyId: colony.id,
            colonyName: colony.name,
            pops: colony.pops,
          });
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

        for (const c of disabled) {
          // Calculate net monthly energy balance across all colonies if we re-enable this district
          const netChange = c.energyProd - c.energyCost;
          // Check: would re-enabling keep us non-negative next month?
          // Use current net energy production as baseline
          const currentNetEnergy = this._calcPlayerNetEnergy(playerId);
          if (currentNetEnergy + netChange >= 0) {
            delete c.district.disabled;
            this._invalidateColonyCache(c.colony);
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

  // Get district output multipliers from completed techs
  _getTechModifiers(playerState) {
    const modifiers = {}; // districtType -> multiplier
    let growthMultiplier = 1;

    if (!playerState || !playerState.completedTechs) return { district: modifiers, growth: growthMultiplier };

    for (const techId of playerState.completedTechs) {
      const tech = TECH_TREE[techId];
      if (!tech) continue;

      if (tech.effect.type === 'districtBonus') {
        const current = modifiers[tech.effect.district] || 1;
        // Use the highest multiplier (T2 supersedes T1 for same district)
        if (tech.effect.multiplier > current) {
          modifiers[tech.effect.district] = tech.effect.multiplier;
        }
      } else if (tech.effect.type === 'growthBonus') {
        // Stack growth bonuses multiplicatively
        growthMultiplier *= tech.effect.multiplier;
      }
    }

    return { district: modifiers, growth: growthMultiplier };
  }

  // Calculate victory points for a player (tick-scoped cache: O(N) per broadcast instead of O(N²))
  _calcVictoryPoints(playerId) {
    // Return cached value if computed this tick
    if (this._vpCacheTick === this.tickCount && this._vpCache.has(playerId)) {
      return this._vpCache.get(playerId);
    }

    const state = this.playerStates.get(playerId);
    if (!state) return 0;

    // Pops × 2
    let totalPops = 0;
    const colonyIds = this._playerColonies.get(playerId) || [];
    for (const colonyId of colonyIds) {
      const colony = this.colonies.get(colonyId);
      if (colony) totalPops += colony.pops;
    }

    // Districts × 1
    let totalDistricts = 0;
    for (const colonyId of colonyIds) {
      const colony = this.colonies.get(colonyId);
      if (colony) totalDistricts += colony.districts.length;
    }

    // Alloys stockpiled / 50
    const alloysVP = Math.floor(state.resources.alloys / 50);

    // Total research / 100
    const totalResearch = (state.resources.research.physics || 0)
      + (state.resources.research.society || 0)
      + (state.resources.research.engineering || 0);
    const researchVP = Math.floor(totalResearch / 100);

    const vp = (totalPops * 2) + totalDistricts + alloysVP + researchVP;
    this._vpCacheTick = this.tickCount;
    this._vpCache.set(playerId, vp);
    return vp;
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
      const colonyIds = this._playerColonies.get(playerId) || [];
      let totalPops = 0, totalDistricts = 0;
      for (const cId of colonyIds) {
        const c = this.colonies.get(cId);
        if (c) { totalPops += c.pops; totalDistricts += c.districts.length; }
      }
      const vp = this._calcVictoryPoints(playerId);
      scores.push({
        playerId,
        name: state.name,
        color: state.color,
        vp,
        breakdown: {
          pops: totalPops,
          popsVP: totalPops * 2,
          districts: totalDistricts,
          districtsVP: totalDistricts,
          alloys: state.resources.alloys,
          alloysVP: Math.floor(state.resources.alloys / 50),
          totalResearch: (state.resources.research.physics || 0) + (state.resources.research.society || 0) + (state.resources.research.engineering || 0),
          researchVP: Math.floor(((state.resources.research.physics || 0) + (state.resources.research.society || 0) + (state.resources.research.engineering || 0)) / 100),
        },
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

          // Invalidate production caches for all player colonies (modifiers changed)
          const colonyIds = this._playerColonies.get(playerId) || [];
          for (const cId of colonyIds) {
            const colony = this.colonies.get(cId);
            if (colony) this._invalidateColonyCache(colony);
          }

          this._emitEvent('researchComplete', playerId, {
            techId,
            techName: tech.name,
            track,
          });
        }
      }
    }
  }

  start() {
    this.tickInterval = setInterval(() => this.tick(), 1000 / this.tickRate);
  }

  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
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

    // Pop growth every tick
    this._processPopGrowth();

    // Monthly processing (every 100 ticks)
    if (this.tickCount % MONTH_TICKS === 0) {
      this._processMonthlyResources();
      this._processEnergyDeficit();
      this._processResearch();
      this._processPopStarvation();
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

        // Determine build time — first 3 districts build at 50% time
        let buildTime = def.buildTime;
        if (colony.districts.length + colony.buildQueue.length < 3) {
          buildTime = Math.floor(buildTime * 0.5);
        }

        const id = this._nextId();
        colony.buildQueue.push({ id, type: districtType, ticksRemaining: buildTime });
        this._dirtyPlayers.add(playerId);
        this._cachedState = null;
        this._cachedStateJSON = null;
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
          colony.districts.splice(idx, 1);
          this._invalidateColonyCache(colony);
          return { ok: true };
        }

        // Check build queue — cancel with 50% resource refund
        const qIdx = colony.buildQueue.findIndex(q => q.id === districtId);
        if (qIdx !== -1) {
          const qItem = colony.buildQueue[qIdx];
          const def = DISTRICT_DEFS[qItem.type];
          if (def) {
            const player = this.playerStates.get(playerId);
            for (const [resource, amount] of Object.entries(def.cost)) {
              player.resources[resource] += Math.floor(amount / 2);
            }
          }
          colony.buildQueue.splice(qIdx, 1);
          this._dirtyPlayers.add(playerId);
          this._cachedState = null;
          this._cachedStateJSON = null;
          return { ok: true };
        }

        return { error: 'District not found' };
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
        this._cachedState = null;
        this._cachedStateJSON = null;
        return { ok: true };
      }

      default:
        return { error: 'Unknown command' };
    }
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
    if (this._matchTimerEnabled) {
      state.matchTicksRemaining = this._matchTicksRemaining;
      state.matchTimerEnabled = true;
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

    // Own resources + research state + VP
    const me = {
      id: player.id, name: player.name, color: player.color, resources: player.resources,
      currentResearch: player.currentResearch, researchProgress: player.researchProgress,
      completedTechs: player.completedTechs,
      vp: this._calcVictoryPoints(playerId),
    };

    // Other players: name/color + VP for scoreboard (no resources)
    const others = [];
    for (const p of this.playerStates.values()) {
      if (p.id === playerId) continue;
      others.push({ id: p.id, name: p.name, color: p.color, vp: this._calcVictoryPoints(p.id) });
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

    // Include match timer info
    if (this._matchTimerEnabled) {
      state.matchTicksRemaining = this._matchTicksRemaining;
      state.matchTimerEnabled = true;
    }

    return state;
  }

  // Pre-stringified per-player gameState payload
  getPlayerStateJSON(playerId) {
    const state = this.getPlayerState(playerId);
    state.type = 'gameState';
    return JSON.stringify(state);
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
    return {
      id: c.id, ownerId: c.ownerId, name: c.name, planet: c.planet,
      districts: c.districts, buildQueue: queueArr,
      pops: c.pops, housing, jobs: this._calcJobs(c),
      growthProgress: c.growthProgress, growthTarget, growthStatus,
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
    return this.getState();
  }
}

module.exports = { GameEngine, DISTRICT_DEFS, PLANET_TYPES, MONTH_TICKS, BROADCAST_EVERY, TECH_TREE, GROWTH_BASE_TICKS, GROWTH_FAST_TICKS, GROWTH_FASTEST_TICKS, PLAYER_COLORS };
