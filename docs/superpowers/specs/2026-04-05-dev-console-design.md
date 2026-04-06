# AsteroidDev Console — Design Spec

**Date:** 2026-04-05  
**Author:** guinetik  
**Status:** Implemented

---

## Problem

`window.AsteroidDev` was a plain object hard-coded inside `LevelViewController.init()`.
It was tightly coupled to one view, impossible to use from other routes, and had no
lifecycle cleanup — stale commands lingered after navigating away.

## Goal

Make `window.AsteroidDev` a first-class, route-aware dev-tools registry. Any view
controller can contribute a named namespace of console commands, and those commands
disappear cleanly when the view is unmounted.

```js
// From the browser console, on any route that registered itself:
AsteroidDev.LevelView.takeDamage(25)
AsteroidDev.MapView.skipIntro()
AsteroidDev.FpsView.kill()
AsteroidDev.help()          // prints all registered namespaces + commands
```

---

## Design

### `src/lib/devConsole.ts`

A module-singleton with two exported functions and a convenience namespace:

| Export | Signature | Purpose |
|--------|-----------|---------|
| `register` | `(name: string, cmds: DevNamespace) => void` | Adds / replaces a namespace on `window.AsteroidDev`. No-op in production. |
| `unregister` | `(name: string) => void` | Removes a namespace. No-op in production. |
| `DevConsole` | `{ register, unregister }` | Convenience re-export for call-site imports. |

`window.AsteroidDev` is rebuilt from scratch on every `register`/`unregister` call,
so the object is always a clean snapshot of what's currently active.

`window.AsteroidDev.help()` is always injected and prints a grouped console table
of every namespace and its commands.

#### Production guard

```ts
if (!import.meta.env.DEV) return
```

Both functions bail immediately in production. The global is never written, the
registry is never populated.

#### Window type augmentation

`devConsole.ts` augments the global `Window` interface:

```ts
declare global {
  interface Window {
    AsteroidDev: AsteroidDevGlobal
  }
}
```

This means `window.AsteroidDev` is fully typed everywhere in the codebase without
needing a cast.

---

## Per-view registration

Each view controller follows the same pattern:

```ts
// In init() / at the end of setup:
DevConsole.register('LevelView', {
  takeDamage: (amount = 10) => this.playerController?.takeDamage(amount),
  heal:       ()            => this.playerController?.replenish(),
  kill:       ()            => this.playerController?.takeDamage(999),
})

// In dispose():
DevConsole.unregister('LevelView')
```

### Registered namespaces

| Namespace | Commands |
|-----------|----------|
| `LevelView` | `takeDamage(amount?)`, `heal()`, `kill()` |
| `MapView` | `skipIntro()`, `getShuttlePosition()`, `teleportToSun()` |
| `FpsView` | `takeDamage(amount?)`, `heal()`, `kill()` |
| `ShuttleView` | `toggleDoors()`, `freeze()`, `unfreeze()` |

---

## Adding new commands

1. Open the relevant `*ViewController.ts`.
2. Add the command function to the `DevConsole.register(...)` call in `init()`.
3. No other files need to change.

To add a whole new view:

1. Import `DevConsole` from `@/lib/devConsole`.
2. Call `DevConsole.register('MyView', { ... })` at the end of `init()`.
3. Call `DevConsole.unregister('MyView')` at the top of `dispose()`.

---

## Non-goals

- No persistence across page reloads (commands are re-registered at mount time).
- No remote access or WebSocket bridge — console only.
- No production exposure.
