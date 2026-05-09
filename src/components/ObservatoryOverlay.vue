<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ObservatoryOverlayController } from './ObservatoryOverlayController'
import { uiAudio } from '@/audio/UiAudioDirector'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

const controller = new ObservatoryOverlayController()
const overlayEl = ref<HTMLElement | null>(null)
const aladinHost = ref<HTMLElement | null>(null)

const currentTarget = computed(() => controller.getCurrentTarget())

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    await nextTick()
    overlayEl.value?.focus()
    if (aladinHost.value) {
      await controller.onOpen(aladinHost.value)
    }
  },
)

function selectTarget(id: string): void {
  controller.selectTarget(id)
}

function retry(): void {
  if (aladinHost.value) void controller.retry(aladinHost.value)
}

function requestClose(): void {
  uiAudio.notifySwitch()
  emit('close')
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') requestClose()
}

onBeforeUnmount(() => controller.dispose())
</script>

<template>
  <div
    v-if="visible"
    ref="overlayEl"
    class="observatory-overlay"
    tabindex="0"
    @keydown="onKeydown"
  >
    <div class="observatory-card">
      <div class="observatory-chrome">
        <span>Observatory</span>
        <button type="button" class="ship-message-card__button" @click="requestClose">
          Close
        </button>
      </div>

      <div class="observatory-header">
        <span class="observatory-header__item"
          >SURVEY <span class="observatory-header__value">{{ currentTarget.survey }}</span></span
        >
        <span class="observatory-header__item"
          >RA <span class="observatory-header__value">{{ currentTarget.ra }}</span></span
        >
        <span class="observatory-header__item"
          >DEC <span class="observatory-header__value">{{ currentTarget.dec }}</span></span
        >
        <span class="observatory-header__item"
          >FOV <span class="observatory-header__value">{{ currentTarget.fovDeg }}°</span></span
        >
        <span class="observatory-header__item"
          >TARGET <span class="observatory-header__value">{{ currentTarget.label }}</span></span
        >
      </div>

      <div class="observatory-body">
        <nav class="observatory-sidebar">
          <button
            v-for="t in controller.targets"
            :key="t.id"
            type="button"
            class="observatory-nav-btn"
            :class="{ 'observatory-nav-btn--active': controller.currentTargetId.value === t.id }"
            @click="selectTarget(t.id)"
          >
            {{ t.label }}
          </button>
        </nav>

        <div class="observatory-content">
          <div ref="aladinHost" class="observatory-viewport" />

          <div v-if="controller.loadingState.value === 'loading'" class="observatory-status">
            <span>Loading sky atlas…</span>
          </div>

          <div v-if="controller.loadingState.value === 'error'" class="observatory-status">
            <span>Sky atlas offline.</span>
            <button type="button" class="ship-message-card__button" @click="retry">Retry</button>
          </div>
        </div>
      </div>

      <div class="observatory-blurb">{{ currentTarget.blurb }}</div>

      <div class="observatory-footer">
        <span class="ship-message-card__hint">ESC Close</span>
      </div>
    </div>
  </div>
</template>
