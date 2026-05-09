# Habitat Observatory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive Aladin Lite sky-atlas dialog to the habitat interior, gated on the Refractor Telescope cosmetic, with five curated targets and a futuristic chrome that mirrors `ShuttleControlOverlay.vue`.

**Architecture:** ViewController + lib boundary + data-driven content. A thin `AladinAdapter` wraps the third-party `aladin-lite` lib (dynamic-imported on first open). The Vue component drives the adapter through a controller. Targets and blurbs live in `src/data/observatory/targets.json`. The F-prompt at the telescope flows through the existing `HabitatInteriorScene.onInteract(target)` callback, bridged by `MapHabitatFacade` to a new `onObservatory(visible)` HUD callback that `MapView.vue` consumes.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript strict, Vite (dynamic import for chunk splitting), Aladin Lite v3.x, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-09-habitat-observatory-design.md`

---

## Task 1: Install Aladin Lite + add module shim

**Files:**
- Modify: `package.json`
- Create: `src/types/aladin-lite.d.ts`

- [ ] **Step 1: Install the dep with bun (NOT npm/npx — repo blocks them)**

Run: `bun add aladin-lite@^3.8.2`
Expected: dependency added to `package.json` and `bun.lock` updated; no errors. The repo's `preinstall` script accepts bun.

- [ ] **Step 2: Create the module shim**

Aladin Lite ships no official TypeScript types. Define the minimum surface we use.

```ts
// src/types/aladin-lite.d.ts
/**
 * Minimal type declarations for the aladin-lite sky atlas viewer.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-habitat-observatory-design.md
 */

declare module 'aladin-lite' {
  /** Initialization options passed to {@link AladinFactory}. */
  export interface AladinInitOptions {
    survey: string
    fov: number
    target: string
    fullScreen: boolean
    showFrame: boolean
    showLayersControl: boolean
    showGoToControl: boolean
    showZoomControl: boolean
    showCrosshair: boolean
    showSimbadPointerTool: boolean
    showSearchBox: boolean
  }

  /** Live Aladin instance returned by `A.aladin(...)`. */
  export interface AladinInstance {
    setImageSurvey(survey: string): void
    gotoRaDec(ra: number, dec: number): void
    setFoV(fovDeg: number): void
    destroy?: () => void
  }

  /** The default export is the Aladin factory namespace. */
  interface AladinFactory {
    init: Promise<void>
    aladin(selector: string | HTMLElement, opts: AladinInitOptions): AladinInstance
  }

  const A: AladinFactory
  export default A
}
```

- [ ] **Step 3: Verify type-check still passes**

Run: `bun run type-check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock src/types/aladin-lite.d.ts
git commit -m "chore(deps): add aladin-lite + type shim for observatory dialog"
```

---

## Task 2: Define `ObservatoryTarget` type

**Files:**
- Create: `src/lib/observatory/types.ts`

- [ ] **Step 1: Write the type module**

```ts
// src/lib/observatory/types.ts
/**
 * Type definitions for the habitat observatory's curated sky-atlas targets.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-habitat-observatory-design.md
 */

/**
 * One curated entry shown in the observatory dialog's sidebar. Loaded
 * statically from `src/data/observatory/targets.json` and validated by
 * `__tests__/targets.spec.ts`.
 */
export interface ObservatoryTarget {
  /** Stable kebab-case id, e.g. `'sgr-a-star'`. Used as Vue key + telemetry. */
  readonly id: string
  /** Display name shown in the sidebar. e.g. `'Sagittarius A*'`. */
  readonly label: string
  /** Right ascension, sexagesimal `'hh mm ss[.s]'`. e.g. `'17 45 40.04'`. */
  readonly ra: string
  /** Declination, sexagesimal with sign `'±dd mm ss[.s]'`. e.g. `'-29 00 28.1'`. */
  readonly dec: string
  /** Field of view in degrees, must be in `(0, 60]`. e.g. `5.0`. */
  readonly fovDeg: number
  /** Aladin survey id, e.g. `'P/Mellinger/color'`. */
  readonly survey: string
  /** Ship-AI flavor text, ~40-80 words. Plain text, no markup. */
  readonly blurb: string
}
```

- [ ] **Step 2: Run lint + type-check**

Run: `bun run type-check && bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Commit**

