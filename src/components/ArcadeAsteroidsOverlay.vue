<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import ArcadeAsteroidsCanvas from './ArcadeAsteroidsCanvas.vue'
import { ArcadeAsteroidsOverlayController } from './ArcadeAsteroidsOverlayController'
import { uiAudio } from '@/audio/UiAudioDirector'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

const controller = new ArcadeAsteroidsOverlayController()
const overlayEl = ref<HTMLElement | null>(null)
const canvas = ref<InstanceType<typeof ArcadeAsteroidsCanvas> | null>(null)

const state = computed(() => controller.snapshot.value)
const phaseLabel = computed(() => {
  if (state.value.phase === 'attract') return 'Attract'
  if (state.value.phase === 'playing') return 'Playing'
  if (state.value.phase === 'respawning') return 'Respawn'
  return 'Game Over'
})

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    await nextTick()
    overlayEl.value?.focus()
    canvas.value?.focus()
  },
)

function startGame(): void {
  uiAudio.notifyConfirm()
  controller.start()
  canvas.value?.focus()
}

function resetHighScore(): void {
  uiAudio.notifySwitch()
  controller.resetHighScore()
  canvas.value?.focus()
}

function requestClose(): void {
  uiAudio.notifyCancel()
  controller.clearInputs()
  emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    requestClose()
  }
}
</script>

<template>
  <div
    v-show="visible"
    ref="overlayEl"
    class="arcade-asteroids-overlay"
    tabindex="0"
    @keydown="onKeydown"
  >
    <div class="arcade-asteroids-card">
      <div class="arcade-asteroids-chrome">
        <span>Arcade Cabinet / Asteroids</span>
        <button type="button" class="ship-message-card__button" @click="requestClose">
          Close
        </button>
      </div>

      <div class="arcade-asteroids-header">
        <span class="arcade-asteroids-header__item">
          SCORE
          <span class="arcade-asteroids-header__value">{{ state.score.toLocaleString() }}</span>
        </span>
        <span class="arcade-asteroids-header__item">
          HIGH
          <span class="arcade-asteroids-header__value">{{ controller.highScore.value.toLocaleString() }}</span>
        </span>
        <span class="arcade-asteroids-header__item">
          LIVES <span class="arcade-asteroids-header__value">{{ state.lives }}</span>
        </span>
        <span class="arcade-asteroids-header__item">
          WAVE <span class="arcade-asteroids-header__value">{{ state.wave }}</span>
        </span>
        <span class="arcade-asteroids-header__item">
          MODE <span class="arcade-asteroids-header__value">{{ phaseLabel }}</span>
        </span>
      </div>

      <div class="arcade-asteroids-body">
        <ArcadeAsteroidsCanvas ref="canvas" :controller="controller" :visible="visible" />
      </div>

      <div class="arcade-asteroids-footer">
        <span class="ship-message-card__hint">
          ENTER Start · ARROWS/WASD Move · SPACE Fire · X Hyperspace · ESC Close
        </span>
        <div class="arcade-asteroids-footer__actions">
          <button type="button" class="ship-message-card__button" @click="startGame">Start</button>
          <button type="button" class="ship-message-card__button" @click="resetHighScore">
            Reset High
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
