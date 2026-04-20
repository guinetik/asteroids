/**
 * Shared mission credit tiers — keeps EVA, planetary shuttle cargo, and asteroid
 * belt contracts in a consistent order after economy tuning.
 *
 * @author guinetik
 */

/** Lowest payout among authored planetary shuttle missions (`data/shuttle-missions/*.json`). */
export const SHUTTLE_PLANETARY_MIN_REWARD_CR = 2500

/**
 * Hard cap on EVA payouts after distance scaling — strictly below {@link SHUTTLE_PLANETARY_MIN_REWARD_CR}
 * so local spacewalk jobs never beat the cheapest cargo run on the board.
 */
export const EVA_MAX_PAYOUT_CR = 2250

/** Generated asteroid missions floor here — always above planetary shuttle baseline. */
export const MIN_ASTEROID_MISSION_REWARD = 5000
