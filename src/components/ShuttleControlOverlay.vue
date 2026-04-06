<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

type ControlScreen = 'shuttle' | 'missions' | 'inventory'

const activeScreen = ref<ControlScreen>('shuttle')

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
        </nav>

        <!-- Right content area -->
        <div class="shuttle-control-content">
          <div v-if="activeScreen === 'shuttle'" class="shuttle-control-screen">
            <h2 class="shuttle-control-screen__title">Shuttle</h2>
            <p class="shuttle-control-screen__placeholder">Shuttle management program</p>
          </div>
          <div v-else-if="activeScreen === 'missions'" class="shuttle-control-screen">
            <h2 class="shuttle-control-screen__title">Missions</h2>
            <p class="shuttle-control-screen__placeholder">Mission control program</p>
          </div>
          <div v-else-if="activeScreen === 'inventory'" class="shuttle-control-screen">
            <h2 class="shuttle-control-screen__title">Inventory</h2>
            <p class="shuttle-control-screen__placeholder">Inventory management program</p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="shuttle-control-footer">
        <span class="ship-message-card__hint">ESC  Close</span>
      </div>
    </div>
  </div>
</template>
