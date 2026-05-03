<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PlayerProfile } from '@/lib/player/types'
import type { Inventory } from '@/lib/inventory/types'
import type { CosmeticCategory, PremiumTradeSession } from '@/lib/cosmetics/types'
import {
  findCosmeticOptionById,
  getCosmeticOptions,
  getPimpMyShuttleConfig,
  SHUTTLE_TITLE_SERVICE_OPTION_ID,
} from '@/lib/cosmetics/catalog'
import {
  computePremiumSellPrice,
  getPremiumDesirabilityPips,
  isPremiumBuyerItem,
} from '@/lib/cosmetics/premiumTrade'
import {
  getActiveCosmeticOptionId,
  getCosmeticCategories,
  getPlayerCosmetics,
  playerOwnsCosmeticOption,
} from '@/lib/cosmetics/profileCosmetics'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { DEFAULT_BINDINGS } from '@/lib/defaultBindings'
import { uiAudio } from '@/audio/UiAudioDirector'

const props = defineProps<{
  profile: PlayerProfile
  inventory: Inventory
  premiumSession: PremiumTradeSession
  shuttlePreviewUrl?: string | null
  landerPreviewUrl?: string | null
  multitoolPreviewUrl?: string | null
}>()

const emit = defineEmits<{
  close: []
  purchaseOption: [optionId: string]
  applyOption: [optionId: string]
  renameShuttle: [rawTitle: string]
  sellPremium: [itemId: string, quantity: number]
}>()

const shopLabel = computed(() => getPimpMyShuttleConfig().label)

const cosmeticHotkeyHint = computed(() =>
  bindingCodeToLetter(DEFAULT_BINDINGS['cosmeticShopAction']?.[0] ?? 'KeyP'),
)

function bindingCodeToLetter(code: string): string {
  if (code.startsWith('Key') && code.length === 4) return code.slice(3)
  return code
}

const tabOrder = computed(() => {
  const order = new Map<CosmeticCategory, number>()
  ;(
    [
      'shuttle-paintjob',
      'lander-paintjob',
      'multitool-paintjob',
      'shuttle-title',
      'vehicle-flag',
      'shuttle-thruster-trail',
      'lander-thruster-trail',
    ] as unknown as CosmeticCategory[]
  ).forEach((id, index) => {
    order.set(id, index)
  })
  const fromCatalog = getCosmeticCategories()
  const sorted = [...fromCatalog].sort((a, b) => {
    const ax = order.get(a) ?? 99
    const bx = order.get(b) ?? 99
    return ax - bx
  })
  return [...sorted, 'premium'] as const
})

type ShopTabId = CosmeticCategory | 'premium'

const activeTab = ref<ShopTabId>('shuttle-paintjob')

const cosmetics = computed(() => getPlayerCosmetics(props.profile))

const titleDraft = ref(cosmetics.value.shuttleTitle)

watch(
  () => props.profile.cosmetics?.shuttleTitle,
  (next) => {
    titleDraft.value = next ?? ''
  },
)

const titleRenamePrice = findCosmeticOptionById(SHUTTLE_TITLE_SERVICE_OPTION_ID)?.price ?? 5000

const premiumStacks = computed(() =>
  props.inventory.stacks.filter((s) => s.quantity > 0 && isPremiumBuyerItem(s.itemId)),
)

function tabLabel(tab: ShopTabId): string {
  if (tab === 'premium') return 'Cargo Intake'
  if (tab === 'shuttle-paintjob') return 'Shuttle Hull'
  if (tab === 'lander-paintjob') return 'Lander Hull'
  if (tab === 'shuttle-title') return 'Shuttle Title'
  if (tab === 'vehicle-flag') return 'Flags'
  if (tab === 'shuttle-thruster-trail') return 'Shuttle Trails'
  if (tab === 'lander-thruster-trail') return 'Lander Trails'
  if (tab === 'multitool-paintjob') return 'Multitool'
  return tab
}

