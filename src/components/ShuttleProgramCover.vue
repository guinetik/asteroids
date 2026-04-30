<script setup lang="ts">
/**
 * Wide top cover strip (`background-size: cover`) under program chrome; height is CSS-clamped, not
 * tied to full scroll height (lists continue on solid panel bg).
 *
 * @author guinetik
 * @date 2026-04-30
 */

defineProps<{
  /**
   * Selects `public/{slug}.webp` and gradient tuning.
   *
   * @example `inventory` → `/inventory.webp`
   */
  variant: 'inventory' | 'missions' | 'engineering-bay'
}>()
</script>

<template>
  <section class="shuttle-program-ambient" :class="`shuttle-program-ambient--${variant}`">
    <div class="shuttle-program-ambient__backdrop" aria-hidden="true" />
    <div class="shuttle-program-ambient__stack">
      <slot />
    </div>
  </section>
</template>
