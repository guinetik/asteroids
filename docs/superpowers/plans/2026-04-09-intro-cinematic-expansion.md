# Intro Cinematic Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the map intro cinematic from 3 beats / 14s to 6 visual moments / ~30s, adding Enceladus discovery, Viroid reveal (VirusModel), Jupiter approach, and cloud city reveal (CityModel) camera beats.

**Architecture:** The intro state machine (`mapIntroState.ts`) drives caption selection and beat boundaries. The camera animation (`MapViewController.tickStartupIntroCamera()`) reads the eased progress to lerp between planet positions. Two 3D props (VirusModel, CityModel) spawn/dispose at beat boundaries. A small getter is added to `PlanetSystemController` so the camera can track Enceladus's world position.

**Tech Stack:** TypeScript, Three.js, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/mapIntroState.ts` | Modify | Beat boundaries, caption constants, caption selector |
| `src/lib/__tests__/mapIntroState.spec.ts` | Modify | Caption boundary tests for 6 beats |
| `src/three/controllers/PlanetSystemController.ts` | Modify | Add `getMoonWorldPosition()` getter |
| `src/views/MapViewController.ts` | Modify | Camera beats, prop spawn/dispose, preloads |
| `docs/asteroid-lander-gdd.md` | Modify | Canonize lore updates |

---

### Task 1: Update mapIntroState.ts — beat boundaries and captions

**Files:**
- Modify: `src/lib/mapIntroState.ts`
- Test: `src/lib/__tests__/mapIntroState.spec.ts`

- [ ] **Step 1: Write the failing tests for 6 captions**

Replace the existing caption test and add a new one that covers all 6 boundaries. In `src/lib/__tests__/mapIntroState.spec.ts`, replace the entire import block and the caption test:

```ts
import { describe, expect, it } from 'vitest'
import {
  MAP_INTRO_CAPTION_SOLAR_SYSTEM,
  MAP_INTRO_CAPTION_ENCELADUS,
  MAP_INTRO_CAPTION_VIROIDS,
  MAP_INTRO_CAPTION_JUPITER_MATERIALS,
  MAP_INTRO_CAPTION_CLOUD_CITY,
  MAP_INTRO_CAPTION_RETIRED_OPERATOR,
  MAP_INTRO_CINEMATIC_DURATION,
  MAP_INTRO_BEAT_ENCELADUS,
  MAP_INTRO_BEAT_VIROIDS,
  MAP_INTRO_BEAT_JUPITER,
  MAP_INTRO_BEAT_CLOUD_CITY,
  MAP_INTRO_BEAT_EARTH,
  MapIntroState,
  mapIntroCaptionForEasedProgress,
} from '../mapIntroState'
```

Replace the caption order test (`it('shows the three cinematic captions...')`) with:

```ts
it('shows the six cinematic captions in order by eased progress', () => {
  // Beat 1: Solar system (0 to BEAT_ENCELADUS)
  expect(mapIntroCaptionForEasedProgress(0)).toBe(MAP_INTRO_CAPTION_SOLAR_SYSTEM)
  expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_ENCELADUS - 0.01)).toBe(
    MAP_INTRO_CAPTION_SOLAR_SYSTEM,
  )

  // Beat 2: Enceladus discovery
  expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_ENCELADUS)).toBe(
    MAP_INTRO_CAPTION_ENCELADUS,
  )
  expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_VIROIDS - 0.01)).toBe(
    MAP_INTRO_CAPTION_ENCELADUS,
  )

  // Beat 3: Viroid reveal
  expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_VIROIDS)).toBe(
    MAP_INTRO_CAPTION_VIROIDS,
  )
  expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_JUPITER - 0.01)).toBe(
    MAP_INTRO_CAPTION_VIROIDS,
  )

  // Beat 4a: Jupiter materials
  expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_JUPITER)).toBe(
    MAP_INTRO_CAPTION_JUPITER_MATERIALS,
  )
  expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_CLOUD_CITY - 0.01)).toBe(
    MAP_INTRO_CAPTION_JUPITER_MATERIALS,
  )

  // Beat 4b: Cloud city
  expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_CLOUD_CITY)).toBe(
    MAP_INTRO_CAPTION_CLOUD_CITY,
  )
  expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_EARTH - 0.01)).toBe(
    MAP_INTRO_CAPTION_CLOUD_CITY,
  )

  // Beat 5: Retired operator
  expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_EARTH)).toBe(
    MAP_INTRO_CAPTION_RETIRED_OPERATOR,
  )
  expect(mapIntroCaptionForEasedProgress(1)).toBe(MAP_INTRO_CAPTION_RETIRED_OPERATOR)
})
```

Also update the `uiState` caption test to reference `MAP_INTRO_CAPTION_SOLAR_SYSTEM` (already correct).

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/__tests__/mapIntroState.spec.ts`
Expected: FAIL — new exports don't exist yet.

