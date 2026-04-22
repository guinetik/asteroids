<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UpgradeId } from '@/lib/upgrades'
import { uiAudio } from '@/audio/UiAudioDirector'

/**
 * Vale Orbital Refurb — Lander Orientation Manual.
 * Interactive terminal manual for the surface extraction lander.
 */

const props = defineProps<{
  upgradeLevels?: Partial<Record<UpgradeId, number>>
  dockedPlanet?: string | null
  playerName?: string
}>()

defineEmits<{
  'switch-to-upgrades': []
}>()

const activeUpgrades = computed(() => {
  if (!props.upgradeLevels) return {}
  return Object.fromEntries(
    Object.entries(props.upgradeLevels)
      .filter(([id, level]) => level > 0 && id.startsWith('lander'))
  )
})

const thrusterGroups = [
  {
    name: 'thrust',
    label: 'MAIN DESCENT ENGINE',
    color: 'cyan',
    description: 'High-yield neutron drive. Fires downward against gravity. Generous TWR (~3.3).',
    martaNote: "You need real authority to stop a long drop. Don't be shy with the throttle.",
    wireframe: `
   / \\
  / | \\
 |  |  |
 |  |  |
[=======]
 \\ ||| /
  \\|||/
   \\|/`
  },
  {
    name: 'rcs',
    label: 'RCS MANEUVERING',
    color: 'emerald',
    description: 'Lateral translation [W/A/S/D], Yaw rotation [Q/E], Ascend boost [Shift], Retro-brake [C].',
    martaNote: 'Use [C] to damp lateral velocity quickly. Saves you from sliding into a crater.',
    wireframe: `
◄═[=]═►
  | |
◄═[=]═►
  | |
◄═[=]═►`
  },
]

const chapters = [
  { id: 1, title: 'POWER & PROPULSION' },
  { id: 2, title: 'SURFACE LANDING' },
  { id: 3, title: 'FLIGHT PHYSICS' },
  { id: 4, title: 'SYSTEMS & UPGRADES' },
  { id: 5, title: 'OPERATIONAL PROTOCOL' },
]

const currentChapter = ref(1)

const nextChapter = () => {
  if (currentChapter.value < chapters.length) {
    uiAudio.notifyNavClick()
    currentChapter.value++
  }
}

const prevChapter = () => {
  if (currentChapter.value > 1) {
    uiAudio.notifyNavClick()
    currentChapter.value--
  }
}
</script>