```bash
git add src/lib/observatory/types.ts
git commit -m "feat(observatory): add ObservatoryTarget interface"
```

---

## Task 3: Create the curated targets manifest (TDD)

**Files:**
- Create: `src/data/observatory/targets.json`
- Create: `src/lib/observatory/__tests__/targets.spec.ts`

- [ ] **Step 1: Write the failing manifest test first**

```ts
// src/lib/observatory/__tests__/targets.spec.ts
/**
 * Validates the observatory targets manifest. Catches drift between the
 * JSON content and the {@link ObservatoryTarget} contract.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-habitat-observatory-design.md
 */

import { describe, expect, it } from 'vitest'
import type { ObservatoryTarget } from '@/lib/observatory/types'
import targets from '@/data/observatory/targets.json'

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const RA_PATTERN = /^\d{1,2}\s\d{1,2}\s\d{1,2}(\.\d+)?$/
const DEC_PATTERN = /^[+-]?\d{1,2}\s\d{1,2}\s\d{1,2}(\.\d+)?$/

describe('observatory/targets.json', () => {
  const list = targets as readonly ObservatoryTarget[]

  it('has exactly 5 targets', () => {
    expect(list).toHaveLength(5)
  })

  it('every target has all required fields', () => {
    for (const t of list) {
      expect(typeof t.id).toBe('string')
      expect(typeof t.label).toBe('string')
      expect(typeof t.ra).toBe('string')
      expect(typeof t.dec).toBe('string')
      expect(typeof t.fovDeg).toBe('number')
      expect(typeof t.survey).toBe('string')
      expect(typeof t.blurb).toBe('string')
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.survey.length).toBeGreaterThan(0)
      expect(t.blurb.length).toBeGreaterThan(0)
    }
  })

  it('ids are unique and kebab-case', () => {
    const ids = list.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(id).toMatch(ID_PATTERN)
    }
  })

  it('fovDeg is in (0, 60]', () => {
    for (const t of list) {
      expect(t.fovDeg).toBeGreaterThan(0)
      expect(t.fovDeg).toBeLessThanOrEqual(60)
    }
  })

  it('ra parses as sexagesimal (hh mm ss)', () => {
    for (const t of list) expect(t.ra).toMatch(RA_PATTERN)
  })

  it('dec parses as sexagesimal with sign (±dd mm ss)', () => {
    for (const t of list) expect(t.dec).toMatch(DEC_PATTERN)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test:unit src/lib/observatory/__tests__/targets.spec.ts`
Expected: FAIL with module-not-found for `@/data/observatory/targets.json`.

- [ ] **Step 3: Create the manifest with locked v1 content**

```json
[
  {
    "id": "sgr-a-star",
    "label": "Sagittarius A*",
    "ra": "17 45 40.04",
    "dec": "-29 00 28.1",
    "fovDeg": 5.0,
    "survey": "P/Mellinger/color",
    "blurb": "Galactic center. The supermassive black hole at the heart of the Milky Way. From your bunk, four million suns of mass crammed into a region smaller than Mercury's orbit. The dust hides it; the stars orbit it. You are looking at gravity itself."
  },
  {
    "id": "m31-andromeda",
    "label": "M31 Andromeda",
    "ra": "00 42 44.30",
    "dec": "+41 16 09",
    "fovDeg": 3.0,
    "survey": "P/DSS2/color",
    "blurb": "Andromeda Galaxy. Two and a half million light-years away, and closing. In about four billion years it will collide with the Milky Way and the night sky will, briefly, have two cores. You will not be there. Neither, statistically, will anyone you know."
  },
  {
    "id": "m42-orion-nebula",
    "label": "M42 Orion Nebula",
    "ra": "05 35 17.3",
    "dec": "-05 23 28",
    "fovDeg": 1.5,
    "survey": "P/DSS2/color",
    "blurb": "Orion Nebula. A stellar nursery, the closest one to Earth, twenty-four light-years across and visible to the naked eye. Hot young stars are still igniting in there. The pink is hydrogen being kicked into emission by ultraviolet light. The blue is dust scattering everything else."
  },
  {
    "id": "m51-whirlpool",
    "label": "M51 Whirlpool",
    "ra": "13 29 52.7",
    "dec": "+47 11 43",
    "fovDeg": 0.2,
    "survey": "P/SDSS9/color",
    "blurb": "Whirlpool Galaxy. A grand-design spiral interacting with its smaller companion NGC 5195. The tidal pull is what keeps the spiral arms so cleanly drawn. Twenty-three million light-years away. The light reaching the optic now left when proto-humans were still figuring out fire."
  },
  {
    "id": "m45-pleiades",
    "label": "Pleiades (M45)",
    "ra": "03 47 24",
    "dec": "+24 07 00",
    "fovDeg": 2.0,
    "survey": "P/DSS2/color",
    "blurb": "The Seven Sisters. An open cluster of hot blue stars about 444 light-years away, drifting through a cloud of unrelated dust the cluster happens to be passing through. The reflection nebulae you see are a coincidence of timing. In a hundred million years they will be apart."
  }
]
```