- [ ] **Step 3: Implement the new beat boundaries and captions**

In `src/lib/mapIntroState.ts`, replace the existing duration, boundary, and caption constants (lines 14–33) with:

```ts
/** Duration in seconds for the opening cinematic (6 visual beats). */
export const MAP_INTRO_CINEMATIC_DURATION = 30

/** Eased progress boundary: start of Enceladus discovery beat. */
export const MAP_INTRO_BEAT_ENCELADUS = 0.12

/** Eased progress boundary: start of Viroid reveal beat. */
export const MAP_INTRO_BEAT_VIROIDS = 0.28

/** Eased progress boundary: start of Jupiter approach beat. */
export const MAP_INTRO_BEAT_JUPITER = 0.42

/** Eased progress boundary: start of cloud city reveal beat. */
export const MAP_INTRO_BEAT_CLOUD_CITY = 0.56

/** Eased progress boundary: start of Earth / player beat. */
export const MAP_INTRO_BEAT_EARTH = 0.70

/** Caption: wide solar system establishing shot. */
export const MAP_INTRO_CAPTION_SOLAR_SYSTEM = 'SOLAR SYSTEM, 2299 AD.'

/** Caption: Enceladus neutron thruster discovery. */
export const MAP_INTRO_CAPTION_ENCELADUS =
  'A DISCOVERY ON ENCELADUS UNLOCKED RELATIVISTIC ACCELERATION AT OUR FINGERTIPS: THE NEUTRON THRUSTER.'

/** Caption: Viroid reveal on Enceladus. */
export const MAP_INTRO_CAPTION_VIROIDS =
  'BUT IT WAS HOME TO SOMETHING ELSE. SILICATE CREATURES FROM INTERSTELLAR SPACE. TERRITORIAL AND LETHAL. WE CALL THEM VIROIDS.'

/** Caption: Jupiter raw materials / humanity spreading. */
export const MAP_INTRO_CAPTION_JUPITER_MATERIALS =
  "FROM THE NEUTRON, HUMANITY SPREAD TO THE OUTER SYSTEM. JUPITER'S MOONS PROVIDED THE RAW MATERIALS."

/** Caption: Jupiter cloud city assembly lines. */
export const MAP_INTRO_CAPTION_CLOUD_CITY =
  'ABOVE THE SURFACE, A CLOUD CITY 3D-PRINTED THE ASSEMBLY LINES.'

/** Caption: retired lander operator receives shuttle. */
export const MAP_INTRO_CAPTION_RETIRED_OPERATOR =
  'A RETIRED LANDER OPERATOR JUST RECEIVED A REFURBISHED SHUTTLE FROM THE SPACE PROGRAM.'
```

Replace the `mapIntroCaptionForEasedProgress` function (lines 44–48) with:

```ts
/**
 * Resolves the lower-third title line for a given eased intro progress value.
 *
 * @param easedProgress - Eased 0–1 timeline (same cubic ease as the intro camera).
 * @returns One of the six caption strings.
 *
 * @author guinetik
 * @date 2026-04-09
 */
export function mapIntroCaptionForEasedProgress(easedProgress: number): string {
  if (easedProgress < MAP_INTRO_BEAT_ENCELADUS) return MAP_INTRO_CAPTION_SOLAR_SYSTEM
  if (easedProgress < MAP_INTRO_BEAT_VIROIDS) return MAP_INTRO_CAPTION_ENCELADUS
  if (easedProgress < MAP_INTRO_BEAT_JUPITER) return MAP_INTRO_CAPTION_VIROIDS
  if (easedProgress < MAP_INTRO_BEAT_CLOUD_CITY) return MAP_INTRO_CAPTION_JUPITER_MATERIALS
  if (easedProgress < MAP_INTRO_BEAT_EARTH) return MAP_INTRO_CAPTION_CLOUD_CITY
  return MAP_INTRO_CAPTION_RETIRED_OPERATOR
}
```

