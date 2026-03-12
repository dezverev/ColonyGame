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
          colonyShips: msg.colonyShips || [],
          yourId: msg.yourId,
          matchTimerEnabled: msg.matchTimerEnabled || false,
          matchTicksRemaining: msg.matchTicksRemaining || 0,
          galaxy: msg.galaxy || null,
          gameSpeed: msg.gameSpeed || 2,
          paused: msg.paused || false,
        };
        _refreshPlayerCache();
        // Reset game-over state
        if (gameOverOverlay) gameOverOverlay.classList.add('hidden');
        showScreen('game');
        // Start in colony view
        currentView = 'colony';
        galaxyViewInitialized = false;
        // Initialize Three.js renderer and wire tile selection
        if (window.ColonyRenderer) {
          window.ColonyRenderer.init();
          window.ColonyRenderer.setOnTileSelect(_onTileSelect);
          if (_cachedMyColony) window.ColonyRenderer.buildColonyGrid(_cachedMyColony);
        }
        _updateViewUI();
        _updateSpeedDisplay();
        // Start 2Hz HUD refresh
        if (_uiInterval) clearInterval(_uiInterval);
        _uiInterval = setInterval(_updateHUD, 500);
        _updateHUD();
        break;

      case 'gameState':
        if (gameState) {
          gameState.tick = msg.tick;
          gameState.players = msg.players;
          gameState.colonies = msg.colonies;
          if (msg.colonyShips) gameState.colonyShips = msg.colonyShips;
          if (msg.matchTimerEnabled !== undefined) gameState.matchTimerEnabled = msg.matchTimerEnabled;
          if (msg.matchTicksRemaining !== undefined) gameState.matchTicksRemaining = msg.matchTicksRemaining;
          if (msg.gameSpeed !== undefined) gameState.gameSpeed = msg.gameSpeed;
          if (msg.paused !== undefined) gameState.paused = msg.paused;
          _refreshPlayerCache();
          // Update Three.js colony view
          if (currentView === 'colony' && window.ColonyRenderer) {
            if (_cachedMyColony) window.ColonyRenderer.updateFromState(_cachedMyColony);
          }
          // Update galaxy view: ownership rings + colony ships
          if (currentView === 'galaxy' && window.GalaxyView) {
            window.GalaxyView.updateOwnership(msg.colonies, msg.players);
            window.GalaxyView.updateColonyShips(gameState.colonyShips);
          }
          // Update colony list sidebar
          _updateColonyList();
        }
        break;

      case 'gameEvent':
        if (msg.eventType === 'researchComplete') {
          // Re-render research panel if open
          if (researchPanel && !researchPanel.classList.contains('hidden')) {
            _renderResearchPanel();
          }
        } else if (msg.eventType === 'matchWarning') {
          _showMatchWarning('2 minutes remaining!');
        } else if (msg.eventType === 'finalCountdown') {
          _showMatchWarning('30 seconds — FINAL COUNTDOWN!');
        }
        // Show toast for game events
        {
          const toastText = _formatGameEvent(msg);
          if (toastText) {
            _showToast(toastText, TOAST_TYPE_MAP[msg.eventType] || 'info');
          }
        }
        break;

      case 'speedChanged':
        if (gameState) {
          gameState.gameSpeed = msg.speed;
          gameState.paused = msg.paused;
          _updateSpeedDisplay();
        }
        break;

      case 'gameOver':
        _showGameOver(msg);
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
    industrial:  { label: 'Industrial',  color: '#3498db', cost: { minerals: 200 }, produces: '+4 Alloys', consumes: '-3 Energy' },
    research:    { label: 'Research',    color: '#9b59b6', cost: { minerals: 200, energy: 20 }, produces: '+4 Phys/Soc/Eng', consumes: '-4 Energy' },
  };

  // ── Planet type bonuses (client-side mirror for UI) ──
  const PLANET_BONUSES = {
    continental: { agriculture: { food: 1 } },
    ocean:       { agriculture: { food: 1 }, research: { physics: 1, society: 1, engineering: 1 } },
    tropical:    { agriculture: { food: 2 } },
    arctic:      { mining: { minerals: 1 }, research: { physics: 1, society: 1, engineering: 1 } },
    desert:      { mining: { minerals: 2 } },
    arid:        { generator: { energy: 1 }, industrial: { alloys: 1 } },
  };

  function _planetBonusLabel(planetType) {
    const b = PLANET_BONUSES[planetType];
    if (!b) return '';
    const parts = [];
    for (const [district, resources] of Object.entries(b)) {
      for (const [res, amt] of Object.entries(resources)) {
        parts.push(`+${amt} ${res.charAt(0).toUpperCase() + res.slice(1)}/${DISTRICT_UI[district] ? DISTRICT_UI[district].label : district}`);
      }
    }
    return parts.join(', ');
  }

  // ── Tech tree (client-side mirror for UI) ──
  const TECH_TREE_UI = {
    improved_power_plants: { track: 'physics', tier: 1, name: 'Improved Power Plants', desc: '+25% Generator output', cost: 150, requires: null },
    frontier_medicine:     { track: 'society', tier: 1, name: 'Frontier Medicine', desc: '+25% pop growth speed', cost: 150, requires: null },
    improved_mining:       { track: 'engineering', tier: 1, name: 'Improved Mining', desc: '+25% Mining output', cost: 150, requires: null },
    advanced_reactors:     { track: 'physics', tier: 2, name: 'Advanced Reactors', desc: '+50% Generator output', cost: 500, requires: 'improved_power_plants' },
    gene_crops:            { track: 'society', tier: 2, name: 'Gene Crops', desc: '+50% Agriculture output', cost: 500, requires: 'frontier_medicine' },
    deep_mining:           { track: 'engineering', tier: 2, name: 'Deep Mining', desc: '+50% Mining output', cost: 500, requires: 'improved_mining' },
  };

  // ── HUD elements ──
  const resBar = {
    energy: document.getElementById('res-energy'),
    energyNet: document.getElementById('res-energy-net'),
    minerals: document.getElementById('res-minerals'),
    mineralsNet: document.getElementById('res-minerals-net'),
    food: document.getElementById('res-food'),
    foodNet: document.getElementById('res-food-net'),
    alloys: document.getElementById('res-alloys'),
    alloysNet: document.getElementById('res-alloys-net'),
    research: document.getElementById('res-research'),
    researchNet: document.getElementById('res-research-net'),
    influence: document.getElementById('res-influence'),
  };
  const statusSpeed = document.getElementById('status-speed');
  const pauseOverlay = document.getElementById('pause-overlay');
  const statusMonth = document.getElementById('status-month');
  const statusPops = document.getElementById('status-pops');
  const statusGrowth = document.getElementById('status-growth');
  const growthBarFill = document.getElementById('growth-bar-fill');
  const colonyPanelTitle = document.getElementById('colony-panel-title');
  const cpPlanet = document.getElementById('cp-planet');
  const cpDistricts = document.getElementById('cp-districts');
  const cpWorking = document.getElementById('cp-working');
  const cpIdle = document.getElementById('cp-idle');
  const cpHousing = document.getElementById('cp-housing');
  const colonyQueueHeader = document.getElementById('colony-queue-header');
  const colonyQueueList = document.getElementById('colony-queue-list');
  const buildMenuResources = document.getElementById('build-menu-resources');

  // ── Tile selection UI ──
  const buildMenu = document.getElementById('build-menu');
  const buildMenuOptions = document.getElementById('build-menu-options');
  const buildMenuClose = document.getElementById('build-menu-close');
  const districtInfo = document.getElementById('district-info');
  const districtInfoTitle = document.getElementById('district-info-title');
  const districtInfoBody = document.getElementById('district-info-body');
  const districtInfoClose = document.getElementById('district-info-close');
  const districtDemolishBtn = document.getElementById('district-demolish-btn');

  // ── Research panel refs ──
  const researchPanel = document.getElementById('research-panel');
  const researchTracks = document.getElementById('research-tracks');
  const researchPanelClose = document.getElementById('research-panel-close');

  // ── Scoreboard refs ──
  const scoreboard = document.getElementById('scoreboard');
  const scoreboardBody = document.getElementById('scoreboard-body');
  const scoreboardClose = document.getElementById('scoreboard-close');

  // ── Game over refs ──
  const gameOverOverlay = document.getElementById('game-over-overlay');
  const gameOverTitle = document.getElementById('game-over-title');
  const gameOverWinner = document.getElementById('game-over-winner');
  const gameOverScores = document.getElementById('game-over-scores');
  const gameOverLobbyBtn = document.getElementById('game-over-lobby-btn');

  // ── Timer & warning refs ──
  const statusTimer = document.getElementById('status-timer');
  const statusTimerSep = document.getElementById('status-timer-sep');
  const statusVP = document.getElementById('status-vp');
  const matchWarning = document.getElementById('match-warning');

  // ── Room dialog refs ──
  const roomMatchTimer = document.getElementById('room-match-timer');

  // ── View management ──
  let currentView = 'colony'; // 'colony' | 'galaxy'
  let galaxyViewInitialized = false;
  let galaxyAnimFrame = null;
  let _viewingColonyIndex = 0; // which colony the player is currently viewing

  // ── Galaxy view refs ──
  const viewIndicator = document.getElementById('view-indicator-label');
  const systemPanel = document.getElementById('system-panel');
  const systemPanelTitle = document.getElementById('system-panel-title');
  const systemPanelBody = document.getElementById('system-panel-body');
  const systemPanelClose = document.getElementById('system-panel-close');

  // ── Toast notifications ──
  const toastContainer = document.getElementById('toast-container');
  const TOAST_MAX = 5;
  const TOAST_DURATION = 4000;

  function _showToast(text, type) {
    if (!toastContainer) return;
    const el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.textContent = text;
    toastContainer.appendChild(el);

    // Enforce max visible
    while (toastContainer.children.length > TOAST_MAX) {
      toastContainer.removeChild(toastContainer.firstChild);
    }

    // Auto-dismiss
    setTimeout(() => {
      el.classList.add('toast-out');
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
    }, TOAST_DURATION);
  }

  // Toast formatting from shared module (loaded via toast-format.js script tag)
  const _formatGameEvent = window.ToastFormat ? window.ToastFormat.formatGameEvent : function() { return null; };
  const TOAST_TYPE_MAP = window.ToastFormat ? window.ToastFormat.TOAST_TYPE_MAP : {};

  let _selectedTileData = null;
  let _uiInterval = null;
  let _warningTimeout = null;
  let _lastResearchKey = '';  // tracks research state to avoid redundant DOM rebuilds
  let _lastQueueKey = '';      // tracks build queue state to avoid redundant DOM rebuilds
  let _cachedMyPlayer = null;   // cached after each gameState update
  let _cachedMyColony = null;   // cached after each gameState update

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

    // Resource header in build menu
    if (myPlayer && buildMenuResources) {
      const r = myPlayer.resources;
      buildMenuResources.innerHTML =
        `<span style="color:#95a5a6">⛏ ${Math.floor(r.minerals)}</span>` +
        `<span style="color:#f1c40f">⚡ ${Math.floor(r.energy)}</span>`;
    }
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

      // Planet bonus for this district type on current colony
      let bonusHtml = '';
      if (myColony) {
        const pb = PLANET_BONUSES[myColony.planet.type];
        if (pb && pb[type]) {
          const bonusParts = Object.entries(pb[type]).map(([r, a]) => `+${a} ${r.charAt(0).toUpperCase() + r.slice(1)}`);
          bonusHtml = `<div class="build-option-bonus">${bonusParts.join(', ')} (planet)</div>`;
        }
      }

      btn.innerHTML =
        `<div class="build-option-swatch" style="background:${ui.color}"></div>` +
        `<div class="build-option-name">${ui.label}</div>` +
        `<div class="build-option-prod">${ui.produces}</div>` +
        bonusHtml +
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

    // Colony Ship build option
    {
      const shipBtn = document.createElement('div');
      shipBtn.className = 'build-option build-option-ship';
      const shipCost = { minerals: 200, food: 100, alloys: 100 };
      let canAffordShip = true;
      const costParts = [];
      for (const [res, amt] of Object.entries(shipCost)) {
        costParts.push(`${amt} ${res}`);
        if (!myPlayer || myPlayer.resources[res] < amt) canAffordShip = false;
      }
      // Check colony cap
      const myColonies = gameState ? gameState.colonies.filter(c => c.ownerId === gameState.yourId) : [];
      const myShips = gameState && gameState.colonyShips ? gameState.colonyShips.filter(s => s.ownerId === gameState.yourId) : [];
      const atColonyCap = myColonies.length + myShips.length >= 5;
      if (!canAffordShip || queueFull || atColonyCap) shipBtn.classList.add('disabled');

      shipBtn.innerHTML =
        '<div class="build-option-swatch" style="background:#00ffaa"></div>' +
        '<div class="build-option-name">Colony Ship</div>' +
        '<div class="build-option-prod">Expand to new worlds</div>' +
        `<div class="build-option-cost">${costParts.join(', ')}</div>`;

      shipBtn.addEventListener('click', () => {
        if (shipBtn.classList.contains('disabled')) return;
        if (!myColony) return;
        send({ type: 'buildColonyShip', colonyId: myColony.id });
        _hideAllPanels();
        if (window.ColonyRenderer) window.ColonyRenderer.deselectTile();
      });

      buildMenuOptions.appendChild(shipBtn);
    }

    buildMenu.classList.remove('hidden');
  }

  function _showDistrictInfo(tileData) {
    const d = tileData.district;
    const ui = DISTRICT_UI[d.type];
    if (!ui) return;

    const disabledTag = d.disabled ? ' <span style="color:#e74c3c;font-weight:bold">[DISABLED]</span>' : '';
    districtInfoTitle.innerHTML = ui.label + ' District' + disabledTag;
    // Planet bonus for this district
    let bonusRow = '';
    const myColony = _getMyColony();
    if (myColony) {
      const pb = PLANET_BONUSES[myColony.planet.type];
      if (pb && pb[d.type]) {
        const bonusParts = Object.entries(pb[d.type]).map(([r, a]) => `+${a} ${r.charAt(0).toUpperCase() + r.slice(1)}`);
        bonusRow = `<div class="info-row"><span class="info-label">Planet Bonus</span><span class="info-value" style="color:#f39c12">${bonusParts.join(', ')}</span></div>`;
      }
    }

    districtInfoBody.innerHTML =
      (d.disabled ? `<div class="info-row"><span class="info-label">Status</span><span class="info-value" style="color:#e74c3c">Disabled (energy deficit)</span></div>` : '') +
      `<div class="info-row"><span class="info-label">Type</span><span class="info-value">${ui.label}</span></div>` +
      (ui.produces ? `<div class="info-row"><span class="info-label">Output</span><span class="info-value" style="color:${d.disabled ? '#666' : '#2ecc71'}">${d.disabled ? '<s>' + ui.produces + '</s>' : ui.produces}</span></div>` : '') +
      bonusRow +
      (ui.consumes ? `<div class="info-row"><span class="info-label">Upkeep</span><span class="info-value" style="color:${d.disabled ? '#666' : '#e74c3c'}">${d.disabled ? '<s>' + ui.consumes + '</s>' : ui.consumes}</span></div>` : '');

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

  // ── Research panel ──
  function _toggleResearchPanel() {
    if (researchPanel.classList.contains('hidden')) {
      _lastResearchKey = ''; // force re-render on open
      _renderResearchPanel();
      researchPanel.classList.remove('hidden');
    } else {
      researchPanel.classList.add('hidden');
    }
  }

  function _renderResearchPanel() {
    const player = _getMyPlayer();
    if (!player) return;

    const completed = player.completedTechs || [];
    const current = player.currentResearch || {};
    const progress = player.researchProgress || {};

    researchTracks.innerHTML = '';

    for (const track of ['physics', 'society', 'engineering']) {
      const trackDiv = document.createElement('div');
      trackDiv.className = 'research-track';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'research-track-title ' + track;
      titleDiv.textContent = track.charAt(0).toUpperCase() + track.slice(1);
      trackDiv.appendChild(titleDiv);

      // Get techs for this track sorted by tier
      const techs = Object.entries(TECH_TREE_UI)
        .filter(([, t]) => t.track === track)
        .sort((a, b) => a[1].tier - b[1].tier);

      for (const [techId, tech] of techs) {
        const card = document.createElement('div');
        card.className = 'tech-card';

        const isCompleted = completed.includes(techId);
        const isResearching = current[track] === techId;
        const isLocked = tech.requires && !completed.includes(tech.requires);

        if (isCompleted) card.classList.add('completed');
        else if (isResearching) card.classList.add('researching');
        else if (isLocked) card.classList.add('locked');

        let statusHtml = '';
        if (isCompleted) {
          statusHtml = '<div class="tech-card-status completed">COMPLETED</div>';
        } else if (isResearching) {
          const prog = progress[techId] || 0;
          const pct = Math.min(100, (prog / tech.cost) * 100);
          statusHtml =
            '<div class="tech-card-status researching">RESEARCHING</div>' +
            `<div class="tech-progress"><div class="tech-progress-fill" style="width:${pct.toFixed(1)}%"></div></div>`;
        }

        card.innerHTML =
          `<div class="tech-card-name">${tech.name}</div>` +
          `<div class="tech-card-desc">${tech.desc}</div>` +
          `<div class="tech-card-cost">Cost: ${tech.cost} ${track}</div>` +
          statusHtml;

        if (!isCompleted && !isLocked && !isResearching) {
          card.addEventListener('click', () => {
            send({ type: 'setResearch', techId });
            // Optimistic: re-render after short delay
            setTimeout(() => _renderResearchPanel(), 100);
          });
        }

        trackDiv.appendChild(card);
      }

      researchTracks.appendChild(trackDiv);
    }
  }

  function _refreshPlayerCache() {
    if (!gameState) { _cachedMyPlayer = null; _cachedMyColony = null; return; }
    _cachedMyPlayer = gameState.players.find(p => p.id === gameState.yourId) || null;
    const myColonies = gameState.colonies.filter(c => c.ownerId === gameState.yourId);
    if (_viewingColonyIndex >= myColonies.length) _viewingColonyIndex = 0;
    _cachedMyColony = myColonies[_viewingColonyIndex] || null;
  }

  const SPEED_LABELS = { 1: '0.5x', 2: '1x', 3: '2x', 4: '3x', 5: '5x' };

  function _updateSpeedDisplay() {
    if (!gameState) return;
    const label = SPEED_LABELS[gameState.gameSpeed] || '1x';
    if (statusSpeed) statusSpeed.textContent = label;
    if (pauseOverlay) {
      if (gameState.paused) pauseOverlay.classList.remove('hidden');
      else pauseOverlay.classList.add('hidden');
    }
  }

  function _getMyPlayer() {
    return _cachedMyPlayer;
  }

  function _getMyColony() {
    return _cachedMyColony;
  }

  // ── HUD update (throttled to 2Hz) ──

  function _updateHUD() {
    if (!gameState) return;
    const player = _getMyPlayer();
    const colony = _getMyColony();

    // Resource bar
    if (player) {
      const r = player.resources;
      resBar.energy.textContent = Math.floor(r.energy);
      resBar.minerals.textContent = Math.floor(r.minerals);
      resBar.food.textContent = Math.floor(r.food);
      resBar.alloys.textContent = Math.floor(r.alloys);
      // Research: sum of 3 types (stockpile)
      const rr = r.research || {};
      const totalResearch = Math.floor((rr.physics || 0) + (rr.society || 0) + (rr.engineering || 0));
      resBar.research.textContent = totalResearch;
      resBar.influence.textContent = Math.floor(r.influence);

      // Update research panel if open — only re-render when research progress changes
      if (researchPanel && !researchPanel.classList.contains('hidden')) {
        const rr = r.research || {};
        const resKey = (rr.physics || 0) + '|' + (rr.society || 0) + '|' + (rr.engineering || 0);
        if (resKey !== _lastResearchKey) {
          _lastResearchKey = resKey;
          _renderResearchPanel();
        }
      }
    }

    // Net production from colony
    if (colony && colony.netProduction) {
      const np = colony.netProduction;
      _setNet(resBar.energyNet, np.energy);
      _setNet(resBar.mineralsNet, np.minerals);
      _setNet(resBar.foodNet, np.food);
      _setNet(resBar.alloysNet, np.alloys);
      const totalResNet = (np.physics || 0) + (np.society || 0) + (np.engineering || 0);
      _setNet(resBar.researchNet, totalResNet);
    }

    // Match timer
    if (gameState.matchTimerEnabled && statusTimer) {
      const ticksLeft = gameState.matchTicksRemaining || 0;
      const secsLeft = Math.max(0, Math.ceil(ticksLeft / 10));
      const min = Math.floor(secsLeft / 60);
      const sec = secsLeft % 60;
      statusTimer.textContent = min + ':' + String(sec).padStart(2, '0');
      statusTimer.classList.remove('hidden');
      statusTimerSep.classList.remove('hidden');
      // Color: red under 30s, yellow under 2min
      if (secsLeft <= 30) statusTimer.style.color = '#e74c3c';
      else if (secsLeft <= 120) statusTimer.style.color = '#f1c40f';
      else statusTimer.style.color = '#2ecc71';
    }

    // VP display
    if (player && statusVP) {
      statusVP.textContent = 'VP: ' + (player.vp || 0);
    }

    // Status bar
    const month = Math.floor((gameState.tick || 0) / 100);
    statusMonth.textContent = 'Month ' + month;

    if (colony) {
      statusPops.textContent = 'Pop: ' + colony.pops + '/' + colony.housing;
      // Housing warning
      if (colony.pops >= colony.housing) {
        statusPops.style.color = '#e74c3c';
      } else if (colony.pops >= colony.housing - 2) {
        statusPops.style.color = '#f1c40f';
      } else {
        statusPops.style.color = '';
      }

      // Growth indicator
      const growthLabels = {
        slow: 'Slow', fast: 'Fast', rapid: 'Rapid',
        starving: 'Starving', stalled: 'Stalled',
        housing_full: 'Housing Full', none: '—',
      };
      const growthColors = {
        slow: '#2ecc71', fast: '#27ae60', rapid: '#00ff88',
        starving: '#e74c3c', stalled: '#f1c40f',
        housing_full: '#e67e22', none: '#888',
      };
      const gs = colony.growthStatus || 'none';
      statusGrowth.textContent = 'Growth: ' + (growthLabels[gs] || '—');
      statusGrowth.style.color = growthColors[gs] || '#888';

      // Growth progress bar
      if (colony.growthTarget > 0 && colony.growthProgress !== undefined) {
        const pct = Math.min(100, (colony.growthProgress / colony.growthTarget) * 100);
        growthBarFill.style.width = pct + '%';
        growthBarFill.style.background = growthColors[gs] || '#2ecc71';
      } else {
        growthBarFill.style.width = '0%';
      }

      // Colony info panel
      colonyPanelTitle.textContent = colony.name;
      cpPlanet.textContent = (colony.planet.type || 'Unknown') + ' (Size ' + colony.planet.size + ')';
      const totalDistricts = colony.districts.length + colony.buildQueue.length;
      cpDistricts.textContent = totalDistricts + '/' + colony.planet.size;
      const working = Math.min(colony.pops, colony.jobs);
      const idle = Math.max(0, colony.pops - colony.jobs);
      cpWorking.textContent = working;
      cpIdle.textContent = idle;
      cpIdle.style.color = idle > 0 ? '#f1c40f' : '';
      cpHousing.textContent = colony.pops + '/' + colony.housing;
      cpHousing.style.color = colony.pops >= colony.housing ? '#e74c3c' : '';

      // Build queue — fingerprint to avoid redundant DOM rebuilds
      const queueKey = colony.buildQueue.map(q => q.id + ':' + q.ticksRemaining).join(',');
      if (queueKey !== _lastQueueKey) {
        _lastQueueKey = queueKey;
        if (colony.buildQueue.length > 0) {
          colonyQueueHeader.classList.remove('hidden');
          colonyQueueList.innerHTML = '';
          for (const q of colony.buildQueue) {
            const isShip = q.type === 'colonyShip';
            const ui = isShip ? { label: 'Colony Ship', color: '#00ffaa' } : (DISTRICT_UI[q.type] || {});
            const totalTicks = isShip ? 600 : _getBuildTime(q.type);
            const pct = totalTicks > 0 ? Math.min(100, ((totalTicks - q.ticksRemaining) / totalTicks) * 100) : 0;
            const secLeft = (q.ticksRemaining / 10).toFixed(0);

            const div = document.createElement('div');
            div.className = 'queue-item';
            div.innerHTML =
              `<div class="queue-item-swatch" style="background:${ui.color || '#666'}"></div>` +
              `<span class="queue-item-name">${ui.label || q.type}</span>` +
              `<span class="queue-item-time">${secLeft}s</span>` +
              `<button class="queue-item-cancel" title="Cancel (50% refund)">&times;</button>` +
              `<div class="queue-progress" style="width:100%"><div class="queue-progress-fill" style="width:${pct}%"></div></div>`;

            const cancelBtn = div.querySelector('.queue-item-cancel');
            cancelBtn.addEventListener('click', () => {
              send({ type: 'demolish', colonyId: colony.id, districtId: q.id });
            });

            colonyQueueList.appendChild(div);
          }
        } else {
          colonyQueueHeader.classList.add('hidden');
          colonyQueueList.innerHTML = '';
        }
      }
    }
  }

  // ── Colony list sidebar ──
  function _updateColonyList() {
    const sidebar = document.getElementById('colony-list-sidebar');
    if (!sidebar || !gameState) return;
    const myColonies = gameState.colonies.filter(c => c.ownerId === gameState.yourId);
    if (myColonies.length <= 1) {
      sidebar.classList.add('hidden');
      return;
    }
    sidebar.classList.remove('hidden');
    sidebar.innerHTML = '<div class="colony-list-title">Colonies</div>';
    myColonies.forEach((col, idx) => {
      const entry = document.createElement('div');
      entry.className = 'colony-list-entry' + (idx === _viewingColonyIndex ? ' active' : '');
      entry.innerHTML =
        `<span class="colony-list-name">${col.name}</span>` +
        `<span class="colony-list-pops">${col.pops} pop</span>`;
      entry.addEventListener('click', () => {
        _viewingColonyIndex = idx;
        _refreshPlayerCache();
        if (currentView === 'colony' && window.ColonyRenderer && _cachedMyColony) {
          window.ColonyRenderer.buildColonyGrid(_cachedMyColony);
        }
        _lastQueueKey = ''; // force queue rebuild
        _updateColonyList();
      });
      sidebar.appendChild(entry);
    });
    // Colony ship count
    const myShips = (gameState.colonyShips || []).filter(s => s.ownerId === gameState.yourId);
    if (myShips.length > 0) {
      const shipInfo = document.createElement('div');
      shipInfo.className = 'colony-list-ships';
      const idle = myShips.filter(s => !s.path || s.path.length === 0).length;
      const transit = myShips.length - idle;
      shipInfo.textContent = `Ships: ${idle} idle` + (transit > 0 ? `, ${transit} in transit` : '');
      sidebar.appendChild(shipInfo);
    }
  }

  // ── View toggle (G key) ──

  function _toggleView() {
    if (!gameState) return;
    if (currentView === 'colony') {
      _switchToGalaxy();
    } else {
      _switchToColony();
    }
  }

  function _switchToGalaxy() {
    currentView = 'galaxy';
    _hideAllPanels();

    // Hide colony UI elements
    const colonyPanel = document.getElementById('colony-panel');
    if (colonyPanel) colonyPanel.classList.add('hidden');

    // Stop colony renderer (stops rAF loop, releases WebGL resources)
    if (window.ColonyRenderer) window.ColonyRenderer.destroy();
    const renderContainer = document.getElementById('render-container');
    if (renderContainer) renderContainer.innerHTML = '';

    // Init galaxy view
    if (window.GalaxyView && gameState.galaxy) {
      window.GalaxyView.init(renderContainer);
      window.GalaxyView.buildGalaxy(gameState.galaxy);
      window.GalaxyView.updateOwnership(gameState.colonies, gameState.players);
      window.GalaxyView.setOnSystemSelect(_onSystemSelect);
      galaxyViewInitialized = true;

      // Start galaxy render loop
      if (galaxyAnimFrame) cancelAnimationFrame(galaxyAnimFrame);
      _galaxyAnimate();
    }

    _updateViewUI();
  }

  function _switchToColony() {
    currentView = 'colony';

    // Hide galaxy panels
    if (systemPanel) systemPanel.classList.add('hidden');

    // Stop galaxy render loop and destroy galaxy view
    if (galaxyAnimFrame) {
      cancelAnimationFrame(galaxyAnimFrame);
      galaxyAnimFrame = null;
    }
    if (window.GalaxyView) window.GalaxyView.destroy();
    galaxyViewInitialized = false;

    // Re-init colony renderer
    const renderContainer = document.getElementById('render-container');
    if (renderContainer) renderContainer.innerHTML = '';
    if (window.ColonyRenderer) {
      window.ColonyRenderer.init();
      window.ColonyRenderer.setOnTileSelect(_onTileSelect);
      const myColony = _getMyColony();
      if (myColony) window.ColonyRenderer.buildColonyGrid(myColony);
    }

    // Show colony panel
    const colonyPanel = document.getElementById('colony-panel');
    if (colonyPanel) colonyPanel.classList.remove('hidden');

    _updateViewUI();
  }

  function _galaxyAnimate() {
    galaxyAnimFrame = requestAnimationFrame(_galaxyAnimate);
    if (window.GalaxyView) window.GalaxyView.render();
  }

  function _updateViewUI() {
    if (viewIndicator) {
      viewIndicator.textContent = currentView === 'colony' ? 'Colony' : 'Galaxy';
    }
  }

  // ── System selection panel (galaxy view) ──

  function _onSystemSelect(system) {
    if (!systemPanel) return;
    if (!system) {
      systemPanel.classList.add('hidden');
      return;
    }

    systemPanelTitle.textContent = system.name;

    // Star type
    const starLabel = {
      yellow: 'Yellow Star', red: 'Red Dwarf', blue: 'Blue Giant',
      white: 'White Star', orange: 'Orange Star',
    };

    let html = `<div class="system-star-type"><span class="system-star-dot" style="background:${system.starColor}"></span>${starLabel[system.starType] || system.starType}</div>`;

    // Owner
    if (system.owner) {
      const ownerPlayer = gameState.players.find(p => p.id === system.owner);
      if (ownerPlayer) {
        html += `<div class="system-owner">Owner: <span style="color:${ownerPlayer.color}">${ownerPlayer.name}</span></div>`;
      }
    }

    // Planets table
    if (system.planets && system.planets.length > 0) {
      html += '<table class="system-planet-table"><tr><th>#</th><th>Type</th><th>Size</th><th>Hab</th><th>Bonus</th></tr>';
      for (const p of system.planets) {
        const habClass = p.habitability >= 60 ? 'hab-high' : p.habitability > 0 ? 'hab-med' : 'hab-none';
        const typeLabel = p.type.charAt(0).toUpperCase() + p.type.slice(1);
        const bonusLabel = _planetBonusLabel(p.type);
        const bonusHtml = bonusLabel ? `<span class="planet-bonus-tag">${bonusLabel}</span>` : '—';
        html += `<tr><td>${p.orbit}</td><td>${typeLabel}</td><td>${p.size}</td><td class="${habClass}">${p.habitability}%</td><td>${bonusHtml}</td></tr>`;
      }
      html += '</table>';
    }

    // Colony link button
    const colony = gameState.colonies.find(c => c.systemId === system.id);
    if (colony && colony.ownerId === gameState.yourId) {
      html += `<button class="system-colony-btn" data-colony-id="${colony.id}">View Colony: ${colony.name}</button>`;
    }

    // "Send Colony Ship" button — if player has idle ships and target has habitable planet
    const idleShips = (gameState.colonyShips || []).filter(
      s => s.ownerId === gameState.yourId && (!s.path || s.path.length === 0)
    );
    const hasHabitable = system.planets && system.planets.some(p => p.habitability >= 20 && !p.colonized);
    const alreadyColonized = gameState.colonies.some(c => c.systemId === system.id);
    if (idleShips.length > 0 && hasHabitable && !alreadyColonized) {
      html += `<button class="system-send-ship-btn">Send Colony Ship here</button>`;
    }

    systemPanelBody.innerHTML = html;

    // Wire colony button
    const colBtn = systemPanelBody.querySelector('.system-colony-btn');
    if (colBtn) {
      colBtn.addEventListener('click', () => {
        // Switch to the colony at this system
        const myColonies = gameState.colonies.filter(c => c.ownerId === gameState.yourId);
        const idx = myColonies.findIndex(c => c.id === colBtn.dataset.colonyId);
        if (idx >= 0) _viewingColonyIndex = idx;
        _refreshPlayerCache();
        _switchToColony();
      });
    }

    // Wire send colony ship button
    const sendShipBtn = systemPanelBody.querySelector('.system-send-ship-btn');
    if (sendShipBtn) {
      sendShipBtn.addEventListener('click', () => {
        const ship = idleShips[0]; // send first idle ship
        send({ type: 'sendColonyShip', shipId: ship.id, targetSystemId: system.id });
        systemPanel.classList.add('hidden');
      });
    }

    systemPanel.classList.remove('hidden');
  }

  function _setNet(el, value) {
    if (!el) return;
    if (value > 0) {
      el.textContent = '+' + value;
      el.className = 'res-net positive';
    } else if (value < 0) {
      el.textContent = '' + value;
      el.className = 'res-net negative';
    } else {
      el.textContent = '0';
      el.className = 'res-net';
    }
  }

  function _getBuildTime(type) {
    const times = { housing: 200, generator: 300, mining: 300, agriculture: 300, industrial: 400, research: 400 };
    return times[type] || 300;
  }

  // ── Scoreboard ──
  function _toggleScoreboard() {
    if (!scoreboard) return;
    if (scoreboard.classList.contains('hidden')) {
      _renderScoreboard();
      scoreboard.classList.remove('hidden');
    } else {
      scoreboard.classList.add('hidden');
    }
  }

  function _renderScoreboard() {
    if (!scoreboardBody || !gameState) return;
    const players = [...(gameState.players || [])];
    // Sort by VP descending
    players.sort((a, b) => (b.vp || 0) - (a.vp || 0));

    let html = '<table class="scoreboard-table"><tr><th>#</th><th>Player</th><th>VP</th></tr>';
    players.forEach((p, i) => {
      const isMe = p.id === gameState.yourId;
      const cls = isMe ? ' class="scoreboard-me"' : '';
      html += `<tr${cls}><td>${i + 1}</td><td><span class="scoreboard-color" style="background:${p.color}"></span>${p.name}</td><td>${p.vp || 0}</td></tr>`;
    });
    html += '</table>';
    scoreboardBody.innerHTML = html;
  }

  // ── Game Over ──
  function _showGameOver(data) {
    if (!gameOverOverlay) return;
    if (_uiInterval) { clearInterval(_uiInterval); _uiInterval = null; }

    const winner = data.winner;
    const isMe = winner && winner.playerId === (gameState ? gameState.yourId : null);

    gameOverTitle.textContent = isMe ? 'Victory!' : 'Game Over';
    gameOverWinner.innerHTML = winner
      ? `<div class="game-over-winner-name">${winner.name} wins with ${winner.vp} VP</div>`
      : '<div class="game-over-winner-name">No winner</div>';

    let scoresHtml = '<table class="scoreboard-table"><tr><th>#</th><th>Player</th><th>VP</th><th>Pops</th><th>Districts</th><th>Alloys</th><th>Research</th></tr>';
    (data.scores || []).forEach((s, i) => {
      const cls = s.playerId === (gameState ? gameState.yourId : null) ? ' class="scoreboard-me"' : '';
      scoresHtml += `<tr${cls}><td>${i + 1}</td><td><span class="scoreboard-color" style="background:${s.color}"></span>${s.name}</td><td><strong>${s.vp}</strong></td>` +
        `<td>${s.breakdown.pops} (${s.breakdown.popsVP})</td>` +
        `<td>${s.breakdown.districts} (${s.breakdown.districtsVP})</td>` +
        `<td>${Math.floor(s.breakdown.alloys)} (${s.breakdown.alloysVP})</td>` +
        `<td>${Math.floor(s.breakdown.totalResearch)} (${s.breakdown.researchVP})</td></tr>`;
    });
    scoresHtml += '</table>';
    gameOverScores.innerHTML = scoresHtml;

    gameOverOverlay.classList.remove('hidden');
  }

  // ── Match Warning Banner ──
  function _showMatchWarning(text) {
    if (!matchWarning) return;
    matchWarning.textContent = text;
    matchWarning.classList.remove('hidden');
    if (_warningTimeout) clearTimeout(_warningTimeout);
    _warningTimeout = setTimeout(() => matchWarning.classList.add('hidden'), 5000);
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
  if (researchPanelClose) researchPanelClose.addEventListener('click', () => {
    researchPanel.classList.add('hidden');
  });
  if (scoreboardClose) scoreboardClose.addEventListener('click', () => {
    scoreboard.classList.add('hidden');
  });
  if (systemPanelClose) systemPanelClose.addEventListener('click', () => {
    systemPanel.classList.add('hidden');
    if (window.GalaxyView) window.GalaxyView.setOnSystemSelect(_onSystemSelect); // keep callback, just hide
  });

  // Keyboard shortcuts (only during game)
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (!gameState) return;

    if (e.key === 'g' || e.key === 'G') {
      _toggleView();
    }
    if (e.key === 'r' || e.key === 'R') {
      _toggleResearchPanel();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      _toggleScoreboard();
    }
    if (e.key === 'Escape') {
      if (researchPanel && !researchPanel.classList.contains('hidden')) {
        researchPanel.classList.add('hidden');
      }
      if (scoreboard && !scoreboard.classList.contains('hidden')) {
        scoreboard.classList.add('hidden');
      }
      if (systemPanel && !systemPanel.classList.contains('hidden')) {
        systemPanel.classList.add('hidden');
      }
    }
    // Colony switching: number keys 1-5
    if (e.key >= '1' && e.key <= '5') {
      const idx = parseInt(e.key, 10) - 1;
      const myColonies = gameState.colonies.filter(c => c.ownerId === gameState.yourId);
      if (idx < myColonies.length && idx !== _viewingColonyIndex) {
        _viewingColonyIndex = idx;
        _refreshPlayerCache();
        if (currentView === 'colony' && window.ColonyRenderer && _cachedMyColony) {
          window.ColonyRenderer.buildColonyGrid(_cachedMyColony);
        }
        _lastQueueKey = '';
        _updateColonyList();
      }
    }
    // Speed controls: +/= to speed up, - to slow down, Space to pause
    if (e.key === '+' || e.key === '=') {
      const cur = (gameState && gameState.gameSpeed) || 2;
      if (cur < 5) send({ type: 'setGameSpeed', speed: cur + 1 });
    }
    if (e.key === '-') {
      const cur = (gameState && gameState.gameSpeed) || 2;
      if (cur > 1) send({ type: 'setGameSpeed', speed: cur - 1 });
    }
    if (e.key === ' ') {
      e.preventDefault();
      send({ type: 'togglePause' });
    }
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
    const matchTimer = roomMatchTimer ? parseInt(roomMatchTimer.value, 10) : 20;
    send({ type: 'createRoom', name, maxPlayers, matchTimer });
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

  if (gameOverLobbyBtn) gameOverLobbyBtn.addEventListener('click', () => {
    gameOverOverlay.classList.add('hidden');
    gameState = null;
    send({ type: 'leaveRoom' });
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
