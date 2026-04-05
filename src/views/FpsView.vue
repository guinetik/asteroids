<!-- src/views/FpsView.vue -->
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { FpsViewController } from './FpsViewController'
import FpsHud from '@/components/FpsHud.vue'
import type { FpsTelemetry } from '@/components/FpsHud.vue'

const container = ref<HTMLElement>()
const viewController = new FpsViewController()
const pointerLocked = ref(true)
const damageFlash = ref(0)
const damageDir = ref<number | null>(null)
const damageDirTimer = ref(0)

const DAMAGE_DIR_DURATION = 0.6

let lastRaf = 0
function tickDamageDir() {
  const now = performance.now()
  const dt = (now - lastRaf) / 1000
  lastRaf = now
  if (damageDirTimer.value > 0) {
    damageDirTimer.value -= dt
    if (damageDirTimer.value <= 0) {
      damageDir.value = null
    }
  }
  requestAnimationFrame(tickDamageDir)
}
requestAnimationFrame((t) => {
  lastRaf = t
  tickDamageDir()
})

const telemetry = reactive<FpsTelemetry>({
  hp: 100,
  maxHp: 100,
  o2Level: 100,
  o2Capacity: 100,
  sprintCharge: 50,
  sprintCapacity: 50,
  speed: 0,
  grounded: false,
  activeMode: 'weapon',
  aiming: false,
  isFiring: false,
  rtgLevel: 80,
  rtgCapacity: 80,
})

onMounted(async () => {
  if (container.value) {
    viewController.onTelemetry = (t) => {
      Object.assign(telemetry, t)
    }
    viewController.onPointerLockChange = (locked) => {
      pointerLocked.value = locked
    }
    viewController.onDamageFlash = (opacity) => {
      damageFlash.value = opacity
    }
    viewController.onDamageDirection = (angle) => {
      damageDir.value = angle
      damageDirTimer.value = DAMAGE_DIR_DURATION
    }
    await viewController.init(container.value)
  }
})

onUnmounted(() => {
  viewController.dispose()
})

function resumeLock() {
  viewController.requestPointerLock()
}
</script>

<template>
  <div ref="container" class="scene-container"></div>
  <FpsHud :telemetry="telemetry" />
  <div
    v-if="damageFlash > 0"
    class="fixed inset-0 pointer-events-none z-45"
    :style="{ background: `radial-gradient(ellipse at center, transparent 40%, rgba(255, 0, 0, ${damageFlash * 0.6}))` }"
  />
  <div
    v-if="damageDir !== null"
    class="damage-indicator"
    :style="{
      transform: `translate(-50%, -50%) rotate(${damageDir + Math.PI}rad)`,
      opacity: damageDirTimer / DAMAGE_DIR_DURATION,
    }"
  >
    <svg width="160" height="160" viewBox="0 0 160 160">
      <polygon
        points="80,10 65,40 95,40"
        fill="rgba(255, 40, 40, 0.9)"
        filter="drop-shadow(0 0 6px rgba(255, 0, 0, 0.8))"
      />
    </svg>
  </div>
  <div
    v-if="!pointerLocked"
    class="fixed inset-0 flex items-center justify-center bg-black/60 cursor-pointer z-50"
    @click="resumeLock"
  >
    <span class="text-lg text-white/80 font-mono tracking-widest uppercase">Click to resume</span>
  </div>
</template>

<style>
.damage-indicator {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 45;
  pointer-events: none;
}
</style>
