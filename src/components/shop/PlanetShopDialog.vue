<script setup lang="ts">
import { computed } from 'vue'
import type { ShopSession, TradeGoodSlot } from '@/lib/shop/tradeTypes'
import type { PlayerProfile } from '@/lib/player/types'
import type { Inventory } from '@/lib/inventory/types'
import { getTradeGood } from '@/lib/shop/tradeGoods'
import { REFUEL_COST, RESERVE_FUEL_COST } from '@/lib/shop/shopSession'
import InventoryTable from './InventoryTable.vue'

const props = defineProps<{
  session: ShopSession
  profile: PlayerProfile
  inventory: Inventory
}>()

const emit = defineEmits<{
  close: []
  buyTradeGood: [slotIndex: number, quantity: number]
  sellItem: [itemId: string, quantity: number]
  refuel: []
  buyReserveFuel: []
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

          <!-- Refuel -->
          <div class="planet-shop-item">
            <div class="planet-shop-item__icon-placeholder">F</div>
            <div class="planet-shop-item__info">
              <span class="planet-shop-item__name">Refuel</span>
              <span class="planet-shop-item__desc">Instantly fill fuel tank and recharge all thrusters.</span>
            </div>
            <span class="planet-shop-item__price">{{ REFUEL_COST }} CR</span>
            <button
              type="button"
              class="planet-shop-item__buy-btn"
              :disabled="!canAfford(REFUEL_COST)"
              @click="$emit('refuel')"
            >
              Buy
            </button>
          </div>

          <!-- Reserve fuel -->
          <div class="planet-shop-item">
            <div class="planet-shop-item__icon-placeholder">R</div>
            <div class="planet-shop-item__info">
              <span class="planet-shop-item__name">Reserve Fuel Cell</span>
              <span class="planet-shop-item__desc">Hydrogen fuel cell stored in cargo for later use.</span>
            </div>
            <span class="planet-shop-item__price">{{ RESERVE_FUEL_COST }} CR</span>
            <button
              type="button"
              class="planet-shop-item__buy-btn"
              :disabled="!canAfford(RESERVE_FUEL_COST)"
              @click="$emit('buyReserveFuel')"
            >
              Buy
            </button>
          </div>

          <!-- Restock timer -->
          <div v-if="restockRemaining" class="planet-shop-restock">
            Restocking in {{ restockRemaining }}
          </div>

          <!-- Trade goods -->
          <div
            v-for="(slot, index) in session.tradeSlots"
            :key="slot.itemId"
            class="planet-shop-item"
            :class="{ 'planet-shop-item--sold-out': slot.stock <= 0 }"
          >
            <div class="planet-shop-item__icon-placeholder">{{ slotIcon(slot) }}</div>
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
              class="planet-shop-item__buy-btn"
              :disabled="slot.stock <= 0 || !canAfford(slot.price)"
              @click="$emit('buyTradeGood', index, 1)"
            >
              Buy
            </button>
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
