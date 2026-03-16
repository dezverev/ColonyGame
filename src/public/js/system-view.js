/**
 * Three.js system orbital view — renders a single star system with star, orbital rings, and planets.
 * PerspectiveCamera with orbit controls. Players can click planets for details.
 * Navigation chain: Galaxy -> System -> Colony.
 */
(function () {
  /* global THREE */

  let scene, camera, renderer, container;
  let systemData = null;       // current system object { id, name, starType, starColor, planets, ... }
  let starMesh = null;
  let planetMeshes = [];       // { mesh, planet, orbitRing, labelEl }
  let highlightMesh = null;
  let selectedPlanetIdx = -1;
  let onPlanetSelect = null;   // callback: (planet, system) => void
  let onBack = null;           // callback: () => void — return to galaxy

  // Camera orbit state
  let orbitAngle = 0;          // horizontal angle (radians)
  let orbitPitch = 0.6;        // vertical angle (radians)
  let orbitRadius = 80;
  let orbitTarget = { x: 0, y: 0, z: 0 };
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let dragStartAngle = 0, dragStartPitch = 0;

  // Raycaster
  const _raycaster = typeof THREE !== 'undefined' ? new THREE.Raycaster() : null;
  const _mouse = typeof THREE !== 'undefined' ? new THREE.Vector2() : null;

  // Shared geometries and materials
  const _geoCache = {};
  const _matCache = {};
  // Per-build disposables — geometries/materials created per buildSystem() call that must be disposed
  let _disposables = [];

  // Planet visual config by type
  const PLANET_COLORS = {
    continental: 0x2ecc71,
    ocean:       0x3498db,
    tropical:    0x27ae60,
    arctic:      0xbdc3c7,
    desert:      0xe67e22,
    arid:        0xd4a437,
    barren:      0x7f8c8d,
    molten:      0xe74c3c,
    gasGiant:    0xf39c12,
  };

  const STAR_COLORS = {
    yellow: 0xf9d71c,
    red:    0xe74c3c,
    blue:   0x3498db,
    white:  0xecf0f1,
    orange: 0xe67e22,
  };

  const STAR_RADIUS_MAP = {
    yellow: 4.0,
    red:    3.0,
    blue:   5.5,
    white:  3.5,
    orange: 4.5,
  };

  // ── Initialization ──

  function init(containerEl) {
    container = containerEl || (typeof document !== 'undefined' ? document.getElementById('render-container') : null);
    if (!container || typeof THREE === 'undefined') return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);

    camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      2000
    );

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Lighting
    const ambient = new THREE.AmbientLight(0x333355, 0.6);
    scene.add(ambient);

    // Init shared geometry
    _geoCache.planet = new THREE.SphereGeometry(1, 16, 12);
    _geoCache.star = new THREE.SphereGeometry(1, 24, 16);
    _geoCache.highlight = new THREE.RingGeometry(1.2, 1.6, 24);
    _matCache.highlight = new THREE.MeshBasicMaterial({
      color: 0x00ffaa, side: THREE.DoubleSide, transparent: true, opacity: 0.8,
    });

    // Events
    renderer.domElement.addEventListener('mousedown', _onMouseDown);
    renderer.domElement.addEventListener('wheel', _onWheel, { passive: false });
    renderer.domElement.addEventListener('click', _onClick);
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', _onMouseMoveDrag);
    window.addEventListener('mouseup', _onMouseUp);
    window.addEventListener('resize', _onResize);

    _updateCamera();
  }

  // ── Build system scene ──

  function buildSystem(system) {
    if (!scene || !system) return;
    _clearSystem();
    systemData = system;

    const starRadius = STAR_RADIUS_MAP[system.starType] || 4.0;
    const starColor = STAR_COLORS[system.starType] || 0xf9d71c;

    // Star — cache material by star type
    const starMatKey = 'star_' + system.starType;
    if (!_matCache[starMatKey]) {
      _matCache[starMatKey] = new THREE.MeshBasicMaterial({ color: starColor });
    }
    starMesh = new THREE.Mesh(_geoCache.star, _matCache[starMatKey]);
    starMesh.scale.setScalar(starRadius);
    scene.add(starMesh);

    // Point light from the star
    const starLight = new THREE.PointLight(starColor, 1.0, 200);
    starLight.position.set(0, 0, 0);
    scene.add(starLight);
    starMesh.userData.light = starLight;

    // Planets on orbital rings
    if (system.planets && system.planets.length > 0) {
      for (let i = 0; i < system.planets.length; i++) {
        const planet = system.planets[i];
        const orbitDist = 12 + planet.orbit * 10; // spacing from star
        const planetColor = PLANET_COLORS[planet.type] || 0x888888;

        // Planet radius based on type/size
        let planetRadius;
        if (planet.type === 'gasGiant') {
          planetRadius = 2.5;
        } else {
          planetRadius = 0.8 + (planet.size / 20) * 1.2; // 0.8 - 2.0 based on size
        }

        // Orbital ring — geometry is unique per orbit radius, must dispose on clear
        const ringGeo = new THREE.RingGeometry(orbitDist - 0.08, orbitDist + 0.08, 32);
        _disposables.push(ringGeo);
        if (!_matCache.orbitRing) {
          _matCache.orbitRing = new THREE.MeshBasicMaterial({
            color: 0x445566, side: THREE.DoubleSide, transparent: true, opacity: 0.3,
          });
        }
        const ring = new THREE.Mesh(ringGeo, _matCache.orbitRing);
        ring.rotation.x = -Math.PI / 2;
        scene.add(ring);

        // Planet mesh — positioned along orbit
        const angle = (i / system.planets.length) * Math.PI * 2;
        const px = Math.cos(angle) * orbitDist;
        const pz = Math.sin(angle) * orbitDist;

        // Cache planet material by type
        const planetMatKey = 'planet_' + planet.type;
        if (!_matCache[planetMatKey]) {
          _matCache[planetMatKey] = new THREE.MeshStandardMaterial({
            color: planetColor,
            roughness: 0.7,
            metalness: 0.1,
          });
        }
        const mesh = new THREE.Mesh(_geoCache.planet, _matCache[planetMatKey]);
        mesh.scale.setScalar(planetRadius);
        mesh.position.set(px, 0, pz);
        mesh.userData.planetIndex = i;
        mesh.userData.orbitDist = orbitDist;
        mesh.userData.orbitAngle = angle;
        scene.add(mesh);

        // Colonized indicator — small ring
        if (planet.colonized) {
          const colRingGeo = new THREE.RingGeometry(planetRadius * 1.3, planetRadius * 1.6, 16);
          _disposables.push(colRingGeo);
          if (!_matCache.colonized) {
            _matCache.colonized = new THREE.MeshBasicMaterial({
              color: 0x00ffaa, side: THREE.DoubleSide, transparent: true, opacity: 0.6,
            });
          }
          const colRing = new THREE.Mesh(colRingGeo, _matCache.colonized);
          colRing.rotation.x = -Math.PI / 2;
          colRing.position.copy(mesh.position);
          colRing.position.y = -0.1;
          scene.add(colRing);
          mesh.userData.colRing = colRing;
        }

        planetMeshes.push({ mesh, planet, orbitRing: ring });
      }
    }

    // Fit camera
    const maxOrbit = system.planets && system.planets.length > 0
      ? 12 + Math.max(...system.planets.map(p => p.orbit)) * 10 + 15
      : 30;
    orbitRadius = maxOrbit * 1.3;
    orbitAngle = 0.5;
    orbitPitch = 0.6;
    _updateCamera();
  }

  function _clearSystem() {
    if (starMesh) {
      if (starMesh.userData.light) scene.remove(starMesh.userData.light);
      scene.remove(starMesh);
      starMesh = null;
    }
    for (const entry of planetMeshes) {
      scene.remove(entry.mesh);
      scene.remove(entry.orbitRing);
      if (entry.mesh.userData.colRing) scene.remove(entry.mesh.userData.colRing);
    }
    planetMeshes = [];
    // Dispose per-build geometries (orbit rings, colonized rings)
    for (const geo of _disposables) geo.dispose();
    _disposables = [];
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }
    selectedPlanetIdx = -1;
    systemData = null;
  }

  // ── Camera ──

  function _updateCamera() {
    if (!camera) return;
    const x = orbitTarget.x + orbitRadius * Math.cos(orbitPitch) * Math.sin(orbitAngle);
    const y = orbitTarget.y + orbitRadius * Math.sin(orbitPitch);
    const z = orbitTarget.z + orbitRadius * Math.cos(orbitPitch) * Math.cos(orbitAngle);
    camera.position.set(x, y, z);
    camera.lookAt(orbitTarget.x, orbitTarget.y, orbitTarget.z);
  }

  // ── Event handlers ──

  function _onMouseDown(e) {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartAngle = orbitAngle;
    dragStartPitch = orbitPitch;
    if (e.button === 1 || e.button === 2) e.preventDefault();
  }

  function _onMouseMoveDrag(e) {
    if (!isDragging) return;
    const dx = (e.clientX - dragStartX) * 0.005;
    const dy = (e.clientY - dragStartY) * 0.005;
    orbitAngle = dragStartAngle - dx;
    orbitPitch = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, dragStartPitch + dy));
    _updateCamera();
  }

  function _onMouseUp() {
    isDragging = false;
  }

  function _onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1.08 : 1 / 1.08;
    orbitRadius = Math.max(20, Math.min(500, orbitRadius * delta));
    _updateCamera();
  }

  function _onResize() {
    if (!container || !renderer || !camera) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  function _onClick(e) {
    if (e.button !== 0 || !_raycaster || !systemData) return;
    if (Math.abs(e.clientX - dragStartX) > 5 || Math.abs(e.clientY - dragStartY) > 5) return;

    const rect = renderer.domElement.getBoundingClientRect();
    _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    _raycaster.setFromCamera(_mouse, camera);
    const meshes = planetMeshes.map(p => p.mesh);
    const intersects = _raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const idx = intersects[0].object.userData.planetIndex;
      _selectPlanet(idx);
    } else {
      _deselectPlanet();
    }
  }

  function _selectPlanet(idx) {
    selectedPlanetIdx = idx;

    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }

    const entry = planetMeshes[idx];
    if (!entry) return;

    const scale = entry.mesh.scale.x * 1.5;
    highlightMesh = new THREE.Mesh(_geoCache.highlight, _matCache.highlight);
    highlightMesh.scale.setScalar(scale);
    highlightMesh.position.copy(entry.mesh.position);
    highlightMesh.position.y -= 0.2;
    highlightMesh.rotation.x = -Math.PI / 2;
    scene.add(highlightMesh);

    if (onPlanetSelect) onPlanetSelect(entry.planet, systemData);
  }

  function _deselectPlanet() {
    selectedPlanetIdx = -1;
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }
    if (onPlanetSelect) onPlanetSelect(null, systemData);
  }

  // ── Animation ──

  function _animate() {
    if (!systemData) return;
    const now = performance.now();

    // Slow orbital rotation for planets
    for (const entry of planetMeshes) {
      const speed = 0.0001 / (entry.mesh.userData.orbitDist * 0.02);
      const angle = entry.mesh.userData.orbitAngle + now * speed;
      const dist = entry.mesh.userData.orbitDist;
      entry.mesh.position.x = Math.cos(angle) * dist;
      entry.mesh.position.z = Math.sin(angle) * dist;

      // Update colonized ring position
      if (entry.mesh.userData.colRing) {
        entry.mesh.userData.colRing.position.x = entry.mesh.position.x;
        entry.mesh.userData.colRing.position.z = entry.mesh.position.z;
      }
    }

    // Keep highlight on selected planet
    if (highlightMesh && selectedPlanetIdx >= 0 && planetMeshes[selectedPlanetIdx]) {
      highlightMesh.position.x = planetMeshes[selectedPlanetIdx].mesh.position.x;
      highlightMesh.position.z = planetMeshes[selectedPlanetIdx].mesh.position.z;
    }

    // Star glow pulse
    if (starMesh) {
      const pulse = 1.0 + Math.sin(now * 0.002) * 0.03;
      const base = STAR_RADIUS_MAP[systemData.starType] || 4.0;
      starMesh.scale.setScalar(base * pulse);
    }
  }

  // ── Render ──

  function render() {
    if (renderer && scene && camera) {
      _animate();
      renderer.render(scene, camera);
    }
  }

  // ── Cleanup ──

  function destroy() {
    if (renderer && renderer.domElement) {
      renderer.domElement.removeEventListener('mousedown', _onMouseDown);
      renderer.domElement.removeEventListener('wheel', _onWheel);
      renderer.domElement.removeEventListener('click', _onClick);
      window.removeEventListener('mousemove', _onMouseMoveDrag);
      window.removeEventListener('mouseup', _onMouseUp);
      window.removeEventListener('resize', _onResize);

      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
    }
    _clearSystem();
    scene = null;
    camera = null;
    renderer = null;
    container = null;
  }

  // ── Public API ──
  const SystemView = {
    init,
    buildSystem,
    render,
    destroy,
    getSystemData: () => systemData,
    getSelectedPlanet: () => selectedPlanetIdx >= 0 && systemData && systemData.planets ? systemData.planets[selectedPlanetIdx] : null,
    setOnPlanetSelect: (cb) => { onPlanetSelect = cb; },
    setOnBack: (cb) => { onBack = cb; },
  };

  if (typeof window !== 'undefined') {
    window.SystemView = SystemView;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SystemView;
  }
})();
