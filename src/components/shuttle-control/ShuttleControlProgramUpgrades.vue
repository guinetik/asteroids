<script setup lang="ts">
import { computed } from 'vue'
import {
  getUpgradeCost,
  getUpgradesByCategory,
  type NumericUpgradeDefinition,
  type UpgradeCategory,
  type UpgradeId,
} from '@/lib/upgrades'
import { formatUpgradeStatValue, statValueAtDisplayLevel } from '@/lib/upgrades/upgradeUiFormat'

const props = defineProps<{
  /** Current credit balance (same source as map HUD). */
  playerCredits: number
  /** One entry per upgrade id — level 0..max. */
  upgradeLevels: Partial<Record<UpgradeId, number>>
}>()

const emit = defineEmits<{
  'purchase-upgrade': [upgradeId: UpgradeId]
}>()

/** Sidebar / section titles for each upgrade category. */
const CATEGORY_LABELS: Record<UpgradeCategory, string> = {
  shuttle: 'Shuttle systems',
  lander: 'Lander',
  multitool: 'Multitool',
  suit: 'Suit',
}

/** Categories in display order. */
const CATEGORY_ORDER: UpgradeCategory[] = ['shuttle', 'lander', 'multitool', 'suit']

/** One upgrade row with precomputed effect strings for the template. */
interface UpgradeRowVm {
  def: NumericUpgradeDefinition
  id: UpgradeId
  effectNow: string
  effectNext: string | null
}

const categories = computed(() =>
  CATEGORY_ORDER.map((category) => {
    const upgrades = getUpgradesByCategory(category).map((def): UpgradeRowVm => {
      const id = def.id as UpgradeId
      const cur = props.upgradeLevels[id] ?? 0
      const effectNow = formatUpgradeStatValue(statValueAtDisplayLevel(def, cur))
      const effectNext =
        cur >= def.maxLevel
          ? null
          : formatUpgradeStatValue(statValueAtDisplayLevel(def, cur + 1))
      return { def, id, effectNow, effectNext }
    })
    return {
      category,
      label: CATEGORY_LABELS[category],
      upgrades,
    }
  }),
)

function currentLevel(id: UpgradeId): number {
  return props.upgradeLevels[id] ?? 0
}

/** Purchasable tiers only (1..max); level 0 is baseline UI. */
function purchasableSlotLevels(def: NumericUpgradeDefinition): number[] {
  return Array.from({ length: def.maxLevel }, (_, i) => i + 1)
}

function levelState(upgradeId: UpgradeId, slotLevel: number): 'owned' | 'next' | 'locked' {
  const cur = currentLevel(upgradeId)
  if (cur >= slotLevel) return 'owned'
  if (cur + 1 === slotLevel) return 'next'
  return 'locked'
}

function tryBuy(upgradeId: UpgradeId, slotLevel: number): void {
  if (levelState(upgradeId, slotLevel) !== 'next') return
  emit('purchase-upgrade', upgradeId)
}

function rowIconLetter(def: NumericUpgradeDefinition): string {
  return def.label.trim().charAt(0).toUpperCase()
}

function rowIconModifier(category: UpgradeCategory): string {
  return `upgrade-shop-program__row-icon--${category}`
}
</script>