Remove the old `MAP_INTRO_CINEMATIC_HERO_HOLD_START` and `MAP_INTRO_CINEMATIC_HERO_HOLD_END` constants entirely — they are replaced by the new beat boundaries.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/mapIntroState.spec.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/mapIntroState.ts src/lib/__tests__/mapIntroState.spec.ts
git commit -m "feat: expand intro captions to 6 beats / 30s cinematic"
```

---

### Task 2: Add getMoonWorldPosition to PlanetSystemController

The camera needs to track Enceladus during beats 2–3. Moon meshes are children of the planet group but `moonEntries` is private. Add a getter.

**Files:**
- Modify: `src/three/controllers/PlanetSystemController.ts`

- [ ] **Step 1: Add the getMoonWorldPosition method**

After the `getWorldZ()` method (line 124), add:

```ts
/**
 * Compute the world-space position of a moon by its index in the planet's moon array.
 *
 * @param moonIndex - Index into the planet definition's `moons` array
 * @param target - Vector3 to write into (avoids allocation per frame)
 * @returns The target vector, or null if the index is out of range
 *
 * @author guinetik
 * @date 2026-04-09
 */
getMoonWorldPosition(moonIndex: number, target: THREE.Vector3): THREE.Vector3 | null {
  const entry = this.moonEntries[moonIndex]
  if (!entry) return null
  entry.meshResult.mesh.getWorldPosition(target)
  return target
}
```

- [ ] **Step 2: Verify build**

Run: `bun run type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/three/controllers/PlanetSystemController.ts
git commit -m "feat: add getMoonWorldPosition getter to PlanetSystemController"
```

---

### Task 3: Expand tickStartupIntroCamera with new beats

This is the main camera animation work. Replace the 3-branch camera logic with 6 branches matching the new beat boundaries. Add VirusModel and CityModel prop lifecycle.

**Files:**
- Modify: `src/views/MapViewController.ts`

- [ ] **Step 1: Add new imports and constants**

At the top of `MapViewController.ts`, add these imports alongside the existing ones:

```ts
import { VirusModel } from '@/three/VirusModel'
import { CityModel } from '@/three/CityModel'
```

Update the mapIntroState imports to use the new beat boundary names:

```ts
import {
  MapIntroState,
  MAP_INTRO_CINEMATIC_DURATION,
  MAP_INTRO_BEAT_ENCELADUS,
  MAP_INTRO_BEAT_VIROIDS,
  MAP_INTRO_BEAT_JUPITER,
  MAP_INTRO_BEAT_CLOUD_CITY,
  MAP_INTRO_BEAT_EARTH,
} from '@/lib/mapIntroState'
```

Remove imports of the old `MAP_INTRO_CINEMATIC_HERO_HOLD_START` and `MAP_INTRO_CINEMATIC_HERO_HOLD_END`.

Replace the existing camera constants block (lines 414–420) with:

```ts
/** Opening cutscene starts with a wide solar-system establishing shot. */
const MAP_INTRO_CAMERA_START_POSITION = new THREE.Vector3(0, 320, 900)
const MAP_INTRO_CAMERA_START_TARGET = new THREE.Vector3(0, 0, 0)
const MAP_INTRO_CAMERA_START_FOV = 32

/** Camera offset from Enceladus for the discovery/viroid beats. */
const MAP_INTRO_ENCELADUS_CAMERA_OFFSET = new THREE.Vector3(0.4, 0.3, 0.8)
const MAP_INTRO_ENCELADUS_FOV = 28

/** Camera offset from Jupiter for the shipyard / cloud city beats. */
const MAP_INTRO_JUPITER_CAMERA_OFFSET = new THREE.Vector3(4, 3, 8)
const MAP_INTRO_JUPITER_CLOSE_OFFSET = new THREE.Vector3(2, 1.5, 4)
const MAP_INTRO_JUPITER_FOV = 35

