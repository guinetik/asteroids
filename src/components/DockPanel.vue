<script setup lang="ts">
/**
 * Docking panel shown when the player approaches and docks at a pinned station
 * asset. Renders the active contract step's flavor text and an action button
 * (TAKE PACKAGE or HAND OVER) when the current step targets this station.
 *
 * @author guinetik
 * @date 2026-05-05
 * @spec docs/superpowers/specs/2026-05-05-ceres-station-dock-system-design.md
 */
import { ref, computed } from 'vue'
import { contractSystem } from '@/lib/contracts/runtime'

/** Props accepted by {@link DockPanel}. */
interface Props {
  /** Asset ref the player docked at; null when panel is closed. */
  assetRef: string | null
  /** Optional station label shown in the header; defaults to 'STATION'. */
  label?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  /** Emitted when the panel should close (cancel or post-action). */
  close: []
}>()

/** True while a confirm action is in flight; prevents double-clicks. */
const confirming = ref(false)

/** Active contract step targeting this asset, or null if none. */
const active = computed(() =>
  props.assetRef ? contractSystem.getActiveStepForAsset(props.assetRef) : null,
)

/** CTA label derived from the active step kind, or null for idle docks. */
const verb = computed(() => {
  const k = active.value?.step.kind
  if (k === 'pickup-from-asset') return 'TAKE PACKAGE'
  if (k === 'deliver-to-asset') return 'HAND OVER'
  return null
})

/** Flavor paragraphs from the active step, or idle station copy. */
const flavor = computed(() => {
  const step = active.value?.step
  if (step && (step.kind === 'pickup-from-asset' || step.kind === 'deliver-to-asset')) {
    return step.flavor
  }
  return [
    'The dock cycle completes. The station hums, indifferent.',
    'Nothing here for you today.',
  ]
})

/** Header text built from the optional label prop. */
const headerText = computed(() =>
  props.label ? `${props.label} · DOCK` : 'STATION · DOCK',
)

/** Confirm the docking action and close the panel. */
function onConfirm(): void {
  if (!props.assetRef || confirming.value) return
  confirming.value = true
  contractSystem.notifyDockedAtAsset(props.assetRef)
  emit('close')
}
</script>

<template>
  <div v-if="assetRef" class="dock-panel">
    <header class="dock-panel-header">{{ headerText }}</header>
    <section class="dock-panel-body">
      <p v-for="(p, i) in flavor" :key="i">{{ p }}</p>
    </section>
    <footer class="dock-panel-footer">
      <button
        v-if="verb"
        type="button"
        class="dock-panel-confirm"
        :disabled="confirming"
        @click="onConfirm"
      >{{ verb }}</button>
      <button type="button" class="dock-panel-close" @click="emit('close')">CLOSE</button>
    </footer>
  </div>
</template>
