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
    this._dirty = true; // tracks whether state changed since last broadcast
    this._cachedState = null; // cached serialized state
    this._cachedStateJSON = null; // cached JSON string for broadcast
    this._pendingEvents = []; // events to flush with next broadcast

    this._initPlayerStates();
    this._initStartingColonies();
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
    this._dirty = true;
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
    this._dirty = true;
    this._cachedState = null;
    this._cachedStateJSON = null;
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

    // Assign pops to districts in order — each working district needs 1 pop
    let assignedPops = 0;
    for (const d of colony.districts) {
      const def = DISTRICT_DEFS[d.type];
      if (!def) continue;

      // Jobless districts (e.g., housing) still consume resources
      if (def.jobs === 0) {
        for (const [resource, amount] of Object.entries(def.consumes)) {
          consumption[resource] = (consumption[resource] || 0) + amount;
        }
        continue;
      }

      if (assignedPops >= workingPops) break;
      assignedPops++;

      for (const [resource, amount] of Object.entries(def.produces)) {
        production[resource] = (production[resource] || 0) + amount;
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
    }
    this._dirty = true;
    this._cachedState = null;
    this._cachedStateJSON = null;
  }

  // Process construction queues
  _processConstruction() {
    for (const [, colony] of this.colonies) {
      if (colony.buildQueue.length === 0) continue;
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

      colony.growthProgress++;
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
    this.tickCount++;

    // Process construction every tick
    this._processConstruction();

    // Pop growth every tick
    this._processPopGrowth();

    // Monthly processing (every 100 ticks)
    if (this.tickCount % MONTH_TICKS === 0) {
      this._processMonthlyResources();
      this._processPopStarvation();
    }

    // Flush events — send per-player event messages
    const events = this._flushEvents();
    if (events && this.onEvent) {
      this.onEvent(events);
    }

    // Only broadcast when state has changed
    if (this.onTick && this._dirty) {
      this._dirty = false;
      this.onTick(this.getStateJSON());
    }
  }

  handleCommand(playerId, cmd) {
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
        this._dirty = true;
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

        const idx = colony.districts.findIndex(d => d.id === districtId);
        if (idx === -1) return { error: 'District not found' };

        colony.districts.splice(idx, 1);
        this._invalidateColonyCache(colony);
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
      playersArr.push({ id: p.id, name: p.name, color: p.color, resources: p.resources });
    }
    const coloniesArr = [];
    for (const c of this.colonies.values()) {
      const { production, consumption } = this._calcProduction(c);
      const queueArr = [];
      for (const q of c.buildQueue) {
        queueArr.push({ id: q.id, type: q.type, ticksRemaining: q.ticksRemaining });
      }
      coloniesArr.push({
        id: c.id,
        ownerId: c.ownerId,
        name: c.name,
        planet: c.planet,
        districts: c.districts,
        buildQueue: queueArr,
        pops: c.pops,
        housing: this._calcHousing(c),
        jobs: this._calcJobs(c),
        netProduction: {
          energy: production.energy - (consumption.energy || 0),
          minerals: production.minerals - (consumption.minerals || 0),
          food: production.food - (consumption.food || 0),
          alloys: production.alloys - (consumption.alloys || 0),
          physics: production.physics,
          society: production.society,
          engineering: production.engineering,
        },
      });
    }
    const state = { tick: this.tickCount, players: playersArr, colonies: coloniesArr };
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

  getInitState() {
    return this.getState();
  }
}

module.exports = { GameEngine, DISTRICT_DEFS, PLANET_TYPES, MONTH_TICKS, GROWTH_BASE_TICKS, GROWTH_FAST_TICKS, GROWTH_FASTEST_TICKS };
