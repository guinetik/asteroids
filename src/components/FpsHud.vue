<!-- src/components/FpsHud.vue -->
<script setup lang="ts">
/** Telemetry data from FpsPlayerController for HUD display. */
export interface FpsTelemetry {
  /** Current hit points */
  hp: number
  /** Maximum hit points */
  maxHp: number
  /** Current O2 remaining */
  o2Level: number
  /** Maximum O2 capacity */
  o2Capacity: number
  /** Current sprint charge */
  sprintCharge: number
  /** Maximum sprint charge */
  sprintCapacity: number
  /** Current lateral speed */
  speed: number
  /** Whether player is on the ground */
  grounded: boolean
  /** Active multi-tool mode */
  activeMode: 'drill' | 'weapon' | 'heal'
  /** Whether player is aiming (ADS) */
  aiming: boolean
  /** Whether tool fired this frame */
  isFiring: boolean
  /** RTG fuel level */
  rtgLevel: number
  /** RTG fuel capacity */
  rtgCapacity: number
  /** Active mode charge level */
  modeCharge: number
  /** Active mode charge capacity */
  modeCapacity: number
}

const O2_COLOR_HIGH = '#3b82f6'
const O2_COLOR_MID = '#f59e0b'
const O2_COLOR_LOW = '#ef4444'

const MODE_LABELS: Record<string, { key: string; label: string; color: string }> = {
  drill: { key: '1', label: 'DRL', color: '#3b82f6' },
  weapon: { key: '2', label: 'LAS', color: '#ff00ff' },
  heal: { key: '3', label: 'MED', color: '#22c55e' },
}

const props = defineProps<{ telemetry: FpsTelemetry }>()

function pct(value: number, max: number): number {
  return max > 0 ? (value / max) * 100 : 0
}

function o2Color(): string {
  const ratio = props.telemetry.o2Level / props.telemetry.o2Capacity
  if (ratio > 0.5) return O2_COLOR_HIGH
  if (ratio > 0.2) return O2_COLOR_MID
  return O2_COLOR_LOW
}

function modeColor(): string {
  return MODE_LABELS[props.telemetry.activeMode]?.color ?? '#ffffff'
}
</script>

