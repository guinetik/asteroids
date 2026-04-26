<script setup lang="ts">
/**
 * Radiation exposure HUD banner.
 *
 * Mirrors the {@link GravityWarning} component layout so the two map-view
 * warnings share an idiom: a top-of-screen, monospace, pulsing line whose
 * tier (`caution` / `danger` / `critical`) drives both colour and pulse rate.
 *
 * Tier mapping is purely a function of the active radiation zone resolved by
 * {@link lib.shipHealth.getRadiationZone} on the latest tick:
 *
 * - Zone 1 → `caution`  (yellow, slow pulse — Mercury-orbit chip damage band)
 * - Zone 2 → `danger`   (orange, faster pulse — between Mercury and Sun)
 * - Zone 3 → `critical` (red, fast pulse — innermost Sun-proximity)
 *
 * The {@link RadiationWarningState.damageActive} flag toggles a tighter
 * "[ACTIVE]" suffix so the player can distinguish "I am in this zone but
 * my shielding handles it" from "I am in this zone AND it is hurting me".
 *
 * @author guinetik
 * @date 2026-04-23
 * @spec docs/superpowers/specs/2026-04-23-radiation-zones-design.md
 */

import type { RadiationWarningState } from '@/lib/ShuttleTelemetry'

const props = defineProps<{
  warning: RadiationWarningState
}>()

/**
 * Resolve the CSS modifier that drives banner colour / pulse rate from the
 * current radiation zone. Falls back to `caution` for zone 0 (which the
 * `v-if` in the template will hide anyway, but we keep a sane default so
 * the class string is never empty).
 */
function tierClass(): string {
  if (props.warning.zone >= 3) return 'radiation-warning-critical'
  if (props.warning.zone >= 2) return 'radiation-warning-danger'
  return 'radiation-warning-caution'
}

/** Player-facing tier headline, escalating with zone severity. */
function tierLabel(): string {
  if (props.warning.zone >= 3) return 'RADIATION CRITICAL'
  if (props.warning.zone >= 2) return 'RADIATION DANGER'
  return 'RADIATION WARNING'
}

/**
 * Suffix appended after the tier label to disambiguate "in zone but shielded"
 * from "actively losing HP". Returns empty string when shielding holds.
 */
function statusSuffix(): string {
  return props.warning.damageActive ? ' \u2014 HULL EXPOSED' : ' \u2014 SHIELDING NOMINAL'
}
</script>

<template>
  <div v-if="props.warning.visible" class="radiation-warning" :class="tierClass()">
    &#9762; {{ tierLabel() }}{{ statusSuffix() }}
  </div>
</template>