<template>
  <div class="shuttle-manual-container">
    <!-- Header -->
    <header class="manual-header">
      <div class="manual-header__title">
        <span class="brand">VALE ORBITAL REFURB</span>
        <h1>LANDER ORIENTATION <span class="version">v0.8</span></h1>
      </div>
      <div class="manual-header__telemetry">
        <div class="telemetry-block">
          <span class="label">CLASS</span>
          <span class="value">SURFACE</span>
        </div>
        <div class="telemetry-block">
          <span class="label">GRAV</span>
          <span class="value">3.0G</span>
        </div>
        <div v-if="dockedPlanet" class="telemetry-block telemetry-block--alert">
          <span class="label">LOC</span>
          <span class="value">@{{ dockedPlanet.toUpperCase() }}</span>
        </div>
      </div>
    </header>

    <div class="manual-body">
      <!-- Chapter Navigation -->
      <aside class="manual-nav">
        <div class="nav-title">INDEX</div>
        <ul class="nav-list">
          <li 
            v-for="chapter in chapters" 
            :key="chapter.id"
            :class="['nav-item', { active: currentChapter === chapter.id }]"
            @click="uiAudio.notifyNavClick(); currentChapter = chapter.id"
          >
            <span class="ch-num">0{{ chapter.id }}</span>
            <span class="ch-title">{{ chapter.title }}</span>
          </li>
        </ul>
      </aside>

      <!-- Content Area -->
      <main class="manual-content">
        
        <!-- Chapter 1: Power & Propulsion -->
        <section v-if="currentChapter === 1" class="chapter-view fade-in">
          <div class="chapter-header">
            <h2>01 // POWER PLANT</h2>
            <p class="subtitle">Descent Engine & RCS Management</p>
          </div>
          
          <div class="content-grid">
            <div class="text-panel">
              <p>
                The surface lander utilizes a <strong class="text-cyan-400">shared fuel pool</strong> with per-group charge capacitors. 
                Both the main descent engine and RCS thrusters draw from the same primary tank. 
              </p>
              <p class="mt-4">
                When idle, capacitors recharge automatically — but this recharge <strong class="text-amber-400">consumes fuel</strong>.
                Full charge = zero fuel drain while firing. Depleted charge = direct fuel drain.
              </p>
              <div class="marta-quote mt-6">
                "It's a heavy bird. Keep an eye on the gauge, or you'll be walking home."
              </div>
            </div>

            <div class="thruster-schematics">
              <div 
                v-for="group in thrusterGroups" 
                :key="group.name"
                class="schematic-card"
                :class="`schematic-card--${group.color}`"
              >
                <div class="schematic-visual">
                  <pre>{{ group.wireframe }}</pre>
                </div>
                <div class="schematic-details">
                  <h3>{{ group.label }}</h3>
                  <div class="charge-bar"><div class="charge-fill"></div></div>
                  <p>{{ group.description }}</p>
                  <span class="note">M.V: {{ group.martaNote }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Chapter 2: Landing -->
        <section v-if="currentChapter === 2" class="chapter-view fade-in">
          <div class="chapter-header">
            <h2>02 // SURFACE LANDING</h2>
            <p class="subtitle">Touchdown Protocol & Tolerances</p>
          </div>
          
          <div class="content-grid">
            <div class="text-panel">
              <p class="lead text-cyan-300">The ground is not your friend. Approach with caution.</p>
              <p class="mt-4">
                The lander's suspension can only absorb so much kinetic energy. Exceeding safe tolerances will result in catastrophic hull damage.
              </p>
              <ul class="data-list mt-4">
                <li><span class="text-emerald-400">MAX SAFE SPEED:</span> 8.0 m/s descent.</li>
                <li><span class="text-amber-400">MAX SAFE TILT:</span> 15° from vertical.</li>
                <li><span class="text-red-400">SURFACE SLOPE:</span> Landing on steep inclines or cliff faces is fatal, regardless of descent speed.</li>
              </ul>
              <div class="marta-quote mt-6">
                "If the alarm is screaming, you're coming in too hot. Burn the main engine."
              </div>
            </div>
            <div class="visual-panel">
              <pre class="ascii-art text-cyan-500/50">
       |
      [=]
      / \
     /   \
    |     |
   /|     |\
  / |     | \
 ▔▔▔▔▔▔▔▔▔▔▔▔▔
  SAFE TOUCHDOWN
              </pre>
            </div>
          </div>
        </section>

        <!-- Chapter 3: Flight Physics -->
        <section v-if="currentChapter === 3" class="chapter-view fade-in">
          <div class="chapter-header">
            <h2>03 // FLIGHT CHARACTERISTICS</h2>
            <p class="subtitle">Gravity & Atmospheric Conditions</p>
          </div>
          
          <div class="content-grid">
            <div class="data-card">
              <h3>GRAVITY PROFILE</h3>
              <div class="divider"></div>
              <ul class="data-list">
                <li><strong>3.0G STANDARD:</strong> Harsher than lunar gravity, but friendlier than Earth.</li>
                <li><strong>MOMENTUM:</strong> Vacuum environment. Lateral drift persists until countered.</li>
                <li><strong>RETRO-BRAKE:</strong> Press [C] to fire opposing RCS thrusters and damp lateral velocity.</li>
                <li><strong>LIFTOFF BOOST:</strong> Firing thrusters from a flat surface provides a temporary thrust multiplier.</li>
              </ul>
            </div>
            
            <div class="data-card data-card--alert">
              <h3>ENVIRONMENTAL HAZARDS</h3>
              <div class="divider"></div>
              <ul class="data-list">
                <li><strong>IMPACT:</strong> Kinetic damage scales exponentially with relative velocity.</li>
                <li><strong>SLOPES:</strong> The lander will attempt to conform to the terrain slope. Extreme slopes cause damage.</li>
                <li><strong>ADRIFT:</strong> Running out of fuel mid-flight guarantees a hard landing.</li>
              </ul>
            </div>
          </div>
        </section>

        <!-- Chapter 4: Upgrades -->
        <section v-if="currentChapter === 4" class="chapter-view fade-in">
          <div class="chapter-header">
            <h2>04 // LANDER UPGRADES</h2>
            <p class="subtitle">Engineering Bay & Modifications</p>
          </div>
          
          <div class="text-panel">
            <p>
              The Upgrades terminal is your engineering bay. Level 0 is factory spec.
              Every paid tier improves core coefficients: thrust efficiency, fuel capacity,
              engine speed, and hull plating.
            </p>
            
            <div class="installed-tech mt-8">
              <h3 class="text-amber-400 text-sm tracking-widest mb-4">CURRENT INSTALLED PACKAGES</h3>
              <div class="tech-grid">
                <div v-for="(level, id) in activeUpgrades" :key="id" class="tech-module">
                  <span class="tech-id">{{ id }}</span>
                  <span class="tech-level">MK.{{ level }}</span>
                </div>
                <div v-if="Object.keys(activeUpgrades).length === 0" class="text-slate-500 italic">
                  You haven't upgraded the lander. Visit the Engineering bay of a Spaceport.
                </div>
              </div>
            </div>

            <button class="action-btn mt-8" @click="$emit('switch-to-upgrades')">
              [ ACCESS ENGINEERING BAY ]
            </button>
          </div>
        </section>

        <!-- Chapter 5: Checklist -->
        <section v-if="currentChapter === 5" class="chapter-view fade-in">
          <div class="chapter-header">
            <h2>05 // OPERATIONAL PROTOCOL</h2>
            <p class="subtitle">Surface Extraction Procedures</p>
          </div>
          
          <div class="checklist-container">
            <div class="check-item">
              <div class="check-box">[ ]</div>
              <div class="check-text">
                <strong>VEHICLE SELECTION</strong><br>
                Lander is exclusively for surface extraction and exploration. Use the Shuttle for orbital transit.
              </div>
            </div>
            <div class="check-item">
              <div class="check-box">[ ]</div>
              <div class="check-text">
                <strong>PRE-FLIGHT CHECK</strong><br>
                Ensure fuel reserves are topped off before initiating descent. Gravity is unforgiving.
              </div>
            </div>
            <div class="check-item">
              <div class="check-box">[ ]</div>
              <div class="check-text">
                <strong>LANDING ZONE</strong><br>
                Identify flat terrain. Avoid craters, steep ridges, and hostile fauna.
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>

    <!-- Footer Pagination -->
    <footer class="manual-footer">
      <button class="nav-btn" :disabled="currentChapter === 1" @click="prevChapter">
        ◄ PREV
      </button>
      <div class="progress-indicator">
        <span v-for="n in chapters.length" :key="n" class="dot" :class="{ active: n === currentChapter }"></span>
      </div>
      <button class="nav-btn" :disabled="currentChapter === chapters.length" @click="nextChapter">
        NEXT ►
      </button>
    </footer>
  </div>
</template>

<style scoped>
.shuttle-manual-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: #a5f3fc;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  overflow: hidden;
}

