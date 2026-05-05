<script setup lang="ts">
/**
 * Accept / decline button row rendered inside the mail reader for a contract intro
 * message. Emits structured events; the parent owns the call into ContractSystem.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-contracts-design.md
 */
import { computed } from 'vue'
import type { Contract, ContractInstance, ContractStep } from '@/lib/contracts/contractTypes'
import { formatContractStepLabel } from '@/lib/contracts/contractStepLabel'

const props = defineProps<{
  /** Contract definition the message belongs to. */
  contract: Contract
  /** Persisted instance for this contract (or null when nothing exists yet). */
  instance: ContractInstance | null
}>()

const emit = defineEmits<{
  accept: [contractId: string]
  decline: [contractId: string]
}>()

const STEP_MARKER_DONE = '\u2713'
const STEP_MARKER_CURRENT = '\u25B8'
const STEP_MARKER_PENDING = '\u00B7'

const status = computed(() => props.instance?.status ?? 'available')

function requiredCount(step: ContractStep): number {
  if (step.kind === 'complete-missions') return step.count
  if (step.kind === 'trade-goods') return step.count
  if (step.kind === 'collect-drops') return step.count
  return 1
}

interface StepEntry {
  index: number
  state: 'done' | 'current' | 'pending'
  marker: string
  label: string
  progressLabel: string | null
}

const stepEntries = computed<StepEntry[]>(() =>
  props.contract.steps.map((step, index) => {
    const instance = props.instance
    const required = requiredCount(step)
    const label = formatContractStepLabel(step)

    if (!instance || instance.status === 'available' || instance.status === 'declined') {
      return {
        index,
        state: 'pending',
        marker: STEP_MARKER_PENDING,
        label,
        progressLabel:
          step.kind === 'complete-missions' || step.kind === 'trade-goods' ? `0/${required}` : null,
      }
    }

    const counter = instance.stepCounters[index] ?? 0
    const completed =
      instance.status === 'completed' || index < instance.currentStepIndex || counter >= required
    if (completed) {
      return {
        index,
        state: 'done',
        marker: STEP_MARKER_DONE,
        label,
        progressLabel:
          step.kind === 'complete-missions' || step.kind === 'trade-goods'
            ? `${required}/${required}`
            : null,
      }
    }

    const isCurrent = instance.status === 'active' && index === instance.currentStepIndex
    return {
      index,
      state: isCurrent ? 'current' : 'pending',
      marker: isCurrent ? STEP_MARKER_CURRENT : STEP_MARKER_PENDING,
      label,
      progressLabel:
        step.kind === 'complete-missions' || step.kind === 'trade-goods'
          ? `${counter}/${required}`
          : null,
    }
  }),
)

const progressSummary = computed(() => {
  const total = props.contract.steps.length
  const done = stepEntries.value.filter((entry) => entry.state === 'done').length
  return { done, total }
})

const headerLabel = computed(() => {
  if (status.value === 'active') return 'Contract Progress'
  if (status.value === 'completed') return 'Contract Complete'
  if (status.value === 'declined') return 'Contract Declined'
  return 'Contract Offer'
})
</script>

