/**
 * Renders a {@link Heightmap} as a textured solid mesh on the XZ plane.
 * Counterpart to {@link TerrainGrid} (wireframe). Same heightmap, different visual.
 *
 * Uses a PlaneGeometry subdivided to match the heightmap, with a tiling
 * texture applied. UV repeat scales proportionally with terrain size.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { Heightmap } from '@/lib/terrain/heightmap'

/** How many world units each texture tile covers. */
const TILE_SIZE = 150

/**
 * Textured terrain mesh that reads heights from a {@link Heightmap}.
 * Delegates all terrain math (height, normal, slope) to the heightmap.
 *
 * @author guinetik
 * @date 2026-04-05
 */
export class TerrainMesh implements Tickable {
  /** The Three.js mesh to add to the scene. */
  readonly mesh: THREE.Mesh

  private readonly geometry: THREE.PlaneGeometry
  private readonly material: THREE.MeshStandardMaterial
  private readonly heightmap: Heightmap

  constructor(heightmap: Heightmap, texturePath = '/texture.webp') {
    this.heightmap = heightmap

    const size = heightmap.worldSize
    const segments = Math.min(heightmap.resolution - 1, 512)

    // PlaneGeometry on XZ — Three.js creates it on XY, so we rotate
    this.geometry = new THREE.PlaneGeometry(size, size, segments, segments)
    this.geometry.rotateX(-Math.PI / 2)

    this.applyHeights()
    this.geometry.computeVertexNormals()

    // Texture
    const loader = new THREE.TextureLoader()
    const texture = loader.load(texturePath)
    const tileRepeat = Math.round(size / TILE_SIZE)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(tileRepeat, tileRepeat)
    texture.colorSpace = THREE.SRGBColorSpace

    this.material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      metalness: 0.1,
    })

    this.mesh = new THREE.Mesh(this.geometry, this.material)
  }

  /** Delegates to the underlying heightmap. */
  getHeightAt(x: number, z: number): number {
    return this.heightmap.heightAt(x, z)
  }

  /** Static terrain — no per-frame updates. */
  tick(_dt: number): void {}

  /** Clean up geometry, material, and texture. */
  dispose(): void {
    this.geometry.dispose()
    if (this.material.map) this.material.map.dispose()
    this.material.dispose()
  }

  /** Sample heightmap into vertex positions. */
  private applyHeights(): void {
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]!
      const z = positions[i + 2]!
      positions[i + 1] = this.heightmap.heightAt(x, z)
    }

    posAttr.needsUpdate = true
    this.geometry.computeBoundingSphere()
  }
}
