<!-- src/components/UpgradeInstalledAnnouncement.vue -->
<script setup lang="ts">
/**
 * Full-screen horizontal stripe announcement when a spaceport upgrade purchase succeeds.
 * Animation timing matches {@link MissionAnnouncement} (level mission toasts).
 *
 * @author guinetik
 * @date 2026-04-08
 */
import { ref, watch, nextTick, onBeforeUnmount, computed } from 'vue'
import { Timer, type TimerHandle } from '@/lib/Timer'

/** Seconds for the panel to expand (keep in sync with main.css `upgrade-installed-open`). */
const OPEN_DURATION_SEC = 0.6
/** Seconds the message stays fully open. */
const HOLD_DURATION_SEC = 3.2
/** Seconds for the collapse animation (keep in sync with main.css `upgrade-installed-close`). */
const CLOSE_DURATION_SEC = 0.8

const props = withDefaults(
  defineProps<{
    visible: boolean
    /** Upper line (small caps), e.g. UPGRADE INSTALLED. */
    headline?: string
    /** Upgrade display name (large). */
    upgradeName: string
    /** Purchased tier (1–3). */
    tier: number
    /** Credits spent on this tier (shown as debit). */
    creditsSpent?: number
    /** Optional replacement for the default tier/credit line. */
    metaText?: string
  }>(),
  {
    headline: 'UPGRADE INSTALLED',
    creditsSpent: 0,
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
      {
        delay: OPEN_DURATION_SEC,
        fn: () => {
          phase.value = 'open'
        },
      },
      {
        delay: HOLD_DURATION_SEC,
        fn: () => {
          phase.value = 'closing'
        },
      },
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

const metaLabel = computed(
  () => props.metaText ?? `Tier ${props.tier} · −${(props.creditsSpent ?? 0).toLocaleString()} CR`,
)
</script>

<template>
  <div
    v-if="visible && !removed"
    class="upgrade-installed-announcement"
    :class="`upgrade-installed-announcement--${phase}`"
  >
    <div class="upgrade-installed-announcement__content">
      <div class="upgrade-installed-announcement__eyebrow">{{ headline }}</div>
      <div class="upgrade-installed-announcement__divider" />
      <div class="upgrade-installed-announcement__title">{{ upgradeName }}</div>
      <div class="upgrade-installed-announcement__meta">
        {{ metaLabel }}
      </div>
    </div>
  </div>
</template>
