<script setup lang="ts">
import type { Component } from 'vue'
import { computed, onMounted, ref, watch } from 'vue'
import type { InventoryStack } from '@/lib/inventory/types'
import type { ShuttleMissionBoard } from '@/lib/missions/types'
import { shipMessageSystem } from '@/lib/messages/runtime'
import ShuttleControlProgramInventory from './shuttle-control/ShuttleControlProgramInventory.vue'
import ShuttleControlProgramMail from './shuttle-control/ShuttleControlProgramMail.vue'
import ShuttleControlProgramMissions from './shuttle-control/ShuttleControlProgramMissions.vue'
import ShuttleControlProgramShuttle from './shuttle-control/ShuttleControlProgramShuttle.vue'
import ShuttleControlProgramUpgrades from './shuttle-control/ShuttleControlProgramUpgrades.vue'
import type { UpgradeId } from '@/lib/upgrades'

const props = defineProps<{
  visible: boolean
  inventoryStacks?: InventoryStack[]
  missionBoard?: ShuttleMissionBoard | null
  dockedPlanet?: string | null
  /** Snapshot of upgrade levels for the engineering bay. */
  upgradeLevels?: Partial<Record<UpgradeId, number>>
  /** Credits for upgrade purchase checks (map HUD source). */
  playerCredits?: number
}>()

const emit = defineEmits<{
  close: []
  openShop: []
  'purchase-upgrade': [upgradeId: UpgradeId]
  acceptMission: []
  deliverMission: [missionId: string]
  acceptAsteroidMission: []
  mailChanged: []
}>()

type ControlScreen = 'shuttle' | 'mail' | 'missions' | 'inventory' | 'upgrades'

const activeScreen = ref<ControlScreen>('mail')

const programByScreen: Record<ControlScreen, Component> = {
  shuttle: ShuttleControlProgramShuttle,
  mail: ShuttleControlProgramMail,
  missions: ShuttleControlProgramMissions,
  inventory: ShuttleControlProgramInventory,
  upgrades: ShuttleControlProgramUpgrades,
}

const activeProgram = computed(() => programByScreen[activeScreen.value])

const mailPendingCount = ref(0)

function syncMailPendingCount(): void {
  mailPendingCount.value = shipMessageSystem.getPendingMessageCount()
}

onMounted(syncMailPendingCount)

watch(
  () => props.visible,
  (open) => {
    if (open) syncMailPendingCount()
  },
)

watch(
  () => props.dockedPlanet,
  (planet) => {
    if (!planet && activeScreen.value === 'upgrades') {
      activeScreen.value = 'mail'
    }
  },
)

const screens = computed(() => {
  const mailLabel =
    mailPendingCount.value > 0 ? `Mail (${mailPendingCount.value})` : 'Mail'
  return [
    { id: 'mail' as const, label: mailLabel },
    { id: 'shuttle' as const, label: 'Shuttle' },
    { id: 'missions' as const, label: 'Missions' },
    { id: 'inventory' as const, label: 'Inventory' },
  ]
})

function onMailProgramChanged(): void {
  syncMailPendingCount()
  emit('mailChanged')
}

function emitPurchaseUpgrade(upgradeId: UpgradeId): void {
  emit('purchase-upgrade', upgradeId)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}
</script>

<template>
  <div v-if="visible" class="shuttle-control-overlay" @keydown="onKeydown" tabindex="0">
    <div class="shuttle-control-card">
      <!-- Chrome bar -->
      <div class="shuttle-control-chrome">
        <span>Shuttle Control Terminal</span>
        <button
          type="button"
          class="ship-message-card__button"
          @click="$emit('close')"
        >
          Close
        </button>
      </div>

      <!-- Header telemetry strip -->
      <div class="shuttle-control-header">
        <span class="shuttle-control-header__item">SYS <span class="shuttle-control-header__value">NOMINAL</span></span>
        <span class="shuttle-control-header__item">PWR <span class="shuttle-control-header__value">98.2%</span></span>
        <span class="shuttle-control-header__item">HULL <span class="shuttle-control-header__value">100%</span></span>
        <span class="shuttle-control-header__item">O2 <span class="shuttle-control-header__value">STABLE</span></span>
        <span class="shuttle-control-header__item">NAV <span class="shuttle-control-header__value">ONLINE</span></span>
      </div>

      <div class="shuttle-control-divider" />

      <!-- Body: sidebar + content -->
      <div class="shuttle-control-body">
        <!-- Left sidebar — program buttons -->
        <nav class="shuttle-control-sidebar">
          <button
            v-for="screen in screens"
            :key="screen.id"
            type="button"
            class="shuttle-control-nav-btn"
            :class="{ 'shuttle-control-nav-btn--active': activeScreen === screen.id }"
            @click="activeScreen = screen.id"
          >
            {{ screen.label }}
          </button>
          <div class="shuttle-control-sidebar-divider" />
          <button
            v-if="dockedPlanet"
            type="button"
            class="shuttle-control-nav-btn shuttle-control-nav-btn--shop"
            @click="$emit('openShop')"
          >
            Shop
          </button>
          <button
            v-if="dockedPlanet"
            type="button"
            class="shuttle-control-nav-btn shuttle-control-nav-btn--upgrades-shop"
            :class="{ 'shuttle-control-nav-btn--active': activeScreen === 'upgrades' }"
            @click="activeScreen = 'upgrades'"
          >
            UPGRADES SHOP
          </button>
        </nav>

        <!-- Right content area -->
        <div class="shuttle-control-content shuttle-control-content--programs">
          <component
            :is="activeProgram"
            :inventory-stacks="inventoryStacks"
            :board="missionBoard"
            :docked-planet="dockedPlanet"
            :upgrade-levels="upgradeLevels ?? {}"
            :player-credits="playerCredits ?? 0"
            @accept-mission="$emit('acceptMission')"
            @deliver-mission="(id: string) => $emit('deliverMission', id)"
            @accept-asteroid-mission="$emit('acceptAsteroidMission')"
            @mail-changed="onMailProgramChanged"
            @purchase-upgrade="emitPurchaseUpgrade"
          />
        </div>
      </div>

      <!-- Footer -->
      <div class="shuttle-control-footer">
        <span class="ship-message-card__hint">ESC  Close</span>
      </div>
    </div>
  </div>
</template>