- [ ] **Step 4: Verify Vite JSON imports work; tsconfig must allow JSON resolution**

Run: `grep -r '"resolveJsonModule"' tsconfig*.json` (you may need to use the Read tool — JSON imports already work elsewhere in the repo, e.g. `src/data/satellite-manifests.json`, so this should already be on. If the test fails for JSON resolution, enable `resolveJsonModule` in `tsconfig.app.json`.)
Expected: already enabled.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test:unit src/lib/observatory/__tests__/targets.spec.ts`
Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/data/observatory/targets.json src/lib/observatory/__tests__/targets.spec.ts
git commit -m "feat(observatory): add 5 curated sky targets with manifest validation"
```

---

## Task 4: Implement `AladinAdapter`

**Files:**
- Create: `src/lib/observatory/AladinAdapter.ts`

- [ ] **Step 1: Write the adapter**

```ts
// src/lib/observatory/AladinAdapter.ts
/**
 * Thin wrapper around the third-party `aladin-lite` sky atlas viewer.
 * Keeps Aladin specifics out of the Vue and Three layers, and dynamic-imports
 * the lib (~2.4 MB chunk) on first instantiation so players who never open the
 * observatory never download it.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-habitat-observatory-design.md
 */

import type { AladinInstance } from 'aladin-lite'
import type { ObservatoryTarget } from '@/lib/observatory/types'

/** Constructor options for {@link AladinAdapter.create}. */
export interface AladinAdapterOptions {
  /** DOM element that will host the Aladin viewport. The adapter assigns a
   * unique id to it before initializing. */
  readonly hostElement: HTMLElement
  /** Target loaded into the viewer at creation time. */
  readonly initialTarget: ObservatoryTarget
}

/**
 * Counter used to generate unique Aladin container ids across multiple
 * instantiations within the same session (e.g. component remount).
 */
let aladinHostCounter = 0

/**
 * Lifecycle wrapper around an Aladin Lite instance. Construct via the static
 * {@link create} factory because initialization is async (chunk import + the
 * library's own `A.init` promise).
 */
export class AladinAdapter {
  private constructor(
    private readonly aladin: AladinInstance,
    private currentSurvey: string,
  ) {}

  /**
   * Dynamically imports `aladin-lite`, awaits its global init promise, and
   * mounts an instance into {@link AladinAdapterOptions.hostElement}.
   *
   * @param opts - Host element + initial target.
   * @returns A ready-to-use adapter pointing at the initial target.
   */
  static async create(opts: AladinAdapterOptions): Promise<AladinAdapter> {
    const mod = await import('aladin-lite')
    const A = mod.default
    await A.init

    aladinHostCounter += 1
    const containerId = `observatory-aladin-${aladinHostCounter}-${Date.now()}`
    opts.hostElement.id = containerId

    const target = opts.initialTarget
    const instance = A.aladin(`#${containerId}`, {
      survey: target.survey,
      fov: target.fovDeg,
      target: `${target.ra} ${target.dec}`,
      fullScreen: false,
      showFrame: false,
      showLayersControl: false,
      showGoToControl: false,
      showZoomControl: false,
      showCrosshair: true,
      showSimbadPointerTool: false,
      showSearchBox: false,
    })

    return new AladinAdapter(instance, target.survey)
  }

  /**
   * Pan the viewer to a new target. Skips the survey switch (which causes a
   * brief visible flash) when the survey id is unchanged.
   *
   * @param target - Target to display.
   */
  goto(target: ObservatoryTarget): void {
    if (target.survey !== this.currentSurvey) {
      this.aladin.setImageSurvey(target.survey)
      this.currentSurvey = target.survey
    }
    const ra = parseSexagesimalRa(target.ra)
    const dec = parseSexagesimalDec(target.dec)
    this.aladin.gotoRaDec(ra, dec)
    this.aladin.setFoV(target.fovDeg)
  }

  /**
   * Tear down the underlying Aladin instance. Calls Aladin's own `destroy`
   * when present; otherwise empties the host element to release WebGL
   * resources.
   */
  destroy(): void {
    if (this.aladin.destroy) this.aladin.destroy()
  }
}