<template>
  <div class="shuttle-control-screen upgrade-shop-program">
    <div class="upgrade-shop-program__header">
      <h2 class="shuttle-control-screen__title">Engineering bay</h2>
      <p class="upgrade-shop-program__credits">
        Balance <span class="upgrade-shop-program__credits-value">CR {{ playerCredits.toLocaleString() }}</span>
      </p>
    </div>
    <p class="upgrade-shop-program__intro">
      You're hard-docked at the
      <span class="upgrade-shop-program__intro-em">orbital spaceport</span>
      &mdash; same facility that handles fuel cells, trades, and the occasional hull patch. Port engineering keeps this
      channel open for flight-certified refits:
      <span class="upgrade-shop-program__intro-em">level&nbsp;0</span>
      is whatever the frame shipped with from the yard; each paid tier bolts on a better coefficient in the readout.
      Credits post the moment you confirm. Check
      <span class="upgrade-shop-program__intro-em">Now</span>
      and
      <span class="upgrade-shop-program__intro-em">Next tier</span>
      before you spend &mdash; no take-backs once the wire transfer clears.
    </p>

    <div
      v-for="block in categories"
      :key="block.category"
      class="upgrade-shop-program__category"
    >
      <div class="upgrade-shop-program__category-head">
        <div class="upgrade-shop-program__category-icon" aria-hidden="true">
          <!-- Shuttle -->
          <svg
            v-if="block.category === 'shuttle'"
            class="upgrade-shop-program__category-svg"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 3v6M9 9h6l-1 9h-4L9 9Zm-3 3-2 2m11-2 2 2M12 18v3"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <!-- Lander -->
          <svg
            v-else-if="block.category === 'lander'"
            class="upgrade-shop-program__category-svg"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M6 18h12M8 18l-2 4M16 18l2 4M12 5v8M9 13h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2Z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <!-- Multitool -->
          <svg
            v-else-if="block.category === 'multitool'"
            class="upgrade-shop-program__category-svg"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="m14.7 6.3 1.4-1.4M9.3 17.7l-1.4 1.4M18 10l2-2M4 16l2-2m3.3-5.7L5 4m14 16-4.3-4.3M12 8a4 4 0 1 0 4 4"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
          <!-- Suit -->
          <svg
            v-else
            class="upgrade-shop-program__category-svg"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 3a3 3 0 0 1 3 3v1H9V6a3 3 0 0 1 3-3Zm-5 9c0-2 2-4 5-4s5 2 5 4v8H7v-8Z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <h3 class="upgrade-shop-program__category-title">{{ block.label }}</h3>
      </div>
      <ul class="upgrade-shop-program__list" role="list">
        <li
          v-for="row in block.upgrades"
          :key="row.def.id"
          class="upgrade-shop-program__row"
        >
          <div
            class="upgrade-shop-program__row-icon"
            :class="rowIconModifier(row.def.category)"
            aria-hidden="true"
          >
            {{ rowIconLetter(row.def) }}
          </div>
          <div class="upgrade-shop-program__meta">
            <span class="upgrade-shop-program__name">{{ row.def.label }}</span>
            <span class="upgrade-shop-program__desc">{{ row.def.description }}</span>
          </div>
          <div class="upgrade-shop-program__effect-compare">
            <div class="upgrade-shop-program__effect-line">
              <span class="upgrade-shop-program__effect-label">Now</span>
              <span class="upgrade-shop-program__effect-value">×{{ row.effectNow }}</span>
            </div>
            <div v-if="row.effectNext" class="upgrade-shop-program__effect-line">
              <span class="upgrade-shop-program__effect-label">Next tier</span>
              <span class="upgrade-shop-program__effect-value upgrade-shop-program__effect-value--gain">
                ×{{ row.effectNext }}
              </span>
            </div>
            <div v-else class="upgrade-shop-program__effect-line upgrade-shop-program__effect-line--max">
              <span class="upgrade-shop-program__effect-label">Next tier</span>
              <span class="upgrade-shop-program__effect-muted">Max</span>
            </div>
          </div>
          <div class="upgrade-shop-program__levels-wrap">
            <span class="upgrade-shop-program__levels-header">Levels</span>
            <div class="upgrade-shop-program__levels" role="group" :aria-label="`${row.def.label} tiers`">
              <div
                class="upgrade-shop-program__level upgrade-shop-program__level--baseline"
                role="presentation"
              >
                <span class="upgrade-shop-program__level-num">0</span>
                <span class="upgrade-shop-program__level-cost">Base</span>
              </div>
              <button
                v-for="slotLevel in purchasableSlotLevels(row.def)"
                :key="slotLevel"
                type="button"
                class="upgrade-shop-program__level"
                :class="{
                  'upgrade-shop-program__level--owned':
                    levelState(row.id, slotLevel) === 'owned',
                  'upgrade-shop-program__level--next':
                    levelState(row.id, slotLevel) === 'next',
                  'upgrade-shop-program__level--locked':
                    levelState(row.id, slotLevel) === 'locked',
                  'upgrade-shop-program__level--unaffordable':
                    levelState(row.id, slotLevel) === 'next' &&
                    playerCredits < getUpgradeCost(row.id, slotLevel),
                }"
                :disabled="
                  levelState(row.id, slotLevel) !== 'next' ||
                  playerCredits < getUpgradeCost(row.id, slotLevel)
                "
                :aria-label="`Level ${slotLevel}, ${getUpgradeCost(row.id, slotLevel)} CR`"
                @click="tryBuy(row.id, slotLevel)"
              >
                <span class="upgrade-shop-program__level-num">{{ slotLevel }}</span>
                <span class="upgrade-shop-program__level-cost">
                  {{ getUpgradeCost(row.id, slotLevel).toLocaleString() }}
                </span>
              </button>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
