# Timer Utility Design

## Purpose

Replace rogue `setTimeout` calls across the Vue layer with a standalone RAF-based `Timer` class that pauses naturally on tab-away and provides a clean API for one-shot delays and sequenced steps.

## Location

`src/lib/Timer.ts`

## Design

### Architecture

Static class with a single shared RAF loop. The loop starts lazily on the first timer registration and stops automatically when no timers remain (zero cost at idle). Delta time is clamped to `0.1s` to prevent tab-away burst — same policy as `GameLoop`.

**Not a `Tickable`.** The Timer is independent of `TickHandler` and its priority system. It owns its own RAF loop because:

- All current consumers are Vue UI components, not game-loop participants
- UI timers should work on screens that may not have an active `GameLoop`
- Timer entries don't need priority ordering relative to physics/rendering

### Public API

```ts
/** Opaque handle returned by timer creation methods, used for cancellation. */
type TimerHandle = number

class Timer {
  /** Fire `fn` once after `delaySec` seconds. */
  static after(delaySec: number, fn: () => void): TimerHandle

  /** Fire a sequence of steps, each waiting its own delay after the previous step completes. */
  static sequence(steps: ReadonlyArray<{ delay: number; fn: () => void }>): TimerHandle

  /** Cancel a specific timer by handle. */
  static cancel(handle: TimerHandle): void

  /** Cancel all active timers (scene teardown / onUnmounted). */
  static cancelAll(): void

  /** Number of active timer entries (useful for tests/debugging). */
  static get activeCount(): number
}
```

### Internal Model

Each timer entry tracks:

```ts
interface TimerEntry {
  id: number           // unique handle
  elapsed: number      // seconds accumulated so far
  delay: number        // seconds until this entry fires
  fn: () => void       // callback
  next?: TimerEntry    // linked list for sequences — next step to schedule on completion
}
```

- `Timer.after()` creates a single `TimerEntry`.
- `Timer.sequence()` creates a linked chain of entries. Only the head is active; on completion it schedules `entry.next` as a new active entry. The returned handle cancels the entire chain (including not-yet-scheduled steps).
- A monotonically increasing counter provides unique `TimerHandle` values.

### RAF Loop

```
on first timer added:
  if raf not running → start raf

each frame:
  compute dt = clamp(rawDelta, MAX_DELTA_S)
  for each active entry:
    entry.elapsed += dt
    if entry.elapsed >= entry.delay:
      call entry.fn()
      if entry.next exists → add entry.next as new active entry
      remove entry from active list

  if active list is empty → stop raf
```

### Constants

| Name | Value | Purpose |
|------|-------|---------|
| `MAX_DELTA_S` | `0.1` | Clamp delta to prevent burst after tab-away |
| `MS_TO_S` | `0.001` | Convert RAF timestamp milliseconds to seconds |

### Sequence Cancellation

When `Timer.cancel(handle)` is called on a sequence, it removes the currently active entry AND discards the entire `next` chain. This prevents orphaned callbacks from firing after a component unmounts.

`Timer.cancelAll()` clears the entire active list and stops the RAF loop.

## Migration Targets

### MissionAnnouncement.vue (nested setTimeout pyramid)

Before:
```ts
setTimeout(() => {
  phase.value = 'open'
  setTimeout(() => {
    phase.value = 'closing'
    setTimeout(() => {
      removed.value = true
    }, CLOSE_DURATION)
  }, HOLD_DURATION)
}, OPEN_DURATION)
```

After:
```ts
announcementTimer = Timer.sequence([
  { delay: OPEN_DURATION / 1000, fn: () => { phase.value = 'open' } },
  { delay: HOLD_DURATION / 1000, fn: () => { phase.value = 'closing' } },
  { delay: CLOSE_DURATION / 1000, fn: () => { removed.value = true } },
])
```

### GravitationalAnomalyHud.vue

Before:
```ts
if (hideTimer !== undefined) clearTimeout(hideTimer)
hideTimer = setTimeout(() => { showLocal.value = false }, DISPLAY_SECONDS * 1000)
```

After:
```ts
Timer.cancel(hideTimer)
hideTimer = Timer.after(DISPLAY_SECONDS, () => { showLocal.value = false })
```

### MapView.vue

Before:
```ts
if (missionNotificationTimer) clearTimeout(missionNotificationTimer)
missionNotificationTimer = setTimeout(() => { missionNotification.value = null }, 4000)
```

After:
```ts
Timer.cancel(missionNotificationTimer)
missionNotificationTimer = Timer.after(4, () => { missionNotification.value = null })
```

### LevelView.vue

Before:
```ts
setTimeout(() => { objCompleteVisible.value = false }, 5000)
```

After:
```ts
Timer.after(5, () => { objCompleteVisible.value = false })
```

## Testing

Unit tests in `src/lib/__tests__/timer.spec.ts`. Mock `requestAnimationFrame` / `cancelAnimationFrame` to drive the loop manually. Test:

1. `Timer.after` fires callback after elapsed time
2. `Timer.after` does not fire before delay
3. `Timer.cancel` prevents callback from firing
4. `Timer.sequence` fires steps in order with correct delays
5. `Timer.sequence` cancel stops entire chain
6. `Timer.cancelAll` clears everything
7. Delta clamping prevents burst after large time gaps
8. RAF loop stops when no timers remain
9. RAF loop restarts when new timer added after idle
