# Startup Message System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable tracked ship-message domain plus the first Outlook-like startup message dialog in `MapView`, with dismissal persisted in local storage.

**Architecture:** Keep the message domain in `src/lib/messages/` as pure TypeScript. A tested `MessageSystem` class manages definitions, triggers, active-message selection, and persistence; a small runtime singleton shares that state between `MapViewController` and `MapView`. The Vue layer only renders the current message and dismisses it.

**Tech Stack:** TypeScript, Vue 3, Vitest, Tailwind CSS v4, localStorage

---

### Task 1: Create message types and local-storage helpers

**Files:**
- Create: `src/lib/messages/messageTypes.ts`
- Create: `src/lib/messages/messageStorage.ts`
- Create: `src/lib/messages/__tests__/messageStorage.spec.ts`

- [ ] **Step 1: Write failing tests for message storage round-trip and corruption handling**

Create `src/lib/messages/__tests__/messageStorage.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import {
  SHIP_MESSAGE_STORAGE_KEY,
  loadMessageRecords,
  saveMessageRecords,
} from '../messageStorage'
import type { ShipMessageRecord } from '../messageTypes'

const mockStorage: Record<string, string> = {}

beforeEach(() => {
  for (const key of Object.keys(mockStorage)) {
    delete mockStorage[key]
  }

  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value
      },
      removeItem: (key: string) => {
        delete mockStorage[key]
      },
    },
    writable: true,
  })
})

describe('loadMessageRecords', () => {
  it('returns an empty object when storage is empty', () => {
    expect(loadMessageRecords()).toEqual({})
  })

  it('returns an empty object when storage contains invalid JSON', () => {
    mockStorage[SHIP_MESSAGE_STORAGE_KEY] = '{not-valid-json'
    expect(loadMessageRecords()).toEqual({})
  })
})

describe('saveMessageRecords', () => {
  it('round-trips message records through localStorage', () => {
    const records: Record<string, ShipMessageRecord> = {
      'seller-welcome': {
        id: 'seller-welcome',
        status: 'dismissed',
        shownAt: '2306-04-05T08:00:00.000Z',
        dismissedAt: '2306-04-05T08:05:00.000Z',
      },
    }

    saveMessageRecords(records)

    expect(loadMessageRecords()).toEqual(records)
  })

  it('stores the payload under the ship-message key', () => {
    saveMessageRecords({})
    expect(mockStorage[SHIP_MESSAGE_STORAGE_KEY]).toBeDefined()
  })
})
```

- [ ] **Step 2: Run the storage test to verify it fails**

Run: `bun test:unit src/lib/messages/__tests__/messageStorage.spec.ts`

Expected: FAIL because `messageStorage.ts`, `messageTypes.ts`, and the exported symbols do not exist yet.

- [ ] **Step 3: Add the shared message domain types**

Create `src/lib/messages/messageTypes.ts`:

```ts
/**
 * Core types for the shipboard message system.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-startup-message-system-design.md
 */

/** Gameplay trigger ids that can surface shipboard messages. */
export type ShipMessageTrigger = 'map_start_earth_orbit'

/** Persisted lifecycle state for a shipboard message. */
export type ShipMessageStatus = 'pending' | 'shown' | 'dismissed'

/** Static message definition authored in code. */
export interface ShipMessageDefinition {
  /** Stable id used for persistence and future quest references. */
  id: string
  /** Sender label shown in the reader header. */
  from: string
  /** Subject line shown in the reader header. */
  subject: string
  /** Lore-facing date string shown in the reader header. */
  sentAt: string
  /** Paragraphs rendered in the message body. */
  body: string[]
  /** Gameplay trigger that makes this message eligible. */
  trigger: ShipMessageTrigger
  /** Higher numbers win when multiple messages are active. */
  priority: number
}

/** Persisted runtime state for one message. */
export interface ShipMessageRecord {
  /** Stable id matching the static definition. */
  id: string
  /** Current lifecycle state. */
  status: ShipMessageStatus
  /** ISO timestamp for first time shown, or null when never shown. */
  shownAt: string | null
  /** ISO timestamp for dismissal, or null when still active. */
  dismissedAt: string | null
}

/** Message returned to the UI when it should currently be shown. */
export interface ActiveShipMessage extends ShipMessageDefinition {
  /** Current runtime lifecycle state. */
  status: Extract<ShipMessageStatus, 'pending' | 'shown'>
}
```

