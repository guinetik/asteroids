/**
 * Shared presentation math for FPS/EVA damage, hypoxia, death, and fall feedback.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */

/**
 * Horizontal impulse vector applied to the player after a hit.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
export interface FpsKnockbackVector {
  /** World-space X impulse component. */
  x: number
  /** World-space Z impulse component. */
  z: number
}

/**
 * Damage flash state after advancing one frame.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
export interface DamageFlashState {
  /** Remaining flash timer in seconds. */
  timer: number
  /** Normalized opacity in the `[0, 1]` range. */
  opacity: number
}

/**
 * Configuration for non-lethal EVA fall damage.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface NonLethalFallDamageConfig {
  /** Impact speed threshold below which no damage is dealt. */
  safeSpeed: number
  /** HP lost per unit/s beyond the safe threshold. */
  damagePerUnit: number
  /** Hard cap on a single fall-damage event. */
  maxDamage: number
  /** Minimum HP the player must have after the fall resolves. */
  minHpAfter: number
}

/**
 * Death-presentation state for the current frame.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface DeathPresentationState {
  /** Updated camera pitch after one frame of the death animation. */
  pitch: number
  /** Fade-to-black opacity in the `[0, 1]` range. */
  fadeOpacity: number
  /** Whether the death message should be shown yet. */
  showMessage: boolean
}

/**
 * Compute a knockback vector that pushes the player away from the damage source.
 *
 * @param playerX - Player world X.
 * @param playerZ - Player world Z.
 * @param sourceX - Damage-source world X.
 * @param sourceZ - Damage-source world Z.
 * @param magnitude - Desired impulse strength.
 * @returns Knockback vector, or `null` when source and player overlap.
 */
export function computeKnockbackAwayFromSource(
  playerX: number,
  playerZ: number,
  sourceX: number,
  sourceZ: number,
  magnitude: number,
): FpsKnockbackVector | null {
  const dx = playerX - sourceX
  const dz = playerZ - sourceZ
  const distance = Math.sqrt(dx * dx + dz * dz)
  if (distance <= 0.01) return null

  return {
    x: (dx / distance) * magnitude,
    z: (dz / distance) * magnitude,
  }
}

/**
 * Compute the screen-space relative angle for a damage indicator.
 *
 * @param playerX - Player world X.
 * @param playerZ - Player world Z.
 * @param sourceX - Damage-source world X.
 * @param sourceZ - Damage-source world Z.
 * @param cameraYaw - Current camera yaw in radians.
 * @returns Relative angle in radians where `0` is straight ahead.
 */
export function computeRelativeDamageAngle(
  playerX: number,
  playerZ: number,
  sourceX: number,
  sourceZ: number,
  cameraYaw: number,
): number {
  const worldAngle = Math.atan2(sourceX - playerX, sourceZ - playerZ)
  return worldAngle - cameraYaw
}

/**
 * Advance the damage-flash timer and derive the current opacity.
 *
 * @param timer - Remaining flash timer in seconds.
 * @param dt - Frame delta in seconds.
 * @param duration - Full flash duration in seconds.
 * @returns Updated timer and normalized opacity.
 */
export function stepDamageFlash(timer: number, dt: number, duration: number): DamageFlashState {
  const nextTimer = Math.max(0, timer - dt)
  if (nextTimer <= 0 || duration <= 0) {
    return { timer: 0, opacity: 0 }
  }
  return {
    timer: nextTimer,
    opacity: Math.max(0, Math.min(1, nextTimer / duration)),
  }
}

/**
 * Compute the hypoxia vignette opacity for the current frame.
 *
 * @param o2Level - Current oxygen level.
 * @param hp - Current player HP.
 * @param maxHp - Maximum player HP.
 * @param timeSeconds - Monotonic time in seconds.
 * @returns Vignette opacity in the `[0, 1]` range.
 */
export function computeHypoxiaFadeOpacity(
  o2Level: number,
  hp: number,
  maxHp: number,
  timeSeconds: number,
): number {
  if (o2Level > 0 || maxHp <= 0) return 0

  const hpRatio = Math.max(0, Math.min(1, hp / maxHp))
  const baseFade = (1 - hpRatio) * 0.7
  const pulseSpeed = 2 + (1 - hpRatio) * 4
  const pulse = Math.sin(timeSeconds * pulseSpeed * Math.PI * 2)
  const pulseAmount = 0.08 + (1 - hpRatio) * 0.12

  return Math.max(0, Math.min(1, baseFade + pulse * pulseAmount))
}

/**
 * Compute the current state of the death pitch/fade/message presentation.
 *
 * @param pitch - Current camera pitch in radians.
 * @param dt - Frame delta in seconds.
 * @param stateTime - Time spent in the death state in seconds.
 * @param pitchSpeed - Pitch-down speed in radians per second.
 * @param targetPitch - Pitch target for the death animation.
 * @param fadeDuration - Time to full black in seconds.
 * @param messageDelay - Time before showing the death message in seconds.
 * @returns Updated death presentation state.
 */
export function computeDeathPresentationState(
  pitch: number,
  dt: number,
  stateTime: number,
  pitchSpeed: number,
  targetPitch: number,
  fadeDuration: number,
  messageDelay: number,
): DeathPresentationState {
  const nextPitch = pitch > targetPitch ? pitch - pitchSpeed * dt : pitch
  return {
    pitch: nextPitch,
    fadeOpacity: Math.max(0, Math.min(1, fadeDuration > 0 ? stateTime / fadeDuration : 1)),
    showMessage: stateTime >= messageDelay,
  }
}

/**
 * Compute non-lethal fall damage from an impact speed.
 *
 * @param impactSpeed - Vertical impact speed magnitude.
 * @param currentHp - Player HP before damage.
 * @param config - Tuning config for the fall-damage curve.
 * @returns Final damage to apply, clamped so the player survives.
 */
export function computeNonLethalFallDamage(
  impactSpeed: number,
  currentHp: number,
  config: NonLethalFallDamageConfig,
): number {
  if (impactSpeed <= config.safeSpeed) return 0

  const overshoot = impactSpeed - config.safeSpeed
  const rawDamage = Math.min(overshoot * config.damagePerUnit, config.maxDamage)
  const survivableDamage = Math.max(0, currentHp - config.minHpAfter)

  return Math.min(rawDamage, survivableDamage)
}
