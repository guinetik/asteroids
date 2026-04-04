import { GridHelper } from 'three'

const GRID_SIZE = 2000
const GRID_DIVISIONS = 40
const GRID_COLOR_CENTER = 0x333366
const GRID_COLOR_LINE = 0x1a1a33

/**
 * Flat wireframe grid on the XZ plane representing the navigable space.
 * The shuttle and all game objects move along this equator plane.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class SpaceTimeGrid {
  readonly grid: GridHelper

  constructor() {
    this.grid = new GridHelper(GRID_SIZE, GRID_DIVISIONS, GRID_COLOR_CENTER, GRID_COLOR_LINE)
  }

  dispose(): void {
    this.grid.geometry.dispose()
    this.grid.material.dispose()
  }
}