- [ ] **Step 4: Add the storage helpers**

Create `src/lib/messages/messageStorage.ts`:

```ts
/**
 * localStorage persistence for shipboard message state.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-startup-message-system-design.md
 */
import type { ShipMessageRecord } from './messageTypes'

/** Versioned localStorage key for persisted ship messages. */
export const SHIP_MESSAGE_STORAGE_KEY = 'asteroid-lander-ship-messages-v1'

/** Save the full message-record map to localStorage. */
export function saveMessageRecords(records: Record<string, ShipMessageRecord>): void {
  localStorage.setItem(SHIP_MESSAGE_STORAGE_KEY, JSON.stringify(records))
}

/** Load all persisted message records, or an empty object when absent/corrupt. */
export function loadMessageRecords(): Record<string, ShipMessageRecord> {
  const raw = localStorage.getItem(SHIP_MESSAGE_STORAGE_KEY)
  if (raw === null) return {}

  try {
    return JSON.parse(raw) as Record<string, ShipMessageRecord>
  } catch {
    return {}
  }
}
```

- [ ] **Step 5: Run the storage test to verify it passes**

Run: `bun test:unit src/lib/messages/__tests__/messageStorage.spec.ts`

Expected: PASS

- [ ] **Step 6: Run type-check for the new message files**

Run: `bun run type-check`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/messages/messageTypes.ts src/lib/messages/messageStorage.ts src/lib/messages/__tests__/messageStorage.spec.ts
git commit -m "feat: add ship message types and storage"
```

---

### Task 2: Implement the message system with trigger and dismissal logic

**Files:**
- Create: `src/lib/messages/messageSystem.ts`
- Create: `src/lib/messages/__tests__/messageSystem.spec.ts`

- [ ] **Step 1: Write failing tests for trigger activation, priority, and dismissal persistence**

Create `src/lib/messages/__tests__/messageSystem.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { MessageSystem } from '../messageSystem'
import type { ShipMessageDefinition, ShipMessageRecord } from '../messageTypes'

const definitions: ShipMessageDefinition[] = [
  {
    id: 'low-priority',
    from: 'Dispatch',
    subject: 'Low priority',
    sentAt: '2306-04-05 08:00 UTC',
    body: ['Low priority message body.'],
    trigger: 'map_start_earth_orbit',
    priority: 10,
  },
  {
    id: 'high-priority',
    from: 'Dispatch',
    subject: 'High priority',
    sentAt: '2306-04-05 08:01 UTC',
    body: ['High priority message body.'],
    trigger: 'map_start_earth_orbit',
    priority: 100,
  },
]

let savedRecords: Record<string, ShipMessageRecord> = {}

beforeEach(() => {
  savedRecords = {}
})

function createSystem(initialRecords: Record<string, ShipMessageRecord> = {}): MessageSystem {
  return new MessageSystem(definitions, {
    load: () => initialRecords,
    save: (records) => {
      savedRecords = structuredClone(records)
    },
  })
}

describe('MessageSystem.notifyTrigger', () => {
  it('creates an active pending message when a matching trigger fires', () => {
    const system = createSystem()

    system.notifyTrigger('map_start_earth_orbit')

    expect(system.getActiveMessage()).toMatchObject({
      id: 'high-priority',
      status: 'pending',
    })
  })

  it('chooses the highest-priority eligible message', () => {
    const system = createSystem()

    system.notifyTrigger('map_start_earth_orbit')

    expect(system.getActiveMessage()?.id).toBe('high-priority')
  })
})

describe('MessageSystem.markShown', () => {
  it('transitions the active message from pending to shown', () => {
    const system = createSystem()

    system.notifyTrigger('map_start_earth_orbit')
    system.markShown('high-priority')

    expect(system.getActiveMessage()).toMatchObject({
      id: 'high-priority',
      status: 'shown',
    })
  })
})

