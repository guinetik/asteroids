<!-- src/components/FpsHud.vue -->
<script setup lang="ts">
import type { FpsTelemetry } from '@/lib/ui/fpsHudTypes'

const O2_COLOR_HIGH = '#3b82f6'
const O2_COLOR_MID = '#f59e0b'
const O2_COLOR_LOW = '#ef4444'

/**
 * O2 fraction at or below which the low-oxygen prompt is shown.
 * Matches the audio cue threshold in FpsAudioDirector.LOW_OXYGEN_FRACTION
 * so the warning text and the breathing-distress loop appear together.
 */
const LOW_OXYGEN_FRACTION = 0.2

const MODE_LABELS: Record<string, { key: string; label: string; color: string }> = {
  drill: { key: '1', label: 'DRL', color: '#3b82f6' },
  weapon: { key: '2', label: 'LAS', color: '#ff00ff' },
  science: { key: '3', label: 'SCI', color: '#22c55e' },
}

/** Hotbar row for map EVA: single SCI entry (no DRL/LAS). */
const EVA_MAP_SCI_MODE_LABEL: { key: string; label: string; color: string } = {
  key: '3',
  label: 'SCI',
  color: '#22c55e',
}

/** Degrees in a full compass rotation (0–360°). */
const COMPASS_DEGREES_FULL = 360

/** Radians to degrees multiplier. */
const DEGREES_PER_RADIAN = 180 / Math.PI

const props = withDefaults(
  defineProps<{
    telemetry: FpsTelemetry
    /**
     * HUD variant. `'level'` (default) shows all elements including crosshair,
     * mode charge, hotbar, and sprint stamina. `'eva'` hides combat/tool UI
     * and keeps HP / O2 / RTG / SPD / HDG only. `'evaMap'` is map EVA: science
     * reticle, SCI-only hotbar, no mining/laser.
     */
    variant?: 'level' | 'eva' | 'evaMap'
    /**
     * When true, hides the top-center SPD / HDG row — used in bunker interior
     * where {@link BunkerWaveHud} occupies the same band.
     */
    hideMovementReadout?: boolean
  }>(),
  { variant: 'level', hideMovementReadout: false },
)

const showCombatHud = (): boolean => props.variant !== 'eva'

/** Map EVA: science tool HUD without DRL/LAS hotkeys. */
const showEvaMapToolHud = (): boolean => props.variant === 'evaMap'

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

/** True when O2 is at or below the warning threshold (and the player still has air to lose). */
function showLowOxygenWarning(): boolean {
  if (props.telemetry.o2Capacity <= 0) return false
  const ratio = props.telemetry.o2Level / props.telemetry.o2Capacity
  return ratio <= LOW_OXYGEN_FRACTION
}

/** Empty O2 → suffocation; severity bumps to a sharper readout when truly out. */
function isOxygenEmpty(): boolean {
  return props.telemetry.o2Level <= 0
}

function modeColor(): string {
  return MODE_LABELS[props.telemetry.activeMode]?.color ?? '#ffffff'
}

function rockTargetFillPct(): number {
  const target = props.telemetry.rockTarget
  if (!target || target.totalKg <= 0) return 0
  return Math.max(0, Math.min(100, (target.remainingKg / target.totalKg) * 100))
}

function showRockTarget(): boolean {
  return (
    showCombatHud() && props.telemetry.activeMode === 'drill' && props.telemetry.rockTarget != null
  )
}
</script>

