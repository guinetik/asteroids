<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import KeyPrompt from '@/components/KeyPrompt.vue'
import FpsHud from '@/components/FpsHud.vue'
import DamageFeedback from '@/components/DamageFeedback.vue'
import DeathOverlay from '@/components/DeathOverlay.vue'
import PickupToast from '@/components/PickupToast.vue'
import type { PickupEntry } from '@/components/PickupToast.vue'
import type { FpsTelemetry } from '@/lib/ui/fpsHudTypes'
import type { Inventory } from '@/lib/inventory/types'
import { parseKeyPrompt } from '@/lib/ui/parseKeyPrompt'
import { Timer } from '@/lib/Timer'
import { uiAudio } from '@/audio/UiAudioDirector'
import { addItem } from '@/lib/inventory/inventory'
import { loadInventory, saveInventory } from '@/lib/inventory/inventoryStorage'
import { getItemDefinition } from '@/lib/inventory/catalog'
// Side-effect import: registers trade-good item definitions (Heat-Resistant
// Alloys, Solar Panels, etc.) into the catalog so the chest loot resolves.
import '@/lib/shop/tradeGoods'
import type { PropInteractorMeta } from '@/three/stationProps'
import { StationViewController } from './StationViewController'

const DEFAULT_STATION_ID = 'yamada-titania'
/** Pickup toast lifetime — long enough to register without lingering. */
const PICKUP_LIFETIME_SEC = 2.4

const container = ref<HTMLElement | null>(null)
const controller = new StationViewController()
const route = useRoute()
const router = useRouter()
const promptText = ref<string | null>(null)
const parsedPrompt = computed(() =>
  promptText.value ? parseKeyPrompt(promptText.value) : null,
)

/**
 * One-shot buffs and looted items the player has earned this station
 * run. Keycard is a `quantity = null` entry; chest loot carries the
 * concrete quantity granted to the shuttle inventory.
 */
const buffs = ref<
  Array<{
    id: string
    itemId: string
    label: string
    iconUrl: string
    quantity: number | null
  }>
>([])

/**
 * Preview of the chest the player is currently looking at — drives the
 * "DRILLBITS x 20" callout that floats above the F prompt.
 */
const chestPreview = ref<{
  itemId: string
  label: string
  iconUrl: string
  quantity: number
  cannotCarry: boolean
} | null>(null)

/** Last-resort warning shown when the player tries to loot a full inventory. */
const inventoryFullWarning = ref<{ id: number; label: string } | null>(null)
let inventoryFullTimer: ReturnType<typeof Timer.after> | null = null
let inventoryFullSeq = 0

/** Active pickup toasts. Each gets its own auto-removal timer. */
const pickups = ref<PickupEntry[]>([])
const pickupTimers = new Map<string, ReturnType<typeof Timer.after>>()
let pickupSeq = 0

/**
 * Push a one-shot pickup toast that auto-removes after
 * {@link PICKUP_LIFETIME_SEC}.
 *
 * @param itemId - Catalog item id (e.g. `'keycard'`).
 * @param label - Display label shown in the toast.
 */
function recordPickup(itemId: string, label: string): void {
  pickupSeq += 1
  const entry: PickupEntry = {
    id: `pickup-${pickupSeq}`,
    itemId,
    label,
    quantity: 1,
    pulse: 0,
  }
  pickups.value.push(entry)
  const handle = Timer.after(PICKUP_LIFETIME_SEC, () => {
    const idx = pickups.value.findIndex((p) => p.id === entry.id)
    if (idx >= 0) pickups.value.splice(idx, 1)
    pickupTimers.delete(entry.id)
  })
  pickupTimers.set(entry.id, handle)
}

/**
 * Resolve the public asset URL for an inventory item icon. Falls back
 * to the catalog `icon` filename when present, otherwise to a `<itemId>.webp`
 * convention used by the keycard buff.
 *
 * @param itemId - Catalog item id.
 * @returns Absolute URL relative to the site root.
 */