describe('MessageSystem.dismiss', () => {
  it('persists dismissal and clears the active message', () => {
    const system = createSystem()

    system.notifyTrigger('map_start_earth_orbit')
    system.dismiss('high-priority')

    expect(system.getActiveMessage()).toBeNull()
    expect(savedRecords['high-priority']).toMatchObject({
      id: 'high-priority',
      status: 'dismissed',
    })
  })

  it('does not re-surface a dismissed message after reload', () => {
    const reloaded = createSystem({
      'high-priority': {
        id: 'high-priority',
        status: 'dismissed',
        shownAt: '2306-04-05T08:00:00.000Z',
        dismissedAt: '2306-04-05T08:05:00.000Z',
      },
    })

    reloaded.notifyTrigger('map_start_earth_orbit')

    expect(reloaded.getActiveMessage()?.id).toBe('low-priority')
  })
})
```

- [ ] **Step 2: Run the message-system test to verify it fails**

Run: `bun test:unit src/lib/messages/__tests__/messageSystem.spec.ts`

Expected: FAIL because `messageSystem.ts` and `MessageSystem` do not exist yet.

- [ ] **Step 3: Implement the `MessageSystem` class**

Create `src/lib/messages/messageSystem.ts`:

```ts
/**
 * Trigger-driven shipboard message state machine.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-startup-message-system-design.md
 */
import { loadMessageRecords, saveMessageRecords } from './messageStorage'
import type {
  ActiveShipMessage,
  ShipMessageDefinition,
  ShipMessageRecord,
  ShipMessageTrigger,
} from './messageTypes'

/** Persistence adapter used for tests and runtime localStorage. */
export interface MessagePersistence {
  /** Load persisted message records. */
  load(): Record<string, ShipMessageRecord>
  /** Save the full message-record map. */
  save(records: Record<string, ShipMessageRecord>): void
}

/** Default localStorage-backed persistence. */
const defaultPersistence: MessagePersistence = {
  load: () => loadMessageRecords(),
  save: (records) => saveMessageRecords(records),
}

/** Runtime owner for message definitions, records, and active selection. */
export class MessageSystem {
  private readonly definitions: Map<string, ShipMessageDefinition>
  private readonly persistence: MessagePersistence
  private records: Record<string, ShipMessageRecord>

  constructor(
    definitions: ShipMessageDefinition[],
    persistence: MessagePersistence = defaultPersistence,
  ) {
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]))
    this.persistence = persistence
    this.records = persistence.load()
  }

  /** Notify the system that a gameplay trigger occurred. */
  notifyTrigger(trigger: ShipMessageTrigger): void {
    for (const definition of this.definitions.values()) {
      if (definition.trigger !== trigger) continue

      const record = this.records[definition.id]
      if (record?.status === 'dismissed') continue
      if (record) continue

      this.records[definition.id] = {
        id: definition.id,
        status: 'pending',
        shownAt: null,
        dismissedAt: null,
      }
    }

    this.persist()
  }

  /** Return the highest-priority active message, or null when none exist. */
  getActiveMessage(): ActiveShipMessage | null {
    const activeRecords = Object.values(this.records)
      .filter((record) => record.status === 'pending' || record.status === 'shown')
      .sort((left, right) => {
        const leftPriority = this.definitions.get(left.id)?.priority ?? 0
        const rightPriority = this.definitions.get(right.id)?.priority ?? 0
        return rightPriority - leftPriority
      })

    const record = activeRecords[0]
    if (!record) return null

    const definition = this.definitions.get(record.id)
    if (!definition) return null

    return {
      ...definition,
      status: record.status,
    }
  }

  /** Mark a pending message as shown so the status is tracked across reloads. */
  markShown(id: string, shownAt: string = new Date().toISOString()): void {
    const record = this.records[id]
    if (!record || record.status !== 'pending') return

    this.records[id] = {
      ...record,
      status: 'shown',
      shownAt,
    }
    this.persist()
  }

  /** Dismiss a message so it does not appear again in this pass. */
  dismiss(id: string, dismissedAt: string = new Date().toISOString()): void {
    const record = this.records[id]
    if (!record) return

    this.records[id] = {
      ...record,
      status: 'dismissed',
      dismissedAt,
    }
    this.persist()
  }

  /** Return one record by id for debugging or future inbox work. */
  getRecord(id: string): ShipMessageRecord | null {
    return this.records[id] ?? null
  }

  /** Persist the current record map. */
  private persist(): void {
    this.persistence.save(this.records)
  }
}
```

- [ ] **Step 4: Run the message-system test to verify it passes**

Run: `bun test:unit src/lib/messages/__tests__/messageSystem.spec.ts`

Expected: PASS

- [ ] **Step 5: Run both message-domain test files together**

Run: `bun test:unit src/lib/messages/__tests__/messageStorage.spec.ts src/lib/messages/__tests__/messageSystem.spec.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/messages/messageSystem.ts src/lib/messages/__tests__/messageSystem.spec.ts
git commit -m "feat: add ship message system"
```

---

### Task 3: Add the startup message catalog and shared runtime singleton

**Files:**
- Create: `src/lib/messages/messageCatalog.ts`
- Create: `src/lib/messages/runtime.ts`

- [ ] **Step 1: Create the startup seller message catalog**

Create `src/lib/messages/messageCatalog.ts`:

```ts
/**
 * Authored shipboard message definitions.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-startup-message-system-design.md
 */
