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
  const singlePlayerBtn = document.getElementById('single-player-btn');
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
  const gameChatPanel = document.getElementById('game-chat');
  const gameChatMessages = document.getElementById('game-chat-messages');
  const gameChatInput = document.getElementById('game-chat-input');

  // ── Screen management ──
  function showScreen(name) {
    for (const [key, el] of Object.entries(screens)) {
      el.classList.toggle('active', key === name);
    }
  }

  // ── WebSocket ──
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams(location.search);
    const port = params.get('gamePort') || 4001;
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
        if (gameState && gameChatMessages) {
          _addGameChatMessage(msg.from, msg.text);
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
          scienceShips: msg.scienceShips || [],
          surveyedSystems: msg.surveyedSystems || {},
          yourId: msg.yourId,
          matchTimerEnabled: msg.matchTimerEnabled || false,
          matchTicksRemaining: msg.matchTicksRemaining || 0,
          galaxy: msg.galaxy || null,
          gameSpeed: msg.gameSpeed || 2,
          paused: msg.paused || false,
          doctrinePhase: msg.doctrinePhase || false,
          doctrineDeadlineTick: msg.doctrineDeadlineTick || 0,
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
        // Show doctrine selection overlay at game start
        doctrineChosen = false;
        _showDoctrineSelection();
        break;

      case 'gameState':
        if (gameState) {
          gameState.tick = msg.tick;
          gameState.players = msg.players;
          gameState.colonies = msg.colonies;
          if (msg.colonyShips) gameState.colonyShips = msg.colonyShips;
          if (msg.scienceShips) gameState.scienceShips = msg.scienceShips;
          if (msg.surveyedSystems) gameState.surveyedSystems = msg.surveyedSystems;
          if (msg.matchTimerEnabled !== undefined) gameState.matchTimerEnabled = msg.matchTimerEnabled;
          if (msg.matchTicksRemaining !== undefined) gameState.matchTicksRemaining = msg.matchTicksRemaining;
          if (msg.gameSpeed !== undefined) gameState.gameSpeed = msg.gameSpeed;
          if (msg.paused !== undefined) gameState.paused = msg.paused;
          gameState.doctrinePhase = msg.doctrinePhase || false;
          gameState.doctrineDeadlineTick = msg.doctrineDeadlineTick || 0;
          _refreshPlayerCache();
          // Update Three.js colony view
          if (currentView === 'colony' && window.ColonyRenderer) {
            if (_cachedMyColony) window.ColonyRenderer.updateFromState(_cachedMyColony);
          }
          // Update galaxy view: ownership rings + colony ships
          if (currentView === 'galaxy' && window.GalaxyView) {
            window.GalaxyView.updateOwnership(msg.colonies, msg.players);
            window.GalaxyView.updateColonyShips(gameState.colonyShips);
            if (window.GalaxyView.updateScienceShips) {
              window.GalaxyView.updateScienceShips(gameState.scienceShips);
            }
            if (window.GalaxyView.updateRaiders) {
              window.GalaxyView.updateRaiders(gameState.raiders);
            }
            if (window.GalaxyView.updateCorvettes) {
              window.GalaxyView.updateCorvettes(gameState.militaryShips);
            }
            // Refresh open system panel so survey results appear
            if (systemPanel && !systemPanel.classList.contains('hidden')) {
              const sel = window.GalaxyView.getSelectedSystem();
              if (sel) _onSystemSelect(sel);
            }
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
        } else if (msg.eventType === 'combatStarted') {
          // Trigger combat flash on galaxy map
          if (window.GalaxyView && msg.systemId != null) {
            window.GalaxyView.showCombatFlash(msg.systemId);
          }
        } else if (msg.eventType === 'matchWarning') {
          _showMatchWarning('2 minutes remaining!');
        } else if (msg.eventType === 'finalCountdown') {
          _showMatchWarning('30 seconds — FINAL COUNTDOWN!');
        } else if (msg.eventType === 'endgameCrisisWarning') {
          _showMatchWarning('ENDGAME CRISIS APPROACHING...');
        } else if (msg.eventType === 'endgameCrisis') {
          _showEndgameCrisisAlert(msg);
        } else if (msg.eventType === 'precursorDestroyed') {
          _showMatchWarning('PRECURSOR FLEET DESTROYED by ' + (msg.destroyerName || 'Unknown') + '!');
        } else if (msg.eventType === 'precursorOccupied') {
          _showMatchWarning('PRECURSOR occupies ' + (msg.colonyName || 'colony') + '!');
        } else if (msg.eventType === 'resourceRush') {
          _showCatalystAlert('RESOURCE RUSH', 'Motherlode discovered in ' + (msg.systemName || 'unknown system') + '! First to station a fleet or colonize claims +' + (msg.income || 100) + ' ' + (msg.resource || 'resources') + '/month!', '#f39c12');
        } else if (msg.eventType === 'resourceRushClaimed') {
          _showMatchWarning((msg.playerName || 'Someone') + ' claimed the Resource Rush motherlode!');
        } else if (msg.eventType === 'techAuction') {
          _showCatalystAlert('TECH AUCTION', 'Bid influence to instantly complete your current research! Highest bidder wins. All bidders pay.', '#9b59b6');
          _showAuctionUI(msg);
        } else if (msg.eventType === 'techAuctionResult') {
          _hideAuctionUI();
          if (msg.winner) {
            _showMatchWarning((msg.winnerName || 'Someone') + ' won the Tech Auction (' + (msg.techName || 'research') + ') with a bid of ' + msg.winningBid + ' influence!');
          } else {
            _showMatchWarning('Tech Auction ended — no bids received.');
          }
        } else if (msg.eventType === 'borderIncident') {
          _showCatalystAlert('BORDER INCIDENT', 'Tensions rising between ' + (msg.playerNames || []).join(' and ') + '! Choose: escalate or de-escalate.', '#e74c3c');
          if (msg.players && gameState && msg.players.includes(gameState.yourId)) {
            _showIncidentUI(msg);
          }
        } else if (msg.eventType === 'borderIncidentResult') {
          _hideIncidentUI();
          const r = msg.result;
          if (r === 'both_deescalate') {
            _showMatchWarning('Border Incident resolved peacefully — both parties gain +5 VP!');
          } else if (r === 'both_escalate') {
            _showMatchWarning('Border Incident escalated — both parties are now hostile!');
          } else {
            _showMatchWarning('Border Incident: one party escalated — diplomatic fallout!');
          }
        } else if (msg.eventType === 'resourceGift') {
          if (msg.direction === 'received') {
            _showToast(msg.senderName + ' sent you ' + msg.amount + ' ' + msg.resource + '!', 'info');
          } else {
            _showToast('You sent ' + msg.amount + ' ' + msg.resource + ' to ' + msg.targetName, 'info');
          }
        }
        // Show toast for game events (own events only)
        if (msg.playerId === (gameState && gameState.yourId)) {
          const toastText = _formatGameEvent(msg);
          if (toastText) {
            _showToast(toastText, TOAST_TYPE_MAP[msg.eventType] || 'info');
          }
        }
        // Show event ticker for broadcast events (all players) and combat events
        if (msg.broadcast || msg.eventType === 'combatStarted' || msg.eventType === 'combatResult' || msg.eventType === 'colonyOccupied' || msg.eventType === 'colonyLiberated' || msg.eventType === 'warDeclared' || msg.eventType === 'allianceFormed' || msg.eventType === 'friendlyProposed' || msg.eventType === 'endgameCrisis' || msg.eventType === 'endgameCrisisWarning' || msg.eventType === 'precursorDestroyed' || msg.eventType === 'precursorOccupied' || msg.eventType === 'precursorCombat' || msg.eventType === 'resourceRush' || msg.eventType === 'resourceRushClaimed' || msg.eventType === 'techAuction' || msg.eventType === 'techAuctionResult' || msg.eventType === 'borderIncident' || msg.eventType === 'borderIncidentResult' || msg.eventType === 'resourceGift') {
          const tickerHtml = _formatTickerEvent(msg);
          if (tickerHtml) _addTickerEvent(tickerHtml);
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

    if (currentRoom.practiceMode) {
      // Single player — no ready needed, just show launch
      readyBtn.classList.add('hidden');
      launchBtn.classList.remove('hidden');
    } else {
      readyBtn.classList.remove('hidden');
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
  }

  // ── District definitions (client-side mirror for UI) ──
  const DISTRICT_UI = {
    housing:     { label: 'Housing',     color: '#ecf0f1', cost: { minerals: 100 }, produces: '+5 Housing, +2 Food', consumes: '-1 Energy' },
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
    fusion_reactors:       { track: 'physics', tier: 3, name: 'Fusion Reactors', desc: '+100% Generator output, +1 Alloy/generator', cost: 1000, requires: 'advanced_reactors' },
    genetic_engineering:   { track: 'society', tier: 3, name: 'Genetic Engineering', desc: '+100% Agri output, growth halved', cost: 1000, requires: 'gene_crops' },
    automated_mining:      { track: 'engineering', tier: 3, name: 'Automated Mining', desc: '+100% Mining output, 0 jobs', cost: 1000, requires: 'deep_mining' },
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
    influenceNet: document.getElementById('res-influence-net'),
  };
  const statusSpeed = document.getElementById('status-speed');
  const pauseOverlay = document.getElementById('pause-overlay');
  const doctrineOverlay = document.getElementById('doctrine-overlay');
  const doctrineOptions = document.getElementById('doctrine-options');
  const doctrineTimer = document.getElementById('doctrine-timer');
  let doctrineChosen = false;
  const crisisIndicator = document.getElementById('endgame-crisis-indicator');
  const underdogEl = document.getElementById('underdog-indicator');
  const fleetEl = document.getElementById('fleet-indicator');
  const statusMonth = document.getElementById('status-month');
  const statusPops = document.getElementById('status-pops');
  const statusGrowth = document.getElementById('status-growth');
  const growthBarFill = document.getElementById('growth-bar-fill');
  const colonyPanelTitle = document.getElementById('colony-panel-title');
  const cpPlanet = document.getElementById('cp-planet');
  const cpTraitRow = document.getElementById('cp-trait-row');
  const cpTrait = document.getElementById('cp-trait');
  const cpDistricts = document.getElementById('cp-districts');
  const cpWorking = document.getElementById('cp-working');
  const cpIdle = document.getElementById('cp-idle');
  const cpHousing = document.getElementById('cp-housing');
  const colonyQueueHeader = document.getElementById('colony-queue-header');
  const colonyQueueList = document.getElementById('colony-queue-list');
  const buildMenuResources = document.getElementById('build-menu-resources');
  const crisisAlert = document.getElementById('crisis-alert');
  const crisisAlertHeader = document.getElementById('crisis-alert-header');
  const crisisAlertDesc = document.getElementById('crisis-alert-desc');
  const crisisAlertTimer = document.getElementById('crisis-alert-timer');
  const crisisAlertChoices = document.getElementById('crisis-alert-choices');
  const crisisAlertStatus = document.getElementById('crisis-alert-status');

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

  // ── Edict panel refs ──
  const edictPanel = document.getElementById('edict-panel');
  const edictActive = document.getElementById('edict-active');
  const edictOptions = document.getElementById('edict-options');
  const edictPanelClose = document.getElementById('edict-panel-close');

  // ── Scoreboard refs ──
  const scoreboard = document.getElementById('scoreboard');
  const scoreboardBody = document.getElementById('scoreboard-body');
  const scoreboardClose = document.getElementById('scoreboard-close');

  // ── Game over refs ──
  const gameOverOverlay = document.getElementById('game-over-overlay');
  const gameOverTitle = document.getElementById('game-over-title');
  const gameOverWinner = document.getElementById('game-over-winner');
  const gameOverDuration = document.getElementById('game-over-duration');
  const gameOverScores = document.getElementById('game-over-scores');
  const gameOverStats = document.getElementById('game-over-stats');
  const gameOverLobbyBtn = document.getElementById('game-over-lobby-btn');
  const gameOverRematchBtn = document.getElementById('game-over-rematch-btn');

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

  // ── Event Ticker ──
  const eventTicker = document.getElementById('event-ticker');
  const TICKER_MAX = 5;

  function _addTickerEvent(html) {
    if (!eventTicker) return;
    const el = document.createElement('div');
    el.className = 'ticker-item';
    el.innerHTML = html;
    eventTicker.appendChild(el);
    // Enforce max visible
    while (eventTicker.children.length > TICKER_MAX) {
      eventTicker.removeChild(eventTicker.firstChild);
    }
    // Auto-remove after animation
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 6000);
  }

  function _formatTickerEvent(msg) {
    const pn = msg.playerName || '';
    const player = pn ? `<span class="ticker-player">${pn}</span>` : '';
    switch (msg.eventType) {
      case 'constructionComplete':
        if (msg.districtType === 'colonyShip') return `${player} built a Colony Ship`;
        if (msg.districtType === 'scienceShip') return `${player} built a Science Ship`;
        return `${player} built a ${msg.districtType} district on ${msg.colonyName || 'colony'}`;
      case 'popMilestone':
        return `${player}'s ${msg.colonyName || 'colony'} reached ${msg.pops} pops`;
      case 'colonyFounded':
        return `${player} founded a colony in ${msg.systemName || 'a system'}`;
      case 'researchComplete':
        return `${player} researched ${msg.techName || 'a technology'}`;
      case 'surveyComplete':
        return `${player} surveyed ${msg.systemName || 'a system'}` + (msg.discoveries && msg.discoveries.length > 0 ? ` — ${msg.discoveries.length} anomal${msg.discoveries.length === 1 ? 'y' : 'ies'} found!` : '');
      case 'crisisStarted':
        return `<span style="color:#e74c3c">⚠ ${msg.crisisLabel || 'Crisis'}</span> on ${player}'s ${msg.colonyName || 'colony'}!`;
      case 'crisisResolved':
        return `${player}'s ${msg.colonyName || 'colony'}: ${msg.outcome || 'crisis resolved'}`;
      case 'scarcityWarning': {
        const rn = (msg.resource || 'resource').charAt(0).toUpperCase() + (msg.resource || '').slice(1);
        return `<span style="color:#f39c12">\u26A0 ${rn} scarcity approaching — brace for -30% production!</span>`;
      }
      case 'scarcityStarted': {
        const rn = (msg.resource || 'resource').charAt(0).toUpperCase() + (msg.resource || '').slice(1);
        return `<span style="color:#e74c3c">\u26A0 ${rn} SCARCITY — production reduced 30% galaxy-wide!</span>`;
      }
      case 'scarcityEnded': {
        const rn = (msg.resource || 'resource').charAt(0).toUpperCase() + (msg.resource || '').slice(1);
        return `<span style="color:#2ecc71">${rn} scarcity ended — production restored.</span>`;
      }
      case 'raiderSpawned':
        return `<span style="color:#e74c3c">\u26A0 Raider fleet detected on the galactic rim!</span>`;
      case 'raiderDefeated':
        return `<span style="color:#2ecc71">Defense platform destroyed raider at ${msg.colonyName || 'colony'}! +5 VP</span>`;
      case 'colonyRaided':
        return `<span style="color:#e74c3c">\u26A0 ${msg.colonyName || 'Colony'} was raided! ${msg.districtsDisabled || 0} districts disabled.</span>`;
      case 'maintenanceAttrition':
        return `<span style="color:#e74c3c">⚠ ${player} lost ${msg.shipsLost} corvette${msg.shipsLost > 1 ? 's' : ''} — cannot afford fleet maintenance!</span>`;
      case 'combatStarted': {
        const _pn = (id) => { const pp = (gameState && gameState.players || []).find(x => x.id === id); return pp ? pp.name : 'Unknown'; };
        const sides = (msg.combatants || []).map(c => `${_pn(c.playerId)}(${c.ships})`).join(' vs ');
        return `<span style="color:#ff6b6b">\u2694 Fleet combat at ${msg.systemName || 'system'}! ${sides}</span>`;
      }
      case 'combatResult': {
        if (msg.retreatFailed) {
          return `<span style="color:#e74c3c">Ship destroyed during retreat at ${msg.systemName || 'system'}!</span>`;
        }
        const _pn2 = (id) => { const pp = (gameState && gameState.players || []).find(x => x.id === id); return pp ? pp.name : 'Unknown'; };
        const winner = msg.winnerId ? _pn2(msg.winnerId) : 'Draw';
        const lossStr = Object.entries(msg.losses || {}).map(([pid, n]) => `${_pn2(pid)} lost ${n}`).join(', ');
        return `<span style="color:#f39c12">\u2694 Battle at ${msg.systemName || 'system'}: ${winner} wins! ${lossStr}</span>`;
      }
      case 'colonyOccupied': {
        return `<span style="color:#e74c3c">\u2694 ${msg.occupantName || 'Unknown'} has occupied ${msg.colonyName || 'colony'} in ${msg.systemName || 'system'}!</span>`;
      }
      case 'colonyLiberated': {
        const _pn3 = (id) => { const pp = (gameState && gameState.players || []).find(x => x.id === id); return pp ? pp.name : 'Unknown'; };
        return `<span style="color:#2ecc71">\u2694 ${msg.colonyName || 'Colony'} has been liberated from ${_pn3(msg.liberatedFrom)}!</span>`;
      }
      case 'warDeclared':
        return `<span style="color:#e74c3c">\u2694 WAR DECLARED: ${msg.aggressorName || 'Unknown'} declares war on ${msg.targetName || 'Unknown'}!</span>`;
      case 'allianceFormed':
        return `<span style="color:#3498db">\u2726 ALLIANCE FORMED: ${msg.player1Name || 'Unknown'} and ${msg.player2Name || 'Unknown'} are now allies!</span>`;
      case 'friendlyProposed':
        return `<span style="color:#3498db">\u2726 ${msg.fromName || 'Unknown'} proposes an alliance! <button class="stance-btn stance-friendly" onclick="window._acceptDiplomacy('${msg.fromId}')">Accept</button></span>`;
      case 'resourceRush': {
        const rn = (msg.resource || 'resource').charAt(0).toUpperCase() + (msg.resource || '').slice(1);
        return `<span style="color:#f39c12">\u2B50 RESOURCE RUSH — ${rn} motherlode in ${msg.systemName || 'system'}! Claim it first!</span>`;
      }
      case 'resourceRushClaimed':
        return `<span style="color:#f39c12">\u2B50 ${msg.playerName || 'Unknown'} claimed the motherlode!</span>`;
      case 'resourceRushExpired':
        return `<span style="color:#888">Resource Rush motherlode has been exhausted.</span>`;
      case 'techAuction':
        return `<span style="color:#9b59b6">\u2696 TECH AUCTION — Bid influence to complete research instantly!</span>`;
      case 'techAuctionResult':
        return msg.winner
          ? `<span style="color:#9b59b6">\u2696 ${msg.winnerName || 'Unknown'} won the auction — ${msg.techName || 'tech'} completed! (Bid: ${msg.winningBid})</span>`
          : `<span style="color:#888">\u2696 Tech Auction ended — no bids.</span>`;
      case 'borderIncident':
        return `<span style="color:#e74c3c">\u26A0 BORDER INCIDENT between ${(msg.playerNames || []).join(' and ')}!</span>`;
      case 'borderIncidentResult': {
        const r = msg.result;
        if (r === 'both_deescalate') return `<span style="color:#2ecc71">\u2726 Border Incident resolved peacefully — +5 VP each!</span>`;
        if (r === 'both_escalate') return `<span style="color:#e74c3c">\u2694 Border Incident escalated — both parties now hostile!</span>`;
        return `<span style="color:#f39c12">\u2694 Border Incident: one party escalated — diplomatic tensions rise!</span>`;
      }
      case 'resourceGift': {
        const rn = (msg.resource || 'resource').charAt(0).toUpperCase() + (msg.resource || '').slice(1);
        return `<span style="color:#2ecc71">\u{1F381} ${msg.senderName || 'Unknown'} sent ${msg.amount} ${rn} to ${msg.targetName || 'Unknown'}</span>`;
      }
      default:
        return null;
    }
  }

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

    // Science Ship build option
    {
      const sciBtn = document.createElement('div');
      sciBtn.className = 'build-option build-option-ship';
      const sciCost = { minerals: 100, alloys: 50 };
      let canAffordSci = true;
      const sciCostParts = [];
      for (const [res, amt] of Object.entries(sciCost)) {
        sciCostParts.push(`${amt} ${res}`);
        if (!myPlayer || myPlayer.resources[res] < amt) canAffordSci = false;
      }
      // Check science ship cap (3 max, including building)
      const mySciShips = gameState && gameState.scienceShips ? gameState.scienceShips.filter(s => s.ownerId === gameState.yourId) : [];
      let sciBuildingCount = 0;
      if (gameState) {
        const myCols = gameState.colonies.filter(c => c.ownerId === gameState.yourId);
        for (const c of myCols) {
          for (const q of (c.buildQueue || [])) {
            if (q.type === 'scienceShip') sciBuildingCount++;
          }
        }
      }
      const atSciCap = mySciShips.length + sciBuildingCount >= 3;
      if (!canAffordSci || queueFull || atSciCap) sciBtn.classList.add('disabled');

      sciBtn.innerHTML =
        '<div class="build-option-swatch" style="background:#00e5ff"></div>' +
        '<div class="build-option-name">Science Ship</div>' +
        '<div class="build-option-prod">Explore &amp; survey systems</div>' +
        `<div class="build-option-cost">${sciCostParts.join(', ')}</div>`;

      sciBtn.addEventListener('click', () => {
        if (sciBtn.classList.contains('disabled')) return;
        if (!myColony) return;
        send({ type: 'buildScienceShip', colonyId: myColony.id });
        _hideAllPanels();
        if (window.ColonyRenderer) window.ColonyRenderer.deselectTile();
      });

      buildMenuOptions.appendChild(sciBtn);
    }

    // Corvette (military ship) build options — base + variants
    {
      const corvCost = { minerals: 100, alloys: 50 };
      let canAffordCorv = true;
      const corvCostParts = [];
      for (const [res, amt] of Object.entries(corvCost)) {
        corvCostParts.push(`${amt} ${res}`);
        if (!myPlayer || myPlayer.resources[res] < amt) canAffordCorv = false;
      }
      // Check corvette cap (10 max, including building)
      const myCorvettes = gameState && gameState.militaryShips ? gameState.militaryShips.filter(s => s.ownerId === gameState.yourId) : [];
      let corvBuildingCount = 0;
      if (gameState) {
        const myCols = gameState.colonies.filter(c => c.ownerId === gameState.yourId);
        for (const c of myCols) {
          for (const q of (c.buildQueue || [])) {
            if (q.type === 'corvette') corvBuildingCount++;
          }
        }
      }
      const atCorvCap = myCorvettes.length + corvBuildingCount >= 10;
      const completedTechs = myPlayer ? (myPlayer.completedTechs || []) : [];

      // Base corvette
      const corvBtn = document.createElement('div');
      corvBtn.className = 'build-option build-option-ship';
      if (!canAffordCorv || queueFull || atCorvCap) corvBtn.classList.add('disabled');
      corvBtn.innerHTML =
        '<div class="build-option-swatch" style="background:#ff4444"></div>' +
        '<div class="build-option-name">Corvette</div>' +
        '<div class="build-option-prod">Military warship (10 HP, 3 ATK, 4s/hop) | Upkeep: 1⚡ 1🔩/mo</div>' +
        `<div class="build-option-cost">${corvCostParts.join(', ')}</div>`;
      corvBtn.addEventListener('click', () => {
        if (corvBtn.classList.contains('disabled')) return;
        if (!myColony) return;
        send({ type: 'buildCorvette', colonyId: myColony.id });
        _hideAllPanels();
        if (window.ColonyRenderer) window.ColonyRenderer.deselectTile();
      });
      buildMenuOptions.appendChild(corvBtn);

      // Corvette variants — shown only when required T2 tech is completed
      const variants = [
        { key: 'interceptor', name: 'Interceptor', tech: 'advanced_reactors', color: '#4488ff',
          desc: 'Fast striker (8 HP, 5 ATK, 3s/hop) | Upkeep: 1⚡/mo', techName: 'Advanced Reactors' },
        { key: 'gunboat', name: 'Gunboat', tech: 'deep_mining', color: '#ff8844',
          desc: 'Heavy tank (15 HP, 4 ATK, 5s/hop) | Upkeep: 2⚡ 1🔩/mo', techName: 'Deep Mining' },
        { key: 'sentinel', name: 'Sentinel', tech: 'gene_crops', color: '#44ff88',
          desc: 'Sustain fighter (12 HP, 3 ATK +2 regen, 4s/hop) | Upkeep: 1⚡ 2🔩/mo', techName: 'Gene Crops' },
      ];
      for (const v of variants) {
        const hasTech = completedTechs.includes(v.tech);
        const vBtn = document.createElement('div');
        vBtn.className = 'build-option build-option-ship';
        if (!hasTech || !canAffordCorv || queueFull || atCorvCap) vBtn.classList.add('disabled');
        const lockLabel = hasTech ? '' : ` [Requires ${v.techName}]`;
        vBtn.innerHTML =
          `<div class="build-option-swatch" style="background:${v.color}"></div>` +
          `<div class="build-option-name">${v.name}${lockLabel}</div>` +
          `<div class="build-option-prod">${v.desc}</div>` +
          `<div class="build-option-cost">${corvCostParts.join(', ')}</div>`;
        vBtn.addEventListener('click', () => {
          if (vBtn.classList.contains('disabled')) return;
          if (!myColony) return;
          send({ type: 'buildCorvette', colonyId: myColony.id, variant: v.key });
          _hideAllPanels();
          if (window.ColonyRenderer) window.ColonyRenderer.deselectTile();
        });
        buildMenuOptions.appendChild(vBtn);
      }
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
    _updateDoctrineTimer();
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

    // Influence income (empire-wide, from player summary)
    if (player && player.income && player.income.influence != null) {
      _setNet(resBar.influenceNet, player.income.influence);
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

    // Scarcity indicator
    const scarcityEl = document.getElementById('scarcity-indicator');
    if (scarcityEl) {
      if (gameState.activeScarcity) {
        const sr = gameState.activeScarcity.resource;
        const rName = sr.charAt(0).toUpperCase() + sr.slice(1);
        const secsLeft = Math.max(0, Math.ceil(gameState.activeScarcity.ticksRemaining / 10));
        scarcityEl.textContent = rName + ' Scarcity (' + secsLeft + 's)';
        scarcityEl.classList.remove('hidden');
      } else {
        scarcityEl.classList.add('hidden');
      }
    }
    // Raider alert indicator
    const raiderEl = document.getElementById('raider-indicator');
    if (raiderEl) {
      const raiderCount = (gameState.raiders || []).length;
      if (raiderCount > 0) {
        raiderEl.textContent = '\u26A0 ' + raiderCount + ' Raider' + (raiderCount > 1 ? 's' : '') + ' Inbound';
        raiderEl.classList.remove('hidden');
      } else {
        raiderEl.classList.add('hidden');
      }
    }

    // Endgame crisis indicator
    if (crisisIndicator) {
      if (gameState.endgameCrisis) {
        if (gameState.endgameCrisis.type === 'galacticStorm') {
          crisisIndicator.textContent = '\u26A1 Galactic Storm — All production -25%';
          crisisIndicator.style.color = '#e74c3c';
        } else if (gameState.endgameCrisis.type === 'precursorAwakening') {
          const pf = gameState.precursorFleet;
          const hpText = pf ? ' (HP: ' + pf.hp + ')' : ' (Destroyed)';
          crisisIndicator.textContent = '\uD83D\uDC7E Precursor Fleet' + hpText;
          crisisIndicator.style.color = '#9b59b6';
        }
        crisisIndicator.classList.remove('hidden');
      } else {
        crisisIndicator.classList.add('hidden');
      }
    }

    // Underdog bonus indicator
    if (underdogEl && player) {
      const bonus = player.underdogBonus;
      if (bonus && bonus > 1.0) {
        const pct = Math.round((bonus - 1) * 100);
        underdogEl.textContent = '\u2B06 Underdog Bonus: +' + pct + '%';
        underdogEl.classList.remove('hidden');
      } else {
        underdogEl.classList.add('hidden');
      }
    }

    // Fleet indicator
    if (fleetEl && gameState.militaryShips) {
      const myFleet = gameState.militaryShips.filter(s => s.ownerId === gameState.yourId);
      fleetEl.textContent = myFleet.length > 0 ? ('\u2694 Fleet: ' + myFleet.length) : '';
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
      // Colony personality trait badge
      if (colony.trait && cpTraitRow && cpTrait) {
        cpTraitRow.classList.remove('hidden');
        cpTrait.textContent = colony.trait.name;
      } else if (cpTraitRow) {
        cpTraitRow.classList.add('hidden');
      }
      // Crisis alert panel — only rebuild buttons when crisis type/state changes
      if (colony.crisis && crisisAlert) {
        crisisAlert.classList.remove('hidden');
        crisisAlertHeader.textContent = '\u26A0 ' + colony.crisis.label;
        crisisAlertDesc.textContent = colony.crisis.description;

        if (!colony.crisis.resolved && colony.crisis.ticksRemaining > 0) {
          const sec = (colony.crisis.ticksRemaining / 10).toFixed(0);
          crisisAlertTimer.textContent = 'Time to decide: ' + sec + 's';
          crisisAlertTimer.classList.remove('hidden');
        } else {
          crisisAlertTimer.classList.add('hidden');
        }

        // Show choices or status
        if (!colony.crisis.resolved && colony.crisis.choices && colony.crisis.choices.length > 0) {
          // Only rebuild buttons if crisis type changed (avoid DOM churn at 3.3Hz)
          const crisisKey = colony.crisis.type + ':' + colony.id;
          if (crisisAlertChoices.dataset.crisisKey !== crisisKey) {
            crisisAlertChoices.dataset.crisisKey = crisisKey;
            crisisAlertChoices.innerHTML = '';
            for (const ch of colony.crisis.choices) {
              const btn = document.createElement('button');
              btn.className = 'crisis-choice-btn';
              btn.innerHTML = '<span class="choice-label">' + ch.label + '</span><span class="choice-desc">' + ch.description + '</span>';
              btn.addEventListener('click', () => {
                send({ type: 'resolveCrisis', colonyId: colony.id, choiceId: ch.id });
              });
              crisisAlertChoices.appendChild(btn);
            }
          }
          crisisAlertStatus.textContent = '';
        } else if (colony.crisis.resolved) {
          if (crisisAlertChoices.dataset.crisisKey !== '') {
            crisisAlertChoices.dataset.crisisKey = '';
            crisisAlertChoices.innerHTML = '';
          }
          // Show ongoing effect status
          const st = [];
          if (colony.crisis.quarantineTicks > 0) st.push('Quarantine: ' + (colony.crisis.quarantineTicks / 10).toFixed(0) + 's remaining');
          if (colony.crisis.strikeTicks > 0) st.push('Strike: ' + (colony.crisis.strikeTicks / 10).toFixed(0) + 's remaining');
          if (colony.crisis.energyBoostTicks > 0) st.push('Energy boost: ' + (colony.crisis.energyBoostTicks / 10).toFixed(0) + 's remaining');
          if (colony.crisis.shutdownTicks > 0) st.push('Shutdown: ' + (colony.crisis.shutdownTicks / 10).toFixed(0) + 's remaining');
          crisisAlertStatus.textContent = st.length > 0 ? st.join(' | ') : 'Resolving...';
        }
      } else if (crisisAlert) {
        crisisAlert.classList.add('hidden');
        if (crisisAlertChoices.dataset.crisisKey !== '') {
          crisisAlertChoices.dataset.crisisKey = '';
          crisisAlertChoices.innerHTML = '';
        }
      }

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
            const isShip = q.type === 'colonyShip' || q.type === 'scienceShip';
            const ui = q.type === 'colonyShip' ? { label: 'Colony Ship', color: '#00ffaa' } : q.type === 'scienceShip' ? { label: 'Science Ship', color: '#00e5ff' } : (DISTRICT_UI[q.type] || {});
            const totalTicks = q.type === 'colonyShip' ? 600 : q.type === 'scienceShip' ? 300 : _getBuildTime(q.type);
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
  let _lastColonyListKey = '';

  function _updateColonyList() {
    const sidebar = document.getElementById('colony-list-sidebar');
    if (!sidebar || !gameState) return;
    const myColonies = gameState.colonies.filter(c => c.ownerId === gameState.yourId);
    if (myColonies.length <= 1) {
      sidebar.classList.add('hidden');
      _lastColonyListKey = '';
      return;
    }

    // Fingerprint: colony count + active index + pop counts + ship states
    const myShips = (gameState.colonyShips || []).filter(s => s.ownerId === gameState.yourId);
    const idle = myShips.filter(s => !s.path || s.path.length === 0).length;
    const transit = myShips.length - idle;
    const mySciShipsAll = (gameState.scienceShips || []).filter(s => s.ownerId === gameState.yourId);
    const sciIdle = mySciShipsAll.filter(s => !s.path || s.path.length === 0).length;
    const sciTransit = mySciShipsAll.length - sciIdle;
    let key = _viewingColonyIndex + '|';
    for (const col of myColonies) key += col.id + ':' + col.pops + ':' + (col.trait ? col.trait.type : '') + ':' + (col.occupiedBy || '') + ',';
    key += '|' + idle + ':' + transit + '|' + sciIdle + ':' + sciTransit;
    if (key === _lastColonyListKey) return;
    _lastColonyListKey = key;

    sidebar.classList.remove('hidden');
    sidebar.innerHTML = '<div class="colony-list-title">Colonies</div>';
    myColonies.forEach((col, idx) => {
      const entry = document.createElement('div');
      entry.className = 'colony-list-entry' + (idx === _viewingColonyIndex ? ' active' : '');
      const traitBadge = col.trait ? `<span class="colony-list-trait">${col.trait.name}</span>` : '';
      const occupiedBadge = col.occupiedBy ? `<span class="colony-list-occupied">OCCUPIED</span>` : '';
      entry.innerHTML =
        `<span class="colony-list-name">${col.name}</span>` +
        traitBadge + occupiedBadge +
        `<span class="colony-list-pops">${col.pops} pop</span>`;
      entry.addEventListener('click', () => {
        _viewingColonyIndex = idx;
        _refreshPlayerCache();
        if (currentView === 'colony' && window.ColonyRenderer && _cachedMyColony) {
          window.ColonyRenderer.buildColonyGrid(_cachedMyColony);
        }
        _lastQueueKey = ''; // force queue rebuild
        _lastColonyListKey = ''; // force sidebar rebuild
        _updateColonyList();
      });
      sidebar.appendChild(entry);
    });
    // Colony ship count
    if (myShips.length > 0) {
      const shipInfo = document.createElement('div');
      shipInfo.className = 'colony-list-ships';
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

    // Check fog of war visibility
    const isKnown = !window.GalaxyView || window.GalaxyView.isSystemKnown(system.id);

    if (isKnown) {
      systemPanelTitle.textContent = system.name;
    } else {
      systemPanelTitle.textContent = 'Unknown System';
    }

    // Star type
    const starLabel = {
      yellow: 'Yellow Star', red: 'Red Dwarf', blue: 'Blue Giant',
      white: 'White Star', orange: 'Orange Star',
    };

    let html = `<div class="system-star-type"><span class="system-star-dot" style="background:${isKnown ? system.starColor : '#555566'}"></span>${isKnown ? (starLabel[system.starType] || system.starType) : 'Unknown'}</div>`;

    if (!isKnown) {
      // Unknown system — show exploration prompt
      // Still show ownership dot if another player owns it
      if (system.owner) {
        const ownerPlayer = gameState.players.find(p => p.id === system.owner);
        if (ownerPlayer) {
          html += `<div class="system-owner">Claimed by: <span style="color:${ownerPlayer.color}">${ownerPlayer.name}</span></div>`;
        }
      }
      // "Send Science Ship" button on unknown systems
      const idleSciShipsUnknown = (gameState.scienceShips || []).filter(
        s => s.ownerId === gameState.yourId && (!s.path || s.path.length === 0) && !s.surveying
      );
      const alreadySurveyed = gameState.surveyedSystems && gameState.surveyedSystems[gameState.yourId] && gameState.surveyedSystems[gameState.yourId].includes(system.id);
      if (idleSciShipsUnknown.length > 0 && !alreadySurveyed) {
        html += `<button class="system-send-sci-btn">Send Science Ship to survey</button>`;
      }
      html += '<div class="system-unexplored">Unexplored &mdash; send a science ship to survey</div>';
      systemPanelBody.innerHTML = html;

      // Wire science ship button on unknown system
      const sciBtn2 = systemPanelBody.querySelector('.system-send-sci-btn');
      if (sciBtn2) {
        sciBtn2.addEventListener('click', () => {
          const ship = idleSciShipsUnknown[0];
          send({ type: 'sendScienceShip', shipId: ship.id, targetSystemId: system.id });
          systemPanel.classList.add('hidden');
        });
      }

      systemPanel.classList.remove('hidden');
      return;
    }

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

    // "Send Science Ship" button — if idle science ships and system not yet surveyed
    const idleSciShips = (gameState.scienceShips || []).filter(
      s => s.ownerId === gameState.yourId && (!s.path || s.path.length === 0) && !s.surveying
    );
    const isSurveyed = gameState.surveyedSystems && gameState.surveyedSystems[gameState.yourId] && gameState.surveyedSystems[gameState.yourId].includes(system.id);
    if (idleSciShips.length > 0 && !isSurveyed) {
      html += `<button class="system-send-sci-btn">Send Science Ship to survey</button>`;
    }
    if (isSurveyed) {
      html += '<div class="system-surveyed-badge">Surveyed</div>';
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

    // Wire send science ship button
    const sendSciBtn = systemPanelBody.querySelector('.system-send-sci-btn');
    if (sendSciBtn) {
      sendSciBtn.addEventListener('click', () => {
        const ship = idleSciShips[0];
        send({ type: 'sendScienceShip', shipId: ship.id, targetSystemId: system.id });
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

  // ── Edict panel ──
  const EDICT_UI = {
    mineralRush: { name: 'Mineral Rush', description: '+50% mining output for 5 months', cost: 50 },
    populationDrive: { name: 'Population Drive', description: '+100% pop growth for 5 months', cost: 75 },
    researchGrant: { name: 'Research Grant', description: '+50% research output for 5 months', cost: 50 },
    emergencyReserves: { name: 'Emergency Reserves', description: '+100 energy, minerals, food (instant)', cost: 25 },
  };

  function _toggleEdictPanel() {
    if (!edictPanel) return;
    if (edictPanel.classList.contains('hidden')) {
      _renderEdictPanel();
      edictPanel.classList.remove('hidden');
    } else {
      edictPanel.classList.add('hidden');
    }
  }

  function _renderEdictPanel() {
    const player = _getMyPlayer();
    if (!player) return;

    const influence = Math.floor(player.resources.influence);

    // Active edict display
    if (player.activeEdict) {
      const def = EDICT_UI[player.activeEdict.type];
      edictActive.innerHTML = '<div class="edict-active-label">Active: <strong>' +
        (def ? def.name : player.activeEdict.type) + '</strong> (' +
        player.activeEdict.monthsRemaining + ' months left)</div>';
      edictActive.classList.remove('hidden');
    } else {
      edictActive.classList.add('hidden');
    }

    // Edict options
    edictOptions.innerHTML = '';
    for (const [type, def] of Object.entries(EDICT_UI)) {
      const opt = document.createElement('div');
      opt.className = 'edict-option';
      const canAfford = influence >= def.cost;
      const hasActive = !!player.activeEdict;
      const disabled = !canAfford || (hasActive && type !== 'emergencyReserves');
      // Emergency Reserves is instant — blocked only if another edict is active
      const blocked = hasActive;
      if (disabled || blocked) opt.classList.add('disabled');

      opt.innerHTML = '<div class="edict-name">' + def.name + '</div>' +
        '<div class="edict-desc">' + def.description + '</div>' +
        '<div class="edict-cost">Cost: ' + def.cost + ' influence</div>';

      if (!disabled && !blocked) {
        opt.addEventListener('click', () => {
          send({ type: 'activateEdict', edictType: type });
          edictPanel.classList.add('hidden');
        });
      }
      edictOptions.appendChild(opt);
    }
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

    const month = gameState.tick ? Math.floor(gameState.tick / 100) : 0;
    let html = `<div class="scoreboard-month">Month ${month}</div>`;
    html += '<table class="scoreboard-table"><tr><th>#</th><th>Player</th><th>Stance</th><th>VP</th><th>Colonies</th><th>Pops</th><th>Techs</th><th>Fleet</th><th>Battles</th><th>Raiders</th><th>⚡</th><th>⛏</th><th>🌾</th><th>⚙</th></tr>';
    const myPlayer = players.find(p => p.id === gameState.yourId);
    const myDiplomacy = myPlayer && myPlayer.diplomacy ? myPlayer.diplomacy.stances || {} : {};
    const myPending = myPlayer && myPlayer.diplomacy ? myPlayer.diplomacy.pendingFriendly || [] : [];
    players.forEach((p, i) => {
      const isMe = p.id === gameState.yourId;
      const cls = isMe ? ' class="scoreboard-me"' : '';
      const inc = p.income || {};
      const fmtInc = (v) => { const n = v || 0; return n >= 0 ? `+${n}` : `${n}`; };
      // Stance column: show icon + buttons for non-self players
      let stanceCell = '';
      if (isMe) {
        stanceCell = '-';
      } else {
        const myStance = myDiplomacy[p.id] ? myDiplomacy[p.id].stance : 'neutral';
        const theirStance = p.stanceTowardMe || 'neutral';
        const icon = myStance === 'hostile' ? '<span style="color:#e74c3c" title="At War">&#x2694;</span>' :
                     myStance === 'friendly' ? '<span style="color:#3498db" title="Allied">&#x2726;</span>' :
                     '<span style="color:#888" title="Neutral">&#x25CB;</span>';
        const theirIcon = theirStance === 'hostile' ? '&#x2694;' : theirStance === 'friendly' ? '&#x2726;' : '';
        // Check if they have a pending proposal toward us
        const hasPending = (gameState.players || []).some(pp => pp.id !== gameState.yourId && pp.diplomacy && pp.diplomacy.pendingFriendly && pp.diplomacy.pendingFriendly.includes(gameState.yourId) && pp.id === p.id);
        // Actually we can't see their pending — check if they sent us a friendlyProposed. Use stanceTowardMe approach
        // Show accept button if their stance toward me is checked via pending — we track via server events instead
        // For now show stance icons and action buttons
        const pendingToThem = myPending.includes(p.id);
        let btns = '';
        if (myStance !== 'hostile') btns += `<button class="stance-btn stance-hostile" onclick="window._setDiplomacy('${p.id}','hostile')" title="Declare War">&#x2694;</button>`;
        if (myStance !== 'friendly' && !pendingToThem) btns += `<button class="stance-btn stance-friendly" onclick="window._setDiplomacy('${p.id}','friendly')" title="Propose Alliance">&#x2726;</button>`;
        if (pendingToThem) btns += '<span class="stance-pending">pending...</span>';
        if (myStance !== 'neutral' && myStance !== undefined) btns += `<button class="stance-btn stance-neutral" onclick="window._setDiplomacy('${p.id}','neutral')" title="Set Neutral">&#x25CB;</button>`;
        btns += `<button class="stance-btn stance-gift" onclick="window._giftResources('${p.id}')" title="Send Resources">&#x1F381;</button>`;
        stanceCell = `${icon}${theirIcon ? ' ' + theirIcon : ''} ${btns}`;
      }
      const docBadge = p.doctrine ? ` <span class="doctrine-badge" title="${(DOCTRINE_INFO[p.doctrine] || {}).name || p.doctrine}">${p.doctrine === 'industrialist' ? '⚒' : p.doctrine === 'scholar' ? '📚' : p.doctrine === 'expansionist' ? '🚀' : ''}</span>` : '';
      html += `<tr${cls}><td>${i + 1}</td>` +
        `<td><span class="scoreboard-color" style="background:${p.color}"></span>${p.name}${docBadge}</td>` +
        `<td class="stance-cell">${stanceCell}</td>` +
        `<td><strong>${p.vp || 0}</strong></td>` +
        `<td>${p.colonyCount || 0}</td>` +
        `<td>${p.totalPops || 0}</td>` +
        `<td>${p.techs || 0}</td>` +
        `<td>${p.corvettes || 0}</td>` +
        `<td>${p.battlesWon || 0}</td>` +
        `<td>${p.raidersDestroyed || 0}</td>` +
        `<td class="${(inc.energy || 0) >= 0 ? 'inc-pos' : 'inc-neg'}">${fmtInc(inc.energy)}</td>` +
        `<td class="${(inc.minerals || 0) >= 0 ? 'inc-pos' : 'inc-neg'}">${fmtInc(inc.minerals)}</td>` +
        `<td class="${(inc.food || 0) >= 0 ? 'inc-pos' : 'inc-neg'}">${fmtInc(inc.food)}</td>` +
        `<td class="${(inc.alloys || 0) >= 0 ? 'inc-pos' : 'inc-neg'}">${fmtInc(inc.alloys)}</td></tr>`;
    });
    html += '</table>';
    scoreboardBody.innerHTML = html;
  }

  // ── Game Over — Post-Game Score Screen ──
  function _showGameOver(data) {
    if (!gameOverOverlay) return;
    if (_uiInterval) { clearInterval(_uiInterval); _uiInterval = null; }

    const winner = data.winner;
    const isMe = winner && winner.playerId === (gameState ? gameState.yourId : null);

    gameOverTitle.textContent = isMe ? 'Victory!' : 'Game Over';
    gameOverWinner.innerHTML = winner
      ? `<div class="game-over-winner-name">${winner.name} wins with ${winner.vp} VP</div>`
      : '<div class="game-over-winner-name">No winner</div>';

    // Match duration
    if (gameOverDuration && data.matchDurationSec != null) {
      const mins = Math.floor(data.matchDurationSec / 60);
      const secs = data.matchDurationSec % 60;
      gameOverDuration.textContent = `Match Duration: ${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
    } else if (gameOverDuration) {
      gameOverDuration.textContent = '';
    }

    // VP Breakdown table
    let scoresHtml = '<h3 class="go-section-title">Victory Points</h3>';
    scoresHtml += '<div class="go-table-wrap"><table class="scoreboard-table go-vp-table"><tr><th>#</th><th>Player</th><th>VP</th><th>Pops</th><th>Districts</th><th>Alloys</th><th>Research</th><th>Techs</th><th>Traits</th><th>Explored</th><th>Fleet</th><th>Battles</th><th>Diplomacy</th><th>Raiders</th></tr>';
    (data.scores || []).forEach((s, i) => {
      const cls = s.playerId === (gameState ? gameState.yourId : null) ? ' class="scoreboard-me"' : '';
      scoresHtml += `<tr${cls}><td>${i + 1}</td><td><span class="scoreboard-color" style="background:${s.color}"></span>${s.name}</td><td><strong>${s.vp}</strong></td>` +
        `<td>${s.breakdown.popsVP}</td>` +
        `<td>${s.breakdown.districtsVP}</td>` +
        `<td>${s.breakdown.alloysVP}</td>` +
        `<td>${s.breakdown.researchVP}</td>` +
        `<td>${s.breakdown.techVP || 0}</td>` +
        `<td>${s.breakdown.traitsVP || 0}</td>` +
        `<td>${s.breakdown.surveyedVP || 0}</td>` +
        `<td>${s.breakdown.militaryVP || 0}</td>` +
        `<td>${s.breakdown.battlesWonVP || 0}</td>` +
        `<td>${s.breakdown.diplomacyVP || 0}</td>` +
        `<td>${s.breakdown.raidersVP || 0}</td></tr>`;
    });
    scoresHtml += '</table></div>';
    gameOverScores.innerHTML = scoresHtml;

    // Per-player match stats
    if (gameOverStats) {
      let statsHtml = '<h3 class="go-section-title">Match Statistics</h3>';
      statsHtml += '<div class="go-table-wrap"><table class="scoreboard-table go-stats-table"><tr><th>Player</th><th>Colonies</th><th>Districts</th><th>Ships</th><th>Battles Won</th><th>Ships Lost</th><th>Raiders Killed</th><th>Energy</th><th>Minerals</th><th>Food</th><th>Alloys</th></tr>';
      (data.scores || []).forEach((s) => {
        const cls = s.playerId === (gameState ? gameState.yourId : null) ? ' class="scoreboard-me"' : '';
        const ms = s.matchStats || {};
        const rg = ms.resourcesGathered || {};
        statsHtml += `<tr${cls}><td><span class="scoreboard-color" style="background:${s.color}"></span>${s.name}</td>` +
          `<td>${ms.coloniesFounded || 0}</td>` +
          `<td>${ms.districtsBuilt || 0}</td>` +
          `<td>${ms.shipsBuilt || 0}</td>` +
          `<td>${s.breakdown.battlesWon || 0}</td>` +
          `<td>${s.breakdown.shipsLost || 0}</td>` +
          `<td>${s.breakdown.raidersDestroyed || 0}</td>` +
          `<td>${Math.floor(rg.energy || 0)}</td>` +
          `<td>${Math.floor(rg.minerals || 0)}</td>` +
          `<td>${Math.floor(rg.food || 0)}</td>` +
          `<td>${Math.floor(rg.alloys || 0)}</td></tr>`;
      });
      statsHtml += '</table></div>';
      gameOverStats.innerHTML = statsHtml;
    }

    gameOverOverlay.classList.remove('hidden');
  }

  // ── In-Game Chat ──
  const _MAX_GAME_CHAT = 30;
  let _gameChatCount = 0;

  function _getPlayerColor(name) {
    if (!gameState || !gameState.players) return '#e94560';
    const p = gameState.players.find(pl => pl.name === name);
    return p && p.color ? p.color : '#e94560';
  }

  function _addGameChatMessage(from, text) {
    if (!gameChatMessages) return;
    const div = document.createElement('div');
    div.className = 'msg';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'msg-name';
    nameSpan.style.color = _getPlayerColor(from);
    nameSpan.textContent = from + ':';
    div.appendChild(nameSpan);
    div.appendChild(document.createTextNode(' ' + text));
    gameChatMessages.appendChild(div);
    _gameChatCount++;
    // Trim old messages
    while (_gameChatCount > _MAX_GAME_CHAT && gameChatMessages.firstChild) {
      gameChatMessages.removeChild(gameChatMessages.firstChild);
      _gameChatCount--;
    }
    gameChatMessages.scrollTop = gameChatMessages.scrollHeight;
    // Auto-expand briefly if collapsed
    if (gameChatPanel && !gameChatPanel.classList.contains('expanded')) {
      gameChatPanel.classList.add('expanded');
      clearTimeout(_gameChatAutoHide);
      _gameChatAutoHide = setTimeout(() => {
        if (document.activeElement !== gameChatInput) {
          gameChatPanel.classList.remove('expanded');
        }
      }, 4000);
    }
  }
  let _gameChatAutoHide = null;

  // ── Match Warning Banner ──
  function _showMatchWarning(text) {
    if (!matchWarning) return;
    matchWarning.textContent = text;
    matchWarning.classList.remove('hidden');
    if (_warningTimeout) clearTimeout(_warningTimeout);
    _warningTimeout = setTimeout(() => matchWarning.classList.add('hidden'), 5000);
  }

  // ── Endgame Crisis Alert ──
  function _showEndgameCrisisAlert(msg) {
    // Show dramatic banner for 8 seconds
    if (!matchWarning) return;
    if (msg.crisisType === 'galacticStorm') {
      matchWarning.textContent = 'GALACTIC STORM — All production -25%!';
      matchWarning.style.borderColor = '#e74c3c';
    } else if (msg.crisisType === 'precursorAwakening') {
      matchWarning.textContent = 'PRECURSOR AWAKENING — Ancient warship approaches!';
      matchWarning.style.borderColor = '#9b59b6';
    }
    matchWarning.classList.remove('hidden');
    if (_warningTimeout) clearTimeout(_warningTimeout);
    _warningTimeout = setTimeout(() => {
      matchWarning.classList.add('hidden');
      matchWarning.style.borderColor = '';
    }, 8000);
  }

  // ── Catalyst Event UI ──

  function _showCatalystAlert(title, text, color) {
    if (!matchWarning) return;
    matchWarning.innerHTML = `<strong>${title}</strong> — ${text}`;
    matchWarning.style.borderColor = color || '#f39c12';
    matchWarning.classList.remove('hidden');
    if (_warningTimeout) clearTimeout(_warningTimeout);
    _warningTimeout = setTimeout(() => {
      matchWarning.classList.add('hidden');
      matchWarning.style.borderColor = '';
    }, 10000);
  }

  // Tech Auction bid UI
  let _auctionOverlay = null;
  function _showAuctionUI(msg) {
    if (_auctionOverlay) _auctionOverlay.remove();
    _auctionOverlay = document.createElement('div');
    _auctionOverlay.className = 'catalyst-overlay';
    _auctionOverlay.innerHTML = `
      <div class="catalyst-dialog">
        <h3 style="color:#9b59b6">Tech Breakthrough Auction</h3>
        <p>Bid influence to instantly complete your current research.<br>Highest bidder wins. <strong>All bidders lose their bid.</strong></p>
        <div style="margin:8px 0">
          <label>Bid amount: <input type="number" id="auction-bid-input" min="1" value="10" style="width:60px;background:#1a1a2e;color:#e0e0e0;border:1px solid #555;padding:2px 4px"></label>
          <button id="auction-bid-btn" style="margin-left:8px;padding:4px 12px;background:#9b59b6;border:none;color:#fff;cursor:pointer;border-radius:3px">Place Bid</button>
        </div>
        <p id="auction-status" style="color:#888;font-size:0.9em"></p>
      </div>
    `;
    document.body.appendChild(_auctionOverlay);
    const bidBtn = document.getElementById('auction-bid-btn');
    const bidInput = document.getElementById('auction-bid-input');
    const statusEl = document.getElementById('auction-status');
    if (bidBtn) {
      bidBtn.addEventListener('click', () => {
        const amount = parseInt(bidInput.value, 10);
        if (!Number.isFinite(amount) || amount < 1) return;
        send({ type: 'auctionBid', amount });
        statusEl.textContent = 'Bid placed: ' + amount + ' influence';
        bidBtn.disabled = true;
      });
    }
  }
  function _hideAuctionUI() {
    if (_auctionOverlay) { _auctionOverlay.remove(); _auctionOverlay = null; }
  }

  // Border Incident choice UI
  let _incidentOverlay = null;
  function _showIncidentUI(msg) {
    if (_incidentOverlay) _incidentOverlay.remove();
    _incidentOverlay = document.createElement('div');
    _incidentOverlay.className = 'catalyst-overlay';
    const otherName = msg.playerNames
      ? (msg.players[0] === gameState.yourId ? msg.playerNames[1] : msg.playerNames[0])
      : 'another player';
    _incidentOverlay.innerHTML = `
      <div class="catalyst-dialog">
        <h3 style="color:#e74c3c">Border Incident</h3>
        <p>Tensions are rising between you and <strong>${otherName}</strong>.</p>
        <p style="font-size:0.9em;color:#aaa">Both de-escalate: +5 VP each. One escalates: +3 VP, other goes hostile. Both escalate: both hostile, no VP.</p>
        <div style="margin:10px 0">
          <button id="incident-deescalate" style="padding:6px 16px;background:#2ecc71;border:none;color:#fff;cursor:pointer;border-radius:3px;margin-right:10px">De-escalate</button>
          <button id="incident-escalate" style="padding:6px 16px;background:#e74c3c;border:none;color:#fff;cursor:pointer;border-radius:3px">Escalate</button>
        </div>
        <p id="incident-status" style="color:#888;font-size:0.9em"></p>
      </div>
    `;
    document.body.appendChild(_incidentOverlay);
    const deescBtn = document.getElementById('incident-deescalate');
    const escBtn = document.getElementById('incident-escalate');
    const statusEl = document.getElementById('incident-status');
    function submitChoice(choice) {
      send({ type: 'respondIncident', choice });
      statusEl.textContent = 'Choice submitted: ' + choice;
      deescBtn.disabled = true;
      escBtn.disabled = true;
    }
    if (deescBtn) deescBtn.addEventListener('click', () => submitChoice('deescalate'));
    if (escBtn) escBtn.addEventListener('click', () => submitChoice('escalate'));
  }
  function _hideIncidentUI() {
    if (_incidentOverlay) { _incidentOverlay.remove(); _incidentOverlay = null; }
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
  if (edictPanelClose) edictPanelClose.addEventListener('click', () => {
    edictPanel.classList.add('hidden');
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
    if (e.key === 'e' || e.key === 'E') {
      _toggleEdictPanel();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      _toggleScoreboard();
    }
    if (e.key === 'Escape') {
      if (researchPanel && !researchPanel.classList.contains('hidden')) {
        researchPanel.classList.add('hidden');
      }
      if (edictPanel && !edictPanel.classList.contains('hidden')) {
        edictPanel.classList.add('hidden');
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
    // Enter key focuses game chat input
    if (e.key === 'Enter' && gameChatInput) {
      gameChatInput.focus();
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

  singlePlayerBtn.addEventListener('click', () => {
    send({ type: 'createRoom', name: `${myName}'s Game`, practiceMode: true });
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

  // Rematch: leave current room and create a new one with same settings
  if (gameOverRematchBtn) gameOverRematchBtn.addEventListener('click', () => {
    gameOverOverlay.classList.add('hidden');
    gameState = null;
    send({ type: 'rematch' });
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
      send({ type: 'chat', text: chatInput.value.trim() });
      chatInput.value = '';
    }
  });

  // In-game chat input
  if (gameChatInput) {
    gameChatInput.addEventListener('keydown', (e) => {
      e.stopPropagation(); // Prevent game shortcuts while typing
      if (e.key === 'Enter') {
        if (gameChatInput.value.trim()) {
          send({ type: 'chat', text: gameChatInput.value.trim() });
          gameChatInput.value = '';
        }
        gameChatInput.blur();
      }
      if (e.key === 'Escape') {
        gameChatInput.blur();
      }
    });
    gameChatInput.addEventListener('focus', () => {
      if (gameChatPanel) gameChatPanel.classList.add('expanded');
      clearTimeout(_gameChatAutoHide);
    });
    gameChatInput.addEventListener('blur', () => {
      // Collapse after a short delay (allow clicking messages)
      _gameChatAutoHide = setTimeout(() => {
        if (document.activeElement !== gameChatInput && gameChatPanel) {
          gameChatPanel.classList.remove('expanded');
        }
      }, 300);
    });
  }

  // Doctrine selection overlay
  const DOCTRINE_INFO = {
    industrialist: {
      name: 'Industrialist',
      bonuses: ['+25% Mining output', '+25% Industrial output', '+1 starting Mining district'],
      penalties: ['-10% Research output'],
    },
    scholar: {
      name: 'Scholar',
      bonuses: ['+25% Research output', 'T1 research 33% complete'],
      penalties: ['-10% Mineral output'],
    },
    expansionist: {
      name: 'Expansionist',
      bonuses: ['Colony ships -25% cost & time', '+2 starting pops'],
      penalties: ['-10% Alloy output'],
    },
  };

  function _showDoctrineSelection() {
    if (!doctrineOverlay || !doctrineOptions) return;
    doctrineOptions.innerHTML = '';
    for (const [type, info] of Object.entries(DOCTRINE_INFO)) {
      const card = document.createElement('div');
      card.className = 'doctrine-card';
      card.innerHTML = `<h3>${info.name}</h3>` +
        info.bonuses.map(b => `<div class="doctrine-bonus">+ ${b}</div>`).join('') +
        info.penalties.map(p => `<div class="doctrine-penalty">${p}</div>`).join('');
      card.onclick = function() {
        send({ type: 'selectDoctrine', doctrineType: type });
        doctrineChosen = true;
        doctrineOverlay.classList.add('hidden');
      };
      doctrineOptions.appendChild(card);
    }
    doctrineOverlay.classList.remove('hidden');
  }

  function _updateDoctrineTimer() {
    if (!doctrineOverlay || doctrineChosen) return;
    if (!gameState) return;
    const me = _getMyPlayer();
    // Hide if player has chosen or phase is over
    if ((me && me.doctrine) || !gameState.doctrinePhase) {
      doctrineOverlay.classList.add('hidden');
      return;
    }
    if (gameState.doctrineDeadlineTick && doctrineTimer) {
      const ticksLeft = Math.max(0, gameState.doctrineDeadlineTick - gameState.tick);
      const secsLeft = Math.ceil(ticksLeft / 10);
      doctrineTimer.textContent = `Auto-assign in ${secsLeft}s`;
    }
  }

  // Diplomacy command helpers
  if (typeof window !== 'undefined') {
    window._setDiplomacy = function(targetPlayerId, stance) {
      send({ type: 'setDiplomacy', targetPlayerId, stance });
    };
    window._acceptDiplomacy = function(targetPlayerId) {
      send({ type: 'acceptDiplomacy', targetPlayerId });
    };
    window._giftResources = function(targetPlayerId) {
      const resource = prompt('Resource to gift (energy, minerals, food, alloys):');
      if (!resource) return;
      const amountStr = prompt('Amount (minimum 25):');
      if (!amountStr) return;
      const amount = parseInt(amountStr, 10);
      if (!amount || amount < 25) { alert('Minimum gift is 25'); return; }
      send({ type: 'giftResources', targetPlayerId, resource: resource.trim().toLowerCase(), amount });
    };
  }

  // Expose send and gameState for future modules (renderer, UI)
  if (typeof window !== 'undefined') {
    window.GameClient = { send, getState: () => gameState };
  }

})();
