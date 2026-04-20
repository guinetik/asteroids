<!--
  RelayRepairCanvas.vue

  Overlay canvas for the relay repair minigame. Renders a 5×3 pipe grid
  inside the existing `.mission-minigame-overlay` backdrop. Interactivity
  lands in Task 10; wiggle RAF + lock-in in Task 11.

  @author guinetik
  @date 2026-04-20
  @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
-->
<script setup lang="ts">
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import type { RelayRepairMiniGame } from '@/lib/minigame/relayRepair/RelayRepairMiniGame'
import { getRelayPuzzle } from '@/lib/minigame/relayRepair/puzzles'
import {
  CELL_PX,
  GRID_COLS,
  GRID_ROWS,
  NODE_RADIUS_PCT,
} from '@/lib/minigame/relayRepair/constants'
import { SHAPE_ROTATIONS } from '@/lib/minigame/relayRepair/shapes'
import type { Direction } from '@/lib/minigame/relayRepair/types'

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

/** Placeholder handler until lock-in ships in Task 11. */
function handleTempComplete(): void {
  props.minigame.complete()
  emit('complete')
}
</script>

<template>
  <div class="relay-overlay" role="dialog" aria-label="Relay repair" tabindex="0">
    <div class="relay-status">
      <span class="relay-status__location">EVA / RELAY BAY · {{ puzzle.relay }}</span>
      <span class="relay-status__mission">{{ mission.template.name }}</span>
      <span class="relay-status__state">CALIBRATING</span>
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
        <span class="relay-grid-panel__state">⚠ PATH INCOMPLETE</span>
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

        <g v-for="cell in puzzle.cells" :key="`${cell.row}-${cell.col}`">
          <g
            class="relay-node"
            :style="{
              transform: `rotate(${cell.visualRotation * 90}deg)`,
              transformOrigin: `${cellCenter(cell.row, cell.col).cx}px ${cellCenter(cell.row, cell.col).cy}px`,
            }"
          >
            <template v-for="port in SHAPE_ROTATIONS[cell.shape][0]" :key="port">
              <line
                :x1="cellCenter(cell.row, cell.col).cx"
                :y1="cellCenter(cell.row, cell.col).cy"
                :x2="portStart(cell.row, cell.col, port).x"
                :y2="portStart(cell.row, cell.col, port).y"
                class="relay-hub-arm"
              />
              <line
                :x1="portStart(cell.row, cell.col, port).x"
                :y1="portStart(cell.row, cell.col, port).y"
                :x2="portEdge(cell.row, cell.col, port).x"
                :y2="portEdge(cell.row, cell.col, port).y"
                class="relay-pipe-arm"
              />
            </template>
          </g>
          <circle
            :cx="cellCenter(cell.row, cell.col).cx"
            :cy="cellCenter(cell.row, cell.col).cy"
            :r="NODE_R"
            class="relay-node-body"
          />
          <circle
            :cx="cellCenter(cell.row, cell.col).cx"
            :cy="cellCenter(cell.row, cell.col).cy"
            r="2"
            class="relay-node-hub"
          />
          <text
            :x="cellCenter(cell.row, cell.col).cx + NODE_R - 4"
            :y="cellCenter(cell.row, cell.col).cy + NODE_R - 2"
            class="relay-node-glyph"
          >
            {{ cell.shape }}
          </text>
        </g>
      </svg>
    </div>

    <div class="relay-quality">
      <div class="relay-quality__label">SIGNAL QUALITY</div>
      <div class="relay-quality__bar"><span style="width: 0%;" class="relay-bar-amber" /></div>
      <div class="relay-quality__pct">0%</div>
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
