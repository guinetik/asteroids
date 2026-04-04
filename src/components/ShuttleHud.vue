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
</script>

<template>
  <div class="shuttle-hud">
    <!-- Top center: position -->
    <div class="hud-position">
      X:{{ props.telemetry.posX.toFixed(0) }}
      Z:{{ props.telemetry.posZ.toFixed(0) }}
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
