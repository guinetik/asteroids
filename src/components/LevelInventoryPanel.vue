<!-- src/components/LevelInventoryPanel.vue -->
<script setup lang="ts">
/**
 * In-mission inventory panel.
 *
 * Modal overlay opened during EVA / lander states (toggle with `B`)
 * that lets the player inspect their cargo, split off a partial
 * stack with a quantity slider, and jettison the selected portion
 * out of the airlock to free weight or slots.
 *
 * The panel is purely presentational. The parent owns the
 * authoritative inventory snapshot and is responsible for persisting
 * changes via `inventoryStorage.saveInventory` after handling the
 * `jettison` event. Re-pass an updated `inventory` prop after
 * persisting and the panel will re-render.
 *
 * Keyboard:
 *   - `Esc` closes the panel (handled by the parent).
 *   - `B` toggles the panel (handled by the parent).
 *
 * @author guinetik
 * @date 2026-04-18
 */
import { computed, ref, watch } from 'vue'
import type { Inventory, InventoryStack } from '@/lib/inventory/types'
import { getItemDefinition } from '@/lib/inventory/catalog'

const props = defineProps<{
  /** Current cargo snapshot. `null` while the inventory hasn't loaded. */
  inventory: Inventory | null
  /** Whether the panel is visible. */
  open: boolean
  /**
   * Per-item quantities collected since this sortie's baseline (level entry or
   * restart). Used for “this sortie” badges; omit rows with zero.
   */
  runGainsThisSortie?: Record<string, number>
}>()

const emit = defineEmits<{
  close: []
  jettison: [itemId: string, quantity: number]
}>()

/** Per-item-id selected jettison quantity, persisted across renders. */
const splitQty = ref<Record<string, number>>({})

interface DisplayRow {
  itemId: string
  label: string
  category: string
  quantity: number
  weightPerUnit: number
  totalWeightKg: number
  splitQty: number
  partialWeight: number
  unitNoun: string
  /** Units above sortie baseline for this id (0 when none). */
  runGainThisSortie: number
}

const totalWeight = computed(() => {
  if (!props.inventory) return 0
  return props.inventory.stacks.reduce((sum, stack) => sum + stack.totalWeightKg, 0)
})

const weightPercent = computed(() => {
  const inv = props.inventory
  if (!inv || inv.maxWeightKg <= 0) return 0
  return Math.min(100, (totalWeight.value / inv.maxWeightKg) * 100)
})

const slotPercent = computed(() => {
  const inv = props.inventory
  if (!inv || inv.maxSlots <= 0) return 0
  return Math.min(100, (inv.stacks.length / inv.maxSlots) * 100)
})

const runGains = computed(() => props.runGainsThisSortie ?? {})

const rows = computed<DisplayRow[]>(() => {
  if (!props.inventory) return []
  return props.inventory.stacks.map((stack: InventoryStack) => {
    const def = getItemDefinition(stack.itemId)
    const split = clamp(splitQty.value[stack.itemId] ?? 1, 1, stack.quantity)
    const runGainThisSortie = Math.max(0, Math.floor(runGains.value[stack.itemId] ?? 0))
    return {
      itemId: stack.itemId,
      label: def?.label ?? stack.itemId,
      category: def?.category ?? 'other',
      quantity: stack.quantity,
      weightPerUnit: def?.weightPerUnit ?? 0,
      totalWeightKg: stack.totalWeightKg,
      splitQty: split,
      partialWeight: split * (def?.weightPerUnit ?? 0),
      unitNoun: stack.quantity === 1 ? 'unit' : 'units',
      runGainThisSortie,
    }
  })
})

watch(
  () => props.inventory,
  (inv) => {
    if (!inv) {
      splitQty.value = {}
      return
    }
    const next: Record<string, number> = {}
    for (const stack of inv.stacks) {
      const previous = splitQty.value[stack.itemId] ?? 1
      next[stack.itemId] = clamp(previous, 1, stack.quantity)
    }
    splitQty.value = next
  },
  { immediate: true },
)

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function setSplit(itemId: string, raw: number, max: number): void {
  splitQty.value = { ...splitQty.value, [itemId]: clamp(raw, 1, max) }
}

