/**
 * World-space to stereo / distance helpers for SFX (Howler L/R + volume), not PannerNode HRTF.
 *
 * @author guinetik
 * @date 2026-04-23
 */
import * as THREE from 'three'

const _to = new THREE.Vector3()
const _right = new THREE.Vector3()

const DEFAULT_EPS = 1e-4

/** How a world point maps to listener-relative hearing. */
export interface WorldHearing {
  /** Stereo pan in [-1,1] (Howler `stereo`). */
  pan: number
  /** World units from the listener to the source. */
  distance: number
  /** Apply to base manifest volume (0–1) for simple distance falloff. */
  volumeScale: number
}

/**
 * Map a world-space point to stereo pan and distance gain relative to a listener camera.
 * Pan comes from the direction-to-source dot the camera’s world right axis; falloff is
 * `refDistance / (refDistance + distance)` with a floor.
 *
 * @param camera - First-person (or any) camera used as the listener.
 * @param worldPoint - Source position in world space.
 * @param options - Optional `refDistance`, `minVolumeScale` (clamped 0–1), `eps` for “at ear”.
 * @returns Pan, true distance, and a volume scale (never 0; floored for audibility at range).
 */
export function worldPointToHearing(
  camera: THREE.PerspectiveCamera,
  worldPoint: THREE.Vector3,
  options: { minVolumeScale?: number; refDistance?: number; eps?: number } = {},
): WorldHearing {
  const minVol = Math.min(1, Math.max(0, options.minVolumeScale ?? 0.12))
  const refD = options.refDistance ?? 8
  const eps = options.eps ?? DEFAULT_EPS
  _to.subVectors(worldPoint, camera.position)
  const dist = _to.length()
  if (dist < eps) {
    return { pan: 0, distance: 0, volumeScale: 1 }
  }
  _to.divideScalar(dist)
  _right.set(1, 0, 0).applyQuaternion(camera.quaternion)
  const pan = Math.max(-1, Math.min(1, _to.dot(_right)))
  const volumeScale = Math.max(minVol, refD / (refD + dist))
  return { pan, distance: dist, volumeScale }
}
