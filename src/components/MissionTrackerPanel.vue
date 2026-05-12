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
  /** Row id currently selected/highlighted; matching row renders in selected state. */
  selectedRowId?: string | null
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

/**
 * Format a countdown in seconds as `m:ss`. Negative or zero values return `0:00`.
 *
 * @param totalSeconds - Seconds remaining.
 */
function formatMmSs(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(t / 60)
  const s = t % 60
  return `${m}:${s.toString().padStart(2, '0')}`
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
      <span class="mission-tracker-panel__hint">
        click to <span class="mission-tracker-panel__hint-accent">TRACK</span> a waypoint
      </span>
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
            :class="{ 'mission-tracker-panel__row-btn--selected': row.id === selectedRowId }"
            @click="emitFocus(row)"
          >
            <span class="mission-tracker-panel__row-title">{{ row.title }}</span>
            <span
              v-if="row.objectiveType"
              class="mission-tracker-panel__row-objective"
            >
              {{ row.objectiveType }}
            </span>
            <span
              v-if="row.progress"
              class="mission-tracker-panel__row-progress"
            >
              {{ row.progress }}
            </span>
            <span
              v-if="row.timerSeconds !== undefined"
              class="mission-tracker-panel__row-timer"
            >
              {{ formatMmSs(row.timerSeconds) }}
            </span>
            <span
              v-if="row.bar"
              class="mission-tracker-panel__row-bar"
            >
              <span class="mission-tracker-panel__row-bar-label">{{ row.bar.label }}</span>
              <span class="mission-tracker-panel__row-bar-track">
                <span
                  class="mission-tracker-panel__row-bar-fill"
                  :style="{ width: `${Math.max(0, Math.min(100, (row.bar.value / row.bar.max) * 100))}%` }"
                />
              </span>
            </span>
            <span
              v-if="row.status"
              class="mission-tracker-panel__row-status"
              :class="`mission-tracker-panel__row-status--${row.status.tone}`"
            >
              {{ row.status.label }}
            </span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<style>
/**
 * Cyan-forward accent (Tailwind cyan-300/400 family) so this panel reads as
 * navigation / active missions; {@link ContractTrackerPanel} keeps mint/spring
 * RGB(0,255,204) for contract offers.
 */
.mission-tracker-panel {
  --mission-tracker-cyan-border: 34 211 238;
  --mission-tracker-cyan-muted: 103 232 249;
  --mission-tracker-cyan-title: 165 243 252;
  --mission-tracker-cyan-accent: 34 211 238;
  --mission-tracker-cyan-hover: 207 250 254;

  --tracker-bg: rgba(0, 10, 15, 0.5);
  --tracker-border: rgb(var(--mission-tracker-cyan-border) / 0.18);
  --tracker-border-soft: rgb(var(--mission-tracker-cyan-border) / 0.12);
  --tracker-eyebrow: rgb(var(--mission-tracker-cyan-muted) / 0.55);
  --tracker-title: rgb(var(--mission-tracker-cyan-title) / 0.92);
  --tracker-text-bright: rgba(255, 255, 255, 0.85);
  --tracker-accent: rgb(var(--mission-tracker-cyan-accent) / 0.55);
  --tracker-accent-strong: rgb(var(--mission-tracker-cyan-hover) / 0.97);
  --tracker-selected: rgba(255, 238, 102, 0.95);
  --tracker-selected-soft: rgba(255, 238, 102, 0.7);

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
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  border-bottom: 1px solid var(--tracker-border);
  padding-bottom: 0.35rem;
}

.mission-tracker-panel__hint {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.55rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--tracker-eyebrow);
}

.mission-tracker-panel__hint-accent {
  color: var(--tracker-selected);
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

.mission-tracker-panel__row-btn--selected .mission-tracker-panel__row-title {
  color: var(--tracker-selected);
}

.mission-tracker-panel__row-btn--selected .mission-tracker-panel__row-objective {
  color: var(--tracker-selected-soft);
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

.mission-tracker-panel__row-progress {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--tracker-accent);
}

.mission-tracker-panel__row-btn--selected .mission-tracker-panel__row-progress {
  color: var(--tracker-selected-soft);
}

.mission-tracker-panel__row-timer {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  color: var(--tracker-accent-strong);
  margin-top: 0.15rem;
}

.mission-tracker-panel__row-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.2rem;
  width: 100%;
}

.mission-tracker-panel__row-bar-label {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.55rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--tracker-eyebrow);
  flex-shrink: 0;
}

.mission-tracker-panel__row-bar-track {
  flex: 1;
  height: 3px;
  background: rgb(var(--mission-tracker-cyan-border) / 0.18);
  border-radius: 1px;
  overflow: hidden;
}

.mission-tracker-panel__row-bar-fill {
  display: block;
  height: 100%;
  background: var(--tracker-accent-strong);
  transition: width 0.2s ease;
}

.mission-tracker-panel__row-status {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.55rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 0.1rem 0.35rem;
  margin-top: 0.2rem;
  align-self: flex-start;
  border-radius: 2px;
}

.mission-tracker-panel__row-status--ok {
  background: rgba(74, 222, 128, 0.12);
  color: rgba(74, 222, 128, 0.95);
}

.mission-tracker-panel__row-status--warn {
  background: rgba(250, 204, 21, 0.12);
  color: rgba(250, 204, 21, 0.95);
}

.mission-tracker-panel__row-status--danger {
  background: rgba(248, 113, 113, 0.16);
  color: rgba(248, 113, 113, 0.96);
}
</style>
