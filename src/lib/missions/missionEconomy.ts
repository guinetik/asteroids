/**
 * Shared mission credit tiers — keeps EVA, planetary shuttle cargo, and asteroid
 * belt contracts in a consistent order after economy tuning.
 *
 * @author guinetik
 * @date 2026-05-05
 * @spec docs/superpowers/specs/2026-05-04-active-missions-tracker-design.md
 */

/** Lowest payout among authored planetary shuttle missions (`data/shuttle-missions/*.json`). */
export const SHUTTLE_PLANETARY_MIN_REWARD_CR = 2500

/**
 * Credit multiplier baked into offered/generated mission templates (shuttle cargo,
 * mining board, asteroid belt totals).
 */
export const GLOBAL_MISSION_PAY_MULTIPLIER = 1.2

/**
 * Extra payout factor for EVA missions, stacked inside {@link computeScaledEvaReward}
 * after distance scaling (see `shuttleMissionSession.ts`).
 */
export const EVA_MISSION_PAY_MULTIPLIER = 1.25

/**
 * Hard cap on EVA payouts after distance scaling — before {@link GLOBAL_MISSION_PAY_MULTIPLIER}
 * and {@link EVA_MISSION_PAY_MULTIPLIER} are applied in EVA offer math.
 */
export const EVA_MAX_PAYOUT_CR = 2700

/** Generated asteroid missions floor here — always above planetary shuttle baseline. */
export const MIN_ASTEROID_MISSION_REWARD = 5000