function resolveItemIconUrl(itemId: string): string {
  const def = getItemDefinition(itemId)
  const filename = def?.icon ?? `${itemId}.webp`
  return `/items/${filename}`
}

/**
 * Resolve a display label for an inventory item, preferring the catalog
 * entry and falling back to the raw id when the item is bespoke
 * (e.g. `'keycard'`).
 *
 * @param itemId - Catalog item id.
 * @param fallback - Label to use if the catalog has no entry.
 * @returns Human-readable label suitable for the buff rack.
 */
function resolveItemLabel(itemId: string, fallback: string): string {
  const def = getItemDefinition(itemId)
  return def?.label ?? fallback
}

/**
 * Push a persistent badge to the bottom-left rack. Keycards and other
 * non-stacking buffs pass `quantity = null`; chest loot passes a real
 * quantity that stacks across multiple loots of the same item.
 *
 * @param itemId - Catalog item id used to resolve the icon URL.
 * @param label - Display label.
 * @param quantity - Number granted, or `null` for non-stacking buffs.
 */
function grantBuff(itemId: string, label: string, quantity: number | null = null): void {
  const iconUrl = resolveItemIconUrl(itemId)
  const existing = buffs.value.find((b) => b.itemId === itemId)
  if (existing) {
    if (quantity !== null && existing.quantity !== null) {
      existing.quantity += quantity
    }
    return
  }
  buffs.value.push({
    id: `${itemId}-${buffs.value.length}`,
    itemId,
    label,
    iconUrl,
    quantity,
  })
}

/**
 * Surface a transient "INVENTORY FULL" banner for a few seconds.
 *
 * @param label - Item label that failed to fit (e.g. `'Olivine'`).
 */
function flashInventoryFull(label: string): void {
  inventoryFullSeq += 1
  const id = inventoryFullSeq
  inventoryFullWarning.value = { id, label }
  if (inventoryFullTimer) Timer.cancel(inventoryFullTimer)
  inventoryFullTimer = Timer.after(2.4, () => {
    if (inventoryFullWarning.value?.id === id) inventoryFullWarning.value = null
    inventoryFullTimer = null
  })
}

/**
 * Test whether the shuttle inventory can absorb a loot bundle. Mirrors
 * the precondition path inside {@link addItem} so we don't have to
 * speculatively commit before showing the chest preview.
 */
function canAcceptLoot(itemId: string, quantity: number): boolean {
  const inv = loadInventory()
  if (!inv) return false
  const result = addItem(inv, itemId, quantity)
  return result.ok
}

/**
 * Live FPS telemetry mirror for the HUD (HP / O2 / STA bars). The
 * controller pushes a fresh snapshot each tick; we `Object.assign` into
 * a single reactive instance so Vue can diff the bars without
 * re-creating the object every frame.
 */
const fpsTelemetry = reactive<FpsTelemetry>({
  hp: 100,
  maxHp: 100,
  o2Level: 100,
  o2Capacity: 100,
  sprintCharge: 50,
  sprintCapacity: 50,
  speed: 0,
  grounded: true,
  activeMode: 'science',
  aiming: false,
  isFiring: false,
  rtgLevel: 0,
  rtgCapacity: 0,
  modeCharge: 0,
  modeCapacity: 0,
  headingRad: 0,
  objectives: [],
})

controller.onFpsTelemetry = (t) => {
  Object.assign(fpsTelemetry, t)
}

/** Red-vignette opacity driven by the controller's damage timer. */
const damageFlash = ref(0)
/** Black death-fade opacity driven by the controller's death timer. */
const deathFade = ref(0)
/** True once the YOU DIED message + REWIND overlay should be visible. */
const deathMessageVisible = ref(false)
/** Shuttle inventory snapshot taken on station mount; restored on death. */
let inventorySnapshot: Inventory | null = null

