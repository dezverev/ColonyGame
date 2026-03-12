/**
 * Three.js renderer — isometric colony view.
 * Manages Scene, OrthographicCamera, WebGLRenderer, lighting, terrain grid, and camera controls.
 */
(function () {
  /* global THREE */

  let scene, camera, renderer, container;
  let gridGroup = null; // holds terrain tile meshes
  let currentColony = null; // colony data currently being rendered

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

    // Events
    window.addEventListener('resize', _onResize);
    renderer.domElement.addEventListener('wheel', _onWheel, { passive: false });
    renderer.domElement.addEventListener('mousedown', _onMouseDown);
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

  // ── Colony Grid ──

  function buildColonyGrid(colony) {
    // Remove old grid
    if (gridGroup) {
      scene.remove(gridGroup);
      gridGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
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

    // Ground plane underneath
    const groundGeo = new THREE.BoxGeometry(gridWidth + 1, 0.05, gridDepth + 1);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x111122 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
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
    const color = DISTRICT_COLORS[type] || 0xffffff;
    const height = DISTRICT_HEIGHTS[type] || 0.4;
    const geo = new THREE.BoxGeometry(TILE_SIZE * 0.85, height, TILE_SIZE * 0.85);
    const mat = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.yOffset = height / 2;
    mesh.userData.districtType = type;
    return mesh;
  }

  function _createConstructionMesh(queueItem) {
    const color = DISTRICT_COLORS[queueItem.type] || 0xffffff;
    const height = DISTRICT_HEIGHTS[queueItem.type] || 0.4;
    const geo = new THREE.BoxGeometry(TILE_SIZE * 0.85, height, TILE_SIZE * 0.85);
    const mat = new THREE.MeshStandardMaterial({
      color,
      wireframe: true,
      opacity: 0.5,
      transparent: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.yOffset = height / 2;
    mesh.userData.construction = true;
    mesh.userData.districtType = queueItem.type;
    return mesh;
  }

  function _createEmptyTileMesh() {
    const geo = new THREE.BoxGeometry(TILE_SIZE * 0.9, TILE_HEIGHT, TILE_SIZE * 0.9);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a2a4e,
      opacity: 0.6,
      transparent: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.yOffset = TILE_HEIGHT / 2;
    mesh.userData.empty = true;
    return mesh;
  }

  // ── Update from game state ──

  function updateFromState(colony) {
    if (!colony) return;
    // Rebuild grid if colony changed
    if (!currentColony || currentColony.id !== colony.id ||
        currentColony.districts.length !== colony.districts.length ||
        currentColony.buildQueue.length !== colony.buildQueue.length) {
      buildColonyGrid(colony);
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
  }

  function _onKeyUp(e) {
    keysDown.delete(e.key);
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
  }

  // ── Public API ──
  const ColonyRenderer = {
    init,
    buildColonyGrid,
    updateFromState,
  };

  if (typeof window !== 'undefined') {
    window.ColonyRenderer = ColonyRenderer;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ColonyRenderer;
  }
})();
