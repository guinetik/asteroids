<script setup lang="ts">
/**
 * Expandable list of active contracts for the solar map HUD (cyan mission palette).
 * Single-expand accordion; clicking the objective emits `openObjective` so MapView can
 * deep-link shuttle mail to the step flavor message.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-20-contracts-design.md
 */
import { ref, watch } from 'vue'
import type { ActiveContractHudRow } from '@/lib/contracts/contractHudRows'

const props = defineProps<{
  /** Rows produced by {@link buildActiveContractHudRows}. */
  contracts: readonly ActiveContractHudRow[]
}>()

const emit = defineEmits<{
  /** Parent opens shuttle mail at folder + step flavor message id. */
  openObjective: [payload: { contractId: string; stepIndex: number }]
}>()

/** Landmark label for assistive tech (`aria-label`). */
const CONTRACT_TRACKER_ARIA_LABEL = 'Active contracts'

const expandedContractId = ref<string | null>(null)

watch(
  () => props.contracts.map((r) => r.contractId).join('|'),
  () => {
    if (expandedContractId.value === null) return
    if (!props.contracts.some((r) => r.contractId === expandedContractId.value)) {
      expandedContractId.value = null
    }
  },
)

function toggleContract(contractId: string): void {
  expandedContractId.value = expandedContractId.value === contractId ? null : contractId
}

function emitOpen(row: ActiveContractHudRow): void {
  emit('openObjective', { contractId: row.contractId, stepIndex: row.currentStepIndex })
}
</script>

<template>
  <section class="contract-tracker-panel" :aria-label="CONTRACT_TRACKER_ARIA_LABEL" role="region">
    <header class="contract-tracker-panel__header">
      <span class="contract-tracker-panel__eyebrow">Contracts</span>
    </header>
    <ul class="contract-tracker-panel__list">
      <li v-for="row in contracts" :key="row.contractId" class="contract-tracker-panel__item">
        <button
          type="button"
          class="contract-tracker-panel__contract-btn"
          :aria-expanded="expandedContractId === row.contractId"
          @click="toggleContract(row.contractId)"
        >
          <span class="contract-tracker-panel__contract-main">
            <span class="contract-tracker-panel__contract-label">{{ row.inboxName }}</span>
            <span class="contract-tracker-panel__objective-summary">
              {{ row.objectiveSummary }}
            </span>
          </span>
          <span class="contract-tracker-panel__chevron" aria-hidden="true">{{
            expandedContractId === row.contractId ? '\u2212' : '+'
          }}</span>
        </button>
        <div v-if="expandedContractId === row.contractId" class="contract-tracker-panel__detail">
          <button
            type="button"
            class="contract-tracker-panel__objective-btn"
            @click="emitOpen(row)"
          >
            {{ row.objectiveSubject }}
          </button>
          <p v-if="row.progressRequired > 1" class="contract-tracker-panel__progress">
            {{ row.progressCurrent }}/{{ row.progressRequired }}
          </p>
        </div>
      </li>
    </ul>
  </section>
</template>

<style>
.contract-tracker-panel {
  --tracker-bg: rgba(0, 10, 15, 0.5);
  --tracker-border: rgba(0, 255, 204, 0.15);
  --tracker-border-soft: rgba(0, 255, 204, 0.1);
  --tracker-eyebrow: rgba(0, 255, 204, 0.4);
  --tracker-title: rgba(0, 255, 204, 0.8);
  --tracker-text: rgba(255, 255, 255, 0.6);
  --tracker-text-dim: rgba(255, 255, 255, 0.35);
  --tracker-text-bright: rgba(255, 255, 255, 0.85);
  --tracker-accent: rgba(0, 255, 204, 0.5);
  --tracker-accent-strong: rgba(0, 255, 204, 0.95);
  --tracker-progress: rgba(0, 255, 204, 0.7);

  pointer-events: auto;
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.75rem 1rem;
  background: var(--tracker-bg);
  border: 1px solid var(--tracker-border);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.contract-tracker-panel__header {
  border-bottom: 1px solid var(--tracker-border);
  padding-bottom: 0.35rem;
}

.contract-tracker-panel__eyebrow {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.65rem;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--tracker-eyebrow);
}

.contract-tracker-panel__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.contract-tracker-panel__item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.contract-tracker-panel__contract-btn {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border: none;
  background: transparent;
  padding: 0.35rem 0;
  cursor: pointer;
  text-align: left;
}

.contract-tracker-panel__contract-main {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.contract-tracker-panel__contract-label {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--tracker-title);
}

.contract-tracker-panel__objective-summary {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.6rem;
  line-height: 1.3;
  letter-spacing: 0.06em;
  color: var(--tracker-text);
  text-transform: none;
}

.contract-tracker-panel__chevron {
  flex-shrink: 0;
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.75rem;
  color: var(--tracker-accent);
}

.contract-tracker-panel__detail {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.25rem 0 0.15rem 0.6rem;
  border-left: 1px solid var(--tracker-border-soft);
  margin-left: 0.2rem;
}

.contract-tracker-panel__objective-btn {
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  text-align: left;
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.65rem;
  line-height: 1.35;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--tracker-text-bright);
  transition: color 0.2s ease;
}

.contract-tracker-panel__objective-btn:hover {
  color: var(--tracker-accent-strong);
}

.contract-tracker-panel__progress {
  margin: 0;
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.6rem;
  letter-spacing: 0.06em;
  color: var(--tracker-progress);
  font-variant-numeric: tabular-nums;
}
</style>
