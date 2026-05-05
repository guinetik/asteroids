<script setup lang="ts">
import type { ShuttleTelemetry } from '@/lib/ShuttleTelemetry'
import { ORBIT_SCALE } from '@/lib/planets/constants'
import ShuttleCompass from '@/components/ShuttleCompass.vue'
import KeyPrompt from '@/components/KeyPrompt.vue'
import { computed } from 'vue'

const props = defineProps<{
  telemetry: ShuttleTelemetry
  fuelCellCount?: number
}>()

const emit = defineEmits<{
  useFuelCell: []
}>()

/**
 * Parse a free-form `actionPrompt` string into a `{key, label}` tuple
 * suitable for {@link KeyPrompt}. Mirrors the parser in MapView so the
 * shuttle-mode HUD prompt and the EVA-mode bottom prompt render with
 * the same standardized keycap chrome.
 */
const actionPromptParsed = computed<{ key: string; label: string } | null>(() => {
  const raw = props.telemetry.actionPrompt
  if (!raw) return null
  const trimmed = raw.trim()
  const prefix = trimmed.match(/^\[([^\]]+)\]\s*(.+)$/)
  if (prefix) return { key: prefix[1]!.trim(), label: prefix[2]!.trim() }
  const suffix = trimmed.match(/^(.+?)\s*\[([^\]]+)\]\s*$/)
  if (suffix) return { key: suffix[2]!.trim(), label: suffix[1]!.trim() }
  const spaced = trimmed.match(/^(\S{1,4})\s{2,}(.+)$/)
  if (spaced) return { key: spaced[1]!.trim(), label: spaced[2]!.trim() }
  return { key: '?', label: trimmed }
})

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
    <!-- Top center: coords left, compass strip center, speed right. -->
    <div class="hud-top-cluster">
      <ShuttleCompass
        :heading-rad="props.telemetry.heading"
        :bearings="props.telemetry.compassBearings"
      />
      <div class="hud-top-cluster__readout">
        X:{{ (props.telemetry.posX / ORBIT_SCALE).toFixed(2) }} Z:{{
          (props.telemetry.posZ / ORBIT_SCALE).toFixed(2)
        }}
        AU &middot; SPD {{ props.telemetry.speed.toFixed(1) }}
      </div>
      <KeyPrompt
        v-if="actionPromptParsed"
        :key-label="actionPromptParsed.key"
        :action="actionPromptParsed.label"
        tone="cyan"
        position="inline"
      />
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
        <template v-if="props.telemetry.turretActive">
          <div class="hud-gauge">
            <div class="hud-gauge-track">
              <div
                class="hud-gauge-fill bg-cyan-400"
                :style="{
                  height:
                    pct(props.telemetry.turretMiningCharge, props.telemetry.turretMiningCapacity) +
                    '%',
                }"
              ></div>
            </div>
            <span class="hud-gauge-label">MINE</span>
          </div>
        </template>
        <template v-else>
          <div class="hud-gauge">
            <div class="hud-gauge-track">
              <div
                class="hud-gauge-fill bg-red-500"
                :style="{
                  height: pct(props.telemetry.thrustCharge, props.telemetry.thrustCapacity) + '%',
                }"
              ></div>
            </div>
            <span class="hud-gauge-label">THR</span>
          </div>
          <div class="hud-gauge">
            <div class="hud-gauge-track">
              <div
                class="hud-gauge-fill bg-blue-500"
                :style="{
                  height: pct(props.telemetry.brakeCharge, props.telemetry.brakeCapacity) + '%',
                }"
              ></div>
            </div>
            <span class="hud-gauge-label">BRK</span>
          </div>
          <div class="hud-gauge">
            <div class="hud-gauge-track">
              <div
                class="hud-gauge-fill bg-white"
                :style="{
                  height: pct(props.telemetry.rcsCharge, props.telemetry.rcsCapacity) + '%',
                }"
              ></div>
            </div>
            <span class="hud-gauge-label">RCS</span>
          </div>
        </template>
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
            pct(props.telemetry.fuelLevel, props.telemetry.fuelCapacity) < 80
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
  </div>
</template>
