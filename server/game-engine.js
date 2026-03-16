const { generateGalaxy, assignStartingSystems, bestHabitablePlanet } = require('./galaxy');

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1'];

// District definitions: type -> { produces, consumes, cost, buildTime }
// Production/consumption is per "month" (every 100 ticks = 10 seconds)
const DISTRICT_DEFS = {
  housing:     { produces: { food: 2 }, consumes: { energy: 1 }, housing: 5, jobs: 0, cost: { minerals: 100 }, buildTime: 200 },
  generator:   { produces: { energy: 6 }, consumes: {}, housing: 0, jobs: 1, cost: { minerals: 100 }, buildTime: 300 },
  mining:      { produces: { minerals: 6 }, consumes: {}, housing: 0, jobs: 1, cost: { minerals: 100 }, buildTime: 300 },
  agriculture: { produces: { food: 6 }, consumes: {}, housing: 0, jobs: 1, cost: { minerals: 100 }, buildTime: 300 },
  industrial:  { produces: { alloys: 4 }, consumes: { energy: 3 }, housing: 0, jobs: 1, cost: { minerals: 200 }, buildTime: 400 },
  research:    { produces: { physics: 4, society: 4, engineering: 4 }, consumes: { energy: 4 }, housing: 0, jobs: 1, cost: { minerals: 200, energy: 20 }, buildTime: 400 },
};

// Building definitions: buildings occupy separate slots from districts
// Slots unlock at pop thresholds: 1 at 5 pops, 2 at 10, 3 at 15
const BUILDING_DEFS = {
  researchLab:     { produces: { physics: 4, society: 4, engineering: 4 }, consumes: { energy: 2 }, jobs: 1, cost: { minerals: 200, energy: 50 }, buildTime: 500, label: 'Research Lab' },
  foundry:         { produces: { alloys: 4 }, consumes: { energy: 2 }, jobs: 1, cost: { minerals: 250 }, buildTime: 500, label: 'Foundry' },
  shieldGenerator: { produces: {}, consumes: { energy: 3 }, jobs: 1, cost: { minerals: 200, alloys: 100 }, buildTime: 500, label: 'Shield Generator', defensePlatformHPBonus: 25 },
  // T2 buildings — each requires a T2 tech + the base building already built
  quantumLab:       { produces: { physics: 3, society: 3, engineering: 2 }, consumes: { energy: 4 }, jobs: 1, cost: { minerals: 400, energy: 100 }, buildTime: 800, label: 'Quantum Lab', requires: { tech: 'advanced_reactors', building: 'researchLab' } },
  advancedFoundry:  { produces: { alloys: 8 }, consumes: { energy: 4, minerals: 2 }, jobs: 1, cost: { minerals: 400, alloys: 100 }, buildTime: 800, label: 'Advanced Foundry', requires: { tech: 'deep_mining', building: 'foundry' } },
  planetaryShield:  { produces: {}, consumes: { energy: 5 }, jobs: 1, cost: { minerals: 300, alloys: 200 }, buildTime: 800, label: 'Planetary Shield', defensePlatformHPBonus: 50, requires: { tech: 'gene_crops', building: 'shieldGenerator' } },
};
const BUILDING_SLOT_THRESHOLDS = [5, 10, 15]; // pops needed for slot 1, 2, 3

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

