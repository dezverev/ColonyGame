const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1'];

const UNIT_DEFS = {
  worker: {
    hp: 30, atk: 3, armor: 0, speed: 2.0, range: 1, cooldown: 1.5,
    cost: { gold: 50, wood: 20, stone: 0 }, supplyCost: 1,
    bonusVs: { soldier: 0.5, archer: 0.5, cavalry: 0.5 },
  },
  soldier: {
    hp: 60, atk: 10, armor: 2, speed: 1.5, range: 1, cooldown: 1.0,
    cost: { gold: 60, wood: 20, stone: 0 }, supplyCost: 1,
    bonusVs: { archer: 1.5 },
  },
  archer: {
    hp: 40, atk: 8, armor: 0, speed: 1.8, range: 5, cooldown: 1.2,
    cost: { gold: 40, wood: 50, stone: 0 }, supplyCost: 1,
    bonusVs: { cavalry: 1.5 },
  },
  cavalry: {
    hp: 70, atk: 12, armor: 1, speed: 3.5, range: 1, cooldown: 1.3,
    cost: { gold: 80, wood: 30, stone: 0 }, supplyCost: 2,
    bonusVs: { soldier: 1.5 },
  },
};

class GameEngine {
  constructor(room, options = {}) {
    this.room = room;
    this.tickRate = options.tickRate || 10;
    this.tickInterval = null;
    this.tickCount = 0;
    this._idCounter = 0;
    this.units = new Map();
    this.buildings = new Map();
    this.playerStates = new Map();
    this.onTick = options.onTick || null;

    this._initPlayerStates();
    this._initMap();
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
        gold: 200,
        wood: 100,
        stone: 50,
        supply: 3,
        maxSupply: 10,
      });
    }
  }

  _initMap() {
    const spawnPoints = [
      { x: 5, y: 5 },
      { x: 45, y: 45 },
      { x: 5, y: 45 },
      { x: 45, y: 5 },
      { x: 25, y: 5 },
      { x: 25, y: 45 },
      { x: 5, y: 25 },
      { x: 45, y: 25 },
    ];
    let spawnIndex = 0;
    for (const [playerId] of this.playerStates) {
      const spawn = spawnPoints[spawnIndex++ % spawnPoints.length];
      this._createBuilding(playerId, 'townhall', spawn.x, spawn.y);
      for (let i = 0; i < 3; i++) {
        this._createUnit(playerId, 'worker', spawn.x + 1 + i, spawn.y + 2);
      }
    }
  }

  _createUnit(ownerId, type, x, y) {
    const id = this._nextId();
    const def = UNIT_DEFS[type] || UNIT_DEFS.worker;
    const unit = {
      id, ownerId, type, x, y,
      hp: def.hp, maxHp: def.hp,
      atk: def.atk, armor: def.armor, speed: def.speed,
      range: def.range, cooldown: def.cooldown,
      target: null, state: 'idle',
    };
    this.units.set(id, unit);
    return unit;
  }

  _createBuilding(ownerId, type, x, y) {
    const id = this._nextId();
    const defs = { townhall: { hp: 500, size: 3 }, barracks: { hp: 300, size: 2 }, farm: { hp: 150, size: 2 }, tower: { hp: 200, size: 1 } };
    const def = defs[type] || defs.townhall;
    const building = { id, ownerId, type, x, y, hp: def.hp, maxHp: def.hp, size: def.size, progress: 1.0 };
    this.buildings.set(id, building);
    return building;
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
    const dt = 1 / this.tickRate;

    // Process unit movement
    for (const [, unit] of this.units) {
      if (unit.target && unit.state === 'moving') {
        const dx = unit.target.x - unit.x;
        const dy = unit.target.y - unit.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0.1) {
          const move = Math.min(unit.speed * dt, dist);
          unit.x += (dx / dist) * move;
          unit.y += (dy / dist) * move;
        } else {
          unit.x = unit.target.x;
          unit.y = unit.target.y;
          unit.target = null;
          unit.state = 'idle';
        }
      }
    }

    if (this.onTick) this.onTick(this.getState());
  }

  handleCommand(playerId, cmd) {
    switch (cmd.type) {
      case 'moveUnits': {
        const { unitIds, targetX, targetY } = cmd;
        if (!Array.isArray(unitIds)) return;
        if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;
        for (const uid of unitIds) {
          const unit = this.units.get(uid);
          if (unit && unit.ownerId === playerId) {
            unit.target = { x: targetX, y: targetY };
            unit.state = 'moving';
          }
        }
        break;
      }
    }
  }

  getState() {
    return {
      tick: this.tickCount,
      units: Array.from(this.units.values()),
      buildings: Array.from(this.buildings.values()),
      players: Array.from(this.playerStates.values()),
    };
  }

  getInitState() {
    return {
      mapWidth: 50,
      mapHeight: 50,
      ...this.getState(),
    };
  }
}

function calcDamage(attackerType, defenderType) {
  const aDef = UNIT_DEFS[attackerType] || UNIT_DEFS.worker;
  const dDef = UNIT_DEFS[defenderType] || UNIT_DEFS.worker;
  const bonus = (aDef.bonusVs && aDef.bonusVs[defenderType]) || 1.0;
  return Math.max(1, Math.round((aDef.atk * bonus) - dDef.armor));
}

module.exports = { GameEngine, UNIT_DEFS, calcDamage };
