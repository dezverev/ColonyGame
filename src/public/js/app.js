/**
 * Main game client — WebSocket connection, screen management, colony 4X game state.
 */
(function () {
  // ── State ──
  let ws = null;
  let myId = null;
  let myName = '';
  let currentRoom = null;
  let gameState = null;

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

  // ── Screen management ──
  function showScreen(name) {
    for (const [key, el] of Object.entries(screens)) {
      el.classList.toggle('active', key === name);
    }
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
          tick: msg.tick,
          players: msg.players,
          colonies: msg.colonies,
          yourId: msg.yourId,
        };
        showScreen('game');
        // Initialize Three.js renderer and wire tile selection
        if (window.ColonyRenderer) {
          window.ColonyRenderer.init();
          window.ColonyRenderer.setOnTileSelect(_onTileSelect);
          const myColony = msg.colonies.find(c => c.ownerId === msg.yourId);
          if (myColony) window.ColonyRenderer.buildColonyGrid(myColony);
        }
        break;

      case 'gameState':
        if (gameState) {
          gameState.tick = msg.tick;
          gameState.players = msg.players;
          gameState.colonies = msg.colonies;
          // Update Three.js colony view
          if (window.ColonyRenderer) {
            const myColony = msg.colonies.find(c => c.ownerId === gameState.yourId);
            if (myColony) window.ColonyRenderer.updateFromState(myColony);
          }
        }
        break;

      case 'gameEvent':
        // Will be rendered by UI module in future sprints
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

  // ── District definitions (client-side mirror for UI) ──
  const DISTRICT_UI = {
    housing:     { label: 'Housing',     color: '#ecf0f1', cost: { minerals: 100 }, produces: '+5 Housing', consumes: '-1 Energy' },
    generator:   { label: 'Generator',   color: '#f1c40f', cost: { minerals: 100 }, produces: '+6 Energy', consumes: '' },
    mining:      { label: 'Mining',      color: '#95a5a6', cost: { minerals: 100 }, produces: '+6 Minerals', consumes: '' },
    agriculture: { label: 'Agriculture', color: '#2ecc71', cost: { minerals: 100 }, produces: '+6 Food', consumes: '' },
    industrial:  { label: 'Industrial',  color: '#3498db', cost: { minerals: 200 }, produces: '+3 Alloys', consumes: '-3 Energy' },
    research:    { label: 'Research',    color: '#9b59b6', cost: { minerals: 200, energy: 20 }, produces: '+3 Phys/Soc/Eng', consumes: '-4 Energy' },
  };

  // ── Tile selection UI ──
  const buildMenu = document.getElementById('build-menu');
  const buildMenuOptions = document.getElementById('build-menu-options');
  const buildMenuClose = document.getElementById('build-menu-close');
  const districtInfo = document.getElementById('district-info');
  const districtInfoTitle = document.getElementById('district-info-title');
  const districtInfoBody = document.getElementById('district-info-body');
  const districtInfoClose = document.getElementById('district-info-close');
  const districtDemolishBtn = document.getElementById('district-demolish-btn');

  let _selectedTileData = null;

  function _onTileSelect(tileData) {
    _hideAllPanels();
    _selectedTileData = tileData;
    if (!tileData) return;

    if (tileData.empty) {
      _showBuildMenu(tileData);
    } else if (tileData.district) {
      _showDistrictInfo(tileData);
    }
    // construction tiles: no panel (just highlight)
  }

  function _hideAllPanels() {
    buildMenu.classList.add('hidden');
    districtInfo.classList.add('hidden');
  }

  function _showBuildMenu(tileData) {
    buildMenuOptions.innerHTML = '';
    const myPlayer = _getMyPlayer();
    const myColony = _getMyColony();
    const slotsUsed = myColony ? myColony.districts.length + myColony.buildQueue.length : 0;
    const slotsFull = myColony ? slotsUsed >= myColony.planet.size : true;
    const queueFull = myColony ? myColony.buildQueue.length >= 3 : true;

    for (const [type, ui] of Object.entries(DISTRICT_UI)) {
      const btn = document.createElement('div');
      btn.className = 'build-option';

      let canAfford = true;
      const costParts = [];
      for (const [res, amt] of Object.entries(ui.cost)) {
        costParts.push(`${amt} ${res}`);
        if (!myPlayer || myPlayer.resources[res] < amt) canAfford = false;
      }

      if (!canAfford || slotsFull || queueFull) {
        btn.classList.add('disabled');
      }

      btn.innerHTML =
        `<div class="build-option-swatch" style="background:${ui.color}"></div>` +
        `<div class="build-option-name">${ui.label}</div>` +
        `<div class="build-option-prod">${ui.produces}</div>` +
        `<div class="build-option-cost">${costParts.join(', ')}</div>`;

      btn.addEventListener('click', () => {
        if (btn.classList.contains('disabled')) return;
        if (!myColony) return;
        send({ type: 'buildDistrict', colonyId: myColony.id, districtType: type });
        _hideAllPanels();
        if (window.ColonyRenderer) window.ColonyRenderer.deselectTile();
      });

      buildMenuOptions.appendChild(btn);
    }

    buildMenu.classList.remove('hidden');
  }

  function _showDistrictInfo(tileData) {
    const d = tileData.district;
    const ui = DISTRICT_UI[d.type];
    if (!ui) return;

    districtInfoTitle.textContent = ui.label + ' District';
    districtInfoBody.innerHTML =
      `<div class="info-row"><span class="info-label">Type</span><span class="info-value">${ui.label}</span></div>` +
      (ui.produces ? `<div class="info-row"><span class="info-label">Output</span><span class="info-value" style="color:#2ecc71">${ui.produces}</span></div>` : '') +
      (ui.consumes ? `<div class="info-row"><span class="info-label">Upkeep</span><span class="info-value" style="color:#e74c3c">${ui.consumes}</span></div>` : '');

    // Show demolish button (hide for capital buildings if needed)
    districtDemolishBtn.classList.remove('hidden');
    districtDemolishBtn.onclick = () => {
      const myColony = _getMyColony();
      if (!myColony || !d.id) return;
      send({ type: 'demolish', colonyId: myColony.id, districtId: d.id });
      _hideAllPanels();
      if (window.ColonyRenderer) window.ColonyRenderer.deselectTile();
    };

    districtInfo.classList.remove('hidden');
  }

  function _getMyPlayer() {
    if (!gameState) return null;
    return gameState.players.find(p => p.id === gameState.yourId) || null;
  }

  function _getMyColony() {
    if (!gameState) return null;
    return gameState.colonies.find(c => c.ownerId === gameState.yourId) || null;
  }

  // Panel close buttons
  if (buildMenuClose) buildMenuClose.addEventListener('click', () => {
    _hideAllPanels();
    if (window.ColonyRenderer) window.ColonyRenderer.deselectTile();
  });
  if (districtInfoClose) districtInfoClose.addEventListener('click', () => {
    _hideAllPanels();
    if (window.ColonyRenderer) window.ColonyRenderer.deselectTile();
  });

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

  // Expose send and gameState for future modules (renderer, UI)
  if (typeof window !== 'undefined') {
    window.GameClient = { send, getState: () => gameState };
  }
})();
