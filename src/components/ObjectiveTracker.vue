<!-- src/components/ObjectiveTracker.vue -->
<script setup lang="ts">
/** Optional progress metadata shown after a tracker step label. */
export interface ObjectiveTrackerStepProgress {
  /** Current progress value. */
  current: number
  /** Target progress value. */
  target: number
  /** Unit suffix. */
  unit: string
}

/** Display step for the objective tracker. */
export interface ObjectiveTrackerStep {
  /** Step label. */
  label: string
  /** Whether this step is complete. */
  complete: boolean
  /** Whether this step is currently active. */
  active: boolean
  /** Optional progress meter metadata. */
  progress?: ObjectiveTrackerStepProgress
}

/** Objective display entry for the tracker. */
export interface ObjectiveTrackerEntry {
  /** Unique id. */
  id: string
  /** Display label. */
  label: string
  /** Whether this objective is complete. */
  complete: boolean
  /** Optional nested steps. */
  steps: readonly ObjectiveTrackerStep[]
}

defineProps<{
  eyebrow: string
  title: string
  objectives: ObjectiveTrackerEntry[]
}>()
</script>

<template>
  <div class="mission-tracker">
    <div class="tracker-header">
      <div class="tracker-asteroid">{{ eyebrow }}</div>
      <div class="tracker-mission">{{ title }}</div>
    </div>
    <div class="tracker-objectives">
      <div
        v-for="obj in objectives"
        :key="obj.id"
        class="tracker-objective-group"
      >
        <div
          class="tracker-objective"
          :class="{ 'tracker-objective--complete': obj.complete }"
        >
          <span class="tracker-check">{{ obj.complete ? '\u2713' : '\u25CB' }}</span>
          <span class="tracker-label">{{ obj.label }}</span>
        </div>
        <div v-if="!obj.complete && obj.steps.length > 0" class="tracker-steps">
          <div
            v-for="(step, si) in obj.steps"
            :key="si"
            v-show="step.complete || step.active"
            class="tracker-step"
            :class="{
              'tracker-step--complete': step.complete,
              'tracker-step--active': step.active,
            }"
          >
            <span class="tracker-step-icon">{{ step.complete ? '\u2713' : '\u203A' }}</span>
            <span class="tracker-step-label">{{ step.label }}</span>
            <span v-if="step.progress" class="tracker-step-progress">
              {{ step.progress.current }}/{{ step.progress.target }} {{ step.progress.unit }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.mission-tracker {
  position: fixed;
  top: 5.5rem;
  right: 1rem;
  z-index: 65;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.8rem 1rem;
  background: rgba(0, 10, 15, 0.5);
  border: 1px solid rgba(0, 255, 204, 0.15);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  min-width: 10rem;
}
.tracker-header {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  border-bottom: 1px solid rgba(0, 255, 204, 0.15);
  padding-bottom: 0.4rem;
}
.tracker-asteroid {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.65rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: rgba(0, 255, 204, 0.4);
}
.tracker-mission {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.8rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(0, 255, 204, 0.8);
}
.tracker-objectives {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.tracker-objective-group {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.tracker-objective {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
  transition: color 0.3s;
}
.tracker-objective--complete {
  color: rgba(0, 255, 204, 0.5);
}
.tracker-objective--complete .tracker-label {
  text-decoration: line-through;
  text-decoration-color: rgba(0, 255, 204, 0.3);
}
.tracker-check {
  font-size: 0.85rem;
  color: rgba(0, 255, 204, 0.6);
}
.tracker-objective--complete .tracker-check {
  color: rgba(0, 255, 204, 0.9);
}
.tracker-steps {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding-left: 1.2rem;
  border-left: 1px solid rgba(0, 255, 204, 0.1);
  margin-left: 0.35rem;
}
.tracker-step {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.3);
  transition: color 0.3s;
}
.tracker-step--active {
  color: rgba(255, 255, 255, 0.8);
}
.tracker-step--complete {
  color: rgba(0, 255, 204, 0.4);
}
.tracker-step-icon {
  font-size: 0.7rem;
  color: rgba(0, 255, 204, 0.5);
}
.tracker-step--active .tracker-step-icon {
  color: rgba(0, 255, 204, 0.9);
}
.tracker-step-progress {
  margin-left: auto;
  padding-left: 0.5rem;
  font-variant-numeric: tabular-nums;
  color: rgba(0, 255, 204, 0.7);
}
.tracker-step--complete .tracker-step-progress {
  color: rgba(0, 255, 204, 0.5);
}
</style>
