<!--
  ProspectusOverlay.vue — Jovian Society terminal readout for contract step 9.
  Two CTAs (TRANSMIT / TAMPER) call `onResolve` with the chosen outcome id.

  @author guinetik
  @date 2026-04-30
  @spec docs/superpowers/specs/2026-04-29-jovian-prospectus-minigame-design.md
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { buildProspectusAssetCard } from '@/lib/minigame/prospectus/prospectusAssetCard'
import { generatePhotometryLightcurve } from '@/lib/minigame/prospectus/photometryLightcurve'
import { generateDanHistogram } from '@/lib/minigame/prospectus/danHistogram'
import { ProspectusAudio } from '@/lib/minigame/prospectus/prospectusAudio'

const props = defineProps<{
  /** Asteroid catalog id (drives asset-card binding). */
  bodyId: string
  /** Resolve handler — fired exactly once with the chosen outcome. */
  onResolve: (outcomeId: 'transmit' | 'tamper') => void
}>()

/** Derived asset card from catalog — null when bodyId is unknown. */
const card = computed(() => buildProspectusAssetCard(props.bodyId))

/** Canvas ref for the photometry lightcurve plot. */
const photometryCanvas = ref<HTMLCanvasElement | null>(null)

/** Canvas ref for the DAN depth histogram. */
const danCanvas = ref<HTMLCanvasElement | null>(null)

/** State machine: idle | awaiting-choice | resolving | resolved. */
type OverlayPhase = 'idle' | 'awaiting-choice' | 'resolving' | 'resolved'

/** Current phase of the overlay interaction state machine. */
const phase = ref<OverlayPhase>('idle')

/**
 * Synthesized audio engine for this overlay instance.
 * Created on mount, nulled on unmount. `let` (not `const`) because it is
 * reassigned to `null` during cleanup to release the reference.
 * In JSDOM (tests), `ProspectusAudio.ensureGraph()` returns false and all
 * play methods become no-ops — nothing here throws without a real AudioContext.
 */
let audio: ProspectusAudio | null = null

/** Society blue accent used for the photometry stroke and DAN bars. */
const SOCIETY_BLUE = '#2C5BB0'

/** Near-black canvas background. */
const CANVAS_BG = '#0c1118'

/** Idle settle window before CTAs become hot, in ms. */
const SETTLE_MS = 1500

/** Lockout window after a CTA fires, before onResolve dispatches, in ms. */
const RESOLVING_MS = 1500

onMounted(() => {
  audio = new ProspectusAudio()
  audio.playAmbient()
  drawLightcurve()
  drawHistogram()
  window.setTimeout(() => {
    if (phase.value === 'idle') phase.value = 'awaiting-choice'
  }, SETTLE_MS)
  window.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  audio?.stopAmbient()
  audio?.dispose()
  audio = null
  window.removeEventListener('keydown', onKeydown, true)
})

/** Draw the photometric lightcurve onto the photometry canvas. */
function drawLightcurve(): void {
  const cv = photometryCanvas.value
  if (!cv) return
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const samples = generatePhotometryLightcurve('hektor-photometry', cv.width)
  ctx.fillStyle = CANVAS_BG
  ctx.fillRect(0, 0, cv.width, cv.height)
  ctx.strokeStyle = SOCIETY_BLUE
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = 0; i < samples.length; i++) {
    const x = i
    const y = cv.height - (samples[i] ?? 0) * cv.height
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

/** Draw the DAN depth histogram onto the DAN canvas. */
function drawHistogram(): void {
  const cv = danCanvas.value
  if (!cv) return
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const bins = generateDanHistogram('hektor-dan')
  ctx.fillStyle = CANVAS_BG
  ctx.fillRect(0, 0, cv.width, cv.height)
  ctx.fillStyle = SOCIETY_BLUE
  const binWidth = cv.width / bins.length
  for (let i = 0; i < bins.length; i++) {
    const h = (bins[i] ?? 0) * cv.height
    ctx.fillRect(i * binWidth, cv.height - h, binWidth - 1, h)
  }
}

/** Handle keyboard shortcuts: E = transmit, Q = tamper. */
function onKeydown(e: KeyboardEvent): void {
  if (phase.value !== 'awaiting-choice') return
  if (e.key === 'e' || e.key === 'E') return resolve('transmit')
  if (e.key === 'q' || e.key === 'Q') return resolve('tamper')
}

/** Transition to resolving phase, then dispatch the chosen outcome. */
function resolve(outcomeId: 'transmit' | 'tamper'): void {
  if (phase.value !== 'awaiting-choice') return
  phase.value = 'resolving'
  audio?.stopAmbient()
  if (outcomeId === 'transmit') audio?.playTransmit()
  else audio?.playTamper()
  window.setTimeout(() => {
    phase.value = 'resolved'
    props.onResolve(outcomeId)
  }, RESOLVING_MS)
}
</script>

<template>
  <div class="prospectus-overlay" data-test="prospectus-overlay">
    <div class="prospectus-overlay__panel">
      <header class="prospectus-overlay__header">
        <span class="prospectus-overlay__logo">☁</span>
        <div>
          <div class="prospectus-overlay__brand">JOVIAN SOCIETY</div>
          <div class="prospectus-overlay__subbrand">ASSET STRATEGY · INTERNAL</div>
          <div class="prospectus-overlay__title">Prospectus Compilation</div>
          <div class="prospectus-overlay__cohort">Cohort: Q4 / 2306</div>
        </div>
      </header>

      <section v-if="card" class="prospectus-overlay__asset-card">
        <div class="prospectus-overlay__asset-ref">{{ card.assetRef }} · {{ card.crossRef }}</div>
        <div>Region: {{ card.region }}</div>
        <div>Class: {{ card.classLabel }}</div>
        <div>Mean diameter: {{ card.diameterKm }} km</div>
        <div>Status: Pending disposition</div>
      </section>

      <section class="prospectus-overlay__photometry">
        <canvas ref="photometryCanvas" width="280" height="80" />
        <ul v-if="card" class="prospectus-overlay__composition">
          <li v-for="row in card.composition" :key="row.name">
            {{ row.name }}: {{ row.percentage }}%
          </li>
        </ul>
      </section>

      <section class="prospectus-overlay__dan">
        <canvas ref="danCanvas" width="280" height="80" />
        <ul class="prospectus-overlay__dan-labels">
          <li>Subsurface volatile signature: STRONG</li>
          <li>Lattice-positive bands: 6</li>
          <li>Phobos reference family match: 87%</li>
        </ul>
      </section>

      <section class="prospectus-overlay__recommendation">
        <h3>RECOMMENDATION</h3>
        <p v-if="card">{{ card.recommendation }}</p>
      </section>

      <footer class="prospectus-overlay__ctas">
        <button
          type="button"
          class="prospectus-overlay__cta prospectus-overlay__cta--transmit"
          :disabled="phase !== 'awaiting-choice'"
          @click="resolve('transmit')"
        >
          [E] TRANSMIT REPORT — recommended
        </button>
        <button
          type="button"
          class="prospectus-overlay__cta prospectus-overlay__cta--tamper"
          :disabled="phase !== 'awaiting-choice'"
          @click="resolve('tamper')"
        >
          [Q] Tamper Report
        </button>
      </footer>
    </div>
  </div>
</template>
