<!-- src/components/LanderHud.vue -->
<script setup lang="ts">
import type { LanderTelemetry } from '@/lib/ui/landerHudTypes'

const props = defineProps<{
  telemetry: LanderTelemetry
  fuelCellCount?: number
}>()

const emit = defineEmits<{
  useFuelCell: []
}>()

const REFUEL_BUTTON_VISIBLE_BELOW_PERCENT = 80

function pct(value: number, max: number): number {
  return max > 0 ? (value / max) * 100 : 0
}

function fuelColor(level: number, capacity: number): string {
  const ratio = capacity > 0 ? level / capacity : 0
  if (ratio > 0.5) return 'bg-green-500'
  if (ratio > 0.2) return 'bg-yellow-500'
  return 'bg-red-500'
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function timerColor(seconds: number): string {
  if (seconds <= 15) return 'text-red-500'
  if (seconds <= 30) return 'text-yellow-500'
  return 'text-green-400'
}
</script>

<template>
  <div class="lander-hud">
    <div class="hud-top-cluster">
      <div class="hud-top-cluster__readout">
        ALT {{ props.telemetry.altitude.toFixed(1) }} &middot; VEL
        {{ props.telemetry.velocityY.toFixed(1) }}
      </div>
      <div class="hud-top-cluster__readout">
        X {{ props.telemetry.posX.toFixed(0) }} Z {{ props.telemetry.posZ.toFixed(0) }}
      </div>
    </div>

    <div class="hud-bottom-dock">
      <div class="hud-bottom-dock__column hud-bottom-dock__column--hull">
        <span class="hud-hull-label">HULL</span>
        <div class="hud-hull-track">
          <div
            class="hud-hull-fill"
            :class="fuelColor(props.telemetry.hp, props.telemetry.maxHp)"
            :style="{ width: pct(props.telemetry.hp, props.telemetry.maxHp) + '%' }"
          ></div>
        </div>
      </div>

      <div class="hud-thruster-gauges">
        <div class="hud-gauge">
          <div class="hud-gauge-track">
            <div
              class="hud-gauge-fill bg-red-500"
              :style="{
                height:
                  pct(props.telemetry.mainEngineCharge, props.telemetry.mainEngineCapacity) + '%',
              }"
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
          v-if="
            (fuelCellCount ?? 0) > 0 &&
            pct(props.telemetry.fuelLevel, props.telemetry.fuelCapacity) <
              REFUEL_BUTTON_VISIBLE_BELOW_PERCENT
          "
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

    <div v-if="props.telemetry.surveyTimeRemaining !== null" class="survey-hud">
      <div class="survey-timer" :class="timerColor(props.telemetry.surveyTimeRemaining ?? 0)">
        {{ formatTimer(props.telemetry.surveyTimeRemaining ?? 0) }}
      </div>
      <div class="survey-probes">
        {{ props.telemetry.surveyProbesCollected ?? 0 }}/{{
          props.telemetry.surveyProbesTotal ?? 0
        }}
        {{ props.telemetry.minigameProgressLabel ?? 'PROBES' }}
      </div>
      <div v-if="props.telemetry.missionInstruction" class="survey-instruction" aria-live="polite">
        {{ props.telemetry.missionInstruction }}
      </div>
    </div>
  </div>
</template>
