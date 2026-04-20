# Satellite Repair — Inline Raycast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "press F at POI terminal → open maintenance mode" flow for satellite-servicing missions with a free-fly inline repair loop — crosshair-aimed raycast, orange highlight on aim, F to repair.

**Architecture:** The controller attaches as soon as EVA begins on a satellite-servicing mission (not on a POI F-press). `EvaSession` stays in its `active` sub-state throughout — no `minigame` transition, no pointer-lock release. Damage detection becomes a per-frame raycast from the FPS camera forward against the source object of each broken component. Aimed component gets an orange wireframe + FIX prompt; F while aimed calls `markRepaired`. Exiting EVA before all components are repaired aborts without payout; the damage state is **not persisted** across EVA sessions (user-confirmed), so the next EVA starts with all parts red again.

**Tech Stack:** TypeScript (strict), Three.js, Vue 3 (unchanged overlay layer), Vitest (existing tests). No new dependencies.

**Context:** Supersedes the proximity-based flow from `docs/superpowers/plans/2026-04-19-eva-minigame-wiring.md` Task 9. All other substrate (manifest loader, seeded damage roll, `SatelliteServicingMiniGame` class, factory registration) stays as-is. This plan only rewires how the controller attaches and how repairs are triggered.

**Prior spec:** `docs/superpowers/specs/2026-04-19-eva-minigame-wiring-design.md`. This plan amends that spec's §"In-Scene Controller Contract" at implementation time.

---

## File Structure

### Modified files

| File | Responsibility after this plan |
|---|---|
| `src/three/SatelliteRepairController.ts` | Raycast-based aim detection; red/orange wireframe states; FIX prompt only on aimed component. Config replaces `getPlayerPosition` with `getCamera`. |
| `src/three/EvaSession.ts` | New optional config hook `isInSceneMinigameActive?: () => boolean`. When it returns true, the POI terminal prompt and F-press-to-enter-minigame are suppressed — session stays in `active`. |
| `src/views/MapViewController.ts` | Auto-attach the controller on `onEvaModeChange(true)` when the active mission is satellite_servicing. Provide `isInSceneMinigameActive` hook to `EvaSession`. Dispose on EVA exit without completion. Remove the now-dead `'in_scene'` branch in `beginEvaMinigame`. |

### Tasks

- **Task 1** — Controller raycast refactor. Aim detection + orange highlight + FIX-prompt-only-on-aim. Standalone change, no caller impact until Task 3 updates the config.
- **Task 2** — EvaSession hook. Suppresses the terminal prompt/press for in-scene minigames.
- **Task 3** — MapViewController rewire. Auto-attach on EVA enter, dispose on EVA exit, remove dead code.

No unit tests per CLAUDE.md rule #2 (`src/three/` + `src/views/` are integration layers — domain logic already tested). Manual browser verification after Task 3.

---

## Task 1: Raycast-based aim detection + orange highlight

**Files:**
- Modify: `src/three/SatelliteRepairController.ts`

- [ ] **Step 1: Read the current file** at `src/three/SatelliteRepairController.ts` in full. The important existing pieces:
  - `SatelliteRepairControllerConfig` has `poiObject`, `getPlayerPosition: () => THREE.Vector3`, `isFixKeyPressed: () => boolean`, `minigame`, `mission`.
  - `DamagedComponent` interface has `{ name, source, wireframe, promptBillboard, fading, fadeTimer }`.
  - `tick(dt)` uses `FIX_PROMPT_RANGE` proximity check and sets `promptBillboard.visible` on the nearest in-range component.
  - `buildWireframe(source)` builds a red wireframe group.

- [ ] **Step 2: Replace `getPlayerPosition` with `getCamera` in the config interface**

Edit the `SatelliteRepairControllerConfig` interface. Remove the `getPlayerPosition` field. Add:

```ts
  /** Provider of the FPS camera used for raycast aim detection. May return null between frames if the camera is being swapped. */
  getCamera: () => THREE.Camera | null
```

The `poiObject`, `isFixKeyPressed`, `minigame`, `mission` fields stay unchanged.

- [ ] **Step 3: Add a file-level constant for aim range**

