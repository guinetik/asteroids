<script setup lang='ts'>
import type { ShuttleTelemetry } from '@/lib/ShuttleTelemetry'
import { ORBIT_SCALE } from '@/lib/planets/constants'

const props = defineProps<{
  telemetry: ShuttleTelemetry
  fuelCellCount?: number
}>()

const emit = defineEmits<{
  useFuelCell: []
}>()

/** Degrees in a full compass rotation (0–360°). */
const COMPASS_DEGREES_FULL = 360

/** Radians to degrees multiplier. */
const DEGREES_PER_RADIAN = 180 / Math.PI

/**
 * Formats shuttle yaw (radians) as a compass degree string (0–360).
 *
 * @param rad - World yaw in radians (same convention as {@link ShuttleTelemetry.heading}).
 */
function formatHeading(rad: number): string {
  let deg = (rad * DEGREES_PER_RADIAN) % COMPASS_DEGREES_FULL
  if (deg < 0) deg += COMPASS_DEGREES_FULL
  return `${deg.toFixed(0)}`
}

function pct(value: number, max: number): number {
  return max > 0 ? (value / max) * 100 : 0
}

function fuelColor(level: number, capacity: number): string {
  const ratio = capacity > 0 ? level / capacity : 0
  if (ratio > 0.5) return 'bg-green-500'
  if (ratio > 0.2) return 'bg-yellow-500'
  return 'bg-red-500'
}

function hullColor(hp: number, maxHp: number): string {
  const ratio = maxHp > 0 ? hp / maxHp : 0
  if (ratio > 0.5) return 'bg-green-500'
  if (ratio > 0.2) return 'bg-yellow-500'
  return 'bg-red-500'
}

function adriftSeconds(): string {
  return Math.ceil(props.telemetry.adriftCountdown).toString()
}

function tempLabel(): string {
  return props.telemetry.temperature > 0 ? 'OVERHEATING' : 'FREEZING'
}

function tempLabelClass(): string {
  return props.telemetry.temperature > 0 ? 'text-red-500' : 'text-blue-400'
}
</script>

<template>
  <div class="shuttle-hud">
    <!-- Top center: position + velocity/heading (same “beats” as FPS HUD readouts). -->
    <div class="hud-top-cluster">
      <div class="hud-top-cluster__line">
        X:{{ (props.telemetry.posX / ORBIT_SCALE).toFixed(2) }}
        Z:{{ (props.telemetry.posZ / ORBIT_SCALE).toFixed(2) }} AU
      </div>
      <div class="hud-top-cluster__line hud-top-cluster__line--velocity">
        <span>SPD {{ props.telemetry.speed.toFixed(1) }}</span>
        <span>HDG {{ formatHeading(props.telemetry.heading) }}</span>
      </div>
      <div v-if="props.telemetry.actionPrompt" class="hud-top-cluster__line hud-top-cluster__line--action">
        {{ props.telemetry.actionPrompt }}
      </div>
      <div v-if="props.telemetry.adriftCountdown >= 0" class="hud-top-cluster__adrift">
        {{ adriftSeconds() }}s
      </div>
    </div>

    <div v-if="props.telemetry.temperatureVisible" class="hud-temp-gauge">
      <span class="hud-temp-label" :class="tempLabelClass()">
        {{ tempLabel() }} {{ Math.abs(props.telemetry.temperature).toFixed(0) }}&deg;
      </span>
      <div class="hud-temp-track">
        <div
          v-if="props.telemetry.temperature > 0"
          class="hud-temp-fill-hot"
          :style="{ width: Math.abs(props.telemetry.temperature) + '%' }"
        ></div>
        <div
          v-else
          class="hud-temp-fill-cold"
          :style="{ width: Math.abs(props.telemetry.temperature) + '%', marginLeft: 'auto' }"
        ></div>
      </div>
    </div>

    <div v-if="props.telemetry.adriftCountdown >= 0" class="hud-adrift-warning">
      ADRIFT — DOCK TO REFUEL
    </div>

    <!-- Bottom center: hull | thruster bars | fuel (mirrors FPS HP | tools | RTG). -->
    <div class="hud-bottom-dock">
      <div class="hud-bottom-dock__column hud-bottom-dock__column--hull">
        <span class="hud-hull-label">HULL</span>
        <div class="hud-hull-track">
          <div
            class="hud-hull-fill"
            :class="hullColor(props.telemetry.hp, props.telemetry.maxHp)"
            :style="{ width: pct(props.telemetry.hp, props.telemetry.maxHp) + '%' }"
          ></div>
        </div>
      </div>

      <div class="hud-thruster-gauges">
        <div class="hud-gauge">
          <div class="hud-gauge-track">
            <div
              class="hud-gauge-fill bg-red-500"
              :style="{ height: pct(props.telemetry.thrustCharge, props.telemetry.thrustCapacity) + '%' }"
            ></div>
          </div>
          <span class="hud-gauge-label">THR</span>
        </div>
        <div class="hud-gauge">
          <div class="hud-gauge-track">
            <div
              class="hud-gauge-fill bg-blue-500"
              :style="{ height: pct(props.telemetry.brakeCharge, props.telemetry.brakeCapacity) + '%' }"
            ></div>
          </div>
          <span class="hud-gauge-label">BRK</span>
        </div>
        <div class="hud-gauge">
          <div class="hud-gauge-track">
            <div
              class="hud-gauge-fill bg-white"
              :style="{ height: pct(props.telemetry.rcsCharge, props.telemetry.rcsCapacity) + '%' }"
            ></div>
          </div>
          <span class="hud-gauge-label">RCS</span>
        </div>
      </div>

      <div class="hud-bottom-dock__column hud-bottom-dock__column--fuel">
        <span class="hud-fuel-label">FUEL</span>
        <div class="hud-fuel-track">
          <div
            class="hud-fuel-fill"
            :class="fuelColor(props.telemetry.fuelLevel, props.telemetry.fuelCapacity)"
            :style="{ width: pct(props.telemetry.fuelLevel, props.telemetry.fuelCapacity) + '%' }"
          ></div>
        </div>
        <button
          v-if="(fuelCellCount ?? 0) > 0 && pct(props.telemetry.fuelLevel, props.telemetry.fuelCapacity) < 80"
          type="button"
          class="hud-dock-refuel-btn"
          @click.stop.prevent="emit('useFuelCell')"
          @mousedown.stop
          @pointerdown.stop
        >
          REFUEL ({{ fuelCellCount }})
        </button>
      </div>
    </div>
  </div>
</template>