/**
 * Parse a sexagesimal RA `'hh mm ss[.s]'` into decimal degrees.
 *
 * @param ra - RA in `'hh mm ss[.s]'` form.
 * @returns Decimal degrees in `[0, 360)`.
 */
function parseSexagesimalRa(ra: string): number {
  const parts = ra.split(/\s+/).map(Number)
  const [h = 0, m = 0, s = 0] = parts
  return ((h + m / 60 + s / 3600) * 360) / 24
}

/**
 * Parse a sexagesimal Dec `'±dd mm ss[.s]'` into decimal degrees.
 *
 * @param dec - Dec in `'±dd mm ss[.s]'` form.
 * @returns Decimal degrees in `[-90, 90]`.
 */
function parseSexagesimalDec(dec: string): number {
  const sign = dec.trim().startsWith('-') ? -1 : 1
  const parts = dec.replace(/^[+-]/, '').split(/\s+/).map(Number)
  const [d = 0, m = 0, s = 0] = parts
  return sign * (d + m / 60 + s / 3600)
}
```

- [ ] **Step 2: Verify type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Commit**

```bash
git add src/lib/observatory/AladinAdapter.ts
git commit -m "feat(observatory): add AladinAdapter wrapping aladin-lite"
```

---

## Task 5: Implement `ObservatoryOverlayController`

**Files:**
- Create: `src/components/ObservatoryOverlayController.ts`

- [ ] **Step 1: Write the controller**

```ts
// src/components/ObservatoryOverlayController.ts
/**
 * View-controller that orchestrates the {@link AladinAdapter}, the curated
 * targets manifest, and reactive UI state for {@link ObservatoryOverlay.vue}.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-habitat-observatory-design.md
 */

import { ref, type Ref } from 'vue'
import { AladinAdapter } from '@/lib/observatory/AladinAdapter'
import type { ObservatoryTarget } from '@/lib/observatory/types'
import targets from '@/data/observatory/targets.json'
import { uiAudio } from '@/audio/UiAudioDirector'

/** Discriminator for the loading lifecycle of the Aladin viewport. */
export type ObservatoryLoadingState = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Reactive controller for the observatory overlay. One instance per Vue
 * component lifetime; constructed at `<script setup>` top-level.
 */
export class ObservatoryOverlayController {
  /** Static, ordered, frozen list backing the sidebar. */
  readonly targets: readonly ObservatoryTarget[] = targets as readonly ObservatoryTarget[]

  /** Currently selected target id. Defaults to the first manifest entry. */
  readonly currentTargetId: Ref<string>

  /** Lifecycle state used to swap the loading shimmer / error retry. */
  readonly loadingState: Ref<ObservatoryLoadingState> = ref('idle')

  /** Last error message, surfaced in the error overlay. */
  readonly errorMessage: Ref<string | null> = ref(null)

  private adapter: AladinAdapter | null = null

  constructor() {
    const first = this.targets[0]
    if (!first) throw new Error('observatory: targets manifest is empty')
    this.currentTargetId = ref(first.id)
  }

  /**
   * Resolve the {@link ObservatoryTarget} corresponding to {@link currentTargetId}.
   * Falls back to the first target if the id has somehow drifted.
   */
  getCurrentTarget(): ObservatoryTarget {
    const found = this.targets.find((t) => t.id === this.currentTargetId.value)
    return found ?? (this.targets[0] as ObservatoryTarget)
  }