/** Existing hero (shuttle) camera constants. */
const MAP_INTRO_HERO_OFFSET = new THREE.Vector3(-24, 6, 14)
const MAP_INTRO_HERO_LOOK_AT_OFFSET = new THREE.Vector3(0, 1.5, 0)
const MAP_INTRO_HERO_FOV = 42

/** Beat 5 sub-boundaries (within 0.70–1.00 range). */
const MAP_INTRO_HERO_HOLD_START = 0.82
const MAP_INTRO_HERO_HOLD_END = 0.92

/** Intro prop rotation speeds (rad/s). */
const INTRO_VIRUS_YAW_SPEED = 0.3
const INTRO_CITY_YAW_SPEED = 0.2

/** Enceladus is the 2nd moon of Saturn (index 1 in planetarium.json). */
const ENCELADUS_MOON_INDEX = 1
```

- [ ] **Step 2: Add prop instance fields**

In the MapViewController class, near the existing `private introCamera` field (line 466), add:

```ts
/** Virus prop spawned during beat 3 (Viroid reveal). */
private introVirusModel: VirusModel | null = null

/** City prop spawned during beat 4b (cloud city reveal). */
private introCityModel: CityModel | null = null

/** Reusable vector for moon world-position queries. */
private readonly introMoonWorldPos = new THREE.Vector3()
```

- [ ] **Step 3: Preload props during scene init**

In the scene initialization method (near where the asteroid belt promises are created, around line 744), add preload calls:

```ts
// --- Intro cinematic prop preloads (fire-and-forget) ---
VirusModel.preload()
CityModel.preload()
```

- [ ] **Step 4: Replace tickStartupIntroCamera with 6-beat version**

Replace the entire `tickStartupIntroCamera()` method (lines 3479–3562) with:

```ts
/**
 * Animate the intro camera through 6 cinematic beats.
 *
 * Beat 1: Wide solar system → Saturn/Enceladus
 * Beat 2: Hold on Enceladus (discovery)
 * Beat 3: Viroid reveal (VirusModel prop)
 * Beat 4a: Sweep to Jupiter
 * Beat 4b: Cloud city reveal (CityModel prop)
 * Beat 5: Sweep to shuttle, hero hold, orbit handoff
 */
private tickStartupIntroCamera(): void {
  if (
    !this.sceneObjects ||
    !this.vehicleCamera ||
    !this.introCamera ||
    !this.shuttleController ||
    this.mapState.isOpen
  )
    return

  const renderPass = this.sceneObjects.composer.passes[0] as RenderPass

  if (this.mapIntro.phase === 'cinematic_zoom') {
    const progress = easeInOut(this.mapIntro.cinematicProgress)
    this.tickIntroBeat(progress, renderPass)
    return
  }

  if (this.mapIntro.controlsLocked) {
    this.introCamera.position.copy(this.vehicleCamera.camera.position)
    this.introCamera.quaternion.copy(this.vehicleCamera.camera.quaternion)
    this.introCamera.fov = this.vehicleCamera.camera.fov
    this.introCamera.updateProjectionMatrix()
    renderPass.camera = this.introCamera
    return
  }

  if (!this.habitatState.isActive) {
    renderPass.camera = this.vehicleCamera.camera
  }
}

/**
 * Route eased progress to the correct camera beat handler.
 * Also manages intro prop spawn/dispose at beat boundaries.
 */
private tickIntroBeat(progress: number, renderPass: RenderPass): void {
  // --- Prop lifecycle: spawn/dispose at boundaries ---
  this.tickIntroProps(progress)

  // --- Camera routing ---
  if (progress < MAP_INTRO_BEAT_ENCELADUS) {
    this.tickIntroBeatWideToEnceladus(progress, renderPass)
  } else if (progress < MAP_INTRO_BEAT_VIROIDS) {
    this.tickIntroBeatEnceladusHold(progress, renderPass)
  } else if (progress < MAP_INTRO_BEAT_JUPITER) {
    this.tickIntroBeatViroidReveal(progress, renderPass)
  } else if (progress < MAP_INTRO_BEAT_CLOUD_CITY) {
    this.tickIntroBeatJupiterApproach(progress, renderPass)
  } else if (progress < MAP_INTRO_BEAT_EARTH) {
    this.tickIntroBeatCloudCity(progress, renderPass)
  } else {
    this.tickIntroBeatEarthPlayer(progress, renderPass)
  }
}

