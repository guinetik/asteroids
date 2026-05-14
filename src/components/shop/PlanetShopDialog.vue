<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ShopSession, TradeGoodSlot } from '@/lib/shop/tradeTypes'
import type { PlayerProfile } from '@/lib/player/types'
import type { Inventory } from '@/lib/inventory/types'
import { getTradeGood } from '@/lib/shop/tradeGoods'
import {
  REFUEL_COST,
  RESERVE_FUEL_COST,
  LANDER_FUEL_COST,
  LANDER_REPAIR_COST,
  REPAIR_COST,
  getBribeCost,
} from '@/lib/shop/shopSession'
import { getInventoryCategoryBorderUrl } from '@/lib/inventory/itemCategoryBorder'
import { INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS } from '@/lib/inventory/inventoryCategorySlotLayout'
import InventoryTable from './InventoryTable.vue'
import { uiAudio } from '@/audio/UiAudioDirector'

const props = defineProps<{
  session: ShopSession
  profile: PlayerProfile
  inventory: Inventory
  fuelFull?: boolean
  hullFull?: boolean
  landerHullFull?: boolean
}>()

const emit = defineEmits<{
  close: []
  buyTradeGood: [slotIndex: number, quantity: number]
  sellItem: [itemId: string, quantity: number]
  refuel: []
  buyReserveFuel: []
  buyLanderFuel: []
  repairHull: []
  repairLander: []
  bribeRestock: []
}>()

const bribeCost = computed(() => getBribeCost(props.session))

const planetName = computed(() => {
  const id = props.session.planetId
  return id.charAt(0).toUpperCase() + id.slice(1)
})

const restockRemaining = computed(() => {
  if (!props.session.restockTimer) return null
  const s = Math.ceil(props.session.restockTimer.remaining)
  const min = Math.floor(s / 60)
  const sec = s % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
})

const tradeGroupLabel = computed(() =>
  props.session.planetId === 'venus' ? 'THE VENUSIAN ZEPPELIN' : 'Trade Goods',
)

function slotLabel(slot: TradeGoodSlot) {
  const tg = getTradeGood(slot.itemId)
  return tg?.label ?? slot.itemId
}

function slotDescription(slot: TradeGoodSlot) {
  const tg = getTradeGood(slot.itemId)
  return tg?.description ?? ''
}

/** Station services use the equipment (cyan) inventory slot frame, matching the Sell column styling. */
const shopServiceCategoryBorderUrl = getInventoryCategoryBorderUrl('equipment')

/** Buy-column fuel cells use the consumable (green) inventory slot frame. */
const shopFuelCategoryBorderUrl = getInventoryCategoryBorderUrl('consumable')

/** Trade-good slots use the trade-good (amber) inventory slot frame. */
const shopTradeCategoryBorderUrl = getInventoryCategoryBorderUrl('trade-good')

/** Bribe-to-restock uses the mission-material (purple) inventory slot frame. */
const shopBribeCategoryBorderUrl = getInventoryCategoryBorderUrl('mission-material')

const venusLocalSlots = computed(() => props.session.tradeSlots.filter((slot) => !slot.isImported))

const venusImportSlots = computed(() => props.session.tradeSlots.filter((slot) => slot.isImported))

function formatPlanetLabel(planetId: string): string {
  return planetId
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function slotOriginLabel(slot: TradeGoodSlot): string | null {
  if (!slot.isImported) return null
  const origin = slot.originPlanetId ?? getTradeGood(slot.itemId)?.producedBy
  if (!origin) return null
  return `FROM ${formatPlanetLabel(origin).toUpperCase()}`
}

function canAfford(cost: number): boolean {
  return props.profile.credits >= cost
}

const servicesOpen = ref(false)
const fuelOpen = ref(false)
const tradeOpen = ref(true)

function toggleServices(): void {
  servicesOpen.value = !servicesOpen.value
  uiAudio.notifySwitch()
}

function toggleFuel(): void {
  fuelOpen.value = !fuelOpen.value
  uiAudio.notifySwitch()
}

function toggleTrade(): void {
  tradeOpen.value = !tradeOpen.value
  uiAudio.notifySwitch()
}

function requestClose(): void {
  uiAudio.notifyCancel()
  emit('close')
}

function onRefuelClick(): void {
  uiAudio.notifyConfirm()
  emit('refuel')
}

function onRepairHullClick(): void {
  uiAudio.notifyConfirm()
  emit('repairHull')
}

function onRepairLanderClick(): void {
  uiAudio.notifyConfirm()
  emit('repairLander')
}

function onBuyReserveFuelClick(): void {
  uiAudio.notifyConfirm()
  emit('buyReserveFuel')
}

function onBuyLanderFuelClick(): void {
  uiAudio.notifyConfirm()
  emit('buyLanderFuel')
}

function onBuyTradeGoodClick(slotIndex: number): void {
  uiAudio.notifyConfirm()
  emit('buyTradeGood', slotIndex, 1)
}

function onBribeRestockClick(): void {
  uiAudio.notifyConfirm()
  emit('bribeRestock')
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' || e.code === 'KeyB') {
    requestClose()
  }
}
</script>

