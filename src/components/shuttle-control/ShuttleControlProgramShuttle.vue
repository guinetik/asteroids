<script setup lang="ts">
import { computed } from 'vue'
import type { ShuttleTelemetry } from '@/lib/ShuttleTelemetry'
import type { UpgradeId } from '@/lib/upgrades'
import { getUpgradesByCategory } from '@/lib/upgrades'
import type { ShuttleThrusterName } from '@/lib/physics/thrusterSystem'

/**
 * Vale Orbital Refurb — Shuttle Orientation Manual.
 *
 * In-game owner's manual framed as documentation from Marta Vale.
 * Explains the refurbished NASA-era lander, neutron thruster system,
 * slingshot mechanics, power model, upgrades, and operational procedures.
 * Ties directly into startup messages, Jay's tutorials, and the shop system.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/shuttle-control-program-shuttle.md
 */

const props = defineProps<{
  /** Live telemetry from ShuttleController (fuel, charges, temp, damage, etc.) */
  telemetry?: ShuttleTelemetry | null
  /** Current upgrade levels (focus on shuttle category) */
  upgradeLevels?: Partial<Record<UpgradeId, number>>
  /** Current docked planet (for contextual advice) */
  dockedPlanet?: string | null
  /** Player name from profile (used in deed of ownership) */
  playerName?: string
}>()

const emit = defineEmits<{
  'switch-to-upgrades': []
}>()

/** Shuttle-category upgrades that affect core flight systems. */
const shuttleUpgrades = computed(() => {
  return getUpgradesByCategory('shuttle')
})

/** Formatted live readouts for the header. */
const statusSummary = computed(() => {
  const t = props.telemetry
  if (!t) return { fuel: '—', hull: '—', temp: '—' }

  const fuelPercent = t.fuelCapacity > 0
    ? Math.round((t.fuelLevel / t.fuelCapacity) * 100)
    : 0

  return {
    fuel: `${fuelPercent}%`,
    hull: `${Math.round(t.hp)}/${t.maxHp}`,
    temp: t.temperature > 0 ? `+${t.temperature.toFixed(0)}°` : t.temperature.toFixed(0) + '°',
  }
})

/** Simple thruster group demo data (matches real system). */
const thrusterGroups: Array<{
  name: 'thrust' | 'brake' | 'rcs'
  label: string
  color: string
  description: string
  martaNote: string
}> = [
  {
    name: 'thrust',
    label: 'MAIN THRUST',
    color: 'cyan',
    description: 'Primary neutron drive. Forward acceleration. Burns charge fastest.',
    martaNote: "Don't run her into the red unless you mean it, baby.",
  },
  {
    name: 'brake',
    label: 'INERTIA DAMPENERS',
    color: 'amber',
    description: 'Emergency braking via advanced neutron dampening. High fuel cost.',
    martaNote: 'Last resort. Saves your skin but eats fuel like Jay at the bar.',
  },
  {
    name: 'rcs',
    label: 'RCS LATERAL',
    color: 'emerald',
    description: 'Reaction Control System for yaw, strafe, and fine maneuvering.',
    martaNote: 'Use this to keep your nose pointed where you want to go.',
  },
]

/** Progress through the manual (could tie into achievements later). */
const manualProgress = computed(() => {
  // Placeholder — expand with localStorage or Pinia state in future
  return 3
})
</script>

