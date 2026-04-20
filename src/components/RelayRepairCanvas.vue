<!--
  RelayRepairCanvas.vue

  Overlay canvas for the relay repair minigame. Renders a 5×3 pipe grid
  inside the existing `.mission-minigame-overlay` backdrop. WASD/arrows
  navigate selection; R/click/wheel rotate. Live wave trace via `traceWave`.
  Wiggle RAF + lock-in land in Task 11.

  @author guinetik
  @date 2026-04-20
  @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import type { RelayRepairMiniGame } from '@/lib/minigame/relayRepair/RelayRepairMiniGame'
import { getRelayPuzzle } from '@/lib/minigame/relayRepair/puzzles'
import {
  CELL_PX,
  GRID_COLS,
  GRID_ROWS,
  NODE_RADIUS_PCT,
} from '@/lib/minigame/relayRepair/constants'
import { SHAPE_ROTATIONS, DIR_DELTA } from '@/lib/minigame/relayRepair/shapes'
import { traceWave, cellId } from '@/lib/minigame/relayRepair/wave'
import { computeQuality } from '@/lib/minigame/relayRepair/quality'
import type { Cell, Direction, Rotation } from '@/lib/minigame/relayRepair/types'

const props = defineProps<{
  /** The EVA mission opening this overlay. */
  mission: ActiveVisitRelayMission
  /** Active relay minigame instance. */
  minigame: RelayRepairMiniGame
}>()

const emit = defineEmits<{
  /** User completed the minigame. */
  complete: []
  /** User dismissed the overlay. */
  close: []
}>()

const puzzle = getRelayPuzzle(props.mission.template.id)

/** Derived grid dimensions. */
const GRID_W = GRID_COLS * CELL_PX
const GRID_H = GRID_ROWS * CELL_PX
const NODE_R = CELL_PX * NODE_RADIUS_PCT

/** Source row, col, and heading when the wave enters the grid. */
const SOURCE_ROW = 0
const SOURCE_COL = 0
const SOURCE_DIR: Direction = 'E'

/** Sink row, col, and direction the wave must exit heading. */
const SINK_ROW = 2
const SINK_COL = GRID_COLS
const SINK_DIR: Direction = 'E'

const cells = reactive(puzzle.cells.map((c) => ({ ...c })))
const selectedId = ref<string>(puzzle.startSelected)
const hoveredId = ref<string | null>(null)

const trace = computed(() => traceWave(cells, SOURCE_ROW, SOURCE_COL, SOURCE_DIR))
const sinkReached = computed(() =>
  trace.value.exits.some(
    (e) => e.row === SINK_ROW && e.col === SINK_COL && e.dir === SINK_DIR,
  ),
)
const quality = computed(() => computeQuality(trace.value.activeCells.size, sinkReached.value))
const qualityPct = computed(() => Math.round(quality.value * 100))
const canLock = computed(() => quality.value >= 0.95)
const deadEnds = computed(() => {
  const list: Array<{ fromRow: number; fromCol: number; dir: Direction }> = []
  for (const exit of trace.value.exits) {
    if (exit.row === SINK_ROW && exit.col === SINK_COL && exit.dir === SINK_DIR) continue
    const delta = DIR_DELTA[exit.dir]
    const fromRow = exit.row - delta[0]
    const fromCol = exit.col - delta[1]
    if (trace.value.activeCells.has(cellId(fromRow, fromCol))) {
      list.push({ fromRow, fromCol, dir: exit.dir })
    }
  }
  return list
})

/** SVG center of a cell. */
function cellCenter(row: number, col: number): { cx: number; cy: number } {
  return { cx: col * CELL_PX + CELL_PX / 2, cy: row * CELL_PX + CELL_PX / 2 }
}

/** SVG edge point of a cell in the given direction. */
function portEdge(row: number, col: number, port: Direction): { x: number; y: number } {
  const { cx, cy } = cellCenter(row, col)
  const h = CELL_PX / 2
  if (port === 'N') return { x: cx, y: cy - h }
  if (port === 'E') return { x: cx + h, y: cy }
  if (port === 'S') return { x: cx, y: cy + h }
  return { x: cx - h, y: cy }
}

/** SVG node-edge point of a cell in the given direction. */
function portStart(row: number, col: number, port: Direction): { x: number; y: number } {
  const { cx, cy } = cellCenter(row, col)
  if (port === 'N') return { x: cx, y: cy - NODE_R }
  if (port === 'E') return { x: cx + NODE_R, y: cy }
  if (port === 'S') return { x: cx, y: cy + NODE_R }
  return { x: cx - NODE_R, y: cy }
}

/** Canonical port list for a cell in its current rotation. */
function cellPorts(cell: Cell): readonly Direction[] {
  return SHAPE_ROTATIONS[cell.shape][cell.rotation] ?? []
}

