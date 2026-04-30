# Jovian Prospectus Minigame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship plan 6 of the Jovian Society Prospection contract — author the prospectus special mission on Hektor, spawn a Society terminal POI in `/level`, build the canvas overlay with TRANSMIT/TAMPER CTAs, and resolve the choice through `notifyChoiceResolved`.

**Architecture:**
- Reuse plan 4's auto-activation pipeline: a `'special'` asteroid mission file at `src/data/missions/jovian-prospection-hektor-prospectus.json`, registered in `SPECIAL_MISSIONS`, mapped in `SPECIAL_MISSION_OFFER_IDS`, with the contract step gaining a `specialMissionId` field. The existing `MapViewController.handleContractStepActivated` path queues the mission and posts the Hektor waypoint.
- A new `ObjectiveType` value `'prospectus-terminal'` causes `LevelViewController` to spawn a `TerminalModel` (reused from survey kiosks) at the asteroid landing-zone POI, register the existing `terminalPrompt` ref with `[E] OPEN PROSPECTUS`, and on interact mount `ProspectusOverlay.vue`.
- Outcome resolution calls `contractSystem.notifyChoiceResolved('jovian_final_prospectus', 'transmit' | 'tamper')`. Plan 2's runtime advances the step and dispatches `completionByOutcome`. Plan 6 owns nothing past that call.
- Procedural lightcurve + DAN histogram are pure functions seeded by `'hektor-photometry'` / `'hektor-dan'` so they are testable without DOM and stable across reloads.

**Tech Stack:** Vue 3 + TypeScript + Vite, Three.js, Pinia, Howler-style synth via `relayAudio.ts` pattern, Tailwind v4 (`@apply` in sibling `.css` files), Vitest + JSDOM.

---

## Existing context (audit before coding)

These files are the integration surface. Skim them before Task 1 — you should not need to re-read them on every task, but you do need the shape of each in your head:

- `src/data/missions/jovian-prospection-hektor-photometry.json` — JSON shape for an `'special'` asteroid mission with a single objective, `asteroidId: 'hektor'`, region, briefing, waypoint, totalReward.
- `src/lib/missions/specialMissions.ts` — `SPECIAL_MISSIONS` array; new mission imports go beside `jovianHektorDan`.
- `src/views/MapViewController.ts:260` — `SPECIAL_MISSION_OFFER_IDS` map.
- `src/views/MapViewController.ts:3999` — `stageSpecialMission(missionId, offerMessageId)`.
- `src/views/MapViewController.ts:4045` — `handleContractStepActivated(payload)` — already reads `payload.specialMissionId` from the contract step. Plan 6 hooks into this with no new code path.
- `src/data/contracts/jovian-society-prospection.json:148-166` — current step 9 (`kind: 'choice-mission'`, `missionId: 'jovian_final_prospectus'`, `minigameType: 'terminal-prospectus'`, `pinnedAssetRef: 'hektor'`, two outcomes). Add `specialMissionId` here.
- `src/data/contracts/jovian-society-prospection.json:168-200` — `completionByOutcome.transmit` and `.tamper` already authored. Plan 7 makes the rewards mean something; plan 6 only verifies they dispatch.
- `src/lib/contracts/contractTypes.ts:279-294` — `ChoiceMissionStep` interface; add an optional `specialMissionId` if not already present (it is on `CompleteMissionsStep`; reuse the same name).
- `src/lib/contracts/ContractSystem.ts:583` — `notifyChoiceResolved(missionId, outcomeId): boolean`.
- `src/lib/contracts/runtime.ts:469-470` — existing dev hook `__contracts.resolveChoice` that ships the same call. Keep it; the overlay calls the same path.
- `src/lib/level/levelContext.ts:178-214` — `resolveLevelContext`. Special missions resolve from `getSpecialMissionById(missionType)`. Persisted active-mission path picks up the prospectus special mission identically.
- `src/views/LevelViewController.ts` — owns level scene state, objective spawning, telemetry, the `onTerminalPrompt` callback. The new objective type lives here. Survey objectives' `TerminalModel` placement and "near terminal → set `terminalPrompt`" pattern is the precedent — search for `TerminalModel` and the `terminalPrompt` callback.
- `src/views/LevelView.vue:75` — `terminalPrompt = ref<string | null>(null)` and the `[E]` prompt rendered in the template. Mount the overlay alongside `DanScanPanel` (line 37 import) when the prospectus mission is active and the player presses E at the terminal.
- `src/three/TerminalModel.ts` — existing terminal kiosk model. Reuse it (per spec open-question 2: "a quick existing-prop reskin... is enough"). Apply Society blue (`#2C5BB0`) by overriding the screen emissive in the prospectus spawn site, no model fork needed.
- `src/lib/missions/asteroidMissionGenerator.ts:32` — `hashSeed(str): number`.
- `src/lib/minigame/relayRepair/relayAudio.ts` — Howler-based synth pattern (master gain 0.22, dispose lifecycle). Use this style for the three prospectus cues.
- `src/lib/asteroids/catalog.ts:49` — `getAsteroidById(id)`. Hektor entry at `src/data/asteroids/hektor.json` includes the composition list rendered in the asset card.
- `src/assets/css/main.css` — global stylesheet that imports sibling `.css` files (e.g. `dan-scan-panel.css`). Add `@import './prospectus-overlay.css'` here.

---

## Task 1: Add `'prospectus-terminal'` to `ObjectiveType`

**Files:**
- Modify: `src/lib/missions/types.ts:17-25` (the `ObjectiveType` union)
- Test: `src/lib/missions/__tests__/objectiveType.spec.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/missions/__tests__/objectiveType.spec.ts
import { describe, it, expectTypeOf } from 'vitest'
import type { ObjectiveType } from '@/lib/missions/types'

describe('ObjectiveType', () => {
  it('includes prospectus-terminal', () => {
    expectTypeOf<'prospectus-terminal'>().toMatchTypeOf<ObjectiveType>()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test:unit src/lib/missions/__tests__/objectiveType.spec.ts
```

Expected: type-check error or test failure — `'prospectus-terminal'` is not assignable to `ObjectiveType`.

- [ ] **Step 3: Add the union member**

In `src/lib/missions/types.ts:17-25`, append `| 'prospectus-terminal'`:

```ts
export type ObjectiveType =
  | 'gather'
  | 'exterminate'
  | 'rescue'
  | 'survey'
  | 'photometry'
  | 'dan'
  | 'collect'
  | 'bunker'
  | 'prospectus-terminal'
```

- [ ] **Step 4: Run test + type-check to verify pass**

```bash
bun test:unit src/lib/missions/__tests__/objectiveType.spec.ts
bun run type-check
```

