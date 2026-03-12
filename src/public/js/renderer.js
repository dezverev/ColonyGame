/**
 * Three.js renderer — isometric colony view.
 * Manages Scene, OrthographicCamera, WebGLRenderer, lighting, terrain grid, and camera controls.
 */
(function () {
  /* global THREE */

  let scene, camera, renderer, container;
  let gridGroup = null; // holds terrain tile meshes
  let currentColony = null; // colony data currently being rendered

  // Raycaster for click detection
  const raycaster = typeof THREE !== 'undefined' ? new THREE.Raycaster() : null;
  const mouse = typeof THREE !== 'undefined' ? new THREE.Vector2() : null;
  let selectedTileIndex = -1; // currently selected tile (-1 = none)
  let highlightMesh = null;   // glowing outline on selected tile
  let onTileSelect = null;    // callback: (tileIndex, tileData) => void

  // Shared geometry/material pools — created once in init(), reused across rebuilds
  const _geoCache = {};   // key -> BufferGeometry
  const _matCache = {};   // key -> MeshStandardMaterial

  // FPS counter (enabled with ?debug=1)
  let _fpsEnabled = false;
  let _fpsEl = null;
  let _fpsFrames = 0;
  let _fpsLastTime = 0;

  // Isometric camera settings
  const ISO_ANGLE_PITCH = Math.atan(1 / Math.sqrt(2)); // ~35.264°
  const ISO_ANGLE_YAW = Math.PI / 4; // 45°
  const TILE_SIZE = 1;
  const TILE_GAP = 0.1;
  const TILE_STEP = TILE_SIZE + TILE_GAP;
  const GRID_COLS = 4;
  const TILE_HEIGHT = 0.15;
  const ZOOM_MIN = 2;
  const ZOOM_MAX = 20;
  let zoomLevel = 8; // ortho frustum half-size
  const PAN_SPEED = 0.15;

  // Camera pan target (world coords)
  let panX = 0;
  let panZ = 0;

  // Middle-mouse drag state
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPanX = 0;
  let dragStartPanZ = 0;

  // Keys currently held
  const keysDown = new Set();

  // ── Initialization ──

  function init() {
    container = document.getElementById('render-container');
    if (!container) return;

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);

    // Orthographic camera — frustum will be set by updateCameraFrustum
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    _positionCamera();

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Lighting
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(5, 10, 5);
    scene.add(directional);

    // Build shared geometry/material pools
    _initPools();

    // FPS counter
    _fpsEnabled = /[?&]debug=1/.test(location.search);
    if (_fpsEnabled) {
      _fpsEl = document.createElement('div');
      _fpsEl.style.cssText = 'position:fixed;top:4px;left:4px;color:#0f0;font:bold 14px monospace;z-index:9999;pointer-events:none';
      document.body.appendChild(_fpsEl);
      _fpsLastTime = performance.now();
    }

    // Events
    window.addEventListener('resize', _onResize);
    renderer.domElement.addEventListener('wheel', _onWheel, { passive: false });
    renderer.domElement.addEventListener('mousedown', _onMouseDown);
    renderer.domElement.addEventListener('click', _onClick);
    window.addEventListener('mousemove', _onMouseMove);
    window.addEventListener('mouseup', _onMouseUp);
    window.addEventListener('keydown', _onKeyDown);
    window.addEventListener('keyup', _onKeyUp);

    _updateCameraFrustum();

    // Start render loop
    _animate();
  }

  // ── Camera ──

  function _positionCamera() {
    // Place camera at isometric angle looking at pan target
    const dist = 50;
    const dx = dist * Math.sin(ISO_ANGLE_YAW) * Math.cos(ISO_ANGLE_PITCH);
    const dy = dist * Math.sin(ISO_ANGLE_PITCH);
    const dz = dist * Math.cos(ISO_ANGLE_YAW) * Math.cos(ISO_ANGLE_PITCH);
    camera.position.set(panX + dx, dy, panZ + dz);
    camera.lookAt(panX, 0, panZ);
  }

  function _updateCameraFrustum() {
    if (!container) return;
    const aspect = container.clientWidth / container.clientHeight;
    camera.left = -zoomLevel * aspect;
    camera.right = zoomLevel * aspect;
    camera.top = zoomLevel;
    camera.bottom = -zoomLevel;
    camera.updateProjectionMatrix();
  }

  // ── Shared geometry/material pools ──

  function _initPools() {
    // Empty tile
    _geoCache.empty = new THREE.BoxGeometry(TILE_SIZE * 0.9, TILE_HEIGHT, TILE_SIZE * 0.9);
    _matCache.empty = new THREE.MeshStandardMaterial({ color: 0x2a2a4e, opacity: 0.6, transparent: true });

    // District types — one geometry + solid material + wireframe material each
    for (const [type, color] of Object.entries(DISTRICT_COLORS)) {
      const height = DISTRICT_HEIGHTS[type] || 0.4;
      _geoCache[type] = new THREE.BoxGeometry(TILE_SIZE * 0.85, height, TILE_SIZE * 0.85);
      _matCache[type] = new THREE.MeshStandardMaterial({ color });
      _matCache[type + '_wire'] = new THREE.MeshStandardMaterial({ color, wireframe: true, opacity: 0.5, transparent: true });
    }

    // Highlight ring for selected tile
    _geoCache.highlight = new THREE.BoxGeometry(TILE_SIZE, 0.02, TILE_SIZE);
    _matCache.highlight = new THREE.MeshStandardMaterial({
      color: 0x00ffaa, emissive: 0x00ffaa, emissiveIntensity: 0.8,
      opacity: 0.7, transparent: true,
    });

    // Ground — geometry depends on colony size, so we create it on demand (cheap, one-time per layout)
    _matCache.ground = new THREE.MeshStandardMaterial({ color: 0x111122 });
  }

  // ── Colony Grid ──

  function buildColonyGrid(colony) {
    // Remove old grid — do NOT dispose shared pool geometry/materials
    if (gridGroup) {
      scene.remove(gridGroup);
      // Only dispose the ground geometry (created per-colony-size)
      const ground = gridGroup.children[0];
      if (ground && ground.geometry) ground.geometry.dispose();
    }

    gridGroup = new THREE.Group();
    currentColony = colony;

    const totalSlots = colony.planet.size;
    const rows = Math.ceil(totalSlots / GRID_COLS);

    // Center the grid
    const gridWidth = GRID_COLS * TILE_STEP - TILE_GAP;
    const gridDepth = rows * TILE_STEP - TILE_GAP;
    const offsetX = -gridWidth / 2 + TILE_SIZE / 2;
    const offsetZ = -gridDepth / 2 + TILE_SIZE / 2;

    // Ground plane underneath (geometry varies by colony size, material shared)
    const groundGeo = new THREE.BoxGeometry(gridWidth + 1, 0.05, gridDepth + 1);
    const ground = new THREE.Mesh(groundGeo, _matCache.ground);
    ground.position.set(0, -0.075, 0);
    gridGroup.add(ground);

    // Create tiles
    for (let i = 0; i < totalSlots; i++) {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const x = offsetX + col * TILE_STEP;
      const z = offsetZ + row * TILE_STEP;

      const district = colony.districts[i] || null;
      const queueItem = _findQueueItem(colony, i);

      let mesh;
      if (district) {
        mesh = _createDistrictMesh(district.type);
      } else if (queueItem) {
        mesh = _createConstructionMesh(queueItem);
      } else {
        mesh = _createEmptyTileMesh();
      }

      mesh.position.set(x, mesh.userData.yOffset || 0, z);
      mesh.userData.tileIndex = i;
      gridGroup.add(mesh);
    }

    scene.add(gridGroup);

    // Center camera on grid
    panX = 0;
    panZ = 0;
    _positionCamera();
  }

  function _findQueueItem(colony, tileIndex) {
    // Build queue items don't have tile indices yet — show them in order after built districts
    const builtCount = colony.districts.length;
    const queueIndex = tileIndex - builtCount;
    if (queueIndex >= 0 && queueIndex < colony.buildQueue.length) {
      return colony.buildQueue[queueIndex];
    }
    return null;
  }

  // District colors and geometry
  const DISTRICT_COLORS = {
    generator:   0xf1c40f, // yellow
    mining:      0x95a5a6, // gray
    agriculture: 0x2ecc71, // green
    industrial:  0x3498db, // blue
    research:    0x9b59b6, // purple
    housing:     0xecf0f1, // white
  };

  const DISTRICT_HEIGHTS = {
    generator:   0.6,
    mining:      0.3,
    agriculture: 0.4,
    industrial:  0.5,
    research:    0.7,
    housing:     0.45,
  };

  function _createDistrictMesh(type) {
    const height = DISTRICT_HEIGHTS[type] || 0.4;
    const mesh = new THREE.Mesh(_geoCache[type] || _geoCache.empty, _matCache[type] || _matCache.empty);
    mesh.userData.yOffset = height / 2;
    mesh.userData.districtType = type;
    return mesh;
  }

  function _createConstructionMesh(queueItem) {
    const type = queueItem.type;
    const height = DISTRICT_HEIGHTS[type] || 0.4;
    const mesh = new THREE.Mesh(_geoCache[type] || _geoCache.empty, _matCache[type + '_wire'] || _matCache.empty);
    mesh.userData.yOffset = height / 2;
    mesh.userData.construction = true;
    mesh.userData.districtType = type;
    return mesh;
  }

  function _createEmptyTileMesh() {
    const mesh = new THREE.Mesh(_geoCache.empty, _matCache.empty);
    mesh.userData.yOffset = TILE_HEIGHT / 2;
    mesh.userData.empty = true;
    return mesh;
  }

  // ── Update from game state ──

  function updateFromState(colony) {
    if (!colony) return;

    // Full rebuild if colony ID changed or grid doesn't exist
    if (!currentColony || !gridGroup || currentColony.id !== colony.id) {
      buildColonyGrid(colony);
      return;
    }

    // Incremental update — swap geometry/materials on existing tile meshes in-place
    // instead of tearing down and recreating all meshes
    const totalSlots = colony.planet.size;
    let changed = false;

    for (let i = 0; i < totalSlots; i++) {
      const district = colony.districts[i] || null;
      const queueItem = _findQueueItem(colony, i);

      // Determine what this tile should be
      let wantType, wantConstruction, wantEmpty;
      if (district) {
        wantType = district.type;
        wantConstruction = false;
        wantEmpty = false;
      } else if (queueItem) {
        wantType = queueItem.type;
        wantConstruction = true;
        wantEmpty = false;
      } else {
        wantType = null;
        wantConstruction = false;
        wantEmpty = true;
      }

      // Find existing mesh for this tile (children[0] is ground, tiles start at [1])
      const mesh = gridGroup.children[i + 1]; // +1 to skip ground
      if (!mesh) continue;

      // Check if tile state matches
      const curType = mesh.userData.districtType || null;
      const curConstruction = !!mesh.userData.construction;
      const curEmpty = !!mesh.userData.empty;

      if (curType === wantType && curConstruction === wantConstruction && curEmpty === wantEmpty) {
        continue; // no change
      }

      // Update mesh in-place: swap geometry, material, and userData
      changed = true;
      if (wantEmpty) {
        mesh.geometry = _geoCache.empty;
        mesh.material = _matCache.empty;
        mesh.position.y = TILE_HEIGHT / 2;
        mesh.userData.districtType = undefined;
        mesh.userData.construction = false;
        mesh.userData.empty = true;
      } else {
        const height = DISTRICT_HEIGHTS[wantType] || 0.4;
        mesh.geometry = _geoCache[wantType] || _geoCache.empty;
        mesh.material = wantConstruction
          ? (_matCache[wantType + '_wire'] || _matCache.empty)
          : (_matCache[wantType] || _matCache.empty);
        mesh.position.y = height / 2;
        mesh.userData.districtType = wantType;
        mesh.userData.construction = wantConstruction;
        mesh.userData.empty = false;
      }
    }

    currentColony = colony;
  }

  // ── Event handlers ──

  function _onResize() {
    if (!container || !renderer) return;
    renderer.setSize(container.clientWidth, container.clientHeight);
    _updateCameraFrustum();
  }

  function _onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomLevel + delta * 0.5));
    _updateCameraFrustum();
  }

  function _onMouseDown(e) {
    if (e.button === 1) { // middle mouse
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartPanX = panX;
      dragStartPanZ = panZ;
      e.preventDefault();
    }
  }

  function _onMouseMove(e) {
    if (!isDragging) return;
    const dx = (e.clientX - dragStartX) * zoomLevel * 0.005;
    const dy = (e.clientY - dragStartY) * zoomLevel * 0.005;
    panX = dragStartPanX - dx;
    panZ = dragStartPanZ - dy;
    _positionCamera();
  }

  function _onMouseUp(e) {
    if (e.button === 1) {
      isDragging = false;
    }
  }

  function _onKeyDown(e) {
    keysDown.add(e.key);
    if (e.key === 'Escape') _deselectTile();
  }

  function _onKeyUp(e) {
    keysDown.delete(e.key);
  }

  function _onClick(e) {
    if (e.button !== 0 || !gridGroup || !raycaster) return;
    // Skip if middle-mouse was dragging
    if (isDragging) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(gridGroup.children, false);

    for (const hit of intersects) {
      const idx = hit.object.userData.tileIndex;
      if (idx !== undefined) {
        _selectTile(idx);
        return;
      }
    }
    // Clicked empty space — deselect
    _deselectTile();
  }

  function _selectTile(tileIndex) {
    if (!gridGroup || !currentColony) return;
    selectedTileIndex = tileIndex;

    // Remove old highlight
    if (highlightMesh) {
      gridGroup.remove(highlightMesh);
      highlightMesh = null;
    }

    // Find the mesh for this tile (children[0] is ground)
    const tileMesh = gridGroup.children.find(c => c.userData.tileIndex === tileIndex);
    if (!tileMesh) return;

    // Add highlight ring at tile position
    highlightMesh = new THREE.Mesh(_geoCache.highlight, _matCache.highlight);
    highlightMesh.position.set(tileMesh.position.x, 0.01, tileMesh.position.z);
    gridGroup.add(highlightMesh);

    // Build tile data for callback
    const district = currentColony.districts[tileIndex] || null;
    const queueItem = _findQueueItem(currentColony, tileIndex);
    const tileData = {
      index: tileIndex,
      empty: !district && !queueItem,
      district: district,
      construction: queueItem,
      colonyId: currentColony.id,
    };

    if (onTileSelect) onTileSelect(tileData);
  }

  function _deselectTile() {
    selectedTileIndex = -1;
    if (highlightMesh && gridGroup) {
      gridGroup.remove(highlightMesh);
      highlightMesh = null;
    }
    if (onTileSelect) onTileSelect(null);
  }

  function _processKeys() {
    let moved = false;
    const speed = PAN_SPEED * (zoomLevel / 8);
    if (keysDown.has('w') || keysDown.has('W') || keysDown.has('ArrowUp')) {
      panZ -= speed; moved = true;
    }
    if (keysDown.has('s') || keysDown.has('S') || keysDown.has('ArrowDown')) {
      panZ += speed; moved = true;
    }
    if (keysDown.has('a') || keysDown.has('A') || keysDown.has('ArrowLeft')) {
      panX -= speed; moved = true;
    }
    if (keysDown.has('d') || keysDown.has('D') || keysDown.has('ArrowRight')) {
      panX += speed; moved = true;
    }
    if (moved) _positionCamera();
  }

  // ── Render loop ──

  function _animate() {
    requestAnimationFrame(_animate);
    _processKeys();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
    // FPS counter — update display every 500ms
    if (_fpsEnabled) {
      _fpsFrames++;
      const now = performance.now();
      if (now - _fpsLastTime >= 500) {
        const fps = (_fpsFrames / (now - _fpsLastTime)) * 1000;
        const calls = renderer ? renderer.info.render.calls : 0;
        _fpsEl.textContent = fps.toFixed(0) + ' FPS | ' + calls + ' draws';
        _fpsFrames = 0;
        _fpsLastTime = now;
      }
    }
  }

  // ── Public API ──
  const ColonyRenderer = {
    init,
    buildColonyGrid,
    updateFromState,
    deselectTile: _deselectTile,
    getSelectedTile: () => selectedTileIndex,
    getCurrentColony: () => currentColony,
    setOnTileSelect: (cb) => { onTileSelect = cb; },
  };

  if (typeof window !== 'undefined') {
    window.ColonyRenderer = ColonyRenderer;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ColonyRenderer;
  }
})();
