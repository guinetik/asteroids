<script setup lang="ts">
defineProps<{
  visible: boolean
  cause: string
}>()

const emit = defineEmits<{
  restart: []
}>()
</script>

<template>
  <div v-if="visible" class="death-overlay">
    <div class="death-overlay-cause">{{ cause }}</div>
    <button class="death-overlay-restart" @click="emit('restart')">Restart</button>
  </div>
</template>