<template>
  <div class="shuttle-control-screen orientation-manual">
    <!-- Header with Marta branding -->
    <div class="orientation-header">
      <div class="orientation-header__logo">
        <span class="text-[10px] font-mono tracking-[0.5em] text-amber-300/70">VALE ORBITAL REFURB</span>
        <h2 class="shuttle-control-screen__title">SHUTTLE ORIENTATION v0.8</h2>
      </div>
      <div class="orientation-header__status">
        <div class="status-pill">
          FUEL <span class="status-value">{{ statusSummary.fuel }}</span>
        </div>
        <div class="status-pill">
          HULL <span class="status-value">{{ statusSummary.hull }}</span>
        </div>
        <div class="status-pill">
          TEMP <span class="status-value">{{ statusSummary.temp }}</span>
        </div>
        <div v-if="dockedPlanet" class="status-pill status-pill--docked">
          DOCKED @ {{ dockedPlanet.toUpperCase() }}
        </div>
      </div>
    </div>

    <!-- Manual sections -->
    <div class="orientation-sections">
      <!-- 1. Power Plant -->
      <section class="orientation-section">
        <h3 class="orientation-section__title">01 — THE POWER PLANT</h3>
        <h4 class="orientation-section__subtitle">Neutron Thruster System</h4>

        <div class="system-card">
          <p>
            Your shuttle uses a <span class="text-cyan-300">shared fuel pool</span> with per-group charge bars.
            All thrusters (main, brake, RCS) draw from the same tank. When idle, they recharge automatically —
            but that recharge <span class="text-amber-300">costs fuel</span>.
          </p>
          <div class="thruster-grid">
            <div
              v-for="group in thrusterGroups"
              :key="group.name"
              class="thruster-demo"
              :class="`thruster-demo--${group.color}`"
            >
              <div class="thruster-demo__label">{{ group.label }}</div>
              <div class="thruster-demo__bar">
                <div class="thruster-demo__fill" style="width: 75%"></div>
              </div>
              <p class="thruster-demo__desc">{{ group.description }}</p>
              <div class="marta-note text-[10px] italic text-amber-200/70">
                "{{ group.martaNote }}"
              </div>
            </div>
          </div>
          <p class="text-xs text-slate-400 mt-4">
            Full charge = zero fuel drain while firing. No fuel left? You can only spend what charge remains.
            Learn the rhythm. Waste shows up in your ledger before you feel it in the seat.
          </p>
        </div>
      </section>

      <!-- 2. Slingshot -->
      <section class="orientation-section">
        <h3 class="orientation-section__title">02 — SLINGSHOT NAVIGATION</h3>
        <div class="system-card">
          <p class="text-cyan-200">
            The planet does the work. You just point it.
          </p>
          <p class="mt-3">
            Charge the slingshot near a gravity well (green arrow = good alignment). Release at the right moment
            and the planet's mass flings you across the system. Red means you're about to eat a moon.
          </p>
          <div class="demo-hint">
            Pro tip from Jay: Don't rush it. Impatient pilots buy fuel twice.
          </div>
        </div>
      </section>

      <!-- 3. Flight Physics -->
      <section class="orientation-section">
        <h3 class="orientation-section__title">03 — FLIGHT CHARACTERISTICS</h3>
        <div class="system-card grid grid-cols-2 gap-6">
          <div>
            <div class="text-xs uppercase tracking-widest text-slate-400 mb-1">Newtonian Physics</div>
            <ul class="text-sm space-y-1 text-slate-300">
              <li>• No atmosphere. No drag. Momentum persists.</li>
              <li>• A/D = rotate. W = main thrust in nose direction.</li>
              <li>• Alignment matters. Thrusting sideways wastes energy.</li>
            </ul>
          </div>
          <div>
            <div class="text-xs uppercase tracking-widest text-slate-400 mb-1">Hazards</div>
            <ul class="text-sm space-y-1 text-slate-300">
              <li>• Temperature swings (hot near sun, cold in the black).</li>
              <li>• Velocity = damage on impact.</li>
              <li>• Adrift timer activates when fuel and charge are both exhausted.</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- 4. Refits -->
      <section class="orientation-section">
        <h3 class="orientation-section__title">04 — VALE REFITS &amp; UPGRADES</h3>
        <div class="system-card">
          <p>
            The Upgrades tab is our engineering bay. Level 0 is what the yard shipped.
            Every paid tier improves coefficients — thrust efficiency, fuel capacity,
            slingshot coupling strength, thermal regulation.
          </p>
          <div class="upgrade-tease">
            <span class="text-amber-300">Current shuttle upgrades installed:</span>
            <span v-for="(level, id) in upgradeLevels" :key="id" class="upgrade-tag">
              {{ id }}: Lv{{ level }}
            </span>
          </div>
          <button
            type="button"
            class="shuttle-control-nav-btn shuttle-control-nav-btn--upgrades-shop mt-4"
            @click="$emit('switch-to-upgrades')"
          >
            OPEN ENGINEERING BAY →
          </button>
        </div>
      </section>

      <!-- 5. Operational Checklist -->
      <section class="orientation-section">
        <h3 class="orientation-section__title">05 — OPERATIONAL CHECKLIST</h3>
        <div class="system-card text-sm">
          <div class="checklist">
            <div class="checklist-item">
              <span class="checklist-dot">●</span>
              <span><strong>Shop (B key):</strong> Refuel, repair hull, sell minerals, buy reserve cells.</span>
            </div>
            <div class="checklist-item">
              <span class="checklist-dot">●</span>
              <span><strong>Use the right machine:</strong> Shuttle for transit. Lander for surface work.</span>
            </div>
            <div class="checklist-item">
              <span class="checklist-dot">●</span>
              <span><strong>The cat:</strong> She's not just decoration. She keeps the cabin warm.</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Deed of Ownership (moved to bottom per request) -->
      <section class="orientation-section">
        <h3 class="orientation-section__title">DEED OF TRANSFER</h3>
        <div class="deed-card">
          <div class="deed-header">
            <span class="font-mono text-xs tracking-[0.125em] text-amber-300/70">VALE ORBITAL REFURB • 2306-04-05</span>
            <h4 class="text-lg text-white mt-1">Certificate of Ownership</h4>
          </div>

          <p class="marta-note mt-6 leading-relaxed text-sm">
            Be it known that on this day I, Marta Vale of Vale Orbital Refurb, do hereby transfer all right, title,<br>
            and interest in one (1) refurbished NASA-era lunar lander chassis (serial print-refurb #LM-7-Δ-8841),<br>
            together with all aftermarket neutron thrusters, slingshot coupling, and charge management systems, to:
          </p>

          <p class="player-name text-3xl font-light text-cyan-100 tracking-widest my-8">
            {{ playerName || 'Pilot' }}
          </p>

          <p class="text-xs text-slate-400 leading-relaxed">
            This vessel began as a 3D-printed copy of an old NASA design. It has since been heavily modified by people who needed it to keep flying. 
            The frame is original. The soul is ours. She is paid off.<br><br>
            She is yours now.
          </p>

          <div class="marta-signature text-xs text-amber-200/70 mt-10 border-t border-white/10 pt-4">
            — Marta Vale<br>
            <span class="text-[10px] opacity-60">"She's yours now, handsome. Don't break her."</span>
          </div>
        </div>
      </section>
    </div>

    <div class="orientation-footer">
      <div class="progress">
        MANUAL PROGRESS {{ manualProgress }}/6 SECTIONS READ
      </div>
      <div class="marta-signature">
        — Marta Vale, Vale Orbital Refurb
      </div>
    </div>
  </div>
</template>

<style scoped>
.orientation-manual {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.orientation-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid rgba(165, 243, 252, 0.1);
  padding-bottom: 1rem;
}

.orientation-header__logo h2 {
  margin: 0.25rem 0 0;
  font-size: 0.95rem;
  letter-spacing: 0.125em;
}

.orientation-header__status {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.status-pill {
  border-radius: 9999px;
  border: 1px solid rgb(165 243 252 / 0.3);
  background-color: rgb(0 0 0 / 0.4);
  padding: 0.25rem 0.75rem;
  font-family: monospace;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgb(165 243 252 / 0.8);
}

.status-pill--docked {
  border-color: rgb(245 158 11 / 0.4);
  color: rgb(245 158 11);
}

.orientation-intro {
  margin-bottom: 2rem;
  padding: 1rem;
  border-left: 3px solid rgb(165 243 252);
  background: rgba(165, 243, 252, 0.03);
}

.marta-note {
  font-style: italic;
  line-height: 1.6;
  color: rgb(165 243 252 / 0.85);
}

.orientation-sections {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding-right: 0.5rem;
  scrollbar-width: thin;
  scrollbar-color: rgb(165 243 252 / 0.3) transparent;
}

.orientation-section__title {
  margin-bottom: 0.25rem;
  font-family: monospace;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.125em;
  color: rgb(251 191 36);
}

.orientation-section__subtitle {
  margin-bottom: 1rem;
  font-size: 1.125rem;
  color: rgb(255 255 255 / 0.9);
}

.system-card {
  border-radius: 1rem;
  border: 1px solid rgb(165 243 252 / 0.2);
  background-color: rgb(0 0 0 / 0.3);
  padding: 1.5rem;
  color: rgb(226 232 240);
}

.thruster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  margin: 1.5rem 0;
}

.thruster-demo {
  border: 1px solid rgba(165, 243, 252, 0.2);
  border-radius: 8px;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.6);
}