function jettisonSplit(row: DisplayRow): void {
  if (row.splitQty <= 0) return
  emit('jettison', row.itemId, row.splitQty)
}

function jettisonAll(row: DisplayRow): void {
  emit('jettison', row.itemId, row.quantity)
}

function handleBackdropClick(event: MouseEvent): void {
  if (event.target === event.currentTarget) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="inventory-panel-fade">
      <div v-if="open" class="inventory-panel-overlay" @click="handleBackdropClick">
        <div
          class="inventory-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="inventory-panel-title"
        >
          <header class="inventory-panel__header">
            <div>
              <h2 id="inventory-panel-title" class="inventory-panel__title">CARGO HOLD</h2>
              <p class="inventory-panel__subtitle">
                <span class="inventory-panel__sortie-hint">THIS SORTIE</span> · badges show cargo
                gained since drop or last restart
              </p>
              <p class="inventory-panel__subtitle inventory-panel__subtitle--keys">
                Press <kbd>B</kbd> or <kbd>Esc</kbd> to close
              </p>
            </div>
            <button
              type="button"
              class="inventory-panel__close"
              aria-label="Close inventory"
              @click="emit('close')"
            >
              &times;
            </button>
          </header>

          <section class="inventory-panel__summary" v-if="inventory">
            <div class="inventory-panel__gauge">
              <div class="inventory-panel__gauge-row">
                <span class="inventory-panel__gauge-label">MASS</span>
                <span class="inventory-panel__gauge-value">
                  {{ totalWeight.toFixed(0) }} / {{ inventory.maxWeightKg.toFixed(0) }} KG
                </span>
              </div>
              <div class="inventory-panel__gauge-track">
                <span
                  class="inventory-panel__gauge-fill"
                  :class="{
                    'inventory-panel__gauge-fill--warn': weightPercent >= 80,
                    'inventory-panel__gauge-fill--danger': weightPercent >= 95,
                  }"
                  :style="{ width: `${weightPercent}%` }"
                />
              </div>
            </div>
            <div class="inventory-panel__gauge">
              <div class="inventory-panel__gauge-row">
                <span class="inventory-panel__gauge-label">SLOTS</span>
                <span class="inventory-panel__gauge-value">
                  {{ inventory.stacks.length }} / {{ inventory.maxSlots }}
                </span>
              </div>
              <div class="inventory-panel__gauge-track">
                <span
                  class="inventory-panel__gauge-fill"
                  :class="{
                    'inventory-panel__gauge-fill--warn': slotPercent >= 80,
                    'inventory-panel__gauge-fill--danger': slotPercent >= 100,
                  }"
                  :style="{ width: `${slotPercent}%` }"
                />
              </div>
            </div>
          </section>

          <section class="inventory-panel__body">
            <p v-if="rows.length === 0" class="inventory-panel__empty">CARGO HOLD EMPTY</p>
            <ul v-else class="inventory-panel__list" role="list">
              <li v-for="row in rows" :key="row.itemId" class="inventory-panel__row">
                <div class="inventory-panel__icon" aria-hidden="true">
                  {{ row.label.charAt(0) }}
                </div>
                <div class="inventory-panel__info">
                  <div class="inventory-panel__name">{{ row.label }}</div>
                  <div class="inventory-panel__meta">
                    {{ row.quantity }} {{ row.unitNoun }} &middot;
                    {{ row.totalWeightKg.toFixed(0) }} kg &middot;
                    <span class="inventory-panel__category">{{ row.category }}</span>
                    <span
                      v-if="row.runGainThisSortie > 0"
                      class="inventory-panel__run-gain"
                      :title="`+${row.runGainThisSortie} collected this sortie`"
                    >
                      &middot; +{{ row.runGainThisSortie }} sortie
                    </span>
                  </div>
                </div>
                <div class="inventory-panel__split">
                  <label class="inventory-panel__split-label" :for="`split-${row.itemId}`">
                    SPLIT
                  </label>
                  <input
                    :id="`split-${row.itemId}`"
                    type="range"
                    class="inventory-panel__slider"
                    :min="1"
                    :max="row.quantity"
                    :step="1"
                    :value="row.splitQty"
                    :disabled="row.quantity <= 1"
                    @input="
                      (e) =>
                        setSplit(
                          row.itemId,
                          Number((e.target as HTMLInputElement).value),
                          row.quantity,
                        )
                    "
                  />
                  <input
                    type="number"
                    class="inventory-panel__split-input"
                    :min="1"
                    :max="row.quantity"
                    :value="row.splitQty"
                    @input="
                      (e) =>
                        setSplit(
                          row.itemId,
                          Number((e.target as HTMLInputElement).value),
                          row.quantity,
                        )
                    "
                  />
                </div>
                <div class="inventory-panel__actions">
                  <button
                    type="button"
                    class="inventory-panel__btn inventory-panel__btn--ghost"
                    :disabled="row.quantity <= 0"
                    :title="`Jettison ${row.splitQty} ${row.label} (${row.partialWeight.toFixed(0)} kg)`"
                    @click="jettisonSplit(row)"
                  >
                    JETTISON {{ row.splitQty }}
                  </button>
                  <button
                    type="button"
                    class="inventory-panel__btn inventory-panel__btn--danger"
                    :title="`Jettison the entire stack (${row.totalWeightKg.toFixed(0)} kg)`"
                    @click="jettisonAll(row)"
                  >
                    DUMP STACK
                  </button>
                </div>
              </li>
            </ul>
          </section>

          <footer class="inventory-panel__footer">
            <span class="inventory-panel__hint">
              Jettisoned items are vented into space. They cannot be recovered.
            </span>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.inventory-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(2, 6, 12, 0.78);
  display: flex;
  justify-content: center;
  align-items: center;
  font-family: 'Datatype', ui-monospace, monospace;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.inventory-panel {
  width: min(720px, 92vw);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, rgba(8, 16, 24, 0.95), rgba(2, 8, 14, 0.95));
  border: 1px solid rgba(102, 255, 238, 0.45);
  box-shadow:
    0 0 24px rgba(102, 255, 238, 0.18),
    inset 0 0 18px rgba(102, 255, 238, 0.06);
  color: #cffaf0;
  letter-spacing: 0.08em;
  overflow: hidden;
}

