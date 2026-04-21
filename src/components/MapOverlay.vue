<!-- src/components/MapOverlay.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import type { MapOverlayState } from '@/lib/ShuttleTelemetry'

const props = defineProps<{
  overlay: MapOverlayState
  /**
   * Set of planet ids that the player can fast travel to. Each label whose `id`
   * is in this set is rendered with a clickable hotspot overlay.
   */
  fastTravelablePlanetIds?: Set<string>
}>()

const emit = defineEmits<{
  'planet-click': [planetId: string, planetName: string]
}>()

const fastTravelable = computed(() => props.fastTravelablePlanetIds ?? new Set<string>())

function isFastTravelable(planetId: string | undefined): boolean {
  if (!planetId) return false
  return fastTravelable.value.has(planetId)
}

/** Whether the persistent world-line trail is drawn. */
const worldLineVisible = ref(true)

/** Toggle world-line visibility. */
function toggleWorldLine(): void {
  worldLineVisible.value = !worldLineVisible.value
}

/** Bodies that already have a route line — don't duplicate the distance label. */
const routeBodyNames = computed(() =>
  new Set(props.overlay.distances.map((d) => d.name)),
)

/** Consecutive line segments for the persistent world-line polyline. */
const trajectorySegments = computed(() => {
  const points = props.overlay.trajectoryPoints

  return points.slice(0, -1).map((point, index) => ({
    x1: point.screenX,
    y1: point.screenY,
    x2: points[index + 1]!.screenX,
    y2: points[index + 1]!.screenY,
  }))
})
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
      <g v-if="worldLineVisible" v-for="(segment, index) in trajectorySegments" :key="'traj-' + index">
        <line
          :x1="segment.x1 + '%'"
          :y1="segment.y1 + '%'"
          :x2="segment.x2 + '%'"
          :y2="segment.y2 + '%'"
          class="map-trajectory-line"
        />
      </g>
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

    <!-- Planet indicators + labels -->
    <div
      v-for="label in overlay.labels"
      :key="'label-' + label.name"
      class="map-body-indicator"
      :class="{ 'map-body-indicator--fast-travel': isFastTravelable(label.id) }"
      :style="{ left: label.screenX + '%', top: label.screenY + '%' }"
    >
      <div class="map-body-dot" />
      <span class="map-label">{{ label.name }}</span>
      <span v-if="!routeBodyNames.has(label.name)" class="map-label-distance">{{ label.distance }}</span>
      <button
        v-if="isFastTravelable(label.id)"
        type="button"
        class="map-fast-travel-hotspot"
        :title="`Fast travel to ${label.name}`"
        :aria-label="`Fast travel to ${label.name}`"
        @click.stop="emit('planet-click', label.id, label.name)"
      >
        <span class="map-fast-travel-hotspot__ring" aria-hidden="true" />
        <span class="map-fast-travel-hotspot__label">JUMP</span>
      </button>
    </div>

    <!-- Mission waypoint indicator -->
    <div
      v-if="overlay.missionWaypoint"
      class="map-waypoint-indicator"
      :style="{ left: overlay.missionWaypoint.screenX + '%', top: overlay.missionWaypoint.screenY + '%' }"
    >
      <div class="map-waypoint-dot" />
      <span class="map-waypoint-label">{{ overlay.missionWaypoint.name }}</span>
      <span class="map-waypoint-distance">{{ overlay.missionWaypoint.distance }}</span>
    </div>

    <!-- Ship marker silhouette -->
    <div
      class="map-ship-marker"
      :style="{ left: overlay.shipX + '%', top: overlay.shipY + '%' }"
    >
      <div
        class="map-ship-rotator"
        :style="{ transform: 'rotate(' + overlay.headingDeg + 'deg)' }"
      >
        <div class="map-ship-icon" />
      </div>
    </div>

    <!-- MAP label -->
    <div class="map-title">TACTICAL MAP</div>
    <div class="map-hint">Press M or ESC to close</div>

    <!-- Bottom-right overlay controls -->
    <div class="map-overlay-controls">
      <button
        type="button"
        class="map-toggle-btn"
        :class="worldLineVisible ? 'map-toggle-btn--active' : 'map-toggle-btn--inactive'"
        @click="toggleWorldLine"
      >
        <span class="map-toggle-btn__dot" />
        World Line
      </button>
    </div>
  </div>
</template>
