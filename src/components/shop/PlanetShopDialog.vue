<script setup lang="ts">
import { computed } from 'vue'
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

function canAfford(cost: number): boolean {
  return props.profile.credits >= cost
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
        <button type="button" class="ship-message-card__button" @click="$emit('close')">
          Close
        </button>
      </div>

      <div class="shuttle-control-divider" />

      <!-- Body: buy + sell columns -->
      <div class="planet-shop-body">
        <!-- Buy column -->
        <div class="planet-shop-column">
          <h3 class="planet-shop-column__title">Buy</h3>

          <!-- Services group -->
          <div class="planet-shop-group planet-shop-group--services">
            <span class="planet-shop-group__label">Services</span>

            <div class="planet-shop-item planet-shop-item--service">
              <div class="planet-shop-item__icon-placeholder planet-shop-icon--service">F</div>
              <div class="planet-shop-item__info">
                <span class="planet-shop-item__name">Refuel</span>
                <span class="planet-shop-item__desc">Instantly fill fuel tank and recharge all thrusters.</span>
              </div>
              <span class="planet-shop-item__price">{{ REFUEL_COST }} CR</span>
              <button
                type="button"
                class="planet-shop-item__buy-btn planet-shop-btn--service"
                :disabled="!canAfford(REFUEL_COST) || fuelFull"
                @click="$emit('refuel')"
              >
                {{ fuelFull ? 'Full' : 'Buy' }}
              </button>
            </div>

            <div class="planet-shop-item planet-shop-item--service">
              <div class="planet-shop-item__icon-placeholder planet-shop-icon--service">P</div>
              <div class="planet-shop-item__info">
                <span class="planet-shop-item__name">Lander Hull Repair</span>
                <span class="planet-shop-item__desc">Structural service for the surface lander. Restores hull to 100% for your next deployment.</span>
              </div>
              <span class="planet-shop-item__price">{{ LANDER_REPAIR_COST }} CR</span>
              <button
                type="button"
                class="planet-shop-item__buy-btn planet-shop-btn--service"
                :disabled="!canAfford(LANDER_REPAIR_COST) || landerHullFull"
                @click="$emit('repairLander')"
              >
                {{ landerHullFull ? 'Full' : 'Buy' }}
              </button>
            </div>

            <div v-if="session.planetId === 'earth'" class="planet-shop-item planet-shop-item--service">
              <div class="planet-shop-item__icon-placeholder planet-shop-icon--service">H</div>
              <div class="planet-shop-item__info">
                <span class="planet-shop-item__name">Hull Repair</span>
                <span class="planet-shop-item__desc">Full structural overhaul. Restores hull integrity to 100%.</span>
              </div>
              <span class="planet-shop-item__price">{{ REPAIR_COST }} CR</span>
              <button
                type="button"
                class="planet-shop-item__buy-btn planet-shop-btn--service"
                :disabled="!canAfford(REPAIR_COST) || hullFull"
                @click="$emit('repairHull')"
              >
                {{ hullFull ? 'Full' : 'Buy' }}
              </button>
            </div>
          </div>

          <!-- Fuel group -->
          <div class="planet-shop-group planet-shop-group--fuel">
            <span class="planet-shop-group__label">Fuel Supplies</span>

            <div class="planet-shop-item planet-shop-item--fuel">
              <div class="planet-shop-item__icon-placeholder planet-shop-icon--fuel">S</div>
              <div class="planet-shop-item__info">
                <span class="planet-shop-item__name">Shuttle Fuel Cell</span>
                <span class="planet-shop-item__desc">Compact fusion cell. Restores half the shuttle fuel tank when consumed in flight.</span>
              </div>
              <span class="planet-shop-item__price">{{ RESERVE_FUEL_COST }} CR</span>
              <button
                type="button"
                class="planet-shop-item__buy-btn planet-shop-btn--fuel"
                :disabled="!canAfford(RESERVE_FUEL_COST)"
                @click="$emit('buyReserveFuel')"
              >
                Buy
              </button>
            </div>

            <div class="planet-shop-item planet-shop-item--fuel">
              <div class="planet-shop-item__icon-placeholder planet-shop-icon--fuel">L</div>
              <div class="planet-shop-item__info">
                <span class="planet-shop-item__name">Lander Fuel Cell</span>
                <span class="planet-shop-item__desc">Hydrogen fuel cell for the lander's neutron thrusters. One full burn cycle per cell.</span>
              </div>
              <span class="planet-shop-item__price">{{ LANDER_FUEL_COST }} CR</span>
              <button
                type="button"
                class="planet-shop-item__buy-btn planet-shop-btn--fuel"
                :disabled="!canAfford(LANDER_FUEL_COST)"
                @click="$emit('buyLanderFuel')"
              >
                Buy
              </button>
            </div>
          </div>

          <!-- Trade goods group -->
          <div class="planet-shop-group planet-shop-group--trade">
            <span class="planet-shop-group__label">Trade Goods</span>

            <div v-if="restockRemaining" class="planet-shop-restock">
              Restocking in {{ restockRemaining }}
            </div>

            <!-- Trade goods -->
            <div
              v-for="(slot, index) in session.tradeSlots"
              :key="slot.itemId"
              class="planet-shop-item planet-shop-item--trade"
              :class="{ 'planet-shop-item--sold-out': slot.stock <= 0 }"
            >
              <div class="planet-shop-item__icon-placeholder planet-shop-icon--trade">{{ slotIcon(slot) }}</div>
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
                @click="$emit('buyTradeGood', index, 1)"
              >
                Buy
              </button>
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
        <span class="ship-message-card__hint">ESC / B  Close</span>
      </div>
    </div>
  </div>
</template>