/** Manage spawn/dispose of VirusModel and CityModel at beat boundaries. */
private tickIntroProps(progress: number): void {
  const scene = this.sceneObjects?.scene
  if (!scene) return

  // --- VirusModel: active during beats 3 (VIROIDS to JUPITER) ---
  const virusActive = progress >= MAP_INTRO_BEAT_VIROIDS && progress < MAP_INTRO_BEAT_JUPITER
  if (virusActive && !this.introVirusModel) {
    this.spawnIntroVirus(scene)
  } else if (!virusActive && this.introVirusModel) {
    this.disposeIntroVirus(scene)
  }
  if (this.introVirusModel) {
    this.introVirusModel.group.rotation.y += INTRO_VIRUS_YAW_SPEED * (1 / 60)
  }

  // --- CityModel: active during beat 4b (CLOUD_CITY to EARTH) ---
  const cityActive = progress >= MAP_INTRO_BEAT_CLOUD_CITY && progress < MAP_INTRO_BEAT_EARTH
  if (cityActive && !this.introCityModel) {
    this.spawnIntroCity(scene)
  } else if (!cityActive && this.introCityModel) {
    this.disposeIntroCity(scene)
  }
  if (this.introCityModel) {
    this.introCityModel.group.rotation.y += INTRO_CITY_YAW_SPEED * (1 / 60)
  }
}

/** Spawn the VirusModel near Enceladus. */
private spawnIntroVirus(scene: THREE.Scene): void {
  const saturn = this.getPlanetControllerById('saturn')
  if (!saturn) return
  const enceladusPos = saturn.getMoonWorldPosition(ENCELADUS_MOON_INDEX, this.introMoonWorldPos)
  if (!enceladusPos) return

  VirusModel.create({ scale: 8 }).then((virus) => {
    if (this.introVirusModel) return // guard against double-spawn
    this.introVirusModel = virus
    virus.placeAt(enceladusPos.x + 0.15, enceladusPos.y + 0.1, enceladusPos.z)
    scene.add(virus.group)
  })
}

/** Dispose the VirusModel. */
private disposeIntroVirus(scene: THREE.Scene): void {
  if (!this.introVirusModel) return
  scene.remove(this.introVirusModel.group)
  this.introVirusModel.dispose()
  this.introVirusModel = null
}

/** Spawn the CityModel near Jupiter. */
private spawnIntroCity(scene: THREE.Scene): void {
  const jupiter = this.getPlanetControllerById('jupiter')
  if (!jupiter) return
  const jx = jupiter.getWorldX()
  const jz = jupiter.getWorldZ()

  CityModel.create({ scale: 0.3 }).then((city) => {
    if (this.introCityModel) return // guard against double-spawn
    this.introCityModel = city
    city.group.position.set(jx, 1.5, jz)
    scene.add(city.group)
  })
}

/** Dispose the CityModel. */
private disposeIntroCity(scene: THREE.Scene): void {
  if (!this.introCityModel) return
  scene.remove(this.introCityModel.group)
  this.introCityModel.dispose()
  this.introCityModel = null
}
```

- [ ] **Step 5: Implement the 6 camera beat methods**

Add these methods to MapViewController, right after `disposeIntroCity`:

```ts
/** Beat 1 (0–0.12): Wide solar system zoom toward Saturn/Enceladus. */
private tickIntroBeatWideToEnceladus(progress: number, renderPass: RenderPass): void {
  const saturn = this.getPlanetControllerById('saturn')
  if (!saturn || !this.introCamera) return

  const enceladusTarget = this.getEnceladusWorldPos(saturn)
  if (!enceladusTarget) return
  const cameraTarget = enceladusTarget.clone().add(MAP_INTRO_ENCELADUS_CAMERA_OFFSET)

  const t = easeInOut(progress / MAP_INTRO_BEAT_ENCELADUS)
  this.introCamera.position.lerpVectors(MAP_INTRO_CAMERA_START_POSITION, cameraTarget, t)
  this.introCamera.fov = THREE.MathUtils.lerp(MAP_INTRO_CAMERA_START_FOV, MAP_INTRO_ENCELADUS_FOV, t)
  this.introCamera.updateProjectionMatrix()
  const lookTarget = new THREE.Vector3().lerpVectors(MAP_INTRO_CAMERA_START_TARGET, enceladusTarget, t)
  this.introCamera.lookAt(lookTarget)
  renderPass.camera = this.introCamera
}

