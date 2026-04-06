/**
 * Player profile operations.
 *
 * Pure functions for creating, loading, saving, and updating player
 * profiles. All update functions return new profile objects — they
 * never mutate the input. localStorage is the only side effect,
 * isolated to saveProfile/loadProfile.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-player-profile-design.md
 */
import type { PlayerProfile } from './types'

/** localStorage key for the player profile. */
export const PROFILE_STORAGE_KEY = 'asteroid-lander-profile'

/** Starting credits for a new player. */
const STARTING_CREDITS = 1000

/** Create a fresh profile with starting credits. */
export function createProfile(name: string): PlayerProfile {
  return {
    name,
    credits: STARTING_CREDITS,
    completedMissionCount: 0,
    visitedAsteroids: {},
  }
}

/** Serialize and save the profile to localStorage. */
export function saveProfile(profile: PlayerProfile): void {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
}

/** Load the profile from localStorage. Returns null if missing or corrupted. */
export function loadProfile(): PlayerProfile | null {
  const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as PlayerProfile
  } catch {
    return null
  }
}

/** Return a new profile with credits increased by the given amount. */
export function addCredits(profile: PlayerProfile, amount: number): PlayerProfile {
  return { ...profile, credits: profile.credits + amount }
}

/** Return a new profile with credits decreased, or null if insufficient balance. */
export function spendCredits(profile: PlayerProfile, amount: number): PlayerProfile | null {
  if (profile.credits < amount) return null
  return { ...profile, credits: profile.credits - amount }
}

/** Return a new profile with completedMissionCount incremented by 1. */
export function recordMissionComplete(profile: PlayerProfile): PlayerProfile {
  return { ...profile, completedMissionCount: profile.completedMissionCount + 1 }
}

/** Return a new profile with the visit count for the given asteroid incremented by 1. */
export function recordAsteroidVisit(profile: PlayerProfile, asteroidId: string): PlayerProfile {
  const currentCount = profile.visitedAsteroids[asteroidId] ?? 0
  return {
    ...profile,
    visitedAsteroids: {
      ...profile.visitedAsteroids,
      [asteroidId]: currentCount + 1,
    },
  }
}