<template>
  <div class="planet-shop-overlay" @keydown="onKeydown" tabindex="0">
    <div class="planet-shop-card">
      <div class="planet-shop-ambient">
        <div class="planet-shop-ambient__backdrop" aria-hidden="true" />
        <div class="planet-shop-ambient__stack">
          <div class="planet-shop-header">
            <span class="planet-shop-header__title">{{ planetName }} Trading Post</span>
            <span class="planet-shop-header__credits"
              >CR {{ profile.credits.toLocaleString() }}</span
            >
            <button type="button" class="ship-message-card__button" @click="requestClose">
              Close
            </button>
          </div>

          <!-- Body: buy + sell columns (scroll layer sits over faded cover art) -->
          <div class="planet-shop-body">
            <!-- Buy column -->
            <div class="planet-shop-column planet-shop-column--buy">
              <h3 class="planet-shop-column__title">Buy</h3>

              <!-- Services group -->
              <div class="planet-shop-group planet-shop-group--services">
                <button
                  type="button"
                  class="planet-shop-group__header"
                  :aria-expanded="servicesOpen ? 'true' : 'false'"
                  @click="toggleServices"
                >
                  <span class="planet-shop-group__label">Services</span>
                  <span class="planet-shop-group__chevron" :data-open="servicesOpen">▾</span>
                </button>

                <div v-show="servicesOpen" class="planet-shop-group__content">
                  <div class="planet-shop-item planet-shop-item--service">
                    <div
                      class="planet-shop-item__category-slot"
                      role="img"
                      aria-label="Refuel service"
                    >
                      <img
                        class="planet-shop-item__category-border"
                        :src="shopServiceCategoryBorderUrl"
                        :width="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        :height="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        alt=""
                        decoding="async"
                      />
                      <img
                        class="planet-shop-item__category-icon"
                        src="/items/shuttle-refuel.webp"
                        :width="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        :height="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        alt=""
                        decoding="async"
                      />
                    </div>
                    <div class="planet-shop-item__info">
                      <span class="planet-shop-item__name">Refuel</span>
                      <span class="planet-shop-item__desc"
                        >Instantly fill fuel tank and recharge all thrusters.</span
                      >
                    </div>
                    <span class="planet-shop-item__price">{{ REFUEL_COST }} CR</span>
                    <button
                      type="button"
                      class="planet-shop-item__buy-btn planet-shop-btn--service"
                      :disabled="!canAfford(REFUEL_COST) || fuelFull"
                      @click="onRefuelClick"
                    >
                      {{ fuelFull ? 'Full' : 'Buy' }}
                    </button>
                  </div>

                  <div class="planet-shop-item planet-shop-item--service">
                    <div
                      class="planet-shop-item__category-slot"
                      role="img"
                      aria-label="Shuttle hull repair"
                    >
                      <img
                        class="planet-shop-item__category-border"
                        :src="shopServiceCategoryBorderUrl"
                        :width="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        :height="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        alt=""
                        decoding="async"
                      />
                      <img
                        class="planet-shop-item__category-icon"
                        src="/items/shuttle-repair.webp"
                        :width="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        :height="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        alt=""
                        decoding="async"
                      />
                    </div>
                    <div class="planet-shop-item__info">
                      <span class="planet-shop-item__name">Shuttle Hull Repair</span>
                      <span class="planet-shop-item__desc"
                        >Restores your orbiter’s hull to 100% (radiation, thermal, and impact
                        damage).</span
                      >
                    </div>
                    <span class="planet-shop-item__price">{{ REPAIR_COST }} CR</span>
                    <button
                      type="button"
                      class="planet-shop-item__buy-btn planet-shop-btn--service"
                      :disabled="!canAfford(REPAIR_COST) || hullFull"
                      @click="onRepairHullClick"
                    >
                      {{ hullFull ? 'Full' : 'Buy' }}
                    </button>
                  </div>

                  <div class="planet-shop-item planet-shop-item--service">
                    <div
                      class="planet-shop-item__category-slot"
                      role="img"
                      aria-label="Lander hull repair"
                    >
                      <img
                        class="planet-shop-item__category-border"
                        :src="shopServiceCategoryBorderUrl"
                        :width="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        :height="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        alt=""
                        decoding="async"
                      />
                      <img
                        class="planet-shop-item__category-icon"
                        src="/items/lander-repair.webp"
                        :width="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        :height="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        alt=""
                        decoding="async"
                      />
                    </div>
                    <div class="planet-shop-item__info">
                      <span class="planet-shop-item__name">Lander Hull Repair</span>
                      <span class="planet-shop-item__desc"
                        >Structural service for the surface lander. Restores hull to 100% for your
                        next deployment.</span
                      >
                    </div>
                    <span class="planet-shop-item__price">{{ LANDER_REPAIR_COST }} CR</span>
                    <button
                      type="button"
                      class="planet-shop-item__buy-btn planet-shop-btn--service"
                      :disabled="!canAfford(LANDER_REPAIR_COST) || landerHullFull"
                      @click="onRepairLanderClick"
                    >
                      {{ landerHullFull ? 'Full' : 'Buy' }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- Fuel group -->
              <div class="planet-shop-group planet-shop-group--fuel">
                <button
                  type="button"
                  class="planet-shop-group__header"
                  :aria-expanded="fuelOpen ? 'true' : 'false'"
                  @click="toggleFuel"
                >
                  <span class="planet-shop-group__label">Fuel Supplies</span>
                  <span class="planet-shop-group__chevron" :data-open="fuelOpen">▾</span>
                </button>

                <div v-show="fuelOpen" class="planet-shop-group__content">
                  <div class="planet-shop-item planet-shop-item--fuel">
                    <div
                      class="planet-shop-item__category-slot"
                      role="img"
                      aria-label="Shuttle fuel cell"
                    >
                      <img
                        class="planet-shop-item__category-border"
                        :src="shopFuelCategoryBorderUrl"
                        :width="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        :height="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        alt=""
                        decoding="async"
                      />
                      <img
                        class="planet-shop-item__category-icon"
                        src="/items/shuttle-fuel-cell.webp"
                        :width="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        :height="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        alt=""
                        decoding="async"
                      />
                    </div>
                    <div class="planet-shop-item__info">
                      <span class="planet-shop-item__name">Shuttle Fuel Cell</span>
                      <span class="planet-shop-item__desc"
                        >Compact fusion cell. Restores half the shuttle fuel tank when consumed in
                        flight.</span
                      >
                    </div>
                    <span class="planet-shop-item__price">{{ RESERVE_FUEL_COST }} CR</span>
                    <button
                      type="button"
                      class="planet-shop-item__buy-btn planet-shop-btn--fuel"
                      :disabled="!canAfford(RESERVE_FUEL_COST)"
                      @click="onBuyReserveFuelClick"
                    >
                      Buy
                    </button>
                  </div>

                  <div class="planet-shop-item planet-shop-item--fuel">
                    <div
                      class="planet-shop-item__category-slot"
                      role="img"
                      aria-label="Lander fuel cell"
                    >
                      <img
                        class="planet-shop-item__category-border"
                        :src="shopFuelCategoryBorderUrl"
                        :width="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        :height="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        alt=""
                        decoding="async"
                      />
                      <img
                        class="planet-shop-item__category-icon"
                        src="/items/fuel-cell.webp"
                        :width="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        :height="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        alt=""
                        decoding="async"
                      />
                    </div>
                    <div class="planet-shop-item__info">
                      <span class="planet-shop-item__name">Lander Fuel Cell</span>
                      <span class="planet-shop-item__desc"
                        >Hydrogen fuel cell for the lander's neutron thrusters. One full burn cycle
                        per cell.</span
                      >
                    </div>
                    <span class="planet-shop-item__price">{{ LANDER_FUEL_COST }} CR</span>
                    <button
                      type="button"
                      class="planet-shop-item__buy-btn planet-shop-btn--fuel"
                      :disabled="!canAfford(LANDER_FUEL_COST)"
                      @click="onBuyLanderFuelClick"
                    >
                      Buy
                    </button>
                  </div>
                </div>
              </div>

              <!-- Trade goods group -->
              <div class="planet-shop-group planet-shop-group--trade">
                <button
                  type="button"
                  class="planet-shop-group__header"
                  :aria-expanded="tradeOpen ? 'true' : 'false'"
                  @click="toggleTrade"
                >
                  <span class="planet-shop-group__label">{{ tradeGroupLabel }}</span>
                  <span class="planet-shop-group__chevron" :data-open="tradeOpen">▾</span>
                </button>

                <div v-show="tradeOpen" class="planet-shop-group__content">
                  <div v-if="restockRemaining" class="planet-shop-restock">
                    Restocking in {{ restockRemaining }}
                  </div>

                  <template v-if="session.planetId === 'venus'">
                    <div class="planet-shop-subgroup-label">VENUS GOODS</div>
                    <div
                      v-for="slot in venusLocalSlots"
                      :key="slot.itemId"
                      class="planet-shop-item planet-shop-item--trade"
                      :class="{ 'planet-shop-item--sold-out': slot.stock <= 0 }"
                    >
                      <div
                        class="planet-shop-item__category-slot"
                        role="img"
                        :aria-label="slotLabel(slot)"
                      >
                        <img
                          class="planet-shop-item__category-border"
                          :src="shopTradeCategoryBorderUrl"
                          :width="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                          :height="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                          alt=""
                          decoding="async"
                        />
                        <img
                          v-if="slot.icon"
                          class="planet-shop-item__category-icon"
                          :src="`/items/${slot.icon}`"
                          :width="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                          :height="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                          alt=""
                          decoding="async"
                        />
                      </div>
                      <div class="planet-shop-item__info">
                        <span class="planet-shop-item__name">{{ slotLabel(slot) }}</span>
                        <span class="planet-shop-item__desc">{{ slotDescription(slot) }}</span>
                        <span class="planet-shop-item__stock">
                          {{ slot.stock > 0 ? `${slot.stock} in stock` : 'Sold out' }}
                        </span>
                      </div>
                      <span class="planet-shop-item__price">{{ slot.price }} CR</span>
                      <button
                        type="button"
                        class="planet-shop-item__buy-btn planet-shop-btn--trade"
                        :disabled="slot.stock <= 0 || !canAfford(slot.price)"
                        @click="onBuyTradeGoodClick(session.tradeSlots.indexOf(slot))"
                      >
                        Buy
                      </button>
                    </div>

                    <div class="planet-shop-subgroup-label">IMPORTS</div>
                    <div
                      v-for="slot in venusImportSlots"
                      :key="slot.itemId"
                      class="planet-shop-item planet-shop-item--trade planet-shop-item--import"
                      :class="{ 'planet-shop-item--sold-out': slot.stock <= 0 }"
                    >
                      <div
                        class="planet-shop-item__category-slot"
                        role="img"
                        :aria-label="slotLabel(slot)"
                      >
                        <img
                          class="planet-shop-item__category-border"
                          :src="shopTradeCategoryBorderUrl"
                          :width="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                          :height="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                          alt=""
                          decoding="async"
                        />
                        <img
                          v-if="slot.icon"
                          class="planet-shop-item__category-icon"
                          :src="`/items/${slot.icon}`"
                          :width="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                          :height="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                          alt=""
                          decoding="async"
                        />
                      </div>
                      <div class="planet-shop-item__info">
                        <span class="planet-shop-item__name">{{ slotLabel(slot) }}</span>
                        <span v-if="slotOriginLabel(slot)" class="planet-shop-item__origin">
                          {{ slotOriginLabel(slot) }}
                        </span>
                        <span class="planet-shop-item__desc">{{ slotDescription(slot) }}</span>
                        <span class="planet-shop-item__stock">
                          {{ slot.stock > 0 ? `${slot.stock} in stock` : 'Sold out' }}
                        </span>
                      </div>
                      <span class="planet-shop-item__price">{{ slot.price }} CR</span>
                      <button
                        type="button"
                        class="planet-shop-item__buy-btn planet-shop-btn--trade"
                        :disabled="slot.stock <= 0 || !canAfford(slot.price)"
                        @click="onBuyTradeGoodClick(session.tradeSlots.indexOf(slot))"
                      >
                        Buy
                      </button>
                    </div>
                  </template>
                  <template v-else>
                    <!-- Trade goods -->
                    <div
                      v-for="(slot, index) in session.tradeSlots"
                      :key="slot.itemId"
                      class="planet-shop-item planet-shop-item--trade"
                      :class="{ 'planet-shop-item--sold-out': slot.stock <= 0 }"
                    >
                      <div
                        class="planet-shop-item__category-slot"
                        role="img"
                        :aria-label="slotLabel(slot)"
                      >
                        <img
                          class="planet-shop-item__category-border"
                          :src="shopTradeCategoryBorderUrl"
                          :width="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                          :height="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                          alt=""
                          decoding="async"
                        />
                        <img
                          v-if="slot.icon"
                          class="planet-shop-item__category-icon"
                          :src="`/items/${slot.icon}`"
                          :width="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                          :height="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                          alt=""
                          decoding="async"
                        />
                      </div>
                      <div class="planet-shop-item__info">
                        <span class="planet-shop-item__name">{{ slotLabel(slot) }}</span>
                        <span class="planet-shop-item__desc">{{ slotDescription(slot) }}</span>
                        <span class="planet-shop-item__stock">
                          {{ slot.stock > 0 ? `${slot.stock} in stock` : 'Sold out' }}
                        </span>
                      </div>
                      <span class="planet-shop-item__price">{{ slot.price }} CR</span>
                      <button
                        type="button"
                        class="planet-shop-item__buy-btn planet-shop-btn--trade"
                        :disabled="slot.stock <= 0 || !canAfford(slot.price)"
                        @click="onBuyTradeGoodClick(index)"
                      >
                        Buy
                      </button>
                    </div>
                  </template>

                  <!-- Lucas's signature: bribe the dock master to reroll trade goods. -->
                  <div class="planet-shop-item planet-shop-item--bribe">
                    <div
                      class="planet-shop-item__category-slot"
                      role="img"
                      aria-label="Bribe to restock trade goods"
                    >
                      <img
                        class="planet-shop-item__category-border"
                        :src="shopBribeCategoryBorderUrl"
                        :width="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        :height="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        alt=""
                        decoding="async"
                      />
                      <img
                        class="planet-shop-item__category-icon"
                        src="/items/bribe-to-restock.webp"
                        :width="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        :height="INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS"
                        alt=""
                        decoding="async"
                      />
                    </div>
                    <div class="planet-shop-item__info">
                      <span class="planet-shop-item__name">Bribe to Restock</span>
                      <span class="planet-shop-item__desc"
                        >Slip the dock master a courtesy stipend. Forces a fresh trade-goods
                        rotation. Each bribe at this port doubles in cost.</span
                      >
                    </div>
                    <span class="planet-shop-item__price">{{ bribeCost }} CR</span>
                    <button
                      type="button"
                      class="planet-shop-item__buy-btn planet-shop-btn--bribe"
                      :disabled="!canAfford(bribeCost)"
                      @click="onBribeRestockClick"
                    >
                      Bribe
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Sell column -->
            <div class="planet-shop-column">
              <h3 class="planet-shop-column__title">Sell</h3>
              <InventoryTable
                :items="inventory.stacks"
                mode="sell"
                :planet-id="session.planetId"
                @sell="(itemId, qty) => $emit('sellItem', itemId, qty)"
              />
            </div>
          </div>

          <div class="shuttle-control-footer planet-shop-ambient__footer">
            <span class="ship-message-card__hint">ESC / B Close</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
