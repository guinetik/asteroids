/**
 * FBX loader helper — wraps three's `FBXLoader` in a Promise.
 *
 * Mirrors {@link loadGLB} so callers can `await` an FBX scene+animations bundle.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'

const loader = new FBXLoader()

/**
 * Load an FBX file. The returned {@link THREE.Group} carries any embedded
 * animations on its `.animations` array.
 *
 * @param url - Public URL (e.g. `/models/animations/walking.fbx`)
 * @returns Loaded scene group with `.animations` attached
 */
export function loadFBX(url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(url, (group) => resolve(group), undefined, reject)
  })
}
