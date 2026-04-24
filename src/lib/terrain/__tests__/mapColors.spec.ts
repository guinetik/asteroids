import { describe, it, expect } from 'vitest'
import { generateMapCanvas, heightmapToGrayscaleRgba } from '../mapColors'

describe('generateMapCanvas', () => {
  it('returns a canvas with correct dimensions', () => {
    const resolution = 16
    const heightmap = new Float32Array(resolution * resolution)
    for (let i = 0; i < heightmap.length; i++) {
      heightmap[i] = i / heightmap.length
    }
    const canvas = generateMapCanvas(heightmap, resolution)
    expect(canvas.width).toBe(resolution)
    expect(canvas.height).toBe(resolution)
  })

  it('handles flat heightmap without errors', () => {
    const resolution = 4
    const heightmap = new Float32Array(resolution * resolution).fill(0.5)
    const canvas = generateMapCanvas(heightmap, resolution)
    expect(canvas.width).toBe(resolution)
    expect(canvas.height).toBe(resolution)
  })
})

describe('heightmapToGrayscaleRgba', () => {
  it('uses the full grayscale range for an all-valid heightmap', () => {
    const total = 16
    // Heights span 0..1 so the lowest pixel should be GRAY_MIN (20) and the
    // highest GRAY_MIN + GRAY_RANGE (220).
    const heightmap = new Float32Array(total)
    for (let i = 0; i < total; i++) {
      heightmap[i] = i / (total - 1)
    }
    const rgba = heightmapToGrayscaleRgba(heightmap, total)
    // Pixel 0 = lowest height → GRAY_MIN
    expect(rgba[0]).toBe(20)
    // Pixel total-1 = highest height → GRAY_MIN + GRAY_RANGE
    expect(rgba[(total - 1) * 4]).toBe(220)
  })

  it('sentinel cells do not contaminate the normalization range', () => {
    const total = 16
    const heightmap = new Float32Array(total)
    // First half: sentinel (OFF_SURFACE_HEIGHT = -1e4)
    for (let i = 0; i < total / 2; i++) {
      heightmap[i] = -1e4
    }
    // Second half: real surface heights spanning 0..1
    for (let i = total / 2; i < total; i++) {
      heightmap[i] = (i - total / 2) / (total / 2 - 1)
    }
    const rgba = heightmapToGrayscaleRgba(heightmap, total)
    // Sentinel pixels must render at GRAY_MIN (near-black, treated as void)
    for (let i = 0; i < total / 2; i++) {
      expect(rgba[i * 4]).toBe(20) // GRAY_MIN
    }
    // Valid range still uses the full band: lowest valid → GRAY_MIN, highest → 220
    expect(rgba[(total / 2) * 4]).toBe(20)        // min valid height
    expect(rgba[(total - 1) * 4]).toBe(220)        // max valid height
  })
})