/** Intro copy for hull / trail / multitool / flag tabs (mirrors Engineering Bay flavor blocks). */
const COSMETIC_PANEL_INTROS: Record<
  | 'shuttle-paintjob'
  | 'lander-paintjob'
  | 'vehicle-flag'
  | 'shuttle-thruster-trail'
  | 'lander-thruster-trail'
  | 'multitool-paintjob',
  string
> = {
  'shuttle-paintjob':
    'Fantasia wants your frame to stop cosplaying humility. Factory stock is the honest hangar delivery—everything else is paid vanity you can peel back whenever budgets cry.',
  'lander-paintjob':
    'Your descent shell still thinks it is a rental. Start from factory aeroshell honesty, then layer hero paint if you insist on being seen from orbit.',
  'vehicle-flag':
    'Shared pennants ride both craft—skip the fuss with No Pennant, or slap a morale decal that screams where you fueled last.',
  'shuttle-thruster-trail':
    'Main engine wash is ego on telemetry. Regulations bless the tame factory plum stack; flashy trails are discretionary exhaust art.',
  'lander-thruster-trail':
    'RCS puff aesthetics for butter-soft touchdowns. OEM defaults whisper compliance; tinted micro-thrust screams personality.',
  'multitool-paintjob':
    'Multitool tinsel stays with you EVA-side. Fleet issue hides coffee stains—garish tinsel broadcasts that you wrench with intent.',
}

/** Shuttle title tab narration above the rename field. */
const SHUTTLE_TITLE_PANEL_INTRO =
  'Registry fees buy BayComms-safe characters on your ticker—Fantasia insists on polite capitalization so traffic control stops squawking.'

const activePanelIntro = computed((): string => {
  const tab = activeTab.value
  if (tab === 'premium') return ''
  if (tab === 'shuttle-title') return SHUTTLE_TITLE_PANEL_INTRO
  return COSMETIC_PANEL_INTROS[tab]
})

function formatSkuCredits(price: number): string {
  return price <= 0 ? 'Free' : `${price.toLocaleString()} CR`
}

/** Channel chip labels in render order (matches the in-game paint channel mapping). */
const SHADER_SHARD_CHIP_LABELS = ['P', 'S', 'T'] as const

/** Soft highlight position inside the metallic shard (CSS vars for the gloss layer). */
const SHADER_SHARD_HIGHLIGHT_X = '28%'
const SHADER_SHARD_HIGHLIGHT_Y = '22%'

/**
 * Build CSS variables that drive the painted-metal shard backgrounds. The shop swatch
 * mirrors the in-game gradient ramp — same stops, same dominant flow direction.
 */
function shaderShardStyle(stops: readonly string[]): Record<string, string> {
  const ribbon = `linear-gradient(105deg, ${stops.join(', ')})`
  const tail = stops[stops.length - 1] ?? '#1a1a1a'
  const head = stops[0] ?? '#ffffff'
  return {
    '--shard-ribbon': ribbon,
    '--shard-head': head,
    '--shard-tail': tail,
    '--shard-highlight-x': SHADER_SHARD_HIGHLIGHT_X,
    '--shard-highlight-y': SHADER_SHARD_HIGHLIGHT_Y,
  }
}

/** Pick the chip color for a channel index, falling back to the previous stop. */
function shaderShardChipColor(stops: readonly string[], index: number): string {
  const direct = stops[index]
  if (direct) return direct
  const fallback = stops[stops.length - 1]
  return fallback ?? '#ffffff'
}

/** Number of channel chips to render — capped at the available stop count and 3. */
function shaderShardChipCount(stops: readonly string[]): number {
  return Math.min(SHADER_SHARD_CHIP_LABELS.length, Math.max(1, stops.length))
}

function canAffordPrice(price: number): boolean {
  return props.profile.credits >= price
}

function primaryActionLabel(
  optionId: string,
  category: CosmeticCategory,
): 'Active' | 'Apply' | 'Buy' {
  const activeId = getActiveCosmeticOptionId(cosmetics.value, category)
  if (activeId === optionId) return 'Active'
  if (playerOwnsCosmeticOption(cosmetics.value, optionId)) return 'Apply'
  return 'Buy'
}