  /**
   * Mount the adapter into {@link host} on first call; subsequent calls just
   * re-`goto()` the current target so reopening the dialog is instant.
   *
   * @param host - DOM element that will hold the Aladin viewport.
   */
  async onOpen(host: HTMLElement): Promise<void> {
    if (this.adapter) {
      this.adapter.goto(this.getCurrentTarget())
      this.loadingState.value = 'ready'
      return
    }
    this.loadingState.value = 'loading'
    this.errorMessage.value = null
    try {
      this.adapter = await AladinAdapter.create({
        hostElement: host,
        initialTarget: this.getCurrentTarget(),
      })
      this.loadingState.value = 'ready'
    } catch (err) {
      console.warn('[ObservatoryOverlay] init failed:', err)
      this.loadingState.value = 'error'
      this.errorMessage.value = err instanceof Error ? err.message : String(err)
    }
  }

  /**
   * Switch the active target. Plays the program-click chirp + delegates to
   * the adapter when ready.
   *
   * @param id - Target id from the manifest.
   */
  selectTarget(id: string): void {
    if (id === this.currentTargetId.value) return
    const next = this.targets.find((t) => t.id === id)
    if (!next) return
    uiAudio.notifyShuttleProgramClick()
    this.currentTargetId.value = id
    if (this.adapter && this.loadingState.value === 'ready') {
      this.adapter.goto(next)
    }
  }

  /**
   * Retry handler shown next to the error message. Clears state and resolves
   * back through {@link onOpen} on the same host element.
   *
   * @param host - DOM element that holds the Aladin viewport.
   */
  retry(host: HTMLElement): Promise<void> {
    this.adapter = null
    this.loadingState.value = 'idle'
    return this.onOpen(host)
  }

  /**
   * Tear down the adapter. Wired to `onBeforeUnmount` in the host component.
   */
  dispose(): void {
    this.adapter?.destroy()
    this.adapter = null
    this.loadingState.value = 'idle'
  }
}
```

- [ ] **Step 2: Verify type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Commit**

```bash
git add src/components/ObservatoryOverlayController.ts
git commit -m "feat(observatory): add overlay view-controller"
```

---

## Task 6: Implement `ObservatoryOverlay.vue` + sibling CSS

**Files:**
- Create: `src/components/ObservatoryOverlay.vue`
- Create: `src/assets/css/observatory-overlay.css`
- Modify: `src/assets/css/main.css` (add `@import "./observatory-overlay.css"` near sibling overlay imports)

- [ ] **Step 1: Find where main.css imports sibling overlay css and follow that pattern**

Run: `grep -n '@import' src/assets/css/main.css`
Read the file with the Read tool and locate where `shuttle-control-overlay.css` (or analogous) is imported. Insert `@import './observatory-overlay.css';` immediately after it. If `shuttle-control-overlay.css` does not exist as a separate file, just add the import alongside the other `@import` directives.

- [ ] **Step 2: Create the CSS file using `@apply`**

Per CLAUDE.md, never put `@apply` inside `<style scoped>`. Tokens reuse the existing `.shuttle-control-*` palette so both dialogs feel like one OS.

```css
/* src/assets/css/observatory-overlay.css */
.observatory-overlay {
  @apply fixed inset-0 z-50 flex items-center justify-center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  outline: none;
}

.observatory-card {
  @apply flex flex-col gap-0 rounded-md border;
  width: min(96vw, 1280px);
  height: min(90vh, 820px);
  border-color: rgba(123, 220, 255, 0.35);
  background: linear-gradient(180deg, rgba(8, 18, 28, 0.95), rgba(4, 10, 18, 0.95));
  color: #c8e9ff;
  box-shadow: 0 0 32px rgba(123, 220, 255, 0.18);
}

.observatory-chrome {
  @apply flex items-center justify-between px-4 py-2 border-b text-xs uppercase tracking-widest;
  border-color: rgba(123, 220, 255, 0.25);
  letter-spacing: 0.18em;
}

.observatory-header {
  @apply flex items-center gap-6 px-4 py-2 text-[10px] uppercase tracking-widest;
  border-bottom: 1px solid rgba(123, 220, 255, 0.18);
  color: rgba(200, 233, 255, 0.7);
}

.observatory-header__value {
  @apply ml-1;
  color: #7bdcff;
}

.observatory-body {
  @apply flex flex-1 min-h-0;
}

.observatory-sidebar {
  @apply flex flex-col gap-1 px-3 py-3;
  width: 220px;
  border-right: 1px solid rgba(123, 220, 255, 0.18);
}