controller.onDamageFlash = (opacity) => {
  damageFlash.value = opacity
}
controller.onDeathFade = (opacity) => {
  deathFade.value = opacity
}
controller.onDeathMessage = (visible) => {
  deathMessageVisible.value = visible
  if (visible && typeof document !== 'undefined' && document.pointerLockElement) {
    // Pop the cursor out once the REWIND button shows so it's clickable.
    document.exitPointerLock()
  }
}
controller.onPlayerDeath = () => {
  // Pop the cursor immediately so the cinematic isn't fighting for input.
  if (typeof document !== 'undefined' && document.pointerLockElement) {
    document.exitPointerLock()
  }
}

/**
 * Death-restart handler. Restores the shuttle inventory to the
 * pre-station snapshot (so any chests looted this run are forfeited),
 * clears in-run buffs, and tells the controller to refill HP and
 * teleport the player back to spawn.
 */
function handleRestart(): void {
  if (inventorySnapshot) {
    saveInventory(inventorySnapshot)
  }
  buffs.value = []
  hasVaultKeycard.value = false
  pickups.value = []
  chestPreview.value = null
  inventoryFullWarning.value = null
  deathMessageVisible.value = false
  deathFade.value = 0
  damageFlash.value = 0
  controller.restart()
}

controller.onPrompt = (prompt) => {
  promptText.value = prompt
}

controller.onActiveInteractorMeta = (meta) => {
  chestPreview.value = resolveChestPreview(meta)
}

/**
 * Map raw interactor metadata to the floating "DRILLBITS x 20" preview
 * shown above the F prompt. Returns `null` for non-loot metadata so the
 * preview hides automatically.
 *
 * @param meta - Current active-interactor metadata, or `null`.
 * @returns Preview state for the chest HUD, or `null` to hide it.
 */
function resolveChestPreview(
  meta: PropInteractorMeta | null,
): typeof chestPreview.value | null {
  if (!meta || meta.kind !== 'loot') return null
  const label = resolveItemLabel(meta.itemId, meta.itemId)
  return {
    itemId: meta.itemId,
    label,
    iconUrl: resolveItemIconUrl(meta.itemId),
    quantity: meta.quantity,
    cannotCarry: !canAcceptLoot(meta.itemId, meta.quantity),
  }
}

/** Whether the player currently holds the vault keycard. */
const hasVaultKeycard = ref(false)

/**
 * Remove a buff badge by item id. No-op when the buff is not present.
 *
 * @param itemId - Catalog id to drop from the buff rack.
 */
function dropBuff(itemId: string): void {
  buffs.value = buffs.value.filter((b) => b.itemId !== itemId)
}

controller.onInteract = (event) => {
  if (event === 'station:exit') {
    void router.push('/')
    return
  }
  if (event === 'terminal:use:r-microwave') {
    controller.consumeInteractor(event, 'success')
    grantBuff('keycard', 'Vault Keycard')
    recordPickup('keycard', 'Vault Keycard')
    uiAudio.notifyItemCollected()
    hasVaultKeycard.value = true
    // Swap the vault door's locked prompt so the player sees an unlock
    // affordance the next time they approach it.
    const vault = controller.findEntrance('enter:r-vault')
    if (vault) vault.lockedPrompt = 'F  Unlock Vault'
    return
  }
  if (event === 'enter:r-vault' && hasVaultKeycard.value) {
    // Locked-press path: consume keycard, unlock + open the door.
    hasVaultKeycard.value = false
    dropBuff('keycard')
    uiAudio.notifyItemCollected()
    controller.unlockAndOpenEntrance(event)
    return
  }
  if (event.startsWith('chest:open:')) {
    handleChestOpen(event)
    return
  }
}

/**
 * Try to absorb a chest's loot into the shuttle inventory. On success
 * the chest is consumed (opened visual, prompt removed), the loot is
 * persisted, and the player sees a pickup toast + run badge. On
 * inventory-full the chest is left intact so the player can come back
 * after jettisoning cargo elsewhere.
 *
 * @param event - The chest's interactor event id.
 */
