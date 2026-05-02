/**
 * GLB model loading utility.
 *
 * Loads GLTF/GLB files via Three.js GLTFLoader, freezes embedded
 * animations, and fixes common material issues.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-map-view-design.md
 */
import * as THREE from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

/** Draco decoder path — Google's CDN works in dev and production (no need to ship wasm). */
const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath(DRACO_DECODER_PATH)

const loader = new GLTFLoader()
loader.setMeshoptDecoder(MeshoptDecoder)
loader.setDRACOLoader(dracoLoader)

/**
 * Load a GLB file and return its scene graph.
 *
 * Freezes any embedded animations at frame 0 and resets morph targets
 * to prevent auto-deformation.
 *
 * @param url - Path to the GLB file (e.g. '/models/asteroids.glb')
 * @returns The loaded scene group
 */
export function loadGLB(url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        // Freeze embedded animations at frame 0
        if (gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(gltf.scene)
          for (const clip of gltf.animations) {
            const action = mixer.clipAction(clip)
            action.play()
          }
          mixer.update(0)
          mixer.stopAllAction()

          // Reset morph target influences
          gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh && child.morphTargetInfluences) {
              child.morphTargetInfluences.fill(0)
            }
          })
        }
        resolve(gltf.scene)
      },
      undefined,
      reject,
    )
  })
}

/**
 * Fix common GLB material issues for asteroid rendering.
 *
 * Forces double-sided rendering and softens specular response
 * to prevent overly shiny surfaces under the sun's point light.
 *
 * @param group - The loaded GLB scene group to fix
 */
export function fixMaterials(group: THREE.Group): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.material) return

    const mats = Array.isArray(child.material) ? child.material : [child.material]
    for (const mat of mats) {
      mat.side = THREE.DoubleSide

      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.roughness = Math.max(mat.roughness, 0.78)
        mat.metalness = Math.min(mat.metalness, 0.08)
        mat.envMapIntensity = Math.min(mat.envMapIntensity, 0.45)
      }

      if (mat instanceof THREE.MeshPhysicalMaterial) {
        mat.clearcoat = Math.min(mat.clearcoat, 0.05)
        mat.clearcoatRoughness = Math.max(mat.clearcoatRoughness, 0.85)
      }

      if (mat instanceof THREE.MeshPhongMaterial) {
        mat.shininess = Math.min(mat.shininess, 8)
        mat.specular.multiplyScalar(0.35)
      }

      mat.needsUpdate = true
    }
  })
}