import type { ShipMessageDefinition } from './messageTypes'

/** Opening seller handoff message shown when the player starts in Earth orbit. */
export const STARTUP_SELLER_MESSAGE: ShipMessageDefinition = {
  id: 'seller-welcome-earth-orbit',
  from: 'Marta Vale, Vale Orbital Refurb',
  subject: 'Your Shuttle Handoff and First Flight Notes',
  sentAt: '2306-04-05 08:14 UTC',
  trigger: 'map_start_earth_orbit',
  priority: 100,
  body: [
    'Handoff is complete. Our runner got you up from the Moon and left you parked in low Earth orbit beside your shuttle. That is standard. These old boats do not go down planetside anymore, and nobody sensible asks them to.',
    'You bought a working orbital vessel, not a landing craft. Treat the shuttle like a house with engines. The habitat in the bay is yours, the flight deck is yours, and the lander riding inside is how you go down to rocks without turning your home into scrap.',
    'You can open the cargo bay with F whenever you want to inspect what you paid for. Use it before you head out. Better to look at your doors and your payload while you are still over Earth than out past Jupiter with nobody listening.',
    'For navigation, remember this ship makes its money on efficient flight, not brute thrust. Catch orbit when you can, then use the slingshot. Come in clean, hold your line, and let the well do the work. If you try to burn straight across the system, all you will do is spend fuel and regret it.',
    'You know your trade, so I will not insult you with a manual in six languages. Take a minute, get your bearings, and then make the old girl earn her keep.',
    '— Marta',
  ],
}

/** Full message catalog for the current build. */
export const SHIP_MESSAGE_CATALOG: ShipMessageDefinition[] = [
  STARTUP_SELLER_MESSAGE,
]
```

- [ ] **Step 2: Create the shared runtime singleton**

Create `src/lib/messages/runtime.ts`:

```ts
/**
 * Shared runtime instance for shipboard messages.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-startup-message-system-design.md
 */
import { SHIP_MESSAGE_CATALOG } from './messageCatalog'
import { MessageSystem } from './messageSystem'

/** App-wide ship message runtime shared by views and controllers. */
export const shipMessageSystem = new MessageSystem(SHIP_MESSAGE_CATALOG)
```

- [ ] **Step 3: Run type-check to verify the catalog and singleton compile**

Run: `bun run type-check`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/messages/messageCatalog.ts src/lib/messages/runtime.ts
git commit -m "feat: add startup ship message catalog"
```

---

### Task 4: Build the Outlook-like ship message dialog UI

**Files:**
- Create: `src/components/ShipMessageDialog.vue`
- Modify: `src/assets/css/main.css`

- [ ] **Step 1: Add reusable Tailwind utility classes for the dialog**

Append to `src/assets/css/main.css`:

