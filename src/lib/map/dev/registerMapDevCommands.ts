/**
 * Dev-console command registration for the map view.
 *
 * Extracted so {@link MapViewController} no longer carries 20+ closures inline inside
 * `init`. The controller hands us a context of accessors + actions; we wire them to the
 * shared {@link DevConsole} keyed under `'MapView'`.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import { DevConsole } from '@/lib/devConsole'
import type { ShuttleController } from '@/three/ShuttleController'
import type { SunController } from '@/three/controllers/SunController'
import type { EvaSession } from '@/three/EvaSession'
import type { GravitationalEventManager } from '@/lib/physics/gravitationalEvent'
import type { UpgradeId } from '@/lib/upgrades'

/** Key used for {@link DevConsole.register} / `unregister`. */
export const MAP_DEV_CONSOLE_KEY = 'MapView'

/** Accessors + actions the dev-console closures delegate to. */
export interface MapDevCommandContext {
  /** Abort the opening intro cinematic. */
  skipIntro: () => void
  /** Current EVA session, or `null` outside EVA. */
  getEvaSession: () => EvaSession | null
  /** Live shuttle controller; used for pose dumps + teleports. */
  getShuttleController: () => ShuttleController | null
  /** Sun controller — target for the `teleportToSun` helper. */
  getSunController: () => SunController | null
  /** Transient-event manager; drives the gravitational anomaly dev commands. */
  getGravitationalEventManager: () => GravitationalEventManager | null
  /** Dev-warp entry point; resolves body ids and positions the shuttle just outside. */
  devWarpNearBody: (bodyId: string) => void
  /** Toggle planet orbit lines (delegates to controller's user-facing toggle). */
  toggleOrbits: () => boolean
  /** Toggle the space-time fabric grid visual. */
  toggleSpaceTimeGrid: () => boolean
  /** Toggle ambient particle layers. */
  toggleAmbient: () => boolean
  /** Toggle planet indicator labels. */
  toggleLabels: () => boolean
  /** Dev helper for setting an upgrade level (clamped, syncs HUD). */
  devSetPlayerUpgradeLevel: (upgradeId: UpgradeId, level: number) => void
  /** Award credits through the normal persist + HUD sync flow. */
  giveCredits: (amount: number) => void
  /** Enqueue the Consortium certification message + force its special mission. */
  devStartConsortiumCertificationMessage: () => void
  /** Open any orbital-minigame overlay by gather-item id (DEV only). */
  devOpenOrbitalMinigame: (gatherItem: string, quantity: number) => void
  /** Unlocks Hektor orbital capture for local contract-gate testing. */
  unlockHektor: () => void
  /** Restores Hektor orbital capture to the default restricted state. */
  restrictHektor: () => void
  /** Dev-spawn the Yamada Titania station as a pinned asset (idempotent). */
  spawnYamadaStation: () => void
  /** Dev-only: route directly to the Yamada Titania station interior. */
  openYamadaStation: () => void
}

/** Register the map-view dev-console commands. Idempotent across session restarts. */
export function registerMapDevCommands(ctx: MapDevCommandContext): void {
  DevConsole.register(MAP_DEV_CONSOLE_KEY, {
    skipIntro: () => {
      ctx.skipIntro()
    },
    toggleEvaColliders: () => {
      const session = ctx.getEvaSession()
      if (!session) return
      session.setColliderDebugVisible(!session.isColliderDebugVisible)
    },
    getShuttlePosition: () => {
      const pos = ctx.getShuttleController()?.group.position
      if (pos) {
        console.info(
          `[MapView] Shuttle: x=${pos.x.toFixed(1)} y=${pos.y.toFixed(1)} z=${pos.z.toFixed(1)}`,
        )
      }
    },
    teleportToSun: () => {
      const sun = ctx.getSunController()
      const shuttle = ctx.getShuttleController()
      if (!sun || !shuttle) return
      shuttle.group.position.set(sun.getWorldX() + 50, 0, sun.getWorldZ())
    },
    warp: (bodyId: string) => {
      ctx.devWarpNearBody(bodyId)
    },
    toggleOrbits: () => ctx.toggleOrbits(),
    toggleSpaceTimeGrid: () => ctx.toggleSpaceTimeGrid(),
    toggleAmbient: () => ctx.toggleAmbient(),
    toggleLabels: () => ctx.toggleLabels(),
    spawnGravitationalEvent: () => ctx.getGravitationalEventManager()?.spawnRandomInWorld() ?? null,
    spawnGravitationalEventNearPlayer: (maxOffset = 200) => {
      const mgr = ctx.getGravitationalEventManager()
      const shuttle = ctx.getShuttleController()
      if (!mgr || !shuttle) return null
      const p = shuttle.group.position
      return mgr.spawnNear(p.x, p.z, maxOffset)
    },
    clearGravitationalEvents: () => ctx.getGravitationalEventManager()?.clear(),
    setGravitationalEventAutoSpawn: (enabled: boolean) => {
      ctx.getGravitationalEventManager()?.setAutoSpawnEnabled(Boolean(enabled))
    },
    grantGravitySurfing: () => {
      ctx.devSetPlayerUpgradeLevel('gravitySurfing', 1)
    },
    giveCredits: (amount = 1000) => {
      ctx.giveCredits(amount)
    },
    setUpgradeLevel: (upgradeId: UpgradeId, level: number) => {
      ctx.devSetPlayerUpgradeLevel(upgradeId, level)
    },
    startConsortiumCertificationMessage: () => {
      ctx.devStartConsortiumCertificationMessage()
    },
    openMinigame: (gatherItem = 'venusian-gas', quantity = 5) => {
      ctx.devOpenOrbitalMinigame(gatherItem, quantity)
    },
    unlockHektor: () => {
      ctx.unlockHektor()
    },
    restrictHektor: () => {
      ctx.restrictHektor()
    },
    spawnYamadaStation: () => {
      ctx.spawnYamadaStation()
    },
    openYamadaStation: () => {
      ctx.openYamadaStation()
    },
  })
}

/** Companion teardown — always pairs with {@link registerMapDevCommands}. */
export function unregisterMapDevCommands(): void {
  DevConsole.unregister(MAP_DEV_CONSOLE_KEY)
}
