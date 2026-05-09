/**
 * Tunable constants for the arcade-cabinet Asteroids simulation.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-arcade-asteroids-design.md
 */

/** Number of lives granted at the start of a run. */
export const ASTEROIDS_STARTING_LIVES = 3

/** Immutable configuration for the classic Asteroids ruleset. */
export const ASTEROIDS_GAME_CONFIG = {
  initialAsteroidCount: 4,
  maxAsteroidsPerWave: 9,
  shipRadius: 12,
  shipTurnRadiansPerSecond: 4.4,
  shipThrustPixelsPerSecond: 220,
  shipDragPerSecond: 0.992,
  shipInvulnerableSeconds: 2.2,
  shipRespawnSeconds: 1.3,
  bulletRadius: 2,
  bulletSpeed: 520,
  bulletLifetimeSeconds: 1.15,
  fireCooldownSeconds: 0.22,
  asteroidRadii: {
    large: 42,
    medium: 25,
    small: 14,
  },
  asteroidScores: {
    large: 20,
    medium: 50,
    small: 100,
  },
  asteroidBaseSpeed: {
    large: 44,
    medium: 74,
    small: 108,
  },
  asteroidVertexCount: 12,
  asteroidVertexJitter: 0.28,
  splitChildCount: 2,
  saucerRadius: {
    large: 18,
    small: 12,
  },
  saucerScore: {
    large: 200,
    small: 1000,
  },
  saucerSpeed: {
    large: 72,
    small: 108,
  },
  saucerFireIntervalSeconds: 1.1,
  saucerBulletSpeed: 280,
  saucerBulletLifetimeSeconds: 2.2,
  saucerFirstSpawnSeconds: 8,
  saucerSpawnIntervalSeconds: 16,
  smallSaucerWave: 3,
  hyperspaceCooldownSeconds: 1.2,
  hyperspaceDeathChance: 0.12,
} as const
