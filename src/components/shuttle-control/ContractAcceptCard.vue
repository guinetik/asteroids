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
import type { Contract, ContractInstance } from '@/lib/contracts/contractTypes'

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

const status = computed(() => props.instance?.status ?? 'available')

const stepLines = computed(() =>
  props.contract.steps.map((step, index) => {
    const ordinal = `${index + 1}.`
    if (step.kind === 'complete-missions') {
      const filterBits: string[] = []
      if (step.missionType) filterBits.push(`${step.missionType} mission`)
      else filterBits.push('mission')
      if (step.giverId) filterBits.push(`for ${step.giverId}`)
      if (step.giverPlanetId) filterBits.push(`from ${step.giverPlanetId}`)
      const filterLabel = filterBits.join(' ')
      return `${ordinal} Complete ${step.count} ${filterLabel}${step.count === 1 ? '' : 's'}`
    }
    if (step.kind === 'install-upgrade') {
      return `${ordinal} Install ${step.upgradeId} (Lvl ${step.minLevel}+)`
    }
    if (step.kind === 'visit-planet') {
      return `${ordinal} Enter orbit at ${step.planetId}`
    }
    return `${ordinal} Complete an orbital mission at ${step.planetId}`
  }),
)
</script>

<template>
  <section class="contract-accept-card" :data-status="status">
    <header class="contract-accept-card__header">
      <span class="contract-accept-card__chrome">Contract Offer · {{ props.contract.inboxName }}</span>
      <span class="contract-accept-card__status">{{ status }}</span>
    </header>

    <ol class="contract-accept-card__steps">
      <li v-for="(line, index) in stepLines" :key="index">{{ line }}</li>
    </ol>

    <ul class="contract-accept-card__rewards">
      <li v-for="(reward, idx) in props.contract.rewards" :key="idx">
        <template v-if="reward.type === 'fast-travel'">
          Reward — Fast travel kiosk unlocked at <strong>{{ reward.planetId }}</strong>
        </template>
        <template v-else-if="reward.type === 'mission-pay-multiplier'">
          Reward — {{ reward.multiplier }}× mission pay at <strong>{{ reward.planetId }}</strong>
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
        <span class="contract-accept-card__pill contract-accept-card__pill--active">In progress</span>
      </template>
      <template v-else-if="status === 'completed'">
        <span class="contract-accept-card__pill contract-accept-card__pill--done">Completed</span>
      </template>
      <template v-else-if="status === 'declined'">
        <span class="contract-accept-card__pill contract-accept-card__pill--declined">Declined</span>
      </template>
    </footer>
  </section>
</template>

<style scoped>
.contract-accept-card {
  margin: 18px 0 12px;
  padding: 16px 18px;
  border: 1px solid rgba(177, 228, 214, 0.32);
  border-radius: 6px;
  background: rgba(8, 24, 30, 0.65);
  color: #c9efe4;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  display: grid;
  gap: 12px;
}

.contract-accept-card__header {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(177, 228, 214, 0.7);
}

.contract-accept-card__steps {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: rgba(220, 248, 240, 0.92);
}

.contract-accept-card__rewards {
  list-style: none;
  margin: 0;
  padding: 8px 12px;
  border: 1px dashed rgba(106, 232, 196, 0.45);
  border-radius: 4px;
  font-size: 12px;
  color: rgba(180, 244, 220, 0.92);
  display: grid;
  gap: 4px;
}

.contract-accept-card__rewards strong {
  color: #6ae8c4;
  font-weight: 600;
  text-transform: capitalize;
}

.contract-accept-card__footer {
  display: flex;
  align-items: center;
  gap: 12px;
}

.contract-accept-card__btn {
  appearance: none;
  border-radius: 4px;
  border: 1px solid rgba(106, 232, 196, 0.6);
  padding: 8px 16px;
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.contract-accept-card__btn--primary {
  background: rgba(106, 232, 196, 0.18);
  color: #6ae8c4;
}

.contract-accept-card__btn--primary:hover {
  background: rgba(106, 232, 196, 0.32);
}

.contract-accept-card__btn--secondary {
  background: transparent;
  color: rgba(180, 244, 220, 0.8);
  border-color: rgba(180, 244, 220, 0.4);
}

.contract-accept-card__btn--secondary:hover {
  background: rgba(180, 244, 220, 0.12);
}

.contract-accept-card__pill {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.contract-accept-card__pill--active {
  background: rgba(106, 232, 196, 0.16);
  color: #6ae8c4;
}

.contract-accept-card__pill--done {
  background: rgba(166, 232, 100, 0.16);
  color: #b6e870;
}

.contract-accept-card__pill--declined {
  background: rgba(255, 132, 100, 0.18);
  color: #ff9f80;
}
</style>
