<!--
  TelescopeAlignmentCanvas.vue

  Overlay canvas for the telescope alignment minigame. Structured as a fixed
  full-viewport panel with: status bar, eyepiece (blurred / chromatic /
  offset image), four knob slots, 2D pointing indicator, signal-quality bar,
  controls hint row. Interactivity lands in Task 8; image rendering in
  Task 9; drift + lock-in in Task 10.

  @author guinetik
  @date 2026-04-20
  @spec docs/superpowers/specs/2026-04-19-telescope-alignment-design.md
-->
<script setup lang="ts">
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import type { TelescopeAlignmentMiniGame } from '@/lib/minigame/telescopeAlignment/TelescopeAlignmentMiniGame'
import { getTelescopeTarget } from '@/lib/minigame/telescopeAlignment/targets'

const props = defineProps<{
  /** The EVA mission opening this overlay. */
  mission: ActiveVisitRelayMission
  /** Active telescope minigame instance. */
  minigame: TelescopeAlignmentMiniGame
}>()

const emit = defineEmits<{
  /** User completed the minigame. */
  complete: []
  /** User dismissed the overlay. */
  close: []
}>()

const target = getTelescopeTarget(props.mission.template.id)

/** Placeholder handler until lock-in ships in Task 11. */
function handleTempComplete(): void {
  props.minigame.complete()
  emit('complete')
}
</script>

<template>
  <div class="telescope-overlay">
    <div class="telescope-status">
      <span class="telescope-status__location">{{ target.label }}</span>
      <span class="telescope-status__mission">{{ mission.template.name }}</span>
      <span class="telescope-status__state">CALIBRATING</span>
    </div>

    <div class="telescope-body">
      <div class="telescope-eyepiece" aria-label="Telescope eyepiece">
        <div class="telescope-eyepiece__placeholder" />
      </div>

      <div class="telescope-knobs">
        <div class="telescope-knob">
          <div class="telescope-knob__dial" data-axis="focus" />
          <div class="telescope-knob__label">FOCUS · Q/W</div>
          <div class="telescope-knob__bar"><span style="width: 0%;" /></div>
        </div>
        <div class="telescope-knob">
          <div class="telescope-knob__dial" data-axis="chroma" />
          <div class="telescope-knob__label">CHROMA · A/S</div>
          <div class="telescope-knob__bar"><span style="width: 0%;" /></div>
        </div>
        <div class="telescope-pointing">
          <div class="telescope-pointing__crosshair" />
          <div class="telescope-pointing__caption">OFF</div>
        </div>
        <div class="telescope-knob">
          <div class="telescope-knob__dial" data-axis="azimuth" />
          <div class="telescope-knob__label">AZIMUTH · Z/X</div>
          <div class="telescope-knob__bar"><span style="width: 0%;" /></div>
        </div>
        <div class="telescope-knob">
          <div class="telescope-knob__dial" data-axis="elevation" />
          <div class="telescope-knob__label">ELEVATION · C/V</div>
          <div class="telescope-knob__bar"><span style="width: 0%;" /></div>
        </div>
      </div>
    </div>

    <div class="telescope-quality">
      <div class="telescope-quality__label">SIGNAL QUALITY</div>
      <div class="telescope-quality__bar"><span style="width: 0%;" /></div>
      <div class="telescope-quality__pct">0%</div>
    </div>

    <div class="telescope-hints">
      <span>Q/W FOCUS</span>
      <span>A/S CHROMA</span>
      <span>Z/X AZ</span>
      <span>C/V EL</span>
      <span>SHIFT · FINE</span>
      <span>E · LOCK IN (≥95%)</span>
      <span>ESC · ABORT</span>
    </div>

    <button type="button" class="telescope-temp-complete" @click="handleTempComplete">
      (WIP) Complete
    </button>
    <button type="button" class="telescope-close" @click="emit('close')">Close</button>
  </div>
</template>

<style scoped>
.telescope-overlay {
  @apply fixed inset-0 z-50 flex flex-col gap-4 p-6 font-mono text-cyan-100;
  background-color: #05070c;
}
.telescope-status {
  @apply flex justify-between items-center border border-cyan-400/25 px-4 py-2 text-sm tracking-widest;
}
.telescope-body {
  @apply flex-1 grid gap-4;
  grid-template-columns: 1fr 360px;
}
.telescope-eyepiece {
  @apply relative rounded-full overflow-hidden border border-cyan-400/25 self-center justify-self-center;
  width: 780px;
  height: 780px;
  max-width: 80vmin;
  max-height: 80vmin;
  aspect-ratio: 1 / 1;
}
.telescope-eyepiece__placeholder {
  @apply absolute inset-0;
  background: radial-gradient(circle at 50% 50%, #1e293b 0%, #05070c 80%);
}
.telescope-knobs {
  @apply flex flex-col gap-3;
}
.telescope-knob {
  @apply flex flex-col gap-1 border border-cyan-400/25 p-2 rounded-sm;
}
.telescope-knob__dial {
  @apply w-[72px] h-[72px] border border-cyan-400/40 rounded-full self-center;
}
.telescope-knob__label {
  @apply text-xs tracking-widest text-center;
}
.telescope-knob__bar {
  @apply h-1 bg-cyan-400/10;
}
.telescope-knob__bar span {
  @apply block h-full bg-cyan-400;
}
.telescope-pointing {
  @apply flex flex-col items-center gap-1 border border-cyan-400/25 p-2 rounded-sm;
}
.telescope-pointing__crosshair {
  @apply w-[72px] h-[72px] border border-cyan-400/40;
}
.telescope-pointing__caption {
  @apply text-xs tracking-widest;
}
.telescope-quality {
  @apply flex items-center gap-3 border border-cyan-400/25 px-4 py-2 text-sm;
}
.telescope-quality__bar {
  @apply flex-1 h-2 bg-cyan-400/10;
}
.telescope-quality__bar span {
  @apply block h-full bg-cyan-400;
}
.telescope-hints {
  @apply flex flex-wrap gap-4 text-xs tracking-widest text-cyan-200;
}
.telescope-temp-complete,
.telescope-close {
  @apply absolute top-4 right-4 px-3 py-1 border border-cyan-400/40 rounded text-cyan-100;
}
.telescope-close {
  right: 140px;
}
</style>
