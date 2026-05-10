/**
 * State machine that drives the in-world arcade cabinet. Owns the active ROM,
 * routes per-frame ticks, and gates input.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-09-arcade-cabinet-projection-design.md
 */
import type { ArcadeRomRegistry } from './ArcadeRomRegistry'
import type { ArcadeInputs, ArcadeRom, ArcadeRomStorage, RomMeta } from './types'
import { ARCADE_IDLE_INPUTS } from './types'

/** Cabinet states. See spec §Architecture for transitions. */
export type ArcadeCabinetState = 'idle' | 'engaging' | 'menu' | 'playing' | 'disengaging'

/** Minimal renderer surface the session calls into. */
export interface ArcadeRendererSurface {
  /** Draw the ROM's attract loop. */
  drawAttract(rom: ArcadeRom): void
  /** Draw the boot menu over the ROM's attract loop. */
  drawMenu(rom: ArcadeRom, menu: { entries: ReadonlyArray<RomMeta>; selectedIndex: number }): void
  /** Draw the active ROM run. */
  drawPlay(rom: ArcadeRom): void
}

/** Constructor options. */
export interface ArcadeCabinetSessionOptions {
  /** ROM registry to source factories from. */
  registry: ArcadeRomRegistry
  /** Logical screen width handed to ROMs. */
  width: number
  /** Logical screen height handed to ROMs. */
  height: number
  /** High-score persistence; null disables saves. */
  storage: ArcadeRomStorage | null
  /** Renderer surface (cabinet screen). */
  renderer: ArcadeRendererSurface
}

/**
 * Default first-listed ROM is selected on construction. Caller drives state
 * via engage/completeEngage/menuUp/menuDown/menuConfirm/escape/completeDisengage.
 */
export class ArcadeCabinetSession {
  /** Current state. */
  state: ArcadeCabinetState = 'idle'
  /** Index in registry.list() the menu is highlighting. */
  menuIndex = 0
  /** Held inputs; written by ArcadeCabinetInput. */
  readonly inputs: ArcadeInputs = { ...ARCADE_IDLE_INPUTS }

  private readonly options: ArcadeCabinetSessionOptions
  private readonly catalog: ReadonlyArray<RomMeta>
  private rom: ArcadeRom

  /**
   * Build a session, instantiating the first catalog entry as the default ROM.
   *
   * @param options - Session deps.
   */
  constructor(options: ArcadeCabinetSessionOptions) {
    this.options = options
    this.catalog = options.registry.list()
    if (this.catalog.length === 0) {
      throw new Error('ArcadeCabinetSession: registry has no ROMs')
    }
    const first = this.catalog[0]!
    this.rom = options.registry.create(first.id, {
      width: options.width,
      height: options.height,
      storage: options.storage,
      meta: first,
    })
  }

  /** True while engaged with the cabinet (not idle). */
  isEngaged(): boolean {
    return this.state !== 'idle'
  }

  /** Per-frame update. Routes to the right ROM hook + draw call. */
  tick(dt: number): void {
    if (this.state === 'idle' || this.state === 'engaging' || this.state === 'disengaging') {
      this.rom.attractTick(dt)
      this.options.renderer.drawAttract(this.rom)
      return
    }
    if (this.state === 'menu') {
      this.rom.attractTick(dt)
      this.options.renderer.drawMenu(this.rom, {
        entries: this.catalog,
        selectedIndex: this.menuIndex,
      })
      return
    }
    // playing
    this.rom.tick(dt, this.inputs)
    this.options.renderer.drawPlay(this.rom)
  }

  /** Begin the camera engage; caller drives the camera tween + completeEngage(). */
  engage(): void {
    if (this.state !== 'idle') return
    this.state = 'engaging'
  }

  /** Caller signals camera tween-in finished. */
  completeEngage(): void {
    if (this.state !== 'engaging') return
    this.state = 'menu'
    this.menuIndex = 0
  }

  /** Move menu cursor up (wraps). */
  menuUp(): void {
    if (this.state !== 'menu') return
    this.menuIndex = (this.menuIndex - 1 + this.catalog.length) % this.catalog.length
  }

  /** Move menu cursor down (wraps). */
  menuDown(): void {
    if (this.state !== 'menu') return
    this.menuIndex = (this.menuIndex + 1) % this.catalog.length
  }

  /** Confirm menu selection: rebuild ROM if changed, start the run. */
  menuConfirm(): void {
    if (this.state !== 'menu') return
    const meta = this.catalog[this.menuIndex]!
    this.rom = this.options.registry.create(meta.id, {
      width: this.options.width,
      height: this.options.height,
      storage: this.options.storage,
      meta,
    })
    this.rom.start()
    this.state = 'playing'
  }

  /** ESC handler: playing → menu, menu → disengaging. No-op elsewhere. */
  escape(): void {
    if (this.state === 'playing') {
      this.rom.reset()
      this.state = 'menu'
      return
    }
    if (this.state === 'menu') {
      this.state = 'disengaging'
    }
  }

  /** Caller signals camera tween-out finished. */
  completeDisengage(): void {
    if (this.state !== 'disengaging') return
    this.rom.reset()
    this.state = 'idle'
    Object.assign(this.inputs, ARCADE_IDLE_INPUTS)
  }
}