function handleChestOpen(event: string): void {
  const interactor = controller.findInteractorByEvent(event)
  const meta = interactor?.meta
  if (!meta || meta.kind !== 'loot') return
  const label = resolveItemLabel(meta.itemId, meta.itemId)

  const inv = loadInventory()
  if (!inv) {
    flashInventoryFull(label)
    return
  }
  const result = addItem(inv, meta.itemId, meta.quantity)
  if (!result.ok) {
    flashInventoryFull(label)
    return
  }

  saveInventory(result.inventory)
  controller.consumeInteractor(event, 'success')
  grantBuff(meta.itemId, label, meta.quantity)
  recordPickup(meta.itemId, label)
  uiAudio.notifyItemCollected()
  chestPreview.value = null
}

onMounted(async () => {
  if (!container.value) return
  // Snapshot the shuttle inventory before we touch anything. On death we
  // roll back to this so the run's loot is forfeit.
  inventorySnapshot = loadInventory()
  const raw = route.query.station
  const stationId = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
  const resolved = stationId ? String(stationId) : DEFAULT_STATION_ID
  await controller.init(container.value, resolved, router)
  if (typeof window !== 'undefined' && window.Prelude) {
    if (window.Prelude.isActive?.()) {
      window.Prelude.ready()
    } else {
      window.dispatchEvent(new Event('prelude-play'))
    }
  }
})

onBeforeUnmount(() => {
  for (const handle of pickupTimers.values()) Timer.cancel(handle)
  pickupTimers.clear()
  controller.dispose()
})

function onPointerDown(): void {
  controller.requestPointerLock()
}
</script>

<template>
  <div ref="container" class="station-view" @pointerdown="onPointerDown" />
  <div class="helmet-visor" />
  <KeyPrompt
    v-if="parsedPrompt"
    :key-label="parsedPrompt.key"
    :action="parsedPrompt.label"
    tone="cyan"
    position="bottom-mid"
  />
  <FpsHud :telemetry="fpsTelemetry" variant="station" hide-movement-readout />
  <DamageFeedback :flash-opacity="damageFlash" />
  <div v-if="deathFade > 0" class="station-death-fade" :style="{ opacity: deathFade }" />
  <div v-if="deathMessageVisible" class="station-death-message">
    <span class="station-death-message__text">YOU DIED</span>
  </div>
  <DeathOverlay :visible="deathMessageVisible" cause="STATION HAZARD" @restart="handleRestart" />
  <PickupToast :pickups="pickups" />
  <div v-if="chestPreview" class="station-chest-preview" :class="{ 'station-chest-preview--blocked': chestPreview.cannotCarry }">
    <img :src="chestPreview.iconUrl" :alt="chestPreview.label" class="station-chest-preview__icon" />
    <div class="station-chest-preview__text">
      <span class="station-chest-preview__label">{{ chestPreview.label }}</span>
      <span class="station-chest-preview__qty">x {{ chestPreview.quantity }}</span>
    </div>
    <span v-if="chestPreview.cannotCarry" class="station-chest-preview__warn">CARGO FULL</span>
  </div>
  <transition name="pickup-failed">
    <div v-if="inventoryFullWarning" :key="inventoryFullWarning.id" class="station-cargo-full" role="status">
      <span class="station-cargo-full__head">CARGO FULL</span>
      <span class="station-cargo-full__body">Cannot take {{ inventoryFullWarning.label }}</span>
    </div>
  </transition>
  <div v-if="buffs.length > 0" class="station-buff-rack" aria-label="Active buffs">
    <div v-for="buff in buffs" :key="buff.id" class="station-buff" :title="buff.label">
      <img :src="buff.iconUrl" :alt="buff.label" class="station-buff__icon" />
      <span class="station-buff__label">
        {{ buff.label }}<template v-if="buff.quantity !== null"> · {{ buff.quantity }}</template>
      </span>
    </div>
  </div>
