<!-- src/components/HelmetVisor.vue -->
<script setup lang="ts">
/**
 * Reusable helmet visor overlay — rounded viewport with opaque corners and a
 * faint glass tint. Styles are global (non-scoped) so views without this
 * component (e.g. LevelView's inline style) can share the same class.
 */
</script>

<template>
  <div class="helmet-visor" aria-hidden="true" />
</template>

<style>
.helmet-visor {
  position: fixed;
  inset: 0;
  z-index: 6;
  pointer-events: none;
  border: 2px solid rgba(80, 100, 120, 0.2);
  border-radius: 20% / 12%;
  box-shadow:
    0 0 0 9999px rgba(0, 0, 0, 0.95),
    inset 0 0 60px rgba(0, 10, 30, 0.5),
    inset 0 0 150px rgba(0, 5, 15, 0.25);
  background: radial-gradient(
    ellipse at center,
    transparent 0%,
    transparent 65%,
    rgba(20, 40, 60, 0.06) 85%,
    rgba(10, 30, 50, 0.12) 100%
  );
}
</style>