Near the other file-level constants (`FIX_PROMPT_RANGE`, `DAMAGE_WIREFRAME_COLOR`, etc.), replace `FIX_PROMPT_RANGE` with:

```ts
/** Maximum raycast distance (world units) for aim detection. Rays longer than this don't highlight a component. */
const AIM_RAYCAST_MAX_DISTANCE = 15

/** Orange emissive color applied to the wireframe of the currently aimed-at broken component. */
const AIM_HIGHLIGHT_COLOR = 0xfb923c
```

Remove the old `FIX_PROMPT_RANGE` constant entirely (it's no longer used).

Keep `DAMAGE_WIREFRAME_COLOR` (red) and `WIREFRAME_FADE_SECONDS` as-is.

- [ ] **Step 4: Track aim state per component**

Update the internal `DamagedComponent` interface to track whether the component is currently aimed at (so we can toggle its wireframe color):

```ts
interface DamagedComponent {
  /** Name of the rigged sub-object this component represents. */
  name: string
  /** Source Object3D on the POI tree — the wireframe overlay sits on top of this. */
  source: THREE.Object3D
  /** Red (or orange when aimed) wireframe overlay group. */
  wireframe: THREE.Object3D
  /** FIX-prompt billboard shown only when this component is the current aim target. */
  promptBillboard: THREE.Sprite
  /** Set to true when `markRepaired` fires for this component; drives the fade-out loop. */
  fading: boolean
  /** Elapsed fade seconds, capped at `WIREFRAME_FADE_SECONDS`. */
  fadeTimer: number
  /** Whether this component is the current aim target — drives wireframe color + prompt visibility. */
  aimed: boolean
}
```

When pushing into `this.components` inside `attach`, initialize `aimed: false`.

- [ ] **Step 5: Add an internal Raycaster field**

Near `_tmpPlayerDist` (the existing scratch vector), add:

```ts
  /** Reused raycaster for per-frame aim detection. */
  private readonly _raycaster = new THREE.Raycaster()

  /** Reused forward vector sampled from the camera each frame. */
  private readonly _forward = new THREE.Vector3()
```

Remove `_tmpPlayerDist` — it's no longer used after the raycast rewrite.

- [ ] **Step 6: Rewrite `tick(dt)` for raycast-based aim detection**

Replace the entire body of `tick(dt)` with:

```ts
  tick(dt: number): void {
    if (!this.cfg) return
    const camera = this.cfg.getCamera()

    // Find the aimed-at component via a forward raycast from the camera. The
    // raycast hits MESH descendants of each component's source node; we match
    // back to the component by ancestry.
    let aimed: DamagedComponent | null = null
    if (camera) {
      camera.getWorldDirection(this._forward)
      this._raycaster.set(camera.position, this._forward)
      this._raycaster.far = AIM_RAYCAST_MAX_DISTANCE
      aimed = this.pickAimedComponent()
    }

    // Apply aim state changes — swap wireframe color when entering/leaving aim,
    // toggle billboard visibility so only the aimed component shows its FIX prompt.
    for (const c of this.components) {
      if (c.fading) {
        c.aimed = false
        c.promptBillboard.visible = false
        continue
      }
      const nowAimed = c === aimed
      if (nowAimed !== c.aimed) {
        c.aimed = nowAimed
        this.setWireframeColor(c.wireframe, nowAimed ? AIM_HIGHLIGHT_COLOR : DAMAGE_WIREFRAME_COLOR)
      }
      c.promptBillboard.visible = nowAimed
    }

    // F edge-trigger: only while the player is actively aiming at a broken component.
    const fixPressed = this.cfg.isFixKeyPressed()
    const fixJustPressed = fixPressed && !this.prevFixKey
    this.prevFixKey = fixPressed
    if (fixJustPressed && aimed) {
      aimed.fading = true
      aimed.promptBillboard.visible = false
      this.cfg.minigame.markRepaired(aimed.name)
    }

    // Fade loop — unchanged from the proximity version.
    for (const c of this.components) {
      if (!c.fading) continue
      c.fadeTimer += dt
      const t = Math.min(1, c.fadeTimer / WIREFRAME_FADE_SECONDS)
      this.setWireframeOpacity(c.wireframe, WIREFRAME_START_OPACITY * (1 - t))
      if (t >= 1 && c.wireframe.parent) {
        c.wireframe.parent.remove(c.wireframe)
      }
    }
  }
```

- [ ] **Step 7: Add `pickAimedComponent` helper**

Add as a private method below `tick`:

```ts
  /**
   * Raycast against every non-fading damaged component's source subtree and
   * return the component whose source tree has the closest mesh intersection.
   * Returns null if no broken component is in the ray's path.
   *
   * @returns The aimed-at component, or null when no broken component is hit.
   */
  private pickAimedComponent(): DamagedComponent | null {
    let nearest: DamagedComponent | null = null
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const c of this.components) {
      if (c.fading) continue
      const hits = this._raycaster.intersectObject(c.source, true)
      // Filter hits that actually belong to the source mesh — exclude wireframe
      // overlay geometry so the raycast doesn't self-hit our own red mesh clones.
      for (const hit of hits) {
        if (this.isWireframeDescendant(hit.object)) continue
        if (hit.distance < nearestDistance) {
          nearestDistance = hit.distance
          nearest = c
        }
        break
      }
    }
    return nearest
  }

  /**
   * True when `obj` lives under any component's wireframe group. Used to
   * reject self-hits during the aim raycast.
   *
   * @param obj - Object3D to test.
   * @returns Whether the object is inside a wireframe overlay.
   */
  private isWireframeDescendant(obj: THREE.Object3D): boolean {
    for (const c of this.components) {
      let cur: THREE.Object3D | null = obj
      while (cur) {
        if (cur === c.wireframe) return true
        cur = cur.parent
      }
    }
    return false
  }
```

- [ ] **Step 8: Add `setWireframeColor` helper**

Alongside `setWireframeOpacity`, add:

```ts
  /**
   * Set every wireframe mesh material's base color.
   *
   * @param wireframe - Overlay group previously built by `buildWireframe`.
   * @param hex - Target color as a 24-bit hex number.
   */
  private setWireframeColor(wireframe: THREE.Object3D, hex: number): void {
    wireframe.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.color.setHex(hex)
    })
  }
```

- [ ] **Step 9: Update the class docstring + attach example**

At the top of the class TSDoc block, replace the existing `@usage` example with:

```ts
 * Usage:
 * ```ts
 * const controller = new SatelliteRepairController()
 * controller.attach({ poiObject, getCamera, isFixKeyPressed, minigame, mission })
 * // …later, per frame…
 * controller.tick(dt)
 * // …on minigame.onComplete or forced abort…
 * controller.dispose()
 * ```
```

And in the module-level file header, update the description's second paragraph to:

```ts
 * Attaches to a satellite POI during EVA, applies a red wireframe overlay to
 * each broken component, and runs a forward raycast from the FPS camera to
 * detect aim. The aimed component's wireframe turns orange and shows a
 * "[F] FIX" billboard; F-press while aimed calls `minigame.markRepaired`,
 * fades the overlay, and removes it. Completing all repairs fires the
 * minigame's `onComplete`, which the host pipes into its reward chain.
```

Remove any leftover `getPlayerPosition` / proximity references from comments.

- [ ] **Step 10: Run gates**

```bash
bun run type-check && bun run lint
```

Expected: type-check passes with 2 errors pointing at `MapViewController.ts` (it still passes `getPlayerPosition`, which no longer exists). Those errors are **expected and Task 3 fixes them**. Do NOT change `MapViewController` in this task. Lint should also complain about the same mismatch.

**If** lint/type-check would block the commit, proceed anyway — this task produces a temporarily-broken tree that Task 3 repairs. Skip the commit at this step; do a single combined commit at the end of Task 3 once the tree compiles.

Actually — re-read the preceding paragraph: the reviewer's workflow strongly prefers per-task commits. To preserve that, we need the type-check + lint to pass **now**. The cleanest way: in Task 3 we're about to remove the caller anyway; but in Task 1 we can't yet. Resolution:

**Revised Step 10:** Keep the existing `getPlayerPosition` field in the config interface as an **additional optional field** instead of removing it, so the current call site still type-checks. Task 3 removes it at the same time as the call-site removal.

Go back to Step 2 and change the edit: do not remove `getPlayerPosition`. Instead, ADD `getCamera` alongside it and mark `getPlayerPosition` as `/** @deprecated Unused after the raycast rewrite; will be removed in Task 3. */ getPlayerPosition?: () => THREE.Vector3`. No body reads it now (Step 6's new `tick` only reads `getCamera`).

Re-run:

```bash
bun run type-check && bun run lint && bun test:unit
```

Expected: all green. The existing Task 10 call site still passes `getPlayerPosition` but `getCamera` is not yet passed; since it's typed as `() => THREE.Camera | null`, the call site is missing a required field — that's still a type error.

**Actual resolution:** Mark `getCamera` as optional too in this task. The tick body handles `const camera = this.cfg.getCamera()` — but if `getCamera` is optional, that call throws at runtime until Task 3 provides it. Guard it:

```ts
const camera = this.cfg.getCamera?.() ?? null
```

This means Task 1 can land with the interface changed, the body calling the new optional API, and the existing call site still type-clean (both fields optional, only `getPlayerPosition` passed — which goes unused). Task 3 flips it: removes `getPlayerPosition` from the interface entirely and the call site, makes `getCamera` required.

Apply this updated guard in Step 6's `tick` body. Revise the interface to:

```ts
  /** Provider of the FPS camera used for raycast aim detection. May return null. */
  getCamera?: () => THREE.Camera | null
  /** @deprecated Unused after the raycast rewrite; removed in Task 3. */
  getPlayerPosition?: () => THREE.Vector3
```

Now Step 10 final form:

Run:
```bash
bun run type-check && bun run lint && bun test:unit
```
Expected: all green. The call site in `MapViewController.ts` still passes `getPlayerPosition` — that's fine, it's still allowed by the interface.

- [ ] **Step 11: Commit**

```bash
git add src/three/SatelliteRepairController.ts
git commit -m "refactor: raycast-based aim detection for satellite repair controller"
```

---

## Task 2: `EvaSession` — suppress POI prompt + F-press for in-scene minigames

**Files:**
- Modify: `src/three/EvaSession.ts`

- [ ] **Step 1: Read the current EvaSession flow**

Open `src/three/EvaSession.ts`. Find `EvaSessionConfig` (around line 120-140) and the `tick` method's `active`-mode branch (around line 234-268). The POI terminal prompt + F-press logic lives at lines 240-253.

- [ ] **Step 2: Add `isInSceneMinigameActive` to `EvaSessionConfig`**

Find the `EvaSessionConfig` interface. Add the new optional field alongside existing callbacks like `onStartEvaMinigame` and `canEva`:

```ts
  /**
   * Optional predicate. When it returns true, the POI terminal prompt and the
   * F-press that would call `beginMinigame` are suppressed — the session stays
   * in its `active` sub-state. Used for in-scene minigames (satellite servicing)
   * where the host attaches a controller on EVA-enter and drives repairs inline,
   * so entering the "minigame" sub-state (which releases pointer lock for a Vue
   * overlay) would be wrong.
   */
  isInSceneMinigameActive?: () => boolean
```

- [ ] **Step 3: Gate the POI prompt + F-press on the hook**

Inside `tick`, replace the POI terminal prompt block (lines 240-253 of the current file — the block that sets `'START MAINTENANCE [F]'` and handles `beginMinigame`). Wrap the entire block in the new predicate:

```ts
    // POI terminal proximity (3D) takes priority over the shuttle-return prompt so
    // the player can't miss the maintenance action by accidentally re-entering range
    // of the shuttle.
    const poi = this.config.getPoi()
    if (poi) {
      const pdx = this.controller.group.position.x - poi.x
      const pdy = this.controller.group.position.y - poi.y
      const pdz = this.controller.group.position.z - poi.z
      const distToPoi = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz)
      if (distToPoi < EVA_TERMINAL_PROMPT_RANGE) {
        // In-scene minigames (e.g. satellite servicing) attach their controller on
        // EVA-enter and drive repairs inline with pointer lock held. Skip the
        // terminal prompt + F-press so the player isn't told to press F and so F
        // doesn't accidentally transition us into the overlay-oriented sub-state.
        const inSceneActive = this.config.isInSceneMinigameActive?.() ?? false
        if (!inSceneActive) {
          this.setPrompt('START MAINTENANCE [F]')
          if (this.config.inputManager.wasActionPressed('evaToggle')) {
            this.beginMinigame()
          }
          this.emitTelemetry()
          return
        }
      }
    }
```

This changes two behaviors inside POI range:
1. The prompt only shows when `isInSceneMinigameActive()` returns false.
2. The F-press only triggers `beginMinigame` when `isInSceneMinigameActive()` returns false.

The `emitTelemetry()` + `return` branch also happens only in the non-in-scene path, so when an in-scene minigame is active the tick falls through to the shuttle-return-range check below. That's correct — the player should still get the "Return to Shuttle [F]" prompt when near the shuttle, even during a satellite-servicing EVA.

- [ ] **Step 4: Run gates**

```bash
bun run type-check && bun run lint && bun test:unit
```

Expected: all green. No existing consumer provides `isInSceneMinigameActive` yet (Task 3 does), so the optional hook's absence means behavior is identical to before this task for all current callers.

- [ ] **Step 5: Commit**

```bash
git add src/three/EvaSession.ts
git commit -m "feat: add isInSceneMinigameActive hook to suppress EVA terminal prompt"
```

---

## Task 3: `MapViewController` — auto-attach on EVA enter + remove dead F-press path

**Files:**
- Modify: `src/views/MapViewController.ts`
- Modify: `src/three/SatelliteRepairController.ts` (remove the deprecated `getPlayerPosition` field from the interface now that the caller is updated)

- [ ] **Step 1: Find the EVA session creation site**

Open `src/views/MapViewController.ts`. Locate `createEvaSession()` (around line 3686). It constructs the `EvaSession` with a config object including `onEvaModeChange`, `canEva`, `onStartEvaMinigame`, etc.

- [ ] **Step 2: Add a helper to fetch the active satellite-servicing mission**

Add a private method on `MapViewController` immediately above `createEvaSession`:

```ts
  /**
   * If the player has an accepted, in-progress EVA mission whose POI is the
   * one they're EVAing out to AND whose minigameType is `satellite_servicing`,
   * return it. Otherwise return null.
   *
   * @returns The active satellite-servicing mission at the current POI, or null.
   */
  private getActiveSatelliteServicingMission(): ActiveVisitRelayMission | null {
    const mission = this.missionFacade.getActiveEvaMissionAtPoi()
    if (!mission) return null
    if (mission.template.minigameType !== 'satellite_servicing') return null
    const broken = mission.brokenComponents
    if (!broken || broken.length === 0) return null
    return mission
  }
```

- [ ] **Step 3: Wire `isInSceneMinigameActive` + auto-attach into the session config**

Inside `createEvaSession`, update the `onEvaModeChange` callback to auto-attach on EVA enter AND teardown on EVA exit. Add the `isInSceneMinigameActive` hook alongside.

Find the current `onEvaModeChange: (active) => { … }` block in `createEvaSession`. Replace it with:

```ts
      onEvaModeChange: (active) => {
        if (active) {
          this.maybeAttachSatelliteRepair()
        } else {
          this.teardownSatelliteRepairOnExit()
        }
        this.handleEvaModeChange(active)  // KEEP any existing side effects from the original callback
      },
      isInSceneMinigameActive: () => this.satelliteRepairController != null,
```

Important: the existing `onEvaModeChange` callback may already do scene bookkeeping (bloom swap, fuel-pause, etc.). Do NOT delete those side effects — extract them into a named private method (e.g. `handleEvaModeChange`) and call it from the new callback. Read the current body of `onEvaModeChange` carefully before editing. If the body is a single `() => { /* stuff */ }` with inline logic, pull it out into a method with the same body. The new callback invokes that method AFTER attach/teardown so the existing ordering (scale freeze, bloom override, etc.) is preserved.

- [ ] **Step 4: Implement `maybeAttachSatelliteRepair`**

Add as a private method on `MapViewController`:

```ts
  /**
   * If a satellite-servicing EVA mission is active at the current POI, build
   * the minigame, attach the in-scene controller, and wire `onComplete` into
   * the existing reward chain. No-op otherwise.
   */
  private maybeAttachSatelliteRepair(): void {
    const mission = this.getActiveSatelliteServicingMission()
    if (!mission) return
    const poiObject = this.missionFacade.getEvaPoiGroup()
    if (!poiObject) {
      console.warn('[MapViewController] No POI object for satellite repair; skipping auto-attach.')
      return
    }
    const minigame = createOrbitalMiniGame(
      mission.template.id,
      mission.template.minigameType,
      0,
      mission.giverPlanet,
      mission,
    ) as OrbitalMiniGame & OrbitalMiniGameEvents
    if (!(minigame instanceof SatelliteServicingMiniGame)) {
      // The factory fell back to Default because broken components were missing.
      // Shouldn't happen given the guard in getActiveSatelliteServicingMission, but
      // log and abandon so a future factory change doesn't silently break us.
      console.warn(
        '[MapViewController] Satellite mission produced non-SatelliteServicingMiniGame; skipping.',
      )
      minigame.dispose()
      return
    }
    minigame.onComplete = (missionId: string) => this.evaMinigameComplete(missionId)
    this.activeEvaMinigame = minigame
    this.satelliteRepairController = new SatelliteRepairController()
    this.satelliteRepairController.attach({
      poiObject,
      getCamera: () => {
        const pass = this.sceneObjects?.composer.passes[0] as RenderPass | undefined
        return pass?.camera ?? null
      },
      isFixKeyPressed: () => this.inputManager?.isActionActive('interact') ?? false,
      minigame,
      mission,
    })
  }
```

- [ ] **Step 5: Implement `teardownSatelliteRepairOnExit`**

Add as a private method:

```ts
  /**
   * Called on EVA exit. If the satellite-servicing controller is still attached,
   * the player left EVA without repairing every component — abort silently.
   * No reward, no mission removal; the mission stays in the active list with
   * its brokenComponents intact so the next EVA re-attaches with the same damage.
   *
   * If the controller has already been disposed (e.g. because `onComplete` fired
   * mid-EVA and `evaMinigameComplete` ran the cleanup), this is a no-op.
   */
  private teardownSatelliteRepairOnExit(): void {
    if (!this.satelliteRepairController) return
    this.satelliteRepairController.dispose()
    this.satelliteRepairController = null
    this.activeEvaMinigame?.dispose()
    this.activeEvaMinigame = null
  }
```

- [ ] **Step 6: Remove the dead `'in_scene'` branch from `beginEvaMinigame`**

`beginEvaMinigame` is called by `EvaSession.beginMinigame` which now fires only for overlay minigames (satellite_servicing is suppressed via the new hook). The `'in_scene'` branch is dead code. Find `beginEvaMinigame` (around line 2328) and simplify:

```ts
  private beginEvaMinigame(): void {
    const mission = this.missionFacade.getActiveEvaMissionAtPoi()
    if (!mission) {
      this.evaSession?.endMinigame()
      return
    }
    const minigameType = mission.template.minigameType ?? 'default'
    const minigame = createOrbitalMiniGame(
      mission.template.id,
      minigameType,
      0,
      mission.giverPlanet,
      mission,
    ) as OrbitalMiniGame & OrbitalMiniGameEvents
    minigame.onComplete = (missionId: string) => this.evaMinigameComplete(missionId)
    this.activeEvaMinigame = minigame
    this.onEvaMinigameChange?.({ mission, minigame })
  }
```

Removes the `if (minigame.presentation === 'overlay')` branch and the entire `'in_scene'` block, because:
- Overlay minigames: always emit `onEvaMinigameChange` as before — that's the unconditional line now.
- In-scene minigames: never reach this method (suppressed by `isInSceneMinigameActive`).
- If a future in-scene minigame type is introduced without a matching auto-attach path, the overlay fallback fires and warns via the console. To preserve that safety net, add one check before the emit:

```ts
    this.activeEvaMinigame = minigame
    if (minigame.presentation === 'in_scene') {
      console.warn(
        `[MapViewController] In-scene minigame "${minigameType}" reached beginEvaMinigame; auto-attach is missing. Falling back to overlay.`,
      )
    }
    this.onEvaMinigameChange?.({ mission, minigame })
```

Update the method's TSDoc to reflect the simplified behavior.

- [ ] **Step 7: Update `SatelliteRepairController` config — remove the deprecated field**

Edit `src/three/SatelliteRepairController.ts`. Now that Task 3 has updated the call site, remove:

```ts
  /** @deprecated Unused after the raycast rewrite; removed in Task 3. */
  getPlayerPosition?: () => THREE.Vector3
```

And make `getCamera` required:

```ts
  /** Provider of the FPS camera used for raycast aim detection. May return null. */
  getCamera: () => THREE.Camera | null
```

Inside `tick`, change the optional-chain call back to a direct call:

```ts
const camera = this.cfg.getCamera()
```

- [ ] **Step 8: Run gates**

```bash
bun run type-check && bun run lint && bun test:unit
```

Expected: all green.

- [ ] **Step 9: Manual browser verification — the golden path**

Run: `bun dev`. Open `/map`.

Verify on **Earth** (1 broken component):
1. Accept `earth_cubesat_cluster_patch` (minigameType `satellite_servicing`).
2. Fly the shuttle to the waypoint, park, press F to EVA. Wait for the cargo bay to open and for the FPS camera to take over.
3. As soon as EVA begins, the satellite should have exactly one red wireframe component visible. No "START MAINTENANCE [F]" prompt near the POI — that path is suppressed.
4. Float around freely (pointer lock stays engaged). Aim the crosshair at the red component; its wireframe should turn **orange** and a "[F] FIX" billboard should appear above it.
5. Look away; wireframe returns to **red** and billboard hides.
6. Aim at the red component again and press F. Wireframe fades over 0.5s. Mission-complete toast appears. CR credited. Mission removed from active list.
7. Fly back to the shuttle (return prompt should still work), press F, re-enter, done.

Verify on **Jupiter** (2 broken components):
1. Accept a `satellite_servicing` mission on Jupiter.
2. EVA out — 2 red wireframes.
3. Aim at one, press F. That one fades. The other stays red. Mission does NOT complete yet.
4. Aim at the second, press F. Fades. Mission completes + reward.

Verify on **Neptune** (3 broken components): similar but with 3.

Verify **abort path**: accept any satellite mission, EVA out, fix one part of a multi-part mission, then fly back to the shuttle and press F to return. Mission should stay in the active list. EVA again and confirm the satellite shows all original red components again (partial progress NOT persisted — user-requested behavior).

Verify **non-satellite flows still work**:
- Accept a telescope mission → EVA → the "START MAINTENANCE [F]" prompt appears in POI range → press F → default "Complete Maintenance" overlay opens → click button → reward + cleanup (unchanged from before the plan).
- Accept a relay mission → same overlay path (unchanged).

- [ ] **Step 10: Commit**

```bash
git add src/views/MapViewController.ts src/three/SatelliteRepairController.ts
git commit -m "feat: auto-attach satellite repair on EVA enter with raycast aim"
```

---

## Done Criteria

- [ ] `bun run type-check` exits 0.
- [ ] `bun run lint` reports 0 oxlint errors and 0 ESLint errors/warnings.
- [ ] `bun test:unit` — all existing tests pass (no new tests added; Three.js integration layer per CLAUDE.md rule #2).
- [ ] Manual flow verification per Task 3 Step 9.
- [ ] No console errors during any flow.
- [ ] Dead `'in_scene'` branch in `beginEvaMinigame` removed.
- [ ] Deprecated `getPlayerPosition` field on `SatelliteRepairControllerConfig` removed.

## Follow-ups Not In This Plan

- Per-mission persistence of partial repair progress (user explicitly opted out of this pass).
- Real drag-based repair interaction (stub F-press still used here — satellite servicing's own future plan).
- Raycast distance gate tuning — `AIM_RAYCAST_MAX_DISTANCE = 15` is a first guess; playtest may reveal the right value.
- HUD reticle change when aimed at a damaged component (currently the generic EVA crosshair — could be swapped for a targeting glyph).
