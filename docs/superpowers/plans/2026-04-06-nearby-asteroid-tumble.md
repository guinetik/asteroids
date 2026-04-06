# Nearby Asteroid Tumble Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reintroduce a small amount of asteroid tumbling near the shuttle while keeping asteroid-belt update cost bounded on large maps.

**Architecture:** Keep asteroid belts static by default, then layer on a bounded nearby-tumble system inside `AsteroidBeltController`. Extract the radius, sample-window, and activation/deactivation rules into a small pure helper module with unit tests, then integrate that helper into the controller and pass shuttle position from `MapViewController`.

**Tech Stack:** TypeScript, Vue 3, Three.js, Vitest, Bun

---

## File Structure

### Create

- `src/three/controllers/asteroidBeltNearbyTumble.ts`
- `src/three/__tests__/asteroidBeltNearbyTumble.spec.ts`

### Modify

- `src/three/controllers/AsteroidBeltController.ts`
- `src/views/MapViewController.ts`

### Verify

- `bun test:unit src/three/__tests__/asteroidBeltNearbyTumble.spec.ts`
- `bun run type-check`

---

### Task 1: Add Nearby Tumble Helper Logic

**Files:**
- Create: `src/three/controllers/asteroidBeltNearbyTumble.ts`
- Test: `src/three/__tests__/asteroidBeltNearbyTumble.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import {
  decideNearbyTumbleState,
  getNearbyTumbleSampleWindow,
  isWithinNearbyTumbleRadius,
} from '../controllers/asteroidBeltNearbyTumble'

describe('isWithinNearbyTumbleRadius', () => {
  it('returns true when the asteroid is inside the nearby radius', () => {
    expect(
      isWithinNearbyTumbleRadius(
        { x: 3, y: 0, z: 4 },
        { x: 0, y: 0, z: 0 },
        5,
      ),
    ).toBe(true)
  })

  it('returns false when the asteroid is outside the nearby radius', () => {
    expect(
      isWithinNearbyTumbleRadius(
        { x: 6, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        5,
      ),
    ).toBe(false)
  })
})

describe('getNearbyTumbleSampleWindow', () => {
  it('wraps the sample window when it reaches the visible-count boundary', () => {
    expect(getNearbyTumbleSampleWindow(10, 8, 4)).toEqual({
      indices: [8, 9, 0, 1],
      nextCursor: 2,
    })
  })

  it('returns an empty window when nothing is visible', () => {
    expect(getNearbyTumbleSampleWindow(0, 0, 4)).toEqual({
      indices: [],
      nextCursor: 0,
    })
  })
})

describe('decideNearbyTumbleState', () => {
  it('activates an inactive nearby asteroid when under the active cap and the roll passes', () => {
    expect(
      decideNearbyTumbleState({
        isTumbling: false,
        isNearby: true,
        activeCount: 2,
        maxActiveCount: 5,
        activationChance: 0.25,
        activationRoll: 0.1,
        deactivationChance: 0.05,
        deactivationRoll: 0.99,
      }),
    ).toBe(true)
  })

  it('does not activate when already at the active cap', () => {
    expect(
      decideNearbyTumbleState({
        isTumbling: false,
        isNearby: true,
        activeCount: 5,
        maxActiveCount: 5,
        activationChance: 0.25,
        activationRoll: 0.01,
        deactivationChance: 0.05,
        deactivationRoll: 0.99,
      }),
    ).toBe(false)
  })

  it('forces a far asteroid back to the static state', () => {
    expect(
      decideNearbyTumbleState({
        isTumbling: true,
        isNearby: false,
        activeCount: 1,
        maxActiveCount: 5,
        activationChance: 0.25,
        activationRoll: 0.01,
        deactivationChance: 0.05,
        deactivationRoll: 0.99,
      }),
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test:unit src/three/__tests__/asteroidBeltNearbyTumble.spec.ts`

Expected: FAIL with a module-resolution or missing-export error for `asteroidBeltNearbyTumble.ts`.

- [ ] **Step 3: Write the minimal helper implementation**