/** Beat 2 (0.12–0.28): Hold on Enceladus — discovery caption. */
private tickIntroBeatEnceladusHold(progress: number, renderPass: RenderPass): void {
  const saturn = this.getPlanetControllerById('saturn')
  if (!saturn || !this.introCamera) return

  const enceladusTarget = this.getEnceladusWorldPos(saturn)
  if (!enceladusTarget) return

  this.introCamera.position.copy(enceladusTarget).add(MAP_INTRO_ENCELADUS_CAMERA_OFFSET)
  this.introCamera.fov = MAP_INTRO_ENCELADUS_FOV
  this.introCamera.updateProjectionMatrix()
  this.introCamera.lookAt(enceladusTarget)
  renderPass.camera = this.introCamera
}

/** Beat 3 (0.28–0.42): Viroid reveal — camera pulls slightly closer to Enceladus. */
private tickIntroBeatViroidReveal(progress: number, renderPass: RenderPass): void {
  const saturn = this.getPlanetControllerById('saturn')
  if (!saturn || !this.introCamera) return

  const enceladusTarget = this.getEnceladusWorldPos(saturn)
  if (!enceladusTarget) return

  const t = (progress - MAP_INTRO_BEAT_VIROIDS) / (MAP_INTRO_BEAT_JUPITER - MAP_INTRO_BEAT_VIROIDS)
  const closeOffset = MAP_INTRO_ENCELADUS_CAMERA_OFFSET.clone().multiplyScalar(1 - t * 0.3)
  this.introCamera.position.copy(enceladusTarget).add(closeOffset)
  this.introCamera.fov = MAP_INTRO_ENCELADUS_FOV
  this.introCamera.updateProjectionMatrix()
  this.introCamera.lookAt(enceladusTarget)
  renderPass.camera = this.introCamera
}

/** Beat 4a (0.42–0.56): Sweep from Saturn/Enceladus to Jupiter. */
private tickIntroBeatJupiterApproach(progress: number, renderPass: RenderPass): void {
  const saturn = this.getPlanetControllerById('saturn')
  const jupiter = this.getPlanetControllerById('jupiter')
  if (!saturn || !jupiter || !this.introCamera) return

  const enceladusPos = this.getEnceladusWorldPos(saturn)
  if (!enceladusPos) return
  const fromPos = enceladusPos.clone().add(MAP_INTRO_ENCELADUS_CAMERA_OFFSET.clone().multiplyScalar(0.7))
  const jupiterTarget = new THREE.Vector3(jupiter.getWorldX(), 0, jupiter.getWorldZ())
  const toPos = jupiterTarget.clone().add(MAP_INTRO_JUPITER_CAMERA_OFFSET)

  const t = easeInOut(
    (progress - MAP_INTRO_BEAT_JUPITER) / (MAP_INTRO_BEAT_CLOUD_CITY - MAP_INTRO_BEAT_JUPITER),
  )
  this.introCamera.position.lerpVectors(fromPos, toPos, t)
  this.introCamera.fov = THREE.MathUtils.lerp(MAP_INTRO_ENCELADUS_FOV, MAP_INTRO_JUPITER_FOV, t)
  this.introCamera.updateProjectionMatrix()
  const lookTarget = new THREE.Vector3().lerpVectors(enceladusPos, jupiterTarget, t)
  this.introCamera.lookAt(lookTarget)
  renderPass.camera = this.introCamera
}

/** Beat 4b (0.56–0.70): Hold on Jupiter — cloud city reveal. */
private tickIntroBeatCloudCity(progress: number, renderPass: RenderPass): void {
  const jupiter = this.getPlanetControllerById('jupiter')
  if (!jupiter || !this.introCamera) return

  const jupiterTarget = new THREE.Vector3(jupiter.getWorldX(), 0, jupiter.getWorldZ())
  const t = (progress - MAP_INTRO_BEAT_CLOUD_CITY) / (MAP_INTRO_BEAT_EARTH - MAP_INTRO_BEAT_CLOUD_CITY)
  const offset = new THREE.Vector3().lerpVectors(
    MAP_INTRO_JUPITER_CAMERA_OFFSET,
    MAP_INTRO_JUPITER_CLOSE_OFFSET,
    t,
  )
  this.introCamera.position.copy(jupiterTarget).add(offset)
  this.introCamera.fov = MAP_INTRO_JUPITER_FOV
  this.introCamera.updateProjectionMatrix()
  this.introCamera.lookAt(jupiterTarget)
  renderPass.camera = this.introCamera
}

