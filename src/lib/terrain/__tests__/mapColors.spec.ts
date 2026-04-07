import { describe, it, expect } from 'vitest'
import { generateMapCanvas } from '../mapColors'

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
