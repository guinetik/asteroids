import { describe, it, expect } from 'vitest'
import { computeCompassBearings, COMPASS_LABELS, type CompassTargetInput } from '../compassBearings'

const sun: CompassTargetInput = { label: 'Sol', color: '#FFF0B0', x: 0, z: 0 }

describe('computeCompassBearings', () => {
  it('returns empty when camera look direction is nearly vertical', () => {
    const result = computeCompassBearings({
      shipX: 0,
      shipZ: 0,
      cameraX: 10,
      cameraZ: 10,
      targetX: 10,
      targetZ: 10,
      targets: [sun],
    })
    expect(result).toEqual([])
  })

  it('returns 0 rad for a target dead ahead of the camera', () => {
    // Camera at (-10, 0) looking toward origin → forward = (+X, 0)
    // Ship at origin, target at (+50, 0) → dead ahead.
    const result = computeCompassBearings({
      shipX: 0,
      shipZ: 0,
      cameraX: -10,
      cameraZ: 0,
      targetX: 0,
      targetZ: 0,
      targets: [{ label: 'Ea', color: '#0af', x: 50, z: 0 }],
    })
    expect(result).toHaveLength(1)
    expect(result[0]!.bearingRad).toBeCloseTo(0, 5)
  })

  it('returns positive bearing for targets on the right side of camera forward', () => {
    // Forward = (+X, 0). Target at (0, +Z) is screen-right (+Z = "right" when right = -fwdZ,fwdX = (0,1))
    const result = computeCompassBearings({
      shipX: 0,
      shipZ: 0,
      cameraX: -10,
      cameraZ: 0,
      targetX: 0,
      targetZ: 0,
      targets: [{ label: 'Ma', color: '#f44', x: 0, z: 50 }],
    })
    expect(result[0]!.bearingRad).toBeCloseTo(Math.PI / 2, 5)
  })

  it('returns negative bearing for targets on the left side of camera forward', () => {
    const result = computeCompassBearings({
      shipX: 0,
      shipZ: 0,
      cameraX: -10,
      cameraZ: 0,
      targetX: 0,
      targetZ: 0,
      targets: [{ label: 'Ju', color: '#fc8', x: 0, z: -50 }],
    })
    expect(result[0]!.bearingRad).toBeCloseTo(-Math.PI / 2, 5)
  })

  it('preserves target ordering, label, and color in output', () => {
    const targets: CompassTargetInput[] = [
      sun,
      { label: 'Ea', color: '#0af', x: 100, z: 0 },
      { label: 'Ma', color: '#f44', x: 0, z: 100 },
    ]
    const result = computeCompassBearings({
      shipX: 0,
      shipZ: 0,
      cameraX: -10,
      cameraZ: 0,
      targetX: 0,
      targetZ: 0,
      targets,
    })
    expect(result.map((b) => b.label)).toEqual(['Sol', 'Ea', 'Ma'])
    expect(result[1]!.color).toBe('#0af')
  })

  it('exposes catalog labels for Sun and all canonical planets', () => {
    expect(COMPASS_LABELS.sun).toBe('Sol')
    expect(COMPASS_LABELS.earth).toBe('Ea')
    expect(COMPASS_LABELS.jupiter).toBe('Ju')
    expect(COMPASS_LABELS.pluto).toBe('Pl')
  })
})
