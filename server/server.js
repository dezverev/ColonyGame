const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const { RoomManager } = require('./room-manager');
const { GameEngine } = require('./game-engine');
const config = require('./config');

function startServer(options = {}) {
  const port = options.port ?? config.GAME_PORT;
  const log = options.log !== false;

  const httpServer = http.createServer((req, res) => {
    if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }
    res.writeHead(404); res.end();
  });

  const wss = new WebSocketServer({ server: httpServer });
  const rooms = new RoomManager();
  const games = new Map(); // roomId -> GameEngine
  const clients = new Map(); // clientId -> ws
  let nextClientId = 1;

  function send(ws, msg) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  }

  function broadcastToRoom(roomId, msg, excludeId) {
    const room = rooms.getRoom(roomId);
    if (!room) return;
    // Stringify once, reuse for all players
    const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const [pid] of room.players) {
      if (pid !== excludeId) {
        const ws = clients.get(pid);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      }
    }
  }

  function broadcastRoomList() {
    const list = rooms.listRooms();
    for (const [, ws] of clients) {
      if (!rooms.getRoomForPlayer(ws.clientId)) {
        send(ws, { type: 'roomList', rooms: list });
      }
    }
  }

  function sendRoomUpdate(roomId) {
    const room = rooms.getRoom(roomId);
    if (!room) return;
    const data = rooms.serializeRoom(room);
    for (const [pid] of room.players) {
      const ws = clients.get(pid);
      if (ws) send(ws, { type: 'roomUpdate', room: data });
    }
  }

  wss.on('connection', (ws) => {
    const clientId = nextClientId++;
    ws.clientId = clientId;
    ws.displayName = `Player${clientId}`;
    clients.set(clientId, ws);

    send(ws, { type: 'welcome', clientId, displayName: ws.displayName });
    send(ws, { type: 'roomList', rooms: rooms.listRooms() });

    if (log) console.log(`[connect] Player${clientId}`);

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      handleMessage(ws, msg);
    });

    ws.on('close', () => {
      if (log) console.log(`[disconnect] Player${clientId}`);
      const result = rooms.removePlayer(clientId);
      if (result && result.removed) {
        // Room was deleted (last player left) — stop and clean up the game engine
        const engine = games.get(result.roomId);
        if (engine) {
          engine.stop();
          games.delete(result.roomId);
          if (log) console.log(`[game] Cleaned up engine for removed room ${result.roomId}`);
        }
      } else if (result && result.room) {
        sendRoomUpdate(result.room.id);
      }
      clients.delete(clientId);
      broadcastRoomList();
    });
  });

  function handleMessage(ws, msg) {
    const clientId = ws.clientId;

    switch (msg.type) {
      case 'setName': {
        const name = String(msg.name || '').trim().slice(0, 20);
        if (name.length < 1) return;
        ws.displayName = name;
        send(ws, { type: 'nameSet', displayName: name });
        break;
      }

      case 'createRoom': {
        if (rooms.getRoomForPlayer(clientId)) {
          send(ws, { type: 'error', message: 'Already in a room' });
          return;
        }
        const name = String(msg.name || '').trim().slice(0, 30) || `Room ${clientId}`;
        const room = rooms.createRoom(name, clientId, ws.displayName, {
          maxPlayers: msg.maxPlayers,
          map: msg.map,
          practiceMode: msg.practiceMode,
          matchTimer: msg.matchTimer,
          galaxySize: msg.galaxySize,
        });
        send(ws, { type: 'roomJoined', room: rooms.serializeRoom(room) });
        broadcastRoomList();
        if (log) console.log(`[room] ${ws.displayName} created "${room.name}"`);
        break;
      }

      case 'joinRoom': {
        const result = rooms.joinRoom(msg.roomId, clientId, ws.displayName);
        if (result.error) {
          send(ws, { type: 'error', message: result.error });
          return;
        }
        send(ws, { type: 'roomJoined', room: rooms.serializeRoom(result.room) });
        sendRoomUpdate(result.room.id);
        broadcastRoomList();
        if (log) console.log(`[room] ${ws.displayName} joined "${result.room.name}"`);
        break;
      }

      case 'leaveRoom': {
        const result = rooms.leaveRoom(clientId);
        if (!result) return;
        send(ws, { type: 'roomLeft' });
        send(ws, { type: 'roomList', rooms: rooms.listRooms() });
        if (result.removed) {
          const engine = games.get(result.roomId);
          if (engine) {
            engine.stop();
            games.delete(result.roomId);
            if (log) console.log(`[game] Cleaned up engine for removed room ${result.roomId}`);
          }
        } else if (result.room) {
          sendRoomUpdate(result.room.id);
        }
        broadcastRoomList();
        break;
      }

      case 'rematch': {
        // Leave current room and create a new one with same settings
        const currentRoom = rooms.getRoomForPlayer(clientId);
        const settings = currentRoom ? {
          maxPlayers: currentRoom.maxPlayers,
          practiceMode: currentRoom.practiceMode,
          matchTimer: currentRoom.matchTimer,
          galaxySize: currentRoom.galaxySize,
        } : {};
        const leaveResult = rooms.leaveRoom(clientId);
        if (leaveResult) {
          if (leaveResult.removed) {
            const engine = games.get(leaveResult.roomId);
            if (engine) { engine.stop(); games.delete(leaveResult.roomId); }
          } else if (leaveResult.room) {
            sendRoomUpdate(leaveResult.room.id);
          }
          broadcastRoomList();
        }
        // Create new room with same settings
        const rematchName = `${ws.displayName}'s Rematch`;
        const newRoom = rooms.createRoom(rematchName, clientId, ws.displayName, settings);
        send(ws, { type: 'roomJoined', room: rooms.serializeRoom(newRoom) });
        broadcastRoomList();
        if (log) console.log(`[room] ${ws.displayName} started rematch`);
        break;
      }

      case 'toggleReady': {
        const result = rooms.toggleReady(clientId);
        if (!result) return;
        sendRoomUpdate(result.room.id);
        break;
      }

      case 'launchGame': {
        const room = rooms.getRoomForPlayer(clientId);
        if (!room) return;
        const result = rooms.launchGame(room.id, clientId);
        if (result.error) {
          send(ws, { type: 'error', message: result.error });
          return;
        }

        const engine = new GameEngine(result.room, {
          tickRate: config.TICK_RATE,
          onTick: (playerId, stateJSON) => {
            // Per-player filtered state — send directly to this player
            const pws = clients.get(playerId);
            if (pws && pws.readyState === WebSocket.OPEN) {
              pws.send(stateJSON);
            }
          },
          onEvent: (events) => {
            for (const event of events) {
              if (event.broadcast) {
                // Send to all players in room
                for (const [pid] of result.room.players) {
                  const pws = clients.get(pid);
                  if (pws) send(pws, { type: 'gameEvent', ...event });
                }
              } else {
                const ws = clients.get(event.playerId);
                if (ws) send(ws, { type: 'gameEvent', ...event });
              }
            }
          },
          onSpeedChange: (speedState) => {
            const msg = { type: 'speedChanged', ...speedState };
            for (const [pid] of result.room.players) {
              const pws = clients.get(pid);
              if (pws) send(pws, msg);
            }
          },
          onGameOver: (data) => {
            const msg = { type: 'gameOver', ...data };
            for (const [pid] of result.room.players) {
              const pws = clients.get(pid);
              if (pws) send(pws, msg);
            }
            games.delete(room.id);
            room.status = 'finished';
            broadcastRoomList();
            if (log) console.log(`[game] "${room.name}" ended — winner: ${data.winner ? data.winner.name : 'none'}`);
          },
        });
        games.set(room.id, engine);

        // Stringify shared init payload once, inject per-player yourId
        // (avoids re-serializing full galaxy data per player)
        const initState = engine.getInitState();
        initState.type = 'gameInit';
        const initBase = JSON.stringify(initState);
        for (const [pid] of result.room.players) {
          const pws = clients.get(pid);
          if (pws && pws.readyState === WebSocket.OPEN) {
            // Insert yourId into the JSON string: replace trailing } with ,"yourId":N}
            pws.send(initBase.slice(0, -1) + ',"yourId":' + pid + '}');
          }
        }

        engine.start();
        broadcastRoomList();
        if (log) console.log(`[game] "${room.name}" launched with ${room.players.size} players`);
        break;
      }

      case 'buildDistrict':
      case 'buildBuilding':
      case 'demolish':
      case 'setResearch':
      case 'buildColonyShip':
      case 'sendColonyShip':
      case 'buildScienceShip':
      case 'sendScienceShip':
      case 'toggleAutoSurvey':
      case 'buildCorvette':
      case 'sendFleet':
      case 'resolveCrisis':
      case 'activateEdict':
      case 'setDiplomacy':
      case 'acceptDiplomacy':
      case 'selectDoctrine':
      case 'auctionBid':
      case 'respondIncident':
      case 'giftResources':
      case 'diplomacyPing': {
        const room = rooms.getRoomForPlayer(clientId);
        if (!room) return;
        const engine = games.get(room.id);
        if (!engine) return;
        const result = engine.handleCommand(clientId, msg);
        if (result && result.error) {
          send(ws, { type: 'error', message: result.error });
        }
        break;
      }

      case 'setGameSpeed': {
        const room = rooms.getRoomForPlayer(clientId);
        if (!room) return;
        const engine = games.get(room.id);
        if (!engine) return;
        // Host-only in multiplayer; any player in single-player (practice mode)
        if (!room.practiceMode && room.hostId !== clientId) {
          send(ws, { type: 'error', message: 'Only the host can change game speed' });
          return;
        }
        const result = engine.setGameSpeed(msg.speed);
        if (result.error) {
          send(ws, { type: 'error', message: result.error });
        }
        break;
      }

      case 'togglePause': {
        const room = rooms.getRoomForPlayer(clientId);
        if (!room) return;
        const engine = games.get(room.id);
        if (!engine) return;
        // Host-only in multiplayer; any player in single-player (practice mode)
        if (!room.practiceMode && room.hostId !== clientId) {
          send(ws, { type: 'error', message: 'Only the host can pause the game' });
          return;
        }
        const result = engine.togglePause();
        if (result.error) {
          send(ws, { type: 'error', message: result.error });
        }
        break;
      }

      case 'chat': {
        const room = rooms.getRoomForPlayer(clientId);
        const chatMsg = { type: 'chat', from: ws.displayName, text: String(msg.text || '').slice(0, 200) };
        if (room) {
          // Broadcast to all in room including sender
          for (const [pid] of room.players) {
            const pws = clients.get(pid);
            if (pws) send(pws, chatMsg);
          }
        }
        break;
      }
    }
  }

  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      if (log) console.log(`[server] Colony 4X game server on port ${port}`);
      resolve({
        port: httpServer.address().port,
        close: () => {
          for (const [, engine] of games) engine.stop();
          for (const client of wss.clients) client.terminate();
          wss.close();
          httpServer.close();
        },
      });
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
