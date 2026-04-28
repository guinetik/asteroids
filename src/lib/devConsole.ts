/**
 * AsteroidDev console — a first-class global dev-tools registry.
 *
 * Every view controller can register a named command namespace at mount time
 * and unregister it on destroy. The aggregated object is exposed as
 * `window.AsteroidDev` so commands are available from the browser console:
 *
 * ```js
 * AsteroidDev.LevelView.landNearObjective(0, 20)
 * AsteroidDev.LevelView.takeDamage(25)
 * AsteroidDev.MapView.skipIntro()
 * AsteroidDev.MapView.warp('earth')
 * AsteroidDev.MapView.spawnGravitationalEventNearPlayer(200)
 * AsteroidDev.MapView.grantGravitySurfing()
 * AsteroidDev.MapView.giveCredits(5000)
 * AsteroidDev.MapView.setUpgradeLevel('gravitySurfing', 0)
 * AsteroidDev.help()
 *
 * Map spacetime anomalies: import types/event names from `devConsole` or listen on
 * each {@link GravitationalEvent} for `gravitational-event-start` / `gravitational-event-finish`.
 * ```
 *
 * Only active in development builds (`import.meta.env.DEV`). In production,
 * `register` and `unregister` are no-ops and the global is never written.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-dev-console-design.md
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single named command exposed to the dev console.
 * The value is any callable; arguments and return type are intentionally loose
 * because console commands are typed at call-site by the registering controller.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DevCommand = (...args: any[]) => any

/**
 * A flat map of command names → implementations that a view controller
 * exposes under its namespace.
 *
 * @example
 * ```ts
 * const ns: DevNamespace = {
 *   takeDamage: (amount = 10) => player.takeDamage(amount),
 *   heal:       ()            => player.replenish(),
 * }
 * ```
 */
export type DevNamespace = Record<string, DevCommand>

/**
 * The shape of `window.AsteroidDev`.
 * Dynamic keys correspond to view-controller namespaces; `help` is always present.
 */
export interface AsteroidDevGlobal {
  /** Prints all registered namespaces and their command names to the console. */
  help(): void
  /** Registered per-view namespaces. */
  [namespace: string]: DevNamespace | (() => void)
}

// ─── Window augmentation ──────────────────────────────────────────────────────

declare global {
  /**
   * Browser `Window` augmented with the Asteroid Lander dev-tools registry.
   */
  interface Window {
    /** Dev-tools registry. Available in development builds only. */
    AsteroidDev: AsteroidDevGlobal
  }
}

// ─── Singleton implementation ─────────────────────────────────────────────────

/** Internal map of registered namespaces, keyed by name. */
const registry = new Map<string, DevNamespace>()

/**
 * Rebuilds the `window.AsteroidDev` object from the current registry state,
 * always injecting a fresh `help()` method.
 */
function sync(): void {
  const dev: AsteroidDevGlobal = {
    help() {
      if (registry.size === 0) {
        console.info('[AsteroidDev] No namespaces registered.')
        return
      }
      console.group('[AsteroidDev] Available commands')
      for (const [ns, cmds] of registry) {
        console.group(`AsteroidDev.${ns}`)
        for (const name of Object.keys(cmds)) {
          console.log(`  .${name}()`)
        }
        console.groupEnd()
      }
      console.groupEnd()
    },
  }

  for (const [ns, cmds] of registry) {
    dev[ns] = cmds
  }

  window.AsteroidDev = dev
}

/**
 * Registers a command namespace under `window.AsteroidDev.<name>`.
 *
 * Call this inside the view controller's `mount()` / initialisation method.
 * A second call with the same `name` replaces the previous namespace.
 * No-op in production builds.
 *
 * @param name - The namespace key, typically the view name (e.g. `'LevelView'`).
 * @param commands - Map of command names to implementations.
 *
 * @example
 * ```ts
 * DevConsole.register('LevelView', {
 *   takeDamage: (amount = 10) => this.playerController?.takeDamage(amount),
 *   heal:       ()            => this.playerController?.replenish(),
 *   kill:       ()            => this.playerController?.takeDamage(999),
 * })
 * ```
 */
export function register(name: string, commands: DevNamespace): void {
  if (!import.meta.env.DEV) return
  registry.set(name, commands)
  sync()
  console.debug(`[AsteroidDev] Registered namespace "${name}"`)
}

/**
 * Removes a previously registered namespace from `window.AsteroidDev`.
 *
 * Call this inside the view controller's `destroy()` / unmount method.
 * No-op if the namespace was never registered. No-op in production builds.
 *
 * @param name - The namespace key passed to {@link register}.
 *
 * @example
 * ```ts
 * DevConsole.unregister('LevelView')
 * ```
 */
export function unregister(name: string): void {
  if (!import.meta.env.DEV) return
  registry.delete(name)
  sync()
  console.debug(`[AsteroidDev] Unregistered namespace "${name}"`)
}

/**
 * Convenience namespace re-export so callers can write:
 *
 * ```ts
 * import { DevConsole } from '@/lib/devConsole'
 * DevConsole.register(...)
 * DevConsole.unregister(...)
 * ```
 */
export const DevConsole = { register, unregister }

// ─── Map gravitational anomalies (types + event names for console listeners) ───

export {
  GravitationalEvent,
  GravitationalEventManager,
  GRAVITATIONAL_EVENT_FINISH,
  GRAVITATIONAL_EVENT_START,
} from './physics/gravitationalEvent'

export type {
  GravitationalEventFinishDetail,
  GravitationalEventNearbyHudCallbacks,
  GravitationalEventSpawnOptions,
  GravitationalEventStartDetail,
} from './physics/gravitationalEvent'
