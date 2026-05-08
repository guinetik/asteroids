<!-- src/components/KeybindingsDialog.vue -->
<script setup lang="ts">
/**
 * Read-only keybindings reference dialog shared by the map and level screens.
 *
 * @author guinetik
 * @date 2026-05-08
 * @spec docs/superpowers/specs/2026-05-08-keybindings-overlay-design.md
 */
import { computed, onUnmounted, watch } from 'vue'
import {
  getKeybindingScreenReference,
  type KeybindingScreenId,
} from '@/lib/ui/keybindingReference'

const props = defineProps<{
  /** Whether the dialog is visible. */
  open: boolean
  /** Screen configuration to show, for example `map` or `level`. */
  screen: KeybindingScreenId
}>()

const emit = defineEmits<{
  close: []
}>()

const reference = computed(() => getKeybindingScreenReference(props.screen))
const titleId = computed(() => `keybindings-dialog-${reference.value.id}-title`)
const ESCAPE_KEY = 'Escape'

/** Emit the close event for parent-owned dialog state. */
function emitClose(): void {
  emit('close')
}

/**
 * Close when the player clicks the backdrop rather than the dialog card.
 *
 * @param event - Mouse event from the overlay backdrop.
 */
function handleBackdropClick(event: MouseEvent): void {
  if (event.target === event.currentTarget) emitClose()
}

/**
 * Close the dialog on Escape while it is open.
 *
 * @param event - Keyboard event from the window.
 */
function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.code !== ESCAPE_KEY && event.key !== ESCAPE_KEY) return
  event.preventDefault()
  emitClose()
}

const windowKeydownListener: EventListener = (event) => {
  handleWindowKeydown(event as KeyboardEvent)
}

/** Attach or detach the Escape listener to avoid intercepting gameplay keys while closed. */
function syncKeydownListener(isOpen: boolean): void {
  if (isOpen) {
    window.addEventListener('keydown', windowKeydownListener, true)
    return
  }
  window.removeEventListener('keydown', windowKeydownListener, true)
}

watch(
  () => props.open,
  (isOpen) => {
    syncKeydownListener(isOpen)
  },
  { immediate: true },
)

onUnmounted(() => {
  syncKeydownListener(false)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="keybindings-dialog-fade">
      <div v-if="open" class="keybindings-dialog-overlay" @click="handleBackdropClick">
        <div
          class="keybindings-dialog"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
        >
          <header class="keybindings-dialog__header">
            <div>
              <p class="keybindings-dialog__eyebrow">REFERENCE</p>
              <h2 :id="titleId" class="keybindings-dialog__title">{{ reference.title }}</h2>
              <p class="keybindings-dialog__summary">{{ reference.description }}</p>
              <p class="keybindings-dialog__keys">Press <kbd>Esc</kbd> to close</p>
            </div>
            <button
              type="button"
              class="keybindings-dialog__close"
              aria-label="Close keybindings"
              @click="emitClose"
            >
              &times;
            </button>
          </header>

          <div class="keybindings-dialog__body">
            <section
              v-for="mode in reference.modes"
              :key="mode.id"
              class="keybindings-dialog__mode"
            >
              <div class="keybindings-dialog__mode-header">
                <h3 class="keybindings-dialog__mode-title">{{ mode.title }}</h3>
                <p class="keybindings-dialog__mode-description">{{ mode.description }}</p>
              </div>
              <ul class="keybindings-dialog__list" role="list">
                <li v-for="row in mode.rows" :key="row.action" class="keybindings-dialog__row">
                  <div class="keybindings-dialog__action">
                    <span class="keybindings-dialog__action-label">{{ row.action }}</span>
                    <span v-if="row.hint" class="keybindings-dialog__hint">{{ row.hint }}</span>
                  </div>
                  <div class="keybindings-dialog__key-list" aria-label="Keys">
                    <kbd
                      v-for="key in row.keys"
                      :key="`${row.action}-${key}`"
                      class="keybindings-dialog__key"
                    >
                      {{ key }}
                    </kbd>
                    <span v-if="row.keys.length === 0" class="keybindings-dialog__unbound">
                      Unbound
                    </span>
                  </div>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.keybindings-dialog-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
  background:
    radial-gradient(circle at 18% 12%, rgba(34, 211, 238, 0.16), transparent 28%),
    rgba(0, 8, 14, 0.78);
  backdrop-filter: blur(10px);
  z-index: 170;
}

.keybindings-dialog {
  width: min(920px, 100%);
  max-height: calc(100vh - 28px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(103, 232, 249, 0.22);
  border-radius: 18px;
  background:
    linear-gradient(135deg, rgba(8, 47, 73, 0.94), rgba(2, 6, 23, 0.985) 48%),
    radial-gradient(circle at top right, rgba(14, 165, 233, 0.22), transparent 36%);
  box-shadow:
    0 0 0 1px rgba(34, 211, 238, 0.08),
    0 28px 80px rgba(0, 0, 0, 0.58);
  color: rgba(224, 242, 254, 0.96);
}

.keybindings-dialog__header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 20px 12px;
  border-bottom: 1px solid rgba(125, 211, 252, 0.16);
}

.keybindings-dialog__eyebrow {
  margin: 0 0 6px;
  color: rgba(103, 232, 249, 0.78);
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.72rem;
  letter-spacing: 0.28em;
}

.keybindings-dialog__title {
  margin: 0;
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: clamp(1.25rem, 2.4vw, 2rem);
  letter-spacing: 0.18em;
}

.keybindings-dialog__summary,
.keybindings-dialog__keys,
.keybindings-dialog__mode-description,
.keybindings-dialog__hint {
  color: rgba(186, 230, 253, 0.72);
}

.keybindings-dialog__summary {
  margin: 6px 0 0;
  font-size: 0.86rem;
}

.keybindings-dialog__keys {
  margin: 7px 0 0;
  font-size: 0.76rem;
}

.keybindings-dialog__keys kbd {
  border: 1px solid rgba(103, 232, 249, 0.35);
  border-radius: 4px;
  padding: 1px 6px;
  color: rgba(224, 242, 254, 0.94);
  font-family: 'Datatype', ui-monospace, monospace;
}

.keybindings-dialog__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.15rem;
  height: 2.15rem;
  border: 1px solid rgba(125, 211, 252, 0.24);
  border-radius: 9999px;
  background: rgba(15, 23, 42, 0.58);
  color: rgba(224, 242, 254, 0.88);
  cursor: pointer;
  font-size: 1.6rem;
  line-height: 1;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}