<template>
  <section class="contract-accept-card" :data-status="status">
    <header class="contract-accept-card__header">
      <span class="contract-accept-card__chrome">
        {{ headerLabel }} · {{ props.contract.inboxName }}
        <template v-if="status === 'active'">
          · {{ progressSummary.done }}/{{ progressSummary.total }}
        </template>
      </span>
      <span class="contract-accept-card__status">{{ status }}</span>
    </header>

    <ol class="contract-accept-card__steps">
      <li
        v-for="entry in stepEntries"
        :key="entry.index"
        class="contract-accept-card__step"
        :data-state="entry.state"
      >
        <span class="contract-accept-card__step-marker" aria-hidden="true">{{ entry.marker }}</span>
        <span class="contract-accept-card__step-label"
          >{{ entry.index + 1 }}. {{ entry.label }}</span
        >
        <span v-if="entry.progressLabel" class="contract-accept-card__step-progress">
          {{ entry.progressLabel }}
        </span>
      </li>
    </ol>

    <ul class="contract-accept-card__rewards">
      <li v-for="(reward, idx) in props.contract.rewards" :key="idx">
        <template v-if="reward.type === 'fast-travel'">
          Reward — Fast travel kiosk unlocked at <strong>{{ reward.planetId }}</strong>
        </template>
        <template v-else-if="reward.type === 'mission-pay-multiplier'">
          Reward — {{ reward.multiplier }}× mission pay at <strong>{{ reward.planetId }}</strong>
        </template>
        <template v-else-if="reward.type === 'shuttle-upgrade'">
          Reward — Upgrade <strong>{{ reward.upgradeId }}</strong> to Lvl
          <strong>{{ reward.minLevel }}</strong>
        </template>
      </li>
    </ul>

    <footer class="contract-accept-card__footer">
      <template v-if="status === 'available'">
        <button
          type="button"
          class="contract-accept-card__btn contract-accept-card__btn--primary"
          @click="emit('accept', props.contract.id)"
        >
          Accept Contract
        </button>
        <button
          type="button"
          class="contract-accept-card__btn contract-accept-card__btn--secondary"
          @click="emit('decline', props.contract.id)"
        >
          Decline
        </button>
      </template>
      <template v-else-if="status === 'active'">
        <span class="contract-accept-card__pill contract-accept-card__pill--active"
          >In progress</span
        >
      </template>
      <template v-else-if="status === 'completed'">
        <span class="contract-accept-card__pill contract-accept-card__pill--done">Completed</span>
      </template>
      <template v-else-if="status === 'declined'">
        <span class="contract-accept-card__pill contract-accept-card__pill--declined"
          >Declined</span
        >
      </template>
    </footer>
  </section>
</template>

<style scoped>
.contract-accept-card {
  margin: calc(18px * var(--mail-type-scale, 1)) 0 calc(12px * var(--mail-type-scale, 1));
  padding: calc(16px * var(--mail-type-scale, 1));
  border: 1px solid rgba(106, 232, 196, 0.2);
  background: rgba(106, 232, 196, 0.03);
  border-radius: calc(4px * var(--mail-type-scale, 1));
  display: grid;
  gap: calc(12px * var(--mail-type-scale, 1));
  position: relative;
}

.contract-accept-card::before {
  content: '';
  position: absolute;
  top: -1px;
  left: -1px;
  width: calc(8px * var(--mail-type-scale, 1));
  height: calc(8px * var(--mail-type-scale, 1));
  border-top: 2px solid #6ae8c4;
  border-left: 2px solid #6ae8c4;
}

.contract-accept-card::after {
  content: '';
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: calc(8px * var(--mail-type-scale, 1));
  height: calc(8px * var(--mail-type-scale, 1));
  border-bottom: 2px solid #6ae8c4;
  border-right: 2px solid #6ae8c4;
}

.contract-accept-card__header {
  display: flex;
  justify-content: space-between;
  font-size: calc(11px * var(--mail-type-scale, 1));
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(106, 232, 196, 0.6);
  border-bottom: 1px solid rgba(106, 232, 196, 0.15);
  padding-bottom: calc(12px * var(--mail-type-scale, 1));
}

.contract-accept-card__steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: calc(8px * var(--mail-type-scale, 1));
  font-size: calc(13px * var(--mail-type-scale, 1));
  color: rgba(220, 248, 240, 0.9);
}

.contract-accept-card__step {
  display: grid;
  grid-template-columns: calc(16px * var(--mail-type-scale, 1)) 1fr auto;
  align-items: baseline;
  gap: calc(10px * var(--mail-type-scale, 1));
  padding: calc(2px * var(--mail-type-scale, 1)) 0;
}

.contract-accept-card__step-marker {
  font-family: inherit;
  font-size: calc(13px * var(--mail-type-scale, 1));
  text-align: center;
  color: rgba(177, 228, 214, 0.35);
}

