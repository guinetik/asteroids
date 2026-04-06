<script setup lang="ts">
import type { Component } from 'vue'
import { computed, ref } from 'vue'
import type { InventoryStack } from '@/lib/inventory/types'
import type { ShuttleMissionBoard } from '@/lib/missions/types'
import ShuttleControlProgramInventory from './shuttle-control/ShuttleControlProgramInventory.vue'
import ShuttleControlProgramMissions from './shuttle-control/ShuttleControlProgramMissions.vue'
import ShuttleControlProgramShuttle from './shuttle-control/ShuttleControlProgramShuttle.vue'

defineProps<{
  visible: boolean
  inventoryStacks?: InventoryStack[]
  missionBoard?: ShuttleMissionBoard | null
  dockedPlanet?: string | null
}>()

const emit = defineEmits<{
  close: []
  openShop: []
  acceptMission: []
  deliverMission: [missionId: string]
}>()

type ControlScreen = 'shuttle' | 'missions' | 'inventory'

const activeScreen = ref<ControlScreen>('shuttle')

const programByScreen: Record<ControlScreen, Component> = {
  shuttle: ShuttleControlProgramShuttle,
  missions: ShuttleControlProgramMissions,
  inventory: ShuttleControlProgramInventory,
}

const activeProgram = computed(() => programByScreen[activeScreen.value])

const screens: { id: ControlScreen; label: string }[] = [
  { id: 'shuttle', label: 'Shuttle' },
  { id: 'missions', label: 'Missions' },
  { id: 'inventory', label: 'Inventory' },
]

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
            type="button"
            class="shuttle-control-nav-btn shuttle-control-nav-btn--shop"
            @click="$emit('openShop')"
          >
            Shop
          </button>
        </nav>

        <!-- Right content area -->
        <div class="shuttle-control-content">
          <component
            :is="activeProgram"
            :inventory-stacks="inventoryStacks"
            :board="missionBoard"
            :docked-planet="dockedPlanet"
            @accept-mission="$emit('acceptMission')"
            @deliver-mission="(id: string) => $emit('deliverMission', id)"
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
