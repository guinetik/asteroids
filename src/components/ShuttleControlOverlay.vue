<script setup lang="ts">
import type { Component } from 'vue'
import { computed, onMounted, ref, watch } from 'vue'
import type { Inventory, InventoryStack } from '@/lib/inventory/types'
import type { ShuttleMissionBoard } from '@/lib/missions/types'
import { shipMessageSystem } from '@/lib/messages/runtime'
import ShuttleControlProgramInventory from './shuttle-control/ShuttleControlProgramInventory.vue'
import ShuttleControlProgramMail from './shuttle-control/ShuttleControlProgramMail.vue'
import ShuttleControlProgramMissions from './shuttle-control/ShuttleControlProgramMissions.vue'
import ShuttleControlProgramShuttle from './shuttle-control/ShuttleControlProgramShuttle.vue'
import ShuttleControlProgramLander from './shuttle-control/ShuttleControlProgramLander.vue'
import ShuttleControlProgramUpgrades from './shuttle-control/ShuttleControlProgramUpgrades.vue'
import type { UpgradeId } from '@/lib/upgrades'
import type { ShuttleTelemetry } from '@/lib/ShuttleTelemetry'

/** Left-rail program in the shuttle control terminal. */
type ControlScreen = 'shuttle' | 'lander' | 'mail' | 'missions' | 'inventory' | 'upgrades'

const props = defineProps<{
  visible: boolean
  inventory?: Inventory | null
  inventoryStacks?: InventoryStack[]
  missionBoard?: ShuttleMissionBoard | null
  dockedPlanet?: string | null
  /** Live shuttle telemetry for the orientation manual. */
  telemetry?: ShuttleTelemetry | null
  /** Player name for the deed of ownership in the Shuttle manual */
  playerName?: string
  /** Snapshot of upgrade levels for the engineering bay. */
  upgradeLevels?: Partial<Record<UpgradeId, number>>
  /** Credits for upgrade purchase checks (map HUD source). */
  playerCredits?: number
  /**
   * When the overlay opens (`visible` becomes true), switches to this program.
   * Omit to keep whichever tab was active last time.
   */
  programToSelectOnOpen?: ControlScreen
}>()

const emit = defineEmits<{
  close: []
  openShop: []
  'screen-change': [screen: ControlScreen]
  'purchase-upgrade': [upgradeId: UpgradeId]
  acceptMission: []
  deliverMission: [missionId: string]
  acceptAsteroidMission: []
  acceptEvaMission: []
  useItem: [itemId: string]
  mailChanged: []
}>()

const activeScreen = ref<ControlScreen>('mail')

const programByScreen: Record<ControlScreen, Component> = {
  shuttle: ShuttleControlProgramShuttle,
  lander: ShuttleControlProgramLander,
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
    if (!open) return
    syncMailPendingCount()
    const pick = props.programToSelectOnOpen
    if (pick) {
      activeScreen.value = pick
    }
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

watch(activeScreen, (screen, previous) => {
  if (screen === previous) return
  emit('screen-change', screen)
})

const screens = computed(() => {
  const mailLabel =
    mailPendingCount.value > 0 ? `Mail (${mailPendingCount.value})` : 'Mail'
  return [
    { id: 'mail' as const, label: mailLabel },
    { id: 'shuttle' as const, label: 'Shuttle' },
    { id: 'lander' as const, label: 'Lander' },
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
        <span>Control Panel</span>
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
        <div 
          class="shuttle-control-content shuttle-control-content--programs"
          :class="{ '!p-0 overflow-hidden': activeScreen === 'shuttle' || activeScreen === 'lander' }"
        >
          <component
            :is="activeProgram"
            :inventory="inventory"
            :inventory-stacks="inventoryStacks"
            :board="missionBoard"
            :docked-planet="dockedPlanet"
            :upgrade-levels="upgradeLevels ?? {}"
            :player-credits="playerCredits ?? 0"
            :telemetry="telemetry"
            :player-name="playerName"
            @accept-mission="$emit('acceptMission')"
            @deliver-mission="(id: string) => $emit('deliverMission', id)"
            @accept-asteroid-mission="$emit('acceptAsteroidMission')"
            @accept-eva-mission="$emit('acceptEvaMission')"
            @use-item="(itemId: string) => $emit('useItem', itemId)"
            @mail-changed="onMailProgramChanged"
            @purchase-upgrade="emitPurchaseUpgrade"
            @switch-to-upgrades="activeScreen = 'upgrades'"
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