/**
 * Returns the rotated port at canonical index `i` for a cell.
 * Used in the template to map from canonical slot → live port without
 * triggering noUncheckedIndexedAccess on double-indexed SHAPE_ROTATIONS.
 */
function rotatedPortAt(cell: Cell, i: number): Direction | undefined {
  return cellPorts(cell)[i]
}

/** Is this specific port segment lit right now? */
function segmentActive(row: number, col: number, port: Direction): boolean {
  return trace.value.activeSegments.has(`${row}-${col}-${port}`)
}

/** Is this cell currently the selected one? */
function isSelected(cell: { row: number; col: number }): boolean {
  return selectedId.value === cellId(cell.row, cell.col)
}

/** Is this cell currently hovered? */
function isHovered(cell: { row: number; col: number }): boolean {
  return hoveredId.value === cellId(cell.row, cell.col)
}

/** Rotate the target cell one step CW. */
function rotateCell(id: string): void {
  const cell = cells.find((c) => cellId(c.row, c.col) === id)
  if (!cell) return
  cell.rotation = (((cell.rotation + 1) % 4 + 4) % 4) as Rotation
  cell.visualRotation = cell.visualRotation + 1
  props.minigame.reportQuality(quality.value)
}

/** Move the selection one cell in the given grid direction, skipping empties. */
function moveSelection(dir: Direction): void {
  const current = cells.find((c) => cellId(c.row, c.col) === selectedId.value)
  if (!current) return
  const delta = DIR_DELTA[dir]
  const target = cells.find((c) => c.row === current.row + delta[0] && c.col === current.col + delta[1])
  if (target) selectedId.value = cellId(target.row, target.col)
}

/** Handle a cell being clicked — select it and rotate it. */
function handleCellClick(id: string): void {
  selectedId.value = id
  rotateCell(id)
}

/** Handle a wheel event on a cell — select it and rotate it, suppressing page scroll. */
function handleCellWheel(e: WheelEvent, id: string): void {
  e.preventDefault()
  selectedId.value = id
  rotateCell(id)
}

/** Global keyboard handler for navigation, rotation, and overlay dismiss. */
function onKeyDown(e: KeyboardEvent): void {
  const k = e.key.toLowerCase()
  if (k === 'escape') {
    e.preventDefault()
    emit('close')
    return
  }
  if (k === 'w' || e.key === 'ArrowUp') { e.preventDefault(); moveSelection('N'); return }
  if (k === 's' || e.key === 'ArrowDown') { e.preventDefault(); moveSelection('S'); return }
  if (k === 'a' || e.key === 'ArrowLeft') { e.preventDefault(); moveSelection('W'); return }
  if (k === 'd' || e.key === 'ArrowRight') { e.preventDefault(); moveSelection('E'); return }
  if (k === 'r') { e.preventDefault(); rotateCell(selectedId.value); return }
  // `e` key handler added in Task 11.
}

