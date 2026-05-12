<!-- src/components/MapOverlay.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import type { MapOverlayState } from '@/lib/ShuttleTelemetry'

const props = withDefaults(
  defineProps<{
    overlay: MapOverlayState
    /**
     * Set of planet ids that the player can fast travel to. Each label whose `id`
     * is in this set is rendered with a clickable hotspot overlay.
     */
    fastTravelablePlanetIds?: Set<string>
    /** When true, show Space Fabric toggle (requires Gravity Surfing unlock — same rule as main map). */
    spaceFabricUnlocked?: boolean
    /** Mirrors 3D grid on/off; synced from {@link MapViewController} like main HUD. */
    spaceFabricVisible?: boolean
  }>(),
  {
    fastTravelablePlanetIds: undefined,
    spaceFabricUnlocked: false,
    spaceFabricVisible: false,
  },
)

const emit = defineEmits<{
  'planet-click': [planetId: string, planetName: string]
  /** User toggled Space Fabric from the tactical overlay (parent calls `toggleSpaceTimeGrid`). */
  'toggle-space-fabric': []
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

/** Whether the hot/cold zone rings are drawn. Default off — discreet reference feature. */
const thermalZonesVisible = ref(false)

/** Toggle thermal-zone ring visibility. */
function toggleThermalZones(): void {
  thermalZonesVisible.value = !thermalZonesVisible.value
}

/**
 * Build an SVG path for a single thermal zone annulus.
 *
 * Two concentric ellipses (outer + inner) combined with `fill-rule="evenodd"`
 * render as a transparent ring. Using separate rx/ry per axis gives a true
 * screen-space circle in the stretched viewBox — a single shared radius
 * would render as an ellipse on non-square viewports. When the inner radius
 * is zero (the hot3 disc that touches the Sun), the inner subpath is omitted
 * so the shape fills as a solid disc.
 *
 * @param z - Projected zone state with center + inner/outer X/Y radii in %
 * @returns SVG `d` attribute string for the annulus
 */
function buildThermalZonePath(z: {
  centerX: number
  centerY: number
  innerRadiusX: number
  innerRadiusY: number
  outerRadiusX: number
  outerRadiusY: number
}): string {
  const outer = ellipseSubpath(z.centerX, z.centerY, z.outerRadiusX, z.outerRadiusY)
  if (z.innerRadiusX <= 0 || z.innerRadiusY <= 0) return outer
  const inner = ellipseSubpath(z.centerX, z.centerY, z.innerRadiusX, z.innerRadiusY)
  return `${outer} ${inner}`
}

/** Build a closed SVG ellipse subpath using two arcs (start at west point, sweep around). */
function ellipseSubpath(cx: number, cy: number, rx: number, ry: number): string {
  return `M ${cx - rx},${cy} a ${rx},${ry} 0 1,0 ${rx * 2},0 a ${rx},${ry} 0 1,0 ${-rx * 2},0 Z`
}

/** Bodies that already have a route line — don't duplicate the distance label. */
const routeBodyNames = computed(() => new Set(props.overlay.distances.map((d) => d.name)))

/** Pick the per-belt CSS modifier — falls back to `main` for unknown belt ids. */
function beltCssVariant(beltId: string): string {
  if (beltId === 'kuiper-belt') return 'kuiper'
  return 'main'
}

/**
 * Inner radius as a fraction (%) of the outer radius — drives the radial-gradient
 * hole. Same ratio holds in X and Y because the source belt is a true world circle,
 * so we sample the X axis (Y would yield the same value).
 */
function beltInnerFrac(belt: { innerRadiusX: number; outerRadiusX: number }): number {
  if (belt.outerRadiusX <= 0) return 0
  return Math.max(0, Math.min(99, (belt.innerRadiusX / belt.outerRadiusX) * 100))
}

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
    <!-- Authored CSS grid backdrop — purely visual, independent of world coordinates. -->
    <div class="map-tac-grid" />

    <!-- Thermal zone rings (hot/cold) — toggled discreet layer, rendered below gravity rings -->
    <svg
      v-if="thermalZonesVisible"
      class="map-thermal-svg"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <path
        v-for="zone in overlay.thermalZones"
        :key="'thermal-' + zone.kind"
        :d="buildThermalZonePath(zone)"
        fill-rule="evenodd"
        :class="['map-thermal-ring', 'map-thermal-ring--' + zone.kind]"
      />
    </svg>

    <!-- Safe cargo band — emerald annulus, always visible when organ is in transit. -->
    <svg
      v-if="overlay.safeCargoBand"
      class="map-thermal-svg"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <path
        :d="buildThermalZonePath(overlay.safeCargoBand)"
        fill-rule="evenodd"
        class="map-cargo-band-ring"
      />
    </svg>

    <!-- Asteroid belt annuli (Main Belt, Kuiper Belt) — CSS-authored over the tac map.
         X and Y radii are projected independently so the annulus stays a true screen-
         space circle on widescreen viewports (matches thermal-zone projection). -->
    <div
      v-for="belt in overlay.asteroidBelts"
      :key="'belt-' + belt.id"
      :class="['map-belt-ring', 'map-belt-ring--' + beltCssVariant(belt.id)]"
      :style="{
        left: belt.centerX + '%',
        top: belt.centerY + '%',
        width: belt.outerRadiusX * 2 + '%',
        height: belt.outerRadiusY * 2 + '%',
        '--belt-inner-frac': beltInnerFrac(belt) + '%',
      }"
    />

    <!-- Gravity rings -->
    <div v-for="ring in overlay.gravityRings" :key="'ring-' + ring.name" class="map-gravity-ring">
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
      <g
        v-if="worldLineVisible"
        v-for="(segment, index) in trajectorySegments"
        :key="'traj-' + index"
      >
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
      <span v-if="!routeBodyNames.has(label.name)" class="map-label-distance">{{
        label.distance
      }}</span>
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
      :style="{
        left: overlay.missionWaypoint.screenX + '%',
        top: overlay.missionWaypoint.screenY + '%',
      }"
    >
      <div class="map-waypoint-dot" />
      <span class="map-waypoint-label">{{ overlay.missionWaypoint.name }}</span>
      <span class="map-waypoint-distance">{{ overlay.missionWaypoint.distance }}</span>
    </div>

    <!-- Ship marker silhouette -->
    <div class="map-ship-marker" :style="{ left: overlay.shipX + '%', top: overlay.shipY + '%' }">
      <div class="map-ship-rotator" :style="{ transform: 'rotate(' + overlay.headingDeg + 'deg)' }">
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
        :class="thermalZonesVisible ? 'map-toggle-btn--active' : 'map-toggle-btn--inactive'"
        @click="toggleThermalZones"
      >
        <span class="map-toggle-btn__dot" />
        Thermal
      </button>
      <button
        v-if="spaceFabricUnlocked"
        type="button"
        class="map-toggle-btn"
        :class="spaceFabricVisible ? 'map-toggle-btn--active' : 'map-toggle-btn--inactive'"
        @click="emit('toggle-space-fabric')"
      >
        <span class="map-toggle-btn__dot" />
        Space Fabric
      </button>
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