```ts
/**
 * Pure helper logic for bounded nearby asteroid tumbling.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-nearby-asteroid-tumble-design.md
 */

/** Small vector-like shape used by pure nearby-tumble helpers. */
export interface Vector3Like {
  /** X position component. */
  readonly x: number
  /** Y position component. */
  readonly y: number
  /** Z position component. */
  readonly z: number
}

/** Input parameters for deciding whether an asteroid should tumble this pass. */
export interface NearbyTumbleDecision {
  /** Whether the asteroid is already tumbling. */
  readonly isTumbling: boolean
  /** Whether the asteroid is currently inside the nearby tumble radius. */
  readonly isNearby: boolean
  /** Number of active tumblers already enabled for this mesh. */
  readonly activeCount: number
  /** Hard cap for active tumblers on this mesh. */
  readonly maxActiveCount: number
  /** Chance to activate a nearby inactive asteroid. */
  readonly activationChance: number
  /** Random roll in [0, 1) used for activation. */
  readonly activationRoll: number
  /** Chance to deactivate a nearby active asteroid. */
  readonly deactivationChance: number
  /** Random roll in [0, 1) used for deactivation. */
  readonly deactivationRoll: number
}

/** Return shape for the rotating nearby-tumble sample window. */
export interface NearbyTumbleSampleWindow {
  /** Exact indices that should be inspected this pass. */
  readonly indices: number[]
  /** Cursor to use on the next pass. */
  readonly nextCursor: number
}

/**
 * Check whether an asteroid is close enough to the shuttle to be eligible for tumbling.
 *
 * @param asteroidLocalPosition - Asteroid position in belt-local space.
 * @param shuttleLocalPosition - Shuttle position converted into the same local space.
 * @param nearbyRadius - Nearby tumble radius in belt-local units.
 * @returns `true` when the asteroid is inside or on the radius boundary.
 */
export function isWithinNearbyTumbleRadius(
  asteroidLocalPosition: Vector3Like,
  shuttleLocalPosition: Vector3Like,
  nearbyRadius: number,
): boolean {
  const dx = asteroidLocalPosition.x - shuttleLocalPosition.x
  const dy = asteroidLocalPosition.y - shuttleLocalPosition.y
  const dz = asteroidLocalPosition.z - shuttleLocalPosition.z
  return dx * dx + dy * dy + dz * dz <= nearbyRadius * nearbyRadius
}

/**
 * Build the rotating sample window for one tumble evaluation pass.
 *
 * @param visibleCount - Number of currently visible instances.
 * @param cursor - Previous sample cursor.
 * @param sampleSize - Requested number of samples this pass.
 * @returns The exact indices to inspect and the next cursor value.
 */
export function getNearbyTumbleSampleWindow(
  visibleCount: number,
  cursor: number,
  sampleSize: number,
): NearbyTumbleSampleWindow {
  if (visibleCount <= 0 || sampleSize <= 0) {
    return { indices: [], nextCursor: 0 }
  }

  const actualSize = Math.min(visibleCount, sampleSize)
  const indices = Array.from({ length: actualSize }, (_, offset) => (cursor + offset) % visibleCount)
  return {
    indices,
    nextCursor: (cursor + actualSize) % visibleCount,
  }
}

/**
 * Decide whether an asteroid should be tumbling after this evaluation pass.
 *
 * @param input - Nearby tumble decision inputs.
 * @returns The next tumbling state for the asteroid.
 */
export function decideNearbyTumbleState(input: NearbyTumbleDecision): boolean {
  if (!input.isNearby) return false

  if (!input.isTumbling) {
    if (input.activeCount >= input.maxActiveCount) return false
    return input.activationRoll < input.activationChance
  }

  return !(input.deactivationRoll < input.deactivationChance)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test:unit src/three/__tests__/asteroidBeltNearbyTumble.spec.ts`

Expected: PASS with all helper tests green.

- [ ] **Step 5: Commit**

```bash
git add src/three/controllers/asteroidBeltNearbyTumble.ts src/three/__tests__/asteroidBeltNearbyTumble.spec.ts
git commit -m "feat: add nearby tumble helpers"
```

---

### Task 2: Integrate Nearby Tumble Into `AsteroidBeltController`

**Files:**
- Modify: `src/three/controllers/AsteroidBeltController.ts`
- Modify: `src/views/MapViewController.ts`
- Test: `src/three/__tests__/asteroidBeltNearbyTumble.spec.ts`

- [ ] **Step 1: Extend the helper test with a sample-window progression case**

```ts
it('advances the cursor by the number of sampled visible asteroids', () => {
  const first = getNearbyTumbleSampleWindow(6, 0, 2)
  expect(first).toEqual({ indices: [0, 1], nextCursor: 2 })

  const second = getNearbyTumbleSampleWindow(6, first.nextCursor, 2)
  expect(second).toEqual({ indices: [2, 3], nextCursor: 4 })
})
```

- [ ] **Step 2: Run the targeted test to verify the new case starts red if needed**