/** Beat 5 (0.70–1.00): Sweep to shuttle, hero hold, orbit handoff. */
private tickIntroBeatEarthPlayer(progress: number, renderPass: RenderPass): void {
  if (!this.introCamera || !this.vehicleCamera || !this.shuttleController) return

  const jupiter = this.getPlanetControllerById('jupiter')
  const jupiterPos = jupiter
    ? new THREE.Vector3(jupiter.getWorldX(), 0, jupiter.getWorldZ()).add(MAP_INTRO_JUPITER_CLOSE_OFFSET)
    : MAP_INTRO_CAMERA_START_POSITION

  const heroPosition = this.shuttleController.group.position
    .clone()
    .add(MAP_INTRO_HERO_OFFSET.clone().applyQuaternion(this.shuttleController.group.quaternion))
  const heroTarget = this.shuttleController.group.position
    .clone()
    .add(MAP_INTRO_HERO_LOOK_AT_OFFSET)
  const targetPosition = this.vehicleCamera.camera.position
  const targetLookAt = this.vehicleCamera.controls.target

  if (progress < MAP_INTRO_HERO_HOLD_START) {
    // Travel from Jupiter to hero position
    const t = easeInOut(
      (progress - MAP_INTRO_BEAT_EARTH) / (MAP_INTRO_HERO_HOLD_START - MAP_INTRO_BEAT_EARTH),
    )
    this.introCamera.position.lerpVectors(jupiterPos, heroPosition, t)
    this.introCamera.fov = THREE.MathUtils.lerp(MAP_INTRO_JUPITER_FOV, MAP_INTRO_HERO_FOV, t)
    this.introCamera.updateProjectionMatrix()
    const jupiterTarget = jupiter
      ? new THREE.Vector3(jupiter.getWorldX(), 0, jupiter.getWorldZ())
      : MAP_INTRO_CAMERA_START_TARGET
    const lookTarget = new THREE.Vector3().lerpVectors(jupiterTarget, heroTarget, t)
    this.introCamera.lookAt(lookTarget)
    renderPass.camera = this.introCamera
    return
  }

  if (progress < MAP_INTRO_HERO_HOLD_END) {
    // Hero hold
    this.introCamera.position.copy(heroPosition)
    this.introCamera.fov = MAP_INTRO_HERO_FOV
    this.introCamera.updateProjectionMatrix()
    this.introCamera.lookAt(heroTarget)
    renderPass.camera = this.introCamera
    return
  }

  // Orbit camera handoff
  const t = easeInOut(
    (progress - MAP_INTRO_HERO_HOLD_END) / (1 - MAP_INTRO_HERO_HOLD_END),
  )
  this.introCamera.position.lerpVectors(heroPosition, targetPosition, t)
  this.introCamera.fov = THREE.MathUtils.lerp(
    MAP_INTRO_HERO_FOV,
    this.vehicleCamera.camera.fov,
    t,
  )
  this.introCamera.updateProjectionMatrix()
  const lookTarget = new THREE.Vector3().lerpVectors(heroTarget, targetLookAt, t)
  this.introCamera.lookAt(lookTarget)
  renderPass.camera = this.introCamera
}

/** Helper: get Enceladus world position from Saturn controller. */
private getEnceladusWorldPos(saturn: PlanetSystemController): THREE.Vector3 | null {
  return saturn.getMoonWorldPosition(ENCELADUS_MOON_INDEX, this.introMoonWorldPos)
}
```

- [ ] **Step 6: Clean up disposed props on intro complete/skip**

Find the method that calls `restoreIntroMapLayers()` (the intro completion path) and add cleanup there. Also add cleanup in any skip/dispose path. After `restoreIntroMapLayers()` calls, add:

```ts
this.disposeIntroVirus(this.sceneObjects!.scene)
this.disposeIntroCity(this.sceneObjects!.scene)
```

Also add the same cleanup in the `dispose()` method of MapViewController to prevent leaks if the scene is torn down mid-intro.

- [ ] **Step 7: Verify build**

Run: `bun run type-check`
Expected: No errors

- [ ] **Step 8: Run all tests**

Run: `bun test:unit`
Expected: ALL PASS (including the updated caption tests from Task 1)

- [ ] **Step 9: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "feat: 6-beat intro camera with VirusModel and CityModel props"
```

