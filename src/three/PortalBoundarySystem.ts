/**
 * Manages 4 outbound portal boundary walls at the edges of the SpaceTimeGrid.
 * Walls fade in on proximity and trigger departure when crossed.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-portal-boundary-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { VibeJamParams } from '@/lib/portal'
import { PortalBoundary } from './PortalBoundary'

/** Fraction of the grid half-size at which walls begin to fade in. */
const WALL_VISIBILITY_FRACTION = 0.25

/** Height of each boundary wall in world units. */
const WALL_HEIGHT = 20

/**
 * Outbound portal boundary system.
 * Creates 4 walls at the grid edges, fades them on proximity, triggers departure on crossing.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-portal-boundary-design.md
 */
export class PortalBoundarySystem implements Tickable {
  private readonly boundaries: PortalBoundary[]
  private readonly halfSize: number
  private readonly shuttlePosition: THREE.Vector3
  private readonly getShuttleState: () => Partial<VibeJamParams>
  private departed = false

  /** Fired once when the shuttle crosses a boundary. */
  onDepart: ((state: Partial<VibeJamParams>) => void) | null = null

  /** All wall meshes — add each to the scene. */
  readonly walls: THREE.LineSegments[]

  constructor(
    gridSize: number,
    shuttlePosition: THREE.Vector3,
    getShuttleState: () => Partial<VibeJamParams>,
  ) {
    this.halfSize = gridSize / 2
    this.shuttlePosition = shuttlePosition
    this.getShuttleState = getShuttleState

    this.boundaries = [
      new PortalBoundary(this.halfSize, 'x', gridSize, WALL_HEIGHT), // east
      new PortalBoundary(-this.halfSize, 'x', gridSize, WALL_HEIGHT), // west
      new PortalBoundary(this.halfSize, 'z', gridSize, WALL_HEIGHT), // south
      new PortalBoundary(-this.halfSize, 'z', gridSize, WALL_HEIGHT), // north
    ]

    this.walls = this.boundaries.map((b) => b.mesh)
  }

  /** Update wall opacities and check for boundary crossing each frame. */
  tick(_dt: number): void {
    if (this.departed) return

    for (const boundary of this.boundaries) {
      const distance =
        boundary.axis === 'x'
          ? Math.abs(this.shuttlePosition.x - boundary.wallPosition)
          : Math.abs(this.shuttlePosition.z - boundary.wallPosition)

      boundary.updateOpacity(distance, this.halfSize * WALL_VISIBILITY_FRACTION)
    }

    // Check crossing on both axes
    const x = this.shuttlePosition.x
    const z = this.shuttlePosition.z
    if (
      x > this.halfSize ||
      x < -this.halfSize ||
      z > this.halfSize ||
      z < -this.halfSize
    ) {
      this.departed = true
      this.onDepart?.(this.getShuttleState())
    }
  }

  /** Clean up all wall geometries and materials. */
  dispose(): void {
    for (const boundary of this.boundaries) {
      boundary.dispose()
    }
  }
}
