/**
 * Three.js galaxy map view — renders star systems, hyperlanes, and player territories.
 * PerspectiveCamera with OrbitControls-style mouse controls.
 * Receives galaxy data from gameInit and renders it as a 3D scene.
 */
(function () {
  /* global THREE */

  let scene, camera, renderer, container;
  let galaxyData = null;       // { systems, hyperlanes, seed, size }
  let starMeshes = [];         // one mesh per system, indexed by system.id
  let starMeshArray = [];      // pre-filtered array (no nulls) for raycasting
  let hyperlaneLines = null;   // single LineSegments object
  let hyperlaneKnownLines = null;  // solid hyperlanes between known systems
  let hyperlaneFadedLines = null;  // faded hyperlanes at fog border
  let ownerRings = [];         // ownership indicator meshes
  let ownerRingPool = [];      // reusable ring mesh pool
  let selectedSystemId = -1;
  let highlightMesh = null;
  let hoverLabelEl = null;     // DOM element for system name on hover
  let onSystemSelect = null;   // callback: (system) => void
  let colonyShipMeshes = [];   // active colony ship marker meshes
  let colonyShipPool = [];     // reusable colony ship mesh pool
  let scienceShipMeshes = [];  // active science ship marker meshes
  let scienceShipPool = [];    // reusable science ship mesh pool
  let _lastColonyShipData = null;   // cached ship arrays for per-frame animation
  let _lastScienceShipData = null;
  let _lastShipUpdateTime = 0;     // timestamp of last state update (for extrapolation)

  // Fog of war state
  let _adjacency = null;       // adjacency list built from hyperlanes
  let _knownSystemIds = new Set(); // systems visible to the local player
  let _lastOwnedKey = '';      // fingerprint of owned system IDs — skip fog rebuild when unchanged

  // Camera state — fixed angle, pan + zoom only
  let orbitRadius = 400;
  let orbitTarget = { x: 0, y: 0, z: 0 };
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let panStartTarget = { x: 0, y: 0, z: 0 };

  // Raycaster for hover/click
  const _raycaster = typeof THREE !== 'undefined' ? new THREE.Raycaster() : null;
  const _mouse = typeof THREE !== 'undefined' ? new THREE.Vector2() : null;
  let _playerColorMap = null; // playerId -> color string, rebuilt per ownership update

  // Hover throttle — limit raycasting to ~30Hz (every 33ms) instead of every mousemove
  let _lastHoverTime = 0;
  const _HOVER_INTERVAL = 33; // ms

  // Shared materials/geometries
  const _matCache = {};
  const _geoCache = {};

  // Star size by type
  const STAR_RADIUS = {
    yellow: 2.0,
    red: 1.5,
    blue: 3.0,
    white: 1.8,
    orange: 2.2,
  };

  // ── Initialization ──

  function init(containerEl) {
    container = containerEl || document.getElementById('render-container');
    if (!container || typeof THREE === 'undefined') return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);

    // PerspectiveCamera for galaxy view
    camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      1,
      5000
    );

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Lighting
    const ambient = new THREE.AmbientLight(0x333355, 0.4);
    scene.add(ambient);
    const point = new THREE.PointLight(0xffffff, 0.3, 2000);
    point.position.set(0, 200, 0);
    scene.add(point);

    // Build pools
    _initPools();

    // Hover label (DOM overlay)
    hoverLabelEl = document.createElement('div');
    hoverLabelEl.id = 'galaxy-hover-label';
    hoverLabelEl.style.cssText =
      'position:absolute;pointer-events:none;color:#fff;font:bold 13px monospace;' +
      'background:rgba(10,10,30,0.8);padding:2px 8px;border-radius:4px;display:none;z-index:10;';
    container.appendChild(hoverLabelEl);

    // Events
    renderer.domElement.addEventListener('mousedown', _onMouseDown);
    renderer.domElement.addEventListener('wheel', _onWheel, { passive: false });
    renderer.domElement.addEventListener('click', _onClick);
    renderer.domElement.addEventListener('mousemove', _onMouseMoveHover);
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', _onMouseMoveDrag);
    window.addEventListener('mouseup', _onMouseUp);
    window.addEventListener('resize', _onResize);

    _updateCamera();
  }

  function _initPools() {
    // Star sphere geometry (shared, scaled per-star via mesh.scale)
    _geoCache.star = new THREE.SphereGeometry(1, 12, 8);

    // Owner ring geometry
    _geoCache.ring = new THREE.RingGeometry(3.5, 4.2, 24);

    // Selection highlight
    _geoCache.highlight = new THREE.RingGeometry(4.5, 5.5, 24);
    _matCache.highlight = new THREE.MeshBasicMaterial({
      color: 0x00ffaa, side: THREE.DoubleSide, transparent: true, opacity: 0.8,
    });

    // Hyperlane materials
    _matCache.hyperlane = new THREE.LineBasicMaterial({
      color: 0x4466aa, transparent: true, opacity: 0.25,
    });
    _matCache.hyperlaneKnown = new THREE.LineBasicMaterial({
      color: 0x4466aa, transparent: true, opacity: 0.4,
    });
    _matCache.hyperlaneFaded = new THREE.LineBasicMaterial({
      color: 0x334466, transparent: true, opacity: 0.12,
    });

    // Unknown star material (dim gray)
    _matCache.starUnknown = new THREE.MeshBasicMaterial({
      color: 0x555566, transparent: true, opacity: 0.2,
    });

    // Colony ship: diamond shape (octahedron)
    _geoCache.colonyShip = new THREE.OctahedronGeometry(2.5, 0);
    _matCache.colonyShip = new THREE.MeshBasicMaterial({
      color: 0x00ffaa, transparent: true, opacity: 0.9,
    });

    // Science ship: smaller diamond, cyan
    _geoCache.scienceShip = new THREE.OctahedronGeometry(2.0, 0);
    _matCache.scienceShip = new THREE.MeshBasicMaterial({
      color: 0x00e5ff, transparent: true, opacity: 0.9,
    });
  }

  // ── Build galaxy scene ──

  function buildGalaxy(data) {
    if (!scene) return;
    galaxyData = data;

    // Clear old objects
    _clearGalaxy();

    const systems = data.systems;
    const hyperlanes = data.hyperlanes;

    // Build adjacency list for fog of war
    const FoW = (typeof window !== 'undefined' && window.FogOfWar) || {};
    if (FoW.buildAdjacency) {
      _adjacency = FoW.buildAdjacency(hyperlanes, systems.length);
    }

    // Create star meshes (initially all use their real material — fog applied in _applyFog)
    starMeshes = new Array(systems.length).fill(null);
    for (const sys of systems) {
      const color = new THREE.Color(sys.starColor || '#ffffff');
      const matKey = 'star_' + sys.starType;
      if (!_matCache[matKey]) {
        _matCache[matKey] = new THREE.MeshBasicMaterial({ color: color });
      }

      const radius = STAR_RADIUS[sys.starType] || 2.0;
      const mesh = new THREE.Mesh(_geoCache.star, _matCache[matKey]);
      mesh.position.set(sys.x, sys.y || 0, sys.z);
      mesh.scale.setScalar(radius);
      mesh.userData.systemId = sys.id;
      mesh.userData.knownMaterial = _matCache[matKey]; // store original material
      scene.add(mesh);
      starMeshes[sys.id] = mesh;
    }

    // Pre-filter star meshes for raycasting (avoids allocation on every mouse event)
    starMeshArray = starMeshes.filter(m => m !== null);

    // Ownership rings
    _updateOwnership(systems);

    // Position camera to see entire galaxy
    _fitCameraToGalaxy(systems);
  }

  function _clearGalaxy() {
    for (const mesh of starMeshes) {
      if (mesh) scene.remove(mesh);
    }
    starMeshes = [];
    starMeshArray = [];
    _removeHyperlanes();
    for (const ring of ownerRings) scene.remove(ring);
    ownerRings = [];
    ownerRingPool = [];
    for (const mesh of colonyShipMeshes) scene.remove(mesh);
    colonyShipMeshes = [];
    for (const mesh of colonyShipPool) scene.remove(mesh);
    colonyShipPool = [];
    for (const mesh of scienceShipMeshes) scene.remove(mesh);
    scienceShipMeshes = [];
    for (const mesh of scienceShipPool) scene.remove(mesh);
    scienceShipPool = [];
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }
    selectedSystemId = -1;
    _adjacency = null;
    _knownSystemIds = new Set();
    _lastOwnedKey = '';
  }

  function _removeHyperlanes() {
    if (hyperlaneLines) {
      if (hyperlaneLines.geometry) hyperlaneLines.geometry.dispose();
      scene.remove(hyperlaneLines);
      hyperlaneLines = null;
    }
    if (hyperlaneKnownLines) {
      if (hyperlaneKnownLines.geometry) hyperlaneKnownLines.geometry.dispose();
      scene.remove(hyperlaneKnownLines);
      hyperlaneKnownLines = null;
    }
    if (hyperlaneFadedLines) {
      if (hyperlaneFadedLines.geometry) hyperlaneFadedLines.geometry.dispose();
      scene.remove(hyperlaneFadedLines);
      hyperlaneFadedLines = null;
    }
  }

  function _updateOwnership(systems) {
    // Hide all active rings (return to pool)
    for (const ring of ownerRings) {
      ring.visible = false;
    }
    let ringIdx = 0;

    if (!systems) return;
    for (const sys of systems) {
      if (!sys.owner) continue;
      const playerColor = _getPlayerColor(sys.owner);
      if (!playerColor) continue;

      const matKey = 'owner_' + playerColor;
      if (!_matCache[matKey]) {
        _matCache[matKey] = new THREE.MeshBasicMaterial({
          color: new THREE.Color(playerColor),
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.5,
        });
      }

      // Reuse pooled ring or create new one
      let ring;
      if (ringIdx < ownerRings.length) {
        ring = ownerRings[ringIdx];
      } else {
        ring = new THREE.Mesh(_geoCache.ring, _matCache[matKey]);
        ring.rotation.x = -Math.PI / 2;
        scene.add(ring);
        ownerRings.push(ring);
      }
      ring.material = _matCache[matKey];
      ring.position.set(sys.x, (sys.y || 0) - 0.3, sys.z);
      ring.visible = true;
      ringIdx++;
    }
  }

  function _getPlayerColor(playerId) {
    if (_playerColorMap && _playerColorMap.has(playerId)) {
      return _playerColorMap.get(playerId);
    }
    return '#888888';
  }

  function _rebuildPlayerColorMap() {
    _playerColorMap = new Map();
    if (typeof window !== 'undefined' && window.GameClient) {
      const state = window.GameClient.getState();
      if (state && state.players) {
        for (const p of state.players) {
          _playerColorMap.set(p.id, p.color);
        }
      }
    }
  }

  function _fitCameraToGalaxy(systems) {
    if (!systems || systems.length === 0) return;

    // Find bounding box
    let maxR = 0;
    for (const sys of systems) {
      const r = Math.sqrt(sys.x * sys.x + sys.z * sys.z);
      if (r > maxR) maxR = r;
    }

    orbitTarget = { x: 0, y: 0, z: 0 };
    orbitRadius = Math.max(maxR * 1.5, 200);
    _updateCamera();
  }

  // ── Camera ──
  // Fixed slightly-angled top-down view — no rotation, just pan + zoom
  const _CAM_PHI = Math.PI / 5; // ~36° from vertical — gives depth without losing overview

  function _updateCamera() {
    if (!camera) return;
    const x = orbitTarget.x;
    const y = orbitTarget.y + orbitRadius * Math.cos(_CAM_PHI);
    const z = orbitTarget.z + orbitRadius * Math.sin(_CAM_PHI);
    camera.position.set(x, y, z);
    camera.lookAt(orbitTarget.x, orbitTarget.y, orbitTarget.z);
  }

  // ── Event handlers ──

  function _onMouseDown(e) {
    // All mouse buttons pan
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartTarget = { ...orbitTarget };
    if (e.button === 1 || e.button === 2) e.preventDefault();
  }

  function _onMouseMoveDrag(e) {
    if (isDragging) {
      const factor = orbitRadius * 0.002;
      const dx = (e.clientX - dragStartX) * factor;
      const dy = (e.clientY - dragStartY) * factor;
      // Pan along XZ plane (camera looks down at fixed angle)
      orbitTarget.x = panStartTarget.x - dx;
      orbitTarget.z = panStartTarget.z - dy;
      _updateCamera();
    }
  }

  function _onMouseUp() {
    isDragging = false;
  }

  function _onWheel(e) {
    e.preventDefault();
    // Support trackpad pinch (ctrlKey) and regular scroll
    const delta = e.deltaY > 0 ? 1.08 : 1 / 1.08;
    orbitRadius = Math.max(50, Math.min(2000, orbitRadius * delta));
    _updateCamera();
  }

  function _onResize() {
    if (!container || !renderer || !camera) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  function _onClick(e) {
    if (e.button !== 0 || !_raycaster || !galaxyData) return;
    // Don't register click if user was dragging orbit
    if (Math.abs(e.clientX - dragStartX) > 5 || Math.abs(e.clientY - dragStartY) > 5) return;

    const rect = renderer.domElement.getBoundingClientRect();
    _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    _raycaster.setFromCamera(_mouse, camera);
    // Use threshold for easier star picking
    _raycaster.params.Points = { threshold: 5 };
    const intersects = _raycaster.intersectObjects(starMeshArray, false);

    if (intersects.length > 0) {
      const sysId = intersects[0].object.userData.systemId;
      _selectSystem(sysId);
    } else {
      _deselectSystem();
    }
  }

  function _onMouseMoveHover(e) {
    if (!_raycaster || !galaxyData || !hoverLabelEl || isDragging) {
      if (hoverLabelEl) hoverLabelEl.style.display = 'none';
      return;
    }

    // Throttle raycasting to ~30Hz — avoid expensive intersect on every mousemove
    const now = performance.now();
    if (now - _lastHoverTime < _HOVER_INTERVAL) return;
    _lastHoverTime = now;

    const rect = renderer.domElement.getBoundingClientRect();
    _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    _raycaster.setFromCamera(_mouse, camera);
    const intersects = _raycaster.intersectObjects(starMeshArray, false);

    if (intersects.length > 0) {
      const sysId = intersects[0].object.userData.systemId;
      const sys = galaxyData.systems[sysId];
      if (sys) {
        // Only show name for known systems
        if (_knownSystemIds.size === 0 || _knownSystemIds.has(sysId)) {
          hoverLabelEl.textContent = sys.name;
          hoverLabelEl.style.display = 'block';
          hoverLabelEl.style.left = (e.clientX - rect.left + 12) + 'px';
          hoverLabelEl.style.top = (e.clientY - rect.top - 8) + 'px';
        } else {
          hoverLabelEl.textContent = 'Unknown System';
          hoverLabelEl.style.display = 'block';
          hoverLabelEl.style.left = (e.clientX - rect.left + 12) + 'px';
          hoverLabelEl.style.top = (e.clientY - rect.top - 8) + 'px';
        }
        renderer.domElement.style.cursor = 'pointer';
      }
    } else {
      hoverLabelEl.style.display = 'none';
      renderer.domElement.style.cursor = 'grab';
    }
  }

  // ── Selection ──

  function _selectSystem(systemId) {
    selectedSystemId = systemId;

    // Remove old highlight
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }

    const sys = galaxyData.systems[systemId];
    if (!sys) return;

    highlightMesh = new THREE.Mesh(_geoCache.highlight, _matCache.highlight);
    highlightMesh.position.set(sys.x, (sys.y || 0) - 0.2, sys.z);
    highlightMesh.rotation.x = -Math.PI / 2;
    scene.add(highlightMesh);

    if (onSystemSelect) onSystemSelect(sys);
  }

  function _deselectSystem() {
    selectedSystemId = -1;
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }
    if (onSystemSelect) onSystemSelect(null);
  }

  // ── Colony ship rendering ──

  // Get current game speed from client state (for tick extrapolation)
  function _getGameSpeed() {
    if (typeof window !== 'undefined' && window.GameClient) {
      const gs = window.GameClient.getState();
      if (gs && gs.gameSpeed) return gs.gameSpeed;
    }
    return 2; // default
  }

  // Extrapolate ship position along its path using elapsed time since last server update.
  // hopTicks = ticks per hop (30 for science, 50 for colony). yOffset = height above system plane.
  function _extrapolateShipPos(ship, hopTicks, yOffset, now) {
    if (!ship.path || ship.path.length === 0) return null;

    const gs = (typeof window !== 'undefined' && window.GameClient) ? window.GameClient.getState() : null;
    const gameSpeed = (gs && gs.gameSpeed) || 2;
    const paused = gs && gs.paused;

    const msPerTick = 100 / gameSpeed;
    const elapsedTicks = paused ? 0 : (now - _lastShipUpdateTime) / msPerTick;
    // Extrapolated progress along current hop (clamped so we don't overshoot)
    const progress = Math.min(ship.hopProgress + elapsedTicks, hopTicks);
    const t = progress / hopTicks;

    const fromSys = galaxyData.systems[ship.systemId];
    const toSys = galaxyData.systems[ship.path[0]];
    if (!fromSys || !toSys) return null;

    return {
      x: fromSys.x + (toSys.x - fromSys.x) * t,
      y: (fromSys.y || 0) + ((toSys.y || 0) - (fromSys.y || 0)) * t + yOffset,
      z: fromSys.z + (toSys.z - fromSys.z) * t,
    };
  }

  function updateColonyShips(ships) {
    if (!scene || !galaxyData) return;
    _lastColonyShipData = ships;
    _lastShipUpdateTime = performance.now();

    // Return active meshes to pool (hide, don't destroy)
    for (const mesh of colonyShipMeshes) {
      mesh.visible = false;
      colonyShipPool.push(mesh);
    }
    colonyShipMeshes = [];

    if (!ships || ships.length === 0) return;

    for (const ship of ships) {
      const playerColor = _getPlayerColor(ship.ownerId);
      const matKey = 'colonyShip_' + playerColor;
      if (!_matCache[matKey]) {
        _matCache[matKey] = new THREE.MeshBasicMaterial({
          color: new THREE.Color(playerColor), transparent: true, opacity: 0.9,
        });
      }

      let mesh;
      if (colonyShipPool.length > 0) {
        mesh = colonyShipPool.pop();
        mesh.material = _matCache[matKey];
        mesh.visible = true;
      } else {
        mesh = new THREE.Mesh(_geoCache.colonyShip, _matCache[matKey]);
        scene.add(mesh);
      }

      const currentSys = galaxyData.systems[ship.systemId];
      if (!currentSys) { mesh.visible = false; colonyShipPool.push(mesh); continue; }

      mesh.userData.shipData = ship;
      colonyShipMeshes.push(mesh);
    }
  }

  function updateScienceShips(ships) {
    if (!scene || !galaxyData) return;
    _lastScienceShipData = ships;
    _lastShipUpdateTime = performance.now();

    // Return active meshes to pool
    for (const mesh of scienceShipMeshes) {
      mesh.visible = false;
      scienceShipPool.push(mesh);
    }
    scienceShipMeshes = [];

    if (!ships || ships.length === 0) return;

    for (const ship of ships) {
      const playerColor = _getPlayerColor(ship.ownerId);
      const matKey = 'scienceShip_' + playerColor;
      if (!_matCache[matKey]) {
        _matCache[matKey] = new THREE.MeshBasicMaterial({
          color: new THREE.Color(playerColor), transparent: true, opacity: 0.9,
        });
      }

      let mesh;
      if (scienceShipPool.length > 0) {
        mesh = scienceShipPool.pop();
        mesh.material = _matCache[matKey];
        mesh.visible = true;
      } else {
        mesh = new THREE.Mesh(_geoCache.scienceShip, _matCache[matKey]);
        scene.add(mesh);
      }

      const currentSys = galaxyData.systems[ship.systemId];
      if (!currentSys) { mesh.visible = false; scienceShipPool.push(mesh); continue; }

      mesh.userData.shipData = ship;
      scienceShipMeshes.push(mesh);
    }
  }

  // ── Update from game state ──

  function updateOwnership(colonies, players) {
    if (!galaxyData) return;
    _rebuildPlayerColorMap();
    // Update system ownership from colonies
    for (const sys of galaxyData.systems) {
      sys.owner = null; // reset
    }
    if (colonies) {
      for (const col of colonies) {
        if (col.systemId != null && galaxyData.systems[col.systemId]) {
          galaxyData.systems[col.systemId].owner = col.ownerId;
        }
      }
    }
    _updateOwnership(galaxyData.systems);

    // Build fingerprint of owned + surveyed system IDs — skip expensive fog rebuild when unchanged
    const myId = (typeof window !== 'undefined' && window.GameClient)
      ? window.GameClient.getState() && window.GameClient.getState().yourId
      : null;
    let fogKey = '';
    if (colonies && myId) {
      for (const col of colonies) {
        if (col.ownerId === myId && col.systemId != null) fogKey += col.systemId + ',';
      }
    }
    // Include surveyed systems in cache key so fog updates after surveys complete
    const gs = (typeof window !== 'undefined' && window.GameClient) ? window.GameClient.getState() : null;
    if (gs && gs.surveyedSystems && gs.surveyedSystems[myId]) {
      fogKey += 's:' + gs.surveyedSystems[myId].length;
    }
    if (fogKey !== _lastOwnedKey) {
      _lastOwnedKey = fogKey;
      _recomputeFog(colonies);
      _applyFog();
    }
  }

  function _recomputeFog(colonies) {
    const FoW = (typeof window !== 'undefined' && window.FogOfWar) || {};
    if (!FoW.computeVisibility || !FoW.getOwnedSystemIds || !_adjacency) return;

    const myId = (typeof window !== 'undefined' && window.GameClient)
      ? window.GameClient.getState() && window.GameClient.getState().yourId
      : null;
    if (!myId) return;

    const ownedIds = FoW.getOwnedSystemIds(colonies, myId);
    _knownSystemIds = FoW.computeVisibility(ownedIds, _adjacency);

    // Add surveyed systems (persistent fog penetration from science ships)
    const gs = (typeof window !== 'undefined' && window.GameClient) ? window.GameClient.getState() : null;
    if (gs && gs.surveyedSystems && gs.surveyedSystems[myId]) {
      for (const sysId of gs.surveyedSystems[myId]) {
        _knownSystemIds.add(sysId);
      }
    }
  }

  function _applyFog() {
    if (!galaxyData) return;

    // Apply star visibility
    for (const sys of galaxyData.systems) {
      const mesh = starMeshes[sys.id];
      if (!mesh) continue;
      const known = _knownSystemIds.has(sys.id);
      if (known) {
        mesh.material = mesh.userData.knownMaterial;
        mesh.scale.setScalar(STAR_RADIUS[sys.starType] || 2.0);
      } else {
        // Unknown: dim gray, smaller
        mesh.material = _matCache.starUnknown;
        mesh.scale.setScalar((STAR_RADIUS[sys.starType] || 2.0) * 0.6);
      }
    }

    // Rebuild hyperlanes split by visibility
    _rebuildHyperlanes();
  }

  function _rebuildHyperlanes() {
    if (!galaxyData || !scene) return;
    _removeHyperlanes();

    const systems = galaxyData.systems;
    const hyperlanes = galaxyData.hyperlanes;
    if (!hyperlanes || hyperlanes.length === 0) return;

    // Partition hyperlanes into: known (both ends known), faded (one end known), hidden (neither)
    const knownPairs = [];
    const fadedPairs = [];
    for (const [a, b] of hyperlanes) {
      const aKnown = _knownSystemIds.has(a);
      const bKnown = _knownSystemIds.has(b);
      if (aKnown && bKnown) {
        knownPairs.push([a, b]);
      } else if (aKnown || bKnown) {
        fadedPairs.push([a, b]);
      }
      // neither known: hidden entirely
    }

    // Known hyperlanes (solid)
    if (knownPairs.length > 0) {
      const positions = new Float32Array(knownPairs.length * 6);
      for (let i = 0; i < knownPairs.length; i++) {
        const [a, b] = knownPairs[i];
        const sa = systems[a], sb = systems[b];
        positions[i * 6 + 0] = sa.x;
        positions[i * 6 + 1] = (sa.y || 0) - 0.5;
        positions[i * 6 + 2] = sa.z;
        positions[i * 6 + 3] = sb.x;
        positions[i * 6 + 4] = (sb.y || 0) - 0.5;
        positions[i * 6 + 5] = sb.z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      hyperlaneKnownLines = new THREE.LineSegments(geo, _matCache.hyperlaneKnown);
      scene.add(hyperlaneKnownLines);
    }

    // Faded hyperlanes (border of known space)
    if (fadedPairs.length > 0) {
      const positions = new Float32Array(fadedPairs.length * 6);
      for (let i = 0; i < fadedPairs.length; i++) {
        const [a, b] = fadedPairs[i];
        const sa = systems[a], sb = systems[b];
        positions[i * 6 + 0] = sa.x;
        positions[i * 6 + 1] = (sa.y || 0) - 0.5;
        positions[i * 6 + 2] = sa.z;
        positions[i * 6 + 3] = sb.x;
        positions[i * 6 + 4] = (sb.y || 0) - 0.5;
        positions[i * 6 + 5] = sb.z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      hyperlaneFadedLines = new THREE.LineSegments(geo, _matCache.hyperlaneFaded);
      scene.add(hyperlaneFadedLines);
    }
  }

  // ── Per-frame ship animation (extrapolation from server state) ──

  function _animateShips() {
    if (!galaxyData) return;
    const now = performance.now();

    // Colony ships — extrapolate position along path
    for (const mesh of colonyShipMeshes) {
      const ship = mesh.userData.shipData;
      if (!ship) continue;
      const pos = _extrapolateShipPos(ship, 50, 3, now); // COLONY_SHIP_HOP_TICKS = 50
      if (pos) {
        mesh.position.set(pos.x, pos.y, pos.z);
      } else {
        // Idle — hover near system
        const sys = galaxyData.systems[ship.systemId];
        if (sys) mesh.position.set(sys.x + 5, (sys.y || 0) + 5, sys.z + 5);
      }
      mesh.rotation.y = now * 0.002;
    }

    // Science ships — extrapolate for transit, orbit for surveying, bob for idle
    for (const mesh of scienceShipMeshes) {
      const ship = mesh.userData.shipData;
      if (!ship) continue;

      if (ship.path && ship.path.length > 0 && !ship.surveying) {
        // Transit — extrapolate along path
        const pos = _extrapolateShipPos(ship, 30, 4, now); // SCIENCE_SHIP_HOP_TICKS = 30
        if (pos) {
          mesh.position.set(pos.x, pos.y, pos.z);
        }
      } else if (ship.surveying) {
        // Smooth orbiting during survey
        const sys = galaxyData.systems[ship.systemId];
        if (sys) {
          const angle = now * 0.003;
          mesh.position.set(
            sys.x + Math.cos(angle) * 6,
            (sys.y || 0) + 4,
            sys.z + Math.sin(angle) * 6
          );
        }
      } else {
        // Idle — gentle bob near system
        const sys = galaxyData.systems[ship.systemId];
        if (sys) {
          mesh.position.set(sys.x - 5, (sys.y || 0) + 5 + Math.sin(now * 0.002) * 0.5, sys.z - 5);
        }
      }
      mesh.rotation.y = now * 0.003;
    }
  }

  // ── Render ──

  function render() {
    if (renderer && scene && camera) {
      _animateShips();
      renderer.render(scene, camera);
    }
  }

  // ── Cleanup ──

  function destroy() {
    if (renderer && renderer.domElement) {
      renderer.domElement.removeEventListener('mousedown', _onMouseDown);
      renderer.domElement.removeEventListener('wheel', _onWheel);
      renderer.domElement.removeEventListener('click', _onClick);
      renderer.domElement.removeEventListener('mousemove', _onMouseMoveHover);
      window.removeEventListener('mousemove', _onMouseMoveDrag);
      window.removeEventListener('mouseup', _onMouseUp);
      window.removeEventListener('resize', _onResize);

      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    }
    if (hoverLabelEl && hoverLabelEl.parentNode) {
      hoverLabelEl.parentNode.removeChild(hoverLabelEl);
      hoverLabelEl = null;
    }
    _clearGalaxy();
    scene = null;
    camera = null;
    renderer = null;
    container = null;
  }

  // ── Public API ──
  const GalaxyView = {
    init,
    buildGalaxy,
    updateOwnership,
    updateColonyShips,
    updateScienceShips,
    render,
    destroy,
    getSelectedSystem: () => selectedSystemId >= 0 && galaxyData ? galaxyData.systems[selectedSystemId] : null,
    setOnSystemSelect: (cb) => { onSystemSelect = cb; },
    getGalaxyData: () => galaxyData,
    isSystemKnown: (sysId) => _knownSystemIds.size === 0 || _knownSystemIds.has(sysId),
  };

  if (typeof window !== 'undefined') {
    window.GalaxyView = GalaxyView;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GalaxyView;
  }
})();
