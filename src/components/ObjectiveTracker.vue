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

/** Color theme for the tracker. `mission` = cyan (level missions); `journey` = amber (meta journeys). */
export type ObjectiveTrackerVariant = 'mission' | 'journey'

/** How the tracker is positioned: `fixed` (default HUD) or `inline` inside the map HUD stack. */
export type ObjectiveTrackerDock = 'fixed' | 'inline'

withDefaults(
  defineProps<{
    eyebrow: string
    title: string
    objectives: ObjectiveTrackerEntry[]
    variant?: ObjectiveTrackerVariant
    /** When `inline`, drops fixed positioning so a parent stack controls layout. */
    dock?: ObjectiveTrackerDock
  }>(),
  {
    variant: 'mission',
    dock: 'fixed',
  },
)
</script>

<template>
  <div
    class="mission-tracker"
    :class="[
      `mission-tracker--${variant}`,
      dock === 'inline' ? 'mission-tracker--dock-inline' : '',
    ]"
  >
    <div class="tracker-header">
      <div class="tracker-asteroid">{{ eyebrow }}</div>
      <div class="tracker-mission">{{ title }}</div>
    </div>
    <div class="tracker-objectives">
      <div v-for="obj in objectives" :key="obj.id" class="tracker-objective-group">
        <div class="tracker-objective" :class="{ 'tracker-objective--complete': obj.complete }">
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
/**
 * Palette is driven by four CSS variables. The default block below is the cyan
 * "mission" theme used by LevelView; `.mission-tracker--journey` overrides them
 * with amber values for MapView's journey tracker.
 */
.mission-tracker {
  --tracker-bg: rgba(0, 10, 15, 0.5);
  --tracker-border: rgba(0, 255, 204, 0.15);
  --tracker-border-soft: rgba(0, 255, 204, 0.1);
  --tracker-eyebrow: rgba(0, 255, 204, 0.4);
  --tracker-title: rgba(0, 255, 204, 0.8);
  --tracker-text: rgba(255, 255, 255, 0.6);
  --tracker-text-dim: rgba(255, 255, 255, 0.3);
  --tracker-text-bright: rgba(255, 255, 255, 0.8);
  --tracker-accent: rgba(0, 255, 204, 0.5);
  --tracker-accent-strong: rgba(0, 255, 204, 0.9);
  --tracker-accent-soft: rgba(0, 255, 204, 0.4);
  --tracker-accent-subtle: rgba(0, 255, 204, 0.6);
  --tracker-progress: rgba(0, 255, 204, 0.7);
  --tracker-strikethrough: rgba(0, 255, 204, 0.3);

  position: fixed;
  top: 5.5rem;
  right: 1rem;
  z-index: 65;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.8rem 1rem;
  background: var(--tracker-bg);
  border: 1px solid var(--tracker-border);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  min-width: 10rem;
}
.mission-tracker--dock-inline {
  position: relative;
  top: auto;
  right: auto;
  width: 100%;
  min-width: 0;
  z-index: auto;
}
.mission-tracker--journey {
  --tracker-bg: rgba(16, 10, 0, 0.55);
  --tracker-border: rgba(251, 191, 36, 0.22);
  --tracker-border-soft: rgba(251, 191, 36, 0.18);
  --tracker-eyebrow: rgba(252, 211, 77, 0.5);
  --tracker-title: rgba(253, 224, 71, 0.9);
  --tracker-text: rgba(255, 243, 214, 0.7);
  --tracker-text-dim: rgba(255, 243, 214, 0.38);
  --tracker-text-bright: rgba(255, 243, 214, 0.9);
  --tracker-accent: rgba(251, 191, 36, 0.55);
  --tracker-accent-strong: rgba(253, 224, 71, 0.95);
  --tracker-accent-soft: rgba(251, 191, 36, 0.45);
  --tracker-accent-subtle: rgba(252, 211, 77, 0.7);
  --tracker-progress: rgba(252, 211, 77, 0.75);
  --tracker-strikethrough: rgba(251, 191, 36, 0.35);
}
.tracker-header {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  border-bottom: 1px solid var(--tracker-border);
  padding-bottom: 0.4rem;
}
.tracker-asteroid {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.65rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--tracker-eyebrow);
}
.tracker-mission {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.8rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--tracker-title);
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
  color: var(--tracker-text);
  transition: color 0.3s;
}
.tracker-objective--complete {
  color: var(--tracker-accent);
}
.tracker-objective--complete .tracker-label {
  text-decoration: line-through;
  text-decoration-color: var(--tracker-strikethrough);
}
.tracker-check {
  font-size: 0.85rem;
  color: var(--tracker-accent-subtle);
}
.tracker-objective--complete .tracker-check {
  color: var(--tracker-accent-strong);
}
.tracker-steps {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding-left: 1.2rem;
  border-left: 1px solid var(--tracker-border-soft);
  margin-left: 0.35rem;
}
.tracker-step {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: var(--tracker-text-dim);
  transition: color 0.3s;
}
.tracker-step--active {
  color: var(--tracker-text-bright);
}
.tracker-step--complete {
  color: var(--tracker-accent-soft);
}
.tracker-step-icon {
  font-size: 0.7rem;
  color: var(--tracker-accent);
}
.tracker-step--active .tracker-step-icon {
  color: var(--tracker-accent-strong);
}
.tracker-step-progress {
  margin-left: auto;
  padding-left: 0.5rem;
  font-variant-numeric: tabular-nums;
  color: var(--tracker-progress);
}
.tracker-step--complete .tracker-step-progress {
  color: var(--tracker-accent);
}
</style>
