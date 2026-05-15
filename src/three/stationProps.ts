/**
 * Runtime prop registry for the station-interior level.
 *
 * Room specs declare in-room props via `RoomPropSpec` (kind + local XZ +
 * yaw + scale). The {@link StationBuilder} resolves each entry through
 * {@link createStationProp} below, which dispatches on the prop kind to
 * the matching Three.js model class.
 *
 * Keeping the registry out of the layout-math layer means
 * `StationLayout.ts` stays Three.js-free, and new prop kinds register by
 * adding one entry here without touching the builder.
 *
 * @author guinetik
 * @date 2026-05-14
 * @spec docs/space-station-update-gdd.md
 */
import type { Group } from 'three'
import {
  StationTerminalModel,
  STATION_TERMINAL_BASE_HALF_X,
  STATION_TERMINAL_BASE_HALF_Z,
} from '@/three/StationTerminalModel'
import {
  StationPowerGenModel,
  STATION_POWERGEN_BASE_HALF_X,
  STATION_POWERGEN_BASE_HALF_Z,
} from '@/three/StationPowerGenModel'
import { FurniturePackProp } from '@/three/FurniturePackProp'
import { WallStationModel, type WallStationVariant } from '@/three/WallStationModel'
import { BunkerChestModel } from '@/three/bunker/BunkerChestModel'
import { ITEM_CATALOG } from '@/lib/inventory/catalog'
import { getScienceHealingMultiplier } from '@/lib/fps/scienceHealing'
// Side-effect: registers trade-good item definitions into ITEM_CATALOG
// so `rollTradeableReward` can sample from them.
import '@/lib/shop/tradeGoods'
import type { RewardSpec } from '@/lib/station/StationLayout'

/**
 * Default uniform scale applied to {@link StationTerminalModel} when used
 * as a station-interior prop. The GLB ships at human kiosk scale (~1.84 m
 * tall) so it slots into a 3 m room near 1:1; this leaves a knob for fine
 * tuning if rooms shrink.
 */
const TERMINAL_INTERIOR_SCALE = 1

/** Uniform scale applied to `BunkerChestModel` when used as a station prop. */
const CHEST_INTERIOR_SCALE = 0.35

/**
 * Default uniform scale for {@link StationPowerGenModel}. Native GLB is
 * ~0.73 m tall — at scale 2.5 it reads as a chunky waist-to-shoulder
 * industrial generator inside a 2×2 tile (≈ 7.7 m) room without
 * crowding the entrance.
 */
const POWERGEN_INTERIOR_SCALE = 2.5

/**
 * Target longest visible dimension for the furniture-pack `box`
 * crate, in metres. The loader auto-scales the GLB so its longest
 * axis matches this — small storage crate, knee-high.
 */
const BOX_TARGET_LONGEST = 0.6

/** Half-extent along X for the box's collision footprint. */
const BOX_HALF_X = 0.3

/** Half-extent along Z for the box's collision footprint. */
const BOX_HALF_Z = 0.3

/**
 * Target longest visible dimension for the furniture-pack `table`,
 * in metres. Reads as a small office desk rather than a banquet.
 */
const TABLE_TARGET_LONGEST = 1.9

/**
 * Half-extent along X for the table's collision footprint. Source
 * aspect is ~30:32 on X:Z, so at 1.9 m longest the X side is ~1.78 m
 * → 0.89 m half-extent.
 */
const TABLE_HALF_X = 0.89

/** Half-extent along Z for the table's collision footprint. */
const TABLE_HALF_Z = 0.95

/** Half-extents of the crate body at native scale (matches `DepositCrateModel`). */
const CHEST_NATIVE_HALF_WIDTH = 2.3
/** Half-depth of the crate body at native scale. */
const CHEST_NATIVE_HALF_DEPTH = 1.5

/** Terminal screen colour per status. Drives the emissive panel hex. */
const TERMINAL_STATUS_COLOR: Readonly<Record<PropStatus, number>> = {
  idle: 0x00ffcc,
  success: 0x66ff66,
  warning: 0xeab308,
  error: 0xef4444,
}

/**
 * Generic interaction status for a station prop. Maps to colour / SFX /
 * UI cues across prop kinds so the player gets consistent feedback
 * regardless of which prop they used.
 */
export type PropStatus = 'idle' | 'success' | 'warning' | 'error'

