<script setup lang='ts'>
import type { ShuttleTelemetry } from '@/lib/ShuttleTelemetry'

const props = defineProps<{
  telemetry: ShuttleTelemetry
}>()

function formatHeading(rad: number): string {
  const deg = ((rad * 180) / Math.PI) % 360
  return `${deg < 0 ? deg + 360 : deg}`
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
    <!-- Top center: position -->
    <div class="hud-position">
      X:{{ props.telemetry.posX.toFixed(0) }}
      Z:{{ props.telemetry.posZ.toFixed(0) }}
    </div>

    <!-- Adrift countdown: centered below position -->
    <div v-if="props.telemetry.adriftCountdown >= 0" class="hud-adrift-countdown">
      {{ adriftSeconds() }}s
    </div>

    <!-- Temperature gauge: below position, only when outside safe zone -->
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

    <!-- Top left: hull bar (above fuel) -->
    <div class="hud-hull">
      <span class="hud-hull-label">HULL</span>
      <div class="hud-hull-track">
        <div
          class="hud-hull-fill"
          :class="hullColor(props.telemetry.hp, props.telemetry.maxHp)"
          :style="{ width: pct(props.telemetry.hp, props.telemetry.maxHp) + '%' }"
        ></div>
      </div>
    </div>

    <!-- Top left: fuel bar -->
    <div class="hud-fuel">
      <span class="hud-fuel-label">FUEL</span>
      <div class="hud-fuel-track">
        <div
          class="hud-fuel-fill"
          :class="fuelColor(props.telemetry.fuelLevel, props.telemetry.fuelCapacity)"
          :style="{ width: pct(props.telemetry.fuelLevel, props.telemetry.fuelCapacity) + '%' }"
        ></div>
      </div>
    </div>

    <!-- Adrift warning: under fuel bar -->
    <div v-if="props.telemetry.adriftCountdown >= 0" class="hud-adrift-warning">
      ADRIFT — DOCK TO REFUEL
    </div>

    <!-- Bottom left: speed and heading -->
    <div class="hud-readouts">
      <span>SPD {{ props.telemetry.speed.toFixed(1) }}</span>
      <span>HDG {{ formatHeading(props.telemetry.heading) }}</span>
    </div>

    <!-- Bottom center: thruster gauges -->
    <div class="hud-gauges">
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
  </div>
</template>
