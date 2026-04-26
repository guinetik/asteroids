<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UpgradeId } from '@/lib/upgrades'
import { uiAudio } from '@/audio/UiAudioDirector'

/**
 * Vale Orbital Refurb — Multitool SCI Orientation Manual.
 * Documents the science mode of the multitool, its RTG system, puzzle applications,
 * and upgrade synergies. Homage to Prey-style contextual scanning and manipulation.
 *
 * @author guinetik
 * @date 2026-04-26
 */

const props = defineProps<{
  upgradeLevels?: Partial<Record<UpgradeId, number>>
  dockedPlanet?: string | null
}>()

defineEmits<{
  'switch-to-upgrades': []
}>()

const activeUpgrades = computed(() => {
  if (!props.upgradeLevels) return {}
  return Object.fromEntries(
    Object.entries(props.upgradeLevels).filter(
      ([id, level]) => level > 0 && id.startsWith('multitool'),
    ),
  )
})

const modes = [
  {
    label: 'DRL',
    color: '#3b82f6',
    description: 'High-power mining drill. Primary resource extraction tool.',
  },
  {
    label: 'LAS',
    color: '#ff00ff',
    description: 'Laser weapon mode. Combat and precision cutting.',
  },
  {
    label: 'SCI',
    color: '#22c55e',
    description:
      'Science scanner. Contextual analysis, buffs, and environmental manipulation. High RTG cost.',
  },
]

const scienceLore = [
  'Lander hull repair on direct hit.',
  'Rock scan reveals wireframe overlay indicating optimal yield zones.',
  'Terminal interaction adds mission waypoint for gather targets.',
  'Ground impact creates small exploratory crater.',
  'Enemy scan can induce temporary faction confusion (turns against allies).',
]

const rtgInfo = {
  capacity: '900 base (upgradeable)',
  scienceBurn: '250 charge/sec - prevents spam, rewards precision use.',
  note: 'All modes draw from shared RTG pool per ThrusterSystem<T> pattern.',
}

const currentChapter = ref(1)

const chapters = [
  { id: 1, title: 'MODE OVERVIEW' },
  { id: 2, title: 'RTG POWER SYSTEM' },
  { id: 3, title: 'SCIENCE APPLICATIONS' },
  { id: 4, title: 'INSTALLED UPGRADES' },
  { id: 5, title: 'FIELD PROTOCOL' },
]

const nextChapter = () => {
  if (currentChapter.value < chapters.length) {
    uiAudio.notifyNavClick();
    currentChapter.value++
  }
}