.inventory-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid rgba(102, 255, 238, 0.25);
  background: rgba(0, 12, 20, 0.6);
}
.inventory-panel__title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: 0.22em;
  color: rgba(102, 255, 238, 0.95);
}
.inventory-panel__subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.7rem;
  text-transform: uppercase;
  color: rgba(178, 220, 230, 0.7);
}
.inventory-panel__subtitle--keys {
  margin-top: 0.15rem;
}
.inventory-panel__sortie-hint {
  color: rgba(102, 255, 238, 0.95);
  letter-spacing: 0.14em;
}
.inventory-panel__run-gain {
  color: rgba(170, 220, 255, 0.95);
  font-variant-numeric: tabular-nums;
}
.inventory-panel__subtitle kbd {
  display: inline-block;
  padding: 0 0.35rem;
  margin: 0 0.1rem;
  border: 1px solid rgba(102, 255, 238, 0.4);
  background: rgba(0, 12, 20, 0.6);
  border-radius: 2px;
  font-family: inherit;
  font-size: 0.7rem;
  color: rgba(102, 255, 238, 0.9);
}
.inventory-panel__close {
  background: none;
  border: 1px solid rgba(102, 255, 238, 0.4);
  color: rgba(102, 255, 238, 0.9);
  font-size: 1.4rem;
  width: 2rem;
  height: 2rem;
  cursor: pointer;
  line-height: 1;
}
.inventory-panel__close:hover {
  background: rgba(102, 255, 238, 0.12);
}

.inventory-panel__summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  padding: 0.9rem 1.25rem;
  border-bottom: 1px solid rgba(102, 255, 238, 0.15);
}
.inventory-panel__gauge-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.3rem;
}
.inventory-panel__gauge-label {
  font-size: 0.7rem;
  color: rgba(178, 220, 230, 0.75);
  letter-spacing: 0.18em;
}
.inventory-panel__gauge-value {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.95);
  font-variant-numeric: tabular-nums;
}
.inventory-panel__gauge-track {
  height: 8px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(102, 255, 238, 0.25);
}
.inventory-panel__gauge-fill {
  display: block;
  height: 100%;
  background: rgba(102, 255, 238, 0.85);
  transition: width 0.2s ease;
}
.inventory-panel__gauge-fill--warn {
  background: rgba(255, 209, 102, 0.9);
}
.inventory-panel__gauge-fill--danger {
  background: rgba(255, 107, 107, 0.95);
}