/** Placeholder handler until lock-in ships in Task 11. */
function handleTempComplete(): void {
  props.minigame.complete()
  emit('complete')
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  props.minigame.reportQuality(quality.value)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="relay-overlay" role="dialog" aria-label="Relay repair" tabindex="0">
    <div class="relay-status">
      <span class="relay-status__location">EVA / RELAY BAY · {{ puzzle.relay }}</span>
      <span class="relay-status__mission">{{ mission.template.name }}</span>
      <span class="relay-status__state">
        {{ canLock ? 'SIGNAL LOCK AVAILABLE' : sinkReached ? 'PATH COMPLETE' : 'CALIBRATING' }}
      </span>
    </div>

    <div class="relay-osc">
      <div class="relay-osc__label">
        <span>INPUT SIGNAL · {{ puzzle.carrier }} · CLEAN</span>
        <span class="relay-osc__lock">● CARRIER LOCKED</span>
      </div>
      <div class="relay-osc__trace" />
    </div>

    <div class="relay-grid-panel">
      <div class="relay-grid-panel__header">
        <span>SIGNAL GRID · {{ puzzle.relay }}</span>
        <span class="relay-grid-panel__state" :class="{ 'relay-grid-panel__state--ok': sinkReached }">
          {{ sinkReached ? '● BACKBONE RESTORED' : '⚠ PATH INCOMPLETE' }}
        </span>
      </div>
      <svg
        class="relay-grid-panel__svg"
        :viewBox="`-60 -20 ${GRID_W + 120} ${GRID_H + 40}`"
        preserveAspectRatio="xMidYMid meet"
      >
        <g>
          <line
            v-for="i in GRID_ROWS + 1"
            :key="`h${i}`"
            :x1="0"
            :y1="(i - 1) * CELL_PX"
            :x2="GRID_W"
            :y2="(i - 1) * CELL_PX"
            class="relay-grid__line"
          />
          <line
            v-for="i in GRID_COLS + 1"
            :key="`v${i}`"
            :x1="(i - 1) * CELL_PX"
            :y1="0"
            :x2="(i - 1) * CELL_PX"
            :y2="GRID_H"
            class="relay-grid__line"
          />
        </g>

        <g
          v-for="cell in cells"
          :key="`${cell.row}-${cell.col}`"
          :class="{ 'relay-cell--selected': isSelected(cell), 'relay-cell--hovered': isHovered(cell) }"
          role="button"
          tabindex="-1"
          aria-label="Pipe node"
          @click.stop="handleCellClick(`${cell.row}-${cell.col}`)"
          @mouseenter="hoveredId = `${cell.row}-${cell.col}`"
          @mouseleave="hoveredId = null"
          @wheel="handleCellWheel($event, `${cell.row}-${cell.col}`)"
        >
          <rect
            :x="cell.col * CELL_PX + 4"
            :y="cell.row * CELL_PX + 4"
            :width="CELL_PX - 8"
            :height="CELL_PX - 8"
            fill="transparent"
          />
          <g
            class="relay-node"
            :style="{
              transform: `rotate(${cell.visualRotation * 90}deg)`,
              transformOrigin: `${cellCenter(cell.row, cell.col).cx}px ${cellCenter(cell.row, cell.col).cy}px`,
            }"
          >
            <template v-for="(canonPort, i) in SHAPE_ROTATIONS[cell.shape][0]" :key="canonPort">
              <line
                :x1="cellCenter(cell.row, cell.col).cx"
                :y1="cellCenter(cell.row, cell.col).cy"
                :x2="portStart(cell.row, cell.col, canonPort).x"
                :y2="portStart(cell.row, cell.col, canonPort).y"
                class="relay-hub-arm"
                :class="{ 'relay-hub-arm--active': segmentActive(cell.row, cell.col, rotatedPortAt(cell, i) ?? 'N') }"
              />
              <line
                :x1="portStart(cell.row, cell.col, canonPort).x"
                :y1="portStart(cell.row, cell.col, canonPort).y"
                :x2="portEdge(cell.row, cell.col, canonPort).x"
                :y2="portEdge(cell.row, cell.col, canonPort).y"
                class="relay-pipe-arm"
                :class="{ 'relay-pipe-arm--active': segmentActive(cell.row, cell.col, rotatedPortAt(cell, i) ?? 'N') }"
              />
            </template>
          </g>
          <circle
            :cx="cellCenter(cell.row, cell.col).cx"
            :cy="cellCenter(cell.row, cell.col).cy"
            :r="NODE_R"
            class="relay-node-body"
            :class="{
              'relay-node-body--active': cellPorts(cell).some((p) => segmentActive(cell.row, cell.col, p)),
              'relay-node-body--hovered': isHovered(cell),
            }"
          />
          <circle
            :cx="cellCenter(cell.row, cell.col).cx"
            :cy="cellCenter(cell.row, cell.col).cy"
            :r="cellPorts(cell).some((p) => segmentActive(cell.row, cell.col, p)) ? 3.5 : 2"
            class="relay-node-hub"
            :class="{ 'relay-node-hub--active': cellPorts(cell).some((p) => segmentActive(cell.row, cell.col, p)) }"
          />
          <text
            :x="cellCenter(cell.row, cell.col).cx + NODE_R - 4"
            :y="cellCenter(cell.row, cell.col).cy + NODE_R - 2"
            class="relay-node-glyph"
          >
            {{ cell.shape }}
          </text>
          <circle
            v-if="isSelected(cell)"
            :cx="cellCenter(cell.row, cell.col).cx"
            :cy="cellCenter(cell.row, cell.col).cy"
            :r="NODE_R + 12"
            class="relay-selection-ring"
          />
        </g>

        <g v-for="(de, i) in deadEnds" :key="`de-${i}`">
          <circle
            :cx="portEdge(de.fromRow, de.fromCol, de.dir).x"
            :cy="portEdge(de.fromRow, de.fromCol, de.dir).y"
            r="3"
            class="relay-dead-end"
          />
        </g>
      </svg>
    </div>

    <div class="relay-quality">
      <div class="relay-quality__label">SIGNAL QUALITY</div>
      <div class="relay-quality__bar">
        <span :style="{ width: `${qualityPct}%` }" :class="canLock ? 'relay-bar-green' : 'relay-bar-amber'" />
      </div>
      <div class="relay-quality__pct">{{ qualityPct }}%</div>
    </div>

    <div class="relay-hints">
      <span>WASD · MOVE</span>
      <span>CLICK · WHEEL · ROTATE</span>
      <span>R · ROTATE</span>
      <span>E · LOCK IN (≥95%)</span>
      <span>ESC · ABORT</span>
    </div>

    <button type="button" class="relay-temp-complete" @click="handleTempComplete">(WIP) Complete</button>
    <button type="button" class="relay-close" @click="emit('close')">Close</button>
  </div>
</template>
