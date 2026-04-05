<!-- src/views/FpsView.vue -->
<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
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

/**
 * Compute the damage vignette background.
 * Base: centered radial vignette (always present during flash).
 * Directional: gradient biased toward the damage source — the red
 * edge is thicker on the side the hit came from.
 */
const damageBackground = computed(() => {
  if (damageFlash.value <= 0 && damageDir.value === null) return 'none'

  const layers: string[] = []
  const baseAlpha = damageFlash.value * 0.5

  // Directional layer — shift gradient center away from the hit direction
  // so the red is thickest on the side the damage came from.
  if (damageDir.value !== null) {
    const dirAlpha = (damageDirTimer.value / DAMAGE_DIR_DURATION) * 0.7
    // angle: 0 = ahead, PI/2 = right, PI = behind, -PI/2 = left
    // CSS percentages: shift gradient center opposite the damage direction
    const angle = damageDir.value + Math.PI // flip to point toward source
    const shiftX = 50 + Math.sin(angle) * 45 // 5%–95% range
    const shiftY = 50 + Math.cos(angle) * 45
    layers.push(
      `radial-gradient(ellipse at ${shiftX}% ${shiftY}%, transparent 20%, rgba(255, 0, 0, ${dirAlpha}) 100%)`,
    )
  }

  // Base vignette layer — always centered
  if (baseAlpha > 0) {
    layers.push(
      `radial-gradient(ellipse at center, transparent 40%, rgba(255, 0, 0, ${baseAlpha}))`,
    )
  }

  return layers.join(', ')
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
    v-if="damageFlash > 0 || damageDir !== null"
    class="fixed inset-0 pointer-events-none z-45"
    :style="{ background: damageBackground }"
  />
  <div
    v-if="!pointerLocked"
    class="fixed inset-0 flex items-center justify-center bg-black/60 cursor-pointer z-50"
    @click="resumeLock"
  >
    <span class="text-lg text-white/80 font-mono tracking-widest uppercase">Click to resume</span>
  </div>
</template>