.inventory-panel__body {
  flex: 1;
  overflow-y: auto;
  padding: 0.6rem 1.25rem 1rem;
}
.inventory-panel__empty {
  padding: 2.5rem 0;
  text-align: center;
  color: rgba(178, 220, 230, 0.55);
  font-size: 1rem;
  letter-spacing: 0.32em;
}
.inventory-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.inventory-panel__row {
  display: grid;
  grid-template-columns: 2.4rem 1fr minmax(180px, 1.2fr) auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0.7rem;
  background: rgba(8, 16, 22, 0.55);
  border: 1px solid rgba(102, 255, 238, 0.18);
}
.inventory-panel__icon {
  width: 2.4rem;
  height: 2.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  font-weight: 600;
  color: rgba(102, 255, 238, 0.95);
  background: rgba(0, 12, 20, 0.6);
  border: 1px solid rgba(102, 255, 238, 0.32);
}
.inventory-panel__info {
  min-width: 0;
}
.inventory-panel__name {
  font-size: 0.95rem;
  letter-spacing: 0.18em;
  color: rgba(255, 255, 255, 0.95);
  text-transform: uppercase;
}
.inventory-panel__meta {
  font-size: 0.7rem;
  color: rgba(178, 220, 230, 0.7);
  letter-spacing: 0.12em;
}
.inventory-panel__category {
  text-transform: uppercase;
}
.inventory-panel__split {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.inventory-panel__split-label {
  font-size: 0.6rem;
  letter-spacing: 0.2em;
  color: rgba(178, 220, 230, 0.7);
}
.inventory-panel__slider {
  flex: 1;
  accent-color: rgba(102, 255, 238, 0.95);
  min-width: 60px;
}
.inventory-panel__split-input {
  width: 4.4rem;
  padding: 0.2rem 0.35rem;
  background: rgba(0, 12, 20, 0.6);
  border: 1px solid rgba(102, 255, 238, 0.35);
  color: #cffaf0;
  font-family: inherit;
  font-size: 0.8rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.inventory-panel__split-input:focus,
.inventory-panel__slider:focus {
  outline: 1px solid rgba(102, 255, 238, 0.7);
  outline-offset: 1px;
}
.inventory-panel__actions {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.inventory-panel__btn {
  font-family: inherit;
  font-size: 0.7rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 0.32rem 0.7rem;
  cursor: pointer;
  background: rgba(0, 12, 20, 0.7);
  border: 1px solid rgba(102, 255, 238, 0.45);
  color: rgba(102, 255, 238, 0.95);
  transition: background 0.15s ease;
}
.inventory-panel__btn:hover:not(:disabled) {
  background: rgba(102, 255, 238, 0.14);
}
.inventory-panel__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.inventory-panel__btn--danger {
  border-color: rgba(255, 107, 107, 0.55);
  color: rgba(255, 170, 170, 0.95);
}
.inventory-panel__btn--danger:hover:not(:disabled) {
  background: rgba(255, 107, 107, 0.16);
}

.inventory-panel__footer {
  padding: 0.65rem 1.25rem;
  border-top: 1px solid rgba(102, 255, 238, 0.18);
  background: rgba(0, 12, 20, 0.6);
}
.inventory-panel__hint {
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  color: rgba(178, 220, 230, 0.65);
}

.inventory-panel-fade-enter-active,
.inventory-panel-fade-leave-active {
  transition: opacity 0.2s ease;
}
.inventory-panel-fade-enter-from,
.inventory-panel-fade-leave-to {
  opacity: 0;
}

@media (max-width: 540px) {
  .inventory-panel__row {
    grid-template-columns: 2rem 1fr;
    grid-template-rows: auto auto auto;
  }
  .inventory-panel__split {
    grid-column: 1 / -1;
  }
  .inventory-panel__actions {
    grid-column: 1 / -1;
    flex-direction: row;
  }
  .inventory-panel__summary {
    grid-template-columns: 1fr;
  }
}
</style>
