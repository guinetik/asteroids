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
  TerminalModel,
  TERMINAL_BASE_DEPTH,
  TERMINAL_BASE_WIDTH,
} from '@/three/TerminalModel'
import { BunkerChestModel } from '@/three/bunker/BunkerChestModel'
import { ITEM_CATALOG } from '@/lib/inventory/catalog'
// Side-effect: registers trade-good item definitions into ITEM_CATALOG
// so `rollTradeableReward` can sample from them.
import '@/lib/shop/tradeGoods'
import type { RewardSpec } from '@/lib/station/StationLayout'

/**
 * Default uniform scale applied to {@link TerminalModel} when used as a
 * station-interior prop. The outdoor terminal is sized for EVA flat
 * zones (~16 m tall) — at interior wall-height (~3 m) we need to shrink
 * it dramatically so it reads as a kiosk in the room.
 */
const TERMINAL_INTERIOR_SCALE = 0.12

/** Uniform scale applied to `BunkerChestModel` when used as a station prop. */
const CHEST_INTERIOR_SCALE = 0.35

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
      const model = new TerminalModel()
      model.setScreenEmissive(TERMINAL_STATUS_COLOR.idle)
      return {
        group: model.group,
        tick: (dt) => model.tick(dt),
        dispose: () => model.dispose(),
        localFootprint: {
          halfX: TERMINAL_BASE_WIDTH / 2,
          halfZ: TERMINAL_BASE_DEPTH / 2,
        },
        setStatus: (status) => model.setScreenEmissive(TERMINAL_STATUS_COLOR[status]),
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
    case 'chest':
      return CHEST_INTERIOR_SCALE
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