/* --- HEADER --- */
.manual-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 1.5rem 2rem;
  border-bottom: 1px solid rgba(165, 243, 252, 0.2);
  background: linear-gradient(180deg, rgba(165, 243, 252, 0.05) 0%, transparent 100%);
}

.manual-header__title .brand {
  font-size: 0.65rem;
  letter-spacing: 0.3em;
  color: #fbbf24;
  display: block;
  margin-bottom: 0.25rem;
}

.manual-header__title h1 {
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  margin: 0;
  color: #fff;
}

.manual-header__title .version {
  font-size: 0.75rem;
  color: #64748b;
}

.manual-header__telemetry {
  display: flex;
  gap: 1rem;
}

.telemetry-block {
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(165, 243, 252, 0.3);
  padding: 0.25rem 0.75rem;
  min-width: 80px;
}

.telemetry-block .label {
  font-size: 0.55rem;
  color: #64748b;
  letter-spacing: 0.1em;
}

.telemetry-block .value {
  font-size: 0.9rem;
  color: #a5f3fc;
}

.telemetry-block--alert {
  border-color: #fbbf24;
}
.telemetry-block--alert .value {
  color: #fbbf24;
}

/* --- BODY & NAV --- */
.manual-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.manual-nav {
  width: 240px;
  border-right: 1px solid rgba(165, 243, 252, 0.1);
  padding: 2rem 0;
}

.nav-title {
  font-size: 0.65rem;
  color: #64748b;
  letter-spacing: 0.2em;
  padding: 0 2rem;
  margin-bottom: 1rem;
}

.nav-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  padding: 0.75rem 2rem;
  cursor: pointer;
  transition: all 0.2s;
  border-left: 2px solid transparent;
  color: #94a3b8;
}

.nav-item:hover {
  background: rgba(165, 243, 252, 0.05);
  color: #e2e8f0;
}

.nav-item.active {
  border-left-color: #a5f3fc;
  background: rgba(165, 243, 252, 0.1);
  color: #fff;
}

.nav-item .ch-num {
  font-size: 0.7rem;
  margin-right: 1rem;
  color: #fbbf24;
}

.nav-item .ch-title {
  font-size: 0.8rem;
  letter-spacing: 0.05em;
}

/* --- CONTENT AREA --- */
.manual-content {
  flex: 1;
  padding: 3rem;
  overflow-y: auto;
  position: relative;
}

.chapter-header {
  margin-bottom: 3rem;
}

.chapter-header h2 {
  font-size: 2rem;
  font-weight: 300;
  letter-spacing: 0.1em;
  color: #fff;
  margin: 0 0 0.5rem 0;
}

.chapter-header .subtitle {
  font-size: 1rem;
  color: #64748b;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
}

.text-panel {
  font-size: 0.9rem;
  line-height: 1.7;
  color: #cbd5e1;
}

