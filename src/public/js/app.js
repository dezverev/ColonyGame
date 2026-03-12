/**
 * Main game client — WebSocket connection, screen management, game rendering.
 */
(function () {
  // ── State ──
  let ws = null;
  let myId = null;
  let myName = '';
  let currentRoom = null;
  let gameState = null;
  let selectedUnits = [];

  // Camera
  let camera = { x: 25, y: 25, zoom: 1 };
  let dragging = false;
  let dragStart = { x: 0, y: 0 };
  let camStart = { x: 0, y: 0 };

  // Selection box
  let selecting = false;
  let selectStart = { x: 0, y: 0 };
  let selectEnd = { x: 0, y: 0 };

  // ── DOM refs ──
  const screens = {
    name: document.getElementById('name-screen'),
    lobby: document.getElementById('lobby-screen'),
    room: document.getElementById('room-screen'),
    game: document.getElementById('game-screen'),
  };

  const nameInput = document.getElementById('name-input');
  const nameSubmit = document.getElementById('name-submit');
  const playerNameDisplay = document.getElementById('player-name-display');
  const createRoomBtn = document.getElementById('create-room-btn');
  const createRoomDialog = document.getElementById('create-room-dialog');
  const roomNameInput = document.getElementById('room-name-input');
  const roomMaxPlayers = document.getElementById('room-max-players');
  const roomCreateConfirm = document.getElementById('room-create-confirm');
  const roomCreateCancel = document.getElementById('room-create-cancel');
  const roomList = document.getElementById('room-list');
  const roomTitle = document.getElementById('room-title');
  const leaveRoomBtn = document.getElementById('leave-room-btn');
  const playerList = document.getElementById('player-list');
  const readyBtn = document.getElementById('ready-btn');
  const launchBtn = document.getElementById('launch-btn');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const minimapCanvas = document.getElementById('minimap-canvas');
  const minimapCtx = minimapCanvas.getContext('2d');

  // ── Screen management ──
  function showScreen(name) {
    for (const [key, el] of Object.entries(screens)) {
      el.classList.toggle('active', key === name);
    }
    if (name === 'game') resizeCanvas();
  }

  // ── WebSocket ──
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const port = 4001;
    ws = new WebSocket(`${proto}//${location.hostname}:${port}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'setName', name: myName }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      handleMessage(msg);
    };

    ws.onclose = () => {
      setTimeout(connect, 2000);
    };
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        myId = msg.clientId;
        break;

      case 'nameSet':
        myName = msg.displayName;
        playerNameDisplay.textContent = myName;
        break;

      case 'roomList':
        Lobby.renderRoomList(msg.rooms, roomList, (roomId) => {
          send({ type: 'joinRoom', roomId });
        });
        break;

      case 'roomJoined':
        currentRoom = msg.room;
        renderRoom();
        showScreen('room');
        break;

      case 'roomUpdate':
        currentRoom = msg.room;
        renderRoom();
        break;

      case 'roomLeft':
        currentRoom = null;
        showScreen('lobby');
        break;

      case 'chat':
        if (currentRoom) {
          Lobby.addChatMessage(chatMessages, msg.from, msg.text);
        }
        break;

      case 'error':
        alert(msg.message);
        break;

      case 'gameInit':
        gameState = {
          mapWidth: msg.mapWidth,
          mapHeight: msg.mapHeight,
          units: msg.units,
          buildings: msg.buildings,
          players: msg.players,
          yourId: msg.yourId,
        };
        selectedUnits = [];
        camera = { x: msg.mapWidth / 2, y: msg.mapHeight / 2, zoom: 1 };
        showScreen('game');
        startGameLoop();
        break;

      case 'gameState':
        if (gameState) {
          gameState.units = msg.units;
          gameState.buildings = msg.buildings;
          gameState.players = msg.players;
          renderDirty = true;
          updateHUD();
        }
        break;
    }
  }

  // ── Room rendering ──
  function renderRoom() {
    if (!currentRoom) return;
    roomTitle.textContent = currentRoom.name;
    Lobby.renderPlayerList(currentRoom, playerList, myId);

    const isHost = currentRoom.hostId === myId;
    const myPlayer = currentRoom.players.find(p => p.id === myId);
    const amReady = myPlayer ? myPlayer.ready : false;

    readyBtn.textContent = amReady ? 'Unready' : 'Ready';
    readyBtn.classList.toggle('is-ready', amReady);

    if (isHost) {
      const allReady = currentRoom.players.every(p => p.id === currentRoom.hostId || p.ready);
      const enoughPlayers = currentRoom.players.length >= 2;
      launchBtn.classList.toggle('hidden', !(allReady && enoughPlayers));
    } else {
      launchBtn.classList.add('hidden');
    }
  }

  // ── Game rendering ──
  let animFrame = null;
  let renderDirty = true; // tracks whether a redraw is needed
  const _playerMap = Object.create(null);
  let _selectedSet = new Set();
  const _opts = { originX: 0, originY: 0 }; // reusable projection options

  function markRenderDirty() { renderDirty = true; }

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    renderDirty = true;
  }

  function startGameLoop() {
    if (animFrame) cancelAnimationFrame(animFrame);
    renderDirty = true;
    function loop() {
      if (renderDirty) {
        renderDirty = false;
        render();
      }
      animFrame = requestAnimationFrame(loop);
    }
    loop();
  }

  function render() {
    if (!gameState) return;
    const { mapWidth, mapHeight, units, buildings, players } = gameState;
    const W = canvas.width;
    const H = canvas.height;
    const P = Projection;

    ctx.clearRect(0, 0, W, H);

    _opts.originX = W / 2 - (camera.x - camera.y) * (P.TileWidth / 2) * camera.zoom;
    _opts.originY = H / 2 - (camera.x + camera.y) * (P.TileHeight / 2) * camera.zoom + 200 * camera.zoom;

    // Draw grid — batched into a single path for fewer draw calls
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    const zoomOffX = W / 2 * (1 - camera.zoom);
    const zoomOffY = H / 2 * (1 - camera.zoom);
    ctx.beginPath();
    for (let x = 0; x <= mapWidth; x++) {
      let s = P.worldToScreen(x, 0, 0, _opts);
      const ax = s.x, ay = s.y;
      s = P.worldToScreen(x, mapHeight, 0, _opts);
      ctx.moveTo(ax * camera.zoom + zoomOffX, ay * camera.zoom + zoomOffY);
      ctx.lineTo(s.x * camera.zoom + zoomOffX, s.y * camera.zoom + zoomOffY);
    }
    for (let y = 0; y <= mapHeight; y++) {
      let s = P.worldToScreen(0, y, 0, _opts);
      const ax = s.x, ay = s.y;
      s = P.worldToScreen(mapWidth, y, 0, _opts);
      ctx.moveTo(ax * camera.zoom + zoomOffX, ay * camera.zoom + zoomOffY);
      ctx.lineTo(s.x * camera.zoom + zoomOffX, s.y * camera.zoom + zoomOffY);
    }
    ctx.stroke();

    // Rebuild player lookup (reuse object, clear old keys)
    for (const k in _playerMap) delete _playerMap[k];
    for (const p of players) _playerMap[p.id] = p;
    _selectedSet = new Set(selectedUnits);

    // Apply zoom transform
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-W / 2, -H / 2);

    // Draw buildings
    for (const b of buildings) {
      const s = P.worldToScreen(b.x, b.y, 0, _opts);
      const bx = s.x, by = s.y;
      const owner = _playerMap[b.ownerId];
      const color = owner ? owner.color : '#888';
      const size = (b.size || 2) * P.TileWidth / 2;

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(bx - size / 2, by - size, size, size);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx - size / 2, by - size, size, size);

      // Label
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.type, bx, by - size - 4);
    }

    // Draw units
    for (const u of units) {
      const s = P.worldToScreen(u.x, u.y, 0, _opts);
      const ux = s.x, uy = s.y;
      const owner = _playerMap[u.ownerId];
      const color = owner ? owner.color : '#888';
      const isSelected = _selectedSet.has(u.id);

      // Selection ring
      if (isSelected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(ux, uy, 12, 6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Unit diamond
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(ux, uy - 10);
      ctx.lineTo(ux + 6, uy);
      ctx.lineTo(ux, uy + 4);
      ctx.lineTo(ux - 6, uy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#fff' : '#000';
      ctx.lineWidth = 1;
      ctx.stroke();

      // HP bar
      if (u.hp < u.maxHp) {
        const barW = 16;
        const ratio = u.hp / u.maxHp;
        ctx.fillStyle = '#333';
        ctx.fillRect(ux - barW / 2, uy - 16, barW, 3);
        ctx.fillStyle = ratio > 0.5 ? '#2ecc71' : ratio > 0.25 ? '#f39c12' : '#e74c3c';
        ctx.fillRect(ux - barW / 2, uy - 16, barW * ratio, 3);
      }
    }

    // Selection box
    if (selecting) {
      ctx.strokeStyle = '#2ecc71';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      const x = Math.min(selectStart.x, selectEnd.x);
      const y = Math.min(selectStart.y, selectEnd.y);
      const w = Math.abs(selectEnd.x - selectStart.x);
      const h = Math.abs(selectEnd.y - selectStart.y);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }

    ctx.restore();

    // Minimap
    renderMinimap(_playerMap);
  }

  function renderMinimap(playerMap) {
    if (!gameState) return;
    const mw = minimapCanvas.width;
    const mh = minimapCanvas.height;
    const { mapWidth, mapHeight, units, buildings } = gameState;

    minimapCtx.clearRect(0, 0, mw, mh);
    minimapCtx.fillStyle = '#1a1a2e';
    minimapCtx.fillRect(0, 0, mw, mh);

    const sx = mw / mapWidth;
    const sy = mh / mapHeight;

    for (const b of buildings) {
      const owner = playerMap[b.ownerId];
      minimapCtx.fillStyle = owner ? owner.color : '#888';
      minimapCtx.fillRect(b.x * sx - 2, b.y * sy - 2, 4, 4);
    }

    for (const u of units) {
      const owner = playerMap[u.ownerId];
      minimapCtx.fillStyle = owner ? owner.color : '#888';
      minimapCtx.fillRect(u.x * sx - 1, u.y * sy - 1, 2, 2);
    }

    // Camera viewport indicator
    minimapCtx.strokeStyle = '#fff';
    minimapCtx.lineWidth = 1;
    const vpX = (camera.x - 10 / camera.zoom) * sx;
    const vpY = (camera.y - 10 / camera.zoom) * sy;
    const vpW = (20 / camera.zoom) * sx;
    const vpH = (20 / camera.zoom) * sy;
    minimapCtx.strokeRect(vpX, vpY, vpW, vpH);
  }

  function updateHUD() {
    if (!gameState) return;
    const me = gameState.players.find(p => p.id === gameState.yourId);
    if (!me) return;
    document.getElementById('hud-gold').textContent = `Gold: ${me.gold}`;
    document.getElementById('hud-wood').textContent = `Wood: ${me.wood}`;
    document.getElementById('hud-stone').textContent = `Stone: ${me.stone}`;
    document.getElementById('hud-supply').textContent = `Supply: ${me.supply}/${me.maxSupply}`;
  }

  // ── Game input ──
  function setupGameInput() {
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        // Left click — start selection
        selecting = true;
        selectStart = { x: e.offsetX, y: e.offsetY };
        selectEnd = { x: e.offsetX, y: e.offsetY };
      } else if (e.button === 1 || e.button === 2) {
        // Middle/right — camera drag
        dragging = true;
        dragStart = { x: e.clientX, y: e.clientY };
        camStart = { x: camera.x, y: camera.y };
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (selecting) {
        selectEnd = { x: e.offsetX, y: e.offsetY };
        renderDirty = true;
      }
      if (dragging) {
        const dx = (e.clientX - dragStart.x) / camera.zoom;
        const dy = (e.clientY - dragStart.y) / camera.zoom;
        camera.x = camStart.x - dx / 32;
        camera.y = camStart.y - dy / 16;
        renderDirty = true;
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0 && selecting) {
        selecting = false;
        handleSelection(selectStart, selectEnd);
        renderDirty = true;
      }
      if (dragging) {
        dragging = false;
      }
    });

    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!gameState || selectedUnits.length === 0) return;
      // Right click — move command
      const P = Projection;
      const W = canvas.width;
      const H = canvas.height;
      const originX = W / 2 - (camera.x - camera.y) * (P.TileWidth / 2) * camera.zoom;
      const originY = H / 2 - (camera.x + camera.y) * (P.TileHeight / 2) * camera.zoom + 200 * camera.zoom;
      // Undo zoom transform
      const sx = W / 2 + (e.offsetX - W / 2) / camera.zoom;
      const sy = H / 2 + (e.offsetY - H / 2) / camera.zoom;
      const world = P.screenToWorld(sx, sy, 0, { originX, originY });
      send({
        type: 'gameCommand',
        command: { type: 'moveUnits', unitIds: [...selectedUnits], targetX: world.x, targetY: world.y },
      });
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      camera.zoom = Math.max(0.5, Math.min(3, camera.zoom - e.deltaY * 0.001));
      renderDirty = true;
    });

    window.addEventListener('resize', () => {
      if (screens.game.classList.contains('active')) resizeCanvas();
    });
  }

  function handleSelection(start, end) {
    if (!gameState) return;
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    const P = Projection;
    const W = canvas.width;
    const H = canvas.height;
    const originX = W / 2 - (camera.x - camera.y) * (P.TileWidth / 2) * camera.zoom;
    const originY = H / 2 - (camera.x + camera.y) * (P.TileHeight / 2) * camera.zoom + 200 * camera.zoom;
    const opts = { originX, originY };

    const isClick = Math.abs(maxX - minX) < 5 && Math.abs(maxY - minY) < 5;
    selectedUnits = [];

    for (const u of gameState.units) {
      if (u.ownerId !== gameState.yourId) continue;
      const s = P.worldToScreen(u.x, u.y, 0, opts);
      const sx = W / 2 + (s.x - W / 2) * camera.zoom;
      const sy = H / 2 + (s.y - H / 2) * camera.zoom;

      if (isClick) {
        if (Math.abs(sx - start.x) < 12 && Math.abs(sy - start.y) < 12) {
          selectedUnits = [u.id];
          break;
        }
      } else {
        if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
          selectedUnits.push(u.id);
        }
      }
    }

    // Update selection panel
    const panel = document.getElementById('selection-panel');
    if (selectedUnits.length === 0) {
      panel.textContent = '';
    } else if (selectedUnits.length === 1) {
      const u = gameState.units.find(u => u.id === selectedUnits[0]);
      panel.textContent = u ? `${u.type} | HP: ${u.hp}/${u.maxHp}` : '';
    } else {
      panel.textContent = `${selectedUnits.length} units selected`;
    }
  }

  // ── Button wiring ──
  nameSubmit.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) return;
    myName = name;
    playerNameDisplay.textContent = myName;
    showScreen('lobby');
    connect();
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') nameSubmit.click();
  });

  createRoomBtn.addEventListener('click', () => {
    createRoomDialog.classList.remove('hidden');
    roomNameInput.focus();
  });
  roomCreateCancel.addEventListener('click', () => {
    createRoomDialog.classList.add('hidden');
  });
  roomCreateConfirm.addEventListener('click', () => {
    const name = roomNameInput.value.trim() || `${myName}'s Room`;
    const maxPlayers = parseInt(roomMaxPlayers.value, 10);
    send({ type: 'createRoom', name, maxPlayers });
    createRoomDialog.classList.add('hidden');
    roomNameInput.value = '';
  });

  leaveRoomBtn.addEventListener('click', () => {
    send({ type: 'leaveRoom' });
  });

  readyBtn.addEventListener('click', () => {
    send({ type: 'toggleReady' });
  });

  launchBtn.addEventListener('click', () => {
    send({ type: 'launchGame' });
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
      send({ type: 'chat', text: chatInput.value.trim() });
      chatInput.value = '';
    }
  });

  setupGameInput();
})();