/**
 * Half-extents of a prop's lateral collision footprint, measured in the
 * prop's local frame BEFORE the placement scale is applied. The builder
 * folds in the placement scale + the prop's yaw + the room's yaw to
 * produce a world-space `StationRect` the player's lateral movement is
 * resolved against.
 */
export interface PropLocalFootprint {
  /** Half-extent along the prop's local X (before scaling). */
  halfX: number
  /** Half-extent along the prop's local Z (before scaling). */
  halfZ: number
}

/**
 * Runtime instance returned by the registry. Mirrors the shape the
 * station controller already uses for ticking + cleanup.
 */
export interface StationPropInstance {
  /** Scene group to attach under the room wrapper. */
  group: Group
  /** Optional per-frame tick. Called by the controller. */
  tick?: (dt: number) => void
  /** Free GPU resources when the station unloads. */
  dispose: () => void
  /**
   * Optional lateral collision footprint. Omit for decorative props the
   * player can walk through. Builder converts this to a world-space
   * blocker rect at station-load time.
   */
  localFootprint?: PropLocalFootprint
  /**
   * Optional setter for the prop's visual status (e.g. terminal screen
   * colour). Controller drives this when the interactor is consumed,
   * fired with a warning step, etc.
   */
  setStatus?: (status: PropStatus) => void
  /**
   * Optional diegetic-UI hook: mount the given `<canvas>` as a texture
   * on the prop's screen (terminal). No-op for props without a screen.
   */
  showMap?: (canvas: HTMLCanvasElement) => void
  /** Companion to {@link showMap} — hide / restore the prop's idle screen. */
  hideMap?: () => void
  /**
   * Optional handle for props that participate in the SCI-bolt repair
   * flow (currently only `'powergen'`). The host view registers
   * {@link scienceRepair.target} with the projectile system at
   * station-load time and subscribes to {@link scienceRepair.onAllRepaired}
   * to drive "power restored" side-effects (room lights, door unlock).
   */
  scienceRepair?: {
    /**
     * Implements {@link EvaSatelliteServicingScienceBoltTarget} so the
     * existing projectile-system slot can dispatch into the prop.
     */
    target: {
      tryScienceRepairSegment: (
        from: import('three').Vector3,
        to: import('three').Vector3,
        outEntry: import('three').Vector3,
      ) => boolean
    }
    /** Register a callback that fires once when every component is repaired. */
    onAllRepaired: (cb: () => void) => void
    /**
     * Read-only snapshot of per-component repair progress (0 → broken,
     * 1 → restored). Polled by diagnostics terminals; safe to call every
     * frame.
     */
    getComponentProgress: () => Array<{ index: number; progress: number }>
  }
}

/**
 * Instantiate a prop by kind. Unknown kinds throw so authoring typos
 * surface loudly at station-load time.
 *
 * @param kind - Prop kind id from `RoomPropSpec.kind`.
 * @returns Runtime instance the builder positions inside its room.
 * @throws If `kind` is not a registered prop.
 */
