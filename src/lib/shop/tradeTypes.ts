/**
 * Trade economy type definitions.
 *
 * Data model for planet-specific trade goods, demand entries,
 * and shop session state. Used by the shop session system,
 * demand pricing, and Vue shop components.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-planet-shop-system-design.md
 */

/** A trade good produced by a specific planet. */
export interface TradeGoodDefinition {
  /** Unique key, e.g. "heat-resistant-alloys". */
  id: string
  /** Display name for UI. */
  label: string
  /** Flavor text hinting at who wants this good. */
  description: string
  /** Filename in public/images/items/, e.g. "heat-resistant-alloys.png". */
  icon: string
  /** Weight in kg per unit. */
  weightPerUnit: number
  /** Max units in one inventory stack. */
  maxStack: number
  /** Credits charged at the producing planet. */
  basePrice: number
  /** Planet id that produces this good. */
  producedBy: string
}

/** A single demand entry: one planet wants one good at a base multiplier. */
export interface DemandEntry {
  /** Trade good id. */
  itemId: string
  /** Base demand multiplier before variance (1.5–4.0). */
  multiplier: number
}

/** Per-planet demand list loaded from JSON. */
export interface PlanetDemand {
  /** Planet id. */
  planetId: string
  /** Goods this planet wants. */
  demands: DemandEntry[]
}

/** A trade good slot in the shop with current stock. */
export interface TradeGoodSlot {
  /** Trade good id. */
  itemId: string
  /** Units currently in stock. */
  stock: number
  /** Credits per unit at this planet (discounted from catalog base at the source). */
  price: number
  /** True when this slot is imported from another planet. */
  isImported?: boolean
  /** Origin planet for imported slots. */
  originPlanetId?: string
}

/** Restock timer state. */
export interface RestockTimer {
  /** Seconds remaining until restock. */
  remaining: number
  /** Total duration of this restock cycle in seconds. */
  total: number
}

/** Full shop session for one planet visit. */
export interface ShopSession {
  /** Planet id this shop belongs to. */
  planetId: string
  /** Currently displayed trade good slots (3 random for most planets; full pool on Venus). */
  tradeSlots: TradeGoodSlot[]
  /** Restock countdown. Null when stock is available and timer hasn't started. */
  restockTimer: RestockTimer | null
  /** Whether all currently displayed trade slots are sold out. */
  allSoldOut: boolean
  /**
   * Number of bribe-restocks performed this session (per port arrival).
   * Drives the doubling cost: `BRIBE_BASE_COST * 2^bribeCount`.
   * Resets to 0 when a fresh session is created on the next orbit entry.
   */
  bribeCount: number
}

/** Result of a shop refuel action. */
export interface RefuelResult {
  /** Whether the refuel succeeded. */
  ok: boolean
  /** Reason for failure. */
  reason?: string
}