---

### Task 4: Update the GDD with canonized lore

**Files:**
- Modify: `docs/asteroid-lander-gdd.md`

- [ ] **Step 1: Update the Lore & Setting section**

In `docs/asteroid-lander-gdd.md`, find the "### The World" section (around line 17). After the first paragraph about the 2300s, insert the following new paragraphs before the "Then the bubble collapsed" paragraph:

```markdown
It started on Enceladus. A geological survey team drilling through the ice shell found something that shouldn't have existed: a crystalline lattice structure that, when energized, produced thrust at relativistic scales. The neutron thruster. Suddenly, interplanetary travel wasn't measured in months — it was measured in days.

But Enceladus wasn't empty. The drilling woke something. Silicate creatures — ancient, from interstellar space, territorial and lethal. Humanity calls them Viroids. They'd been slumbering in the ice for millennia, and they didn't appreciate the company.

The neutron thruster fit remarkably well with 21st-century space tech. NASA-era lander designs, mothballed for two centuries, turned out to be the perfect chassis. Jupiter became the industrial heart of the expansion — its moons supplied raw materials, and a cloud city above the surface housed 3D-printing assembly lines that churned out ships by the thousands. Humanity spread fast.
```

Update "### The Player" section to add after the first paragraph:

```markdown
Earth-born, Moon-raised. You spent decades running lander ops for belt mining outfits before the work dried up. Something happened after you retired — something you don't talk about. You bought a ship to live in. You don't live on planets anymore.
```

- [ ] **Step 2: Commit**

```bash
git add docs/asteroid-lander-gdd.md
git commit -m "docs: canonize Enceladus, Viroids, Jupiter cloud city lore in GDD"
```

---

### Task 5: Visual tuning pass

Camera offsets, prop scales, and FOVs are initial guesses. This task is a tuning pass done in-browser.

**Files:**
- Modify: `src/views/MapViewController.ts` (constants only)

- [ ] **Step 1: Run dev server and trigger the intro**

Run: `bun dev`

Clear your player profile in localStorage (delete `asteroid-lander-profile`) to ensure `hasSeenIntro` is false, then reload the page and enter a name.

- [ ] **Step 2: Tune Enceladus framing (Beat 2)**

Adjust `MAP_INTRO_ENCELADUS_CAMERA_OFFSET` and `MAP_INTRO_ENCELADUS_FOV` until Saturn is visible in background and Enceladus is prominent. The moon is tiny (displayRadius 0.0008 × SIZE_SCALE 80 = 0.064 world units), so the camera needs to be very close.

- [ ] **Step 3: Tune VirusModel scale and placement (Beat 3)**

Adjust the `scale` parameter in `spawnIntroVirus` (currently `8`) and the position offset (`0.15, 0.1, 0`) until the virus reads clearly against Enceladus without clipping.

- [ ] **Step 4: Tune Jupiter framing (Beat 4a/4b)**

Adjust `MAP_INTRO_JUPITER_CAMERA_OFFSET`, `MAP_INTRO_JUPITER_CLOSE_OFFSET`, and `MAP_INTRO_JUPITER_FOV`. Jupiter is much larger (displayRadius 0.0165 × 80 = 1.32 world units) so the camera can be farther out.

- [ ] **Step 5: Tune CityModel scale and placement (Beat 4b)**

Adjust the `scale` parameter in `spawnIntroCity` (currently `0.3`) and the Y offset (currently `1.5`) until the cloud city reads above Jupiter's surface.

- [ ] **Step 6: Tune beat timing if needed**

If any beat feels too fast or too slow, adjust the boundary constants in `mapIntroState.ts` and update tests to match.

- [ ] **Step 7: Commit tuning values**

```bash
git add src/views/MapViewController.ts src/lib/mapIntroState.ts src/lib/__tests__/mapIntroState.spec.ts
git commit -m "tune: intro cinematic camera offsets, prop scales, and beat timing"
```
