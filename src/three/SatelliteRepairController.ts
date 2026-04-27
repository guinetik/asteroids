/**
 * In-scene controller for the satellite servicing minigame.
 *
 * Attaches to a satellite POI during EVA, applies a red wireframe overlay to
 * each broken component, and registers with the map EVA
 * {@link ProjectileSystem} so **science** bolts swept against per-component
 * AABBs reduce “damage” until each part is fully repaired. Wireframe color
 * moves red → orange → near-green with progress; a final short green hold
 * plays before the overlay is removed and `markRepaired` runs.
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/superpowers/specs/2026-04-19-eva-minigame-wiring-design.md
 */
import * as THREE from 'three'
import { segmentIntersectsAabb3 } from '@/lib/physics/segmentAabb3'
import type { SatelliteServicingMiniGame } from '@/lib/minigame/satelliteServicing/SatelliteServicingMiniGame'
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import { validateManifest } from '@/lib/satellites/satelliteManifests'
import { Timer } from '@/lib/Timer'

/** Orange wireframe — mid progress while shooting a panel. */
const AIM_ORANGE = 0xfb923c

/** Red emissive wireframe for fresh damage. */
const DAMAGE_WIREFRAME_COLOR = 0xf87171

/**
 * Last repair stage before completion — one more science hit finishes the
 * part (turns the solid celebration green in `REPAIR_COMPLETE_COLOR`).
 */
const ALMOST_REPAIRED_WIREFRAME_COLOR = 0x84cc16

/** Wireframe overlay opacity — fixed, no fade. */
const WIREFRAME_OPACITY = 0.9

/** Seconds the repaired wireframe stays visible (green) before being removed. */
const REPAIR_HOLD_SECONDS = 2

/** Green color applied to a component's wireframe during the post-repair hold. */
const REPAIR_COMPLETE_COLOR = 0x4ade80

/** How many successful science-bolt hits on a part are required to finish it. */
const SCIENCE_REPAIR_HITS_PER_COMPONENT = 3

/** Configuration passed to `SatelliteRepairController.attach`. */
export interface SatelliteRepairControllerConfig {
  /** POI root — walked for named rigged sub-objects. */
  poiObject: THREE.Object3D
  /** The minigame instance — controller calls `markRepaired(name)` after the green hold. */
  minigame: SatelliteServicingMiniGame
  /** The active mission — reserved for future use (mission-specific tuning). */
  mission: ActiveVisitRelayMission
  /**
   * Fires when a sub-object has absorbed enough science hits — good for a HUD
   * toast. Not called for unknown names.
   *
   * @param componentName - Manifest name (e.g. `satellite_solar_A`).
   */
  onComponentFullyRepaired?: (componentName: string) => void
  /**
   * Clear any stale aim prompt; kept for host parity with other EVA flows.
   *
   * @param prompt - null when the controller disposes.
   */
  onAimPromptChange?: (prompt: string | null) => void
}

/** Internal per-component state. Tracks the source object, damage overlay, and repair progress. */
interface DamagedComponent {
  /** Name of the rigged sub-object this component represents. */
  name: string
  /** Source Object3D on the POI tree — the wireframe overlay sits on top of this. */
  source: THREE.Object3D
  /** Red (or orange when aimed, green when repaired) wireframe overlay group. */
  wireframe: THREE.Object3D
  /**
   * World-space bounds for swept science-bolt tests. Snapshot after the EVA
   * huge-scale pass so the AABB matches the on-screen model.
   */
  worldBounds: THREE.Box3
  /** Set to true when the final hit triggers the green-hold sequence. */
  fading: boolean
  /**
   * Remaining science hits before `fading` — starts at
   * {@link SCIENCE_REPAIR_HITS_PER_COMPONENT}.
   */
  scienceHitsRemaining: number
}

/**
 * Drives 3D satellite damage/repair; wire `tryScienceRepairSegment` into the map
 * EVA `ProjectileSystem` via `setEvaSatelliteServicingScience`.
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/superpowers/specs/2026-04-19-eva-minigame-wiring-design.md
 */
export class SatelliteRepairController {
  private cfg: SatelliteRepairControllerConfig | null = null
  private components: DamagedComponent[] = []
  private readonly _hitScratch = new THREE.Vector3()

  /**
   * Attach to a scene + POI. Looks up each broken component by name and applies
   * a red wireframe overlay. If any manifest component is missing from the POI
   * tree, logs a warning and skips that component (so the rest of the mission
   * stays playable).
   *
   * @param cfg - Attachment configuration.
   */
  attach(cfg: SatelliteRepairControllerConfig): void {
    this.cfg = cfg
    const brokenList = cfg.minigame.brokenComponents
    const validation = validateManifest(cfg.poiObject, brokenList)
    if (!validation.ok) {
      console.warn('[SatelliteRepairController] Missing components on POI:', validation.missing)
    }
    for (const name of validation.found) {
      const source = cfg.poiObject.getObjectByName(name)
      if (!source) continue
      const wireframe = this.buildWireframe(source)
      source.add(wireframe)
      const worldBounds = new THREE.Box3()
      source.updateMatrixWorld(true)
      worldBounds.setFromObject(source)
      this.components.push({
        name,
        source,
        wireframe,
        worldBounds,
        fading: false,
        scienceHitsRemaining: SCIENCE_REPAIR_HITS_PER_COMPONENT,
      })
      this.setWireframeProgressColor(wireframe, SCIENCE_REPAIR_HITS_PER_COMPONENT)
    }
  }

