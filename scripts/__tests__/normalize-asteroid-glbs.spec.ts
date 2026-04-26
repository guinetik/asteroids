import { describe, expect, it } from 'vitest'

import {
  boundsCenter,
  boundsSize,
  computeReferenceFit,
  outputNameForInput,
} from '../normalize-asteroid-glbs.mjs'

describe('normalize asteroid GLBs helpers', () => {
  it('maps source names under 3d/asteroids/ to public asteroid model names', () => {
    expect(outputNameForInput('3d/asteroids/bennu.glb')).toBe('bennu.glb')
    expect(outputNameForInput('3d/asteroids/itokawa.glb')).toBe('itokawa.glb')
    expect(outputNameForInput('3d/asteroids/kr3.glb')).toBe('kr3.glb')
    expect(outputNameForInput('3d/asteroids/psyche.glb')).toBe('psyche.glb')
  })

  it('centers the fitted bounds on the reference center', () => {
    const sourceBounds = {
      min: [-31, -21, -8],
      max: [55, 47, 73],
    }
    const referenceBounds = {
      min: [-0.98, -0.84, -0.87],
      max: [0.9, 0.93, 0.94],
    }

    const fit = computeReferenceFit(sourceBounds, referenceBounds)
    const fittedCenter = boundsCenter(fit.fittedBounds)
    const referenceCenter = boundsCenter(referenceBounds)

    expect(fittedCenter[0]).toBeCloseTo(referenceCenter[0])
    expect(fittedCenter[1]).toBeCloseTo(referenceCenter[1])
    expect(fittedCenter[2]).toBeCloseTo(referenceCenter[2])
  })

  it('matches the reference max dimension while preserving source proportions', () => {
    const sourceBounds = {
      min: [-31, -21, -8],
      max: [55, 47, 73],
    }
    const referenceBounds = {
      min: [-0.98, -0.84, -0.87],
      max: [0.9, 0.93, 0.94],
    }

    const sourceSize = boundsSize(sourceBounds)
    const fit = computeReferenceFit(sourceBounds, referenceBounds)
    const fittedSize = boundsSize(fit.fittedBounds)

    expect(Math.max(...fittedSize)).toBeCloseTo(1.88)
    expect(fittedSize[0] / fittedSize[2]).toBeCloseTo(sourceSize[0] / sourceSize[2])
    expect(fittedSize[1] / fittedSize[2]).toBeCloseTo(sourceSize[1] / sourceSize[2])
  })
})