function isPrimaryDisabled(optionId: string, category: CosmeticCategory, price: number): boolean {
  const label = primaryActionLabel(optionId, category)
  if (label === 'Active') return true
  if (label === 'Buy') return !canAffordPrice(price)
  return false
}

function onPrimary(optionId: string, category: CosmeticCategory): void {
  const label = primaryActionLabel(optionId, category)
  if (label === 'Active') return
  uiAudio.notifyConfirm()
  if (label === 'Buy') {
    emit('purchaseOption', optionId)
    return
  }
  emit('applyOption', optionId)
}

function onRenameSubmit(): void {
  emit('renameShuttle', titleDraft.value)
}

function requestClose(): void {
  uiAudio.notifyCancel()
  emit('close')
}

function onShopTabClick(tab: ShopTabId): void {
  uiAudio.notifySwitch()
  activeTab.value = tab
}

function onSaveTitleClick(): void {
  uiAudio.notifyConfirm()
  onRenameSubmit()
}

function onFlagPrimaryClick(optionId: string): void {
  uiAudio.notifyButtonClick()
  onPrimary(optionId, 'vehicle-flag')
}

function onPremiumSellOne(itemId: string): void {
  uiAudio.notifyConfirm()
  emit('sellPremium', itemId, 1)
}

function onPremiumSellAll(itemId: string, quantity: number): void {
  uiAudio.notifyConfirm()
  emit('sellPremium', itemId, quantity)
}

function pipRowPremium(itemId: string): boolean[] {
  return Array.from(
    { length: 5 },
    (_, index) => index < getPremiumDesirabilityPips(props.premiumSession, itemId),
  )
}

function onKeydown(e: KeyboardEvent): void {
  if (e.code === 'Escape') {
    requestClose()
  }
}

function normalizedTitleCostOk(): boolean {
  return titleRenamePrice > 0 && props.profile.credits >= titleRenamePrice
}

function normalizedTitleBlocked(): boolean {
  const draft = titleDraft.value.trim()
  if (draft.length === 0) return true
  return draft === cosmetics.value.shuttleTitle.trim()
}
</script>