</template>

<style>
.station-buff-rack {
  position: fixed;
  bottom: max(1rem, env(safe-area-inset-bottom, 0px) + 0.5rem);
  left: max(1rem, env(safe-area-inset-left, 0px) + 0.5rem);
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  pointer-events: none;
}
.station-buff {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0.6rem 0.8rem 0.5rem;
  background: rgba(2, 6, 23, 0.78);
  border: 1px solid rgba(102, 255, 238, 0.55);
  border-radius: 0.4rem;
  font-family: 'Datatype', ui-monospace, monospace;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(186, 230, 253, 0.92);
  box-shadow:
    0 0 16px rgba(102, 255, 238, 0.18),
    inset 0 0 8px rgba(102, 255, 238, 0.08);
}
.station-buff__icon {
  width: 6.5rem;
  height: 6.5rem;
  object-fit: contain;
  filter: drop-shadow(0 0 6px rgba(102, 255, 238, 0.45));
}
.station-buff__label {
  font-size: 0.78rem;
  color: rgba(102, 255, 238, 0.95);
  text-align: center;
}

.station-chest-preview {
  position: fixed;
  left: 50%;
  bottom: 18%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.55rem 1.1rem 0.55rem 0.55rem;
  background: rgba(2, 6, 23, 0.82);
  border: 1px solid rgba(255, 196, 102, 0.6);
  border-radius: 0.5rem;
  font-family: 'Datatype', ui-monospace, monospace;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(255, 236, 196, 0.95);
  box-shadow:
    0 0 18px rgba(255, 196, 102, 0.22),
    inset 0 0 10px rgba(255, 196, 102, 0.1);
  z-index: 30;
  pointer-events: none;
}
.station-chest-preview--blocked {
  border-color: rgba(255, 107, 107, 0.7);
  color: rgba(255, 220, 220, 0.95);
  box-shadow:
    0 0 18px rgba(255, 107, 107, 0.28),
    inset 0 0 10px rgba(255, 107, 107, 0.12);
}
.station-chest-preview__icon {
  width: 3rem;
  height: 3rem;
  object-fit: contain;
  filter: drop-shadow(0 0 6px rgba(255, 196, 102, 0.5));
}
.station-chest-preview__text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.station-chest-preview__label {
  font-size: 0.85rem;
}
.station-chest-preview__qty {
  font-size: 1.05rem;
  color: rgba(255, 215, 130, 1);
  letter-spacing: 0.2em;
}
.station-chest-preview__warn {
  font-size: 0.72rem;
  color: rgba(255, 107, 107, 0.95);
  letter-spacing: 0.22em;
}

.station-cargo-full {
  position: fixed;
  bottom: 26%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.5rem 1.1rem;
  font-family: 'Datatype', ui-monospace, monospace;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  background: rgba(28, 6, 6, 0.78);
  border: 1px solid rgba(255, 107, 107, 0.65);
  box-shadow: 0 0 16px rgba(255, 107, 107, 0.3);
}
.station-cargo-full__head {
  color: rgba(255, 107, 107, 0.95);
  font-size: 0.95rem;
  font-weight: 600;
}
.station-cargo-full__body {
  color: rgba(255, 220, 220, 0.9);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
}
.pickup-failed-enter-active,
.pickup-failed-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.pickup-failed-enter-from,
.pickup-failed-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px);
}

/* Helmet visor frame — first-person framing shared with /level. */
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

.station-death-fade {
  position: fixed;
  inset: 0;
  background: black;
  z-index: 50;
  pointer-events: none;
}
.station-death-message {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
  pointer-events: none;
}
.station-death-message__text {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 3rem;
  color: #ef4444;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  animation: station-death-pulse 2s ease-in-out infinite;
}
@keyframes station-death-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
</style>