.keybindings-dialog__close:hover {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.5);
  background: rgba(8, 47, 73, 0.86);
  color: white;
}

.keybindings-dialog__body {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  overflow: visible;
  padding: 14px 20px 16px;
}

.keybindings-dialog__mode {
  min-width: 0;
  border: 1px solid rgba(125, 211, 252, 0.14);
  border-radius: 14px;
  background: rgba(2, 6, 23, 0.42);
  overflow: hidden;
}

.keybindings-dialog__mode-header {
  padding: 10px 12px 9px;
  border-bottom: 1px solid rgba(125, 211, 252, 0.12);
  background: rgba(14, 165, 233, 0.08);
}

.keybindings-dialog__mode-title {
  margin: 0;
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.88rem;
  letter-spacing: 0.16em;
}

.keybindings-dialog__mode-description {
  margin: 6px 0 0;
  font-size: 0.72rem;
  line-height: 1.35;
}

.keybindings-dialog__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.keybindings-dialog__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  border-bottom: 1px solid rgba(125, 211, 252, 0.08);
}

.keybindings-dialog__row:last-child {
  border-bottom: 0;
}

.keybindings-dialog__action {
  min-width: 0;
}

.keybindings-dialog__action-label {
  display: block;
  color: rgba(240, 249, 255, 0.94);
  font-size: 0.78rem;
}

.keybindings-dialog__hint {
  display: block;
  margin-top: 2px;
  font-size: 0.66rem;
}

.keybindings-dialog__key-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
}

.keybindings-dialog__key,
.keybindings-dialog__unbound {
  min-width: 1.65rem;
  border: 1px solid rgba(103, 232, 249, 0.35);
  border-radius: 6px;
  padding: 3px 6px;
  background: rgba(8, 47, 73, 0.72);
  color: rgba(207, 250, 254, 0.98);
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.68rem;
  text-align: center;
  box-shadow: inset 0 -1px 0 rgba(2, 6, 23, 0.65);
}

.keybindings-dialog__unbound {
  color: rgba(186, 230, 253, 0.55);
}

.keybindings-dialog-fade-enter-active,
.keybindings-dialog-fade-leave-active {
  transition: opacity 0.18s ease;
}

.keybindings-dialog-fade-enter-active .keybindings-dialog,
.keybindings-dialog-fade-leave-active .keybindings-dialog {
  transition: transform 0.18s ease;
}

.keybindings-dialog-fade-enter-from,
.keybindings-dialog-fade-leave-to {
  opacity: 0;
}

.keybindings-dialog-fade-enter-from .keybindings-dialog,
.keybindings-dialog-fade-leave-to .keybindings-dialog {
  transform: translateY(10px) scale(0.98);
}

@media (max-width: 760px) {
  .keybindings-dialog-overlay {
    align-items: stretch;
    padding: 12px;
  }

  .keybindings-dialog {
    max-height: none;
  }

  .keybindings-dialog__header {
    padding: 18px;
  }

  .keybindings-dialog__body {
    grid-template-columns: 1fr;
    padding: 16px;
  }
}
</style>