  /**
   * No per-frame work — repair is multitool projectiles. Map view still calls
   * this so the contract matches other in-scene EVA drivers.
   */
  tick(_dt: number): void {
    void _dt
  }

  /**
   * Map EVA science bolt: first AABB along the segment wins one repair step.
   *
   * @param from - Previous bolt position, world space.
   * @param to - Current bolt position, world space.
   * @param outEntry - First hit point on the box, for impact VFX.
   * @returns True when a bolt should be consumed.
   */
  tryScienceRepairSegment(from: THREE.Vector3, to: THREE.Vector3, outEntry: THREE.Vector3): boolean {
    if (!this.cfg) return false
    let best: DamagedComponent | null = null
    let bestDistSq = Number.POSITIVE_INFINITY
    for (const c of this.components) {
      if (c.fading) continue
      const b = c.worldBounds
      if (b.isEmpty()) continue
      if (!segmentIntersectsAabb3(from, to, b.min, b.max, this._hitScratch)) continue
      const d = this._hitScratch.distanceToSquared(from)
      if (d < bestDistSq) {
        bestDistSq = d
        best = c
        outEntry.copy(this._hitScratch)
      }
    }
    if (!best) return false
    this.applyScienceHit(best)
    return true
  }

  /**
   * One science impact: decrement HP, refresh wireframe, or start completion.
   */
  private applyScienceHit(c: DamagedComponent): void {
    if (!this.cfg || c.fading) return
    c.scienceHitsRemaining = Math.max(0, c.scienceHitsRemaining - 1)
    if (c.scienceHitsRemaining > 0) {
      this.setWireframeProgressColor(c.wireframe, c.scienceHitsRemaining)
      return
    }
    c.fading = true
    this.setWireframeColor(c.wireframe, REPAIR_COMPLETE_COLOR)
    this.cfg.onComponentFullyRepaired?.(c.name)
    const name = c.name
    const wireframeRef = c.wireframe
    Timer.after(REPAIR_HOLD_SECONDS, () => {
      if (wireframeRef.parent) wireframeRef.parent.remove(wireframeRef)
      if (this.cfg) this.cfg.minigame.markRepaired(name)
    })
  }

  /**
   * Wireframe tint from remaining science hits (3=red, 2=orange, 1=lime).
   */
  private setWireframeProgressColor(wireframe: THREE.Object3D, hitsRemaining: number): void {
    if (hitsRemaining >= 3) {
      this.setWireframeColor(wireframe, DAMAGE_WIREFRAME_COLOR)
    } else if (hitsRemaining === 2) {
      this.setWireframeColor(wireframe, AIM_ORANGE)
    } else {
      this.setWireframeColor(wireframe, ALMOST_REPAIRED_WIREFRAME_COLOR)
    }
  }

  /**
   * Detach and dispose every overlay. Safe to call multiple times.
   */
  dispose(): void {
    this.cfg?.onAimPromptChange?.(null)
    for (const c of this.components) {
      if (c.wireframe.parent) c.wireframe.parent.remove(c.wireframe)
      this.disposeObject(c.wireframe)
    }
    this.components = []
    this.cfg = null
  }

  /**
   * Walk `source`, clone each mesh, swap in a red wireframe material, and
   * return the group. Transforms follow because the group is parented to
   * `source` at attach time.
   */
  private buildWireframe(source: THREE.Object3D): THREE.Object3D {
    const group = new THREE.Group()
    source.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return
      const mesh = obj as THREE.Mesh
      const clone = new THREE.Mesh(
        mesh.geometry,
        new THREE.MeshBasicMaterial({
          color: DAMAGE_WIREFRAME_COLOR,
          wireframe: true,
          transparent: true,
          opacity: WIREFRAME_OPACITY,
          depthTest: true,
          depthWrite: false,
        }),
      )
      clone.matrixAutoUpdate = false
      mesh.updateWorldMatrix(true, false)
      source.updateWorldMatrix(true, false)
      const inv = new THREE.Matrix4().copy(source.matrixWorld).invert()
      clone.matrix.multiplyMatrices(inv, mesh.matrixWorld)
      group.add(clone)
    })
    return group
  }

  private setWireframeColor(wireframe: THREE.Object3D, hex: number): void {
    wireframe.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.color.setHex(hex)
    })
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) {
        const mat = mesh.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else if (mat) mat.dispose()
      }
    })
  }
}
