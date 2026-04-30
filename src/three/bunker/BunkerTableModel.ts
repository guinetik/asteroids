/**
 * Bunker table prop (extract terminal).
 */
import * as THREE from 'three'
import { loadGLB } from '@/three/loadGLB'

/**
 * Model for the extraction terminal table.
 */
export class BunkerTableModel {
  readonly group = new THREE.Group()
  private scene: THREE.Group | null = null

  constructor() {
    loadGLB('/models/table.glb')
      .then((scene) => {
        this.scene = scene

        const tableBox = new THREE.Box3().setFromObject(scene)
        const tableSize = tableBox.getSize(new THREE.Vector3())
        const tableMaxDim = Math.max(tableSize.x, tableSize.y, tableSize.z)
        const TABLE_TARGET_SIZE = 12.0 // Increased size so it's a proper terminal compared to chests
        scene.scale.setScalar(TABLE_TARGET_SIZE / tableMaxDim)
        scene.rotation.set(Math.PI, 0, Math.PI) // X flips front, Z flips upright

        // Re-centre after scale + rotation
        tableBox.setFromObject(scene)
        const tableCenter = tableBox.getCenter(new THREE.Vector3())
        scene.position.sub(tableCenter)

        // Drop to floor
        tableBox.setFromObject(scene)
        const tableMin = tableBox.min.y
        scene.position.y -= tableMin

        // Tame the emissive LEDs on the table model
        scene.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material]
            for (const mat of mats) {
              if (mat instanceof THREE.MeshStandardMaterial && mat.emissiveIntensity > 0) {
                mat.emissiveIntensity = Math.min(mat.emissiveIntensity, 0.7)
              }
            }
          }
        })

        this.group.add(scene)
      })
      .catch((e) => console.error('Failed to load table.glb', e))
  }

  dispose(): void {
    if (this.scene) {
      this.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
    }
  }
}