Expected: PASS, no new TS errors elsewhere. If the asteroid mission generator's exhaustive `switch` on `ObjectiveType` complains, leave the new arm unhandled inside the generator — special missions are authored, not generated, so the generator never produces this type. Add a `// special-mission only — never generated` comment on the missing arm if the linter flags it, or add a `default` arm that throws.

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/types.ts src/lib/missions/__tests__/objectiveType.spec.ts
git commit -m "feat(missions): add prospectus-terminal objective type"
```

---

## Task 2: Author the prospectus special mission JSON

**Files:**
- Create: `src/data/missions/jovian-prospection-hektor-prospectus.json`
- Modify: `src/lib/missions/specialMissions.ts`
- Modify: `src/views/MapViewController.ts:260-266` (`SPECIAL_MISSION_OFFER_IDS`)

- [ ] **Step 1: Create the special-mission JSON**

```jsonc
// src/data/missions/jovian-prospection-hektor-prospectus.json
{
  "kind": "special",
  "id": "jovian-prospection-hektor-prospectus",
  "asteroidId": "hektor",
  "giverId": "jovian-society",
  "giverName": "Jovian Society",
  "templateId": "jovian-prospection-hektor-prospectus",
  "name": "OP 9 — Prospectus Compilation",
  "briefing": "Pilot, eight deliverables clean. Final assignment: travel to Asset 2306-J. There is a Society-provisioned terminal on the surface, near your previous landing zone. Approach the terminal and review the assembled report — your readings, our analysis, the recommended disposition. Confirm transmission to Cloud City Asset Strategy at your discretion. — Vance",
  "difficulty": 5,
  "region": "jovian-trojans",
  "objectives": [
    {
      "type": "prospectus-terminal",
      "x": 0,
      "z": 0,
      "interactionLabel": "[E] OPEN PROSPECTUS",
      "reward": 0
    }
  ],
  "totalReward": 0,
  "waypoint": { "worldX": 0, "worldZ": 0 },
  "status": "available"
}
```

- [ ] **Step 2: Register it in `SPECIAL_MISSIONS`**

In `src/lib/missions/specialMissions.ts`, add the import (alphabetical with the other Jovian missions) and the array entry:

```ts
import jovianHektorProspectus from '@/data/missions/jovian-prospection-hektor-prospectus.json'

export const SPECIAL_MISSIONS: GeneratedAsteroidMission[] = [
  consortiumCertificationData,
  jovianHektorPhotometry,
  jovianHektorDan,
  jovianHektorProspectus,
  jovianSaturnPhotometry,
  jovianSaturnDan,
] as unknown as GeneratedAsteroidMission[]
```

- [ ] **Step 3: Map it to its offer message**

In `src/views/MapViewController.ts:260-266`, add the entry. The offer message id is `'jovian-prospection-hektor-prospectus-offer'` — an inbox message we'll author in Task 3.

```ts
const SPECIAL_MISSION_OFFER_IDS: Record<string, string> = {
  'consortium-certification': 'consortium-certification-offer',
  'jovian-prospection-hektor-photometry': 'jovian-prospection-hektor-photometry-offer',
  'jovian-prospection-hektor-dan': 'jovian-prospection-hektor-dan-offer',
  'jovian-prospection-hektor-prospectus': 'jovian-prospection-hektor-prospectus-offer',
  'jovian-prospection-saturn-photometry': 'jovian-prospection-saturn-photometry-offer',
  'jovian-prospection-saturn-dan': 'jovian-prospection-saturn-dan-offer',
}
```

- [ ] **Step 4: Verify the mission is loadable**

```bash
bun run type-check
bun test:unit src/lib/missions/__tests__
```

Expected: PASS. `getSpecialMissionById('jovian-prospection-hektor-prospectus')` should return a deep-cloned mission with the prospectus-terminal objective.

- [ ] **Step 5: Commit**

```bash
git add src/data/missions/jovian-prospection-hektor-prospectus.json \
        src/lib/missions/specialMissions.ts \
        src/views/MapViewController.ts
git commit -m "feat(missions): author Hektor prospectus special mission"
```

---

## Task 3: Author the OP 9 offer inbox message

**Files:**
- Modify: `src/lib/messages/messageCatalog.ts`

- [ ] **Step 1: Audit existing OP-N offer messages**

Grep `messageCatalog.ts` for `'jovian-prospection-hektor-dan-offer'`. Copy that block's structure verbatim — id, fromId, fromName, subject, body, attachments — and produce a sibling block for `'jovian-prospection-hektor-prospectus-offer'`.

- [ ] **Step 2: Add the new offer message**

```ts
{
  id: 'jovian-prospection-hektor-prospectus-offer',
  fromId: 'jovian-society',
  fromName: 'Jovian Society',
  subject: 'OP 9 — Prospectus Compilation & Transmission',
  body: [
    'Pilot,',
    "Eight deliverables clean. The Society is grateful for the data quality you've returned across both instrumentation series.",
    'Final assignment: travel to Asset 2306-J in the Jovian Trojans. There is a Society-provisioned terminal on the surface, near your previous landing zone. Approach the terminal and review the assembled report — your readings, our analysis, the recommended disposition. Confirm transmission to Cloud City Asset Strategy at your discretion.',
    "The Society will be reviewing the asset for full extraction queueing on receipt of your confirmation. You'll find a closeout bonus structure attached commensurate with the size of the asset class.",
    'There is no further fieldwork after this step. Welcome, in advance, to the manifest.',
    '— Vance',
  ],
}
```

The body mirrors the contract step's `flavor` array at `jovian-society-prospection.json:158-165`. Both copies are intentional: the contract step's flavor is the contract-system-driven message, and the offer message is the one auto-staged by `MapViewController` when the special mission becomes the active asteroid mission.

- [ ] **Step 3: Run lint + type-check**

```bash
bun run type-check && bun run lint
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/messages/messageCatalog.ts
git commit -m "feat(messages): add Jovian OP 9 prospectus offer message"
```

---

## Task 4: Wire `specialMissionId` onto the choice-mission step

**Files:**
- Modify: `src/lib/contracts/contractTypes.ts:279-294` (`ChoiceMissionStep`)
- Modify: `src/data/contracts/jovian-society-prospection.json:148-166`
- Modify: `src/views/MapViewController.ts:4045-4061` (`handleContractStepActivated`) — verify it accepts choice-mission steps
- Test: `src/lib/contracts/__tests__/jovian-contract.spec.ts` — add a step-activation test

- [ ] **Step 1: Read `handleContractStepActivated`**

It reads `payload.specialMissionId` from the activation payload. Confirm `runtime.ts` (`onStepActivated`) sources `specialMissionId` for **every** step kind, not just `complete-missions`. If only `complete-missions` is wired, extend it.

```bash
grep -n "specialMissionId" src/lib/contracts/runtime.ts src/lib/contracts/ContractSystem.ts
```

The activation payload type in `ContractSystem.ts:185` shows `specialMissionId: string | null`. Verify the `notifyStepActivated` private method (`ContractSystem.ts:801`) reads `step.specialMissionId` regardless of `step.kind`. If it gates on `kind === 'complete-missions'`, broaden the gate.

- [ ] **Step 2: Add `specialMissionId?` to `ChoiceMissionStep`**

In `src/lib/contracts/contractTypes.ts:279-294`:

```ts
export interface ChoiceMissionStep {
  /** Discriminator. */
  kind: 'choice-mission'
  /** Mission id presented to the choice-mission runner. */
  missionId: string
  /** Authored kind name for the runner (e.g. `'terminal-prospectus'`). */
  minigameType: string
  /** Asset ref the choice-mission spawns at (matches `Contract.pinnedAssets[].assetRef`). */
  pinnedAssetRef?: string
  /**
   * Special asteroid mission id that auto-stages on step activation. The
   * mission's objective spawns the terminal POI in `/level`; the overlay's
   * resolve callback fires `notifyChoiceResolved`.
   */
  specialMissionId?: string
  /** Authored outcomes; one is selected by the player. */
  outcomes: ChoiceMissionOutcome[]
  /** Authored summary for the step's flavor message subject. */
  subject: string
  /** Authored body paragraphs for the step's flavor message. */
  flavor: string[]
}
```

- [ ] **Step 3: Add `specialMissionId` to step 9 of the Jovian contract JSON**

In `src/data/contracts/jovian-society-prospection.json:148-156`:

```json
{
  "kind": "choice-mission",
  "missionId": "jovian_final_prospectus",
  "minigameType": "terminal-prospectus",
  "pinnedAssetRef": "hektor",
  "specialMissionId": "jovian-prospection-hektor-prospectus",
  "outcomes": [
    { "outcomeId": "transmit", "label": "Transmit Report", "creditsReward": 5000 },
    { "outcomeId": "tamper", "label": "Tamper Report", "creditsReward": 0 }
  ],
  "subject": "OP 9 — Prospectus Compilation & Transmission",
  "flavor": [...]
}
```

- [ ] **Step 4: Write a step-activation test for the choice-mission step**

In `src/lib/contracts/__tests__/jovian-contract.spec.ts`, add a test asserting that when the contract reaches step 9, `onStepActivated` fires with `specialMissionId === 'jovian-prospection-hektor-prospectus'`. Mirror the existing tests at lines 60–91 of that file (which assert the photometry/DAN steps emit their `specialMissionId`).

```ts
it('emits specialMissionId on activation of step 9 (choice-mission)', () => {
  const events: ContractStepActivatedPayload[] = []
  contracts.subscribeStepActivated((p) => events.push(p))
  // Drive the contract to step 9 — easiest path: forceAccept then advanceStepForTests 8 times.
  contracts.offerForTests('jovian-society-prospection')
  contracts.acceptContract('jovian-society-prospection')
  for (let i = 0; i < 8; i++) contracts.advanceStepForTests('jovian-society-prospection')
  const last = events[events.length - 1]
  expect(last?.specialMissionId).toBe('jovian-prospection-hektor-prospectus')
})
```

If `subscribeStepActivated` doesn't exist by that name, find the equivalent registration in `runtime.ts:208` (`contractStepActivatedListeners`).

- [ ] **Step 5: Run tests**

```bash
bun test:unit src/lib/contracts/__tests__/jovian-contract.spec.ts
bun run type-check
```

Expected: PASS — including the new test. If the test fails because `notifyStepActivated` ignores `kind: 'choice-mission'`, fix the gate in `ContractSystem.ts:801` (whatever method walks step kinds).

- [ ] **Step 6: Commit**

```bash
git add src/lib/contracts/contractTypes.ts \
        src/data/contracts/jovian-society-prospection.json \
        src/lib/contracts/__tests__/jovian-contract.spec.ts \
        src/lib/contracts/ContractSystem.ts # only if step 1 required a fix