// Procedural colony names by planet type (8-10 per type)
const COLONY_NAMES = {
  continental: ['New Terra', 'Verdania', 'Haven Prime', 'Greenreach', 'Temperate Landing', 'Concordia', 'Meadowfall', 'Gaia Station', 'Heartland', 'Equinox'],
  ocean:       ['Tidecrest', 'Pelagius', 'Deepreach', 'Aquara', 'Wavecrest', 'Marinus', 'Thalassa', 'Coral Haven', 'Riptide', 'Abyssal'],
  tropical:    ['Verdant Isle', 'Canopy Prime', 'Emerald Haven', 'Monsoon Landing', 'Jungleheart', 'Tropica', 'Palmshade', 'Viridian', 'Fernfall', 'Lushwater'],
  arctic:      ['New Helsinki', 'Frostheim', 'Boreas Station', 'Glacial Reach', 'Tundra Prime', 'Icefall', 'Crystalpeak', 'Winterhold', 'Snowbound', 'Polaris'],
  desert:      ['Dusthaven', 'Sunward', 'Dune Prime', 'Sandreach', 'Scorchfield', 'Mirage Station', 'Aridus', 'Sunstone', 'Drywind', 'Oasis Landing'],
  arid:        ['Dryhaven', 'Rustfield', 'Mesa Prime', 'Steppereach', 'Ashwind', 'Redstone Landing', 'Dustwalker', 'Thornfield', 'Crackland', 'Ironflat'],
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
const COLONY_SHIP_COST = { minerals: 175, food: 75, alloys: 75 };
const COLONY_SHIP_BUILD_TIME = 450; // 45 seconds at 10Hz
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

// Surface anomaly types — discovered when building a district on the anomaly's slot
// 'output' anomalies give +50% production to the district on that slot (persistent)
// 'choice' anomalies offer a one-time resource reward the player must choose
const SURFACE_ANOMALY_TYPES = {
  richDeposit:    { category: 'output', bonus: 0.5, label: 'Rich Deposit', description: '+50% district output' },
  exoticGas:      { category: 'output', bonus: 0.5, label: 'Exotic Gas Vent', description: '+50% district output' },
  ancientRuins:   { category: 'choice', label: 'Ancient Ruins', description: 'Choose a reward',
                    choices: [
                      { id: 'salvage', label: 'Salvage Materials', reward: { minerals: 200 } },
                      { id: 'study', label: 'Study Artifacts', reward: { physics: 100, society: 100, engineering: 100 } },
                    ]},
  precursorCache: { category: 'choice', label: 'Precursor Cache', description: 'Choose a reward',
                    choices: [
                      { id: 'weapons', label: 'Weapons Cache', reward: { alloys: 150 } },
                      { id: 'data', label: 'Data Archive', reward: { physics: 150, society: 150, engineering: 150 } },
                    ]},
};
const SURFACE_ANOMALY_KEYS = Object.keys(SURFACE_ANOMALY_TYPES);
const SURFACE_ANOMALY_MIN = 1;
const SURFACE_ANOMALY_MAX = 3;

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

// Colony upkeep scaling — energy cost per colony (indexed by colony number, 0-based)
// Colony 1 = 0, Colony 2 = 3, Colony 3 = 8, Colony 4 = 15, Colony 5+ = 25
const COLONY_UPKEEP = [0, 3, 8, 15, 25];

// All production resource keys — hoisted to avoid per-colony Object.keys() allocation
const PRODUCTION_RESOURCES = ['energy', 'minerals', 'food', 'alloys', 'physics', 'society', 'engineering'];

// Scarcity season constants
const SCARCITY_RESOURCES = ['energy', 'minerals', 'food']; // commodity resources only
const SCARCITY_MIN_INTERVAL = 800;   // minimum ticks between scarcity seasons
const SCARCITY_MAX_INTERVAL = 1200;  // maximum ticks between scarcity seasons
const SCARCITY_DURATION = 300;       // 30 seconds at 10Hz
const SCARCITY_WARNING_TICKS = 100;  // 10 seconds advance warning
const SCARCITY_MULTIPLIER = 0.70;    // -30% production during scarcity

// Corvette (military ship) constants
const CORVETTE_COST = { minerals: 100, alloys: 50 };
const CORVETTE_BUILD_TIME = 400;     // 40 seconds at 10Hz
const CORVETTE_HOP_TICKS = 40;      // 4 seconds per hyperlane hop
const CORVETTE_HP = 10;
const CORVETTE_ATTACK = 3;
const MAX_CORVETTES = 10;           // max per player
const FLEET_COMBAT_MAX_ROUNDS = 10; // max rounds per fleet battle
const FLEET_BATTLE_WON_VP = 5;      // VP per fleet battle won
const FLEET_SHIP_LOST_VP = -2;      // VP penalty per own ship lost in combat
const CORVETTE_MAINTENANCE = { energy: 2, alloys: 1 };  // per base corvette per month
const CIVILIAN_SHIP_MAINTENANCE = { energy: 1 };         // per idle colony/science ship per month

// Corvette variants — unlocked by T2 techs, same build cost, 500-tick build time
const CORVETTE_VARIANT_BUILD_TIME = 500; // 50 seconds at 10Hz (vs 400 for base)
const CORVETTE_VARIANTS = {
  interceptor: {
    name: 'Interceptor',
    hp: 8, attack: 5, hopTicks: 30, regen: 0,
    requiredTech: 'advanced_reactors',  // Physics T2
    maintenance: { energy: 1, alloys: 0 },
    priority: 3, // attacks first in combat (highest priority)
    counters: 'gunboat',   // targets gunboats first
  },
  gunboat: {
    name: 'Gunboat',
    hp: 15, attack: 3, hopTicks: 50, regen: 0,
    requiredTech: 'deep_mining',        // Engineering T2
    maintenance: { energy: 2, alloys: 1 },
    priority: 1, // attacks last (lowest priority)
    counters: 'sentinel',  // targets sentinels first
  },
  sentinel: {
    name: 'Sentinel',
    hp: 12, attack: 3, hopTicks: 40, regen: 2,
    requiredTech: 'gene_crops',         // Society T2
    maintenance: { energy: 1, alloys: 2 },
    priority: 2, // attacks second
    counters: 'interceptor', // targets interceptors first
  },
};
const MAINTENANCE_DAMAGE = 2;       // HP lost per corvette when maintenance unpaid
const OCCUPATION_TICKS = 300;       // 30 seconds to occupy a colony (with corvettes present)
const OCCUPATION_PRODUCTION_MULT = 0.5; // occupied colonies produce at 50%
const OCCUPATION_ATTACKER_VP = 3;   // VP per occupied colony for attacker
const OCCUPATION_DEFENDER_VP = -5;  // VP penalty per occupied colony for defender

// Doctrine choice at game start — 3 asymmetric starting doctrines
const DOCTRINE_SELECTION_TICKS = 300; // 30 seconds at 10Hz
const DOCTRINE_DEFS = {
  industrialist: {
    name: 'Industrialist',
    description: '+25% Mining and Industrial output, +1 starting Mining district, -10% research output',
    productionBonus: { mining: 0.25, industrial: 0.25 },
    productionPenalty: { research: -0.10 },
    startingBonus: { extraDistrict: 'mining' },
  },
  scholar: {
    name: 'Scholar',
    description: '+25% Research output, T1 research 33% complete, -10% mineral output',
    productionBonus: { research: 0.25 },
    productionPenalty: { mining: -0.10 },
    startingBonus: { researchHead: 50 }, // set T1 research progress to 50 (33% of 150)
  },
  expansionist: {
    name: 'Expansionist',
    description: 'Colony ships -25% cost/time, +2 starting pops, -10% alloy output',
    productionBonus: {},
    productionPenalty: { industrial: -0.10 },
    startingBonus: { extraPops: 2 },
    colonyShipCostMult: 0.75,
    colonyShipTimeMult: 0.75,
  },
};

// Diplomatic stance constants
const DIPLOMACY_STANCES = { NEUTRAL: 'neutral', HOSTILE: 'hostile', FRIENDLY: 'friendly' };
const DIPLOMACY_INFLUENCE_COST = 25;   // influence cost to change stance
const DIPLOMACY_COOLDOWN_TICKS = 600;  // 60 seconds cooldown between changes toward same player
const FRIENDLY_PRODUCTION_BONUS = 0.10; // +10% production on colonies near friendly player
const FRIENDLY_HOP_RANGE = 3;          // max BFS hops for friendly production bonus
const FRIENDLY_VP = 5;                 // VP per friendly relationship at game end
const MUTUAL_FRIENDLY_VP = 10;         // VP if both players are friendly (replaces single)

// System claim constants
const SYSTEM_CLAIM_INFLUENCE_COST = 25;      // influence cost to claim a system
const SYSTEM_CLAIM_VP = 1;                    // +1 VP per claimed system

// Trade agreement constants
const TRADE_AGREEMENT_INFLUENCE_COST = 25;   // influence cost per player to form
const TRADE_AGREEMENT_ENERGY_BONUS = 0.15;   // +15% energy production
const TRADE_AGREEMENT_MINERAL_BONUS = 0.15;  // +15% mineral production

// Diplomacy ping constants
const DIPLOMACY_PING_TYPES = ['peace', 'warning', 'alliance', 'rival'];
const DIPLOMACY_PING_COOLDOWN = 100;   // 10 seconds cooldown between pings per sender

// NPC raider fleet constants
const RAIDER_MIN_INTERVAL = 1800;   // minimum ticks between raider spawns (~3 min)
const RAIDER_MAX_INTERVAL = 3000;   // maximum ticks between raider spawns (~5 min)
const RAIDER_HOP_TICKS = 40;        // 4 seconds per hyperlane hop
const RAIDER_HP = 30;
const RAIDER_ATTACK = 8;            // damage per combat tick
const RAIDER_COMBAT_TICKS = 5;      // combat resolves over 5 ticks
const DEFENSE_PLATFORM_COST = { alloys: 100 };
const DEFENSE_PLATFORM_BUILD_TIME = 200; // 20 seconds
const DEFENSE_PLATFORM_MAX_HP = 50;
const DEFENSE_PLATFORM_ATTACK = 15;  // damage per combat tick
const DEFENSE_PLATFORM_REPAIR_RATE = 15; // HP repaired per month
const RAIDER_DISABLE_TICKS = 300;    // districts disabled for 30 seconds on raid
const RAIDER_RESOURCE_STOLEN = 50;   // 50 of each resource stolen on raid
const RAIDER_DESTROY_VP = 5;         // +5 VP per raider destroyed

// Endgame crisis constants
const ENDGAME_CRISIS_TRIGGER = 0.75;     // triggers at 75% of match timer elapsed
const ENDGAME_CRISIS_WARNING_TICKS = 100; // 10-second advance warning
const GALACTIC_STORM_MULTIPLIER = 0.75;  // -25% all production
const PRECURSOR_HP = 60;
const PRECURSOR_ATTACK = 15;
const PRECURSOR_HOP_TICKS = 30;          // 3 seconds per hop (faster than raiders)
const PRECURSOR_COMBAT_TICKS = 8;        // more combat rounds than raiders
const PRECURSOR_DESTROY_VP = 15;         // +15 VP for destroying precursor fleet
const PRECURSOR_OCCUPY_VP = -5;          // -5 VP if precursor occupies your colony

// Scouting race VP milestones — first-to-survey bonuses
const SCOUT_MILESTONES = { 3: 10, 5: 15, 8: 20 }; // threshold -> VP bonus

// Science ship expeditions — unlocked after 5+ surveys
const EXPEDITION_MIN_SURVEYS = 5;
const EXPEDITION_TYPES = {
  deepSpaceProbe:  { name: 'Deep Space Probe',  ticks: 600, vp: 3,  risk: false },
  precursorSignal: { name: 'Precursor Signal',  ticks: 900, vp: 5,  risk: true, failChance: 0.3 },
  wormholeMapping: { name: 'Wormhole Mapping',  ticks: 600, vp: 2,  risk: false },
};

// Underdog catch-up mechanics
const UNDERDOG_BONUS_PER_COLONY = 0.15;   // +15% production per colony gap vs leader
const UNDERDOG_BONUS_CAP = 0.45;          // max +45% (3 colony gap)
const UNDERDOG_TECH_DISCOUNT = 0.15;      // -15% tech cost per player who already completed it

// Mid-game catalyst event constants
const CATALYST_RESOURCE_RUSH_PCT = 0.30;     // fires at 30% match time elapsed
const CATALYST_TECH_AUCTION_PCT = 0.45;      // fires at 45% match time elapsed
const CATALYST_BORDER_INCIDENT_PCT = 0.55;   // fires at 55% match time elapsed
const CATALYST_RUSH_INCOME = 75;             // +75 resource/month from motherlode
const CATALYST_RUSH_DURATION = 1800;         // 1800 ticks (3 minutes)
const CATALYST_AUCTION_WINDOW = 120;         // 120-tick bidding window (12 seconds)
const CATALYST_INCIDENT_WINDOW = 100;        // 100-tick response window (10 seconds)
const CATALYST_INCIDENT_BOTH_DEESCALATE_VP = 5;  // +5 VP each
const CATALYST_INCIDENT_ESCALATE_VP = 3;         // +3 VP for sole escalator
const CATALYST_INCIDENT_HOP_RANGE = 3;           // colonies within 3 hops

// Distinct victory conditions — instant-win checked monthly
const TOTAL_TECHS = 9;                   // 3 tiers × 3 tracks (all techs in TECH_TREE)
const MILITARY_VICTORY_OCCUPATIONS = 3;  // occupy 3+ enemy colonies simultaneously
const ECONOMIC_VICTORY_ALLOYS = 500;     // stockpile 500+ alloys
const ECONOMIC_VICTORY_TRAITS = 3;       // 3+ active colony personality traits

// Resource gifting
const GIFT_MIN_AMOUNT = 25;                      // minimum 25 per gift
const GIFT_COOLDOWN_TICKS = 200;                 // 200-tick cooldown per sender (global)
const GIFT_ALLOWED_RESOURCES = ['energy', 'minerals', 'food', 'alloys']; // no influence or research

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
    cost: 800,
    effect: { type: 'districtBonus', district: 'generator', multiplier: 2.0, alloysBonus: 1 },
    requires: 'advanced_reactors',
  },
  genetic_engineering: {
    track: 'society', tier: 3,
    name: 'Genetic Engineering',
    description: '+100% Agriculture output, pop growth halved',
    cost: 800,
    effect: { type: 'districtBonusAndGrowth', district: 'agriculture', multiplier: 2.0, growthMultiplier: 0.5 },
    requires: 'gene_crops',
  },
  automated_mining: {
    track: 'engineering', tier: 3,
    name: 'Automated Mining',
    description: '+100% Mining output, mining costs 0 jobs',
    cost: 800,
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
    this._usedColonyNames = new Set(); // track used procedural names to avoid duplicates
    this.playerStates = new Map();
    this.colonies = new Map(); // colonyId -> colony
    this._playerColonies = new Map(); // playerId -> colonyId[]
    this._colonyShips = []; // { id, ownerId, systemId, targetSystemId, path, hopProgress }
    this._colonyShipsByPlayer = new Map(); // playerId -> ship[] — O(1) per-player lookups
    this._scienceShips = []; // { id, ownerId, systemId, targetSystemId, path, hopProgress, surveying, surveyProgress, autoSurvey }
    this._scienceShipsByPlayer = new Map(); // playerId -> ship[] — O(1) per-player lookups
    this._militaryShips = []; // { id, ownerId, systemId, targetSystemId, path, hopProgress, hp, attack }
    this._militaryShipsByPlayer = new Map(); // playerId -> ship[] — O(1) count lookups
    this._militaryShipsById = new Map(); // shipId -> ship — O(1) find by ID
    this._militaryShipsBySystem = new Map(); // systemId -> ship[] — O(1) combat/presence checks
    this._surveyedSystems = new Map(); // playerId -> Set of surveyed systemIds (persistent fog penetration)
    this._systemClaims = new Map(); // systemId -> playerId — claimed systems (prevents enemy colonization, +1 VP each)
    this._expeditionVP = new Map(); // playerId -> total VP earned from completed expeditions
    this._completedExpeditions = new Map(); // playerId -> count of completed expeditions
    this.onTick = options.onTick || null;
    this.onEvent = options.onEvent || null;
    this.onGameOver = options.onGameOver || null;
    this._dirtyPlayers = new Set(); // per-player dirty tracking
    this._cachedState = null; // cached serialized state
    this._cachedStateJSON = null; // cached JSON string for broadcast
    this._cachedPlayerJSON = new Map(); // playerId -> cached per-player JSON string
    this._stateCacheDirty = false; // deferred invalidation flag — avoids redundant Map.clear() between broadcasts
    this._pendingEvents = []; // events to flush with next broadcast
    this._vpCache = new Map(); // playerId -> VP, cleared on invalidation
    this._vpBreakdownCache = new Map(); // playerId -> full VP breakdown
    this._vpCacheTick = -1;   // tick when VP cache was last computed
    this._summaryCache = new Map(); // playerId -> summary, tick-scoped
    this._summaryCacheTick = -1;
    this._techModCache = new Map(); // playerId -> { district, growth } — cleared on tech completion
    this._traitBonusesCache = new Map(); // playerId -> bonuses — cleared on colony trait change
    this._cachedShipData = null; // cached serialized ship arrays (shared across all players)
    this._victoryProgressCache = new Map(); // playerId -> progress, tick-scoped
    this._victoryProgressCacheTick = -1;
    this._cachedSurveyedArrays = new Map(); // playerId -> { size, array } — avoids Set→Array on every broadcast
    this._gameOver = false; // true after game ends

    // Game speed & pause
    this._gameSpeed = DEFAULT_SPEED;
    this._paused = false;
    this.onSpeedChange = options.onSpeedChange || null;

    // Match timer: minutes from room settings, 0 = unlimited
    const matchMinutes = Number(room.matchTimer) || 0;
    this._matchTicksRemaining = matchMinutes > 0 ? matchMinutes * 60 * (options.tickRate || 10) : 0;
    this._matchTicksTotal = this._matchTicksRemaining; // initial total for endgame crisis timing
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

    // NPC raider fleet tracking
    this._raiders = []; // { id, systemId, targetColonyId, path, hopProgress, hp }
    this._nextRaiderTick = this._randomRaiderInterval(); // first raider spawn
    this._raidersDestroyed = new Map(); // playerId -> count of raiders destroyed (lifetime)
    this._cachedEdgeSystems = null; // cached galaxy-edge system IDs (topology never changes)
    this._raiderDisableTimers = new Set(); // colony IDs with active raider disable timers
    this._defensePlatformBuilding = new Set(); // colony IDs actively building a defense platform

    // Doctrine selection phase — 30-second timer at game start
    this._doctrinePhase = true;     // true while doctrine selection is active
    this._doctrineDeadlineTick = DOCTRINE_SELECTION_TICKS; // auto-assign at this tick

    // Fleet combat tracking
    this._battlesWon = new Map();   // playerId -> count of fleet battles won (lifetime)
    this._shipsLost = new Map();    // playerId -> count of own ships lost in combat (lifetime)

    // Scouting race VP milestones — first-to-survey at 3/5/8 systems
    this._scoutMilestones = { 3: null, 5: null, 8: null }; // threshold -> playerId (null = unclaimed)

    // Match stats tracking (for post-game score screen)
    this._matchStats = new Map(); // playerId -> { coloniesFounded, districtsBuilt, shipsBuilt, resourcesGathered }
    this._matchStartTime = Date.now(); // wall-clock match start time

    // Endgame crisis tracking
    this._endgameCrisis = null;      // null | { type: 'galacticStorm' | 'precursorAwakening', triggered: true }
    this._endgameCrisisWarned = false;
    this._endgameCrisisTriggered = false;
    // Pre-compute trigger threshold (constant after construction)
    this._endgameCrisisTriggerTicks = this._matchTimerEnabled
      ? Math.floor(this._matchTicksTotal * (1 - ENDGAME_CRISIS_TRIGGER)) : 0;
    this._precursorFleet = null;     // { id, systemId, targetSystemId, path, hopProgress, hp, attack }
    this._precursorDestroyedBy = null; // playerId who destroyed precursor fleet
    this._precursorOccupiedColonies = new Set(); // colony IDs occupied by precursor

    // Mid-game catalyst event tracking
    this._catalystResourceRushFired = false;
    this._catalystTechAuctionFired = false;
    this._catalystBorderIncidentFired = false;
    // Resource Rush state
    this._resourceRushSystem = null;     // systemId of the motherlode
    this._resourceRushResource = null;   // 'energy' | 'minerals' | 'food' | 'alloys'
    this._resourceRushOwner = null;      // playerId who claimed it
    this._resourceRushTicksLeft = 0;     // ticks remaining for income bonus
    // Tech Auction state
    this._auctionBids = null;            // Map<playerId, amount> during bidding, null otherwise
    this._auctionDeadlineTick = 0;       // tick when auction closes
    // Border Incident state
    this._incidentPlayers = null;        // [playerId1, playerId2] or null
    this._incidentChoices = null;        // Map<playerId, 'escalate'|'deescalate'> during window
    this._incidentDeadlineTick = 0;      // tick when incident resolves

    // Resource gifting cooldowns
    this._giftCooldowns = new Map();      // playerId -> tick when cooldown expires

    // Diplomacy ping cooldowns
    this._pingCooldowns = new Map();      // playerId -> tick when cooldown expires

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

  _generateColonyName(planetType) {
    const names = COLONY_NAMES[planetType] || COLONY_NAMES.continental;
    for (let i = 0; i < names.length; i++) {
      if (!this._usedColonyNames.has(names[i])) {
        this._usedColonyNames.add(names[i]);
        return names[i];
      }
    }
    // All names used — fallback with numeric suffix
    let n = 1;
    while (this._usedColonyNames.has(`Colony ${planetType}-${n}`)) n++;
    const fallback = `Colony ${planetType}-${n}`;
    this._usedColonyNames.add(fallback);
    return fallback;
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
        doctrine: null,    // chosen doctrine type string or null (pending selection)
        activeEdict: null, // { type, monthsRemaining } or null
        diplomacy: {},     // targetPlayerId -> { stance, cooldownTick }
        pendingFriendly: new Set(), // targetPlayerIds awaiting acceptance
        tradeAgreements: new Set(),        // partner playerIds with active trade agreements
        pendingTradeAgreements: new Set(), // outgoing trade agreement proposals
      });
      // Initialize match stats for post-game score screen
      this._matchStats.set(playerId, {
        coloniesFounded: 0,
        districtsBuilt: 0,
        shipsBuilt: 0,
        resourcesGathered: { energy: 0, minerals: 0, food: 0, alloys: 0 },
      });
    }
  }

  // Get stance of player toward target (defaults to neutral)
  _getStance(playerId, targetPlayerId) {
    const state = this.playerStates.get(playerId);
    if (!state || !state.diplomacy[targetPlayerId]) return DIPLOMACY_STANCES.NEUTRAL;
    return state.diplomacy[targetPlayerId].stance;
  }

  // Check if two players are mutually hostile (either side declared hostile makes both hostile)
  _areHostile(playerA, playerB) {
    return this._getStance(playerA, playerB) === DIPLOMACY_STANCES.HOSTILE ||
           this._getStance(playerB, playerA) === DIPLOMACY_STANCES.HOSTILE;
  }

  // Check if two players are mutually friendly (both sides must be friendly)
  _areMutuallyFriendly(playerA, playerB) {
    return this._getStance(playerA, playerB) === DIPLOMACY_STANCES.FRIENDLY &&
           this._getStance(playerB, playerA) === DIPLOMACY_STANCES.FRIENDLY;
  }

  // Check if player has any active trade agreements
  _hasTradeAgreement(playerId) {
    const state = this.playerStates.get(playerId);
    return state && state.tradeAgreements.size > 0;
  }

  // Break trade agreement between two players (mutual removal + events)
  _breakTradeAgreement(pid1, pid2) {
    const state1 = this.playerStates.get(pid1);
    const state2 = this.playerStates.get(pid2);
    if (!state1 || !state2) return;
    const had = state1.tradeAgreements.has(pid2);
    state1.tradeAgreements.delete(pid2);
    state1.pendingTradeAgreements.delete(pid2);
    state2.tradeAgreements.delete(pid1);
    state2.pendingTradeAgreements.delete(pid1);
    if (had) {
      this._emitEvent('tradeAgreementBroken', pid1, {
        partnerId: pid2, partnerName: state2.name, reason: 'aggression',
      });
      this._emitEvent('tradeAgreementBroken', pid2, {
        partnerId: pid1, partnerName: state1.name, reason: 'aggression',
      });
      this._invalidateProductionCaches();
    }
  }

  // Calculate underdog production bonus for a player based on colony gap vs leader
  // Returns multiplier (e.g., 1.15 for +15%, 1.45 for +45% cap). Returns 1.0 if no bonus.
  _calcUnderdogBonus(playerId) {
    // Only active in 2+ player games
    if (this.playerStates.size < 2) return 1.0;
    let maxColonies = 0;
    let playerColonies = 0;
    for (const [pid] of this.playerStates) {
      const count = (this._playerColonies.get(pid) || []).length;
      if (count > maxColonies) maxColonies = count;
      if (pid === playerId) playerColonies = count;
    }
    const gap = maxColonies - playerColonies;
    if (gap <= 0) return 1.0;
    const bonus = Math.min(gap * UNDERDOG_BONUS_PER_COLONY, UNDERDOG_BONUS_CAP);
    return 1 + bonus;
  }

  // Calculate tech cost discount based on how many other players already completed a tech
  _calcTechDiscount(techId) {
    let completedCount = 0;
    for (const [, state] of this.playerStates) {
      if (state.completedTechs && state.completedTechs.includes(techId)) {
        completedCount++;
      }
    }
    return Math.max(0, 1 - completedCount * UNDERDOG_TECH_DISCOUNT);
  }

  // Check if colony has a friendly player's colony within N hops (BFS)
  _hasFriendlyColonyNearby(colony) {
    if (!this._adjacency) return false;
    const ownerId = colony.ownerId;
    // Build a set of systems where friendly players have colonies (O(friendColonies) total)
    const friendlySystems = new Set();
    for (const [pid] of this.playerStates) {
      if (pid === ownerId) continue;
      if (!this._areMutuallyFriendly(ownerId, pid)) continue;
      const friendColonies = this._playerColonies.get(pid);
      if (!friendColonies) continue;
      for (const cId of friendColonies) {
        const c = this.colonies.get(cId);
        if (c) friendlySystems.add(c.systemId);
      }
    }
    if (friendlySystems.size === 0) return false;

    // BFS from colony's system up to FRIENDLY_HOP_RANGE hops — O(1) lookup per visited system
    const visited = new Set();
    let frontier = [colony.systemId];
    visited.add(colony.systemId);
    for (let hop = 0; hop < FRIENDLY_HOP_RANGE; hop++) {
      const next = [];
      for (const sysId of frontier) {
        const neighbors = this._adjacency.get(sysId);
        if (!neighbors) continue;
        for (const nId of neighbors) {
          if (visited.has(nId)) continue;
          visited.add(nId);
          next.push(nId);
          if (friendlySystems.has(nId)) return true;
        }
      }
      frontier = next;
    }
    return false;
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

      const colonyName = this._generateColonyName(planet.type);
      const colony = this._createColony(playerId, colonyName, planet, systemId);
      colony.isStartingColony = true;
      // Start with 4 pre-built districts (instant, no construction time)
      this._addBuiltDistrict(colony, 'generator');
      this._addBuiltDistrict(colony, 'mining');
      this._addBuiltDistrict(colony, 'agriculture');
      this._addBuiltDistrict(colony, 'agriculture');
    }
  }

  // Apply starting bonuses when a player selects (or is auto-assigned) a doctrine
  _applyDoctrineStartingBonus(playerId, doctrineType) {
    const def = DOCTRINE_DEFS[doctrineType];
    if (!def || !def.startingBonus) return;

    const bonus = def.startingBonus;

    // Industrialist: +1 extra mining district on starting colony
    if (bonus.extraDistrict) {
      const colonyIds = this._playerColonies.get(playerId);
      if (colonyIds && colonyIds.length > 0) {
        const colony = this.colonies.get(colonyIds[0]);
        if (colony && colony.districts.length < colony.planet.size) {
          this._addBuiltDistrict(colony, bonus.extraDistrict);
          this._invalidateColonyCache(colony);
        }
      }
    }

    // Scholar: T1 research 33% complete (progress = 50 out of 150 cost)
    if (bonus.researchHead) {
      const state = this.playerStates.get(playerId);
      const t1Techs = ['improved_power_plants', 'frontier_medicine', 'improved_mining'];
      for (const techId of t1Techs) {
        if (!state.researchProgress[techId]) {
          state.researchProgress[techId] = bonus.researchHead;
        }
      }
    }

    // Expansionist: +2 starting pops
    if (bonus.extraPops) {
      const colonyIds = this._playerColonies.get(playerId);
      if (colonyIds && colonyIds.length > 0) {
        const colony = this.colonies.get(colonyIds[0]);
        if (colony) {
          colony.pops += bonus.extraPops;
          this._invalidateColonyCache(colony);
        }
      }
    }
  }

  // Process doctrine selection phase — auto-assign random doctrine when timer expires
  _processDoctrinePhase() {
    if (!this._doctrinePhase) return;
    if (this.tickCount < this._doctrineDeadlineTick) return;

    // Timer expired — auto-assign random doctrine to players who haven't chosen
    const doctrineTypes = Object.keys(DOCTRINE_DEFS);
    for (const [playerId, state] of this.playerStates) {
      if (state.doctrine !== null) continue;
      const randomType = doctrineTypes[Math.floor(Math.random() * doctrineTypes.length)];
      state.doctrine = randomType;
      this._applyDoctrineStartingBonus(playerId, randomType);
      this._emitEvent('doctrineAutoAssigned', playerId, { doctrine: randomType, name: DOCTRINE_DEFS[randomType].name });
      this._dirtyPlayers.add(playerId);
    }
    this._doctrinePhase = false;
    this._invalidateProductionCaches();
    this._invalidateStateCache();
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
      buildings: [],               // built buildings: { id, type, slot }
      buildingQueue: [],           // { id, type, slot, ticksRemaining }
      buildQueue: [],              // { id, type, ticksRemaining }
      isStartingColony: false,     // true for initial colonies, no build discount
      playerBuiltDistricts: 0,    // count of districts player has built (not pre-built)
      pops: 8,                     // starting population
      growthProgress: 0,           // ticks accumulated toward next pop
      crisisState: null,           // active crisis: { type, ticksRemaining, resolved, disabledIds, quarantineTicks, strikeTicks, energyBoostTicks }
      nextCrisisTick: 0,           // tick when next crisis can occur (set on colony creation)
      defensePlatform: null,       // { hp, maxHp, building } — null until built, building=true while under construction
      occupiedBy: null,            // playerId of occupying player, null if unoccupied
      occupationProgress: 0,       // ticks progressed toward occupation (0 to OCCUPATION_TICKS)
      surfaceAnomalies: [],        // { id, slot, type, discovered, choicePending }
      _cachedHousing: null,        // cached derived values
      _cachedJobs: null,
      _cachedProduction: null,
    };
    // Generate 1-3 surface anomalies at random district slot positions
    this._generateSurfaceAnomalies(colony);
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

  _generateSurfaceAnomalies(colony) {
    const planetSize = colony.planet.size;
    if (planetSize < 1) return;
    const count = SURFACE_ANOMALY_MIN + Math.floor(Math.random() * (SURFACE_ANOMALY_MAX - SURFACE_ANOMALY_MIN + 1));
    const actualCount = Math.min(count, planetSize);
    // Pick random unique slot positions
    const slots = [];
    for (let i = 0; i < planetSize; i++) slots.push(i);
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    for (let i = 0; i < actualCount; i++) {
      const type = SURFACE_ANOMALY_KEYS[Math.floor(Math.random() * SURFACE_ANOMALY_KEYS.length)];
      colony.surfaceAnomalies.push({
        id: this._nextId(),
        slot: slots[i],
        type,
        discovered: false,
        choicePending: false,
      });
    }
  }

  _discoverSurfaceAnomaly(colony, slot) {
    const anomaly = colony.surfaceAnomalies.find(a => a.slot === slot && !a.discovered);
    if (!anomaly) return;
    anomaly.discovered = true;
    const def = SURFACE_ANOMALY_TYPES[anomaly.type];
    if (!def) return;

    if (def.category === 'output') {
      // Mark the district at this slot with anomaly bonus
      const district = colony.districts[slot];
      if (district) {
        district.anomalyBonus = def.bonus;
        this._invalidateColonyCache(colony);
      }
      this._emitEvent('surfaceAnomalyDiscovered', colony.ownerId, {
        colonyId: colony.id,
        colonyName: colony.name,
        anomalyType: anomaly.type,
        anomalyLabel: def.label,
        category: 'output',
        bonus: def.bonus,
      });
    } else if (def.category === 'choice') {
      anomaly.choicePending = true;
      this._emitEvent('surfaceAnomalyDiscovered', colony.ownerId, {
        colonyId: colony.id,
        colonyName: colony.name,
        anomalyType: anomaly.type,
        anomalyLabel: def.label,
        category: 'choice',
        choices: def.choices,
        anomalyId: anomaly.id,
      });
    }
  }

  _resolveAnomaly(playerId, colonyId, anomalyId, choiceId) {
    const colony = this.colonies.get(colonyId);
    if (!colony) return { error: 'Colony not found' };
    if (colony.ownerId !== playerId) return { error: 'Not your colony' };

    const anomaly = colony.surfaceAnomalies.find(a => a.id === anomalyId);
    if (!anomaly) return { error: 'Anomaly not found' };
    if (!anomaly.discovered) return { error: 'Anomaly not yet discovered' };
    if (!anomaly.choicePending) return { error: 'No choice pending for this anomaly' };

    const def = SURFACE_ANOMALY_TYPES[anomaly.type];
    if (!def || def.category !== 'choice') return { error: 'Anomaly is not a choice type' };

    const choice = def.choices.find(c => c.id === choiceId);
    if (!choice) return { error: 'Invalid choice' };

    // Apply reward
    const state = this.playerStates.get(playerId);
    if (state) {
      for (const [resource, amount] of Object.entries(choice.reward)) {
        if (resource === 'physics' || resource === 'society' || resource === 'engineering') {
          state.resources.research = state.resources.research || { physics: 0, society: 0, engineering: 0 };
          state.resources.research[resource] = (state.resources.research[resource] || 0) + amount;
        } else {
          state.resources[resource] = (state.resources[resource] || 0) + amount;
        }
      }
    }

    anomaly.choicePending = false;
    this._dirtyPlayers.add(playerId);
    this._invalidateStateCache();

    this._emitEvent('surfaceAnomalyResolved', playerId, {
      colonyId: colony.id,
      colonyName: colony.name,
      anomalyType: anomaly.type,
      anomalyLabel: def.label,
      choiceLabel: choice.label,
      reward: choice.reward,
    });

    return { ok: true };
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
    this._stateCacheDirty = true; // defer Map.clear() until cache is actually read
    this._cachedShipData = null;
  }

  _invalidateColonyCache(colony) {
    colony._cachedHousing = null;
    colony._cachedJobs = null;
    colony._cachedProduction = null;
    colony._cachedTrait = undefined; // undefined = not computed, null = no trait
    this._traitBonusesCache.delete(colony.ownerId); // empire-wide trait bonuses depend on colony traits
    this._dirtyPlayers.add(colony.ownerId);
    this._invalidateStateCache();
    this._vpCacheTick = -1; // VP depends on colonies — invalidate
    this._summaryCacheTick = -1; // summary depends on colonies
  }

  // Invalidate production caches for ALL colonies of a player.
  // Needed when trait bonuses change — they're empire-wide and affect all colonies.
  _invalidatePlayerProductionCaches(playerId) {
    this._traitBonusesCache.delete(playerId);
    const colonyIds = this._playerColonies.get(playerId) || [];
    for (const colonyId of colonyIds) {
      const colony = this.colonies.get(colonyId);
      if (colony) colony._cachedProduction = null;
    }
  }

  // Invalidate production caches for ALL colonies across ALL players.
  // Needed when diplomatic stance changes affect production bonuses.
  _invalidateProductionCaches() {
    for (const colony of this.colonies.values()) {
      colony._cachedProduction = null;
    }
    this._summaryCacheTick = -1;
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
    // Building jobs
    for (const b of (colony.buildings || [])) {
      const bDef = BUILDING_DEFS[b.type];
      if (bDef) jobs += bDef.jobs;
    }
    colony._cachedJobs = jobs;
    return jobs;
  }

  // Calculate effective defense platform max HP (base + Shield Generator bonus)
  _calcDefensePlatformMaxHP(colony) {
    let maxHp = DEFENSE_PLATFORM_MAX_HP;
    for (const b of (colony.buildings || [])) {
      const bDef = BUILDING_DEFS[b.type];
      if (bDef && bDef.defensePlatformHPBonus) {
        maxHp += bDef.defensePlatformHPBonus;
      }
    }
    return maxHp;
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
  // Cached per player — invalidated when any colony's trait changes (_invalidateColonyCache)
  _calcTraitBonuses(playerId) {
    const cached = this._traitBonusesCache.get(playerId);
    if (cached) return cached;
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
    this._traitBonusesCache.set(playerId, bonuses);
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

      // Jobless districts (e.g., housing) produce and consume without requiring a pop
      if (effectiveJobs === 0 && def.jobs === 0) {
        for (const [resource, amount] of Object.entries(def.produces)) {
          production[resource] = (production[resource] || 0) + amount;
        }
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
      const anomalyMod = d.anomalyBonus ? (1 + d.anomalyBonus) : 1;
      for (const [resource, amount] of Object.entries(def.produces)) {
        production[resource] = (production[resource] || 0) + (amount * districtMod * anomalyMod);
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

    // Building production (buildings use pops from the same pool as districts)
    for (const b of (colony.buildings || [])) {
      const bDef = BUILDING_DEFS[b.type];
      if (!bDef) continue;
      if (bDef.jobs > 0) {
        if (assignedPops >= workingPops) break;
        assignedPops++;
      }
      for (const [resource, amount] of Object.entries(bDef.produces)) {
        production[resource] = (production[resource] || 0) + amount;
      }
      for (const [resource, amount] of Object.entries(bDef.consumes)) {
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
    const playerEdict = playerState?.activeEdict;
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

    // Doctrine production modifiers (multiplicative, after edict bonuses)
    if (playerState && playerState.doctrine) {
      const docDef = DOCTRINE_DEFS[playerState.doctrine];
      if (docDef) {
        // Apply bonuses: +25% to matching district types
        for (const [distType, bonus] of Object.entries(docDef.productionBonus)) {
          if (distType === 'research') {
            // Research bonus applies to all 3 research resources
            if (production.physics > 0) production.physics = Math.round(production.physics * (1 + bonus) * 100) / 100;
            if (production.society > 0) production.society = Math.round(production.society * (1 + bonus) * 100) / 100;
            if (production.engineering > 0) production.engineering = Math.round(production.engineering * (1 + bonus) * 100) / 100;
          } else if (distType === 'mining') {
            if (production.minerals > 0) production.minerals = Math.round(production.minerals * (1 + bonus) * 100) / 100;
          } else if (distType === 'industrial') {
            if (production.alloys > 0) production.alloys = Math.round(production.alloys * (1 + bonus) * 100) / 100;
          }
        }
        // Apply penalties: -10% to penalized resources
        for (const [distType, penalty] of Object.entries(docDef.productionPenalty)) {
          if (distType === 'research') {
            if (production.physics > 0) production.physics = Math.round(production.physics * (1 + penalty) * 100) / 100;
            if (production.society > 0) production.society = Math.round(production.society * (1 + penalty) * 100) / 100;
            if (production.engineering > 0) production.engineering = Math.round(production.engineering * (1 + penalty) * 100) / 100;
          } else if (distType === 'mining') {
            if (production.minerals > 0) production.minerals = Math.round(production.minerals * (1 + penalty) * 100) / 100;
          } else if (distType === 'industrial') {
            if (production.alloys > 0) production.alloys = Math.round(production.alloys * (1 + penalty) * 100) / 100;
          }
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

    // Galactic Storm: -25% all production for remainder of match
    if (this._endgameCrisis && this._endgameCrisis.type === 'galacticStorm') {
      for (const resource of PRODUCTION_RESOURCES) {
        if (production[resource] > 0) {
          production[resource] = Math.round(production[resource] * GALACTIC_STORM_MULTIPLIER * 100) / 100;
        }
      }
    }

    // Precursor occupation: production halved (same as player occupation)
    if (this._precursorOccupiedColonies.has(colony.id)) {
      for (const resource of PRODUCTION_RESOURCES) {
        if (production[resource] > 0) {
          production[resource] = Math.round(production[resource] * OCCUPATION_PRODUCTION_MULT * 100) / 100;
        }
      }
    }

    // Power surge energy boost: +50% energy production during energyBoostTicks
    if (colony.crisisState && colony.crisisState.energyBoostTicks > 0 && production.energy > 0) {
      production.energy = Math.round(production.energy * 1.5 * 100) / 100;
    }

    // Occupation penalty: 50% production when occupied by another player
    if (colony.occupiedBy) {
      for (const resource of PRODUCTION_RESOURCES) {
        if (production[resource] > 0) {
          production[resource] = Math.round(production[resource] * OCCUPATION_PRODUCTION_MULT * 100) / 100;
        }
      }
    }

    // Friendly diplomatic bonus: +10% production if a mutual-friendly player's colony is within 3 hops
    if (this._hasFriendlyColonyNearby(colony)) {
      for (const resource of PRODUCTION_RESOURCES) {
        if (production[resource] > 0) {
          production[resource] = Math.round(production[resource] * (1 + FRIENDLY_PRODUCTION_BONUS) * 100) / 100;
        }
      }
    }

    // Trade agreement bonus: +15% energy and minerals per active trade agreement partner
    if (playerState && playerState.tradeAgreements.size > 0) {
      const tradePartnerCount = playerState.tradeAgreements.size;
      const energyMult = 1 + TRADE_AGREEMENT_ENERGY_BONUS * tradePartnerCount;
      const mineralMult = 1 + TRADE_AGREEMENT_MINERAL_BONUS * tradePartnerCount;
      if (production.energy > 0) {
        production.energy = Math.round(production.energy * energyMult * 100) / 100;
      }
      if (production.minerals > 0) {
        production.minerals = Math.round(production.minerals * mineralMult * 100) / 100;
      }
    }

    // Underdog production bonus: +15% per colony gap vs leader, cap +45%
    const underdogMult = this._calcUnderdogBonus(colony.ownerId);
    if (underdogMult > 1.0) {
      for (const resource of PRODUCTION_RESOURCES) {
        if (production[resource] > 0) {
          production[resource] = Math.round(production[resource] * underdogMult * 100) / 100;
        }
      }
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

        // Track total resources gathered for post-game stats
        const ms = this._matchStats.get(playerId);
        if (ms) {
          ms.resourcesGathered.energy += production.energy;
          ms.resourcesGathered.minerals += production.minerals;
          ms.resourcesGathered.food += production.food;
          ms.resourcesGathered.alloys += production.alloys;
        }

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

      // Ship maintenance costs (per-variant costs)
      const playerShipsForMaint = this._militaryShipsByPlayer.get(playerId) || [];
      let shipEnergyMaint = 0;
      let shipAlloyMaint = 0;
      for (const ship of playerShipsForMaint) {
        const maint = ship.variant ? CORVETTE_VARIANTS[ship.variant].maintenance : CORVETTE_MAINTENANCE;
        shipEnergyMaint += maint.energy;
        shipAlloyMaint += maint.alloys;
      }
      const idleColonyShips = this._countIdleCivilianShips(playerId, 'colony');
      const idleScienceShips = this._countIdleCivilianShips(playerId, 'science');
      const civilianMaintenance = (idleColonyShips + idleScienceShips) * CIVILIAN_SHIP_MAINTENANCE.energy;

      state.resources.energy -= shipEnergyMaint + civilianMaintenance;
      state.resources.alloys -= shipAlloyMaint;

      // If energy or alloys went negative from maintenance, degrade corvettes
      const corvetteCount = playerShipsForMaint.length;
      if ((corvetteCount > 0) && (state.resources.energy < 0 || state.resources.alloys < 0)) {
        const playerShips = this._militaryShipsByPlayer.get(playerId) || [];
        const toRemove = [];
        for (const ship of playerShips) {
          ship.hp -= MAINTENANCE_DAMAGE;
          if (ship.hp <= 0) {
            toRemove.push(ship);
          }
        }
        for (const ship of toRemove) {
          this._removeMilitaryShip(ship);
          this._emitEvent('shipLostMaintenance', playerId, { shipId: ship.id, systemId: ship.systemId });
        }
        if (toRemove.length > 0) {
          this._emitEvent('maintenanceAttrition', playerId, { shipsLost: toRemove.length }, true);
        }
      }

      // Colony upkeep scaling — colonies beyond the first cost energy
      const colonyCount = colonyIds.length;
      if (colonyCount > 1) {
        let totalUpkeep = 0;
        for (let i = 1; i < colonyCount; i++) {
          totalUpkeep += COLONY_UPKEEP[Math.min(i, COLONY_UPKEEP.length - 1)];
        }
        state.resources.energy -= totalUpkeep;
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

  // ── Endgame Crisis System ──

  _processEndgameCrisis() {
    // Only activate with match timer enabled
    if (!this._matchTimerEnabled || this._endgameCrisisTriggered) return;

    // Use pre-computed trigger threshold
    const triggerAtRemaining = this._endgameCrisisTriggerTicks;

    // Warning: 100 ticks before trigger (when remaining drops below threshold + warning ticks)
    if (!this._endgameCrisisWarned && this._matchTicksRemaining <= triggerAtRemaining + ENDGAME_CRISIS_WARNING_TICKS) {
      this._endgameCrisisWarned = true;
      this._emitEvent('endgameCrisisWarning', null, {
        ticksUntilCrisis: this._matchTicksRemaining - triggerAtRemaining,
      }, true);
    }

    // Trigger crisis when 75% of match time has elapsed
    if (this._matchTicksRemaining <= triggerAtRemaining) {
      this._endgameCrisisTriggered = true;

      // Randomly select crisis type
      const crisisType = Math.random() < 0.5 ? 'galacticStorm' : 'precursorAwakening';
      this._endgameCrisis = { type: crisisType };

      if (crisisType === 'galacticStorm') {
        // Galactic Storm: -25% all production for remainder of match
        this._invalidateAllProductionCaches();
        this._invalidateStateCache();
        this._emitEvent('endgameCrisis', null, {
          crisisType: 'galacticStorm',
          label: 'Galactic Storm',
          description: 'A devastating galactic storm reduces all production by 25% for the remainder of the match!',
        }, true);
      } else {
        // Precursor Awakening: spawn hostile fleet
        this._spawnPrecursorFleet();
        this._emitEvent('endgameCrisis', null, {
          crisisType: 'precursorAwakening',
          label: 'Precursor Awakening',
          description: 'An ancient precursor fleet has awakened! A powerful warship approaches the nearest colony!',
          precursorHp: PRECURSOR_HP,
          precursorAttack: PRECURSOR_ATTACK,
        }, true);
      }
    }
  }

  // ── Mid-game Catalyst Events ──

  _processCatalystEvents() {
    if (!this._matchTimerEnabled || this._gameOver) return;

    // Fast exit: all events fired and no active rush/auction/incident in progress
    if (this._catalystResourceRushFired && this._catalystTechAuctionFired && this._catalystBorderIncidentFired
        && !this._resourceRushOwner && !this._auctionBids && !this._incidentPlayers) {
      return;
    }

    const elapsed = this._matchTicksTotal - this._matchTicksRemaining;
    const pct = elapsed / this._matchTicksTotal;

    // 1. Resource Rush at 30%
    if (!this._catalystResourceRushFired && pct >= CATALYST_RESOURCE_RUSH_PCT) {
      this._catalystResourceRushFired = true;
      this._triggerResourceRush();
    }

    // Resource Rush income processing (every month tick)
    if (this._resourceRushOwner && this._resourceRushTicksLeft > 0) {
      this._resourceRushTicksLeft--;
      if (this.tickCount % MONTH_TICKS === 0) {
        const state = this.playerStates.get(this._resourceRushOwner);
        if (state) {
          state.resources[this._resourceRushResource] += CATALYST_RUSH_INCOME;
          this._dirtyPlayers.add(this._resourceRushOwner);
          this._invalidateStateCache();
        }
      }
      if (this._resourceRushTicksLeft <= 0) {
        this._emitEvent('resourceRushExpired', null, {
          systemId: this._resourceRushSystem,
          resource: this._resourceRushResource,
        }, true);
        this._resourceRushOwner = null;
      }
    }

    // 2. Tech Auction at 45%
    if (!this._catalystTechAuctionFired && pct >= CATALYST_TECH_AUCTION_PCT) {
      this._catalystTechAuctionFired = true;
      this._triggerTechAuction();
    }

    // Resolve tech auction when window closes
    if (this._auctionBids && this.tickCount >= this._auctionDeadlineTick) {
      this._resolveTechAuction();
    }

    // 3. Border Incident at 55%
    if (!this._catalystBorderIncidentFired && pct >= CATALYST_BORDER_INCIDENT_PCT) {
      this._catalystBorderIncidentFired = true;
      this._triggerBorderIncident();
    }

    // Resolve border incident when window closes
    if (this._incidentPlayers && this.tickCount >= this._incidentDeadlineTick) {
      this._resolveBorderIncident();
    }
  }

  _triggerResourceRush() {
    // Find an unsurveyed system (not surveyed by any player)
    const allSurveyed = new Set();
    for (const [, sysSet] of this._surveyedSystems) {
      for (const sid of sysSet) allSurveyed.add(sid);
    }
    // Also exclude systems with colonies (collect colonized set in one pass)
    const colonySystems = new Set();
    for (const [, colony] of this.colonies) {
      allSurveyed.add(colony.systemId);
      colonySystems.add(colony.systemId);
    }

    let sys;
    const candidates = this.galaxy.systems.filter(s => !allSurveyed.has(s.id));
    if (candidates.length === 0) {
      // All systems surveyed — pick a random unclaimed system instead
      const unclaimedSystems = this.galaxy.systems.filter(s => !colonySystems.has(s.id));
      if (unclaimedSystems.length === 0) return; // no valid system
      sys = unclaimedSystems[Math.floor(Math.random() * unclaimedSystems.length)];
    } else {
      sys = candidates[Math.floor(Math.random() * candidates.length)];
    }
    this._resourceRushSystem = sys.id;

    const resources = ['energy', 'minerals', 'food', 'alloys'];
    this._resourceRushResource = resources[Math.floor(Math.random() * resources.length)];
    this._resourceRushOwner = null;
    this._resourceRushTicksLeft = 0;

    const sysName = sys.name || 'Unknown System';

    this._emitEvent('resourceRush', null, {
      systemId: this._resourceRushSystem,
      systemName: sysName,
      resource: this._resourceRushResource,
      income: CATALYST_RUSH_INCOME,
      durationTicks: CATALYST_RUSH_DURATION,
    }, true);
  }

  // Called when a player stations a military ship or colonizes the rush system
  _claimResourceRush(playerId) {
    if (this._resourceRushSystem === null || this._resourceRushOwner) return false;
    this._resourceRushOwner = playerId;
    this._resourceRushTicksLeft = CATALYST_RUSH_DURATION;
    const state = this.playerStates.get(playerId);
    const playerName = state ? state.name : 'Unknown';
    this._emitEvent('resourceRushClaimed', null, {
      playerId,
      playerName,
      systemId: this._resourceRushSystem,
      resource: this._resourceRushResource,
      income: CATALYST_RUSH_INCOME,
    }, true);
    this._invalidateStateCache();
    return true;
  }

  _triggerTechAuction() {
    // Only if there are players with active T2 research
    this._auctionBids = new Map();
    this._auctionDeadlineTick = this.tickCount + CATALYST_AUCTION_WINDOW;

    this._emitEvent('techAuction', null, {
      deadlineTick: this._auctionDeadlineTick,
      windowTicks: CATALYST_AUCTION_WINDOW,
    }, true);
  }

  _resolveTechAuction() {
    const bids = this._auctionBids;
    this._auctionBids = null; // close bidding

    if (!bids || bids.size === 0) {
      this._emitEvent('techAuctionResult', null, {
        winner: null,
        reason: 'No bids received',
      }, true);
      return;
    }

    // Find highest bidder
    let winnerId = null;
    let highestBid = 0;
    for (const [pid, amount] of bids) {
      if (amount > highestBid) {
        highestBid = amount;
        winnerId = pid;
      }
    }

    // Deduct influence from ALL bidders
    for (const [pid, amount] of bids) {
      const state = this.playerStates.get(pid);
      if (state) {
        state.resources.influence = Math.max(0, state.resources.influence - amount);
        this._dirtyPlayers.add(pid);
      }
    }

    // Winner instantly completes their current research (first T2 found, or any current)
    let completedTech = null;
    if (winnerId) {
      const winnerState = this.playerStates.get(winnerId);
      if (winnerState) {
        // Find current research to complete (prefer T2)
        for (const track of ['physics', 'society', 'engineering']) {
          const techId = winnerState.currentResearch[track];
          if (!techId) continue;
          const techDef = TECH_TREE[techId];
          if (techDef && techDef.tier === 2) {
            completedTech = techId;
            break;
          }
        }
        // Fallback: complete any current research
        if (!completedTech) {
          for (const track of ['physics', 'society', 'engineering']) {
            const techId = winnerState.currentResearch[track];
            if (techId) { completedTech = techId; break; }
          }
        }
        // Complete the tech
        if (completedTech) {
          const techDef = TECH_TREE[completedTech];
          if (techDef && !winnerState.completedTechs.includes(completedTech)) {
            winnerState.completedTechs.push(completedTech);
            winnerState.currentResearch[techDef.track] = null;
            delete winnerState.researchProgress[completedTech];
            this._invalidatePlayerProductionCaches(winnerId);
            this._vpCacheTick = -1;
          }
        }
      }
    }

    const winnerState = winnerId ? this.playerStates.get(winnerId) : null;
    this._emitEvent('techAuctionResult', null, {
      winner: winnerId,
      winnerName: winnerState ? winnerState.name : null,
      winningBid: highestBid,
      completedTech,
      techName: completedTech && TECH_TREE[completedTech] ? TECH_TREE[completedTech].name : null,
      totalBidders: bids.size,
    }, true);

    this._invalidateStateCache();
  }

  _triggerBorderIncident() {
    // Find two players with colonies within CATALYST_INCIDENT_HOP_RANGE hops
    const playerIds = [...this.playerStates.keys()];
    if (playerIds.length < 2) return;

    const pair = this._findNearbyPlayerPair(playerIds, CATALYST_INCIDENT_HOP_RANGE);
    if (!pair) return;

    this._incidentPlayers = pair;
    this._incidentChoices = new Map();
    this._incidentDeadlineTick = this.tickCount + CATALYST_INCIDENT_WINDOW;

    const state1 = this.playerStates.get(pair[0]);
    const state2 = this.playerStates.get(pair[1]);
    this._emitEvent('borderIncident', null, {
      players: pair,
      playerNames: [state1 ? state1.name : 'Unknown', state2 ? state2.name : 'Unknown'],
      deadlineTick: this._incidentDeadlineTick,
      windowTicks: CATALYST_INCIDENT_WINDOW,
    }, true);
  }

  // Find two players who have colonies within N hops of each other
  _findNearbyPlayerPair(playerIds, maxHops) {
    const adj = this._adjacency;
    if (!adj) return null;

    // Build player -> [systemIds] map
    const playerSystems = new Map();
    for (const pid of playerIds) {
      const colIds = this._playerColonies.get(pid) || [];
      const systems = [];
      for (const cid of colIds) {
        const c = this.colonies.get(cid);
        if (c) systems.push(c.systemId);
      }
      if (systems.length > 0) playerSystems.set(pid, systems);
    }

    const pids = [...playerSystems.keys()];
    // Shuffle to randomize which pair is selected
    for (let i = pids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pids[i], pids[j]] = [pids[j], pids[i]];
    }

    for (let i = 0; i < pids.length; i++) {
      for (let j = i + 1; j < pids.length; j++) {
        const sysA = playerSystems.get(pids[i]);
        const sysB = new Set(playerSystems.get(pids[j]));

        // BFS from each of player A's colonies up to maxHops
        for (const startSys of sysA) {
          const visited = new Set([startSys]);
          let frontier = [startSys];
          for (let hop = 0; hop < maxHops; hop++) {
            const next = [];
            for (const sysId of frontier) {
              const neighbors = adj.get(sysId) || [];
              for (const nId of neighbors) {
                if (visited.has(nId)) continue;
                visited.add(nId);
                next.push(nId);
                if (sysB.has(nId)) return [pids[i], pids[j]];
              }
            }
            frontier = next;
          }
        }
      }
    }
    return null;
  }

  _resolveBorderIncident() {
    const players = this._incidentPlayers;
    const choices = this._incidentChoices;
    this._incidentPlayers = null;
    this._incidentChoices = null;

    if (!players || !choices) return;

    // Default to de-escalate if no response
    const choice1 = choices.get(players[0]) || 'deescalate';
    const choice2 = choices.get(players[1]) || 'deescalate';

    const state1 = this.playerStates.get(players[0]);
    const state2 = this.playerStates.get(players[1]);
    const name1 = state1 ? state1.name : 'Unknown';
    const name2 = state2 ? state2.name : 'Unknown';

    let result;
    if (choice1 === 'deescalate' && choice2 === 'deescalate') {
      // Both de-escalate: +5 VP each
      result = 'both_deescalate';
      // VP is tracked via breakdown — add bonus VP directly
      if (state1) { state1._catalystVP = (state1._catalystVP || 0) + CATALYST_INCIDENT_BOTH_DEESCALATE_VP; }
      if (state2) { state2._catalystVP = (state2._catalystVP || 0) + CATALYST_INCIDENT_BOTH_DEESCALATE_VP; }
    } else if (choice1 === 'escalate' && choice2 === 'escalate') {
      // Both escalate: both go hostile, no VP
      result = 'both_escalate';
      this._forceHostile(players[0], players[1]);
    } else {
      // One escalates: escalator gets +3 VP, other forced to hostile stance
      result = 'one_escalate';
      const escalator = choice1 === 'escalate' ? players[0] : players[1];
      const victim = choice1 === 'escalate' ? players[1] : players[0];
      const escalatorState = this.playerStates.get(escalator);
      if (escalatorState) { escalatorState._catalystVP = (escalatorState._catalystVP || 0) + CATALYST_INCIDENT_ESCALATE_VP; }
      this._forceHostile(escalator, victim);
    }

    this._vpCacheTick = -1;
    this._invalidateStateCache();

    this._emitEvent('borderIncidentResult', null, {
      players,
      playerNames: [name1, name2],
      choices: { [players[0]]: choice1, [players[1]]: choice2 },
      result,
    }, true);
  }

  // Force mutual hostile stance between two players
  _forceHostile(pid1, pid2) {
    const state1 = this.playerStates.get(pid1);
    const state2 = this.playerStates.get(pid2);
    if (state1) {
      if (!state1.diplomacy[pid2]) state1.diplomacy[pid2] = { stance: DIPLOMACY_STANCES.NEUTRAL, cooldownTick: 0 };
      state1.diplomacy[pid2].stance = DIPLOMACY_STANCES.HOSTILE;
      state1.pendingFriendly.delete(pid2);
    }
    if (state2) {
      if (!state2.diplomacy[pid1]) state2.diplomacy[pid1] = { stance: DIPLOMACY_STANCES.NEUTRAL, cooldownTick: 0 };
      state2.diplomacy[pid1].stance = DIPLOMACY_STANCES.HOSTILE;
      state2.pendingFriendly.delete(pid1);
    }
    // Break any trade agreements between these players
    this._breakTradeAgreement(pid1, pid2);
    this._dirtyPlayers.add(pid1);
    this._dirtyPlayers.add(pid2);
  }

  _spawnPrecursorFleet() {
    // Spawn at galaxy center-ish system (system with most connections) or random far system
    let spawnSystemId = null;
    if (this.galaxy && this.galaxy.systems.length > 0) {
      // Pick the system with the most hyperlane connections (center of galaxy)
      let maxConnections = 0;
      for (const sys of this.galaxy.systems) {
        const connections = (this._adjacency.get(sys.id) || []).length;
        if (connections > maxConnections) {
          maxConnections = connections;
          spawnSystemId = sys.id;
        }
      }
    }

    if (spawnSystemId === null) return;

    // Find nearest colony to target
    const targetSystemId = this._findNearestColonySystem(spawnSystemId);
    if (!targetSystemId) return;

    const path = this._findPath(spawnSystemId, targetSystemId);
    if (!path || path.length === 0) return;

    // Find which colony is at the target system
    let targetColonyId = null;
    for (const [, colony] of this.colonies) {
      if (colony.systemId === targetSystemId) {
        targetColonyId = colony.id;
        break;
      }
    }

    this._precursorFleet = {
      id: this._nextId(),
      systemId: spawnSystemId,
      targetSystemId,
      targetColonyId,
      path,
      hopProgress: 0,
      hp: PRECURSOR_HP,
      attack: PRECURSOR_ATTACK,
    };

    for (const [playerId] of this.playerStates) this._dirtyPlayers.add(playerId);
    this._invalidateStateCache();
  }

  _processPrecursorMovement() {
    if (!this._precursorFleet) return;
    const fleet = this._precursorFleet;

    if (!fleet.path || fleet.path.length === 0) return;

    fleet.hopProgress++;

    if (fleet.hopProgress >= PRECURSOR_HOP_TICKS) {
      fleet.systemId = fleet.path.shift();
      fleet.hopProgress = 0;

      for (const [playerId] of this.playerStates) this._dirtyPlayers.add(playerId);
      this._invalidateStateCache();

      // Check if player military ships are at this system — they can intercept
      const shipsHere = this._militaryShipsBySystem.get(fleet.systemId);
      if (shipsHere && shipsHere.length > 0) {
        this._resolvePrecursorCombat(fleet, shipsHere);
        if (!this._precursorFleet) return; // fleet destroyed
      }

      // Arrived at target
      if (fleet.path.length === 0) {
        this._resolvePrecursorArrival(fleet);
      }
    }
  }

  _resolvePrecursorCombat(fleet, playerShips) {
    // Filter to idle ships only
    const idleShips = playerShips.filter(s => !s.path || s.path.length === 0);
    if (idleShips.length === 0) return;

    const systemName = (this.galaxy && this.galaxy.systems[fleet.systemId])
      ? this.galaxy.systems[fleet.systemId].name : `System ${fleet.systemId}`;

    // Track owners involved for VP/events
    const ownerShips = new Map();
    for (const ship of idleShips) {
      let arr = ownerShips.get(ship.ownerId);
      if (!arr) { arr = []; ownerShips.set(ship.ownerId, arr); }
      arr.push(ship);
    }

    // Broadcast combat started
    for (const [playerId] of this.playerStates) {
      this._emitEvent('precursorCombat', playerId, {
        systemId: fleet.systemId,
        systemName,
        precursorHp: fleet.hp,
        playerShips: idleShips.length,
      });
    }

    // Combat rounds
    for (let round = 0; round < PRECURSOR_COMBAT_TICKS; round++) {
      // Precursor attacks: target weakest player ship
      if (fleet.hp > 0) {
        let target = null;
        for (const ship of idleShips) {
          if (ship.hp <= 0) continue;
          if (!target || ship.hp < target.hp) target = ship;
        }
        if (target) {
          target.hp -= fleet.attack;
        }
      }

      // Player ships attack precursor
      for (const ship of idleShips) {
        if (ship.hp <= 0) continue;
        fleet.hp -= ship.attack;
        if (fleet.hp <= 0) break;
      }

      if (fleet.hp <= 0) break;
    }

    // Process ship losses
    const destroyed = [];
    for (const ship of idleShips) {
      if (ship.hp <= 0) {
        destroyed.push(ship);
        const lossCount = (this._shipsLost.get(ship.ownerId) || 0) + 1;
        this._shipsLost.set(ship.ownerId, lossCount);
      }
    }
    for (const ship of destroyed) {
      this._removeMilitaryShip(ship);
    }

    // Check if precursor destroyed
    if (fleet.hp <= 0) {
      // Find the owner with the most ships involved — they get the VP
      let bestOwner = null;
      let bestCount = 0;
      for (const [ownerId, ships] of ownerShips) {
        if (ships.length > bestCount) {
          bestCount = ships.length;
          bestOwner = ownerId;
        }
      }
      this._precursorDestroyedBy = bestOwner;
      this._precursorFleet = null;
      this._vpCacheTick = -1;

      this._emitEvent('precursorDestroyed', null, {
        systemId: fleet.systemId,
        systemName,
        destroyedBy: bestOwner,
        destroyerName: bestOwner ? (this.playerStates.get(bestOwner) || {}).name : 'Unknown',
        vpReward: PRECURSOR_DESTROY_VP,
      }, true);

      for (const [playerId] of this.playerStates) this._dirtyPlayers.add(playerId);
      this._invalidateStateCache();
    }
  }

  _resolvePrecursorArrival(fleet) {
    // Find colony at target system
    let targetColony = null;
    if (fleet.targetColonyId) {
      targetColony = this.colonies.get(fleet.targetColonyId);
    }
    if (!targetColony) {
      for (const [, colony] of this.colonies) {
        if (colony.systemId === fleet.systemId) {
          targetColony = colony;
          break;
        }
      }
    }

    if (!targetColony) {
      // No colony here — precursor dissipates
      this._precursorFleet = null;
      this._invalidateStateCache();
      return;
    }

    const ownerId = targetColony.ownerId;

    // Check for defense platform
    if (targetColony.defensePlatform && !targetColony.defensePlatform.building && targetColony.defensePlatform.hp > 0) {
      const platform = targetColony.defensePlatform;
      let precursorHp = fleet.hp;
      let platformHp = platform.hp;

      for (let t = 0; t < PRECURSOR_COMBAT_TICKS; t++) {
        platformHp -= fleet.attack;
        if (platformHp <= 0) break;
        precursorHp -= DEFENSE_PLATFORM_ATTACK;
        if (precursorHp <= 0) break;
      }

      platform.hp = Math.max(0, platformHp);

      if (precursorHp <= 0) {
        // Defense platform destroyed the precursor
        this._precursorDestroyedBy = ownerId;
        this._precursorFleet = null;
        this._vpCacheTick = -1;

        this._emitEvent('precursorDestroyed', null, {
          systemId: fleet.systemId,
          systemName: targetColony.name,
          destroyedBy: ownerId,
          destroyerName: (this.playerStates.get(ownerId) || {}).name || 'Unknown',
          vpReward: PRECURSOR_DESTROY_VP,
          byPlatform: true,
        }, true);

        for (const [playerId] of this.playerStates) this._dirtyPlayers.add(playerId);
        this._invalidateColonyCache(targetColony);
        this._invalidateStateCache();
        return;
      }

      fleet.hp = precursorHp;
    }

    // Check for military ships in system
    const shipsHere = this._militaryShipsBySystem.get(fleet.systemId);
    if (shipsHere && shipsHere.length > 0) {
      this._resolvePrecursorCombat(fleet, shipsHere);
      if (!this._precursorFleet) return; // destroyed by ships
    }

    // Precursor occupies the colony — production halved, VP penalty
    this._precursorOccupiedColonies.add(targetColony.id);
    this._vpCacheTick = -1;

    this._emitEvent('precursorOccupied', null, {
      colonyId: targetColony.id,
      colonyName: targetColony.name,
      systemId: fleet.systemId,
      ownerId,
      ownerName: (this.playerStates.get(ownerId) || {}).name || 'Unknown',
    }, true);

    // Precursor stays at colony — it's done moving
    this._invalidateColonyCache(targetColony);
    this._invalidateAllProductionCaches();
    this._invalidateStateCache();
    for (const [playerId] of this.playerStates) this._dirtyPlayers.add(playerId);

    // After occupying, retarget next nearest colony
    const nextTarget = this._findNearestColonySystem(fleet.systemId);
    if (nextTarget && nextTarget !== fleet.systemId) {
      const path = this._findPath(fleet.systemId, nextTarget);
      if (path && path.length > 0) {
        fleet.targetSystemId = nextTarget;
        fleet.path = path;
        fleet.hopProgress = 0;
        // Find colony at next target
        for (const [, colony] of this.colonies) {
          if (colony.systemId === nextTarget) {
            fleet.targetColonyId = colony.id;
            break;
          }
        }
      }
    }
  }

  // ── NPC Raider Fleet System ──

  _randomRaiderInterval() {
    return RAIDER_MIN_INTERVAL + Math.floor(Math.random() * (RAIDER_MAX_INTERVAL - RAIDER_MIN_INTERVAL));
  }

  // Find edge systems (systems with fewer connections — galactic rim)
  // Cached because galaxy topology never changes after generation
  _getEdgeSystems() {
    if (this._cachedEdgeSystems) return this._cachedEdgeSystems;
    const adj = this._adjacency;
    const edges = [];
    for (const sys of this.galaxy.systems) {
      const neighbors = adj.get(sys.id) || [];
      if (neighbors.length <= 2) edges.push(sys.id);
    }
    if (edges.length > 0) {
      this._cachedEdgeSystems = edges; // topology never changes — safe to cache
      return edges;
    }
    // Fallback: if no edge systems found, pick any unowned systems (not cached — ownership changes)
    for (const sys of this.galaxy.systems) {
      const isOwned = [...this.colonies.values()].some(c => c.systemId === sys.id);
      if (!isOwned) edges.push(sys.id);
    }
    return edges;
  }

  // Find nearest player colony to a system via BFS
  _findNearestColonySystem(fromSystemId) {
    const adj = this._adjacency;
    const visited = new Set([fromSystemId]);
    const queue = [fromSystemId];
    const colonySystems = new Set();
    for (const [, colony] of this.colonies) {
      colonySystems.add(colony.systemId);
    }

    let qi = 0;
    while (qi < queue.length) {
      const current = queue[qi++];
      if (colonySystems.has(current) && current !== fromSystemId) {
        return current;
      }
      const neighbors = adj.get(current) || [];
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    return null;
  }

  _processRaiderSpawning() {
    if (this.colonies.size === 0) return; // no colonies to raid

    if (this.tickCount >= this._nextRaiderTick) {
      const edgeSystems = this._getEdgeSystems();
      if (edgeSystems.length === 0) return;

      // Pick random edge system for spawn
      const spawnSystemId = edgeSystems[Math.floor(Math.random() * edgeSystems.length)];

      // Find nearest colony to target
      const targetSystemId = this._findNearestColonySystem(spawnSystemId);
      if (!targetSystemId) {
        // No reachable colony — try again later
        this._nextRaiderTick = this.tickCount + 100;
        return;
      }

      // Find path to target
      const path = this._findPath(spawnSystemId, targetSystemId);
      if (!path || path.length === 0) {
        this._nextRaiderTick = this.tickCount + 100;
        return;
      }

      // Find which colony is at the target system
      let targetColonyId = null;
      for (const [, colony] of this.colonies) {
        if (colony.systemId === targetSystemId) {
          targetColonyId = colony.id;
          break;
        }
      }

      const raider = {
        id: this._nextId(),
        systemId: spawnSystemId,
        targetSystemId,
        targetColonyId,
        path,
        hopProgress: 0,
        hp: RAIDER_HP,
      };
      this._raiders.push(raider);

      // Schedule next raider
      this._nextRaiderTick = this.tickCount + this._randomRaiderInterval();

      // Broadcast raider spawned to all players
      this._emitEvent('raiderSpawned', null, {
        raiderId: raider.id,
        systemId: spawnSystemId,
        targetSystemId,
      }, true);

      // Mark all players dirty for state broadcast
      for (const [playerId] of this.playerStates) this._dirtyPlayers.add(playerId);
      this._invalidateStateCache();
    }
  }

  _processRaiderMovement() {
    if (this._raiders.length === 0) return;
    const arrivals = [];
    let anyHopped = false;
    for (const raider of this._raiders) {
      if (!raider.path || raider.path.length === 0) continue;

      raider.hopProgress++;

      if (raider.hopProgress >= RAIDER_HOP_TICKS) {
        raider.systemId = raider.path.shift();
        raider.hopProgress = 0;
        anyHopped = true;

        if (raider.path.length === 0) {
          arrivals.push(raider);
        }
      }
    }

    // Only dirty players when a raider actually moved to a new system
    if (anyHopped) {
      for (const [playerId] of this.playerStates) this._dirtyPlayers.add(playerId);
      this._invalidateStateCache();
    }

    // Process arrivals at target systems
    for (const raider of arrivals) {
      this._resolveRaiderArrival(raider);
    }
  }

  _resolveRaiderArrival(raider) {
    // Find colony at target system
    let targetColony = null;
    if (raider.targetColonyId) {
      targetColony = this.colonies.get(raider.targetColonyId);
    }
    if (!targetColony) {
      // Colony may have been lost; find any colony at this system
      for (const [, colony] of this.colonies) {
        if (colony.systemId === raider.systemId) {
          targetColony = colony;
          break;
        }
      }
    }

    if (!targetColony) {
      // No colony here anymore — raider dissipates
      this._removeRaider(raider);
      return;
    }

    const ownerId = targetColony.ownerId;

    // Check for defense platform
    if (targetColony.defensePlatform && !targetColony.defensePlatform.building && targetColony.defensePlatform.hp > 0) {
      // Combat: platform vs raider over RAIDER_COMBAT_TICKS
      const platform = targetColony.defensePlatform;
      let raiderHp = raider.hp;
      let platformHp = platform.hp;

      for (let t = 0; t < RAIDER_COMBAT_TICKS; t++) {
        // Platform attacks raider
        raiderHp -= DEFENSE_PLATFORM_ATTACK;
        if (raiderHp <= 0) break;
        // Raider attacks platform
        platformHp -= RAIDER_ATTACK;
        if (platformHp <= 0) break;
      }

      platform.hp = Math.max(0, platformHp);

      if (raiderHp <= 0) {
        // Raider destroyed — player gets VP credit
        const count = (this._raidersDestroyed.get(ownerId) || 0) + 1;
        this._raidersDestroyed.set(ownerId, count);
        this._vpCacheTick = -1; // VP changed

        this._emitEvent('raiderDefeated', ownerId, {
          colonyId: targetColony.id,
          colonyName: targetColony.name,
          systemId: raider.systemId,
          platformHpRemaining: platform.hp,
        }, true);

        this._removeRaider(raider);
      } else {
        // Platform destroyed, raider raids the colony
        raider.hp = raiderHp;
        this._raidColony(raider, targetColony);
      }
    } else {
      // No defense — raid the colony
      this._raidColony(raider, targetColony);
    }

    this._dirtyPlayers.add(ownerId);
    this._invalidateColonyCache(targetColony);
    this._invalidateStateCache();
  }

  _raidColony(raider, colony) {
    const ownerId = colony.ownerId;
    const state = this.playerStates.get(ownerId);

    // Disable 2 random non-disabled districts for RAIDER_DISABLE_TICKS
    const enabledDistricts = colony.districts.filter(d => !d.disabled);
    // Shuffle and pick up to 2
    for (let i = enabledDistricts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [enabledDistricts[i], enabledDistricts[j]] = [enabledDistricts[j], enabledDistricts[i]];
    }
    const toDisable = enabledDistricts.slice(0, 2);
    const disabledIds = [];
    for (const d of toDisable) {
      d.disabled = true;
      d._raiderDisableTick = this.tickCount + RAIDER_DISABLE_TICKS;
      disabledIds.push(d.id);
    }
    if (toDisable.length > 0) this._raiderDisableTimers.add(colony.id);

    // Steal 50 of each resource (don't go below 0)
    if (state) {
      const stolen = {};
      for (const res of ['energy', 'minerals', 'food']) {
        const amount = Math.min(state.resources[res], RAIDER_RESOURCE_STOLEN);
        state.resources[res] -= amount;
        stolen[res] = amount;
      }

      this._emitEvent('colonyRaided', ownerId, {
        colonyId: colony.id,
        colonyName: colony.name,
        systemId: colony.systemId,
        districtsDisabled: disabledIds.length,
        resourcesStolen: stolen,
      }, true);
    }

    this._removeRaider(raider);
  }

  _removeRaider(raider) {
    const idx = this._raiders.indexOf(raider);
    if (idx !== -1) this._raiders.splice(idx, 1);
    for (const [playerId] of this.playerStates) this._dirtyPlayers.add(playerId);
    this._invalidateStateCache();
  }

  // Re-enable districts disabled by raiders after their timer expires
  // Only checks colonies with active disable timers (tracked in _raiderDisableTimers set)
  _processRaiderDisableTimers() {
    if (this._raiderDisableTimers.size === 0) return;
    for (const colonyId of this._raiderDisableTimers) {
      const colony = this.colonies.get(colonyId);
      if (!colony) { this._raiderDisableTimers.delete(colonyId); continue; }
      let changed = false;
      let anyRemaining = false;
      for (const d of colony.districts) {
        if (d._raiderDisableTick) {
          if (this.tickCount >= d._raiderDisableTick) {
            d.disabled = false;
            delete d._raiderDisableTick;
            changed = true;
          } else {
            anyRemaining = true;
          }
        }
      }
      if (!anyRemaining) this._raiderDisableTimers.delete(colonyId);
      if (changed) {
        this._invalidateColonyCache(colony);
        this._emitEvent('districtEnabled', colony.ownerId, {
          colonyId: colony.id,
          colonyName: colony.name,
          districtType: 'raider-disabled',
        });
      }
    }
  }

  // Repair defense platforms passively each month
  _processDefensePlatformRepair() {
    for (const [, colony] of this.colonies) {
      if (!colony.defensePlatform || colony.defensePlatform.building) continue;
      // Recalculate maxHp in case Shield Generator was built/destroyed since last check
      const effectiveMax = this._calcDefensePlatformMaxHP(colony);
      colony.defensePlatform.maxHp = effectiveMax;
      if (colony.defensePlatform.hp < colony.defensePlatform.maxHp) {
        colony.defensePlatform.hp = Math.min(
          colony.defensePlatform.maxHp,
          colony.defensePlatform.hp + DEFENSE_PLATFORM_REPAIR_RATE
        );
        this._dirtyPlayers.add(colony.ownerId);
        this._invalidateStateCache();
      }
    }
  }

  // Process defense platform construction — only checks colonies actively building
  _processDefensePlatformConstruction() {
    if (this._defensePlatformBuilding.size === 0) return;
    for (const colonyId of this._defensePlatformBuilding) {
      const colony = this.colonies.get(colonyId);
      if (!colony || !colony.defensePlatform || !colony.defensePlatform.building) {
        this._defensePlatformBuilding.delete(colonyId);
        continue;
      }
      colony.defensePlatform.buildTicksRemaining--;
      this._dirtyPlayers.add(colony.ownerId);
      if (colony.defensePlatform.buildTicksRemaining <= 0) {
        colony.defensePlatform.building = false;
        delete colony.defensePlatform.buildTicksRemaining;
        this._defensePlatformBuilding.delete(colonyId);
        this._invalidateStateCache();
        this._emitEvent('constructionComplete', colony.ownerId, {
          colonyId: colony.id,
          colonyName: colony.name,
          districtType: 'defensePlatform',
        });
      }
    }
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

        // Track match stats for construction
        const buildStats = this._matchStats.get(colony.ownerId);

        if (item.type === 'colonyShip') {
          if (buildStats) buildStats.shipsBuilt++;
          // Spawn colony ship at colony's system
          const shipId = this._nextId();
          const colonyShip = {
            id: shipId,
            ownerId: colony.ownerId,
            systemId: colony.systemId,
            targetSystemId: null,
            path: [],
            hopProgress: 0,
          };
          this._colonyShips.push(colonyShip);
          let cArr = this._colonyShipsByPlayer.get(colony.ownerId);
          if (!cArr) { cArr = []; this._colonyShipsByPlayer.set(colony.ownerId, cArr); }
          cArr.push(colonyShip);
          const ownerName = (this.playerStates.get(colony.ownerId) || {}).name || 'Unknown';
          this._emitEvent('constructionComplete', colony.ownerId, {
            colonyId: colony.id,
            colonyName: colony.name,
            districtType: 'colonyShip',
            shipId,
            playerName: ownerName,
          }, true);
        } else if (item.type === 'scienceShip') {
          if (buildStats) buildStats.shipsBuilt++;
          // Spawn science ship at colony's system
          const shipId = this._nextId();
          const sciShip = {
            id: shipId,
            ownerId: colony.ownerId,
            systemId: colony.systemId,
            targetSystemId: null,
            path: [],
            hopProgress: 0,
            surveying: false,
            surveyProgress: 0,
            autoSurvey: true,
          };
          this._scienceShips.push(sciShip);
          let sArr = this._scienceShipsByPlayer.get(colony.ownerId);
          if (!sArr) { sArr = []; this._scienceShipsByPlayer.set(colony.ownerId, sArr); }
          sArr.push(sciShip);
          const ownerName = (this.playerStates.get(colony.ownerId) || {}).name || 'Unknown';
          this._emitEvent('constructionComplete', colony.ownerId, {
            colonyId: colony.id,
            colonyName: colony.name,
            districtType: 'scienceShip',
            shipId,
            playerName: ownerName,
          }, true);
        } else if (item.type === 'corvette') {
          if (buildStats) buildStats.shipsBuilt++;
          // Spawn corvette at colony's system — use variant stats if specified
          const shipId = this._nextId();
          const vDef = item.variant ? CORVETTE_VARIANTS[item.variant] : null;
          this._addMilitaryShip({
            id: shipId,
            ownerId: colony.ownerId,
            systemId: colony.systemId,
            targetSystemId: null,
            path: [],
            hopProgress: 0,
            hp: vDef ? vDef.hp : CORVETTE_HP,
            attack: vDef ? vDef.attack : CORVETTE_ATTACK,
            variant: item.variant || null,
            regen: vDef ? vDef.regen : 0,
            maxHp: vDef ? vDef.hp : CORVETTE_HP,
          });
          const ownerName = (this.playerStates.get(colony.ownerId) || {}).name || 'Unknown';
          const variantLabel = item.variant ? CORVETTE_VARIANTS[item.variant].name : 'Corvette';
          this._emitEvent('constructionComplete', colony.ownerId, {
            colonyId: colony.id,
            colonyName: colony.name,
            districtType: item.variant ? `corvette-${item.variant}` : 'corvette',
            shipId,
            playerName: ownerName,
          }, true);
        } else {
          if (buildStats) buildStats.districtsBuilt++;
          const traitBefore = this._calcColonyTrait(colony);
          this._addBuiltDistrict(colony, item.type);
          // Check for surface anomaly at this district slot
          const districtSlot = colony.districts.length - 1;
          this._discoverSurfaceAnomaly(colony, districtSlot);
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

  // Process building construction queues
  _processBuildingConstruction() {
    for (const [, colony] of this.colonies) {
      if (!colony.buildingQueue || colony.buildingQueue.length === 0) continue;
      this._dirtyPlayers.add(colony.ownerId);
      const item = colony.buildingQueue[0];
      item.ticksRemaining--;
      if (item.ticksRemaining <= 0) {
        colony.buildingQueue.shift();
        colony.buildings.push({ id: item.id, type: item.type, slot: item.slot });
        this._invalidateColonyCache(colony);
        const ownerName = (this.playerStates.get(colony.ownerId) || {}).name || 'Unknown';
        this._emitEvent('constructionComplete', colony.ownerId, {
          colonyId: colony.id,
          colonyName: colony.name,
          districtType: item.type,
          playerName: ownerName,
        }, true);

        // If Shield Generator was built and colony has a defense platform, update maxHp
        const bDef = BUILDING_DEFS[item.type];
        if (bDef && bDef.defensePlatformHPBonus && colony.defensePlatform && !colony.defensePlatform.building) {
          colony.defensePlatform.maxHp = this._calcDefensePlatformMaxHP(colony);
          // HP is boosted immediately (shields activate)
          colony.defensePlatform.hp = Math.min(colony.defensePlatform.hp + bDef.defensePlatformHPBonus, colony.defensePlatform.maxHp);
        }

        if (colony.buildingQueue.length === 0 && colony.buildQueue.length === 0) {
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

    let qi = 0;
    while (qi < queue.length) {
      const current = queue[qi++];
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

  // Process military ship (corvette) movement each tick
  _processMilitaryShipMovement() {
    for (const ship of this._militaryShips) {
      if (!ship.path || ship.path.length === 0) continue;

      ship.hopProgress++;
      // Throttle dirty marking to every 5 ticks for ship movement animation
      if (this.tickCount % 5 === 0) {
        this._dirtyPlayers.add(ship.ownerId);
      }

      const shipHopTicks = ship.variant ? CORVETTE_VARIANTS[ship.variant].hopTicks : CORVETTE_HOP_TICKS;
      if (ship.hopProgress >= shipHopTicks) {
        // Update system index before changing systemId
        const oldSysArr = this._militaryShipsBySystem.get(ship.systemId);
        if (oldSysArr) {
          const si = oldSysArr.indexOf(ship);
          if (si !== -1) oldSysArr.splice(si, 1);
        }
        // Arrived at next system in path
        ship.systemId = ship.path.shift();
        ship.hopProgress = 0;
        // Add to new system index
        let newSysArr = this._militaryShipsBySystem.get(ship.systemId);
        if (!newSysArr) { newSysArr = []; this._militaryShipsBySystem.set(ship.systemId, newSysArr); }
        newSysArr.push(ship);
        this._dirtyPlayers.add(ship.ownerId);

        // Check if this system is the Resource Rush motherlode
        if (this._resourceRushSystem !== null && ship.systemId === this._resourceRushSystem && !this._resourceRushOwner) {
          this._claimResourceRush(ship.ownerId);
        }

        if (ship.path.length === 0) {
          // Arrived at final destination — clear target
          ship.targetSystemId = null;
        }
      }
    }

    // Ship state was mutated — clear cached JSON for fresh broadcasts
    if (this._dirtyPlayers.size > 0) this._invalidateStateCache();
  }

  // Check all systems for fleet combat after movement processing
  _checkFleetCombat() {
    // Use system index — only check systems that have ships
    for (const [systemId, ships] of this._militaryShipsBySystem) {
      if (ships.length < 2) continue;
      // Collect unique idle owners inline (no Set allocation — max 8 players)
      let ownerCount = 0;
      const owners = this._combatOwnersBuf || (this._combatOwnersBuf = []);
      owners.length = 0;
      for (const ship of ships) {
        if (ship.path && ship.path.length > 0) continue; // in transit
        let found = false;
        for (let k = 0; k < ownerCount; k++) {
          if (owners[k] === ship.ownerId) { found = true; break; }
        }
        if (!found) owners[ownerCount++] = ship.ownerId;
      }
      if (ownerCount < 2) continue;
      // Check if any pair of owners is hostile
      let hasHostilePair = false;
      for (let i = 0; i < ownerCount && !hasHostilePair; i++) {
        for (let j = i + 1; j < ownerCount; j++) {
          if (this._areHostile(owners[i], owners[j])) {
            hasHostilePair = true;
            break;
          }
        }
      }
      if (hasHostilePair) {
        this._resolveFleetCombat(systemId, ships);
      }
    }
  }

  // Resolve combat in a system between hostile players' ships
  _resolveFleetCombat(systemId, shipsInSystem) {
    // Gather idle ships at this system, grouped by owner — only include owners in hostile relationships
    const allByOwner = new Map();
    for (const ship of shipsInSystem) {
      if (ship.path && ship.path.length > 0) continue;
      let arr = allByOwner.get(ship.ownerId);
      if (!arr) { arr = []; allByOwner.set(ship.ownerId, arr); }
      arr.push(ship);
    }

    // Filter to only owners involved in at least one hostile relationship with another present owner
    const allOwners = [...allByOwner.keys()];
    const hostileOwners = new Set();
    for (let i = 0; i < allOwners.length; i++) {
      for (let j = i + 1; j < allOwners.length; j++) {
        if (this._areHostile(allOwners[i], allOwners[j])) {
          hostileOwners.add(allOwners[i]);
          hostileOwners.add(allOwners[j]);
        }
      }
    }

    const shipsByOwner = new Map();
    for (const ownerId of hostileOwners) {
      const ships = allByOwner.get(ownerId);
      if (ships && ships.length > 0) shipsByOwner.set(ownerId, ships);
    }

    const ownerIds = [...shipsByOwner.keys()];
    if (ownerIds.length < 2) return;

    // Record starting counts for event
    const startCounts = new Map();
    for (const [ownerId, ships] of shipsByOwner) {
      startCounts.set(ownerId, ships.length);
    }

    // Emit combatStarted event to all involved players
    const systemName = (this.galaxy && this.galaxy.systems[systemId]) ? this.galaxy.systems[systemId].name : `System ${systemId}`;
    const combatants = ownerIds.map(id => ({ playerId: id, ships: startCounts.get(id) }));
    for (const ownerId of ownerIds) {
      this._emitEvent('combatStarted', ownerId, { systemId, systemName, combatants });
    }
    // Broadcast to non-combatant players too
    for (const [pid] of this.playerStates) {
      if (!shipsByOwner.has(pid)) {
        this._emitEvent('combatStarted', pid, { systemId, systemName, combatants });
      }
    }

    // Combat rounds: up to FLEET_COMBAT_MAX_ROUNDS
    // Ships attack in priority order: interceptors first (3), sentinels (2), gunboats/base (1)
    for (let round = 0; round < FLEET_COMBAT_MAX_ROUNDS; round++) {
      // Collect all living ships with their attack priority
      const allLiving = [];
      for (const [ownerId, ships] of shipsByOwner) {
        for (const ship of ships) {
          if (ship.hp <= 0) continue;
          const priority = ship.variant ? CORVETTE_VARIANTS[ship.variant].priority : 1;
          allLiving.push({ ship, ownerId, priority });
        }
      }
      // Sort by priority descending (highest attacks first — interceptor speed advantage)
      allLiving.sort((a, b) => b.priority - a.priority);

      const damageMap = new Map(); // ship -> accumulated damage this round

      for (const { ship, ownerId } of allLiving) {
        if (ship.hp <= 0) continue; // may have been killed earlier this round
        // Counter-targeting: prioritize the variant this ship counters
        const counterTarget = ship.variant ? CORVETTE_VARIANTS[ship.variant].counters : null;
        let target = null;
        for (const [enemyId, enemyShips] of shipsByOwner) {
          if (enemyId === ownerId) continue;
          for (const es of enemyShips) {
            if (es.hp <= 0) continue;
            if (!target) { target = es; continue; }
            // Prefer counter-target variant
            const esIsCounter = es.variant === counterTarget;
            const tgIsCounter = target.variant === counterTarget;
            if (esIsCounter && !tgIsCounter) { target = es; }
            else if (esIsCounter === tgIsCounter) {
              // Same counter status — focus fire lowest HP
              if (es.hp < target.hp) target = es;
            }
          }
        }
        if (target) {
          damageMap.set(target, (damageMap.get(target) || 0) + ship.attack);
        }
      }

      // Apply damage simultaneously
      for (const [ship, dmg] of damageMap) {
        ship.hp -= dmg;
      }

      // Sentinel regen: heal after damage resolution
      for (const { ship } of allLiving) {
        if (ship.hp > 0 && ship.regen && ship.regen > 0) {
          ship.hp = Math.min(ship.hp + ship.regen, ship.maxHp || ship.hp);
        }
      }

      // Remove destroyed ships and count losses
      for (const [ownerId, ships] of shipsByOwner) {
        for (let i = ships.length - 1; i >= 0; i--) {
          if (ships[i].hp <= 0) {
            this._removeMilitaryShip(ships[i]);
            ships.splice(i, 1);
            const lost = (this._shipsLost.get(ownerId) || 0) + 1;
            this._shipsLost.set(ownerId, lost);
          }
        }
      }

      // Check if combat is over (only one side or zero remaining)
      let sidesAlive = 0;
      for (const [, ships] of shipsByOwner) {
        if (ships.length > 0) sidesAlive++;
      }
      if (sidesAlive <= 1) break;
    }

    // Determine winner (side with surviving ships)
    let winnerId = null;
    const losses = {};
    for (const ownerId of ownerIds) {
      const remaining = (shipsByOwner.get(ownerId) || []).length;
      const started = startCounts.get(ownerId);
      losses[ownerId] = started - remaining;
      if (remaining > 0) winnerId = ownerId;
    }

    // Award VP for battle won
    if (winnerId) {
      const won = (this._battlesWon.get(winnerId) || 0) + 1;
      this._battlesWon.set(winnerId, won);
    }

    // Invalidate VP cache
    this._vpCacheTick = -1;

    // Emit combatResult to all players (result is not mutated, no need to spread-copy)
    const result = {
      systemId, systemName, winnerId, losses,
      survivors: {},
    };
    for (const ownerId of ownerIds) {
      result.survivors[ownerId] = (shipsByOwner.get(ownerId) || []).length;
    }
    for (const [pid] of this.playerStates) {
      this._emitEvent('combatResult', pid, result);
    }

    // Mark all combatants dirty
    for (const ownerId of ownerIds) {
      this._dirtyPlayers.add(ownerId);
    }
    this._invalidateStateCache();
  }

  // Process colony occupation progress each tick
  _processOccupation() {
    let changed = false;
    for (const colony of this.colonies.values()) {
      const systemId = colony.systemId;
      if (systemId == null) continue;

      const shipsHere = this._militaryShipsBySystem.get(systemId);

      // Fast path: no military ships in system at all
      if (!shipsHere || shipsHere.length === 0) {
        if (colony.occupiedBy) continue; // occupied but no ships — status quo
        if (colony.occupationProgress > 0) {
          colony.occupationProgress = 0;
          changed = true;
        }
        continue;
      }

      // Scan idle ships — track defender/attacker presence inline (no Set allocation)
      let defenderPresent = false;
      let occupierPresent = false;
      let attackerId = null;
      for (const ship of shipsHere) {
        if (ship.path && ship.path.length > 0) continue; // in transit
        if (ship.ownerId === colony.ownerId) {
          defenderPresent = true;
        } else {
          if (colony.occupiedBy && ship.ownerId === colony.occupiedBy) occupierPresent = true;
          if (!attackerId) attackerId = ship.ownerId;
        }
      }

      // Check if colony is already occupied — handle liberation
      if (colony.occupiedBy) {
        // Liberation: defender has ships, occupier does not
        if (defenderPresent && !occupierPresent) {
          const systemName = (this.galaxy && this.galaxy.systems[systemId]) ? this.galaxy.systems[systemId].name : `System ${systemId}`;
          const prevOccupier = colony.occupiedBy;
          colony.occupiedBy = null;
          colony.occupationProgress = 0;
          colony._cachedProduction = null; // invalidate production cache
          this._emitEvent('colonyLiberated', colony.ownerId, { colonyId: colony.id, colonyName: colony.name, systemId, systemName, liberatedFrom: prevOccupier }, true);
          this._dirtyPlayers.add(colony.ownerId);
          this._dirtyPlayers.add(prevOccupier);
          this._vpCacheTick = -1;
          changed = true;
        }
        continue; // already occupied, skip occupation progress
      }

      if (defenderPresent) {
        // Defender has ships — reset any occupation progress
        if (colony.occupationProgress > 0) {
          colony.occupationProgress = 0;
          changed = true;
        }
        continue;
      }

      if (!attackerId) {
        // Only defender's in-transit ships here — reset progress
        if (colony.occupationProgress > 0) {
          colony.occupationProgress = 0;
          changed = true;
        }
        continue;
      }

      // Occupation requires hostile stance — neutral/friendly ships don't occupy
      if (!this._areHostile(attackerId, colony.ownerId)) {
        if (colony.occupationProgress > 0) {
          colony.occupationProgress = 0;
          changed = true;
        }
        continue;
      }

      // Increment occupation progress
      colony.occupationProgress++;
      changed = true;

      // Check if occupation is complete
      if (colony.occupationProgress >= OCCUPATION_TICKS) {
        colony.occupiedBy = attackerId;
        colony._cachedProduction = null; // invalidate production cache
        const systemName = (this.galaxy && this.galaxy.systems[systemId]) ? this.galaxy.systems[systemId].name : `System ${systemId}`;
        const attackerState = this.playerStates.get(attackerId);
        const attackerName = attackerState ? attackerState.name : 'Unknown';
        this._emitEvent('colonyOccupied', colony.ownerId, { colonyId: colony.id, colonyName: colony.name, systemId, systemName, occupantId: attackerId, occupantName: attackerName }, true);
        this._dirtyPlayers.add(colony.ownerId);
        this._dirtyPlayers.add(attackerId);
        this._vpCacheTick = -1;
      }
    }
    if (changed) this._invalidateStateCache();
  }

  // Add a military ship and update indices
  _addMilitaryShip(ship) {
    this._militaryShips.push(ship);
    this._militaryShipsById.set(ship.id, ship);
    let arr = this._militaryShipsByPlayer.get(ship.ownerId);
    if (!arr) { arr = []; this._militaryShipsByPlayer.set(ship.ownerId, arr); }
    arr.push(ship);
    let sysArr = this._militaryShipsBySystem.get(ship.systemId);
    if (!sysArr) { sysArr = []; this._militaryShipsBySystem.set(ship.systemId, sysArr); }
    sysArr.push(ship);
  }

  // Remove a military ship by reference and update indices
  _removeMilitaryShip(ship) {
    const idx = this._militaryShips.indexOf(ship);
    if (idx !== -1) this._militaryShips.splice(idx, 1);
    this._militaryShipsById.delete(ship.id);
    const arr = this._militaryShipsByPlayer.get(ship.ownerId);
    if (arr) {
      const pi = arr.indexOf(ship);
      if (pi !== -1) arr.splice(pi, 1);
    }
    const sysArr = this._militaryShipsBySystem.get(ship.systemId);
    if (sysArr) {
      const si = sysArr.indexOf(ship);
      if (si !== -1) sysArr.splice(si, 1);
    }
    this._vpCacheTick = -1; // VP depends on corvette count
  }

  // Get corvette count for a player — O(1)
  _playerCorvetteCount(playerId) {
    const arr = this._militaryShipsByPlayer.get(playerId);
    return arr ? arr.length : 0;
  }

  // Count idle civilian ships for a player using per-player index — O(ships_owned) not O(all_ships)
  _countIdleCivilianShips(playerId, type) {
    const ships = type === 'colony'
      ? this._colonyShipsByPlayer.get(playerId)
      : this._scienceShipsByPlayer.get(playerId);
    if (!ships) return 0;
    let count = 0;
    for (const s of ships) {
      if (s.path && s.path.length > 0) continue;
      if (type === 'science' && s.surveying) continue;
      count++;
    }
    return count;
  }

  // Remove a colony ship by reference (in-place splice, no new array)
  _removeColonyShip(ship) {
    const idx = this._colonyShips.indexOf(ship);
    if (idx !== -1) this._colonyShips.splice(idx, 1);
    const pArr = this._colonyShipsByPlayer.get(ship.ownerId);
    if (pArr) { const pi = pArr.indexOf(ship); if (pi !== -1) pArr.splice(pi, 1); }
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

    // Check system claim — enemy claims block colonization
    const claimOwner = this._systemClaims.get(ship.targetSystemId);
    if (claimOwner && claimOwner !== ship.ownerId) {
      this._emitEvent('colonyShipFailed', ship.ownerId, {
        systemName: system.name,
        reason: 'System claimed by another player',
      });
      this._removeColonyShip(ship);
      this._dirtyPlayers.add(ship.ownerId);
      return;
    }

    // Check system control — enemy corvettes block colonization (use system index)
    const sysShips = this._militaryShipsBySystem.get(ship.targetSystemId) || [];
    const enemyMilitary = sysShips.some(s =>
      s.ownerId !== ship.ownerId && (!s.path || s.path.length === 0)
    );
    if (enemyMilitary) {
      this._emitEvent('colonyShipFailed', ship.ownerId, {
        systemName: system.name,
        reason: 'Enemy fleet controls system',
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
    const colonyName = this._generateColonyName(planet.type);
    const colony = this._createColony(ship.ownerId, colonyName, {
      size: planet.size,
      type: planet.type,
      habitability: planet.habitability,
    }, ship.targetSystemId);
    colony.pops = COLONY_SHIP_STARTING_POPS;
    colony.isStartingColony = false;

    // Colony established bonus: free mining district from colony ship materials
    this._addBuiltDistrict(colony, 'mining');

    // Remove ship
    this._removeColonyShip(ship);

    // Track match stats
    const stats = this._matchStats.get(ship.ownerId);
    if (stats) stats.coloniesFounded++;

    // Emit colony founded event (broadcast to all players)
    const playerState = this.playerStates.get(ship.ownerId);
    this._emitEvent('colonyFounded', ship.ownerId, {
      colonyId: colony.id,
      colonyName: colony.name,
      systemName: system.name,
      planetType: planet.type,
      playerName: playerState ? playerState.name : 'Unknown',
    }, true);

    // Check Resource Rush claim via colonization
    if (this._resourceRushSystem !== null && ship.targetSystemId === this._resourceRushSystem && !this._resourceRushOwner) {
      this._claimResourceRush(ship.ownerId);
    }

    // Underdog bonus changes when colony count changes — invalidate all production caches
    this._invalidateAllProductionCaches();
    this._invalidateStateCache();
    this._vpCacheTick = -1;
  }

  // Process science ship movement and surveying each tick
  _processScienceShipMovement() {
    const completed = [];
    const expeditionsDone = [];
    for (const ship of this._scienceShips) {
      // Ship is on an expedition
      if (ship.expedition) {
        ship.expeditionProgress++;
        if (this.tickCount % 5 === 0) this._dirtyPlayers.add(ship.ownerId);
        if (ship.expeditionProgress >= ship.expeditionTicks) {
          expeditionsDone.push(ship);
        }
        continue;
      }

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

    // Process completed expeditions
    for (const ship of expeditionsDone) {
      this._completeExpedition(ship);
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

    // Check scouting race VP milestones
    const surveyedCount = this._surveyedSystems.get(ship.ownerId) ? this._surveyedSystems.get(ship.ownerId).size : 0;
    for (const threshold of Object.keys(SCOUT_MILESTONES)) {
      const t = Number(threshold);
      if (surveyedCount >= t && this._scoutMilestones[t] === null) {
        this._scoutMilestones[t] = ship.ownerId;
        const vpAwarded = SCOUT_MILESTONES[t];
        this._emitEvent('scoutMilestone', ship.ownerId, {
          threshold: t,
          vp: vpAwarded,
          playerName: ownerName,
        }, true);
      }
    }

    // Auto-chain: find next unsurveyed system within 3 hops and dispatch
    this._autoChainSurvey(ship);
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

  // Auto-chain: find nearest unsurveyed system within 3 hops and dispatch.
  // Single BFS with parent tracking — no redundant _findPath call.
  _autoChainSurvey(ship) {
    if (!ship.autoSurvey) return false;
    if (!this.galaxy) return false;

    const surveyed = this._surveyedSystems.get(ship.ownerId) || new Set();
    const adj = this._adjacency;
    const maxDepth = 3;

    // BFS from ship's current position, max 3 hops, tracking parents for path reconstruction
    const parent = new Map();
    const visited = new Set([ship.systemId]);
    let frontier = [ship.systemId];
    for (let depth = 1; depth <= maxDepth; depth++) {
      const nextFrontier = [];
      for (const sysId of frontier) {
        const neighbors = adj.get(sysId) || [];
        for (const neighbor of neighbors) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          parent.set(neighbor, sysId);

          // Found an unsurveyed system — reconstruct path and dispatch
          if (!surveyed.has(neighbor)) {
            const path = [];
            let node = neighbor;
            while (node !== ship.systemId) {
              path.push(node);
              node = parent.get(node);
            }
            path.reverse();
            ship.targetSystemId = neighbor;
            ship.path = path;
            ship.hopProgress = 0;
            this._dirtyPlayers.add(ship.ownerId);
            this._invalidateStateCache();
            return true;
          }
          nextFrontier.push(neighbor);
        }
      }
      frontier = nextFrontier;
    }
    return false; // No unsurveyed system within range
  }

  // Complete an expedition — award VP or handle failure for risky expeditions
  _completeExpedition(ship) {
    const expedType = EXPEDITION_TYPES[ship.expedition];
    if (!expedType) return;

    let vpAwarded = 0;
    let success = true;

    if (expedType.risk) {
      // Risk/reward: chance of failure
      const roll = Math.random();
      if (roll < expedType.failChance) {
        success = false;
      }
    }

    if (success) {
      vpAwarded = expedType.vp;
      if (!this._expeditionVP.has(ship.ownerId)) this._expeditionVP.set(ship.ownerId, 0);
      this._expeditionVP.set(ship.ownerId, this._expeditionVP.get(ship.ownerId) + vpAwarded);
    }

    if (!this._completedExpeditions.has(ship.ownerId)) this._completedExpeditions.set(ship.ownerId, 0);
    this._completedExpeditions.set(ship.ownerId, this._completedExpeditions.get(ship.ownerId) + 1);

    this._emitEvent('expeditionComplete', ship.ownerId, {
      expeditionType: ship.expedition,
      name: expedType.name,
      success,
      vp: vpAwarded,
      systemName: this.galaxy ? this.galaxy.systems[ship.systemId]?.name || `System ${ship.systemId}` : `System ${ship.systemId}`,
    });

    // Clear expedition state — ship becomes idle
    ship.expedition = null;
    ship.expeditionProgress = 0;
    ship.expeditionTicks = 0;
    this._dirtyPlayers.add(ship.ownerId);
    this._invalidateStateCache();
    this._vpCacheTick = -1;
  }

  // Remove a science ship by reference
  _removeScienceShip(ship) {
    const idx = this._scienceShips.indexOf(ship);
    if (idx !== -1) this._scienceShips.splice(idx, 1);
    const pArr = this._scienceShipsByPlayer.get(ship.ownerId);
    if (pArr) { const pi = pArr.indexOf(ship); if (pi !== -1) pArr.splice(pi, 1); }
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
      const empty = { vp: 0, pops: 0, popsVP: 0, districts: 0, districtsVP: 0, alloys: 0, alloysVP: 0, totalResearch: 0, researchVP: 0, techs: 0, techVP: 0, traits: 0, traitsVP: 0, surveyed: 0, surveyedVP: 0, scoutMilestonesVP: 0, claimedSystems: 0, claimsVP: 0, raidersDestroyed: 0, raidersVP: 0, corvettes: 0, militaryVP: 0, battlesWon: 0, battlesWonVP: 0, shipsLost: 0, shipsLostVP: 0, coloniesOccupying: 0, occupiedAttackerVP: 0, coloniesOccupied: 0, occupiedDefenderVP: 0, friendlyCount: 0, mutualFriendlyCount: 0, diplomacyVP: 0, expeditionsCompleted: 0, expeditionVP: 0 };
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

    // Scouting race milestone VP: first-to-survey bonuses
    let scoutMilestonesVP = 0;
    for (const [threshold, vpBonus] of Object.entries(SCOUT_MILESTONES)) {
      if (this._scoutMilestones[Number(threshold)] === playerId) {
        scoutMilestonesVP += vpBonus;
      }
    }

    // Raider VP: +5 per raider destroyed
    const raidersDestroyed = this._raidersDestroyed.get(playerId) || 0;
    const raidersVP = raidersDestroyed * RAIDER_DESTROY_VP;

    // Military VP: +1 per corvette owned
    const corvettes = this._playerCorvetteCount(playerId);
    const militaryVP = corvettes;

    // Fleet combat VP: +5 per battle won, -2 per own ship lost
    const battlesWon = this._battlesWon.get(playerId) || 0;
    const battlesWonVP = battlesWon * FLEET_BATTLE_WON_VP;
    const shipsLost = this._shipsLost.get(playerId) || 0;
    const shipsLostVP = shipsLost > 0 ? shipsLost * FLEET_SHIP_LOST_VP : 0;

    // Occupation VP: attacker gains VP for colonies they occupy, defender loses VP for colonies occupied by others
    let occupiedAttackerVP = 0;
    let occupiedDefenderVP = 0;
    let coloniesOccupying = 0;
    let coloniesOccupied = 0;
    // Count colonies this player is occupying (attacker VP)
    for (const colony of this.colonies.values()) {
      if (colony.occupiedBy === playerId && colony.ownerId !== playerId) {
        coloniesOccupying++;
      }
    }
    occupiedAttackerVP = coloniesOccupying * OCCUPATION_ATTACKER_VP;
    // Count own colonies that are occupied by someone else (defender VP penalty)
    for (const colonyId of colonyIds) {
      const colony = this.colonies.get(colonyId);
      if (colony && colony.occupiedBy && colony.occupiedBy !== colony.ownerId) {
        coloniesOccupied++;
      }
    }
    occupiedDefenderVP = coloniesOccupied * OCCUPATION_DEFENDER_VP;

    // Diplomacy VP: +5 per friendly relationship, +10 if mutual
    let friendlyCount = 0;
    let mutualFriendlyCount = 0;
    let diplomacyVP = 0;
    for (const [otherId] of this.playerStates) {
      if (otherId === playerId) continue;
      const myStance = this._getStance(playerId, otherId);
      const theirStance = this._getStance(otherId, playerId);
      if (myStance === DIPLOMACY_STANCES.FRIENDLY && theirStance === DIPLOMACY_STANCES.FRIENDLY) {
        mutualFriendlyCount++;
        diplomacyVP += MUTUAL_FRIENDLY_VP;
      } else if (myStance === DIPLOMACY_STANCES.FRIENDLY) {
        friendlyCount++;
        diplomacyVP += FRIENDLY_VP;
      }
    }

    // System claims VP: +1 per claimed system
    let claimedSystems = 0;
    for (const [, owner] of this._systemClaims) {
      if (owner === playerId) claimedSystems++;
    }
    const claimsVP = claimedSystems * SYSTEM_CLAIM_VP;

    // Endgame crisis VP: +15 for destroying precursor, -5 per colony occupied by precursor
    let precursorVP = 0;
    if (this._precursorDestroyedBy === playerId) {
      precursorVP += PRECURSOR_DESTROY_VP;
    }
    let precursorOccupiedCount = 0;
    for (const colonyId of this._precursorOccupiedColonies) {
      const colony = this.colonies.get(colonyId);
      if (colony && colony.ownerId === playerId) {
        precursorOccupiedCount++;
      }
    }
    precursorVP += precursorOccupiedCount * PRECURSOR_OCCUPY_VP;

    // Catalyst event VP (border incident)
    const catalystVP = state._catalystVP || 0;

    // Expedition VP: accumulated from completed science ship expeditions
    const expeditionsCompleted = this._completedExpeditions.get(playerId) || 0;
    const expeditionVP = this._expeditionVP.get(playerId) || 0;

    const vp = popsVP + totalDistricts + alloysVP + researchVP + techVP + traitsVP + surveyedVP + scoutMilestonesVP + raidersVP + militaryVP + battlesWonVP + shipsLostVP + occupiedAttackerVP + occupiedDefenderVP + diplomacyVP + precursorVP + catalystVP + claimsVP + expeditionVP;
    const breakdown = {
      vp, pops: totalPops, popsVP,
      districts: totalDistricts, districtsVP: totalDistricts,
      alloys: state.resources.alloys, alloysVP,
      totalResearch, researchVP,
      techs: (state.completedTechs || []).length, techVP,
      traits: traitCount, traitsVP,
      surveyed, surveyedVP,
      scoutMilestonesVP,
      claimedSystems, claimsVP,
      raidersDestroyed, raidersVP,
      corvettes, militaryVP,
      battlesWon, battlesWonVP,
      shipsLost, shipsLostVP,
      coloniesOccupying, occupiedAttackerVP,
      coloniesOccupied, occupiedDefenderVP,
      friendlyCount, mutualFriendlyCount, diplomacyVP,
      precursorVP, precursorOccupiedCount,
      catalystVP,
      expeditionsCompleted, expeditionVP,
      victoryProgress: this._calcVictoryProgress(playerId),
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

  // Check distinct victory conditions — called monthly
  _checkVictoryConditions() {
    if (this._gameOver) return;
    for (const [playerId, state] of this.playerStates) {
      // Scientific Victory: complete all 9 techs
      const techCount = (state.completedTechs || []).length;
      if (techCount >= TOTAL_TECHS) {
        this._triggerGameOver({ type: 'scientific', playerId, playerName: state.name });
        return;
      }

      // Military Victory: occupy 3+ enemy colonies
      let occupying = 0;
      for (const colony of this.colonies.values()) {
        if (colony.occupiedBy === playerId && colony.ownerId !== playerId) {
          occupying++;
        }
      }
      if (occupying >= MILITARY_VICTORY_OCCUPATIONS) {
        this._triggerGameOver({ type: 'military', playerId, playerName: state.name });
        return;
      }

      // Economic Victory: 500+ alloys AND 3+ colony traits
      let traitCount = 0;
      const colonyIds = this._playerColonies.get(playerId) || [];
      for (const colonyId of colonyIds) {
        const colony = this.colonies.get(colonyId);
        if (colony && this._calcColonyTrait(colony)) traitCount++;
      }
      if (state.resources.alloys >= ECONOMIC_VICTORY_ALLOYS && traitCount >= ECONOMIC_VICTORY_TRAITS) {
        this._triggerGameOver({ type: 'economic', playerId, playerName: state.name });
        return;
      }
    }
  }

  // Calculate victory progress for all players (tick-scoped cache — avoids re-iterating all
  // colonies per player during serialization, which is called once per dirty player per broadcast)
  _calcVictoryProgress(playerId) {
    if (this._victoryProgressCacheTick === this.tickCount) {
      const cached = this._victoryProgressCache.get(playerId);
      if (cached) return cached;
    } else {
      this._victoryProgressCacheTick = this.tickCount;
      this._victoryProgressCache.clear();
    }

    const state = this.playerStates.get(playerId);
    if (!state) return { scientific: { current: 0, target: TOTAL_TECHS }, military: { current: 0, target: MILITARY_VICTORY_OCCUPATIONS }, economic: { alloys: 0, alloysTarget: ECONOMIC_VICTORY_ALLOYS, traits: 0, traitsTarget: ECONOMIC_VICTORY_TRAITS } };

    const techCount = (state.completedTechs || []).length;

    let occupying = 0;
    for (const colony of this.colonies.values()) {
      if (colony.occupiedBy === playerId && colony.ownerId !== playerId) {
        occupying++;
      }
    }

    let traitCount = 0;
    const colonyIds = this._playerColonies.get(playerId) || [];
    for (const colonyId of colonyIds) {
      const colony = this.colonies.get(colonyId);
      if (colony && this._calcColonyTrait(colony)) traitCount++;
    }

    const progress = {
      scientific: { current: techCount, target: TOTAL_TECHS },
      military: { current: occupying, target: MILITARY_VICTORY_OCCUPATIONS },
      economic: { alloys: Math.floor(state.resources.alloys), alloysTarget: ECONOMIC_VICTORY_ALLOYS, traits: traitCount, traitsTarget: ECONOMIC_VICTORY_TRAITS },
    };
    this._victoryProgressCache.set(playerId, progress);
    return progress;
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
  // victoryInfo: optional { type: 'scientific'|'military'|'economic', playerId, playerName }
  _triggerGameOver(victoryInfo) {
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

    // Determine winner: instant-win player OR highest VP
    let winner;
    if (victoryInfo) {
      const score = scores.find(s => s.playerId === victoryInfo.playerId);
      winner = score || scores[0] || null;
    } else {
      winner = scores.length > 0 ? scores[0] : null;
    }

    // Compute match duration in seconds (wall clock)
    const matchDurationMs = Date.now() - this._matchStartTime;
    const matchDurationSec = Math.floor(matchDurationMs / 1000);

    // Attach per-player match stats to scores
    for (const s of scores) {
      const ms = this._matchStats.get(s.playerId);
      s.matchStats = ms ? { ...ms, resourcesGathered: { ...ms.resourcesGathered } } : {
        coloniesFounded: 0, districtsBuilt: 0, shipsBuilt: 0,
        resourcesGathered: { energy: 0, minerals: 0, food: 0, alloys: 0 },
      };
    }

    const gameOverData = {
      winner: winner ? { playerId: winner.playerId, name: winner.name, vp: winner.vp } : null,
      victoryType: victoryInfo ? victoryInfo.type : 'vp',
      scores,
      finalTick: this.tickCount,
      matchDurationSec,
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

        // Check completion (tech discount: -15% cost per player who already completed it)
        const effectiveCost = Math.round(tech.cost * this._calcTechDiscount(techId));
        if (state.researchProgress[techId] >= effectiveCost) {
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

    // Process doctrine selection phase (auto-assign after 30 seconds)
    this._processDoctrinePhase();

    // Process construction every tick
    this._processConstruction();
    this._processBuildingConstruction();

    // Process defense platform construction every tick
    this._processDefensePlatformConstruction();

    // Process colony ship movement every tick
    this._processColonyShipMovement();

    // Process military ship (corvette) movement every tick
    this._processMilitaryShipMovement();

    // Check for fleet combat after movement
    this._checkFleetCombat();

    // Process colony occupation progress
    this._processOccupation();

    // Process science ship movement and surveying every tick
    this._processScienceShipMovement();

    // Process colony crises every tick
    this._processColonyCrises();

    // Pop growth every tick
    this._processPopGrowth();

    // Scarcity season processing every tick
    this._processScarcitySeason();

    // Endgame crisis processing
    this._processEndgameCrisis();
    this._processPrecursorMovement();

    // Mid-game catalyst events
    this._processCatalystEvents();

    // NPC raider fleet processing every tick
    this._processRaiderSpawning();
    this._processRaiderMovement();
    this._processRaiderDisableTimers();

    // Monthly processing (every 100 ticks)
    if (this.tickCount % MONTH_TICKS === 0) {
      this._processMonthlyResources();
      this._processEnergyDeficit();
      this._processResearch();
      this._processPopStarvation();
      this._processEdicts();
      this._processInfluenceIncome();
      this._processDefensePlatformRepair();
      this._checkVictoryConditions();
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

      case 'buildBuilding': {
        const { colonyId, buildingType } = cmd;
        if (!colonyId || !buildingType) return { error: 'Missing parameters' };
        const colony = this.colonies.get(colonyId);
        if (!colony) return { error: 'Colony not found' };
        if (colony.ownerId !== playerId) return { error: 'Not your colony' };

        const bDef = BUILDING_DEFS[buildingType];
        if (!bDef) return { error: 'Invalid building type' };

        // Check how many building slots are unlocked
        let unlockedSlots = 0;
        for (const threshold of BUILDING_SLOT_THRESHOLDS) {
          if (colony.pops >= threshold) unlockedSlots++;
        }
        const usedSlots = colony.buildings.length + colony.buildingQueue.length;
        if (usedSlots >= unlockedSlots) {
          return { error: 'No building slots available' };
        }

        // Check duplicate — max 1 of each type per colony (built + queued)
        const hasDuplicate = colony.buildings.some(b => b.type === buildingType) ||
                             colony.buildingQueue.some(b => b.type === buildingType);
        if (hasDuplicate) {
          return { error: 'Already have this building type' };
        }

        // T2 building prerequisites: requires specific tech + base building
        if (bDef.requires) {
          const state_ = this.playerStates.get(playerId);
          if (bDef.requires.tech && !(state_.completedTechs || []).includes(bDef.requires.tech)) {
            return { error: `Requires ${TECH_TREE[bDef.requires.tech].name}` };
          }
          if (bDef.requires.building) {
            const hasBase = colony.buildings.some(b => b.type === bDef.requires.building);
            if (!hasBase) {
              return { error: `Requires ${BUILDING_DEFS[bDef.requires.building].label}` };
            }
          }
        }

        // Check resource cost
        const state = this.playerStates.get(playerId);
        for (const [resource, amount] of Object.entries(bDef.cost)) {
          if (!Number.isFinite(state.resources[resource]) || state.resources[resource] < amount) {
            return { error: `Not enough ${resource}` };
          }
        }

        // Deduct resources
        for (const [resource, amount] of Object.entries(bDef.cost)) {
          state.resources[resource] -= amount;
        }

        const slot = usedSlots; // 0-indexed slot
        const id = this._nextId();
        colony.buildingQueue.push({ id, type: buildingType, slot, ticksRemaining: bDef.buildTime });
        this._dirtyPlayers.add(playerId);
        this._invalidateColonyCache(colony);
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
          const costTable = qItem.type === 'colonyShip' ? COLONY_SHIP_COST : qItem.type === 'scienceShip' ? SCIENCE_SHIP_COST : qItem.type === 'corvette' ? CORVETTE_COST : (DISTRICT_DEFS[qItem.type] || {}).cost;
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

        // Check built buildings
        const bIdx = colony.buildings.findIndex(b => b.id === districtId);
        if (bIdx !== -1) {
          colony.buildings.splice(bIdx, 1);
          this._invalidateColonyCache(colony);
          return { ok: true };
        }

        // Check building queue — cancel with 50% resource refund
        const bqIdx = colony.buildingQueue.findIndex(b => b.id === districtId);
        if (bqIdx !== -1) {
          const bqItem = colony.buildingQueue[bqIdx];
          const bCostTable = (BUILDING_DEFS[bqItem.type] || {}).cost;
          if (bCostTable) {
            const player = this.playerStates.get(playerId);
            for (const [resource, amount] of Object.entries(bCostTable)) {
              player.resources[resource] += Math.floor(amount / 2);
            }
          }
          colony.buildingQueue.splice(bqIdx, 1);
          this._dirtyPlayers.add(playerId);
          this._invalidateColonyCache(colony);
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
        const inFlightShips = (this._colonyShipsByPlayer.get(playerId) || []).length;
        if (playerColonyCount + inFlightShips >= MAX_COLONIES) {
          return { error: `Colony cap reached (max ${MAX_COLONIES})` };
        }

        // Check build queue
        if (colony.buildQueue.length >= 3) {
          return { error: 'Build queue full (max 3)' };
        }

        // Check resources (Expansionist doctrine: -25% cost)
        const state = this.playerStates.get(playerId);
        const docCostMult = (state.doctrine && DOCTRINE_DEFS[state.doctrine] && DOCTRINE_DEFS[state.doctrine].colonyShipCostMult) || 1;
        for (const [resource, amount] of Object.entries(COLONY_SHIP_COST)) {
          const effectiveCost = Math.ceil(amount * docCostMult);
          if (!Number.isFinite(state.resources[resource]) || state.resources[resource] < effectiveCost) {
            return { error: `Not enough ${resource}` };
          }
        }

        // Deduct resources
        for (const [resource, amount] of Object.entries(COLONY_SHIP_COST)) {
          state.resources[resource] -= Math.ceil(amount * docCostMult);
        }

        // Expansionist doctrine: -25% build time
        const docTimeMult = (state.doctrine && DOCTRINE_DEFS[state.doctrine] && DOCTRINE_DEFS[state.doctrine].colonyShipTimeMult) || 1;
        const buildTime = Math.ceil(COLONY_SHIP_BUILD_TIME * docTimeMult);
        const id = this._nextId();
        colony.buildQueue.push({ id, type: 'colonyShip', ticksRemaining: buildTime });
        this._dirtyPlayers.add(playerId);
        this._invalidateStateCache();
        return { ok: true, id };
      }

      case 'sendColonyShip': {
        const { shipId, targetSystemId } = cmd;
        if (!shipId) return { error: 'Missing shipId' };
        if (targetSystemId == null || !Number.isFinite(Number(targetSystemId))) return { error: 'Missing targetSystemId' };

        const targetSysId = Number(targetSystemId);
        const ship = (this._colonyShipsByPlayer.get(playerId) || []).find(s => s.id === shipId);
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

        // Check system claim — cannot colonize systems claimed by others
        const claimOwner = this._systemClaims.get(targetSysId);
        if (claimOwner && claimOwner !== playerId) return { error: 'System claimed by another player' };

        // Check colony cap (including in-flight ships)
        const colCount = (this._playerColonies.get(playerId) || []).length;
        const flyingShips = (this._colonyShipsByPlayer.get(playerId) || []).filter(s => s.id !== shipId && s.path && s.path.length > 0).length;
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
        const ownedScienceShips = (this._scienceShipsByPlayer.get(playerId) || []).length;
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
        const ship = (this._scienceShipsByPlayer.get(playerId) || []).find(s => s.id === shipId);
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

      case 'toggleAutoSurvey': {
        const { shipId } = cmd;
        if (!shipId) return { error: 'Missing shipId' };
        const ship = (this._scienceShipsByPlayer.get(playerId) || []).find(s => s.id === shipId);
        if (!ship) return { error: 'Science ship not found' };
        ship.autoSurvey = !ship.autoSurvey;
        this._dirtyPlayers.add(playerId);
        this._invalidateStateCache();
        // If toggling ON and ship is idle, try to auto-chain immediately
        if (ship.autoSurvey && !ship.surveying && (!ship.path || ship.path.length === 0)) {
          this._autoChainSurvey(ship);
        }
        return { ok: true, autoSurvey: ship.autoSurvey };
      }

      case 'startExpedition': {
        const { shipId, expeditionType } = cmd;
        if (!shipId) return { error: 'Missing shipId' };
        if (!expeditionType) return { error: 'Missing expeditionType' };

        const expedDef = EXPEDITION_TYPES[expeditionType];
        if (!expedDef) return { error: `Unknown expedition type: ${expeditionType}` };

        // Check survey threshold
        const surveyedSet = this._surveyedSystems.get(playerId);
        const surveyedCount = surveyedSet ? surveyedSet.size : 0;
        if (surveyedCount < EXPEDITION_MIN_SURVEYS) {
          return { error: `Need ${EXPEDITION_MIN_SURVEYS} surveys to unlock expeditions (have ${surveyedCount})` };
        }

        const ship = (this._scienceShipsByPlayer.get(playerId) || []).find(s => s.id === shipId);
        if (!ship) return { error: 'Science ship not found' };
        if (ship.path && ship.path.length > 0) return { error: 'Ship is in transit' };
        if (ship.surveying) return { error: 'Ship is currently surveying' };
        if (ship.expedition) return { error: 'Ship is already on an expedition' };

        // Start the expedition
        ship.expedition = expeditionType;
        ship.expeditionProgress = 0;
        ship.expeditionTicks = expedDef.ticks;
        ship.autoSurvey = false; // disable auto-survey during expedition
        this._dirtyPlayers.add(playerId);
        this._invalidateStateCache();

        this._emitEvent('expeditionStarted', playerId, {
          expeditionType,
          name: expedDef.name,
          duration: expedDef.ticks,
          systemName: this.galaxy ? this.galaxy.systems[ship.systemId]?.name || `System ${ship.systemId}` : `System ${ship.systemId}`,
        });

        return { ok: true, expeditionType, ticks: expedDef.ticks };
      }

      case 'buildCorvette': {
        const { colonyId, variant } = cmd;
        if (!colonyId) return { error: 'Missing colonyId' };
        const colony = this.colonies.get(colonyId);
        if (!colony) return { error: 'Colony not found' };
        if (colony.ownerId !== playerId) return { error: 'Not your colony' };

        // Validate variant if specified
        let variantDef = null;
        if (variant) {
          variantDef = CORVETTE_VARIANTS[variant];
          if (!variantDef) return { error: `Unknown variant: ${variant}` };
          // Check T2 tech is completed
          const corvPlayer = this.playerStates.get(playerId);
          if (!corvPlayer.completedTechs.includes(variantDef.requiredTech)) {
            return { error: `Requires ${TECH_TREE[variantDef.requiredTech].name}` };
          }
        }

        // Check corvette cap (owned + building)
        const ownedCorvettes = this._playerCorvetteCount(playerId);
        let buildingCorvettes = 0;
        for (const [, c] of this.colonies) {
          if (c.ownerId === playerId) {
            for (const q of c.buildQueue) {
              if (q.type === 'corvette') buildingCorvettes++;
            }
          }
        }
        if (ownedCorvettes + buildingCorvettes >= MAX_CORVETTES) {
          return { error: `Corvette cap reached (max ${MAX_CORVETTES})` };
        }

        // Check build queue
        if (colony.buildQueue.length >= 3) {
          return { error: 'Build queue full (max 3)' };
        }

        // Check resources (same cost for all variants)
        const corvState = this.playerStates.get(playerId);
        for (const [resource, amount] of Object.entries(CORVETTE_COST)) {
          if (!Number.isFinite(corvState.resources[resource]) || corvState.resources[resource] < amount) {
            return { error: `Not enough ${resource}` };
          }
        }

        // Deduct resources
        for (const [resource, amount] of Object.entries(CORVETTE_COST)) {
          corvState.resources[resource] -= amount;
        }

        const buildTime = variant ? CORVETTE_VARIANT_BUILD_TIME : CORVETTE_BUILD_TIME;
        const corvId = this._nextId();
        colony.buildQueue.push({ id: corvId, type: 'corvette', ticksRemaining: buildTime, variant: variant || null });
        this._dirtyPlayers.add(playerId);
        this._invalidateStateCache();
        return { ok: true, id: corvId };
      }

      case 'sendFleet': {
        const { shipId, targetSystemId } = cmd;
        if (!shipId) return { error: 'Missing shipId' };
        if (targetSystemId == null || !Number.isFinite(Number(targetSystemId))) return { error: 'Missing targetSystemId' };

        const targetSysId = Number(targetSystemId);
        const ship = this._militaryShipsById.get(shipId);
        if (!ship || ship.ownerId !== playerId) return { error: 'Corvette not found' };
        if (ship.path && ship.path.length > 0) return { error: 'Ship already in transit' };

        // Validate target system exists
        if (!this.galaxy || !this.galaxy.systems[targetSysId]) {
          return { error: 'Invalid target system' };
        }

        // Cannot send to current system
        if (ship.systemId === targetSysId) {
          return { error: 'Already at target system' };
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

      case 'retreatFleet': {
        const { shipId } = cmd;
        if (!shipId) return { error: 'Missing shipId' };

        const ship = this._militaryShipsById.get(shipId);
        if (!ship || ship.ownerId !== playerId) return { error: 'Corvette not found' };
        if (ship.path && ship.path.length > 0) return { error: 'Ship already in transit' };

        // Must be in a system with enemy ships (use system index)
        const shipsHere = this._militaryShipsBySystem.get(ship.systemId) || [];
        const enemyShips = [];
        for (const s of shipsHere) {
          if (s.ownerId !== playerId && (!s.path || s.path.length === 0)) {
            enemyShips.push(s);
          }
        }
        if (enemyShips.length === 0) return { error: 'No enemies to retreat from' };

        // Find adjacent system via cached adjacency list
        const adjacentSystems = this._adjacency.get(ship.systemId) || [];
        if (adjacentSystems.length === 0) return { error: 'No adjacent system to retreat to' };

        // Pick first adjacent system (prefer one without enemy ships)
        let retreatTarget = adjacentSystems[0];
        for (const sysId of adjacentSystems) {
          const sysShips = this._militaryShipsBySystem.get(sysId) || [];
          const hasEnemyShips = sysShips.some(s =>
            s.ownerId !== playerId && (!s.path || s.path.length === 0)
          );
          if (!hasEnemyShips) { retreatTarget = sysId; break; }
        }
        let retreatDamage = 0;
        for (const es of enemyShips) {
          retreatDamage += es.attack;
        }
        ship.hp -= retreatDamage;

        if (ship.hp <= 0) {
          // Ship destroyed during retreat
          const lost = (this._shipsLost.get(playerId) || 0) + 1;
          this._shipsLost.set(playerId, lost);
          this._removeMilitaryShip(ship);
          this._vpCacheTick = -1;
          this._invalidateStateCache();
          this._emitEvent('combatResult', playerId, {
            systemId: ship.systemId,
            systemName: (this.galaxy.systems[ship.systemId] || {}).name || `System ${ship.systemId}`,
            retreatFailed: true, shipId,
            retreatDamage,
          });
          return { ok: true, destroyed: true };
        }

        // Set path to retreat target
        ship.targetSystemId = retreatTarget;
        ship.path = [retreatTarget];
        ship.hopProgress = 0;
        this._dirtyPlayers.add(playerId);
        this._invalidateStateCache();
        return { ok: true, retreatTarget, retreatDamage, hpRemaining: ship.hp };
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

      case 'resolveAnomaly': {
        const { colonyId, anomalyId, choiceId } = cmd;
        if (!colonyId || !anomalyId || !choiceId) return { error: 'Missing parameters' };
        return this._resolveAnomaly(playerId, colonyId, anomalyId, choiceId);
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

      case 'buildDefensePlatform': {
        const { colonyId } = cmd;
        if (!colonyId) return { error: 'Missing colonyId' };
        const colony = this.colonies.get(colonyId);
        if (!colony) return { error: 'Colony not found' };
        if (colony.ownerId !== playerId) return { error: 'Not your colony' };

        // Check if colony already has a defense platform
        if (colony.defensePlatform) return { error: 'Colony already has a defense platform' };

        // Check resource cost
        const state = this.playerStates.get(playerId);
        for (const [resource, amount] of Object.entries(DEFENSE_PLATFORM_COST)) {
          if (!Number.isFinite(state.resources[resource]) || state.resources[resource] < amount) {
            return { error: `Not enough ${resource}` };
          }
        }

        // Deduct resources
        for (const [resource, amount] of Object.entries(DEFENSE_PLATFORM_COST)) {
          state.resources[resource] -= amount;
        }

        // Start construction (maxHp includes Shield Generator bonus if present)
        const effectiveMaxHp = this._calcDefensePlatformMaxHP(colony);
        colony.defensePlatform = {
          hp: effectiveMaxHp,
          maxHp: effectiveMaxHp,
          building: true,
          buildTicksRemaining: DEFENSE_PLATFORM_BUILD_TIME,
        };
        this._defensePlatformBuilding.add(colonyId);
        this._dirtyPlayers.add(playerId);
        this._invalidateStateCache();
        return { ok: true };
      }

      case 'setDiplomacy': {
        const { targetPlayerId, stance } = cmd;
        if (!targetPlayerId) return { error: 'Missing targetPlayerId' };
        if (!stance || !Object.values(DIPLOMACY_STANCES).includes(stance)) return { error: 'Invalid stance' };
        if (targetPlayerId === playerId) return { error: 'Cannot set diplomacy with yourself' };

        const targetState = this.playerStates.get(targetPlayerId);
        if (!targetState) return { error: 'Target player not found' };
        const state = this.playerStates.get(playerId);

        // Check cooldown
        const existing = state.diplomacy[targetPlayerId];
        if (existing && existing.cooldownTick > this.tickCount) {
          return { error: 'Diplomacy on cooldown' };
        }

        // Check if already at this stance
        const currentStance = existing ? existing.stance : DIPLOMACY_STANCES.NEUTRAL;
        if (currentStance === stance) return { error: 'Already at this stance' };

        // Check influence cost
        if (!Number.isFinite(state.resources.influence) || state.resources.influence < DIPLOMACY_INFLUENCE_COST) {
          return { error: 'Not enough influence' };
        }

        // Deduct influence
        state.resources.influence -= DIPLOMACY_INFLUENCE_COST;

        // Set stance with cooldown
        state.diplomacy[targetPlayerId] = {
          stance,
          cooldownTick: this.tickCount + DIPLOMACY_COOLDOWN_TICKS,
        };

        // Handle stance-specific logic
        if (stance === DIPLOMACY_STANCES.HOSTILE) {
          // Hostile is mutual — auto-set target's stance to hostile toward this player
          targetState.diplomacy[playerId] = {
            stance: DIPLOMACY_STANCES.HOSTILE,
            cooldownTick: this.tickCount + DIPLOMACY_COOLDOWN_TICKS,
          };
          // Clear any pending friendly requests
          state.pendingFriendly.delete(targetPlayerId);
          targetState.pendingFriendly.delete(playerId);
          // Breaking a friendly alliance / trade agreement affects production bonuses
          this._breakTradeAgreement(playerId, targetPlayerId);
          this._invalidateProductionCaches();
          // Broadcast war declared
          for (const [pid] of this.playerStates) {
            this._emitEvent('warDeclared', pid, {
              aggressorId: playerId,
              aggressorName: state.name,
              targetId: targetPlayerId,
              targetName: targetState.name,
            });
          }
        } else if (stance === DIPLOMACY_STANCES.FRIENDLY) {
          // Friendly requires acceptance — add pending request
          state.pendingFriendly.add(targetPlayerId);
          // Notify target player
          this._emitEvent('friendlyProposed', targetPlayerId, {
            fromId: playerId,
            fromName: state.name,
          });
          // Don't set to friendly yet — wait for acceptance
          // Revert to the actual pending state
          state.diplomacy[targetPlayerId].stance = currentStance === DIPLOMACY_STANCES.HOSTILE ? DIPLOMACY_STANCES.NEUTRAL : currentStance;
          // If target already has a pending request toward us, auto-accept
          if (targetState.pendingFriendly.has(playerId)) {
            state.diplomacy[targetPlayerId].stance = DIPLOMACY_STANCES.FRIENDLY;
            targetState.diplomacy[playerId] = {
              stance: DIPLOMACY_STANCES.FRIENDLY,
              cooldownTick: this.tickCount + DIPLOMACY_COOLDOWN_TICKS,
            };
            state.pendingFriendly.delete(targetPlayerId);
            targetState.pendingFriendly.delete(playerId);
            // Broadcast alliance formed
            for (const [pid] of this.playerStates) {
              this._emitEvent('allianceFormed', pid, {
                player1Id: playerId,
                player1Name: state.name,
                player2Id: targetPlayerId,
                player2Name: targetState.name,
              });
            }
            this._invalidateProductionCaches();
          }
        } else {
          // Neutral — clear any pending friendly requests
          state.pendingFriendly.delete(targetPlayerId);
        }

        this._dirtyPlayers.add(playerId);
        this._dirtyPlayers.add(targetPlayerId);
        this._vpCacheTick = -1;
        this._invalidateStateCache();
        return { ok: true };
      }

      case 'acceptDiplomacy': {
        const { targetPlayerId } = cmd;
        if (!targetPlayerId) return { error: 'Missing targetPlayerId' };
        if (targetPlayerId === playerId) return { error: 'Cannot accept diplomacy with yourself' };

        const targetState = this.playerStates.get(targetPlayerId);
        if (!targetState) return { error: 'Target player not found' };
        const state = this.playerStates.get(playerId);

        // Check if target has a pending friendly request toward us
        if (!targetState.pendingFriendly.has(playerId)) {
          return { error: 'No pending friendly proposal' };
        }

        // Accept — set both sides to friendly
        state.diplomacy[targetPlayerId] = {
          stance: DIPLOMACY_STANCES.FRIENDLY,
          cooldownTick: this.tickCount + DIPLOMACY_COOLDOWN_TICKS,
        };
        targetState.diplomacy[playerId] = {
          stance: DIPLOMACY_STANCES.FRIENDLY,
          cooldownTick: this.tickCount + DIPLOMACY_COOLDOWN_TICKS,
        };
        targetState.pendingFriendly.delete(playerId);
        state.pendingFriendly.delete(targetPlayerId);

        // Broadcast alliance formed
        for (const [pid] of this.playerStates) {
          this._emitEvent('allianceFormed', pid, {
            player1Id: playerId,
            player1Name: state.name,
            player2Id: targetPlayerId,
            player2Name: targetState.name,
          });
        }

        this._dirtyPlayers.add(playerId);
        this._dirtyPlayers.add(targetPlayerId);
        this._vpCacheTick = -1;
        this._invalidateProductionCaches();
        this._invalidateStateCache();
        return { ok: true };
      }

      case 'selectDoctrine': {
        const { doctrineType } = cmd;
        if (!doctrineType) return { error: 'Missing doctrineType' };
        if (!Object.prototype.hasOwnProperty.call(DOCTRINE_DEFS, doctrineType)) return { error: 'Invalid doctrine type' };

        const state = this.playerStates.get(playerId);
        if (!state) return { error: 'Player not found' };
        if (state.doctrine !== null) return { error: 'Doctrine already chosen' };
        if (!this._doctrinePhase) return { error: 'Doctrine selection phase ended' };

        state.doctrine = doctrineType;
        this._applyDoctrineStartingBonus(playerId, doctrineType);
        this._emitEvent('doctrineChosen', playerId, {
          doctrine: doctrineType,
          name: DOCTRINE_DEFS[doctrineType].name,
        }, true); // broadcast to all
        this._invalidateProductionCaches();
        this._dirtyPlayers.add(playerId);
        this._invalidateStateCache();

        // If all players have chosen, end doctrine phase early
        let allChosen = true;
        for (const [, ps] of this.playerStates) {
          if (ps.doctrine === null) { allChosen = false; break; }
        }
        if (allChosen) this._doctrinePhase = false;

        return { ok: true };
      }

      case 'auctionBid': {
        // Submit sealed bid for tech auction
        if (!this._auctionBids) return { error: 'No auction active' };
        if (this.tickCount >= this._auctionDeadlineTick) return { error: 'Auction window closed' };
        const { amount } = cmd;
        if (!Number.isFinite(amount) || amount < 1) return { error: 'Invalid bid amount' };
        const bidState = this.playerStates.get(playerId);
        if (!bidState) return { error: 'Player not found' };
        if (amount > bidState.resources.influence) return { error: 'Not enough influence' };
        // Must have active research to benefit
        const hasResearch = bidState.currentResearch.physics || bidState.currentResearch.society || bidState.currentResearch.engineering;
        if (!hasResearch) return { error: 'No active research to complete' };
        this._auctionBids.set(playerId, amount);
        return { ok: true };
      }

      case 'respondIncident': {
        // Submit border incident choice
        if (!this._incidentPlayers || !this._incidentChoices) return { error: 'No incident active' };
        if (this.tickCount >= this._incidentDeadlineTick) return { error: 'Incident window closed' };
        if (!this._incidentPlayers.includes(playerId)) return { error: 'Not involved in this incident' };
        const { choice } = cmd;
        if (choice !== 'escalate' && choice !== 'deescalate') return { error: 'Choice must be escalate or deescalate' };
        this._incidentChoices.set(playerId, choice);
        return { ok: true };
      }

      case 'giftResources': {
        const { targetPlayerId, resource, amount } = cmd;
        if (!targetPlayerId) return { error: 'Missing targetPlayerId' };
        if (targetPlayerId === playerId) return { error: 'Cannot gift resources to yourself' };
        if (!resource || !GIFT_ALLOWED_RESOURCES.includes(resource)) return { error: 'Invalid resource type' };
        if (!Number.isFinite(amount) || amount < GIFT_MIN_AMOUNT) return { error: `Minimum gift is ${GIFT_MIN_AMOUNT}` };
        if (Math.floor(amount) !== amount) return { error: 'Amount must be a whole number' };

        const senderState = this.playerStates.get(playerId);
        if (!senderState) return { error: 'Player not found' };
        const targetState = this.playerStates.get(targetPlayerId);
        if (!targetState) return { error: 'Target player not found' };

        // Check cooldown
        const cooldownExpiry = this._giftCooldowns.get(playerId) || 0;
        if (this.tickCount < cooldownExpiry) return { error: 'Gift on cooldown' };

        // Check sender has enough
        if (senderState.resources[resource] < amount) return { error: 'Not enough resources' };

        // Execute transfer
        senderState.resources[resource] -= amount;
        targetState.resources[resource] += amount;

        // Set cooldown
        this._giftCooldowns.set(playerId, this.tickCount + GIFT_COOLDOWN_TICKS);

        // Emit events to both players
        this._emitEvent('resourceGift', playerId, {
          senderId: playerId, senderName: senderState.name,
          targetId: targetPlayerId, targetName: targetState.name,
          resource, amount, direction: 'sent',
        });
        this._emitEvent('resourceGift', targetPlayerId, {
          senderId: playerId, senderName: senderState.name,
          targetId: targetPlayerId, targetName: targetState.name,
          resource, amount, direction: 'received',
        });

        this._dirtyPlayers.add(playerId);
        this._dirtyPlayers.add(targetPlayerId);
        this._invalidateStateCache();
        return { ok: true };
      }

      case 'diplomacyPing': {
        const { targetPlayerId, pingType } = cmd;
        if (!targetPlayerId) return { error: 'Missing targetPlayerId' };
        if (targetPlayerId === playerId) return { error: 'Cannot ping yourself' };
        if (!pingType || !DIPLOMACY_PING_TYPES.includes(pingType)) return { error: 'Invalid ping type' };

        const senderState = this.playerStates.get(playerId);
        if (!senderState) return { error: 'Player not found' };
        const targetState = this.playerStates.get(targetPlayerId);
        if (!targetState) return { error: 'Target player not found' };

        // Check cooldown (per sender, global)
        const pingCooldownExpiry = this._pingCooldowns.get(playerId) || 0;
        if (this.tickCount < pingCooldownExpiry) return { error: 'Ping on cooldown' };

        // Set cooldown
        this._pingCooldowns.set(playerId, this.tickCount + DIPLOMACY_PING_COOLDOWN);

        // Emit ping event to target player
        this._emitEvent('diplomacyPing', targetPlayerId, {
          senderId: playerId, senderName: senderState.name,
          targetId: targetPlayerId, targetName: targetState.name,
          pingType,
        });
        // Confirm to sender
        this._emitEvent('diplomacyPing', playerId, {
          senderId: playerId, senderName: senderState.name,
          targetId: targetPlayerId, targetName: targetState.name,
          pingType, direction: 'sent',
        });

        return { ok: true };
      }

      case 'proposeTradeAgreement': {
        const { targetPlayerId } = cmd;
        if (!targetPlayerId) return { error: 'Missing targetPlayerId' };
        if (targetPlayerId === playerId) return { error: 'Cannot trade with yourself' };

        const state = this.playerStates.get(playerId);
        const targetState = this.playerStates.get(targetPlayerId);
        if (!targetState) return { error: 'Target player not found' };

        // Already have an agreement
        if (state.tradeAgreements.has(targetPlayerId)) return { error: 'Trade agreement already active' };

        // Already proposed
        if (state.pendingTradeAgreements.has(targetPlayerId)) return { error: 'Trade agreement already proposed' };

        // Cannot trade with hostile players
        if (this._areHostile(playerId, targetPlayerId)) return { error: 'Cannot trade with hostile player' };

        // Check influence cost
        if (!Number.isFinite(state.resources.influence) || state.resources.influence < TRADE_AGREEMENT_INFLUENCE_COST) {
          return { error: 'Not enough influence' };
        }

        // Deduct influence from proposer
        state.resources.influence -= TRADE_AGREEMENT_INFLUENCE_COST;

        // If target already proposed to us, auto-accept (mutual proposal)
        if (targetState.pendingTradeAgreements.has(playerId)) {
          // Deduct influence from target (already paid by proposer above)
          // Target already paid when they proposed — no double charge
          state.tradeAgreements.add(targetPlayerId);
          targetState.tradeAgreements.add(playerId);
          state.pendingTradeAgreements.delete(targetPlayerId);
          targetState.pendingTradeAgreements.delete(playerId);
          // Notify both
          this._emitEvent('tradeAgreementFormed', playerId, {
            partnerId: targetPlayerId, partnerName: targetState.name,
          });
          this._emitEvent('tradeAgreementFormed', targetPlayerId, {
            partnerId: playerId, partnerName: state.name,
          });
          this._invalidateProductionCaches();
        } else {
          // Add pending proposal
          state.pendingTradeAgreements.add(targetPlayerId);
          // Notify target
          this._emitEvent('tradeAgreementProposed', targetPlayerId, {
            fromId: playerId, fromName: state.name,
          });
        }

        this._dirtyPlayers.add(playerId);
        this._dirtyPlayers.add(targetPlayerId);
        this._invalidateStateCache();
        return { ok: true };
      }

      case 'acceptTradeAgreement': {
        const { targetPlayerId } = cmd;
        if (!targetPlayerId) return { error: 'Missing targetPlayerId' };
        if (targetPlayerId === playerId) return { error: 'Cannot trade with yourself' };

        const state = this.playerStates.get(playerId);
        const targetState = this.playerStates.get(targetPlayerId);
        if (!targetState) return { error: 'Target player not found' };

        // Check that target has a pending proposal toward us
        if (!targetState.pendingTradeAgreements.has(playerId)) {
          return { error: 'No pending trade agreement from this player' };
        }

        // Cannot accept if hostile
        if (this._areHostile(playerId, targetPlayerId)) return { error: 'Cannot trade with hostile player' };

        // Check influence cost for acceptor
        if (!Number.isFinite(state.resources.influence) || state.resources.influence < TRADE_AGREEMENT_INFLUENCE_COST) {
          return { error: 'Not enough influence' };
        }

        // Deduct influence from acceptor
        state.resources.influence -= TRADE_AGREEMENT_INFLUENCE_COST;

        // Form the agreement
        state.tradeAgreements.add(targetPlayerId);
        targetState.tradeAgreements.add(playerId);
        targetState.pendingTradeAgreements.delete(playerId);
        state.pendingTradeAgreements.delete(targetPlayerId);

        // Notify both
        this._emitEvent('tradeAgreementFormed', playerId, {
          partnerId: targetPlayerId, partnerName: targetState.name,
        });
        this._emitEvent('tradeAgreementFormed', targetPlayerId, {
          partnerId: playerId, partnerName: state.name,
        });

        this._invalidateProductionCaches();
        this._dirtyPlayers.add(playerId);
        this._dirtyPlayers.add(targetPlayerId);
        this._invalidateStateCache();
        return { ok: true };
      }

      case 'cancelTradeAgreement': {
        const { targetPlayerId } = cmd;
        if (!targetPlayerId) return { error: 'Missing targetPlayerId' };
        if (targetPlayerId === playerId) return { error: 'Cannot cancel trade with yourself' };

        const state = this.playerStates.get(playerId);
        const targetState = this.playerStates.get(targetPlayerId);
        if (!targetState) return { error: 'Target player not found' };

        // Cancel active agreement or pending proposal
        const hadActive = state.tradeAgreements.has(targetPlayerId);
        const hadPending = state.pendingTradeAgreements.has(targetPlayerId);
        if (!hadActive && !hadPending) return { error: 'No trade agreement or proposal to cancel' };

        state.tradeAgreements.delete(targetPlayerId);
        state.pendingTradeAgreements.delete(targetPlayerId);
        targetState.tradeAgreements.delete(playerId);
        targetState.pendingTradeAgreements.delete(playerId);

        if (hadActive) {
          this._emitEvent('tradeAgreementBroken', playerId, {
            partnerId: targetPlayerId, partnerName: targetState.name, reason: 'cancelled',
          });
          this._emitEvent('tradeAgreementBroken', targetPlayerId, {
            partnerId: playerId, partnerName: state.name, reason: 'cancelled',
          });
          this._invalidateProductionCaches();
        }

        this._dirtyPlayers.add(playerId);
        this._dirtyPlayers.add(targetPlayerId);
        this._invalidateStateCache();
        return { ok: true };
      }

      case 'claimSystem': {
        const { systemId } = cmd;
        if (systemId == null || !Number.isFinite(Number(systemId))) return { error: 'Missing systemId' };

        const sysId = Number(systemId);
        if (!this.galaxy || !this.galaxy.systems[sysId]) return { error: 'Invalid system' };

        // Cannot claim a system that is already claimed
        const existingClaim = this._systemClaims.get(sysId);
        if (existingClaim) {
          return { error: existingClaim === playerId ? 'You already claimed this system' : 'System already claimed' };
        }

        // Cannot claim a system that already has a colony
        const systemHasColony = [...this.colonies.values()].some(c => c.systemId === sysId);
        if (systemHasColony) return { error: 'System already has a colony' };

        // Player must have a ship or colony in the system or an adjacent system
        const playerColonySystemIds = new Set();
        for (const colonyId of (this._playerColonies.get(playerId) || [])) {
          const colony = this.colonies.get(colonyId);
          if (colony) playerColonySystemIds.add(colony.systemId);
        }
        const playerShipSystemIds = new Set();
        for (const ship of (this._scienceShipsByPlayer.get(playerId) || [])) {
          if (!ship.path || ship.path.length === 0) playerShipSystemIds.add(ship.systemId);
        }
        for (const ship of (this._militaryShipsByPlayer.get(playerId) || [])) {
          if (!ship.path || ship.path.length === 0) playerShipSystemIds.add(ship.systemId);
        }
        for (const ship of (this._colonyShipsByPlayer.get(playerId) || [])) {
          if (!ship.path || ship.path.length === 0) playerShipSystemIds.add(ship.systemId);
        }

        // Check if player has presence in the target system or an adjacent one
        const allPresence = new Set([...playerColonySystemIds, ...playerShipSystemIds]);
        let hasProximity = allPresence.has(sysId);
        if (!hasProximity) {
          const neighbors = this._adjacency.get(sysId) || [];
          for (const neighborId of neighbors) {
            if (allPresence.has(neighborId)) { hasProximity = true; break; }
          }
        }
        if (!hasProximity) return { error: 'Must have a ship or colony in or adjacent to the system' };

        // Check influence cost
        const state = this.playerStates.get(playerId);
        if (!Number.isFinite(state.resources.influence) || state.resources.influence < SYSTEM_CLAIM_INFLUENCE_COST) {
          return { error: 'Not enough influence' };
        }

        // Deduct influence and record claim
        state.resources.influence -= SYSTEM_CLAIM_INFLUENCE_COST;
        this._systemClaims.set(sysId, playerId);

        this._emitEvent('systemClaimed', playerId, {
          systemId: sysId,
          systemName: this.galaxy.systems[sysId].name,
        });

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

    // Subtract ship maintenance from income display (per-variant costs)
    const playerMilShips = this._militaryShipsByPlayer.get(playerId) || [];
    let maintEnergy = 0, maintAlloys = 0;
    for (const ship of playerMilShips) {
      const maint = ship.variant ? CORVETTE_VARIANTS[ship.variant].maintenance : CORVETTE_MAINTENANCE;
      maintEnergy += maint.energy;
      maintAlloys += maint.alloys;
    }
    const idleColonyShips = this._countIdleCivilianShips(playerId, 'colony');
    const idleScienceShips = this._countIdleCivilianShips(playerId, 'science');
    const civilianMaintenance = (idleColonyShips + idleScienceShips) * CIVILIAN_SHIP_MAINTENANCE.energy;
    income.energy -= maintEnergy + civilianMaintenance;
    income.alloys -= maintAlloys;

    // Colony upkeep scaling
    const colCount = colonyIds.length;
    if (colCount > 1) {
      let colonyUpkeep = 0;
      for (let i = 1; i < colCount; i++) {
        colonyUpkeep += COLONY_UPKEEP[Math.min(i, COLONY_UPKEEP.length - 1)];
      }
      income.energy -= colonyUpkeep;
    }

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
        diplomacy: this._serializeDiplomacy(p.id),
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
      autoSurvey: s.autoSurvey !== false,
      expedition: s.expedition || null,
      expeditionProgress: s.expeditionProgress || 0,
      expeditionTicks: s.expeditionTicks || 0,
    }));
    // Include military ships (corvettes)
    state.militaryShips = this._militaryShips.map(s => ({
      id: s.id, ownerId: s.ownerId, systemId: s.systemId,
      targetSystemId: s.targetSystemId,
      path: s.path || [],
      hopProgress: s.hopProgress,
      hp: s.hp, attack: s.attack,
    }));
    // Surveyed systems per player
    state.surveyedSystems = {};
    for (const [pid, sysSet] of this._surveyedSystems) {
      state.surveyedSystems[pid] = [...sysSet];
    }
    // System claims — all claims are public information
    const claimsObjAll = {};
    for (const [sysId, owner] of this._systemClaims) {
      claimsObjAll[sysId] = owner;
    }
    state.systemClaims = claimsObjAll;

    // Scouting race milestones
    state.scoutMilestones = Object.assign({}, this._scoutMilestones);
    if (this._matchTimerEnabled) {
      state.matchTicksRemaining = this._matchTicksRemaining;
      state.matchTimerEnabled = true;
    }
    state.gameSpeed = this._gameSpeed;
    state.paused = this._paused;
    if (this._activeScarcity) {
      state.activeScarcity = { resource: this._activeScarcity.resource, ticksRemaining: this._activeScarcity.ticksRemaining };
    }
    // Include raider fleets
    state.raiders = this._raiders.map(r => ({
      id: r.id, systemId: r.systemId, targetSystemId: r.targetSystemId,
      hopsRemaining: (r.path ? r.path.length : 0), hopProgress: r.hopProgress, hp: r.hp,
    }));
    // Endgame crisis state
    if (this._endgameCrisis) {
      state.endgameCrisis = { type: this._endgameCrisis.type };
      if (this._precursorFleet) {
        state.precursorFleet = {
          id: this._precursorFleet.id,
          systemId: this._precursorFleet.systemId,
          targetSystemId: this._precursorFleet.targetSystemId,
          hopsRemaining: this._precursorFleet.path ? this._precursorFleet.path.length : 0,
          hopProgress: this._precursorFleet.hopProgress,
          hp: this._precursorFleet.hp,
        };
      }
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

  // Cached serialized ship arrays — shared across all players per broadcast cycle.
  // Client only needs path[0] (next hop) for interpolation, not the full remaining path.
  _getSerializedShipData() {
    if (this._cachedShipData) return this._cachedShipData;
    this._cachedShipData = {
      colonyShips: this._colonyShips.map(s => ({
        id: s.id, ownerId: s.ownerId, systemId: s.systemId,
        targetSystemId: s.targetSystemId,
        path: s.path && s.path.length > 0 ? [s.path[0]] : [],
        hopProgress: s.hopProgress,
      })),
      scienceShips: this._scienceShips.map(s => ({
        id: s.id, ownerId: s.ownerId, systemId: s.systemId,
        targetSystemId: s.targetSystemId,
        path: s.path && s.path.length > 0 ? [s.path[0]] : [],
        hopProgress: s.hopProgress,
        surveying: s.surveying || false,
        surveyProgress: s.surveyProgress || 0,
        autoSurvey: s.autoSurvey !== false,
        expedition: s.expedition || null,
        expeditionProgress: s.expeditionProgress || 0,
        expeditionTicks: s.expeditionTicks || 0,
      })),
      militaryShips: this._militaryShips.map(s => ({
        id: s.id, ownerId: s.ownerId, systemId: s.systemId,
        targetSystemId: s.targetSystemId,
        path: s.path && s.path.length > 0 ? [s.path[0]] : [],
        hopProgress: s.hopProgress,
        hp: s.hp, attack: s.attack,
        variant: s.variant || null, maxHp: s.maxHp || CORVETTE_HP,
      })),
      raiders: this._raiders.map(r => ({
        id: r.id, systemId: r.systemId, targetSystemId: r.targetSystemId,
        hopsRemaining: (r.path ? r.path.length : 0), hopProgress: r.hopProgress, hp: r.hp,
      })),
      precursorFleet: this._precursorFleet ? {
        id: this._precursorFleet.id,
        systemId: this._precursorFleet.systemId,
        targetSystemId: this._precursorFleet.targetSystemId,
        hopsRemaining: this._precursorFleet.path ? this._precursorFleet.path.length : 0,
        hopProgress: this._precursorFleet.hopProgress,
        hp: this._precursorFleet.hp,
      } : null,
    };
    return this._cachedShipData;
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
      doctrine: player.doctrine,
      vp: this._calcVictoryPoints(playerId),
      techs: (player.completedTechs || []).length,
      raidersDestroyed: this._raidersDestroyed.get(playerId) || 0,
      corvettes: this._playerCorvetteCount(playerId),
      battlesWon: this._battlesWon.get(playerId) || 0,
      shipsLost: this._shipsLost.get(playerId) || 0,
      diplomacy: this._serializeDiplomacy(playerId),
      underdogBonus: this._calcUnderdogBonus(playerId),
      victoryProgress: this._calcVictoryProgress(playerId),
      ...mySummary,
    };

    // Other players: name/color + VP + summary + techs/raiders/corvettes for scoreboard (no resources)
    const others = [];
    for (const p of this.playerStates.values()) {
      if (p.id === playerId) continue;
      const summary = this._getPlayerSummary(p.id);
      others.push({
        id: p.id, name: p.name, color: p.color,
        vp: this._calcVictoryPoints(p.id),
        techs: (p.completedTechs || []).length,
        raidersDestroyed: this._raidersDestroyed.get(p.id) || 0,
        corvettes: this._playerCorvetteCount(p.id),
        battlesWon: this._battlesWon.get(p.id) || 0,
        shipsLost: this._shipsLost.get(p.id) || 0,
        stanceTowardMe: this._getStance(p.id, playerId),
        doctrine: p.doctrine,
        victoryProgress: this._calcVictoryProgress(p.id),
        ...summary,
      });
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

    // Ship data is identical for all players — cache serialized arrays
    const shipData = this._getSerializedShipData();
    state.colonyShips = shipData.colonyShips;
    state.scienceShips = shipData.scienceShips;
    state.militaryShips = shipData.militaryShips;
    // Surveyed systems — only this player's surveyed set (privacy: don't leak others')
    // Cached array avoids Set→Array spread on every broadcast
    state.surveyedSystems = {};
    const mySurveyed = this._surveyedSystems.get(playerId);
    if (mySurveyed) {
      const cached = this._cachedSurveyedArrays.get(playerId);
      if (cached && cached.size === mySurveyed.size) {
        state.surveyedSystems[playerId] = cached.array;
      } else {
        const arr = [...mySurveyed];
        this._cachedSurveyedArrays.set(playerId, { size: mySurveyed.size, array: arr });
        state.surveyedSystems[playerId] = arr;
      }
    }

    // System claims — all claims are public information
    const claimsObj = {};
    for (const [sysId, owner] of this._systemClaims) {
      claimsObj[sysId] = owner;
    }
    state.systemClaims = claimsObj;

    // Scouting race milestones
    state.scoutMilestones = Object.assign({}, this._scoutMilestones);
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
    state.raiders = shipData.raiders;

    // Endgame crisis state
    if (this._endgameCrisis) {
      state.endgameCrisis = { type: this._endgameCrisis.type };
      if (this._precursorFleet) {
        state.precursorFleet = {
          id: this._precursorFleet.id,
          systemId: this._precursorFleet.systemId,
          targetSystemId: this._precursorFleet.targetSystemId,
          hopsRemaining: this._precursorFleet.path ? this._precursorFleet.path.length : 0,
          hopProgress: this._precursorFleet.hopProgress,
          hp: this._precursorFleet.hp,
        };
      }
    }

    // Doctrine selection phase info
    if (this._doctrinePhase) {
      state.doctrinePhase = true;
      state.doctrineDeadlineTick = this._doctrineDeadlineTick;
    }

    // Mid-game catalyst event state
    if (this._resourceRushSystem !== null) {
      state.resourceRush = {
        systemId: this._resourceRushSystem,
        resource: this._resourceRushResource,
        owner: this._resourceRushOwner,
        ticksLeft: this._resourceRushTicksLeft,
      };
    }
    if (this._auctionBids) {
      state.techAuction = {
        deadlineTick: this._auctionDeadlineTick,
        hasBid: this._auctionBids.has(playerId),
      };
    }
    if (this._incidentPlayers) {
      state.borderIncident = {
        players: this._incidentPlayers,
        deadlineTick: this._incidentDeadlineTick,
        hasResponded: this._incidentChoices ? this._incidentChoices.has(playerId) : false,
        involved: this._incidentPlayers.includes(playerId),
      };
    }

    return state;
  }

  // Pre-stringified per-player gameState payload
  getPlayerStateJSON(playerId) {
    // Deferred invalidation: clear map once when first read after dirty flag set
    if (this._stateCacheDirty) {
      this._cachedPlayerJSON.clear();
      this._stateCacheDirty = false;
    }
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
      const entry = { id: q.id, type: q.type, ticksRemaining: q.ticksRemaining };
      if (q.variant) entry.variant = q.variant;
      queueArr.push(entry);
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
    const result = {
      id: c.id, ownerId: c.ownerId, name: c.name, systemId: c.systemId,
      planet: { size: c.planet.size, type: c.planet.type },
      districts: c.districts, buildings: c.buildings || [], buildQueue: queueArr,
      buildingQueue: (c.buildingQueue || []).map(bq => ({ id: bq.id, type: bq.type, slot: bq.slot, ticksRemaining: bq.ticksRemaining })),
      buildingSlotsUnlocked: BUILDING_SLOT_THRESHOLDS.filter(t => c.pops >= t).length,
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
    // Include occupation state when active
    if (c.occupiedBy) {
      result.occupiedBy = c.occupiedBy;
      result.occupationProgress = c.occupationProgress;
    } else if (c.occupationProgress > 0) {
      result.occupationProgress = c.occupationProgress;
    }
    // Include surface anomalies (only send slot + type + state, not internal fields)
    if (c.surfaceAnomalies && c.surfaceAnomalies.length > 0) {
      result.surfaceAnomalies = c.surfaceAnomalies.map(a => {
        const aDef = SURFACE_ANOMALY_TYPES[a.type];
        return {
          id: a.id,
          slot: a.slot,
          type: a.type,
          label: aDef ? aDef.label : a.type,
          category: aDef ? aDef.category : 'unknown',
          discovered: a.discovered,
          choicePending: a.choicePending || false,
          choices: (a.choicePending && aDef && aDef.choices) ? aDef.choices : undefined,
        };
      });
    }
    // Only include defensePlatform when present (saves ~700 bytes at 40 colonies)
    if (c.defensePlatform) {
      result.defensePlatform = {
        hp: c.defensePlatform.hp,
        maxHp: c.defensePlatform.maxHp,
        building: c.defensePlatform.building || false,
        buildTicksRemaining: c.defensePlatform.buildTicksRemaining || 0,
      };
    }
    return result;
  }

  // Serialize diplomacy state for a player (stances, pending requests)
  _serializeDiplomacy(playerId) {
    const state = this.playerStates.get(playerId);
    if (!state) return {};
    const result = {};
    for (const [targetId, entry] of Object.entries(state.diplomacy)) {
      result[targetId] = {
        stance: entry.stance,
        cooldownTick: entry.cooldownTick,
      };
    }
    return {
      stances: result,
      pendingFriendly: [...state.pendingFriendly],
      tradeAgreements: [...state.tradeAgreements],
      pendingTradeAgreements: [...state.pendingTradeAgreements],
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

module.exports = { GameEngine, DISTRICT_DEFS, BUILDING_DEFS, BUILDING_SLOT_THRESHOLDS, PLANET_TYPES, PLANET_BONUSES, COLONY_NAMES, COLONY_TRAITS, DOCTRINE_DEFS, DOCTRINE_SELECTION_TICKS, EDICT_DEFS, MONTH_TICKS, BROADCAST_EVERY, TECH_TREE, GROWTH_BASE_TICKS, GROWTH_FAST_TICKS, GROWTH_FASTEST_TICKS, PLAYER_COLORS, SPEED_INTERVALS, SPEED_LABELS, DEFAULT_SPEED, COLONY_SHIP_COST, COLONY_SHIP_BUILD_TIME, COLONY_SHIP_HOP_TICKS, MAX_COLONIES, COLONY_SHIP_STARTING_POPS, SCIENCE_SHIP_COST, SCIENCE_SHIP_BUILD_TIME, SCIENCE_SHIP_HOP_TICKS, MAX_SCIENCE_SHIPS, SURVEY_TICKS, ANOMALY_CHANCE, ANOMALY_TYPES, CRISIS_TYPES, CRISIS_MIN_TICKS, CRISIS_MAX_TICKS, CRISIS_CHOICE_TICKS, CRISIS_IMMUNITY_TICKS, INFLUENCE_BASE_INCOME, INFLUENCE_TRAIT_INCOME, INFLUENCE_CAP, SCARCITY_RESOURCES, SCARCITY_MIN_INTERVAL, SCARCITY_MAX_INTERVAL, SCARCITY_DURATION, SCARCITY_WARNING_TICKS, SCARCITY_MULTIPLIER, CORVETTE_COST, CORVETTE_BUILD_TIME, CORVETTE_HOP_TICKS, CORVETTE_HP, CORVETTE_ATTACK, MAX_CORVETTES, RAIDER_MIN_INTERVAL, RAIDER_MAX_INTERVAL, RAIDER_HOP_TICKS, RAIDER_HP, RAIDER_ATTACK, RAIDER_COMBAT_TICKS, DEFENSE_PLATFORM_COST, DEFENSE_PLATFORM_BUILD_TIME, DEFENSE_PLATFORM_MAX_HP, DEFENSE_PLATFORM_ATTACK, DEFENSE_PLATFORM_REPAIR_RATE, RAIDER_DISABLE_TICKS, RAIDER_RESOURCE_STOLEN, RAIDER_DESTROY_VP, FLEET_COMBAT_MAX_ROUNDS, FLEET_BATTLE_WON_VP, FLEET_SHIP_LOST_VP, CORVETTE_MAINTENANCE, CORVETTE_VARIANTS, CORVETTE_VARIANT_BUILD_TIME, CIVILIAN_SHIP_MAINTENANCE, MAINTENANCE_DAMAGE, OCCUPATION_TICKS, OCCUPATION_PRODUCTION_MULT, OCCUPATION_ATTACKER_VP, OCCUPATION_DEFENDER_VP, DIPLOMACY_STANCES, DIPLOMACY_INFLUENCE_COST, DIPLOMACY_COOLDOWN_TICKS, FRIENDLY_PRODUCTION_BONUS, FRIENDLY_HOP_RANGE, FRIENDLY_VP, MUTUAL_FRIENDLY_VP, ENDGAME_CRISIS_TRIGGER, ENDGAME_CRISIS_WARNING_TICKS, GALACTIC_STORM_MULTIPLIER, PRECURSOR_HP, PRECURSOR_ATTACK, PRECURSOR_HOP_TICKS, PRECURSOR_COMBAT_TICKS, PRECURSOR_DESTROY_VP, PRECURSOR_OCCUPY_VP, UNDERDOG_BONUS_PER_COLONY, UNDERDOG_BONUS_CAP, UNDERDOG_TECH_DISCOUNT, CATALYST_RESOURCE_RUSH_PCT, CATALYST_TECH_AUCTION_PCT, CATALYST_BORDER_INCIDENT_PCT, CATALYST_RUSH_INCOME, CATALYST_RUSH_DURATION, CATALYST_AUCTION_WINDOW, CATALYST_INCIDENT_WINDOW, CATALYST_INCIDENT_BOTH_DEESCALATE_VP, CATALYST_INCIDENT_ESCALATE_VP, CATALYST_INCIDENT_HOP_RANGE, GIFT_MIN_AMOUNT, GIFT_COOLDOWN_TICKS, GIFT_ALLOWED_RESOURCES, DIPLOMACY_PING_TYPES, DIPLOMACY_PING_COOLDOWN, TRADE_AGREEMENT_INFLUENCE_COST, TRADE_AGREEMENT_ENERGY_BONUS, TRADE_AGREEMENT_MINERAL_BONUS, SYSTEM_CLAIM_INFLUENCE_COST, SYSTEM_CLAIM_VP, EXPEDITION_MIN_SURVEYS, EXPEDITION_TYPES, SURFACE_ANOMALY_TYPES, SURFACE_ANOMALY_KEYS, SURFACE_ANOMALY_MIN, SURFACE_ANOMALY_MAX, COLONY_UPKEEP, SCOUT_MILESTONES, TOTAL_TECHS, MILITARY_VICTORY_OCCUPATIONS, ECONOMIC_VICTORY_ALLOYS, ECONOMIC_VICTORY_TRAITS, generateGalaxy, assignStartingSystems };
