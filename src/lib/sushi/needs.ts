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
import {
  addLitterPollution,
  addSushiBladder,
  addSushiHunger,
  addSushiLove,
  addSushiTired,
  LITTER_POLLUTION_MAX,
  setBowlServings,
  SUSHI_NEEDS_MAX,
} from '@/lib/player/profile'

/**
 * Hunger restored each time Sushi consumes one serving from the bowl (0..100 scale).
 * Single source of truth for both the in-habitat eating routine (see {@link MapHabitatFacade})
 * and the off-screen autonomy helper {@link tryAutoEat}.
 */
export const SUSHI_HUNGER_RESTORE_PER_SERVING = 25

/**
 * Hunger threshold at or below which Sushi prioritises eating from the bowl.
 * Matches the in-habitat behaviour in {@link CatController} and the HUD prompt
 * threshold in {@link MapView} so off-screen autonomy fires on the same trigger
 * that would otherwise show "food bowl is empty".
 */
export const SUSHI_HUNGER_NEEDY_THRESHOLD = 30

/**
 * Bladder threshold at or above which Sushi prioritises a litterbox visit.
 * Matches the in-habitat threshold and the HUD prompt threshold so the off-screen
 * autonomy helper fires on the same trigger that would otherwise show
 * "litterbox is full".
 */
export const SUSHI_BLADDER_FULL_THRESHOLD = 70

/** Seconds per minute, used to convert per-minute decay rates to per-tick deltas. */
export const SUSHI_SECONDS_PER_MINUTE = 60

/**
 * Hunger units removed per minute of passive elapsed time. Hunger semantics match
 * love (100 = full, 0 = starving), so a freshly-fed cat at 75 takes roughly 15
 * minutes to reach the hungry threshold (~30) from idle alone. Laser chases burn
 * extra hunger on top of this baseline (see {@link CatController}).
 */
export const SUSHI_HUNGER_DECAY_PER_MIN = 3

/**
 * Love units removed per minute of elapsed real time. With a 0..100 meter this
 * means an idle Sushi drops from full affection to indifferent (love hits the
 * needy threshold) in roughly 25 minutes — long enough to play through a few
 * missions, short enough that he asks for attention each session.
 */
export const SUSHI_LOVE_DECAY_PER_MIN = 4

/**
 * Bladder units added per minute of elapsed real time. With a 0..100 meter and a
 * threshold of 70, this triggers a litterbox visit roughly every 12 minutes from
 * empty — fast enough that the player actually catches Sushi using the box in a
 * normal habitat session.
 */
export const SUSHI_BLADDER_RISE_PER_MIN = 6

/**
 * Tiredness units added per minute of passive elapsed time. Tuned so a fully-rested
 * cat hits the nap threshold in roughly 50 minutes of idle time even if the player
 * never picks up the laser pointer — chase bursts (see {@link CatController}) layer
 * on top of this baseline.
 */
export const SUSHI_TIRED_RISE_PER_MIN = 2

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
  const hungerDelta = -SUSHI_HUNGER_DECAY_PER_MIN * minutes
  const loveDelta = -SUSHI_LOVE_DECAY_PER_MIN * minutes
  const bladderDelta = SUSHI_BLADDER_RISE_PER_MIN * minutes
  const tiredDelta = SUSHI_TIRED_RISE_PER_MIN * minutes
  let next = profile
  next = addSushiHunger(next, hungerDelta)
  next = addSushiLove(next, loveDelta)
  next = addSushiBladder(next, bladderDelta)
  next = addSushiTired(next, tiredDelta)
  return next
}

/**
 * Off-screen autonomy: if Sushi is hungry and there is food in the bowl, simulate him
 * eating one serving — decrement {@link PlayerProfile.bowlServings} by one and restore
 * {@link SUSHI_HUNGER_RESTORE_PER_SERVING} hunger. Used by {@link MapViewController} as
 * the first response to a hunger-needy state while the player is outside the habitat,
 * so the HUD "food bowl is empty" prompt only fires when the bowl is genuinely empty.
 *
 * Pure: returns a new profile on success, the same reference when no action is possible.
 *
 * @param profile - Current player profile.
 * @returns Updated profile (or unchanged reference) — caller compares identity to know
 *   whether autonomy succeeded.
 */
export function tryAutoEat(profile: PlayerProfile): PlayerProfile {
  if (profile.sushiHunger > SUSHI_HUNGER_NEEDY_THRESHOLD) return profile
  if (profile.bowlServings <= 0) return profile
  let next = setBowlServings(profile, profile.bowlServings - 1)
  next = addSushiHunger(next, SUSHI_HUNGER_RESTORE_PER_SERVING)
  return next
}

/**
 * Off-screen autonomy: if Sushi's bladder is full and the litterbox has capacity, simulate
 * him using it — reset bladder to zero and bump {@link PlayerProfile.litterPollution} by
 * one chunk. Used by {@link MapViewController} as the first response to a bladder-full
 * state while the player is outside the habitat, so the HUD "litterbox is full" prompt
 * only fires when the box itself is also at capacity.
 *
 * Pure: returns a new profile on success, the same reference when no action is possible.
 *
 * @param profile - Current player profile.
 * @returns Updated profile (or unchanged reference).
 */
export function tryAutoLitter(profile: PlayerProfile): PlayerProfile {
  if (profile.sushiBladder < SUSHI_BLADDER_FULL_THRESHOLD) return profile
  if (profile.litterPollution >= LITTER_POLLUTION_MAX) return profile
  let next = addSushiBladder(profile, -SUSHI_NEEDS_MAX)
  next = addLitterPollution(next, 1)
  return next
}
