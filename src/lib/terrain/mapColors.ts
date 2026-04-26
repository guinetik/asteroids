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
 * Threshold below which a heightmap cell is treated as a void sentinel rather
 * than a real surface height. Matches the `OFF_SURFACE_HEIGHT = -1e4` sentinel
 * written by `meshHeightmap.ts` for cells where the bake ray missed the mesh.
 * A threshold (-1000) is used here instead of importing the exact constant to
 * keep this module decoupled from the mesh-bake pipeline.
 */
export const SENTINEL_THRESHOLD = -1000

/**
 * Convert a flat heightmap array into a Uint8ClampedArray of grayscale RGBA values.
 *
 * Sentinel cells (height <= {@link SENTINEL_THRESHOLD}) are mapped to the minimum
 * grayscale value and excluded from the min/max scan so they cannot collapse the
 * normalization range for valid surface heights.
 *
 * @param heightmap - Float32Array of resolution*resolution height values.
 * @param length - Total number of cells (resolution * resolution).
 * @returns Uint8ClampedArray of length*4 bytes in RGBA order.
 */
export function heightmapToGrayscaleRgba(
  heightmap: Float32Array,
  length: number,
): Uint8ClampedArray {
  // Find height range — skip sentinel cells so void markers don't collapse the range
  let hMin = Infinity
  let hMax = -Infinity
  for (let i = 0; i < length; i++) {
    const h = heightmap[i]!
    if (h <= SENTINEL_THRESHOLD) continue
    if (h < hMin) hMin = h
    if (h > hMax) hMax = h
  }
  const range = hMax - hMin || 1

  const rgba = new Uint8ClampedArray(length * 4)
  for (let i = 0; i < length; i++) {
    const h = heightmap[i]!
    // Sentinel cells render at GRAY_MIN ("this is space" — near-black)
    const t = h <= SENTINEL_THRESHOLD ? 0 : (h - hMin) / range
    const v = Math.round(GRAY_MIN + t * GRAY_RANGE)
    const p = i * 4
    rgba[p] = v
    rgba[p + 1] = v
    rgba[p + 2] = v
    rgba[p + 3] = 255
  }
  return rgba
}

/**
 * Generate a grayscale map canvas from a heightmap.
 *
 * @param heightmap - Float32Array of resolution*resolution height values.
 * @param resolution - Width/height of the square grid.
 * @returns HTMLCanvasElement with grayscale elevation rendering.
 */
export function generateMapCanvas(heightmap: Float32Array, resolution: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = resolution
  canvas.height = resolution
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  const img = ctx.createImageData(resolution, resolution)
  const rgba = heightmapToGrayscaleRgba(heightmap, resolution * resolution)
  img.data.set(rgba)

  ctx.putImageData(img, 0, 0)
  return canvas
}
