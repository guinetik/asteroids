<!-- src/components/FpsHud.vue -->
<script setup lang="ts">
/** Objective marker for compass display. */
export interface CompassObjective {
  /** Unique id. */
  id: string
  /** Short label (e.g. "GATHER", "EXTERMINATE"). */
  label: string
  /** Relative bearing to player heading in degrees (-180 to 180). */
  relativeDeg: number
  /** Objective type for color-coding. */
  type: 'gather' | 'exterminate' | 'rescue' | 'survey'
}

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
  /** Player camera Y rotation in radians. */
  headingRad: number
  /** Active objectives for compass display. */
  objectives: CompassObjective[]
}

const O2_COLOR_HIGH = '#3b82f6'
const O2_COLOR_MID = '#f59e0b'
const O2_COLOR_LOW = '#ef4444'

const MODE_LABELS: Record<string, { key: string; label: string; color: string }> = {
  drill: { key: '1', label: 'DRL', color: '#3b82f6' },
  weapon: { key: '2', label: 'LAS', color: '#ff00ff' },
  heal: { key: '3', label: 'MED', color: '#22c55e' },
}

/** Degrees in a full compass rotation (0–360°). */
const COMPASS_DEGREES_FULL = 360

/** Radians to degrees multiplier. */
const DEGREES_PER_RADIAN = 180 / Math.PI

const props = defineProps<{ telemetry: FpsTelemetry }>()

function pct(value: number, max: number): number {
  return max > 0 ? (value / max) * 100 : 0
}

/**
 * Formats camera yaw (radians) as a compass degree string (0–360), matching shuttle HDG readout style.
 *
 * @param rad - Y rotation from the FPS camera (see {@link FpsTelemetry.headingRad}).
 */
function formatHeadingDegFromRad(rad: number): string {
  let deg = (rad * DEGREES_PER_RADIAN) % COMPASS_DEGREES_FULL
  if (deg < 0) deg += COMPASS_DEGREES_FULL
  return deg.toFixed(0)
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

    <!-- ═══ TOP CENTER: Speed + heading (aligned with shuttle SPD / HDG row) ═══ -->
    <div class="absolute top-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-0.5">
      <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-0.5 text-sm">
        <span class="text-xs tracking-widest uppercase text-white/40">SPD</span>
        <span class="tabular-nums text-white/70">{{ telemetry.speed.toFixed(1) }}</span>
        <span class="text-xs tracking-widest uppercase text-white/40">HDG</span>
        <span class="tabular-nums text-white/70">{{ formatHeadingDegFromRad(telemetry.headingRad) }}</span>
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

    <!-- ═══ BOTTOM CENTER: HP | multitool “thruster” cluster | RTG (mirrors shuttle hull | THR/BRK/RCS | fuel) ═══ -->
    <div class="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-end justify-center gap-5">
      <div class="flex w-32 flex-col gap-1">
        <span class="text-xs tracking-widest uppercase text-red-400/80">HP</span>
        <div class="flex items-center gap-1">
          <div class="h-3 min-w-0 flex-1 overflow-hidden rounded-sm bg-white/10">
            <div
              class="h-full bg-red-500 transition-all duration-100"
              :style="{ width: pct(telemetry.hp, telemetry.maxHp) + '%' }"
            />
          </div>
          <span class="shrink-0 text-[10px] tabular-nums text-white/40">{{ Math.ceil(telemetry.hp) }}</span>
        </div>
        <div class="flex items-end justify-center gap-2 pt-1">
          <div class="flex flex-col items-center gap-0.5">
            <span class="text-[10px] text-white/40">{{ Math.ceil(telemetry.o2Level) }}</span>
            <div class="flex h-16 w-2.5 flex-col-reverse overflow-hidden rounded-sm bg-white/10">
              <div
                class="w-full rounded-sm transition-all duration-100"
                :style="{ height: pct(telemetry.o2Level, telemetry.o2Capacity) + '%', backgroundColor: o2Color() }"
              />
            </div>
            <span class="text-[10px] tracking-widest uppercase text-white/50">O2</span>
          </div>
          <div class="flex flex-col items-center gap-0.5">
            <div class="h-16 w-2.5 flex flex-col-reverse overflow-hidden rounded-sm bg-white/10">
              <div
                class="w-full rounded-sm bg-green-400/80 transition-all duration-100"
                :style="{ height: pct(telemetry.sprintCharge, telemetry.sprintCapacity) + '%' }"
              />
            </div>
            <span class="text-[10px] tracking-widest uppercase text-white/50">STA</span>
          </div>
        </div>
      </div>

      <div class="flex flex-col items-center gap-2">
        <div class="flex items-center gap-1.5">
          <span class="text-[10px] tracking-widest uppercase" :style="{ color: modeColor() + '80' }">
            {{ MODE_LABELS[telemetry.activeMode]?.label }}
          </span>
          <div class="h-2 w-20 overflow-hidden rounded-sm bg-white/10">
            <div
              class="h-full transition-all duration-75"
              :style="{
                width: pct(telemetry.modeCharge, telemetry.modeCapacity) + '%',
                backgroundColor: modeColor() + 'cc',
              }"
            />
          </div>
        </div>
        <div class="flex gap-1">
          <div
            v-for="(cfg, mode) in MODE_LABELS"
            :key="mode"
            class="flex items-center gap-1 rounded px-3 py-1.5 text-xs tracking-wider uppercase transition-all duration-150"
            :class="telemetry.activeMode === mode ? 'bg-white/15' : 'bg-white/5 opacity-50'"
            :style="telemetry.activeMode === mode ? { borderBottom: '2px solid ' + cfg.color, color: cfg.color } : {}"
          >
            <span class="text-white/40">{{ cfg.key }}</span>
            <span>{{ cfg.label }}</span>
          </div>
        </div>
      </div>

      <div class="flex w-32 flex-col gap-1">
        <span class="text-[10px] tracking-widest uppercase text-yellow-400/50">RTG</span>
        <div class="h-3 w-full overflow-hidden rounded-sm bg-white/10">
          <div
            class="h-full bg-yellow-400/80 transition-all duration-75"
            :style="{ width: pct(telemetry.rtgLevel, telemetry.rtgCapacity) + '%' }"
          />
        </div>
      </div>
    </div>
  </div>
</template>
