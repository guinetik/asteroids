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
} from '@/lib/shop/shopSession'
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
}>()

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

function slotIcon(slot: TradeGoodSlot) {
  const tg = getTradeGood(slot.itemId)
  return tg?.label.charAt(0) ?? '?'
}

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

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' || e.code === 'KeyB') {
    emit('close')
  }
}
</script>

<template>
  <div class="planet-shop-overlay" @keydown="onKeydown" tabindex="0">
    <div class="planet-shop-card">
      <!-- Header -->
      <div class="planet-shop-header">
        <span class="planet-shop-header__title">{{ planetName }} Trading Post</span>
        <span class="planet-shop-header__credits">CR {{ profile.credits.toLocaleString() }}</span>
        <button
          type="button"
          class="ship-message-card__button"
          @click="
            uiAudio.notifyCancel()
            $emit('close')
          "
        >
          Close
        </button>
      </div>

      <div class="shuttle-control-divider" />

      <!-- Body: buy + sell columns -->
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
                <div class="planet-shop-item__icon-placeholder planet-shop-icon--service">F</div>
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
                  @click="
                    uiAudio.notifyConfirm()
                    $emit('refuel')
                  "
                >
                  {{ fuelFull ? 'Full' : 'Buy' }}
                </button>
              </div>

              <div class="planet-shop-item planet-shop-item--service">
                <div class="planet-shop-item__icon-placeholder planet-shop-icon--service">S</div>
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
                  @click="
                    uiAudio.notifyConfirm()
                    $emit('repairHull')
                  "
                >
                  {{ hullFull ? 'Full' : 'Buy' }}
                </button>
              </div>

              <div class="planet-shop-item planet-shop-item--service">
                <div class="planet-shop-item__icon-placeholder planet-shop-icon--service">P</div>
                <div class="planet-shop-item__info">
                  <span class="planet-shop-item__name">Lander Hull Repair</span>
                  <span class="planet-shop-item__desc"
                    >Structural service for the surface lander. Restores hull to 100% for your next
                    deployment.</span
                  >
                </div>
                <span class="planet-shop-item__price">{{ LANDER_REPAIR_COST }} CR</span>
                <button
                  type="button"
                  class="planet-shop-item__buy-btn planet-shop-btn--service"
                  :disabled="!canAfford(LANDER_REPAIR_COST) || landerHullFull"
                  @click="
                    uiAudio.notifyConfirm()
                    $emit('repairLander')
                  "
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
                <div class="planet-shop-item__icon-placeholder planet-shop-icon--fuel">S</div>
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
                  @click="
                    uiAudio.notifyConfirm()
                    $emit('buyReserveFuel')
                  "
                >
                  Buy
                </button>
              </div>

              <div class="planet-shop-item planet-shop-item--fuel">
                <div class="planet-shop-item__icon-placeholder planet-shop-icon--fuel">L</div>
                <div class="planet-shop-item__info">
                  <span class="planet-shop-item__name">Lander Fuel Cell</span>
                  <span class="planet-shop-item__desc"
                    >Hydrogen fuel cell for the lander's neutron thrusters. One full burn cycle per
                    cell.</span
                  >
                </div>
                <span class="planet-shop-item__price">{{ LANDER_FUEL_COST }} CR</span>
                <button
                  type="button"
                  class="planet-shop-item__buy-btn planet-shop-btn--fuel"
                  :disabled="!canAfford(LANDER_FUEL_COST)"
                  @click="
                    uiAudio.notifyConfirm()
                    $emit('buyLanderFuel')
                  "
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
                  <div class="planet-shop-item__icon-placeholder planet-shop-icon--trade">
                    {{ slotIcon(slot) }}
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
                    @click="
                      uiAudio.notifyConfirm()
                      $emit('buyTradeGood', session.tradeSlots.indexOf(slot), 1)
                    "
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
                  <div class="planet-shop-item__icon-placeholder planet-shop-icon--import">
                    {{ slotIcon(slot) }}
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
                    @click="
                      uiAudio.notifyConfirm()
                      $emit('buyTradeGood', session.tradeSlots.indexOf(slot), 1)
                    "
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
                  <div class="planet-shop-item__icon-placeholder planet-shop-icon--trade">
                    {{ slotIcon(slot) }}
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
                    @click="
                      uiAudio.notifyConfirm()
                      $emit('buyTradeGood', index, 1)
                    "
                  >
                    Buy
                  </button>
                </div>
              </template>
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

      <!-- Footer -->
      <div class="shuttle-control-footer">
        <span class="ship-message-card__hint">ESC / B Close</span>
      </div>
    </div>
  </div>
</template>