<template>
  <div class="fixed inset-0 pointer-events-none font-mono text-white/90">

    <!-- ═══ TOP CENTER: Speed ═══ -->
    <div class="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2">
      <span class="text-xs tracking-widest uppercase text-white/40">SPD</span>
      <span class="text-sm tabular-nums text-white/70">{{ telemetry.speed.toFixed(1) }}</span>
    </div>

    <!-- ═══ MIDDLE LEFT: O2 + Stamina (vertical stack) ═══ -->
    <div class="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col gap-3">
      <!-- O2 -->
      <div class="flex items-center gap-2">
        <span class="text-xs tracking-widest uppercase text-white/50 w-6">O2</span>
        <div class="w-28 h-3 bg-white/10 rounded-sm overflow-hidden">
          <div
            class="h-full transition-all duration-100"
            :style="{ width: pct(telemetry.o2Level, telemetry.o2Capacity) + '%', backgroundColor: o2Color() }"
          />
        </div>
        <span class="text-[10px] text-white/40 w-6 text-right">{{ Math.ceil(telemetry.o2Level) }}</span>
      </div>
      <!-- Stamina -->
      <div class="flex items-center gap-2">
        <span class="text-xs tracking-widest uppercase text-white/50 w-6">STA</span>
        <div class="w-28 h-2 bg-white/10 rounded-sm overflow-hidden">
          <div
            class="h-full bg-green-400/80 transition-all duration-100"
            :style="{ width: pct(telemetry.sprintCharge, telemetry.sprintCapacity) + '%' }"
          />
        </div>
      </div>
    </div>

    <!-- ═══ CROSSHAIR: Center ═══ -->
    <div class="absolute inset-0 flex items-center justify-center select-none"
      :style="{ opacity: telemetry.aiming ? 1 : 0.4 }">
      <svg v-if="telemetry.activeMode === 'drill'" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="12" fill="none" :stroke="modeColor()" stroke-width="1.5" />
        <line x1="16" y1="8" x2="16" y2="24" :stroke="modeColor()" stroke-width="1" />
        <line x1="8" y1="16" x2="24" y2="16" :stroke="modeColor()" stroke-width="1" />
      </svg>
      <svg v-else-if="telemetry.activeMode === 'weapon'" width="32" height="32" viewBox="0 0 32 32">
        <line x1="16" y1="6" x2="16" y2="13" :stroke="modeColor()" stroke-width="2" />
        <line x1="16" y1="19" x2="16" y2="26" :stroke="modeColor()" stroke-width="2" />
        <line x1="6" y1="16" x2="13" y2="16" :stroke="modeColor()" stroke-width="2" />
        <line x1="19" y1="16" x2="26" y2="16" :stroke="modeColor()" stroke-width="2" />
      </svg>
      <svg v-else width="32" height="32" viewBox="0 0 32 32">
        <rect x="13" y="8" width="6" height="16" rx="1" :fill="modeColor()" />
        <rect x="8" y="13" width="16" height="6" rx="1" :fill="modeColor()" />
      </svg>
    </div>

    <!-- ═══ BOTTOM CENTER: HP bar + Action Bar + flanking bars ═══ -->
    <div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">

      <!-- HP Bar (above toolbar) -->
      <div class="flex items-center gap-2">
        <span class="text-xs tracking-widest uppercase text-red-400/80 w-6">HP</span>
        <div class="w-36 h-3 bg-white/10 rounded-sm overflow-hidden">
          <div
            class="h-full bg-red-500 transition-all duration-100"
            :style="{ width: pct(telemetry.hp, telemetry.maxHp) + '%' }"
          />
        </div>
        <span class="text-[10px] text-white/40 w-6 text-right">{{ Math.ceil(telemetry.hp) }}</span>
      </div>

      <!-- Toolbar row: Mode Charge | [1][2][3] | RTG -->
      <div class="flex items-center gap-3">

        <!-- Mode charge (left of toolbar) -->
        <div class="flex items-center gap-1.5">
          <span class="text-[10px] tracking-widest uppercase" :style="{ color: modeColor() + '80' }">
            {{ MODE_LABELS[telemetry.activeMode]?.label }}
          </span>
          <div class="w-20 h-2 bg-white/10 rounded-sm overflow-hidden">
            <div
              class="h-full transition-all duration-75"
              :style="{
                width: pct(telemetry.modeCharge, telemetry.modeCapacity) + '%',
                backgroundColor: modeColor() + 'cc',
              }"
            />
          </div>
        </div>

        <!-- Action Bar [1][2][3] -->
        <div class="flex gap-1">
          <div
            v-for="(cfg, mode) in MODE_LABELS"
            :key="mode"
            class="flex items-center gap-1 px-3 py-1.5 rounded text-xs tracking-wider uppercase transition-all duration-150"
            :class="telemetry.activeMode === mode ? 'bg-white/15' : 'bg-white/5 opacity-50'"
            :style="telemetry.activeMode === mode ? { borderBottom: '2px solid ' + cfg.color, color: cfg.color } : {}"
          >
            <span class="text-white/40">{{ cfg.key }}</span>
            <span>{{ cfg.label }}</span>
          </div>
        </div>

        <!-- RTG (right of toolbar) -->
        <div class="flex items-center gap-1.5">
          <div class="w-20 h-2 bg-white/10 rounded-sm overflow-hidden">
            <div
              class="h-full bg-yellow-400/80 transition-all duration-75"
              :style="{ width: pct(telemetry.rtgLevel, telemetry.rtgCapacity) + '%' }"
            />
          </div>
          <span class="text-[10px] tracking-widest uppercase text-yellow-400/50">RTG</span>
        </div>
      </div>
    </div>
  </div>
</template>
