const crypto = require('crypto');

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.playerRooms = new Map(); // clientId -> roomId
  }

  createRoom(name, hostId, hostName, options = {}) {
    const id = crypto.randomBytes(4).toString('hex');
    const practiceMode = !!options.practiceMode;
    // Match timer: 10, 20, 30 minutes or 0 for unlimited. Default: 10 for practice, 20 for multiplayer
    const validTimers = [0, 10, 20, 30];
    let matchTimer = Number(options.matchTimer);
    if (!validTimers.includes(matchTimer)) {
      matchTimer = practiceMode ? 10 : 20;
    }
    // Galaxy size validation
    const validGalaxySizes = ['small', 'medium', 'large'];
    const galaxySize = validGalaxySizes.includes(options.galaxySize) ? options.galaxySize : 'small';

    // Fair starting planets: all players get same planet type & size (default: true)
    const fairStartingPlanets = options.fairStartingPlanets !== false;

    const room = {
      id,
      name: name.slice(0, 30),
      hostId,
      maxPlayers: practiceMode ? 1 : Math.min(Math.max(options.maxPlayers || 4, 2), 8),
      map: options.map || 'default',
      practiceMode,
      matchTimer,
      galaxySize,
      fairStartingPlanets,
      status: 'waiting', // waiting | playing | finished
      players: new Map(),
      createdAt: Date.now(),
    };
    room.players.set(hostId, { id: hostId, name: hostName, ready: false, isHost: true });
    this.rooms.set(id, room);
    this.playerRooms.set(hostId, id);
    return room;
  }

  joinRoom(roomId, playerId, playerName) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Room not found' };
    if (room.status !== 'waiting') return { error: 'Game already started' };
    if (room.players.size >= room.maxPlayers) return { error: 'Room is full' };
    if (this.playerRooms.has(playerId)) return { error: 'Already in a room' };

    room.players.set(playerId, { id: playerId, name: playerName, ready: false, isHost: false });
    this.playerRooms.set(playerId, roomId);
    return { room };
  }

  leaveRoom(playerId) {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return null;
    const room = this.rooms.get(roomId);
    if (!room) { this.playerRooms.delete(playerId); return null; }

    room.players.delete(playerId);
    this.playerRooms.delete(playerId);

    if (room.players.size === 0) {
      this.rooms.delete(roomId);
      return { removed: true, roomId };
    }

    // Transfer host if host left
    if (room.hostId === playerId) {
      const newHost = room.players.values().next().value;
      room.hostId = newHost.id;
      newHost.isHost = true;
    }
    return { room };
  }

  toggleReady(playerId) {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return null;
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'waiting') return null;
    const player = room.players.get(playerId);
    if (!player) return null;
    player.ready = !player.ready;
    return { room, ready: player.ready };
  }

  canLaunch(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'waiting') return false;
    if (room.practiceMode) return room.players.size === 1;
    if (room.players.size < 2) return false;
    for (const [id, p] of room.players) {
      if (id !== room.hostId && !p.ready) return false;
    }
    return true;
  }

  launchGame(roomId, hostId) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Room not found' };
    if (room.hostId !== hostId) return { error: 'Only host can launch' };
    if (!this.canLaunch(roomId)) return { error: 'Not all players are ready' };
    room.status = 'playing';
    return { room };
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  getRoomForPlayer(playerId) {
    const roomId = this.playerRooms.get(playerId);
    return roomId ? this.rooms.get(roomId) : null;
  }

  listRooms() {
    const list = [];
    for (const room of this.rooms.values()) {
      list.push({
        id: room.id,
        name: room.name,
        hostId: room.hostId,
        playerCount: room.players.size,
        maxPlayers: room.maxPlayers,
        map: room.map,
        practiceMode: room.practiceMode,
        matchTimer: room.matchTimer,
        galaxySize: room.galaxySize,
        status: room.status,
      });
    }
    return list;
  }

  serializeRoom(room) {
    return {
      id: room.id,
      name: room.name,
      hostId: room.hostId,
      maxPlayers: room.maxPlayers,
      map: room.map,
      practiceMode: room.practiceMode,
      matchTimer: room.matchTimer,
      galaxySize: room.galaxySize,
      status: room.status,
      players: Array.from(room.players.values()),
    };
  }

  removePlayer(playerId) {
    return this.leaveRoom(playerId);
  }
}

module.exports = { RoomManager };