.observatory-nav-btn {
  @apply text-left rounded px-3 py-2 text-sm transition;
  background: transparent;
  color: #c8e9ff;
  border: 1px solid transparent;
}

.observatory-nav-btn:hover {
  border-color: rgba(123, 220, 255, 0.35);
  background: rgba(123, 220, 255, 0.07);
}

.observatory-nav-btn--active {
  border-color: rgba(123, 220, 255, 0.6);
  background: rgba(123, 220, 255, 0.14);
}

.observatory-content {
  @apply relative flex-1 min-w-0 min-h-0;
}

.observatory-viewport {
  @apply absolute inset-0;
  background: #000;
}

.observatory-blurb {
  @apply px-4 py-3 text-sm leading-relaxed border-t;
  border-color: rgba(123, 220, 255, 0.18);
  color: rgba(200, 233, 255, 0.85);
}

.observatory-status {
  @apply absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm;
  color: rgba(200, 233, 255, 0.85);
  background: rgba(0, 0, 0, 0.6);
}

.observatory-footer {
  @apply flex items-center justify-end px-4 py-2 text-[10px] uppercase tracking-widest;
  border-top: 1px solid rgba(123, 220, 255, 0.18);
  color: rgba(200, 233, 255, 0.6);
}
```

- [ ] **Step 3: Add the import line to `main.css`**

Use the Edit tool to insert `@import './observatory-overlay.css';` right after the most-similar overlay import (or alongside the other `@import` directives). Do not duplicate.

- [ ] **Step 4: Create the Vue component**

```vue
<!-- src/components/ObservatoryOverlay.vue -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ObservatoryOverlayController } from './ObservatoryOverlayController'
import { uiAudio } from '@/audio/UiAudioDirector'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

const controller = new ObservatoryOverlayController()
const overlayEl = ref<HTMLElement | null>(null)
const aladinHost = ref<HTMLElement | null>(null)

const currentTarget = computed(() => controller.getCurrentTarget())

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    await nextTick()
    overlayEl.value?.focus()
    if (aladinHost.value) {
      await controller.onOpen(aladinHost.value)
    }
  },
)

function selectTarget(id: string): void {
  controller.selectTarget(id)
}

function retry(): void {
  if (aladinHost.value) void controller.retry(aladinHost.value)
}

function requestClose(): void {
  uiAudio.notifySwitch()
  emit('close')
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') requestClose()
}

onBeforeUnmount(() => controller.dispose())
</script>

<template>
  <div
    v-if="visible"
    ref="overlayEl"
    class="observatory-overlay"
    tabindex="0"
    @keydown="onKeydown"
  >
    <div class="observatory-card">
      <div class="observatory-chrome">
        <span>Observatory</span>
        <button type="button" class="ship-message-card__button" @click="requestClose">
          Close
        </button>
      </div>

      <div class="observatory-header">
        <span class="observatory-header__item"
          >SURVEY <span class="observatory-header__value">{{ currentTarget.survey }}</span></span
        >
        <span class="observatory-header__item"
          >RA <span class="observatory-header__value">{{ currentTarget.ra }}</span></span
        >
        <span class="observatory-header__item"
          >DEC <span class="observatory-header__value">{{ currentTarget.dec }}</span></span
        >
        <span class="observatory-header__item"
          >FOV <span class="observatory-header__value">{{ currentTarget.fovDeg }}°</span></span
        >
        <span class="observatory-header__item"
          >TARGET <span class="observatory-header__value">{{ currentTarget.label }}</span></span
        >
      </div>

      <div class="observatory-body">
        <nav class="observatory-sidebar">
          <button
            v-for="t in controller.targets"
            :key="t.id"
            type="button"
            class="observatory-nav-btn"
            :class="{ 'observatory-nav-btn--active': controller.currentTargetId.value === t.id }"
            @click="selectTarget(t.id)"
          >
            {{ t.label }}
          </button>
        </nav>

        <div class="observatory-content">
          <div ref="aladinHost" class="observatory-viewport" />

          <div v-if="controller.loadingState.value === 'loading'" class="observatory-status">
            <span>Loading sky atlas…</span>
          </div>

          <div v-if="controller.loadingState.value === 'error'" class="observatory-status">
            <span>Sky atlas offline.</span>
            <button type="button" class="ship-message-card__button" @click="retry">Retry</button>
          </div>
        </div>
      </div>

      <div class="observatory-blurb">{{ currentTarget.blurb }}</div>

      <div class="observatory-footer">
        <span class="ship-message-card__hint">ESC Close</span>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 5: Verify type-check + lint + dev build**