git commit -m "feat(contracts): wire specialMissionId on jovian choice-mission step 9"
```

---

## Task 5: Procedural lightcurve generator (pure function + tests)

**Files:**
- Create: `src/lib/minigame/prospectus/photometryLightcurve.ts`
- Create: `src/lib/minigame/prospectus/__tests__/photometryLightcurve.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/minigame/prospectus/__tests__/photometryLightcurve.spec.ts
import { describe, it, expect } from 'vitest'
import { generatePhotometryLightcurve } from '@/lib/minigame/prospectus/photometryLightcurve'

describe('generatePhotometryLightcurve', () => {
  it('produces a stable plot for a fixed seed', () => {
    const a = generatePhotometryLightcurve('hektor-photometry', 64)
    const b = generatePhotometryLightcurve('hektor-photometry', 64)
    expect(a).toEqual(b)
    expect(a).toHaveLength(64)
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('produces different plots for different seeds', () => {
    const a = generatePhotometryLightcurve('hektor-photometry', 64)
    const b = generatePhotometryLightcurve('saturn-photometry', 64)
    expect(a).not.toEqual(b)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test:unit src/lib/minigame/prospectus/__tests__/photometryLightcurve.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the generator**

Use `hashSeed` from `src/lib/missions/asteroidMissionGenerator.ts` plus a mulberry32 PRNG (the same PRNG used in `levelContext.ts:117-141`). Sum two sinusoids whose frequencies are seed-derived and clamp to `[0, 1]`. The output reads as "rotational lightcurve": a periodic signal with amplitude variance.

```ts
/**
 * Procedural photometry lightcurve sampler. Deterministic per seed string —
 * used by the prospectus overlay's photometry summary canvas.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-29-jovian-prospectus-minigame-design.md
 */
import { hashSeed } from '@/lib/missions/asteroidMissionGenerator'

/** Number of samples in the default lightcurve render. */
export const DEFAULT_LIGHTCURVE_SAMPLE_COUNT = 64

/** Base-period frequency in cycles across the sample window. */
const PRIMARY_FREQUENCY_CYCLES = 1.5

/** Secondary harmonic frequency multiplier (added richness). */
const SECONDARY_FREQUENCY_MULT = 3.1

/** Primary lobe amplitude in normalized magnitude. */
const PRIMARY_AMPLITUDE = 0.32

/** Secondary lobe amplitude in normalized magnitude. */
const SECONDARY_AMPLITUDE = 0.12

/** Per-sample noise amplitude in normalized magnitude. */
const NOISE_AMPLITUDE = 0.04

/** Mid-baseline of the curve in normalized magnitude. */
const BASELINE = 0.5

/**
 * Sample a deterministic photometric lightcurve.
 *
 * @param seedString - Stable seed (e.g. `'hektor-photometry'`).
 * @param sampleCount - Number of samples to produce.
 * @returns Array of `sampleCount` values in `[0, 1]`.
 */
export function generatePhotometryLightcurve(
  seedString: string,
  sampleCount: number = DEFAULT_LIGHTCURVE_SAMPLE_COUNT,
): number[] {
  const seed = hashSeed(seedString)
  let s = (seed ^ 0x9e3779b9) >>> 0
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const phase = next() * Math.PI * 2
  const out: number[] = new Array(sampleCount)
  for (let i = 0; i < sampleCount; i++) {
    const t = (i / sampleCount) * Math.PI * 2
    const primary = Math.sin(t * PRIMARY_FREQUENCY_CYCLES + phase) * PRIMARY_AMPLITUDE
    const secondary = Math.cos(t * SECONDARY_FREQUENCY_MULT) * SECONDARY_AMPLITUDE
    const noise = (next() - 0.5) * 2 * NOISE_AMPLITUDE
    out[i] = Math.max(0, Math.min(1, BASELINE + primary + secondary + noise))
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test:unit src/lib/minigame/prospectus/__tests__/photometryLightcurve.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/minigame/prospectus/
git commit -m "feat(prospectus): seed-stable photometry lightcurve generator"
```

---

## Task 6: Procedural DAN histogram generator (pure function + tests)

**Files:**
- Create: `src/lib/minigame/prospectus/danHistogram.ts`
- Create: `src/lib/minigame/prospectus/__tests__/danHistogram.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/minigame/prospectus/__tests__/danHistogram.spec.ts
import { describe, it, expect } from 'vitest'
import { generateDanHistogram } from '@/lib/minigame/prospectus/danHistogram'

describe('generateDanHistogram', () => {
  it('produces a stable histogram for a fixed seed', () => {
    const a = generateDanHistogram('hektor-dan', 24)
    const b = generateDanHistogram('hektor-dan', 24)
    expect(a).toEqual(b)
    expect(a).toHaveLength(24)
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('produces different histograms for different seeds', () => {
    expect(generateDanHistogram('hektor-dan', 24)).not.toEqual(
      generateDanHistogram('saturn-dan', 24),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test:unit src/lib/minigame/prospectus/__tests__/danHistogram.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the generator**

Volatile signature is a multi-modal distribution: two Gaussian-ish bumps plus low-amplitude noise. Use the same mulberry32 PRNG as Task 5 — duplicate the `next` helper rather than abstracting prematurely (YAGNI; two consumers).

```ts
/**
 * Procedural DAN neutron-flux histogram. Deterministic per seed string —
 * used by the prospectus overlay's DAN summary canvas.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-29-jovian-prospectus-minigame-design.md
 */
import { hashSeed } from '@/lib/missions/asteroidMissionGenerator'

/** Number of bins in the default histogram. */
export const DEFAULT_HISTOGRAM_BIN_COUNT = 24

/** Center of the primary volatile peak as a fraction of the bin range. */
const PRIMARY_PEAK_CENTER = 0.35

/** Center of the secondary volatile peak as a fraction of the bin range. */
const SECONDARY_PEAK_CENTER = 0.72

/** Width of each peak (in bin-fraction units). */
const PEAK_WIDTH = 0.09

/** Primary peak amplitude in normalized flux. */
const PRIMARY_PEAK_AMPLITUDE = 0.78

/** Secondary peak amplitude in normalized flux. */
const SECONDARY_PEAK_AMPLITUDE = 0.45

/** Per-bin noise amplitude in normalized flux. */
const NOISE_AMPLITUDE = 0.06

/**
 * Sample a deterministic DAN histogram (normalized flux per bin).
 *
 * @param seedString - Stable seed (e.g. `'hektor-dan'`).
 * @param binCount - Number of histogram bins.
 * @returns Array of `binCount` values in `[0, 1]`.
 */
export function generateDanHistogram(
  seedString: string,
  binCount: number = DEFAULT_HISTOGRAM_BIN_COUNT,
): number[] {
  const seed = hashSeed(seedString)
  let s = (seed ^ 0x9e3779b9) >>> 0
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out: number[] = new Array(binCount)
  for (let i = 0; i < binCount; i++) {
    const x = i / (binCount - 1)
    const primary =
      PRIMARY_PEAK_AMPLITUDE * Math.exp(-Math.pow(x - PRIMARY_PEAK_CENTER, 2) / (2 * PEAK_WIDTH * PEAK_WIDTH))
    const secondary =
      SECONDARY_PEAK_AMPLITUDE * Math.exp(-Math.pow(x - SECONDARY_PEAK_CENTER, 2) / (2 * PEAK_WIDTH * PEAK_WIDTH))
    const noise = (next() - 0.5) * 2 * NOISE_AMPLITUDE
    out[i] = Math.max(0, Math.min(1, primary + secondary + noise))
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test:unit src/lib/minigame/prospectus/__tests__/danHistogram.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/minigame/prospectus/danHistogram.ts \
        src/lib/minigame/prospectus/__tests__/danHistogram.spec.ts
git commit -m "feat(prospectus): seed-stable DAN histogram generator"
```

---

## Task 7: Asset-card data binding helper

**Files:**
- Create: `src/lib/minigame/prospectus/prospectusAssetCard.ts`
- Create: `src/lib/minigame/prospectus/__tests__/prospectusAssetCard.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/minigame/prospectus/__tests__/prospectusAssetCard.spec.ts
import { describe, it, expect } from 'vitest'
import { buildProspectusAssetCard } from '@/lib/minigame/prospectus/prospectusAssetCard'

describe('buildProspectusAssetCard', () => {
  it('binds Hektor catalog values', () => {
    const card = buildProspectusAssetCard('hektor')
    expect(card.assetRef).toBe('ASSET 2306-J')
    expect(card.crossRef).toContain('624 HEKTOR')
    expect(card.region).toMatch(/Jovian Trojans/i)
    expect(card.diameterKm).toBeGreaterThan(0)
    expect(card.composition).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: expect.any(String), percentage: expect.any(Number) }),
      ]),
    )
    // Recommendation flavor is fixed copy.
    expect(card.recommendation).toMatch(/extraction queue/)
    expect(card.recommendation).toMatch(/demolition cycle/)
  })

  it('returns null for unknown body ids', () => {
    expect(buildProspectusAssetCard('unknown-body')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test:unit src/lib/minigame/prospectus/__tests__/prospectusAssetCard.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Pull from `getAsteroidById('hektor')`. The asset-ref label `'ASSET 2306-J'` is hardcoded for the Jovian-Trojan asset; the cross-ref label is computed from the catalog entry's display name + L-point. Region label is title-cased from the catalog's region.

```ts
/**
 * Build the Society's prospectus asset card from an asteroid catalog entry.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-29-jovian-prospectus-minigame-design.md
 */
import { getAsteroidById } from '@/lib/asteroids/catalog'

/** Hardcoded Society ledger ref for Hektor (per spec asset-card section). */
const HEKTOR_ASSET_REF = 'ASSET 2306-J'

/** Hardcoded recommendation copy — the dramatic beat. */
const RECOMMENDATION_BODY =
  'Asset is composition-rich and volatiles-positive. Asset is recommended for full extraction queue. Estimated yield value: ~2.8B credits over a 14-month demolition cycle. No habitation. No biological signature. No protected status.'

/** Composition row mirrors `AsteroidDefinition.composition[i]`. */
export interface ProspectusCompositionRow {
  /** Display name (e.g. `'Carbonaceous Chondrite'`). */
  name: string
  /** Percentage `0..100`. */
  percentage: number
}

/** Asset-card data shape consumed by the overlay template. */
export interface ProspectusAssetCard {
  /** Society ledger label (e.g. `'ASSET 2306-J'`). */
  assetRef: string
  /** Astronomical cross-ref line (e.g. `'Cross-ref: 624 HEKTOR (L4)'`). */
  crossRef: string
  /** Region label (e.g. `'Jovian Trojans · L4 leading cluster'`). */
  region: string
  /** Composition class string (e.g. `'D-type · contact binary'`). */
  classLabel: string
  /** Mean diameter in km. */
  diameterKm: number
  /** Composition rows for the photometry/DAN summary text. */
  composition: ProspectusCompositionRow[]
  /** Fixed recommendation flavor body. */
  recommendation: string
}

/**
 * Build the prospectus asset card for a given catalog body. Returns `null`
 * when the body id is unknown — overlay falls back to a placeholder card.
 *
 * @param bodyId - Asteroid catalog id (e.g. `'hektor'`).
 * @returns Card data or `null`.
 */
export function buildProspectusAssetCard(bodyId: string): ProspectusAssetCard | null {
  const def = getAsteroidById(bodyId)
  if (!def) return null
  return {
    assetRef: HEKTOR_ASSET_REF,
    crossRef: `Cross-ref: ${def.designation ?? def.name.toUpperCase()} (L4)`,
    region: 'Jovian Trojans · L4 leading cluster',
    classLabel: 'D-type · contact binary',
    diameterKm: def.diameterKm ?? 0,
    composition: def.composition.map((c) => ({ name: c.name, percentage: c.percentage })),
    recommendation: RECOMMENDATION_BODY,
  }
}
```

If `AsteroidDefinition` lacks `designation` or `diameterKm`, swap to the actual field names exposed by `src/lib/asteroids/types.ts` and `src/data/asteroids/hektor.json`. The Hektor entry already has the composition list with the percentages cited in the spec.

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test:unit src/lib/minigame/prospectus/__tests__/prospectusAssetCard.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/minigame/prospectus/prospectusAssetCard.ts \
        src/lib/minigame/prospectus/__tests__/prospectusAssetCard.spec.ts
git commit -m "feat(prospectus): asset card data binding"
```

---

## Task 8: Audio cues (synthesized via Howler, relayAudio.ts pattern)

**Files:**
- Create: `src/lib/minigame/prospectus/prospectusAudio.ts`

- [ ] **Step 1: Read the precedent**

Open `src/lib/minigame/relayRepair/relayAudio.ts`. Note the constructor pattern (master gain, persistent oscillator graph, `setQuality()`, `dispose()`). Note that this is a class with three sample-or-synth members and an exposed `playX()` per cue.

- [ ] **Step 2: Implement `ProspectusAudio`**

Three named cues. Synthesize with Howler oscillator nodes (no asset loading) — per spec open-question 1, plan 6 ships synthesized. Plan 7 may swap in samples.

- `ambient`: low corporate hum loop, 110 Hz fundamental + 220 Hz harmonic at 0.5x, very low gain (0.06). Loops on `play()` until `stopAmbient()` is called.
- `transmit`: 0.5s clean confirm chord — root + perfect-fifth (e.g. 392 Hz + 587 Hz, A4-style intervals), short attack, exponential decay to silence.
- `tamper`: 0.4s data-corruption glitch — three short staccato bursts at random pitches in a low-mid range, plus white-noise burst at the start. Cold timbre.

```ts
/**
 * Synthesized audio for the prospectus overlay. Three cues:
 * a corporate-hum ambient loop, a clean transmit chord, and a
 * data-corruption tamper glitch.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-29-jovian-prospectus-minigame-design.md
 */

/** Master peak gain shared across all three cues (avoid clipping over UI audio). */
const MASTER_PEAK = 0.18

// Constants for each cue follow — pull tuning numbers out as named constants
// (no magic numbers per CLAUDE.md). Frequencies, attack/decay times, harmonic
// ratios all named.

export class ProspectusAudio {
  // ... fields
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  // ...

  /** Lazy-init the audio graph on first play (so SSR / tests don't construct AudioContext). */
  private ensureGraph(): void { /* ... */ }

  /** Start the ambient hum loop. Idempotent. */
  playAmbient(): void { /* ... */ }

  /** Stop the ambient hum loop. Idempotent. */
  stopAmbient(): void { /* ... */ }

  /** Fire the transmit confirm chord (one-shot). */
  playTransmit(): void { /* ... */ }

  /** Fire the tamper glitch (one-shot). */
  playTamper(): void { /* ... */ }

  /** Tear down all nodes — called on overlay unmount. */
  dispose(): void { /* ... */ }
}
```

The implementer fills in the synthesis bodies modeled on `relayAudio.ts`. Keep the file under ~200 lines; lift constants for every numeric parameter; TSDoc on every public method.

- [ ] **Step 3: Type-check + lint**

```bash
bun run type-check && bun run lint
```

Expected: clean. No unit test for synthesis — we manually verify in the smoke test (Task 13).

- [ ] **Step 4: Commit**

```bash
git add src/lib/minigame/prospectus/prospectusAudio.ts
git commit -m "feat(prospectus): synthesized audio cues (ambient/transmit/tamper)"
```

---

## Task 9: ProspectusOverlay.vue (rendering only, no resolve wiring yet)

**Files:**
- Create: `src/components/ProspectusOverlay.vue`
- Create: `src/assets/css/prospectus-overlay.css`
- Modify: `src/assets/css/main.css` — add `@import './prospectus-overlay.css';`
- Create: `src/components/__tests__/ProspectusOverlay.spec.ts`

- [ ] **Step 1: Write the failing render test**

```ts
// src/components/__tests__/ProspectusOverlay.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProspectusOverlay from '@/components/ProspectusOverlay.vue'

describe('ProspectusOverlay', () => {
  it('renders header, asset card, recommendation, and both CTAs for hektor', () => {
    const wrapper = mount(ProspectusOverlay, {
      props: { bodyId: 'hektor', onResolve: () => {} },
    })
    const html = wrapper.html()
    expect(html).toContain('JOVIAN SOCIETY')
    expect(html).toContain('Prospectus Compilation')
    expect(html).toContain('ASSET 2306-J')
    expect(html).toContain('624 HEKTOR')
    expect(html).toContain('extraction queue')
    expect(html).toContain('TRANSMIT')
    expect(html).toContain('TAMPER')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test:unit src/components/__tests__/ProspectusOverlay.spec.ts
```

Expected: FAIL — component not found.

- [ ] **Step 3: Build the component shell (no resolve wiring)**

```vue
<!--
  ProspectusOverlay.vue — Jovian Society terminal readout for contract step 9.
  Two CTAs (TRANSMIT / TAMPER) call `onResolve` with the chosen outcome id.

  @author guinetik
  @date 2026-04-30
  @spec docs/superpowers/specs/2026-04-29-jovian-prospectus-minigame-design.md
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { buildProspectusAssetCard } from '@/lib/minigame/prospectus/prospectusAssetCard'
import { generatePhotometryLightcurve } from '@/lib/minigame/prospectus/photometryLightcurve'
import { generateDanHistogram } from '@/lib/minigame/prospectus/danHistogram'

const props = defineProps<{
  /** Asteroid catalog id (drives asset-card binding). */
  bodyId: string
  /** Resolve handler — fired exactly once with the chosen outcome. */
  onResolve: (outcomeId: 'transmit' | 'tamper') => void
}>()

const card = computed(() => buildProspectusAssetCard(props.bodyId))
const photometryCanvas = ref<HTMLCanvasElement | null>(null)
const danCanvas = ref<HTMLCanvasElement | null>(null)

// State machine: idle | awaiting-choice | resolving | resolved.
// Hot CTAs only in awaiting-choice. Lockout in resolving prevents double-fire.
type OverlayPhase = 'idle' | 'awaiting-choice' | 'resolving' | 'resolved'
const phase = ref<OverlayPhase>('idle')

onMounted(() => {
  // Render canvases.
  drawLightcurve()
  drawHistogram()
  // ~1.5s settle so the player has a beat to read.
  window.setTimeout(() => {
    if (phase.value === 'idle') phase.value = 'awaiting-choice'
  }, 1500)
  window.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
})

/** Society blue accent used for the photometry stroke and DAN bars. */
const SOCIETY_BLUE = '#2C5BB0'
/** Near-black canvas background. */
const CANVAS_BG = '#0c1118'

function drawLightcurve(): void {
  const cv = photometryCanvas.value
  if (!cv) return
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const samples = generatePhotometryLightcurve('hektor-photometry', cv.width)
  ctx.fillStyle = CANVAS_BG
  ctx.fillRect(0, 0, cv.width, cv.height)
  ctx.strokeStyle = SOCIETY_BLUE
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = 0; i < samples.length; i++) {
    const x = i
    const y = cv.height - (samples[i] ?? 0) * cv.height
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

function drawHistogram(): void {
  const cv = danCanvas.value
  if (!cv) return
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const bins = generateDanHistogram('hektor-dan')
  ctx.fillStyle = CANVAS_BG
  ctx.fillRect(0, 0, cv.width, cv.height)
  ctx.fillStyle = SOCIETY_BLUE
  const binWidth = cv.width / bins.length
  for (let i = 0; i < bins.length; i++) {
    const h = (bins[i] ?? 0) * cv.height
    ctx.fillRect(i * binWidth, cv.height - h, binWidth - 1, h)
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (phase.value !== 'awaiting-choice') return
  if (e.key === 'e' || e.key === 'E') return resolve('transmit')
  if (e.key === 'q' || e.key === 'Q') return resolve('tamper')
}

function resolve(outcomeId: 'transmit' | 'tamper'): void {
  if (phase.value !== 'awaiting-choice') return
  phase.value = 'resolving'
  // Audio fires here in Task 11 wiring.
  window.setTimeout(() => {
    phase.value = 'resolved'
    props.onResolve(outcomeId)
  }, 1500)
}
</script>

<template>
  <div class="prospectus-overlay" data-test="prospectus-overlay">
    <div class="prospectus-overlay__panel">
      <header class="prospectus-overlay__header">
        <span class="prospectus-overlay__logo">☁</span>
        <div>
          <div class="prospectus-overlay__brand">JOVIAN SOCIETY</div>
          <div class="prospectus-overlay__subbrand">ASSET STRATEGY · INTERNAL</div>
          <div class="prospectus-overlay__title">Prospectus Compilation</div>
          <div class="prospectus-overlay__cohort">Cohort: Q4 / 2306</div>
        </div>
      </header>

      <section v-if="card" class="prospectus-overlay__asset-card">
        <div class="prospectus-overlay__asset-ref">{{ card.assetRef }} · {{ card.crossRef }}</div>
        <div>Region: {{ card.region }}</div>
        <div>Class: {{ card.classLabel }}</div>
        <div>Mean diameter: {{ card.diameterKm }} km</div>
        <div>Status: Pending disposition</div>
      </section>

      <section class="prospectus-overlay__photometry">
        <canvas ref="photometryCanvas" width="280" height="80" />
        <ul v-if="card" class="prospectus-overlay__composition">
          <li v-for="row in card.composition" :key="row.name">
            {{ row.name }}: {{ row.percentage }}%
          </li>
        </ul>
      </section>

      <section class="prospectus-overlay__dan">
        <canvas ref="danCanvas" width="280" height="80" />
        <ul class="prospectus-overlay__dan-labels">
          <li>Subsurface volatile signature: STRONG</li>
          <li>Lattice-positive bands: 6</li>
          <li>Phobos reference family match: 87%</li>
        </ul>
      </section>

      <section class="prospectus-overlay__recommendation">
        <h3>RECOMMENDATION</h3>
        <p v-if="card">{{ card.recommendation }}</p>
      </section>

      <footer class="prospectus-overlay__ctas">
        <button
          type="button"
          class="prospectus-overlay__cta prospectus-overlay__cta--transmit"
          :disabled="phase !== 'awaiting-choice'"
          @click="resolve('transmit')"
        >
          [E] TRANSMIT REPORT — recommended
        </button>
        <button
          type="button"
          class="prospectus-overlay__cta prospectus-overlay__cta--tamper"
          :disabled="phase !== 'awaiting-choice'"
          @click="resolve('tamper')"
        >
          [Q] Tamper Report
        </button>
      </footer>
    </div>
  </div>
</template>
```

Notes:
- No `<style>` blocks per CLAUDE.md.
- `bodyId` and `onResolve` are the only props (per spec).
- Keep `drawLightcurve` / `drawHistogram` body to a few lines: clear canvas, derive samples, stroke a polyline / draw bars in Society blue (`#2C5BB0`) on near-black background.

- [ ] **Step 4: Add the sibling CSS file**

Create `src/assets/css/prospectus-overlay.css` with `@apply` utility classes — fixed-positioned full-screen dim, centered panel, monospaced text, near-black bg, off-white text, Society-blue accents on headings + recommendation border. Mirror `dan-scan-panel.css` for the structural patterns.

```css
.prospectus-overlay {
  @apply fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm;
}

.prospectus-overlay__panel {
  @apply font-mono text-stone-100 bg-stone-950 border border-blue-700/60 rounded-md p-6 max-w-2xl w-full;
}

/* ... etc — header, brand, asset-ref, recommendation box, CTAs */
.prospectus-overlay__cta--transmit {
  @apply bg-emerald-600/90 text-white px-4 py-2 rounded font-bold disabled:opacity-50;
}

.prospectus-overlay__cta--tamper {
  @apply bg-stone-700/40 text-stone-400 px-3 py-1 text-sm rounded disabled:opacity-50;
}
```

- [ ] **Step 5: Import the CSS in `main.css`**

In `src/assets/css/main.css`, add:

```css
@import './prospectus-overlay.css';
```

Place beside the other overlay CSS imports (e.g. `dan-scan-panel.css`).

- [ ] **Step 6: Run the test**

```bash
bun test:unit src/components/__tests__/ProspectusOverlay.spec.ts
bun run type-check && bun run lint
```

Expected: PASS, no warnings.

- [ ] **Step 7: Commit**

```bash
git add src/components/ProspectusOverlay.vue \
        src/components/__tests__/ProspectusOverlay.spec.ts \
        src/assets/css/prospectus-overlay.css \
        src/assets/css/main.css
git commit -m "feat(prospectus): overlay component with asset card, graphs, and CTAs"
```

---

## Task 10: Overlay CTA bindings + lockout tests

**Files:**
- Modify: `src/components/__tests__/ProspectusOverlay.spec.ts`

- [ ] **Step 1: Write the CTA + lockout tests**

Append to the existing spec:

```ts
import { vi } from 'vitest'

it('fires onResolve("transmit") on E key after the settle window', async () => {
  vi.useFakeTimers()
  const onResolve = vi.fn()
  mount(ProspectusOverlay, { props: { bodyId: 'hektor', onResolve }, attachTo: document.body })
  vi.advanceTimersByTime(1600) // past the 1.5s idle → awaiting-choice settle
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))
  vi.advanceTimersByTime(1600) // past the 1.5s resolving → resolved lockout
  expect(onResolve).toHaveBeenCalledTimes(1)
  expect(onResolve).toHaveBeenCalledWith('transmit')
  vi.useRealTimers()
})

it('fires onResolve("tamper") on Q key', async () => {
  vi.useFakeTimers()
  const onResolve = vi.fn()
  mount(ProspectusOverlay, { props: { bodyId: 'hektor', onResolve }, attachTo: document.body })
  vi.advanceTimersByTime(1600)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }))
  vi.advanceTimersByTime(1600)
  expect(onResolve).toHaveBeenCalledTimes(1)
  expect(onResolve).toHaveBeenCalledWith('tamper')
  vi.useRealTimers()
})

it('does not refire onResolve when E is pressed twice', async () => {
  vi.useFakeTimers()
  const onResolve = vi.fn()
  mount(ProspectusOverlay, { props: { bodyId: 'hektor', onResolve }, attachTo: document.body })
  vi.advanceTimersByTime(1600)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }))
  vi.advanceTimersByTime(1600)
  expect(onResolve).toHaveBeenCalledTimes(1)
  expect(onResolve).toHaveBeenCalledWith('transmit')
  vi.useRealTimers()
})
```

- [ ] **Step 2: Run tests**

```bash
bun test:unit src/components/__tests__/ProspectusOverlay.spec.ts
```

Expected: PASS — Task 9's component already includes the state machine + key handler. If a test fails, the component shell is wrong, not the test — fix the component.

- [ ] **Step 3: Commit**

```bash
git add src/components/__tests__/ProspectusOverlay.spec.ts
git commit -m "test(prospectus): CTA bindings + resolving lockout"
```

---

## Task 11: Wire audio into ProspectusOverlay

**Files:**
- Modify: `src/components/ProspectusOverlay.vue`

- [ ] **Step 1: Instantiate `ProspectusAudio` in the overlay**

In the `<script setup>` of `ProspectusOverlay.vue`:

```ts
import { ProspectusAudio } from '@/lib/minigame/prospectus/prospectusAudio'

let audio: ProspectusAudio | null = null

onMounted(() => {
  audio = new ProspectusAudio()
  audio.playAmbient()
  drawLightcurve()
  drawHistogram()
  window.setTimeout(() => {
    if (phase.value === 'idle') phase.value = 'awaiting-choice'
  }, 1500)
  window.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  audio?.stopAmbient()
  audio?.dispose()
  audio = null
  window.removeEventListener('keydown', onKeydown, true)
})

function resolve(outcomeId: 'transmit' | 'tamper'): void {
  if (phase.value !== 'awaiting-choice') return
  phase.value = 'resolving'
  audio?.stopAmbient()
  if (outcomeId === 'transmit') audio?.playTransmit()
  else audio?.playTamper()
  window.setTimeout(() => {
    phase.value = 'resolved'
    props.onResolve(outcomeId)
  }, 1500)
}
```

- [ ] **Step 2: Verify tests still pass**

```bash
bun test:unit src/components/__tests__/ProspectusOverlay.spec.ts
```

Expected: PASS — JSDOM doesn't implement `AudioContext`, so the `ensureGraph()` lazy-init in Task 8 must guard against missing AudioContext (e.g. `if (typeof AudioContext === 'undefined') return`). If a test fails because of `AudioContext`, fix the guard in `ProspectusAudio.ensureGraph` and re-run.

- [ ] **Step 3: Commit**

```bash
git add src/components/ProspectusOverlay.vue src/lib/minigame/prospectus/prospectusAudio.ts
git commit -m "feat(prospectus): wire ambient/transmit/tamper audio to overlay"
```

---

## Task 12: Spawn the terminal POI in `/level` for prospectus-terminal objectives

**Files:**
- Modify: `src/views/LevelViewController.ts`
- Modify: `src/views/LevelView.vue`

This task is the largest. Audit the survey-objective spawn path (`TerminalModel` placement + `terminalPrompt` ref-driven `[E]` text) before editing — it's the precedent.

- [ ] **Step 1: Audit existing patterns**

Search `LevelViewController.ts` for the survey kiosk spawn site and the `terminalPrompt`-driving callback. Survey objectives use `TerminalModel` and set the prompt when the player is within range. The prospectus-terminal flow is the same minus the survey-specific data. Note the line numbers — you'll add a parallel branch.

- [ ] **Step 2: Spawn `TerminalModel` for `prospectus-terminal` objectives**

In `LevelViewController.ts`, where the controller iterates `mission.objectives` to spawn apparatus (look for the survey/photometry/dan branches), add:

```ts
if (objective.type === 'prospectus-terminal') {
  const terminal = new TerminalModel(/* args mirroring survey */)
  terminal.position.set(objective.x, /* terrain-y at x,z */, objective.z)
  // Re-tint the screen emissive to Society blue.
  terminal.setScreenEmissive(0x2c5bb0)
  this.scene.add(terminal.group)
  this.prospectusTerminal = terminal
  continue
}
```

Add a private `prospectusTerminal: TerminalModel | null = null` field and dispose it in the existing teardown path that disposes the survey kiosk. If `TerminalModel` doesn't expose `setScreenEmissive`, add a minimal setter (one liner) — keep the change scoped.

- [ ] **Step 3: Drive the `[E] OPEN PROSPECTUS` prompt**

In the per-frame proximity check that already drives `terminalPrompt` for survey/dan objectives, add a branch:

```ts
if (this.prospectusTerminal && /* player within ~3.5 world units of the pylon */) {
  this.onTerminalPrompt?.('[E] OPEN PROSPECTUS')
  this.prospectusInteractReady = true
} else {
  this.prospectusInteractReady = false
}
```

Add a public `prospectusInteractReady: boolean` (or a getter) and a public callback `onProspectusOpen: (() => void) | null = null`. When the player presses `E` and `prospectusInteractReady` is true, fire the callback.

The exact key-handling site is the same path the lander/EVA uses for survey kiosk interaction — reuse it.

- [ ] **Step 4: Mount the overlay in `LevelView.vue`**

Imports + wiring:

```ts
import ProspectusOverlay from '@/components/ProspectusOverlay.vue'
import { contractSystem } from '@/lib/contracts/ContractSystem'

const prospectusVisible = ref(false)

viewController.onProspectusOpen = () => {
  prospectusVisible.value = true
}

function handleProspectusResolve(outcomeId: 'transmit' | 'tamper'): void {
  contractSystem.notifyChoiceResolved('jovian_final_prospectus', outcomeId)
  prospectusVisible.value = false
  // The terminal screen flips to "Transmission Complete" / "Report Tampered" in
  // the world: easiest is the existing screen-emissive setter on TerminalModel,
  // green-on-transmit, red-on-tamper. Keep this minimal — one call.
  viewController.flipProspectusTerminalScreen?.(outcomeId)
}
```

Template:

```vue
<ProspectusOverlay
  v-if="prospectusVisible"
  body-id="hektor"
  :on-resolve="handleProspectusResolve"
/>
```

Pass the asteroid id from `viewController.bootContext.asteroid.id` if it differs from the hardcoded `'hektor'` — the spec explicitly limits this overlay to Hektor in plan 6, so a hardcoded literal is acceptable. Keep it `'hektor'` and revisit in plan 7 if Saturn ever needs a sibling.

- [ ] **Step 5: Type-check, lint, run all tests**

```bash
bun run type-check && bun run lint && bun test:unit
```

Expected: clean. Existing level / contract / minigame suites still green.

- [ ] **Step 6: Commit**

```bash
git add src/views/LevelViewController.ts src/views/LevelView.vue src/three/TerminalModel.ts
git commit -m "feat(level): spawn prospectus terminal POI and mount overlay on E"
```

---

## Task 13: Resolution wiring smoke test (contract-side)

**Files:**
- Modify: `src/lib/contracts/__tests__/jovian-contract.spec.ts`

- [ ] **Step 1: Write the round-trip test**

Add two tests asserting the choice-mission step resolves on both outcomes:

```ts
it('round-trips transmit through notifyChoiceResolved', () => {
  contracts.offerForTests('jovian-society-prospection')
  contracts.acceptContract('jovian-society-prospection')
  for (let i = 0; i < 8; i++) contracts.advanceStepForTests('jovian-society-prospection')
  // Now on step 9 (choice-mission).
  const ok = contracts.notifyChoiceResolved('jovian_final_prospectus', 'transmit')
  expect(ok).toBe(true)
  const inst = contracts.getInstance('jovian-society-prospection')
  expect(inst?.status).toBe('completed')
  expect(inst?.resolvedOutcomeId).toBe('transmit')
})

it('round-trips tamper through notifyChoiceResolved', () => {
  contracts.offerForTests('jovian-society-prospection')
  contracts.acceptContract('jovian-society-prospection')
  for (let i = 0; i < 8; i++) contracts.advanceStepForTests('jovian-society-prospection')
  const ok = contracts.notifyChoiceResolved('jovian_final_prospectus', 'tamper')
  expect(ok).toBe(true)
  const inst = contracts.getInstance('jovian-society-prospection')
  expect(inst?.status).toBe('completed')
  expect(inst?.resolvedOutcomeId).toBe('tamper')
})
```

If the existing `jovian-contract.spec.ts` already has equivalent tests (lines 159 / 172 hint they may), skim them: this task may collapse into "verify they still pass after Task 4's changes" with no new test added.

- [ ] **Step 2: Run tests**

```bash
bun test:unit src/lib/contracts/__tests__/jovian-contract.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/contracts/__tests__/jovian-contract.spec.ts
git commit -m "test(contracts): jovian step 9 round-trips both outcomes"
```

---

## Task 14: Re-entry — confirm the mission stays queued when `/level` exits without resolving

**Files:**
- Modify: `src/views/__tests__/MapViewController.spec.ts` (if missing, skip — manual smoke covers it)

Re-entry is largely a property of the existing `replayActiveContractStepStaging` (`MapViewController.ts:4074`). The contract instance is unchanged when the overlay is closed without `notifyChoiceResolved`, so the special mission stays the active asteroid mission, the waypoint stays at Hektor, and re-landing re-spawns the terminal POI.

- [ ] **Step 1: Verify by reading the existing replay logic**

`replayActiveContractStepStaging` walks active contract instances, finds steps with `specialMissionId`, and re-stages the mission if the active slot doesn't already hold it. Step 4's broadening of step-kind handling is what makes this work for the choice-mission step. Confirm — no test needed if the existing test suite already covers replay for `complete-missions` steps; the choice-mission step uses the same path.

- [ ] **Step 2: Manual smoke ledger entry**

Add a one-line note to the manual smoke checklist below (Task 16): re-entry round-trip is the explicit checkpoint.

(No commit — covered by Task 16.)

---

## Task 15: Add the per-outcome completion messages (verify already authored)

**Files:**
- Read-only audit: `src/data/contracts/jovian-society-prospection.json:168-200`
- Modify: `src/lib/messages/messageCatalog.ts` only if missing

- [ ] **Step 1: Confirm `completionByOutcome.transmit.completionBody` and `.tamper.completionBody` exist**

They do — see lines 169-199 of the contract JSON. Plan 2's runtime emits these directly when the choice resolves; no separate inbox-message catalog entry is needed unless `runtime.ts` looks up by id. Skim `runtime.ts` for the `onContractStepCompleted` / completion arm dispatch and confirm it uses the `completionSubject`/`completionBody` literals from the JSON, not a catalog lookup.

- [ ] **Step 2: If catalog entries are required, add them**

If the runtime only accepts catalog ids, add `'jovian-final-prospectus-transmit-completion'` and `'jovian-final-prospectus-tamper-completion'` to `messageCatalog.ts` with the exact subject/body from the contract JSON, then update `completionByOutcome` to reference them by id. Otherwise skip.

- [ ] **Step 3: Lint + commit if changed**

```bash
bun run lint
git add src/lib/messages/messageCatalog.ts src/data/contracts/jovian-society-prospection.json
git commit -m "feat(messages): jovian OP 9 completion arms (transmit/tamper)"
```

If nothing changed, no commit.

---

## Task 16: Manual end-to-end smoke + acceptance gate

- [ ] **Step 1: Run all gates**

```bash
bun run type-check
bun run lint
bun test:unit
```

Expected: all green.

- [ ] **Step 2: Manual smoke — dev shortcut path**

```bash
bun dev
```

In the browser console at `/map`:

```js
__contracts.forceAccept('jovian-society-prospection')
for (let i = 0; i < 8; i++) __contracts.advanceStep('jovian-society-prospection')
```

Verify:
- Active asteroid mission HUD shows `OP 9 — Prospectus Compilation` with a Hektor waypoint within 1 frame.
- Inbox shows the OP 9 offer message.
- Fly to Hektor, orbit, land. `/level` boots on Hektor.
- Standard terrain spawns. A Society-blue terminal pylon stands at the landing-zone POI position.
- Walking up to the pylon, `[E] OPEN PROSPECTUS` prompt appears.
- Press `E`. Overlay opens. Ambient hum begins. After ~1.5s, CTAs are interactive.
- Press `E` again. Confirm chord plays. Overlay closes after ~1.5s.
- Walk back to lander, launch, exit `/level`. On `/map`, inbox shows `Welcome To The Manifest` (transmit completion).
- `__contracts.getInstance('jovian-society-prospection').status === 'completed'`.

- [ ] **Step 3: Manual smoke — tamper path**

Reset the contract (`__contracts.resetForTests('jovian-society-prospection')` if such a helper exists, otherwise reload from a fresh save). Repeat Step 2 but press `Q` instead of `E`. Verify:
- Tamper glitch plays.
- Inbox shows `Cohort Departure Confirmed`.
- `instance.resolvedOutcomeId === 'tamper'`.

- [ ] **Step 4: Manual smoke — re-entry**

Drive the contract to step 9, fly to Hektor, land, walk to terminal, press `E`, then close the overlay (`Esc` if the overlay supports it; otherwise launch the lander mid-overlay). Exit `/level`. Confirm:
- Active asteroid mission HUD still shows `OP 9` with a Hektor waypoint.
- Re-fly to Hektor, re-land — terminal pylon is still there, prompt still works, overlay opens again.
- The choice still hasn't resolved (`instance.currentStepIndex === 8` and `resolvedOutcomeId` is unset).

- [ ] **Step 5: Final commit (if anything changed during smoke)**

If smoke turned up small fixes, commit them as `fix(prospectus): <thing>` patches. Otherwise close out the plan.

---

## Acceptance criteria (mirror of spec §Acceptance criteria)

1. `bun run type-check` passes.
2. `bun run lint` passes (oxlint 0 errors, ESLint 0 errors / 0 warnings).
3. `bun run test:unit` passes including all new tests.
4. Manual end-to-end works for both outcomes.
5. Re-entry works — step 9 stays open until resolved.
6. Plan 1-5 regression — all prior step flows still work; specifically, steps 4 and 7 on Hektor still close on photometry/DAN completion.

---

## Out of scope (plan 7)

- Real `shuttle-buff` math (jovianEmpowerment +50% application to ship stats).
- Body destruction visualization (Hektor debris field on first flyby after transmit).
- `disable-giver` enforcement (Society listings disappear from Jupiter board on tamper).
- The `liberated` state's effect of joining Hektor to the normal Jupiter asteroid mission pool.
- Cinderline-side follow-up message hooks.
- Final audio polish (replace synthesized cues with sample assets if desired).
