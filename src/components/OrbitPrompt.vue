<script setup lang="ts">
import { computed } from 'vue'
import type { OrbitHudState } from '@/lib/orbitCapture'

const props = defineProps<{
  orbitState: OrbitHudState
}>()

const visible = computed(() => {
  if (props.orbitState.state === 'free' && props.orbitState.nearestBodyName) return true
  if (props.orbitState.state === 'approaching') return true
  if (props.orbitState.state === 'orbiting') return true
  return false
})

const message = computed(() => {
  const s = props.orbitState
  if (s.state === 'free' && s.nearestBodyName) {
    return `Press E \u2014 Orbit ${s.nearestBodyName}`
  }
  if (s.state === 'approaching') {
    return `Orbit Insertion... \u2014 Press E to Cancel`
  }
  if (s.state === 'orbiting') {
    return `Press E \u2014 Slingshot Launch`
  }
  return ''
})

const subtitle = computed(() => {
  if (props.orbitState.state === 'orbiting') {
    return `Orbital Speed: ${props.orbitState.orbitalSpeed.toFixed(1)} u/s`
  }
  return ''
})
</script>

<template>
  <div v-if="visible" class="orbit-prompt">
    <span class="orbit-prompt-message">{{ message }}</span>
    <span v-if="subtitle" class="orbit-prompt-subtitle">{{ subtitle }}</span>
  </div>
</template>
