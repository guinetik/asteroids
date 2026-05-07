/**
 * Sushi the cat's needs decay tick — pure functions that advance her
 * affection and hunger meters with elapsed real time.
 *
 * The tick runs whenever the player is "in game" (map / habitat / EVA / level)
 * regardless of which scene is active. Bowl, feeding, and cat AI behaviors
 * live in later phases; this module only ages the persisted scalars.
 *
 * @author guinetik
 * @date 2026-05-07
 * @spec docs/superpowers/specs/2026-04-03-player-profile-design.md
 */
import type { PlayerProfile } from '@/lib/player/types'
import { addSushiBladder, addSushiHunger, addSushiLove } from '@/lib/player/profile'

/** Seconds per minute, used to convert per-minute decay rates to per-tick deltas. */
export const SUSHI_SECONDS_PER_MINUTE = 60

/**
 * Hunger units added per minute of elapsed real time. Twice the love decay rate so
 * Sushi gets hungry roughly twice as fast as he gets needy — a freshly-fed cat
 * reaches the eating threshold in well under 10 minutes, prompting the player to
 * keep his bowl topped up between missions.
 */
export const SUSHI_HUNGER_RISE_PER_MIN = 8

/**
 * Love units removed per minute of elapsed real time. With a 0..100 meter this
 * means an idle Sushi drops from full affection to indifferent (love hits the
 * needy threshold) in roughly 25 minutes — long enough to play through a few
 * missions, short enough that he asks for attention each session.
 */
export const SUSHI_LOVE_DECAY_PER_MIN = 4

/**
 * Bladder units added per minute of elapsed real time. With a 0..100 meter and a
 * threshold of 70, this triggers a litterbox visit roughly every 35 minutes from
 * empty — slower than hunger so the two needs don't always fire at once.
 */
export const SUSHI_BLADDER_RISE_PER_MIN = 2

/**
 * Advance Sushi's love and hunger meters by `dtSeconds` of real time. Hunger
 * climbs and love decays at their per-minute rates; both clamp to the
 * `[SUSHI_NEEDS_MIN, SUSHI_NEEDS_MAX]` interval enforced by the profile helpers.
 *
 * Pure: returns a new profile (or the same reference when nothing changed).
 *
 * @param profile - Current player profile.
 * @param dtSeconds - Elapsed seconds since the previous tick. Non-finite or
 *   non-positive values return the input profile unchanged.
 * @returns Updated profile with decayed love and risen hunger.
 */
export function tickSushiNeeds(profile: PlayerProfile, dtSeconds: number): PlayerProfile {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return profile
  const minutes = dtSeconds / SUSHI_SECONDS_PER_MINUTE
  const hungerDelta = SUSHI_HUNGER_RISE_PER_MIN * minutes
  const loveDelta = -SUSHI_LOVE_DECAY_PER_MIN * minutes
  const bladderDelta = SUSHI_BLADDER_RISE_PER_MIN * minutes
  let next = profile
  next = addSushiHunger(next, hungerDelta)
  next = addSushiLove(next, loveDelta)
  next = addSushiBladder(next, bladderDelta)
  return next
}
