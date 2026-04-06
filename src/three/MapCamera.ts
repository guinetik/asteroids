/**
 * Orthographic camera for the tactical map overlay.
 *
 * Creates and manages a top-down OrthographicCamera that covers
 * the full solar system. Provides frustum math and animated
 * transition helpers.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-overlay-design.md
 */
import * as THREE from 'three'
import mapOverlayData from '@/data/shuttle/map-overlay.json'
import { easeInOutCubic } from '@/lib/math/easing'

/** Frustum bounds for an orthographic camera. */
export interface FrustumBounds {
  /** Left edge in world units */
  left: number
  /** Right edge in world units */
  right: number
  /** Top edge in world units */
  top: number
  /** Bottom edge in world units */
  bottom: number
}

/** Full-system frustum half-extent in world units. */
const FRUSTUM_HALF_SIZE = mapOverlayData.frustumHalfSize

/** Initial tight-crop frustum half-extent around ship. */
const FRUSTUM_INITIAL_HALF_SIZE = mapOverlayData.frustumInitialHalfSize

/** Height of the ortho camera above the XZ plane. */
const CAMERA_HEIGHT = mapOverlayData.cameraHeight

/**
 * Compute symmetric orthographic frustum bounds for a given half-size and aspect ratio.
 *
 * @param halfSize - Half-extent of the frustum along the X axis
 * @param aspect - Viewport width / height
 */
export function computeFrustum(halfSize: number, aspect: number): FrustumBounds {
  return {
    left: -halfSize,
    right: halfSize,
    top: halfSize / aspect,
    bottom: -halfSize / aspect,
  }
}

/**
 * Linearly interpolate between two frustum half-sizes.
 *
 * @param initial - Starting half-size (tight crop around ship)
 * @param final_ - Ending half-size (full system view)
 * @param t - Interpolation factor 0–1
 */
export function lerpFrustum(initial: number, final_: number, t: number): number {
  return initial + (final_ - initial) * t
}

/**
 * Smooth ease-in-out curve (cubic).
 *
 * @param t - Input 0–1
 * @returns Eased output 0–1
 */
export function easeInOut(t: number): number {
  return easeInOutCubic(t)
}

/**
 * Manages the orthographic camera used for the tactical map view.
 *
 * Created once during MapViewController init. On map open, positions
 * the camera above the ship and animates the frustum from tight crop
 * to full-system view. On close, reverses the animation.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-overlay-design.md
 */
export class MapCamera {
  /** The orthographic camera instance. */
  readonly camera: THREE.OrthographicCamera

  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, CAMERA_HEIGHT + 100)
    this.camera.position.set(0, CAMERA_HEIGHT, 0)
    this.camera.lookAt(0, 0, 0)
  }

  /**
   * Position the camera above the ship and set the initial tight frustum.
   *
   * @param shipX - Ship world X position
   * @param shipZ - Ship world Z position
   * @param aspect - Viewport aspect ratio
   */
  positionAboveShip(shipX: number, shipZ: number, aspect: number): void {
    this.camera.position.set(shipX, CAMERA_HEIGHT, shipZ)
    this.camera.lookAt(shipX, 0, shipZ)
    this.updateFrustum(FRUSTUM_INITIAL_HALF_SIZE, aspect)
  }

  /**
   * Update the frustum based on transition progress.
   * At progress=0, frustum is tight around ship.
   * At progress=1, frustum covers the full system.
   *
   * @param progress - Transition progress 0–1 (already eased by caller)
   * @param aspect - Viewport aspect ratio
   */
  updateTransition(progress: number, aspect: number): void {
    const halfSize = lerpFrustum(FRUSTUM_INITIAL_HALF_SIZE, FRUSTUM_HALF_SIZE, progress)
    this.updateFrustum(halfSize, aspect)
  }

  /**
   * Project a world position to normalized screen coordinates (0–1).
   *
   * @param worldPos - Position in world space
   * @returns Screen coordinates { x, y } where (0,0) is top-left, (1,1) is bottom-right
   */
  projectToScreen(worldPos: THREE.Vector3): { x: number; y: number } {
    const projected = worldPos.clone().project(this.camera)
    return {
      x: (projected.x + 1) * 0.5,
      y: (1 - projected.y) * 0.5,
    }
  }

  /** Set frustum from half-size and aspect ratio, then update the projection matrix. */
  private updateFrustum(halfSize: number, aspect: number): void {
    const bounds = computeFrustum(halfSize, aspect)
    this.camera.left = bounds.left
    this.camera.right = bounds.right
    this.camera.top = bounds.top
    this.camera.bottom = bounds.bottom
    this.camera.updateProjectionMatrix()
  }
}