Run: `bun test:unit src/three/__tests__/asteroidBeltNearbyTumble.spec.ts`

Expected: PASS if the existing helper already covers this behavior, otherwise FAIL until the helper behavior matches the new assertion.

- [ ] **Step 3: Update `AsteroidBeltController` to store bounded nearby-tumble state**

```ts
import {
  decideNearbyTumbleState,
  getNearbyTumbleSampleWindow,
  isWithinNearbyTumbleRadius,
} from '@/three/controllers/asteroidBeltNearbyTumble'

const NEARBY_TUMBLE_RADIUS = 0.8
const NEARBY_TUMBLE_EVALUATION_INTERVAL = 4
const NEARBY_TUMBLE_SAMPLE_SIZE = 24
const NEARBY_TUMBLE_ACTIVATION_CHANCE = 0.18
const NEARBY_TUMBLE_DEACTIVATION_CHANCE = 0.03
const NEARBY_TUMBLE_MAX_ACTIVE = 12

interface InstanceData {
  mesh: THREE.InstancedMesh
  maxCount: number
  baseMatrices: THREE.Matrix4[]
  localPositions: THREE.Vector3[]
  tumbleAxes: THREE.Vector3[]
  tumbleSpeeds: number[]
  tumblingStates: boolean[]
  activeTumblerIndices: Set<number>
  sampleCursor: number
}
```

Update instance creation so each asteroid stores the state needed to animate later:

```ts
const baseMatrices: THREE.Matrix4[] = []
const localPositions: THREE.Vector3[] = []
const tumbleAxes: THREE.Vector3[] = []
const tumbleSpeeds: number[] = []
const tumblingStates: boolean[] = Array.from({ length: count }, () => false)

// inside the instance loop
matrix.compose(position, quaternion, scale)
baseMatrices.push(matrix.clone())
localPositions.push(position.clone())
tumbleAxes.push(
  new THREE.Vector3(
    Math.random() - 0.5,
    Math.random() - 0.5,
    Math.random() - 0.5,
  ).normalize(),
)
tumbleSpeeds.push((0.5 + Math.random()) * belt.tumbleSpeed)
instancedMesh.setMatrixAt(i, matrix)

// when pushing controller state
controller.instanceDataList.push({
  mesh: instancedMesh,
  maxCount: count,
  baseMatrices,
  localPositions,
  tumbleAxes,
  tumbleSpeeds,
  tumblingStates,
  activeTumblerIndices: new Set<number>(),
  sampleCursor: 0,
})
```

- [ ] **Step 4: Update the controller tick to accept shuttle position and animate only the active nearby set**

```ts
private readonly shuttleLocalPosition = new THREE.Vector3()
private readonly tumbleQuat = new THREE.Quaternion()
private readonly tumbleMatrix = new THREE.Matrix4()
private readonly composedMatrix = new THREE.Matrix4()
private tumbleFrameCounter = 0

tick(dt: number, simTime: number, shuttleWorldPosition: THREE.Vector3 | null): void {
  this.group.rotation.y += dt * this.orbitalSpeed

  if (!shuttleWorldPosition) return

  this.tumbleFrameCounter++
  if (this.tumbleFrameCounter < NEARBY_TUMBLE_EVALUATION_INTERVAL) return
  this.tumbleFrameCounter = 0

  this.shuttleLocalPosition.copy(shuttleWorldPosition)
  this.group.worldToLocal(this.shuttleLocalPosition)

  for (const data of this.instanceDataList) {
    const sampleWindow = getNearbyTumbleSampleWindow(
      data.mesh.count,
      data.sampleCursor,
      NEARBY_TUMBLE_SAMPLE_SIZE,
    )
    data.sampleCursor = sampleWindow.nextCursor

    let activeCount = data.activeTumblerIndices.size

    for (const index of sampleWindow.indices) {
      const isNearby = isWithinNearbyTumbleRadius(
        data.localPositions[index]!,
        this.shuttleLocalPosition,
        NEARBY_TUMBLE_RADIUS,
      )

      const nextState = decideNearbyTumbleState({
        isTumbling: data.tumblingStates[index]!,
        isNearby,
        activeCount,
        maxActiveCount: NEARBY_TUMBLE_MAX_ACTIVE,
        activationChance: NEARBY_TUMBLE_ACTIVATION_CHANCE,
        activationRoll: Math.random(),
        deactivationChance: NEARBY_TUMBLE_DEACTIVATION_CHANCE,
        deactivationRoll: Math.random(),
      })

      const wasTumbling = data.tumblingStates[index]!
      if (nextState === wasTumbling) continue

      data.tumblingStates[index] = nextState
      if (nextState) {
        data.activeTumblerIndices.add(index)
        activeCount++
      } else {
        data.activeTumblerIndices.delete(index)
        activeCount--
        data.mesh.setMatrixAt(index, data.baseMatrices[index]!)
      }
    }

    let didWriteMatrices = false
    for (const index of data.activeTumblerIndices) {
      const angle = simTime * data.tumbleSpeeds[index]!
      this.tumbleQuat.setFromAxisAngle(data.tumbleAxes[index]!, angle)
      this.tumbleMatrix.makeRotationFromQuaternion(this.tumbleQuat)
      this.composedMatrix.multiplyMatrices(data.baseMatrices[index]!, this.tumbleMatrix)
      data.mesh.setMatrixAt(index, this.composedMatrix)
      didWriteMatrices = true
    }

    if (didWriteMatrices) {
      data.mesh.instanceMatrix.needsUpdate = true
    }
  }
}
```

