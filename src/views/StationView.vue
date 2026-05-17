<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import KeyPrompt from '@/components/KeyPrompt.vue'
import FpsHud from '@/components/FpsHud.vue'
import DamageFeedback from '@/components/DamageFeedback.vue'
import DeathOverlay from '@/components/DeathOverlay.vue'
import DebugHud from '@/components/DebugHud.vue'
import PickupToast from '@/components/PickupToast.vue'
import ScrambleText from '@/components/shuttle-control/ScrambleText.vue'
import { isDebugHudEnabled } from '@/lib/debug/debugMetrics'
import type { PickupEntry } from '@/components/PickupToast.vue'
import type { FpsTelemetry } from '@/lib/ui/fpsHudTypes'
import type { Inventory } from '@/lib/inventory/types'
import type { StationIntroSpec } from '@/lib/station/StationLayout'
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
/** Delay before the first AR briefing text starts scrambling in. */
const INTRO_REVEAL_INITIAL_DELAY_SEC = 0.15
/** Delay between AR briefing text groups, in seconds. */
const INTRO_REVEAL_STEP_DELAY_SEC = 0.38

/**
 * Vault door's locked-state prompt while the player has no keycard.
 * Mirrors the JSON spec — duplicated here so we can restore it on
 * death (which forfeits the keycard) without re-reading the layout.
 */
const VAULT_PROMPT_NO_KEYCARD = 'VAULT LOCKED  ·  KEYCARD REQUIRED'

/** Vault door's locked-state prompt once the keycard has been picked up. */
const VAULT_PROMPT_HAS_KEYCARD = 'F  Unlock Vault'