<template>
  <div class="planet-shop-overlay" tabindex="0" @keydown="onKeydown">
    <div class="cosmetic-shop-card">
      <div class="planet-shop-ambient">
        <div class="cosmetic-shop-ambient__backdrop" aria-hidden="true" />
        <div class="planet-shop-ambient__stack">
          <div class="cosmetic-shop-header">
            <div class="cosmetic-shop-header__titles">
              <span class="cosmetic-shop-header__title">{{ shopLabel }}</span>
              <span class="cosmetic-shop-header__subtitle"
                >Fantasia Mira-Io • {{ cosmeticHotkeyHint }} toggles • Premium cargo scales</span
              >
            </div>
            <span class="cosmetic-shop-header__credits"
              >CR {{ profile.credits.toLocaleString() }}</span
            >
            <button type="button" class="ship-message-card__button" @click="requestClose">
              Close
            </button>
          </div>

          <div class="cosmetic-shop-body">
            <div class="cosmetic-shop-tabs-rail">
              <div class="cosmetic-shop-tabs" role="tablist">
                <button
                  v-for="tab in tabOrder"
                  :key="'tab-' + tab"
                  type="button"
                  role="tab"
                  class="cosmetic-shop-tab"
                  :aria-selected="activeTab === tab"
                  @click="onShopTabClick(tab)"
                >
                  {{ tabLabel(tab) }}
                </button>
              </div>
            </div>

            <Transition name="cosmetic-shop-panel-swap" mode="out-in">
              <div
                v-if="activeTab !== 'premium'"
                :key="'cat-' + String(activeTab)"
                class="cosmetic-shop-panel cosmetic-shop-panel--category"
              >
                <div
                  v-if="activeTab === 'shuttle-paintjob' && shuttlePreviewUrl"
                  class="cosmetic-vehicle-preview"
                >
                  <img
                    class="cosmetic-vehicle-preview__image"
                    :src="shuttlePreviewUrl"
                    alt="Current shuttle paint preview"
                  />
                  <div class="cosmetic-vehicle-preview__meta">
                    <span class="cosmetic-vehicle-preview__label">Current Shuttle Finish</span>
                    <span class="cosmetic-vehicle-preview__name">{{
                      findCosmeticOptionById(cosmetics.shuttlePaintjobId)?.label ??
                      cosmetics.shuttlePaintjobId
                    }}</span>
                  </div>
                </div>
                <div
                  v-if="activeTab === 'lander-paintjob' && landerPreviewUrl"
                  class="cosmetic-vehicle-preview"
                >
                  <img
                    class="cosmetic-vehicle-preview__image"
                    :src="landerPreviewUrl"
                    alt="Current lander paint preview"
                  />
                  <div class="cosmetic-vehicle-preview__meta">
                    <span class="cosmetic-vehicle-preview__label">Current Lander Finish</span>
                    <span class="cosmetic-vehicle-preview__name">{{
                      findCosmeticOptionById(cosmetics.landerPaintjobId)?.label ??
                      cosmetics.landerPaintjobId
                    }}</span>
                  </div>
                </div>
                <div
                  v-if="activeTab === 'multitool-paintjob' && multitoolPreviewUrl"
                  class="cosmetic-vehicle-preview"
                >
                  <img
                    class="cosmetic-vehicle-preview__image"
                    :src="multitoolPreviewUrl"
                    alt="Current multitool paint preview"
                  />
                  <div class="cosmetic-vehicle-preview__meta">
                    <span class="cosmetic-vehicle-preview__label">Current Multitool Finish</span>
                    <span class="cosmetic-vehicle-preview__name">{{
                      findCosmeticOptionById(cosmetics.multitoolPaintjobId)?.label ??
                      cosmetics.multitoolPaintjobId
                    }}</span>
                  </div>
                </div>
                <div class="cosmetic-shop-panel__scroll">
                  <p v-if="activePanelIntro.length > 0" class="cosmetic-shop-panel__intro">
                    {{ activePanelIntro }}
                  </p>
                  <template v-if="activeTab !== 'shuttle-title' && activeTab !== 'vehicle-flag'">
                    <div
                      v-for="option in getCosmeticOptions(activeTab)"
                      :key="option.id"
                      class="cosmetic-option-row"
                    >
                      <div
                        class="cosmetic-shader-shard cosmetic-option-row__swatch"
                        :style="shaderShardStyle(option.gradientStops)"
                        aria-hidden="true"
                      >
                        <div class="cosmetic-shader-shard__ribbon" />
                        <div class="cosmetic-shader-shard__sheen" />
                        <div class="cosmetic-shader-shard__highlight" />
                        <div class="cosmetic-shader-shard__chips">
                          <span
                            v-for="i in shaderShardChipCount(option.gradientStops)"
                            :key="'chip-' + option.id + '-' + i"
                            class="cosmetic-shader-shard__chip"
                            :style="{
                              background: shaderShardChipColor(option.gradientStops, i - 1),
                            }"
                          >
                            {{ SHADER_SHARD_CHIP_LABELS[i - 1] }}
                          </span>
                        </div>
                      </div>
                      <div class="cosmetic-option-row__meta">
                        <span class="cosmetic-option-row__name">{{ option.label }}</span>
                        <span class="cosmetic-option-row__desc">{{ option.description }}</span>
                      </div>
                      <span class="cosmetic-option-row__price">{{
                        formatSkuCredits(option.price)
                      }}</span>
                      <button
                        type="button"
                        class="cosmetic-option-row__action"
                        :disabled="isPrimaryDisabled(option.id, activeTab, option.price)"
                        @click="onPrimary(option.id, activeTab)"
                      >
                        {{ primaryActionLabel(option.id, activeTab) }}
                      </button>
                    </div>
                  </template>

                  <template v-else-if="activeTab === 'shuttle-title'">
                    <div class="cosmetic-title-editor">
                      <label class="cosmetic-title-editor__label" for="shuttle-title-input"
                        >Transponder Title</label
                      >
                      <input
                        id="shuttle-title-input"
                        v-model="titleDraft"
                        type="text"
                        maxlength="48"
                        class="cosmetic-title-editor__field"
                      />
                      <div class="cosmetic-title-editor__footer">
                        <span class="cosmetic-title-editor__price"
                          >{{ titleRenamePrice.toLocaleString() }} CR per rename</span
                        >
                        <button
                          type="button"
                          class="cosmetic-option-row__action"
                          :disabled="!normalizedTitleCostOk() || normalizedTitleBlocked()"
                          @click="onSaveTitleClick"
                        >
                          Save Title
                        </button>
                      </div>
                      <p class="cosmetic-title-editor__hint">
                        Blank saves are refused. Duplicates matching your current banner are free
                        rejects.
                      </p>
                    </div>
                  </template>

                  <template v-else>
                    <div class="cosmetic-flag-grid">
                      <button
                        v-for="flag in getCosmeticOptions('vehicle-flag')"
                        :key="flag.id"
                        type="button"
                        class="cosmetic-flag-btn"
                        :data-active="cosmetics.vehicleFlagId === flag.id ? 'true' : 'false'"
                        :disabled="isPrimaryDisabled(flag.id, 'vehicle-flag', flag.price)"
                        :title="flag.label"
                        @click="onFlagPrimaryClick(flag.id)"
                      >
                        <span class="cosmetic-flag-btn__emoji" aria-hidden="true">{{
                          flag.emoji ?? '—'
                        }}</span>
                        <span class="cosmetic-flag-btn__label">{{ flag.label }}</span>
                        <span class="cosmetic-flag-btn__price">{{
                          formatSkuCredits(flag.price)
                        }}</span>
                      </button>
                    </div>
                  </template>
                </div>
              </div>

              <div
                v-else
                key="premium-cargo"
                class="cosmetic-shop-panel cosmetic-shop-panel--premium"
              >
                <h3 class="cosmetic-premium-heading">Cargo Intake (Premium Buyer)</h3>
                <p class="cosmetic-premium-copy">
                  Fantasia pays hotter than polite yellow desks. Magenta glow on demand pips = extra
                  love.
                </p>
                <div v-if="premiumStacks.length === 0" class="cosmetic-premium-empty">
                  No trade goods
                </div>
                <div v-else class="cosmetic-premium-rows">
                  <div
                    v-for="stack in premiumStacks"
                    :key="stack.itemId"
                    class="cosmetic-premium-row"
                  >
                    <div class="cosmetic-premium-row__lead">
                      <span class="cosmetic-premium-row__title">{{
                        getItemDefinition(stack.itemId)?.label ?? stack.itemId
                      }}</span>
                      <span class="cosmetic-premium-row__meta"
                        >{{ stack.quantity }}u · {{ stack.totalWeightKg.toFixed(0) }}kg</span
                      >
                    </div>
                    <div class="cosmetic-premium-row__pips">
                      <span
                        v-for="(active, pipIndex) in pipRowPremium(stack.itemId)"
                        :key="stack.itemId + '-pip-' + pipIndex"
                        class="inventory-table__pip cosmetic-premium-pip"
                        :class="
                          active
                            ? 'inventory-table__pip--active cosmetic-premium-pip--hot'
                            : 'inventory-table__pip--inactive'
                        "
                      />
                    </div>
                    <span class="cosmetic-premium-row__price"
                      >{{
                        computePremiumSellPrice(premiumSession, stack.itemId).toLocaleString()
                      }}
                      CR</span
                    >
                    <div class="cosmetic-premium-row__sell">
                      <button
                        type="button"
                        class="cosmetic-premium-row__sell-btn"
                        @click="onPremiumSellOne(stack.itemId)"
                      >
                        Sell
                      </button>
                      <button
                        type="button"
                        class="cosmetic-premium-row__sell-btn"
                        @click="onPremiumSellAll(stack.itemId, stack.quantity)"
                      >
                        All
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
