<!-- src/components/LevelMinimap.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'

/** Objective marker on the minimap. */
export interface MapMarker {
  /** Unique id. */
  id: string
  /** World X position. */
  x: number
  /** World Z position. */
  z: number
  /** CSS color string. */
  color: string
  /** Optional label for tooltip. */
  label?: string
}

const props = defineProps<{
  /** Pre-rendered heightmap canvas. */
  mapCanvas: HTMLCanvasElement | null
  /** Player world X position. */
  playerX: number
  /** Player world Z position. */
  playerZ: number
  /** World grid size (centered at origin). */
  gridSize: number
  /** Objective markers. */
  markers: MapMarker[]
}>()

const displayCanvas = ref<HTMLCanvasElement>()

/** Convert world coordinates to pixel position on the display canvas. */
function worldToPixel(wx: number, wz: number, displayW: number, displayH: number) {
  return {
    x: (wx / props.gridSize + 0.5) * displayW,
    y: (wz / props.gridSize + 0.5) * displayH,
  }
}

/** Player dot position on canvas. */
const playerPixel = computed(() => {
  const el = displayCanvas.value
  if (!el) return { x: 0, y: 0 }
  return worldToPixel(props.playerX, props.playerZ, el.clientWidth, el.clientHeight)
})

/** Marker pixel positions. */
const markerPixels = computed(() => {
  const el = displayCanvas.value
  if (!el) return []
  const w = el.clientWidth
  const h = el.clientHeight
  return props.markers.map((m) => {
    const p = worldToPixel(m.x, m.z, w, h)
    return { id: m.id, px: p.x, py: p.y, color: m.color, label: m.label }
  })
})

/** Copy the map canvas into the display canvas. */
function redraw() {
  const src = props.mapCanvas
  const dst = displayCanvas.value
  if (!src || !dst) return
  dst.width = src.width
  dst.height = src.height
  const ctx = dst.getContext('2d')
  if (!ctx) return
  ctx.drawImage(src, 0, 0)
}

onMounted(redraw)
watch(() => props.mapCanvas, redraw)
</script>

<template>
  <div class="level-minimap">
    <div class="level-minimap__header">MAP</div>
    <div class="level-minimap__body">
      <canvas ref="displayCanvas" class="level-minimap__canvas" />
      <!-- Player dot -->
      <div
        class="level-minimap__dot level-minimap__dot--player"
        :style="{
          left: `${playerPixel.x}px`,
          top: `${playerPixel.y}px`,
        }"
      />
      <!-- Objective markers -->
      <div
        v-for="m in markerPixels"
        :key="m.id"
        class="level-minimap__dot"
        :style="{
          left: `${m.px}px`,
          top: `${m.py}px`,
          '--dot-color': m.color,
        }"
        :title="m.label"
      />
    </div>
  </div>
</template>

<style>
.level-minimap {
  position: fixed;
  bottom: 24px;
  left: 8px;
  width: 240px;
  z-index: 25;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.level-minimap__header {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 0.15em;
  padding: 4px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.level-minimap__body {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
}

.level-minimap__canvas {
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  display: block;
}

.level-minimap__dot {
  position: absolute;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dot-color, #66ffee);
  box-shadow: 0 0 6px var(--dot-color, #66ffee);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.level-minimap__dot--player {
  --dot-color: #66ffee;
  width: 8px;
  height: 8px;
  border: 2px solid rgba(0, 0, 0, 0.5);
  animation: level-minimap-dot-pulse 1.5s ease-in-out infinite;
}

@keyframes level-minimap-dot-pulse {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.5);
    opacity: 0.7;
  }
}
</style>