Run: `bun run type-check && bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/components/ObservatoryOverlay.vue src/assets/css/observatory-overlay.css src/assets/css/main.css
git commit -m "feat(observatory): add overlay component + CSS"
```

---

## Task 7: Wire the F-prompt at the telescope in `HabitatInteriorScene`

**Files:**
- Modify: `src/three/HabitatInteriorScene.ts`

- [ ] **Step 1: Add `OBSERVE_PROMPT_RADIUS` constant near the existing telescope position constants**

Locate `REFRACTOR_TELESCOPE_X`, `REFRACTOR_TELESCOPE_Z`, `REFRACTOR_TELESCOPE_ROTATION_Y` constants (around lines 266–274). Add:

```ts
/**
 * XZ distance from the player at which the `F  Observe` prompt appears
 * next to the refractor telescope. Tuned to match the cat-perch / litterbox
 * prompt feel (close enough that the player has to be standing right at the
 * lens, not just walking past).
 */
const OBSERVE_PROMPT_RADIUS = 1.4
```

- [ ] **Step 2: Add the new branch to the proximity ladder in `tickInteraction`**

Open the per-frame interaction ladder around line 3540 (where the litterbox / table / hatch checks live). Insert a new branch BEFORE the table branch:

```ts
// --- Refractor telescope (Observe) -----------------------------------
if (this.refractorTelescope.isLoaded()) {
  const tx = this.player.position.x - REFRACTOR_TELESCOPE_X
  const tz = this.player.position.z - REFRACTOR_TELESCOPE_Z
  const telescopeDist = Math.hypot(tx, tz)
  if (telescopeDist < OBSERVE_PROMPT_RADIUS && !tableInRange) {
    this.onPrompt?.('F  Observe')
    if (this.inputManager.wasActionPressed('interact')) {
      this.onInteract?.('observatory')
    }
    return
  }
}
```

The `!tableInRange` guard preserves the existing pattern where the table prompt wins at the cockpit corner.

- [ ] **Step 3: Verify `isLoaded()` exists on `HabitatRefractorTelescopeModel`**

Run the Read tool on `src/three/HabitatRefractorTelescopeModel.ts`. The class needs an `isLoaded(): boolean` accessor returning whether `load()` has resolved (so the model + GLB are present in the scene). If it does not exist:
- Add a private `loaded = false` field.
- Set it to `true` at the end of `load()`.
- Expose `isLoaded(): boolean` returning `this.loaded`.

Run: `bun run type-check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/three/HabitatInteriorScene.ts src/three/HabitatRefractorTelescopeModel.ts
git commit -m "feat(observatory): F-prompt at telescope when cosmetic owned"
```

---

## Task 8: Bridge `'observatory'` interact target through `MapHabitatFacade`

**Files:**
- Modify: `src/lib/map/habitat/MapHabitatFacade.ts`

- [ ] **Step 1: Extend `MapHabitatCallbacks`**

Around line 100, the existing interface declares `onShuttleControl`, `onHabitatPrompt`, etc. Add:

```ts
/** Open/close the observatory dialog (refractor telescope F-prompt). */
onObservatory?: (visible: boolean) => void
```

- [ ] **Step 2: Handle `'observatory'` in the `onInteract` switch inside `buildScene()`**