const prevChapter = () => {
  if (currentChapter.value > 1) {
    uiAudio.notifyNavClick();
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
        <h1>MULTITOOL ORIENTATION <span class="version">v1.2 - SCI</span></h1>
      </div>
      <div class="manual-header__telemetry">
        <div class="telemetry-block">
          <span class="label">CLASS</span>
          <span class="value">MULTI</span>
        </div>
        <div class="telemetry-block">
          <span class="label">MODE</span>
          <span class="value">SCIENCE</span>
        </div>
        <div v-if="dockedPlanet" class="telemetry-block">
          <span class="label">LOC</span>
          <span class="value">@{{ dockedPlanet.toUpperCase() }}</span>
        </div>
      </div>
    </header>

    <div class="manual-content p-8">
      <div class="chapter-nav flex justify-between mb-6 border-b border-white/20 pb-4">
        <button
          @click="prevChapter"
          class="px-4 py-1 text-xs border border-white/30 hover:bg-white/10 transition-colors"
          :disabled="currentChapter === 1"
        >
          ← PREV
        </button>
        <div class="text-xs uppercase tracking-widest text-white/60 flex items-center gap-2">
          CHAPTER
          <span class="text-white font-mono">{{ currentChapter }}/{{ chapters.length }}</span>
        </div>
        <button
          @click="nextChapter"
          class="px-4 py-1 text-xs border border-white/30 hover:bg-white/10 transition-colors"
          :disabled="currentChapter === chapters.length"
        >
          NEXT →
        </button>
      </div>

      <div v-if="currentChapter === 1" class="space-y-8">
        <h2
          class="text-xl font-bold tracking-widest border-b border-emerald-400 pb-2 text-emerald-400"
        >
          MULTITOOL MODES
        </h2>
        <div v-for="mode in modes" :key="mode.label" class="tech-module p-4 border border-white/20">
          <div class="flex items-center gap-3 mb-3">
            <div
              class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono"
              :style="{ backgroundColor: mode.color + '20', color: mode.color }"
            >
              {{ mode.label }}
            </div>
            <h3 class="font-mono uppercase">{{ mode.label }} MODE</h3>
          </div>
          <p class="text-sm text-white/80">{{ mode.description }}</p>
        </div>
      </div>

      <div v-else-if="currentChapter === 2" class="space-y-6">
        <h2 class="text-xl font-bold tracking-widest border-b border-cyan-400 pb-2 text-cyan-400">
          RTG POWER SYSTEM
        </h2>
        <div class="tech-module p-6 bg-black/40 border border-cyan-400/30">
          <div class="grid grid-cols-2 gap-6 text-sm">
            <div>
              <div class="uppercase text-xs text-white/50 mb-1">FUEL CAPACITY</div>
              <div class="font-mono text-2xl text-cyan-400">{{ rtgInfo.capacity }}</div>
            </div>
            <div>
              <div class="uppercase text-xs text-white/50 mb-1">SCI BURN RATE</div>
              <div class="font-mono text-2xl text-rose-400">{{ rtgInfo.scienceBurn }}</div>
            </div>
          </div>
          <p class="mt-6 text-xs leading-relaxed text-white/70">{{ rtgInfo.note }}</p>
          <p class="mt-4 text-[10px] text-white/40">
            Follows shared ThrusterSystem&lt;MultiToolMode&gt; pattern with per-group charge bars.
            Recharge draws from fuel pool.
          </p>
        </div>
      </div>

      <div v-else-if="currentChapter === 3" class="space-y-6">
        <h2
          class="text-xl font-bold tracking-widest border-b border-emerald-400 pb-2 text-emerald-400"
        >
          SCIENCE APPLICATIONS
        </h2>
        <p class="text-sm text-white/80 mb-6">
          The SCI mode enables contextual environmental interaction. Inspired by Prey (2017)
          scanning and manipulation gameplay. High energy cost encourages thoughtful use.
        </p>
        <ul class="space-y-4">
          <li v-for="(effect, index) in scienceLore" :key="index" class="flex gap-3 text-sm">
            <span class="text-emerald-400 font-mono flex-shrink-0">0{{ index + 1 }}</span>
            <span class="text-white/80">{{ effect }}</span>
          </li>
        </ul>
        <p class="text-xs text-white/50 mt-8">
          Future expansions will integrate with minigames, mission objectives, and Act 3 puzzle
          systems.
        </p>
      </div>

      <div v-else-if="currentChapter === 4" class="space-y-6">
        <h2 class="text-xl font-bold tracking-widest border-b border-amber-400 pb-2 text-amber-400">
          INSTALLED MULTITOOL UPGRADES
        </h2>
        <div
          v-if="Object.keys(activeUpgrades).length === 0"
          class="text-white/40 text-sm p-8 border border-dashed border-white/20 text-center"
        >
          NO MULTITOOL UPGRADES INSTALLED
        </div>
        <div v-else class="grid grid-cols-1 gap-3">
          <div
            v-for="(level, id) in activeUpgrades"
            :key="id"
            class="tech-module flex justify-between items-center p-4 border border-amber-400/30 bg-black/30"
          >
            <span class="font-mono text-sm">{{
              id
                .replace('multitool', '')
                .replace(/([A-Z])/g, ' $1')
                .trim()
            }}</span>
            <span class="px-3 py-1 bg-amber-400/10 text-amber-400 text-xs font-mono rounded"
              >LV{{ level }}</span
            >
          </div>
        </div>
        <button
          @click="$emit('switch-to-upgrades')"
          class="w-full py-3 text-xs tracking-widest border border-white/40 hover:bg-white/5 transition-colors"
        >
          ACCESS UPGRADE BAY →
        </button>
      </div>

      <div v-else-if="currentChapter === 5" class="prose prose-invert text-sm max-w-none">
        <h2 class="text-xl font-bold tracking-widest border-b border-white/30 pb-2">
          FIELD PROTOCOL
        </h2>
        <p>1. High burn rate on SCI prevents spam. Coordinate with RTG bursts.</p>
        <p>
          2. Use in combination with photometry/survey minigames for maximum CR multiplier via
          multitoolScience upgrade.
        </p>
        <p>
          3. Wireframe overlay on rocks reveals hidden composition for better mining efficiency.
        </p>
        <p class="text-emerald-400">
          Marta's Note: The SCI mode isn't just a tool—it's how we understand the universe one scan
          at a time.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shuttle-manual-container {
  height: 100%;
  background: #050505;
  color: white;
  font-family: monospace;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.manual-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(to right, #111, #1a1a1a);
}

.manual-header__title h1 {
  font-size: 1.1rem;
  letter-spacing: 2px;
  margin: 0;
  font-weight: 400;
}

.version {
  font-size: 0.7rem;
  color: #22c55e;
  opacity: 0.7;
}

.manual-header__telemetry {
  display: flex;
  gap: 1.5rem;
  font-size: 0.75rem;
}

.telemetry-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1;
}

.label {
  color: #666;
  font-size: 0.65rem;
  letter-spacing: 1px;
}

.value {
  color: #22c55e;
  font-family: monospace;
  font-weight: 700;
}

.manual-content {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
  background: repeating-linear-gradient(45deg, #0a0a0a, #0a0a0a 2px, #111 2px, #111 4px);
}

.tech-module {
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 1rem;
  margin-bottom: 1rem;
}

.chapter-nav button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
</style>