.contract-accept-card__step-label {
  color: rgba(177, 228, 214, 0.55);
}

.contract-accept-card__step-progress {
  font-size: calc(11px * var(--mail-type-scale, 1));
  letter-spacing: 0.1em;
  color: rgba(177, 228, 214, 0.5);
  font-variant-numeric: tabular-nums;
}

.contract-accept-card__step[data-state='current'] .contract-accept-card__step-marker {
  color: #6ae8c4;
}

.contract-accept-card__step[data-state='current'] .contract-accept-card__step-label {
  color: #dcf8f0;
}

.contract-accept-card__step[data-state='current'] .contract-accept-card__step-progress {
  color: #6ae8c4;
}

.contract-accept-card__step[data-state='done'] .contract-accept-card__step-marker {
  color: #a6e864;
}

.contract-accept-card__step[data-state='done'] .contract-accept-card__step-label {
  color: rgba(220, 248, 240, 0.7);
  text-decoration: line-through;
  text-decoration-color: rgba(166, 232, 100, 0.35);
}

.contract-accept-card__step[data-state='done'] .contract-accept-card__step-progress {
  color: rgba(166, 232, 100, 0.75);
}

.contract-accept-card__rewards {
  list-style: none;
  margin: 0;
  padding: calc(12px * var(--mail-type-scale, 1));
  border: 1px solid rgba(106, 232, 196, 0.15);
  background: rgba(106, 232, 196, 0.05);
  border-radius: calc(2px * var(--mail-type-scale, 1));
  font-size: calc(12px * var(--mail-type-scale, 1));
  color: rgba(177, 228, 214, 0.9);
  display: grid;
  gap: calc(6px * var(--mail-type-scale, 1));
}

.contract-accept-card__rewards strong {
  color: #6ae8c4;
  font-weight: 600;
}

.contract-accept-card__footer {
  display: flex;
  align-items: center;
  gap: calc(12px * var(--mail-type-scale, 1));
  margin-top: calc(4px * var(--mail-type-scale, 1));
}

.contract-accept-card__btn {
  appearance: none;
  background: transparent;
  border: 1px solid rgba(106, 232, 196, 0.3);
  color: rgba(177, 228, 214, 0.8);
  padding: calc(8px * var(--mail-type-scale, 1)) calc(16px * var(--mail-type-scale, 1));
  font-family: inherit;
  font-size: calc(11px * var(--mail-type-scale, 1));
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 120ms ease;
  border-radius: calc(2px * var(--mail-type-scale, 1));
}

.contract-accept-card__btn--primary {
  background: rgba(106, 232, 196, 0.1);
  color: #6ae8c4;
  border-color: rgba(106, 232, 196, 0.5);
}

.contract-accept-card__btn--primary:hover {
  background: rgba(106, 232, 196, 0.25);
  border-color: #6ae8c4;
  box-shadow: 0 0 calc(12px * var(--mail-type-scale, 1)) rgba(106, 232, 196, 0.2);
}

.contract-accept-card__btn--secondary:hover {
  border-color: #6ae8c4;
  color: #6ae8c4;
}

.contract-accept-card__pill {
  display: inline-flex;
  padding: calc(4px * var(--mail-type-scale, 1)) calc(10px * var(--mail-type-scale, 1));
  font-size: calc(10px * var(--mail-type-scale, 1));
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  border-radius: calc(2px * var(--mail-type-scale, 1));
}

.contract-accept-card__pill--active {
  background: rgba(106, 232, 196, 0.15);
  color: #6ae8c4;
  border: 1px solid rgba(106, 232, 196, 0.3);
}

.contract-accept-card__pill--done {
  background: rgba(166, 232, 100, 0.15);
  color: #a6e864;
  border: 1px solid rgba(166, 232, 100, 0.3);
}

.contract-accept-card__pill--declined {
  background: rgba(255, 132, 100, 0.15);
  color: #ff8464;
  border: 1px solid rgba(255, 132, 100, 0.3);
}
</style>