export function createStationProp(kind: string): StationPropInstance {
  switch (kind) {
    case 'terminal': {
      const model = new StationTerminalModel()
      model.setScreenEmissive(TERMINAL_STATUS_COLOR.idle)
      return {
        group: model.group,
        tick: (dt) => model.tick(dt),
        dispose: () => model.dispose(),
        localFootprint: {
          halfX: STATION_TERMINAL_BASE_HALF_X,
          halfZ: STATION_TERMINAL_BASE_HALF_Z,
        },
        setStatus: (status) => model.setScreenEmissive(TERMINAL_STATUS_COLOR[status]),
        showMap: (canvas) => model.showMapTexture(canvas),
        hideMap: () => model.hideMapTexture(),
      }
    }
    case 'box': {
      const model = new FurniturePackProp('box', { targetLongest: BOX_TARGET_LONGEST })
      return {
        group: model.group,
        dispose: () => model.dispose(),
        localFootprint: { halfX: BOX_HALF_X, halfZ: BOX_HALF_Z },
      }
    }
    case 'table': {
      const model = new FurniturePackProp('table', { targetLongest: TABLE_TARGET_LONGEST })
      return {
        group: model.group,
        dispose: () => model.dispose(),
        localFootprint: { halfX: TABLE_HALF_X, halfZ: TABLE_HALF_Z },
      }
    }
    case 'powergen': {
      const model = new StationPowerGenModel()
      // Wire the multitool Science Upgrade through as per-shot
      // "inverse damage" — each SCI bolt deducts more from the cell's
      // hit budget, so investing in SCI literally charges the
      // generator faster. Uses the doubled "healing equipment" curve
      // so the repair gameplay feels much punchier than the raw
      // mission-CR multiplier would imply.
      model.setScienceHitMultiplier(getScienceHealingMultiplier())
      return {
        group: model.group,
        tick: (dt) => model.tick(dt),
        dispose: () => model.dispose(),
        localFootprint: {
          halfX: STATION_POWERGEN_BASE_HALF_X,
          halfZ: STATION_POWERGEN_BASE_HALF_Z,
        },
        scienceRepair: {
          target: model,
          onAllRepaired: (cb) => {
            model.onPowerRestored = cb
          },
          getComponentProgress: () => model.getCellProgress(),
        },
      }
    }
    case 'wall_oxygen':
    case 'wall_heal': {
      const variant: WallStationVariant = kind === 'wall_oxygen' ? 'oxygen' : 'heal'
      const model = new WallStationModel(variant)
      return {
        group: model.group,
        dispose: () => model.dispose(),
        // 'success' = freshly used (cooldown, lights off);
        // 'idle' = ready again. Other statuses are no-ops for now.
        setStatus: (status) => model.setLightActive(status !== 'success'),
      }
    }
    case 'chest': {
      const model = new BunkerChestModel()
      return {
        group: model.group,
        dispose: () => model.dispose(),
        localFootprint: {
          halfX: CHEST_NATIVE_HALF_WIDTH,
          halfZ: CHEST_NATIVE_HALF_DEPTH,
        },
        setStatus: (status) => {
          // 'success' flips the chest into its opened/looted visual.
          if (status === 'success' && !model.opened) model.open()
        },
      }
    }
    default:
      throw new Error(`Unknown station prop kind: ${kind}`)
  }
}

/**
 * Default scale for a prop kind when the layout omits `scale`. Lets the
 * registry encode "what scale this model normally wants" in one place
 * rather than baking it into every authored room.
 *
 * @param kind - Prop kind id from `RoomPropSpec.kind`.
 * @returns Default uniform scale.
 */
export function defaultPropScale(kind: string): number {
  switch (kind) {
    case 'terminal':
      return TERMINAL_INTERIOR_SCALE
    case 'box':
      return 1
    case 'table':
      return 1
    case 'chest':
      return CHEST_INTERIOR_SCALE
    case 'powergen':
      return POWERGEN_INTERIOR_SCALE
    case 'wall_oxygen':
    case 'wall_heal':
      return 1
    default:
      return 1
  }
}

/**
 * Metadata attached to a {@link PropInteractor} that the UI can preview
 * before the player presses F. Today the only kind is `'loot'` — a
 * chest's pre-rolled inventory payload.
 */
export type PropInteractorMeta = {
  /** Discriminant for future metadata kinds. */
  kind: 'loot'
  /** Inventory item id the chest contains. */
  itemId: string
  /** Concrete rolled quantity. */
  quantity: number
}

/**
 * Roll one concrete loot payload from a {@link RewardSpec}. Picks a
 * uniformly random item from the pool implied by `spec.type` and a
 * uniformly random quantity in `[qtyMin, qtyMax]`. Returns `null` when
 * the pool is empty (e.g. trade goods module failed to load).
 *
 * @param spec - Authored reward slot.
 * @param exclude - Item ids already picked this session, so multiple
 *   chests in the same room don't roll the same item.
 * @returns Rolled `{itemId, quantity}` or `null` if no candidate exists.
 */
export function rollReward(
  spec: RewardSpec,
  exclude: ReadonlySet<string>,
): { itemId: string; quantity: number } | null {
  if (spec.type !== 'tradeable') return null
  const pool = Object.values(ITEM_CATALOG).filter(
    (item) => item.category === 'trade-good' && !exclude.has(item.id),
  )
  if (pool.length === 0) return null
  const item = pool[Math.floor(Math.random() * pool.length)]!
  const span = Math.max(0, spec.qtyMax - spec.qtyMin)
  const quantity = spec.qtyMin + Math.floor(Math.random() * (span + 1))
  return { itemId: item.id, quantity }
}