```css
.ship-message-dialog {
  @apply absolute inset-0 z-40 flex items-center justify-center bg-slate-950/55 px-6 py-8 backdrop-blur-sm;
}

.ship-message-card {
  @apply w-full max-w-4xl overflow-hidden rounded-2xl border border-cyan-400/25 bg-slate-950/90 text-slate-100 shadow-2xl;
  box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.08), 0 30px 80px rgba(2, 6, 23, 0.7);
}

.ship-message-card__chrome {
  @apply flex items-center justify-between border-b border-white/10 bg-white/5 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.28em] text-cyan-200/80;
}

.ship-message-card__body {
  @apply grid gap-0 lg:grid-cols-[18rem_minmax(0,1fr)];
}

.ship-message-card__meta {
  @apply border-b border-white/10 bg-white/[0.03] p-5 lg:border-b-0 lg:border-r;
}

.ship-message-card__meta-row {
  @apply mb-4;
}

.ship-message-card__meta-label {
  @apply mb-1 font-mono text-[10px] uppercase tracking-[0.28em] text-slate-400;
}

.ship-message-card__meta-value {
  @apply text-sm text-slate-100;
}

.ship-message-card__content {
  @apply flex min-h-[28rem] flex-col;
}

.ship-message-card__subject {
  @apply border-b border-white/10 px-6 py-5 text-2xl font-semibold tracking-tight text-white;
}

.ship-message-card__copy {
  @apply flex-1 space-y-4 px-6 py-5 text-[15px] leading-7 text-slate-200;
}

.ship-message-card__footer {
  @apply flex items-center justify-between border-t border-white/10 px-6 py-4;
}

.ship-message-card__hint {
  @apply font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500;
}

.ship-message-card__button {
  @apply rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.24em] text-cyan-100 transition;
}

.ship-message-card__button:hover {
  @apply border-cyan-200/50 bg-cyan-200/20 text-white;
}
```

- [ ] **Step 2: Create the dialog component**

Create `src/components/ShipMessageDialog.vue`:

```vue
<script setup lang="ts">
import type { ActiveShipMessage } from '@/lib/messages/messageTypes'

const props = defineProps<{
  message: ActiveShipMessage
}>()

const emit = defineEmits<{
  dismiss: []
}>()
</script>

<template>
  <div class="ship-message-dialog">
    <section class="ship-message-card" aria-label="Shipboard message">
      <header class="ship-message-card__chrome">
        <span>ShipNet / Stored Message</span>
        <span>Link Stable</span>
      </header>

      <div class="ship-message-card__body">
        <aside class="ship-message-card__meta">
          <div class="ship-message-card__meta-row">
            <div class="ship-message-card__meta-label">From</div>
            <div class="ship-message-card__meta-value">{{ props.message.from }}</div>
          </div>

          <div class="ship-message-card__meta-row">
            <div class="ship-message-card__meta-label">Date</div>
            <div class="ship-message-card__meta-value">{{ props.message.sentAt }}</div>
          </div>

          <div class="ship-message-card__meta-row">
            <div class="ship-message-card__meta-label">Status</div>
            <div class="ship-message-card__meta-value">{{ props.message.status }}</div>
          </div>
        </aside>

        <div class="ship-message-card__content">
          <h2 class="ship-message-card__subject">{{ props.message.subject }}</h2>

          <div class="ship-message-card__copy">
            <p v-for="paragraph in props.message.body" :key="paragraph">
              {{ paragraph }}
            </p>
          </div>

          <footer class="ship-message-card__footer">
            <span class="ship-message-card__hint">Stored aboard habitat shuttle memory</span>
            <button
              type="button"
              class="ship-message-card__button"
              @click="emit('dismiss')"
            >
              Dismiss
            </button>
          </footer>
        </div>
      </div>
    </section>
  </div>
</template>
```

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/ShipMessageDialog.vue src/assets/css/main.css
git commit -m "feat: add ship message dialog"
```

---

### Task 5: Wire the startup trigger into `MapViewController` and render the active dialog in `MapView`

**Files:**
- Modify: `src/views/MapViewController.ts`
- Modify: `src/views/MapView.vue`

- [ ] **Step 1: Add the map-start trigger in `MapViewController`**

In `src/views/MapViewController.ts`, add the import:

```ts
import { shipMessageSystem } from '@/lib/messages/runtime'
```

Inside the default Earth-orbit branch in `init()` (the `if (!arrived && earthController) { ... }` block), add the trigger notification after the shuttle is frozen, the camera is switched, and the orbit ring is shown:

```ts
      this.shuttleController.freeze()
      this.shuttleController.setInputEnabled(false)
      this.vehicleCamera.setConfig(MAP_ORBIT_CAMERA_CONFIG)
      this.showOrbitRing(orbitR)
      if (this.orbitRing) {
        this.orbitRing.position.set(ex, 0, ez)
      }

      shipMessageSystem.notifyTrigger('map_start_earth_orbit')