The existing handler at line ~214 currently handles `'table'` (and other targets). Convert it to a switch (or extend the existing chain) so `'observatory'` calls `deps?.callbacks.onObservatory?.(true)`. Match the pattern used for `'table'` minus the `notifyJourneyTrigger` and `pointerLock.release()` — neither is needed for this overlay (no journey gating, the overlay's own focus handling supersedes pointer-lock release).

Concretely:

```ts
next.onInteract = (target) => {
  if (target === 'table') {
    uiAudio.notifyType()
    deps?.notifyJourneyTrigger('shuttle_control_opened')
    deps?.callbacks.onShuttleControl?.(true)
    // …existing pointer-lock / inspect-mode work…
    return
  }
  if (target === 'observatory') {
    deps?.callbacks.onObservatory?.(true)
    return
  }
  // …existing handlers for 'hatch', 'cat', etc.…
}
```

(Use Read on the file first to confirm the actual existing structure — it may already be a switch or chain. Preserve all existing cases verbatim.)

- [ ] **Step 3: Verify type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add src/lib/map/habitat/MapHabitatFacade.ts
git commit -m "feat(observatory): bridge interact target to onObservatory callback"
```

---

## Task 9: Wire `MapViewController.onObservatory` event

**Files:**
- Modify: `src/views/MapViewController.ts`

- [ ] **Step 1: Add the public event hook**

Locate the existing `onShuttleControl?: (visible: boolean) => void` field on the controller (around line 632). Add a peer field:

```ts
/** Fired when the observatory dialog should open/close. */
onObservatory?: (visible: boolean) => void
```

- [ ] **Step 2: Forward through the habitat facade attach call**

In the `habitatFacade.attach({...})` block (around line 990), the `callbacks` object already wires `onShuttleControl`, `onHabitatPrompt`, etc. Add:

```ts
onObservatory: (visible) => this.onObservatory?.(visible),
```

(Match the surrounding style — these are short arrow forwarders.)

- [ ] **Step 3: Verify type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "feat(observatory): MapViewController.onObservatory hook"
```

---

## Task 10: Mount `ObservatoryOverlay` in `MapView.vue`

**Files:**
- Modify: `src/views/MapView.vue`

- [ ] **Step 1: Import the component**

Add to the existing import block in `<script setup>`:

```ts
import ObservatoryOverlay from '@/components/ObservatoryOverlay.vue'
```

- [ ] **Step 2: Add the visibility ref**

Near the existing `const shuttleControlVisible = ref(false)` (line ~362), add:

```ts
const observatoryVisible = ref(false)
```

- [ ] **Step 3: Wire the controller event**

In the `viewController.onShuttleControl = ...` block (around line 961), add right after it:

```ts
viewController.onObservatory = (visible) => {
  observatoryVisible.value = visible
}
```

- [ ] **Step 4: Mount the overlay in the template**

In the template, locate the existing `<ShuttleControlOverlay …/>` mount (around line 1993). Immediately after its closing tag, add:

```vue
<ObservatoryOverlay
  :visible="observatoryVisible"
  @close="observatoryVisible = false"
/>
```

- [ ] **Step 5: Verify the full pipeline manually**

Run: `bun dev`
Steps to verify in the browser:
1. Buy the Refractor Telescope cosmetic in the shop.
2. Land at a planet, enter the habitat (H key).
3. Walk to the −X sun corner. Confirm `F  Observe` prompt appears at the telescope.
4. Press F. Overlay opens. First load shows "Loading sky atlas…" briefly, then the Mellinger view of Sgr A* appears.
5. Click each of the five sidebar entries. Confirm the view pans + survey switches + header strip + blurb update.
6. Press ESC. Overlay closes. Re-press F. Re-opens instantly (adapter cached).
7. Without the cosmetic owned: confirm no prompt appears at that corner.

- [ ] **Step 6: Verify chunk splitting**

Run: `bun run build`
After build, `grep -ri "aladin" dist/assets | head` should show the lib in its own chunk file (separate from the main entry). Initial `index-*.js` should not contain Aladin code.

- [ ] **Step 7: Run all gates**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: type-check 0 errors, lint 0 errors / 0 warnings, all Vitest green.

- [ ] **Step 8: Commit**

```bash
git add src/views/MapView.vue
git commit -m "feat(observatory): mount ObservatoryOverlay in MapView"
```

---

## Acceptance Verification

Replay each item from the spec's Acceptance Criteria section against the running app:

- [ ] With telescope cosmetic owned, walking up shows `F  Observe`.
- [ ] Without it, no prompt appears (model not loaded).
- [ ] F opens overlay matching `ShuttleControlOverlay` chrome.
- [ ] All five targets pan/switch survey/FOV correctly.
- [ ] Header + blurb update on selection.
- [ ] ESC and Close hide the overlay.
- [ ] `bun run type-check`, `bun run lint`, `bun run test:unit` all green.
- [ ] Initial bundle does not include Aladin chunk.
