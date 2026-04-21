<!-- src/views/ShuttleView.vue -->
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { ShuttleViewController } from './ShuttleViewController'
import ShuttleHud from '@/components/ShuttleHud.vue'
import FpsHud, { type FpsTelemetry } from '@/components/FpsHud.vue'
import HelmetVisor from '@/components/HelmetVisor.vue'
import type { ShuttleTelemetry } from '@/lib/ShuttleTelemetry'

const route = useRoute()
const container = ref<HTMLElement>()
const viewController = new ShuttleViewController()
const telemetry = reactive<ShuttleTelemetry>({
  speed: 0,
  heading: 0,
  posX: 0,
  posZ: 0,
  actionPrompt: null,
  fuelLevel: 0,
  fuelCapacity: 0,
  thrustCharge: 0,
  thrustCapacity: 0,
  brakeCharge: 0,
  brakeCapacity: 0,
  rcsCharge: 0,
  rcsCapacity: 0,
  turretMiningCharge: 0,
  turretMiningCapacity: 0,
  turretActive: false,
  adriftCountdown: -1,
  hp: 100,
  maxHp: 100,
  temperature: 0,
  temperatureVisible: false,
  damageIntensity: 0,
  compassBearings: [],
})

const evaActive = ref(false)
const evaTelemetry = reactive<FpsTelemetry>({
  hp: 100,
  maxHp: 100,
  o2Level: 100,
  o2Capacity: 100,
  sprintCharge: 0,
  sprintCapacity: 0,
  speed: 0,
  grounded: false,
  activeMode: 'drill',
  aiming: false,
  isFiring: false,
  rtgLevel: 100,
  rtgCapacity: 100,
  modeCharge: 0,
  modeCapacity: 0,
  headingRad: 0,
  objectives: [],
})

onMounted(async () => {
  if (container.value) {
    viewController.onTelemetry = (t) => {
      Object.assign(telemetry, t)
    }
    viewController.onEvaTelemetry = (t) => {
      Object.assign(evaTelemetry, t)
    }
    viewController.onEvaModeChange = (active) => {
      evaActive.value = active
    }
    const cityQuery = route.query.city
    const city =
      cityQuery === 'true' || (Array.isArray(cityQuery) && cityQuery.includes('true'))
    await viewController.init(container.value, { city })
  }
})

onUnmounted(() => {
  viewController.dispose()
})
</script>

<template>
  <div ref="container" class="scene-container"></div>
  <ShuttleHud v-if="!evaActive" :telemetry="telemetry" />
  <HelmetVisor v-if="evaActive" />
  <FpsHud v-if="evaActive" :telemetry="evaTelemetry" variant="eva" />
  <div
    v-if="evaActive && telemetry.actionPrompt"
    class="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-6"
  >
    <div
      class="rounded-full border border-cyan-300/45 bg-slate-950/68 px-5 py-2 font-mono text-xs uppercase tracking-[0.28em] text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.18)] backdrop-blur-sm"
    >
      {{ telemetry.actionPrompt }}
    </div>
  </div>
</template>
