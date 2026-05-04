<script setup lang="ts">
/**
 * Right-hand HUD panel listing all active missions on the solar map,
 * grouped by mission type. Empty groups are hidden by the upstream
 * builder; this component just renders what it's given. Clicking a row
 * emits {@link MissionTrackerRow} so the parent can park the camera on
 * the row's focus target.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-active-missions-tracker-design.md
 */
import type {
  MissionTrackerGroup,
  MissionTrackerRow,
} from '@/lib/missions/missionHudRows'

defineProps<{
  /** Groups produced by {@link buildMissionTrackerGroups}. */
  groups: readonly MissionTrackerGroup[]
}>()

const emit = defineEmits<{
  /** Parent should park the camera on the row's focus. */
  focusMission: [row: MissionTrackerRow]
}>()

/** Landmark label for assistive tech. */
const MISSION_TRACKER_ARIA_LABEL = 'Active missions'

/**
 * Forward a click to the parent. Kept as a tiny helper so the template
 * stays readable.
 */
function emitFocus(row: MissionTrackerRow): void {
  emit('focusMission', row)
}
</script>

<template>
  <section
    v-if="groups.length > 0"
    class="mission-tracker-panel"
    :aria-label="MISSION_TRACKER_ARIA_LABEL"
    role="region"
  >
    <header class="mission-tracker-panel__header">
      <span class="mission-tracker-panel__eyebrow">Missions</span>
    </header>
    <div
      v-for="group in groups"
      :key="group.key"
      class="mission-tracker-panel__group"
    >
      <span class="mission-tracker-panel__group-title">{{ group.title }}</span>
      <ul class="mission-tracker-panel__list">
        <li
          v-for="row in group.rows"
          :key="row.id"
          class="mission-tracker-panel__item"
        >
          <button
            type="button"
            class="mission-tracker-panel__row-btn"
            @click="emitFocus(row)"
          >
            <span class="mission-tracker-panel__row-title">{{ row.title }}</span>
            <span
              v-if="row.objectiveType"
              class="mission-tracker-panel__row-objective"
            >
              {{ row.objectiveType }}
            </span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<style>
.mission-tracker-panel {
  --tracker-bg: rgba(0, 10, 15, 0.5);
  --tracker-border: rgba(0, 255, 204, 0.15);
  --tracker-border-soft: rgba(0, 255, 204, 0.1);
  --tracker-eyebrow: rgba(0, 255, 204, 0.4);
  --tracker-title: rgba(0, 255, 204, 0.8);
  --tracker-text-bright: rgba(255, 255, 255, 0.85);
  --tracker-accent: rgba(0, 255, 204, 0.5);
  --tracker-accent-strong: rgba(0, 255, 204, 0.95);

  pointer-events: auto;
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--tracker-bg);
  border: 1px solid var(--tracker-border);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.mission-tracker-panel__header {
  border-bottom: 1px solid var(--tracker-border);
  padding-bottom: 0.35rem;
}

.mission-tracker-panel__eyebrow {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.65rem;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--tracker-eyebrow);
}

.mission-tracker-panel__group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.mission-tracker-panel__group-title {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.6rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--tracker-eyebrow);
}

.mission-tracker-panel__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border-left: 1px solid var(--tracker-border-soft);
  padding-left: 0.6rem;
  margin-left: 0.2rem;
}

.mission-tracker-panel__row-btn {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  border: none;
  background: transparent;
  padding: 0.2rem 0;
  cursor: pointer;
  text-align: left;
  transition: color 0.2s ease;
}

.mission-tracker-panel__row-btn:hover .mission-tracker-panel__row-title {
  color: var(--tracker-accent-strong);
}

.mission-tracker-panel__row-title {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--tracker-text-bright);
}

.mission-tracker-panel__row-objective {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.6rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--tracker-accent);
}
</style>
