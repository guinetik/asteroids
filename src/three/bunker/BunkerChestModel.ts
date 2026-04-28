/**
 * Bunker chest prop (loot) built from the shared DepositCrateModel.
 */
import * as THREE from 'three'
import { DepositCrateModel } from '@/three/DepositCrateModel'

/**
 * Model for the bunker loot chests. Wraps the shared DepositCrateModel.
 */
export class BunkerChestModel {
  readonly group = new THREE.Group()
  private crate: DepositCrateModel
  public opened = false

  constructor() {
    // Use an amber/gold color scheme for bunker loot chests
    this.crate = new DepositCrateModel({
      baseColor: 0x886622,
      trimColor: 0xffaa00,
    })
    this.group.add(this.crate.group)
  }

  open(): void {
    this.opened = true
    // When opened, change color of only the emissive strip to cyan indicating it's been looted
    this.crate.group.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        const mats = Array.isArray(c.material) ? c.material : [c.material]
        mats.forEach((m) => {
          if (m instanceof THREE.MeshStandardMaterial) {
            // Target only materials that actually have an active emissive color (i.e. the trim)
            if (m.emissive && m.emissive.getHex() > 0) {
              m.color?.setHex(0x5ce7ff)
              m.emissive.setHex(0x5ce7ff)
            }
            // Keep the body color as it is (amber/gold)
          }
        })
      }
    })
  }

  dispose(): void {
    this.crate.dispose()
  }
}
