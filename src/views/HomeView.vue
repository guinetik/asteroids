<!-- src/views/HomeView.vue -->
<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div
    class="min-h-screen w-screen bg-black text-green-400 font-mono flex flex-col items-center justify-center gap-10"
  >
    <h1 class="text-2xl tracking-[0.35em] uppercase text-green-400/90" style="text-shadow: 0 0 8px rgba(0, 255, 0, 0.35)">
      Asteroids
    </h1>
    <RouterLink
      to="/map"
      class="px-10 py-3 border border-green-400/55 rounded-sm uppercase tracking-widest text-sm hover:bg-green-400/10 hover:border-green-400/80 transition-colors"
    >
      Play
    </RouterLink>
  </div>
</template>
