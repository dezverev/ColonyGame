/**
 * Isometric projection math — adapted from IsometricJS.
 * All functions that need origin/zoom take an options object: { originX, originY, width?, height?, zoom? }.
 */
const TileWidth = 64;
const TileHeight = 32;
const HeightStep = TileHeight / 2;
const ZScale = 2;

function worldToScreen(worldX, worldY, worldZ, options) {
  const { originX, originY } = options;
  const z = worldZ ?? 0;
  const sx = originX + (worldX - worldY) * (TileWidth / 2);
  const sy = originY + (worldX + worldY) * (TileHeight / 2) - z * HeightStep * ZScale;
  return { x: sx, y: sy };
}

function screenToWorld(localX, localY, z, options) {
  const { originX, originY } = options;
  const zVal = z ?? 0;
  const u = (localX - originX) / (TileWidth / 2);
  const v = (localY - originY + zVal * HeightStep * ZScale) / (TileHeight / 2);
  return { x: (u + v) / 2, y: (v - u) / 2 };
}

function applyZoomToPoint(pt, options) {
  const { width, height, zoom } = options;
  const cx = width / 2;
  const cy = height / 2;
  return {
    x: cx + zoom * (pt.x - cx),
    y: cy + zoom * (pt.y - cy),
  };
}

function inverseZoomToPoint(screenX, screenY, options) {
  const { width, height, zoom } = options;
  const cx = width / 2;
  const cy = height / 2;
  return {
    x: cx + (screenX - cx) / zoom,
    y: cy + (screenY - cy) / zoom,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TileWidth, TileHeight, HeightStep, ZScale, worldToScreen, screenToWorld, applyZoomToPoint, inverseZoomToPoint };
}
if (typeof window !== 'undefined') {
  window.Projection = { TileWidth, TileHeight, HeightStep, ZScale, worldToScreen, screenToWorld, applyZoomToPoint, inverseZoomToPoint };
}