.marta-quote {
  border-left: 2px solid #fbbf24;
  padding-left: 1rem;
  font-style: italic;
  color: #fbbf24;
  font-size: 0.85rem;
  opacity: 0.9;
}

/* --- SCHEMATICS --- */
.thruster-schematics {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.schematic-card {
  display: flex;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(165, 243, 252, 0.2);
  padding: 1rem;
}

.schematic-visual {
  width: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  margin-right: 1rem;
  padding-right: 1rem;
}

.schematic-visual pre {
  font-size: 0.6rem;
  line-height: 1.2;
  color: inherit;
}

.schematic-details {
  flex: 1;
}

.schematic-details h3 {
  font-size: 0.8rem;
  margin: 0 0 0.5rem 0;
  letter-spacing: 0.1em;
}

.charge-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  margin-bottom: 0.5rem;
}

.charge-fill {
  height: 100%;
  width: 75%;
  background: currentColor;
}

.schematic-details p {
  font-size: 0.75rem;
  color: #94a3b8;
  margin: 0 0 0.5rem 0;
}

.schematic-details .note {
  font-size: 0.65rem;
  color: #fbbf24;
  font-style: italic;
}

.schematic-card--cyan { color: #22d3ee; }
.schematic-card--amber { color: #fbbf24; }
.schematic-card--emerald { color: #34d399; }

/* --- DATA CARDS & LISTS --- */
.data-card {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(165, 243, 252, 0.2);
  padding: 2rem;
}

.data-card h3 {
  font-size: 1rem;
  color: #fff;
  margin: 0 0 1rem 0;
  letter-spacing: 0.1em;
}

.data-card .divider {
  height: 1px;
  background: linear-gradient(90deg, #a5f3fc, transparent);
  margin-bottom: 1.5rem;
}

.data-card--alert {
  border-color: rgba(251, 191, 36, 0.3);
}
.data-card--alert .divider {
  background: linear-gradient(90deg, #fbbf24, transparent);
}

.data-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.data-list li {
  margin-bottom: 1rem;
  font-size: 0.85rem;
  color: #cbd5e1;
  line-height: 1.5;
  padding-left: 1rem;
  position: relative;
}

.data-list li::before {
  content: '>';
  position: absolute;
  left: 0;
  color: #a5f3fc;
}

.data-card--alert .data-list li::before {
  color: #fbbf24;
}

/* --- VISUAL PANEL --- */
.visual-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at center, rgba(34, 211, 238, 0.1) 0%, transparent 70%);
  border: 1px dashed rgba(165, 243, 252, 0.2);
}

.ascii-art {
  font-size: 0.8rem;
  line-height: 1.2;
}

/* --- UPGRADES --- */
.tech-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.tech-module {
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid #22d3ee;
  padding: 0.5rem 1rem;
}

.tech-id {
  color: #fff;
  margin-right: 1rem;
  font-size: 0.85rem;
}

.tech-level {
  color: #22d3ee;
  font-size: 0.75rem;
}

.action-btn {
  background: transparent;
  border: 1px solid #fbbf24;
  color: #fbbf24;
  padding: 0.75rem 1.5rem;
  font-family: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: rgba(251, 191, 36, 0.1);
  box-shadow: 0 0 15px rgba(251, 191, 36, 0.2);
}

/* --- CHECKLIST --- */
.checklist-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 600px;
}

.check-item {
  display: flex;
  gap: 1.5rem;
  background: rgba(15, 23, 42, 0.4);
  padding: 1.5rem;
  border-left: 2px solid #a5f3fc;
}

.check-box {
  color: #64748b;
  font-size: 1.2rem;
}

.check-text {
  font-size: 0.9rem;
  line-height: 1.6;
  color: #cbd5e1;
}

.check-text strong {
  color: #fff;
  display: block;
  margin-bottom: 0.25rem;
  letter-spacing: 0.05em;
}

/* --- FOOTER NAV --- */
.manual-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  border-top: 1px solid rgba(165, 243, 252, 0.2);
}

.nav-btn {
  background: transparent;
  border: 1px solid rgba(165, 243, 252, 0.3);
  color: #a5f3fc;
  padding: 0.5rem 1rem;
  font-family: inherit;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-btn:hover:not(:disabled) {
  background: rgba(165, 243, 252, 0.1);
  border-color: #a5f3fc;
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.progress-indicator {
  display: flex;
  gap: 0.5rem;
}

.progress-indicator .dot {
  width: 6px;
  height: 6px;
  background: rgba(165, 243, 252, 0.2);
  border-radius: 50%;
}

.progress-indicator .dot.active {
  background: #a5f3fc;
  box-shadow: 0 0 8px #a5f3fc;
}

/* --- ANIMATIONS --- */
.fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>