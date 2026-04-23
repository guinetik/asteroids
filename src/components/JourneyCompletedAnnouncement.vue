<!-- src/components/JourneyCompletedAnnouncement.vue -->
<script setup lang="ts">
/**
 * Full-screen horizontal stripe announcement when a player journey completes.
 * Mirrors {@link UpgradeInstalledAnnouncement} in animation and layout, but uses
 * the amber/gold palette that all journey-related UI now shares.
 *
 * @author guinetik
 * @date 2026-04-22
 */
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { Timer, type TimerHandle } from '@/lib/Timer'

/** Seconds for the panel to expand (keep in sync with main.css `journey-completed-open`). */
const OPEN_DURATION_SEC = 0.6
/** Seconds the message stays fully open. */
const HOLD_DURATION_SEC = 3.2
/** Seconds for the collapse animation (keep in sync with main.css `journey-completed-close`). */
const CLOSE_DURATION_SEC = 0.8

const props = withDefaults(
  defineProps<{
    visible: boolean
    /** Upper line (small caps), e.g. JOURNEY COMPLETE. */
    headline?: string
    /** Journey title (large), e.g. Inner System. */
    title: string
    /** Meta line below the title (objective summary, one-line flavor). */
    metaText?: string
  }>(),
  {
    headline: 'JOURNEY COMPLETE',
    metaText: '',
  },
)

const emit = defineEmits<{
  dismissed: []
}>()

const phase = ref<'closed' | 'opening' | 'open' | 'closing'>('closed')
const removed = ref(false)
let sequenceHandle: TimerHandle | undefined

function cancelSequence(): void {
  if (sequenceHandle !== undefined) {
    Timer.cancel(sequenceHandle)
    sequenceHandle = undefined
  }
}

watch(
  () => props.visible,
  async (val) => {
    cancelSequence()
    if (!val) {
      phase.value = 'closed'
      removed.value = false
      return
    }
    await nextTick()
    removed.value = false
    phase.value = 'opening'
    sequenceHandle = Timer.sequence([
      { delay: OPEN_DURATION_SEC, fn: () => { phase.value = 'open' } },
      { delay: HOLD_DURATION_SEC, fn: () => { phase.value = 'closing' } },
      {
        delay: CLOSE_DURATION_SEC,
        fn: () => {
          removed.value = true
          emit('dismissed')
        },
      },
    ])
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  cancelSequence()
})
</script>

<template>
  <div
    v-if="visible && !removed"
    class="journey-completed-announcement"
    :class="`journey-completed-announcement--${phase}`"
  >
    <div class="journey-completed-announcement__content">
      <div class="journey-completed-announcement__eyebrow">{{ props.headline }}</div>
      <div class="journey-completed-announcement__divider" />
      <div class="journey-completed-announcement__title">{{ props.title }}</div>
      <div v-if="props.metaText" class="journey-completed-announcement__meta">
        {{ props.metaText }}
      </div>
    </div>
  </div>
</template>