```

- [ ] **Step 2: Add the active-message state to `MapView.vue`**

In `src/views/MapView.vue`, add these imports:

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { MapViewController } from './MapViewController'
import ShuttleHud from '@/components/ShuttleHud.vue'
import OrbitPrompt from '@/components/OrbitPrompt.vue'
import ShipMessageDialog from '@/components/ShipMessageDialog.vue'
import { shipMessageSystem } from '@/lib/messages/runtime'
import type { ActiveShipMessage } from '@/lib/messages/messageTypes'
import type { ShuttleTelemetry } from '@/lib/ShuttleTelemetry'
import type { OrbitHudState } from '@/lib/orbitCapture'
```

After `const viewController = new MapViewController()`, add:

```ts
const container = ref<HTMLElement>()
const viewController = new MapViewController()
const activeMessage = ref<ActiveShipMessage | null>(null)

function refreshActiveMessage(): void {
  const nextMessage = shipMessageSystem.getActiveMessage()
  if (nextMessage?.status === 'pending') {
    shipMessageSystem.markShown(nextMessage.id)
  }
  activeMessage.value = shipMessageSystem.getActiveMessage()
}

function dismissActiveMessage(): void {
  if (!activeMessage.value) return
  shipMessageSystem.dismiss(activeMessage.value.id)
  refreshActiveMessage()
}
```

- [ ] **Step 3: Refresh the message after controller initialization**

Still in `src/views/MapView.vue`, update `onMounted()`:

```ts
onMounted(async () => {
  if (container.value) {
    viewController.onTelemetry = (t) => {
      Object.assign(telemetry, t)
    }
    viewController.onOrbitState = (s) => {
      Object.assign(orbitState, s)
    }
    await viewController.init(container.value)
    refreshActiveMessage()
  }
})
```

- [ ] **Step 4: Render the dialog in the template**

Update the template in `src/views/MapView.vue`:

```vue
<template>
  <div ref="container" class="scene-container"></div>
  <ShuttleHud :telemetry="telemetry" />
  <OrbitPrompt :orbitState="orbitState" />
  <ShipMessageDialog
    v-if="activeMessage"
    :message="activeMessage"
    @dismiss="dismissActiveMessage"
  />
</template>
```

- [ ] **Step 5: Run focused verification**

Run: `bun run type-check`

Expected: PASS

Run: `bun test:unit src/lib/messages/__tests__/messageStorage.spec.ts src/lib/messages/__tests__/messageSystem.spec.ts`

Expected: PASS

Run: `bun dev`

Expected:
- first load into `MapView` shows the seller message over the live Earth-orbit scene
- dismissing the dialog hides it immediately
- refreshing the page does not show it again
- the rest of the map HUD still renders behind the dialog

- [ ] **Step 6: Commit**

```bash
git add src/views/MapViewController.ts src/views/MapView.vue
git commit -m "feat: show startup ship message in map view"
```

---

### Task 6: Final lint, tests, and polish pass

**Files:** verification only unless fixes are needed

- [ ] **Step 1: Run the linter**

Run: `bun lint`

Expected: PASS with no missing TSDoc warnings on new exports.

- [ ] **Step 2: Run the full unit test suite**

Run: `bun test:unit`

Expected: PASS

- [ ] **Step 3: Run a production build**

Run: `bun run build`

Expected: PASS

- [ ] **Step 4: If verification finds issues, fix them and commit**

If any of the above commands fail, fix only the reported issues in the touched ship-message files, rerun the failing verification command until it passes, then commit:

```bash
git add -A
git commit -m "chore: fix ship message verification issues"
```
