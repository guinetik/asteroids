<!-- src/components/MapOverlay.vue -->
<script setup lang="ts">
import type { MapOverlayState } from '@/lib/ShuttleTelemetry'

defineProps<{
  overlay: MapOverlayState
}>()
</script>

<template>
  <div v-if="overlay.visible" class="map-overlay">
    <!-- Gravity rings -->
    <div
      v-for="ring in overlay.gravityRings"
      :key="'ring-' + ring.name"
      class="map-gravity-ring"
    >
      <div
        class="map-influence-ring"
        :style="{
          left: ring.centerX + '%',
          top: ring.centerY + '%',
          width: ring.influenceRadius * 2 + '%',
          height: ring.influenceRadius * 2 + '%',
        }"
      />
      <div
        class="map-horizon-ring"
        :style="{
          left: ring.centerX + '%',
          top: ring.centerY + '%',
          width: ring.horizonRadius * 2 + '%',
          height: ring.horizonRadius * 2 + '%',
        }"
      />
    </div>

    <!-- Distance lines (SVG) -->
    <svg class="map-distance-svg">
      <g v-for="line in overlay.distances" :key="'dist-' + line.name">
        <line
          :x1="line.shipX + '%'"
          :y1="line.shipY + '%'"
          :x2="line.bodyX + '%'"
          :y2="line.bodyY + '%'"
          class="map-distance-line"
        />
        <text
          :x="(line.shipX + line.bodyX) / 2 + '%'"
          :y="(line.shipY + line.bodyY) / 2 + '%'"
          class="map-distance-text"
        >
          {{ line.distance }}
        </text>
      </g>
    </svg>

    <!-- Planet labels -->
    <div
      v-for="label in overlay.labels"
      :key="'label-' + label.name"
      class="map-label"
      :style="{ left: label.screenX + '%', top: label.screenY + '%' }"
    >
      {{ label.name }}
    </div>

    <!-- Ship marker + heading arrow -->
    <div
      class="map-ship-marker"
      :style="{ left: overlay.shipX + '%', top: overlay.shipY + '%' }"
    >
      <div class="map-ship-reticle" />
      <div
        v-if="overlay.speed > 0.01"
        class="map-heading-arrow"
        :style="{ transform: 'rotate(' + overlay.headingDeg + 'deg)' }"
      />
    </div>

    <!-- MAP label -->
    <div class="map-title">TACTICAL MAP</div>
    <div class="map-hint">Press M or ESC to close</div>
  </div>
</template>
