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

/** Display name used when the player submits empty whitespace (matches legacy map default). */
export const DEFAULT_PLAYER_DISPLAY_NAME = 'Pilot'

/** Upper bound for saved display name length after {@link normalizePlayerDisplayName}. */
export const MAX_PLAYER_DISPLAY_NAME_LENGTH = 48

/**
 * Trim input and enforce max length. Blank input becomes {@link DEFAULT_PLAYER_DISPLAY_NAME}.
 *
 * @param raw - Text from the name field (may include surrounding whitespace).
 * @returns The string stored on {@link PlayerProfile.name}.
 */
export function normalizePlayerDisplayName(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return DEFAULT_PLAYER_DISPLAY_NAME
  return trimmed.length <= MAX_PLAYER_DISPLAY_NAME_LENGTH
    ? trimmed
    : trimmed.slice(0, MAX_PLAYER_DISPLAY_NAME_LENGTH)
}

/**
 * Copy of the profile with {@link PlayerProfile.name} set from raw input.
 *
 * @param profile - Current profile.
 * @param raw - Same as {@link normalizePlayerDisplayName}.
 */
export function withPlayerDisplayName(profile: PlayerProfile, raw: string): PlayerProfile {
  return { ...profile, name: normalizePlayerDisplayName(raw) }
}

/**
 * Load or create a profile, apply the display name, and persist to localStorage.
 * Updating an existing save keeps credits and all other fields unchanged.
 *
 * @param raw - Text from the home-screen name field.
 * @returns The profile that was written (or would be written if storage is missing).
 */
export function savePlayerDisplayName(raw: string): PlayerProfile {
  const name = normalizePlayerDisplayName(raw)
  if (typeof localStorage === 'undefined') {
    return createProfile(name)
  }
  const existing = loadProfile()
  const profile = existing ? { ...existing, name } : createProfile(name)
  saveProfile(profile)
  return profile
}

/**
 * Validate and migrate JSON from localStorage into {@link PlayerProfile}.
 *
 * @param data - Parsed JSON value.
 * @returns A profile, or null if the shape is invalid.
 */
function normalizeLoadedProfile(data: unknown): PlayerProfile | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null
  const p = data as Partial<PlayerProfile>
  if (typeof p.name !== 'string' || typeof p.credits !== 'number') return null

  const completedMissionCount = typeof p.completedMissionCount === 'number' ? p.completedMissionCount : 0
  let visitedAsteroids: Record<string, number> = {}
  if (
    p.visitedAsteroids !== undefined
    && p.visitedAsteroids !== null
    && typeof p.visitedAsteroids === 'object'
    && !Array.isArray(p.visitedAsteroids)
  ) {
    visitedAsteroids = p.visitedAsteroids as Record<string, number>
  }

  /**
   * Saves written before `hasSeenIntro` existed are treated as already onboarded so existing
   * players are not forced through the intro again.
   */
  const hasSeenIntro = typeof p.hasSeenIntro === 'boolean' ? p.hasSeenIntro : true

  return {
    name: p.name,
    credits: p.credits,
    completedMissionCount,
    visitedAsteroids,
    hasSeenIntro,
  }
}

/** Create a fresh profile with starting credits. */
export function createProfile(name: string): PlayerProfile {
  return {
    name,
    credits: STARTING_CREDITS,
    completedMissionCount: 0,
    visitedAsteroids: {},
    hasSeenIntro: false,
  }
}

/**
 * Return a copy of the profile with {@link PlayerProfile.hasSeenIntro} set to true (map onboarding done).
 *
 * @param profile - Current profile.
 */
export function markMapIntroSeen(profile: PlayerProfile): PlayerProfile {
  return { ...profile, hasSeenIntro: true }
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
    return normalizeLoadedProfile(JSON.parse(raw) as unknown)
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