- [ ] **Step 5: Pass shuttle position from `MapViewController` into each belt tick**

```ts
const shuttleWorldPosition = this.shuttleController?.group.position ?? null

for (const controller of this.beltControllers) {
  controller.tick(dt, this.simTime, shuttleWorldPosition)
}
```

- [ ] **Step 6: Run the targeted tests and type-check**

Run: `bun test:unit src/three/__tests__/asteroidBeltNearbyTumble.spec.ts`
Expected: PASS

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/three/controllers/AsteroidBeltController.ts src/views/MapViewController.ts src/three/__tests__/asteroidBeltNearbyTumble.spec.ts
git commit -m "feat: animate nearby belt asteroids"
```

---

### Task 3: Verify Bounded Runtime And Reset Behavior

**Files:**
- Modify: `src/three/controllers/AsteroidBeltController.ts`
- Test: `src/three/__tests__/asteroidBeltNearbyTumble.spec.ts`

- [ ] **Step 1: Add a helper test that proves far asteroids stay reset**

```ts
it('keeps far asteroids in the static state even when activation rolls would otherwise pass', () => {
  expect(
    decideNearbyTumbleState({
      isTumbling: false,
      isNearby: false,
      activeCount: 0,
      maxActiveCount: 5,
      activationChance: 1,
      activationRoll: 0,
      deactivationChance: 0,
      deactivationRoll: 0,
    }),
  ).toBe(false)
})
```

- [ ] **Step 2: Run the targeted test file**

Run: `bun test:unit src/three/__tests__/asteroidBeltNearbyTumble.spec.ts`

Expected: PASS

- [ ] **Step 3: Add one small cleanup to the controller so hidden LOD instances cannot stay active**

```ts
for (const index of Array.from(data.activeTumblerIndices)) {
  if (index >= data.mesh.count) {
    data.activeTumblerIndices.delete(index)
    data.tumblingStates[index] = false
    data.mesh.setMatrixAt(index, data.baseMatrices[index]!)
  }
}
```

Place this just before the active-tumbler animation loop so any indices hidden by
LOD immediately drop out of the active set.

- [ ] **Step 4: Re-run verification**

Run: `bun test:unit src/three/__tests__/asteroidBeltNearbyTumble.spec.ts`
Expected: PASS

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: Manual runtime check in the map view**

Run the game and verify all of the following:

- a few asteroids near the shuttle visibly tumble
- far asteroids remain static
- zooming far out does not cause the previous hitching pattern
- moving away from a nearby cluster causes old tumblers to settle back to static transforms

- [ ] **Step 6: Commit**

```bash
git add src/three/controllers/AsteroidBeltController.ts src/three/__tests__/asteroidBeltNearbyTumble.spec.ts
git commit -m "feat: bound nearby asteroid tumble"
```

---

## Self-Review

### Spec coverage

- Shared global tuning constants: covered in Task 2 constants
- Nearby-only probabilistic tumbling: covered in Task 2 helper integration
- Bounded sampling pass: covered in Task 1 helper + Task 2 sampling loop
- Hard cap on active tumblers: covered in Task 1 decision helper + Task 2 integration
- Resetting far asteroids to base transforms: covered in Task 2 deactivation path and Task 3 verification

### Placeholder scan

No `TODO`, `TBD`, or “implement later” placeholders remain. Each task includes exact file paths, concrete code blocks, exact commands, and explicit expected results.

### Type consistency

The plan uses one helper module name, one helper test file, one `tick(dt, simTime, shuttleWorldPosition)` signature, and one nearby-tumble state vocabulary throughout.