<template>
  <div class="fixed inset-0 pointer-events-none font-mono text-white/90">
    <!-- ═══ TOP CENTER: Speed + heading (aligned with shuttle SPD / HDG row) ═══ -->
    <div
      v-if="!props.hideMovementReadout"
      class="absolute top-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-0.5"
    >
      <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-0.5 text-sm">
        <span class="text-xs tracking-widest uppercase text-white/40">SPD</span>
        <span class="tabular-nums text-white/70">{{ telemetry.speed.toFixed(1) }}</span>
        <span class="text-xs tracking-widest uppercase text-white/40">HDG</span>
        <span class="tabular-nums text-white/70">{{
          formatHeadingDegFromRad(telemetry.headingRad)
        }}</span>
      </div>
    </div>

    <!--
      Low-oxygen warning. Sits below the FpsCompass strip (which is
      top: 1rem with ~48px combined height including its readout)
      so the prompt anchors visually under the compass without
      overlapping it. Pulses in red while O2 is below the warning
      threshold; switches to a static "OXYGEN DEPLETED" readout once
      the tank is empty so the cue still reads when the pulse stops.
    -->
    <div
      v-if="showLowOxygenWarning()"
      class="absolute top-20 left-1/2 z-20 -translate-x-1/2 select-none"
      role="alert"
      aria-live="assertive"
    >
      <div
        class="rounded-sm border px-3 py-1 text-center font-mono text-[11px] tracking-[0.3em] uppercase shadow-[0_0_12px_-2px_rgba(239,68,68,0.6)] backdrop-blur-sm"
        :class="isOxygenEmpty() ? 'fps-hud-oxygen--depleted' : 'fps-hud-oxygen--warn'"
      >
        {{ isOxygenEmpty() ? 'Oxygen Depleted' : 'Low Oxygen' }}
      </div>
    </div>

    <!-- ═══ ROCK TARGET READOUT: floats above crosshair, drill mode only ═══ -->
    <div
      v-if="showRockTarget()"
      class="pointer-events-none absolute inset-0 flex items-center justify-center select-none"
      aria-hidden="true"
    >
      <div
        class="-translate-y-10 flex flex-col items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.6)] backdrop-blur-md"
        :style="{ borderColor: modeColor() + '30' }"
      >
        <span
          class="text-[11px] font-mono tracking-[0.25em] uppercase drop-shadow-[0_0_6px_rgba(0,0,0,0.8)]"
          :style="{ color: modeColor() }"
        >
          {{ telemetry.rockTarget!.label }}
        </span>
        <div class="flex items-center gap-1.5">
          <div class="h-[3px] w-24 overflow-hidden rounded-sm bg-white/10">
            <div
              class="h-full transition-all duration-100"
              :style="{ width: rockTargetFillPct() + '%', backgroundColor: modeColor() + 'cc' }"
            />
          </div>
          <span class="w-12 text-[9px] font-mono tracking-wider tabular-nums text-white/60">
            {{ Math.ceil(telemetry.rockTarget!.remainingKg) }}KG
          </span>
        </div>
      </div>
    </div>

    <!-- ═══ CROSSHAIR: Center ═══ -->
    <div
      v-if="showCombatHud() || showEvaMapToolHud()"
      class="absolute inset-0 flex items-center justify-center select-none"
      :style="{ opacity: telemetry.aiming ? 1 : 0.4 }"
    >
      <svg
        v-if="!showEvaMapToolHud() && telemetry.activeMode === 'drill'"
        width="32"
        height="32"
        viewBox="0 0 32 32"
      >
        <circle cx="16" cy="16" r="12" fill="none" :stroke="modeColor()" stroke-width="1.5" />
        <line x1="16" y1="8" x2="16" y2="24" :stroke="modeColor()" stroke-width="1" />
        <line x1="8" y1="16" x2="24" y2="16" :stroke="modeColor()" stroke-width="1" />
      </svg>
      <svg
        v-else-if="!showEvaMapToolHud() && telemetry.activeMode === 'weapon'"
        width="32"
        height="32"
        viewBox="0 0 32 32"
      >
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

    <!-- ═══ EVA CROSSHAIR: soft cyan reticle, no tool (shuttle scene EVA) ═══ -->
    <div
      v-else-if="!showEvaMapToolHud()"
      class="absolute inset-0 flex items-center justify-center select-none opacity-60"
    >
      <svg width="28" height="28" viewBox="0 0 28 28">
        <circle cx="14" cy="14" r="9" fill="none" stroke="#00e5ff" stroke-width="1" />
        <circle cx="14" cy="14" r="1.2" fill="#00e5ff" />
        <line x1="14" y1="2" x2="14" y2="7" stroke="#00e5ff" stroke-width="1" />
        <line x1="14" y1="21" x2="14" y2="26" stroke="#00e5ff" stroke-width="1" />
        <line x1="2" y1="14" x2="7" y2="14" stroke="#00e5ff" stroke-width="1" />
        <line x1="21" y1="14" x2="26" y2="14" stroke="#00e5ff" stroke-width="1" />
      </svg>
    </div>

    <!--
      Bottom HUD: HP left and RTG right on the same baseline (parallel resource bars); center is
      O2/STA above mode charge + hotbar.
    -->
    <div
      class="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-end justify-center gap-5"
    >
      <div class="flex w-32 shrink-0 flex-col gap-1">
        <span class="text-[10px] tracking-widest uppercase text-red-400/80">HP</span>
        <div class="flex items-center gap-1">
          <div class="h-3 min-w-0 flex-1 overflow-hidden rounded-sm bg-white/10">
            <div
              class="h-full bg-red-500 transition-all duration-100"
              :style="{ width: pct(telemetry.hp, telemetry.maxHp) + '%' }"
            />
          </div>
          <span class="shrink-0 text-[10px] tabular-nums text-white/40">{{
            Math.ceil(telemetry.hp)
          }}</span>
        </div>
      </div>

      <div class="flex flex-col items-center gap-2">
        <!-- O2 + STA: centered above DRL / mode row -->
        <div class="flex translate-x-2 items-end justify-center gap-3">
          <div class="flex flex-col items-center gap-0.5">
            <span class="text-[10px] text-white/40">{{ Math.ceil(telemetry.o2Level) }}</span>
            <div class="flex h-16 w-2.5 flex-col-reverse overflow-hidden rounded-sm bg-white/10">
              <div
                class="w-full rounded-sm transition-all duration-100"
                :style="{
                  height: pct(telemetry.o2Level, telemetry.o2Capacity) + '%',
                  backgroundColor: o2Color(),
                }"
              />
            </div>
            <span class="text-[10px] tracking-widest uppercase text-white/50">O2</span>
          </div>
          <div
            v-if="showCombatHud() && !showEvaMapToolHud()"
            class="flex flex-col items-center gap-0.5"
          >
            <div class="h-16 w-2.5 flex flex-col-reverse overflow-hidden rounded-sm bg-white/10">
              <div
                class="w-full rounded-sm bg-green-400/80 transition-all duration-100"
                :style="{ height: pct(telemetry.sprintCharge, telemetry.sprintCapacity) + '%' }"
              />
            </div>
            <span class="text-[10px] tracking-widest uppercase text-white/50">STA</span>
          </div>
        </div>

        <div v-if="showCombatHud() || showEvaMapToolHud()" class="flex items-center gap-1.5">
          <span
            class="text-[10px] tracking-widest uppercase"
            :style="{ color: modeColor() + '80' }"
          >
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

        <div v-if="showEvaMapToolHud()" class="flex gap-1">
          <div
            class="flex items-center gap-1 rounded border-b-2 border-white/15 bg-white/15 px-3 py-1.5 text-xs tracking-wider uppercase"
            :style="{
              borderBottomColor: EVA_MAP_SCI_MODE_LABEL.color,
              color: EVA_MAP_SCI_MODE_LABEL.color,
            }"
          >
            <span class="text-white/40">{{ EVA_MAP_SCI_MODE_LABEL.key }}</span>
            <span>{{ EVA_MAP_SCI_MODE_LABEL.label }}</span>
          </div>
        </div>
        <div v-else-if="showCombatHud()" class="flex gap-1">
          <div
            v-for="(cfg, mode) in MODE_LABELS"
            :key="mode"
            class="flex items-center gap-1 rounded px-3 py-1.5 text-xs tracking-wider uppercase transition-all duration-150"
            :class="telemetry.activeMode === mode ? 'bg-white/15' : 'bg-white/5 opacity-50'"
            :style="
              telemetry.activeMode === mode
                ? { borderBottom: '2px solid ' + cfg.color, color: cfg.color }
                : {}
            "
          >
            <span class="text-white/40">{{ cfg.key }}</span>
            <span>{{ cfg.label }}</span>
          </div>
        </div>
      </div>

      <div class="flex w-32 shrink-0 flex-col gap-1">
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