const container = ref<HTMLElement | null>(null)
const controller = new StationViewController()
const route = useRoute()
const router = useRouter()
const promptText = ref<string | null>(null)
const parsedPrompt = computed(() =>
  promptText.value ? parseKeyPrompt(promptText.value) : null,
)
const debugHudVisible = computed(
  () => route.query.debug === '1' || route.query.debug === 'true' || isDebugHudEnabled(),
)
const stationIntro = ref<StationIntroSpec | null>(null)
const stationIntroOpacity = ref(1)
const stationIntroRevealStep = ref(0)
const startupFade = ref(0)
const startupLetterboxVisible = ref(false)
const startupIntroActive = computed(
  () => startupFade.value > 0 || startupLetterboxVisible.value,
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
let stationIntroRevealTimer: ReturnType<typeof Timer.sequence> | null = null

/** Active pickup toasts. Each gets its own auto-removal timer. */
const pickups = ref<PickupEntry[]>([])
const pickupTimers = new Map<string, ReturnType<typeof Timer.after>>()
let pickupSeq = 0

/** Handoff fired when the global prelude has fully finished. */
function handlePreludePlay(): void {
  controller.startStartupIntro()
}

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
controller.onStationIntro = (intro) => {
  stopStationIntroReveal()
  stationIntro.value = intro
  stationIntroRevealStep.value = 0
  if (intro) startStationIntroReveal(intro)
}
controller.onStationIntroOpacity = (opacity) => {
  stationIntroOpacity.value = opacity
}
controller.onStartupFade = (opacity) => {
  startupFade.value = opacity
}
controller.onStartupLetterbox = (visible) => {
  startupLetterboxVisible.value = visible
}

/**
 * Start a staggered reveal for the AR briefing text groups. Uses
 * {@link Timer.sequence} so the project stays off native timeout APIs.
 *
 * @param intro - Briefing copy currently mounted in the HUD.
 */
function startStationIntroReveal(intro: StationIntroSpec): void {
  const groups =
    INTRO_REVEAL_TITLE_STEP +
    (intro.subtitle ? 1 : 0) +
    intro.body.length +
    (intro.status?.length ?? 0)
  const steps = Array.from({ length: groups }, (_, index) => ({
    delay: index === 0 ? INTRO_REVEAL_INITIAL_DELAY_SEC : INTRO_REVEAL_STEP_DELAY_SEC,
    fn: () => {
      stationIntroRevealStep.value = index + 1
    },
  }))
  stationIntroRevealTimer = Timer.sequence(steps)
}

/** Cancel any pending AR briefing reveal timers. */
function stopStationIntroReveal(): void {
  if (stationIntroRevealTimer === null) return
  Timer.cancel(stationIntroRevealTimer)
  stationIntroRevealTimer = null
}

/** Reveal step for the briefing title. */
const INTRO_REVEAL_TITLE_STEP = 2

/**
 * Compute the reveal step for a body line.
 *
 * @param index - Body line index.
 * @returns Reveal step for the line.
 */
function introBodyRevealStep(index: number): number {
  return INTRO_REVEAL_TITLE_STEP + (stationIntro.value?.subtitle ? 1 : 0) + 1 + index
}

/**
 * Compute the reveal step for a status chip.
 *
 * @param index - Status chip index.
 * @returns Reveal step for the chip.
 */
function introStatusRevealStep(index: number): number {
  return introBodyRevealStep(stationIntro.value?.body.length ?? 0) + index
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
  controller.resetInteractor('terminal:use:r-microwave')
  // Death forfeits the keycard, so the vault door must reflect that —
  // otherwise it keeps offering "F  Unlock Vault" with nothing to spend.
  const vault = controller.findEntrance('enter:r-vault')
  if (vault) vault.lockedPrompt = VAULT_PROMPT_NO_KEYCARD
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

/** Seconds the peek terminal in r-terminal keeps the hazard map on-screen. */
const MAZE_PEEK_DURATION_S = 20

/**
 * Cooldown (seconds) between successive uses of a corridor wall-station
 * (oxygen / heal). While the timer runs the prop's interactor is
 * disabled and its emissive + PointLight are forced off so the player
 * gets a clear "depleted" read.
 */
const WALL_STATION_COOLDOWN_S = 60

controller.onInteract = (event) => {
  if (event === 'station:exit') {
    promptText.value = null
    chestPreview.value = null
    void router.push('/')
    return
  }
  if (event === 'terminal:use:r-power') {
    // Tutorial → live status: hand the player the per-cell wireframes
    // and start accepting SCI bolt hits on the powergen.
    controller.beginPowerGenMinigame()
    return
  }
  if (event === 'terminal:use:r-terminal') {
    // Peek terminal — repeatable, doesn't consume. Shows the microwave
    // room's tile layout on the screen for ~20s so the player can
    // memorise the safe path before crossing.
    controller.peekMazeOnTerminal(event, 'r-microwave', MAZE_PEEK_DURATION_S)
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
    if (vault) vault.lockedPrompt = VAULT_PROMPT_HAS_KEYCARD
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
  if (event.startsWith('wallstation:oxygen:')) {
    controller.refillPlayerOxygen()
    controller.consumeInteractor(event, 'success')
    Timer.after(WALL_STATION_COOLDOWN_S, () => controller.resetInteractor(event, 'idle'))
    return
  }
  if (event.startsWith('wallstation:heal:')) {
    controller.refillPlayerHealth()
    controller.consumeInteractor(event, 'success')
    Timer.after(WALL_STATION_COOLDOWN_S, () => controller.resetInteractor(event, 'idle'))
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
  if (typeof window !== 'undefined') {
    window.addEventListener('prelude-play', handlePreludePlay)
  }
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
  } else {
    controller.startStartupIntro()
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('prelude-play', handlePreludePlay)
  }
  promptText.value = null
  chestPreview.value = null
  stopStationIntroReveal()
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
  <div
    class="station-letterbox station-letterbox--top"
    :class="{ 'station-letterbox--hidden': !startupLetterboxVisible }"
  />
  <div
    class="station-letterbox station-letterbox--bottom"
    :class="{ 'station-letterbox--hidden': !startupLetterboxVisible }"
  />
  <transition name="station-intro">
    <section
      v-if="stationIntro"
      class="station-intro-hud"
      :style="{ opacity: stationIntroOpacity }"
      aria-live="polite"
    >
      <div v-if="stationIntroRevealStep >= 1" class="station-intro-hud__eyebrow">
        <ScrambleText text="STATION LINK ESTABLISHED" :play="stationIntroOpacity > 0.98" />
      </div>
      <h1 v-if="stationIntroRevealStep >= INTRO_REVEAL_TITLE_STEP" class="station-intro-hud__title">
        <ScrambleText :text="stationIntro.title" :play="stationIntroOpacity > 0.98" />
      </h1>
      <p
        v-if="stationIntro.subtitle && stationIntroRevealStep >= INTRO_REVEAL_TITLE_STEP + 1"
        class="station-intro-hud__subtitle"
      >
        <ScrambleText :text="stationIntro.subtitle" :play="stationIntroOpacity > 0.98" />
      </p>
      <div class="station-intro-hud__body">
        <template v-for="(line, index) in stationIntro.body" :key="line">
          <p v-if="stationIntroRevealStep >= introBodyRevealStep(index)">
            <ScrambleText
              :text="line"
              :play="stationIntroOpacity > 0.98"
              :speed="24"
              :stagger="1"
            />
          </p>
        </template>
      </div>
      <div v-if="stationIntro.status?.length" class="station-intro-hud__status">
        <template v-for="(tag, index) in stationIntro.status" :key="tag">
          <span v-if="stationIntroRevealStep >= introStatusRevealStep(index)">{{ tag }}</span>
        </template>
      </div>
    </section>
  </transition>
  <KeyPrompt
    v-if="parsedPrompt && !startupIntroActive"
    :key-label="parsedPrompt.key"
    :action="parsedPrompt.label"
    tone="cyan"
    position="bottom"
  />
  <transition name="station-fps-hud">
    <FpsHud
      v-if="!startupLetterboxVisible"
      :telemetry="fpsTelemetry"
      variant="station"
      hide-movement-readout
    />
  </transition>
  <DamageFeedback :flash-opacity="damageFlash" :intensity="1.8" />
  <DebugHud v-if="debugHudVisible" />
  <div v-if="startupFade > 0" class="station-startup-fade" :style="{ opacity: startupFade }" />
  <div v-if="deathFade > 0" class="station-death-fade" :style="{ opacity: deathFade }" />
  <div v-if="deathMessageVisible" class="station-death-message">
    <span class="station-death-message__text">YOU DIED</span>
  </div>
  <DeathOverlay :visible="deathMessageVisible" cause="STATION HAZARD" @restart="handleRestart" />
  <PickupToast :pickups="pickups" />
  <div
    v-if="chestPreview && !startupIntroActive"
    class="station-chest-preview"
    :class="{ 'station-chest-preview--blocked': chestPreview.cannotCarry }"
  >
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
.station-letterbox {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 40;
  height: 12%;
  background: black;
  pointer-events: none;
  transition: height 0.6s ease-in-out;
}
.station-letterbox--top {
  top: 0;
}
.station-letterbox--bottom {
  bottom: 0;
}
.station-letterbox--hidden {
  height: 0;
}
.station-startup-fade {
  position: fixed;
  inset: 0;
  z-index: 48;
  background: black;
  pointer-events: none;
}
.station-intro-hud {
  position: fixed;
  top: 16%;
  left: max(1.4rem, env(safe-area-inset-left, 0px) + 1rem);
  z-index: 45;
  width: min(46rem, calc(100vw - 2.8rem));
  padding: 1rem 1.15rem 1.05rem;
  overflow: hidden;
  border: 1px solid rgba(102, 255, 238, 0.62);
  border-radius: 0.55rem;
  background:
    radial-gradient(circle at 18% 0%, rgba(102, 255, 238, 0.16), transparent 42%),
    linear-gradient(135deg, rgba(3, 12, 24, 0.52), rgba(2, 6, 23, 0.34)),
    repeating-linear-gradient(
      180deg,
      rgba(102, 255, 238, 0.045) 0,
      rgba(102, 255, 238, 0.045) 1px,
      transparent 1px,
      transparent 7px
    );
  backdrop-filter: blur(12px) saturate(145%);
  color: rgba(186, 230, 253, 0.92);
  font-family: 'Datatype', ui-monospace, monospace;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  pointer-events: none;
  box-shadow:
    0 0 0 1px rgba(2, 6, 23, 0.52),
    0 0 28px rgba(102, 255, 238, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    inset 0 0 24px rgba(102, 255, 238, 0.07);
  transition: opacity 0.12s linear;
}
.station-intro-hud::before {
  position: absolute;
  inset: 0;
  content: '';
  pointer-events: none;
  background:
    linear-gradient(100deg, transparent 0%, rgba(255, 255, 255, 0.08) 38%, transparent 62%),
    radial-gradient(circle at 100% 0%, rgba(125, 211, 252, 0.16), transparent 36%);
  mix-blend-mode: screen;
}
.station-intro-hud::after {
  position: absolute;
  inset: 0.35rem;
  content: '';
  pointer-events: none;
  border: 1px solid rgba(102, 255, 238, 0.18);
  border-radius: 0.38rem;
}
.station-intro-hud__eyebrow {
  position: relative;
  margin-bottom: 0.5rem;
  color: rgba(102, 255, 238, 0.9);
  font-size: 0.7rem;
  letter-spacing: 0.24em;
}
.station-intro-hud__title {
  position: relative;
  margin: 0;
  color: rgba(240, 253, 250, 0.98);
  font-size: clamp(1.4rem, 3vw, 2.35rem);
  line-height: 1;
  letter-spacing: 0.18em;
}
.station-intro-hud__subtitle {
  position: relative;
  margin: 0.5rem 0 0;
  color: rgba(125, 211, 252, 0.92);
  font-size: 0.82rem;
  letter-spacing: 0.2em;
}
.station-intro-hud__body {
  position: relative;
  display: grid;
  gap: 0.5rem;
  margin-top: 1rem;
}
.station-intro-hud__body p {
  margin: 0;
  max-width: 31rem;
  color: rgba(203, 213, 225, 0.92);
  font-size: 0.8rem;
  line-height: 1.55;
  letter-spacing: 0.08em;
  text-transform: none;
}
.station-intro-hud__status {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.95rem;
}
.station-intro-hud__status span {
  padding: 0.28rem 0.45rem;
  border: 1px solid rgba(255, 107, 107, 0.45);
  background: rgba(127, 29, 29, 0.28);
  color: rgba(252, 165, 165, 0.95);
  font-size: 0.62rem;
  letter-spacing: 0.18em;
  animation: station-intro-chip-fade 0.35s ease both;
}
.station-intro-enter-active,
.station-intro-leave-active {
  transition:
    opacity 0.35s ease,
    transform 0.35s ease;
}
.station-intro-enter-from,
.station-intro-leave-to {
  opacity: 0;
  transform: translateY(0.45rem);
}
.station-fps-hud-enter-active,
.station-fps-hud-leave-active {
  transition: opacity 0.6s ease;
}
.station-fps-hud-enter-from,
.station-fps-hud-leave-to {
  opacity: 0;
}
@keyframes station-intro-chip-fade {
  from {
    opacity: 0;
    transform: translateY(0.2rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

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
  bottom: 26%;
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
