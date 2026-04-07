/**
 * Heightmap-to-canvas renderer for the minimap overlay.
 *
 * Takes a heightmap grid and produces a grayscale canvas where
 * dark pixels = low elevation, light pixels = high elevation.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-objective-waypoints-design.md
 */

/** Lowest grayscale value — avoids pure black */
const GRAY_MIN = 20

/** Grayscale range mapped to height — avoids pure white */
const GRAY_RANGE = 200

/**
 * Generate a grayscale map canvas from a heightmap.
 *
 * @param heightmap - Float32Array of resolution*resolution height values.
 * @param resolution - Width/height of the square grid.
 * @returns HTMLCanvasElement with grayscale elevation rendering.
 */
export function generateMapCanvas(
  heightmap: Float32Array,
  resolution: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = resolution
  canvas.height = resolution
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const img = ctx.createImageData(resolution, resolution)

  // Find height range
  let hMin = Infinity
  let hMax = -Infinity
  for (let i = 0; i < heightmap.length; i++) {
    if (heightmap[i]! < hMin) hMin = heightmap[i]!
    if (heightmap[i]! > hMax) hMax = heightmap[i]!
  }
  const range = hMax - hMin || 1

  for (let i = 0; i < heightmap.length; i++) {
    const t = (heightmap[i]! - hMin) / range
    const v = Math.round(GRAY_MIN + t * GRAY_RANGE)
    const p = i * 4
    img.data[p] = v
    img.data[p + 1] = v
    img.data[p + 2] = v
    img.data[p + 3] = 255
  }

  ctx.putImageData(img, 0, 0)
  return canvas
}
