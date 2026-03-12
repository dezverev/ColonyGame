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
  let hyperlaneLines = null;   // single LineSegments object
  let ownerRings = [];         // ownership indicator meshes
  let selectedSystemId = -1;
  let highlightMesh = null;
  let hoverLabelEl = null;     // DOM element for system name on hover
  let onSystemSelect = null;   // callback: (system) => void

  // Camera orbit state
  let orbitTheta = 0;          // horizontal angle (radians)
  let orbitPhi = Math.PI / 4;  // vertical angle (radians, 0 = top-down, PI/2 = horizon)
  let orbitRadius = 400;
  let orbitTarget = { x: 0, y: 0, z: 0 };
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let dragStartTheta = 0, dragStartPhi = 0;
  let isPanning = false;
  let panStartX = 0, panStartY = 0;
  let panStartTarget = { x: 0, y: 0, z: 0 };

  // Raycaster for hover/click
  const _raycaster = typeof THREE !== 'undefined' ? new THREE.Raycaster() : null;
  const _mouse = typeof THREE !== 'undefined' ? new THREE.Vector2() : null;

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

    // Hyperlane material
    _matCache.hyperlane = new THREE.LineBasicMaterial({
      color: 0x4466aa, transparent: true, opacity: 0.25,
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

    // Create star meshes
    starMeshes = new Array(systems.length).fill(null);
    for (const sys of systems) {
      const color = new THREE.Color(sys.starColor || '#ffffff');
      const matKey = 'star_' + sys.starType;
      if (!_matCache[matKey]) {
        _matCache[matKey] = new THREE.MeshBasicMaterial({
          color: color,
          emissive: color,
          emissiveIntensity: 1.0,
          toneMapped: false,
        });
        // MeshBasicMaterial doesn't have emissive — use it for pure color glow
        _matCache[matKey] = new THREE.MeshBasicMaterial({ color: color });
      }

      const radius = STAR_RADIUS[sys.starType] || 2.0;
      const mesh = new THREE.Mesh(_geoCache.star, _matCache[matKey]);
      mesh.position.set(sys.x, sys.y || 0, sys.z);
      mesh.scale.setScalar(radius);
      mesh.userData.systemId = sys.id;
      scene.add(mesh);
      starMeshes[sys.id] = mesh;
    }

    // Create hyperlane lines (single LineSegments for efficiency)
    if (hyperlanes.length > 0) {
      const positions = new Float32Array(hyperlanes.length * 6); // 2 vertices per line * 3 coords
      for (let i = 0; i < hyperlanes.length; i++) {
        const [a, b] = hyperlanes[i];
        const sa = systems[a], sb = systems[b];
        positions[i * 6 + 0] = sa.x;
        positions[i * 6 + 1] = (sa.y || 0) - 0.5; // slightly below stars
        positions[i * 6 + 2] = sa.z;
        positions[i * 6 + 3] = sb.x;
        positions[i * 6 + 4] = (sb.y || 0) - 0.5;
        positions[i * 6 + 5] = sb.z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      hyperlaneLines = new THREE.LineSegments(geo, _matCache.hyperlane);
      scene.add(hyperlaneLines);
    }

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
    if (hyperlaneLines) {
      if (hyperlaneLines.geometry) hyperlaneLines.geometry.dispose();
      scene.remove(hyperlaneLines);
      hyperlaneLines = null;
    }
    for (const ring of ownerRings) {
      scene.remove(ring);
    }
    ownerRings = [];
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }
    selectedSystemId = -1;
  }

  function _updateOwnership(systems) {
    // Remove old rings
    for (const ring of ownerRings) {
      scene.remove(ring);
    }
    ownerRings = [];

    if (!systems) return;
    for (const sys of systems) {
      if (!sys.owner) continue;
      // Find player color
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
      const ring = new THREE.Mesh(_geoCache.ring, _matCache[matKey]);
      ring.position.set(sys.x, (sys.y || 0) - 0.3, sys.z);
      ring.rotation.x = -Math.PI / 2; // lay flat
      scene.add(ring);
      ownerRings.push(ring);
    }
  }

  function _getPlayerColor(playerId) {
    // Get from gameState via GameClient
    if (typeof window !== 'undefined' && window.GameClient) {
      const state = window.GameClient.getState();
      if (state && state.players) {
        const player = state.players.find(p => p.id === playerId);
        if (player) return player.color;
      }
    }
    return '#888888';
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
    orbitTheta = 0;
    orbitPhi = Math.PI / 5; // ~36 degrees from top
    _updateCamera();
  }

  // ── Camera orbit ──

  function _updateCamera() {
    if (!camera) return;
    const x = orbitTarget.x + orbitRadius * Math.sin(orbitPhi) * Math.sin(orbitTheta);
    const y = orbitTarget.y + orbitRadius * Math.cos(orbitPhi);
    const z = orbitTarget.z + orbitRadius * Math.sin(orbitPhi) * Math.cos(orbitTheta);
    camera.position.set(x, y, z);
    camera.lookAt(orbitTarget.x, orbitTarget.y, orbitTarget.z);
  }

  // ── Event handlers ──

  function _onMouseDown(e) {
    if (e.button === 0) { // left: orbit rotate
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartTheta = orbitTheta;
      dragStartPhi = orbitPhi;
    } else if (e.button === 1 || e.button === 2) { // middle/right: pan
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartTarget = { ...orbitTarget };
      e.preventDefault();
    }
  }

  function _onMouseMoveDrag(e) {
    if (isDragging) {
      const dx = (e.clientX - dragStartX) * 0.005;
      const dy = (e.clientY - dragStartY) * 0.005;
      orbitTheta = dragStartTheta - dx;
      orbitPhi = Math.max(0.1, Math.min(Math.PI / 2 - 0.01, dragStartPhi + dy));
      _updateCamera();
    }
    if (isPanning) {
      const factor = orbitRadius * 0.002;
      const dx = (e.clientX - panStartX) * factor;
      const dy = (e.clientY - panStartY) * factor;
      // Pan in camera-right and camera-up directions (projected to XZ plane)
      orbitTarget.x = panStartTarget.x - dx * Math.cos(orbitTheta);
      orbitTarget.z = panStartTarget.z + dx * Math.sin(orbitTheta);
      orbitTarget.x += dy * Math.sin(orbitTheta) * Math.sin(orbitPhi);
      orbitTarget.z += dy * Math.cos(orbitTheta) * Math.sin(orbitPhi);
      _updateCamera();
    }
  }

  function _onMouseUp(e) {
    if (e.button === 0) isDragging = false;
    if (e.button === 1 || e.button === 2) isPanning = false;
  }

  function _onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1.1 : 0.9;
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
    const intersects = _raycaster.intersectObjects(starMeshes.filter(Boolean), false);

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

    const rect = renderer.domElement.getBoundingClientRect();
    _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    _raycaster.setFromCamera(_mouse, camera);
    const intersects = _raycaster.intersectObjects(starMeshes.filter(Boolean), false);

    if (intersects.length > 0) {
      const sysId = intersects[0].object.userData.systemId;
      const sys = galaxyData.systems[sysId];
      if (sys) {
        hoverLabelEl.textContent = sys.name;
        hoverLabelEl.style.display = 'block';
        hoverLabelEl.style.left = (e.clientX - rect.left + 12) + 'px';
        hoverLabelEl.style.top = (e.clientY - rect.top - 8) + 'px';
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

  // ── Update from game state ──

  function updateOwnership(colonies, players) {
    if (!galaxyData) return;
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
  }

  // ── Render ──

  function render() {
    if (renderer && scene && camera) {
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
    render,
    destroy,
    getSelectedSystem: () => selectedSystemId >= 0 && galaxyData ? galaxyData.systems[selectedSystemId] : null,
    setOnSystemSelect: (cb) => { onSystemSelect = cb; },
    getGalaxyData: () => galaxyData,
  };

  if (typeof window !== 'undefined') {
    window.GalaxyView = GalaxyView;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GalaxyView;
  }
})();
