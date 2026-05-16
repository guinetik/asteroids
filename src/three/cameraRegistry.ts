/**
 * Module-level registry for the active first-person camera.
 *
 * Visual effects that need a camera reference (loot-pickup parcels,
 * screen-space sprites, etc.) can read it here without threading the
 * camera through every controller and scene-builder constructor. The
 * FPS view registers its camera on mount and clears it on unmount.
 *
 * Single-camera assumption mirrors the actual runtime — only one FPS
 * camera is alive at any moment.
 *
 * @author guinetik
 * @date 2026-05-16
 */
import type { PerspectiveCamera } from 'three'

let activeFpsCamera: PerspectiveCamera | null = null

/**
 * Register the currently active FPS camera. Called by the FPS view
 * once the camera has been constructed. Pass `null` on unmount.
 *
 * @param camera - The active FPS camera, or `null` to clear.
 */
export function setActiveFpsCamera(camera: PerspectiveCamera | null): void {
  activeFpsCamera = camera
}

/**
 * Read the currently active FPS camera, or `null` if no view has
 * registered one. Callers should gracefully degrade when no camera
 * is available (e.g. headless tests).
 *
 * @returns The active camera or `null`.
 */
export function getActiveFpsCamera(): PerspectiveCamera | null {
  return activeFpsCamera
}
