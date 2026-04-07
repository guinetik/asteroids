<!-- src/components/LanderHud.vue -->
<script setup lang="ts">
/** Safe landing speed threshold (units/s). */
const SAFE_SPEED = 5.0
/** Warning speed — alert starts before the crash threshold. */
const WARN_SPEED = 3.0
/** Safe landing angle threshold (radians). */
const SAFE_ANGLE = 0.175
/** Warning angle — starts at ~60% of crash threshold. */
const WARN_ANGLE = 0.1

export interface LanderTelemetry {
  altitude: number
  velocityY: number
  posX: number
  posZ: number
  fuelLevel: number
  fuelCapacity: number
  mainEngineCharge: number
  mainEngineCapacity: number
  rcsCharge: number
  rcsCapacity: number
  hp: number
  maxHp: number
  tiltAngle: number
  grounded: boolean
}

import { computed } from 'vue'

const props = defineProps<{
  telemetry: LanderTelemetry
}>()

function pct(value: number, max: number): number {
  return max > 0 ? (value / max) * 100 : 0
}

function fuelColor(level: number, capacity: number): string {
  const ratio = capacity > 0 ? level / capacity : 0
  if (ratio > 0.5) return 'bg-green-500'
  if (ratio > 0.2) return 'bg-yellow-500'
  return 'bg-red-500'
}

/** Descent rate danger level: 'safe' | 'warn' | 'danger'. */
const descentStatus = computed(() => {
  const speed = Math.abs(props.telemetry.velocityY)
  if (props.telemetry.grounded || props.telemetry.velocityY >= 0) return 'safe'
  if (speed >= SAFE_SPEED) return 'danger'
  if (speed >= WARN_SPEED) return 'warn'
  return 'safe'
})

/** Attitude danger level: 'safe' | 'warn' | 'danger'. */
const attitudeStatus = computed(() => {
  if (props.telemetry.grounded) return 'safe'
  const tilt = props.telemetry.tiltAngle
  if (tilt >= SAFE_ANGLE) return 'danger'
  if (tilt >= WARN_ANGLE) return 'warn'
  return 'safe'
})
</script>

<template>
  <div class="lander-hud">
    <!-- Readouts: top left -->
    <div class="hud-readout">ALT {{ props.telemetry.altitude.toFixed(1) }}</div>
    <div class="hud-readout" :class="{ 'hud-warn': descentStatus === 'warn', 'hud-danger': descentStatus === 'danger' }">
      VEL {{ props.telemetry.velocityY.toFixed(1) }}
    </div>
    <div class="hud-readout">X {{ props.telemetry.posX.toFixed(0) }} Z {{ props.telemetry.posZ.toFixed(0) }}</div>

    <!-- Landing warnings -->
    <div v-if="descentStatus !== 'safe'" class="hud-warning" :class="{ 'hud-danger': descentStatus === 'danger' }">
      ⚠ DESCENT RATE
    </div>
    <div v-if="attitudeStatus !== 'safe'" class="hud-warning" :class="{ 'hud-danger': attitudeStatus === 'danger' }">
      ⚠ ATTITUDE
    </div>

    <!-- Fuel bar -->
    <div class="lander-hud-fuel">
      <span class="hud-readout">FUEL</span>
      <div class="hud-fuel-track">
        <div
          class="hud-fuel-fill"
          :class="fuelColor(props.telemetry.fuelLevel, props.telemetry.fuelCapacity)"
          :style="{ width: pct(props.telemetry.fuelLevel, props.telemetry.fuelCapacity) + '%' }"
        ></div>
      </div>
    </div>

    <!-- Hull HP bar -->
    <div class="lander-hud-fuel">
      <span class="hud-readout">HULL</span>
      <div class="hud-fuel-track">
        <div
          class="hud-fuel-fill"
          :class="fuelColor(props.telemetry.hp, props.telemetry.maxHp)"
          :style="{ width: pct(props.telemetry.hp, props.telemetry.maxHp) + '%' }"
        ></div>
      </div>
    </div>

    <!-- Thruster gauges -->
    <div class="lander-hud-gauges">
      <div class="hud-gauge">
        <div class="hud-gauge-track">
          <div
            class="hud-gauge-fill bg-red-500"
            :style="{ height: pct(props.telemetry.mainEngineCharge, props.telemetry.mainEngineCapacity) + '%' }"
          ></div>
        </div>
        <span class="hud-gauge-label">ENG</span>
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
  </div>
</template>