.thruster-demo__label {
  margin-bottom: 0.5rem;
  font-family: monospace;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.125em;
  color: rgb(165 243 252);
}

.thruster-demo__bar {
  height: 6px;
  background: rgba(165, 243, 252, 0.1);
  border-radius: 9999px;
  margin-bottom: 0.75rem;
  overflow: hidden;
}

.thruster-demo__fill {
  height: 100%;
  background: linear-gradient(90deg, rgb(165 243 252), rgb(103 232 249));
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.thruster-demo--amber .thruster-demo__fill {
  background: linear-gradient(90deg, rgb(251 191 36), rgb(245 158 11));
}

.thruster-demo--emerald .thruster-demo__fill {
  background: linear-gradient(90deg, rgb(134 239 172), rgb(74 222 128));
}

.demo-hint {
  margin-top: 1rem;
  border-left: 2px solid rgb(251 191 36);
  padding-left: 0.75rem;
  font-size: 0.75rem;
  font-style: italic;
  color: rgb(251 191 36 / 0.8);
}

.upgrade-tease {
  margin-top: 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.75rem;
}

.upgrade-tag {
  border-radius: 4px;
  background: rgb(165 243 252 / 0.1);
  padding: 2px 8px;
  color: rgb(165 243 252);
  font-family: monospace;
}

.checklist {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.checklist-item {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
}

.checklist-dot {
  color: rgb(165 243 252);
  font-size: 10px;
  margin-top: 4px;
}

.orientation-footer {
  margin-top: auto;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(148, 163, 184, 0.15);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  color: rgb(148 163 184);
  font-family: monospace;
}

.progress {
  letter-spacing: 1px;
}

.marta-signature {
  text-align: right;
  line-height: 1.4;
}
</style>
