import * as THREE from 'three'
import type { ShuttleAudioDirector } from '@/audio/ShuttleAudioDirector'
import {
  acceptAsteroidMission,
  acceptEvaMission,
  acceptMission,
  beginAsteroidMission,
  completeEvaMission,
  completeMission,
  createMissionBoard,
  deliverMission,
  getActiveMissionsForPlanet,
  offerAsteroidMission,
  offerEvaMission,
  offerMission,
  tickAsteroidMissionBoard,
  tickEvaMissionBoard,
  tickMissionBoard,
} from '@/lib/missions/shuttleMissionSession'
import type {
  ActiveShuttleMission,
  GeneratedAsteroidMission,
  ShuttleMissionBoard,
} from '@/lib/missions/types'
import { getGatherItemForPlanet, getPlanetOrbitalConfig } from '@/lib/missions/planetOrbitalConfig'
import {
  takeTurretMiningMission,
  tickTurretMiningRestock,
} from '@/lib/missions/turretMiningSession'
import { deliverTurretMiningMission } from '@/lib/missions/turretMiningRewards'
import type { ActiveTurretMiningMission } from '@/lib/missions/types'
import { computeMissionDifficulty } from '@/lib/missions/missionDifficulty'
import {
  generateAsteroidMission,
  type AsteroidMissionHostAnchor,
} from '@/lib/missions/asteroidMissionGenerator'
import { canFitItem } from '@/lib/inventory/inventory'
import type { Inventory } from '@/lib/inventory/types'
import type { PlayerProfile } from '@/lib/player/types'
import { CURRENT_PLAYER_UPGRADE_LEVELS } from '@/lib/upgrades'
import { PLANETS } from '@/lib/planets/catalog'
import { ORBIT_SCALE } from '@/lib/planets/constants'
import {
  clearActiveMission,
  clearCompletedEvaSites,
  clearMissionBoard,
  loadCompletedEvaSites,
  loadActiveMission,
  loadMissionBoard,
  saveCompletedEvaSites,
  saveActiveMission,
  saveMissionBoard,
  type CompletedEvaSite,
} from '@/lib/missions/missionStorage'
import { isWithinAsteroidMissionApproachRadius } from '@/lib/missions/mapAsteroidMissionApproach'
import {
  createWaypointMarkerGroup,
  disposeWaypointMarkerGroup,
  ORBIT_MAP_WAYPOINT_SCALE_REFERENCE,
  tickWaypointMarkerGroup,
  WAYPOINT_MARKER_DEFAULT_COLOR,
} from '@/three/WaypointMarkers'
import {
  createMapMissionAsteroidPreviewMesh,
  disposeMapMissionAsteroidPreviewMesh,
  missionAsteroidShapeSeed,
} from '@/three/MapMissionAsteroidPreview'
import { createEvaMissionPoi, type EvaMissionPoiInstance } from '@/three/EvaMissionPoi'
import type { OrbitCaptureSystem } from '@/lib/orbitCapture'
import {
  pickActiveEvaMissionMapSite,
  shouldShowAsteroidMissionMapSite,
} from '@/lib/map/mapViewControllerHelpers'
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import type { VehicleCamera } from '@/three/VehicleCamera'
import { createOrbitalMiniGame } from '@/lib/minigame/orbitalMiniGameFactory'
import type { OrbitalMiniGame } from '@/lib/minigame/OrbitalMiniGame'
import { contractSystem } from '@/lib/contracts/runtime'
import type { MissionCompletedEvent } from '@/lib/contracts/contractTypes'
import {
  getActiveAsteroidContractConstraints,
  type AsteroidContractConstraints,
} from '@/lib/contracts/contractMissionConstraints'
import type { ConcreteObjective } from '@/lib/missions/types'

const COMPLETED_EVA_SITE_DESPAWN_DISTANCE = 180

/** Debug helper to stringify a world-space waypoint for logging. */
function formatWaypointDebug(worldX: number, worldZ: number): string {
  const radiusWorld = Math.hypot(worldX, worldZ)
  return `world=(${worldX.toFixed(2)}, ${worldZ.toFixed(2)}) au=(${(worldX / ORBIT_SCALE).toFixed(3)}, ${(worldZ / ORBIT_SCALE).toFixed(3)}) r=${radiusWorld.toFixed(2)} (${(radiusWorld / ORBIT_SCALE).toFixed(3)} AU)`
}

/**
 * Whether an offered asteroid mission satisfies a contract's active constraints.
 * Returns `true` when no constraints exist (nothing to satisfy).
 *
 * @param mission - Currently offered asteroid mission.
 * @param constraints - Active contract constraints for this planet, or null.
 * @returns Whether the existing offer can be kept.
 */
function offerSatisfiesContractConstraints(
  mission: GeneratedAsteroidMission,
  constraints: AsteroidContractConstraints | null,
): boolean {
  if (!constraints) return true
  if (constraints.giverId !== undefined && mission.giverId !== constraints.giverId) return false
  if (
    constraints.objectiveType !== undefined &&
    !mission.objectives.some((o) => o.type === constraints.objectiveType)
  ) {
    return false
  }
  return true
}

/** Mission board UI, waypoints, EVA POIs, and orbital minigame wiring for the map. */
export class MapMissionFacade {
  board: ShuttleMissionBoard = createMissionBoard()
  overlayOpen = false
  buttonVisible = false
  activeMinigame: OrbitalMiniGame | null = null

  private missionWaypointRoot: THREE.Group | null = null
  private missionOrbitWaypointMarker: THREE.Group | null = null
  private missionAsteroidPreviewRoot: THREE.Group | null = null
  private missionAsteroidPreviewMesh: THREE.Mesh | null = null

  private evaWaypointRoot: THREE.Group | null = null
  private evaWaypointMarker: THREE.Group | null = null
  /**
   * POI prop container. Separate from the waypoint root so it is NOT subject to the
   * constant-apparent-size rescale applied every frame — the satellite/relay keeps its
   * true world-space size and becomes a distant speck from across the map, only
   * resolving visually once the shuttle is close to the waypoint.
   */
  private evaPoiContainer: THREE.Group | null = null
  private evaPoiInstance: EvaMissionPoiInstance | null = null
  private evaPoiRenderedMissionId: string | null = null
  private completedEvaSites: CompletedEvaSite[] = []
  private readonly completedEvaPoiContainers = new Map<string, THREE.Group>()
  private readonly completedEvaPoiInstances = new Map<string, EvaMissionPoiInstance>()
  /**
   * Uniform-scale multiplier applied to completed-site POI containers, keyed by poiType.
   * Set by the host (MapViewController) when the EVA session starts so freshly-repaired
   * sites stay at the same visual size as the active POI during EVA close-up. Null when
   * EVA is inactive — containers sit at scale 1 (their map-view size). Without this, a
   * mission that completes mid-EVA spawns a new `CompletedEvaSite` container at 1× while
   * the active container was scaled ×20, so the satellite visibly shrinks and appears to
   * move further away at the instant the light turns green.
   */
  private evaPoiScaleByType: Readonly<Record<string, number>> | null = null

  tick(dt: number): void {
    this.board = tickMissionBoard(this.board, dt)
    this.board = tickAsteroidMissionBoard(this.board, dt)
    this.board = tickEvaMissionBoard(this.board, dt)
    this.board = tickTurretMiningRestock(this.board, dt)
  }

  private persistBoard(): void {
    saveMissionBoard(this.board)
    if (this.board.activeAsteroidMission) {
      saveActiveMission(this.board.activeAsteroidMission)
    } else {
      clearActiveMission()
    }
  }

  hydrateFromStorage(onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null): void {
    this.completedEvaSites = loadCompletedEvaSites()
    if (typeof localStorage === 'undefined') return
    const storedBoard = loadMissionBoard()
    if (storedBoard) {
      this.board = storedBoard
      const asteroid = storedBoard.activeAsteroidMission
      if (asteroid && (asteroid.status === 'accepted' || asteroid.status === 'in-transit')) {
        saveActiveMission(asteroid)
      } else {
        clearActiveMission()
      }
      onMissionBoardUpdate?.(this.board)
      return
    }

    const stored = loadActiveMission()
    if (!stored) return
    if (stored.status !== 'accepted' && stored.status !== 'in-transit') return
    if (this.board.activeAsteroidMission) return
    this.board = { ...this.board, activeAsteroidMission: stored }
    this.persistBoard()
    onMissionBoardUpdate?.(this.board)
  }

  updateMissionState(params: {
    orbitState: string
    targetName: string | null
    inventory: Inventory
    onMissionButton: ((visible: boolean, planetName: string) => void) | null
    onMissionOverlay:
      | ((visible: boolean, mission: ActiveShuttleMission | null, canFit: boolean) => void)
      | null
  }): void {
    const { orbitState, targetName, inventory, onMissionButton, onMissionOverlay } = params
    if (orbitState === 'orbiting' && targetName) {
      const planet = PLANETS.find((entry) => entry.name === targetName)
      if (planet) {
        const activeMissions = getActiveMissionsForPlanet(this.board, planet.id)
        const hasActiveMission = activeMissions.length > 0
        if (hasActiveMission !== this.buttonVisible) {
          this.buttonVisible = hasActiveMission
          onMissionButton?.(hasActiveMission, targetName)
        }
        if (this.overlayOpen && activeMissions.length > 0) {
          const mission = activeMissions[0]!
          const gatherItem = getGatherItemForPlanet(planet.id)
          const canFit = gatherItem
            ? canFitItem(inventory, gatherItem, mission.template.gatherQuantity)
            : false
          onMissionOverlay?.(true, mission, canFit)
        }
      }
      return
    }

    if (this.buttonVisible) {
      this.buttonVisible = false
      onMissionButton?.(false, '')
    }
    if (this.overlayOpen) {
      this.overlayOpen = false
      onMissionOverlay?.(false, null, false)
    }
  }

  /**
   * Post a planetary shuttle contract for `planetId` whenever the board is not restocking
   * and there is no active offer already posted **at this station** (stale offers from
   * other planets are replaced).
   */
  offerMissionAtPlanet(
    planetId: string,
    onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null,
  ): void {
    if (this.board.restockTimer) return

    const alreadyOfferingHere =
      this.board.offeredMission !== null && this.board.offeringPlanet === planetId
    if (alreadyOfferingHere) return

    const before = this.board
    this.board = offerMission(this.board, planetId, CURRENT_PLAYER_UPGRADE_LEVELS)
    if (this.board !== before) {
      onMissionBoardUpdate?.(this.board)
    }
  }

  missionAccept(
    inventory: Inventory,
    onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null,
  ): { ok: boolean; reason?: string } {
    const result = acceptMission(this.board, inventory)
    if (!result.ok) {
      return { ok: false, reason: result.reason }
    }
    this.board = result.board
    this.persistBoard()
    onMissionBoardUpdate?.(this.board)
    return { ok: true }
  }

  offerEvaMissionAtPlanet(
    planetId: string,
    onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null,
  ): void {
    if (this.board.offeredEvaMission && this.board.offeringEvaPlanet === planetId) return
    this.board = offerEvaMission(this.board, planetId)
    onMissionBoardUpdate?.(this.board)
  }

  evaMissionAccept(
    waypoint: { worldX: number; worldZ: number; poiLocalY: number },
    onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null,
  ): void {
    this.board = acceptEvaMission(this.board, waypoint)
    this.persistBoard()
    onMissionBoardUpdate?.(this.board)
  }

  /**
   * Offer (or re-offer) an asteroid contract for the docked planet.
   *
   * Re-offer rules — mirrors {@link offerEvaMission} so each planet's board feels
   * "live" instead of stalled by a stale offer pinned to another world:
   *
   * - If a contract is already **accepted** (`activeAsteroidMission` set), do nothing.
   *   The player can only juggle one asteroid mission at a time.
   * - If the post-accept **restock cooldown** (`asteroidRestockTimer`) is running,
   *   do nothing. Restock is intentionally global (you ran a job; the brokers need
   *   a moment).
   * - If the existing offer is **for this same planet**, keep it. Re-docking the
   *   same station shouldn't reroll the contract.
   * - Otherwise — there is a stale offer pinned to a *different* planet — drop it
   *   and draft a fresh contract for the planet the player just docked at. Without
   *   this, the first planet to claim the offer slot (Mercury, in the Cinderline
   *   flow) starves every other station of asteroid work, because the UI hides
   *   offers whose `offeringAsteroidPlanet` does not match the docked planet.
   *
   * @param host - Posting station planet + world position; waypoint is anchored
   *   to that orbit by {@link generateAsteroidMission}.
   * @param onMissionBoardUpdate - Callback invoked with the new board so reactive
   *   UI (`missionBoard` ref in `MapView`) refreshes immediately.
   */
  offerAsteroidMissionFromDifficulty(
    host: AsteroidMissionHostAnchor,
    onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null,
    profile: PlayerProfile = {} as PlayerProfile,
  ): void {
    if (this.board.activeAsteroidMission) return
    if (this.board.asteroidRestockTimer) return

    const constraints = getActiveAsteroidContractConstraints(contractSystem, host.planetId)

    if (
      this.board.offeredAsteroidMission &&
      this.board.offeringAsteroidPlanet === host.planetId &&
      offerSatisfiesContractConstraints(this.board.offeredAsteroidMission, constraints)
    ) {
      return
    }

    const difficulty = computeMissionDifficulty(CURRENT_PLAYER_UPGRADE_LEVELS)
    let mission: ReturnType<typeof generateAsteroidMission>
    try {
      mission = generateAsteroidMission(
        difficulty,
        host,
        Math.random,
        (constraints?.objectiveType as ConcreteObjective['type'] | undefined) ?? null,
        constraints?.giverId ?? null,
        profile,
      )
    } catch (err) {
      console.warn('[MapMissionFacade] No asteroid contract drafted:', err)
      return
    }
    console.warn(
      `[MapMissionFacade] Drafted asteroid mission "${mission.name}" from ${host.planetId} @ ${formatWaypointDebug(host.worldX, host.worldZ)} -> waypoint ${formatWaypointDebug(mission.waypoint.worldX, mission.waypoint.worldZ)} difficulty=${difficulty} region=${mission.region}${constraints ? ` (constrained: giverId=${constraints.giverId ?? '*'} objectiveType=${constraints.objectiveType ?? '*'})` : ''}`,
    )
    this.board = offerAsteroidMission(this.board, mission)
    onMissionBoardUpdate?.(this.board)
  }

  asteroidMissionAccept(onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null): void {
    this.board = acceptAsteroidMission(this.board)
    this.persistBoard()
    onMissionBoardUpdate?.(this.board)
  }

  /**
   * Accept the offered mining mission (from shuttle control UI).
   *
   * @param onMissionBoardUpdate - Callback invoked with the updated board so
   *   reactive UI state (e.g. `missionBoard` ref in `MapView`) refreshes immediately.
   */
  miningMissionAccept(onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null): void {
    this.board = takeTurretMiningMission(this.board)
    this.persistBoard()
    onMissionBoardUpdate?.(this.board)
  }

  /**
   * Deliver one mining mission by template id. Player-pressed via the Deliver
   * button on the active mission card. Consumes ore, awards CR, removes the
   * mission, and notifies the host so it can show a toast.
   */
  miningMissionDeliver(params: {
    missionId: string
    planetId: string
    inventory: Inventory
    profile: PlayerProfile
    rewardMultiplier: number
    onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null
    onMiningMissionDeliver:
      | ((mission: ActiveTurretMiningMission, creditsEarned: number) => void)
      | null
  }): {
    profile: PlayerProfile
    inventory: Inventory
    creditsChanged: boolean
    contractEvent: MissionCompletedEvent | null
  } {
    const result = deliverTurretMiningMission(
      this.board,
      params.missionId,
      params.planetId,
      params.inventory,
      params.profile,
      params.rewardMultiplier,
    )
    if (!result.ok || !result.mission) {
      return {
        profile: params.profile,
        inventory: params.inventory,
        creditsChanged: false,
        contractEvent: null,
      }
    }
    this.board = result.board
    this.persistBoard()
    params.onMissionBoardUpdate?.(this.board)
    params.onMiningMissionDeliver?.(result.mission, result.creditsEarned)
    return {
      profile: result.profile,
      inventory: result.inventory,
      creditsChanged: true,
      contractEvent: result.contractEvent,
    }
  }

  missionComplete(params: {
    missionId: string
    inventory: Inventory
    onMissionOverlay:
      | ((visible: boolean, mission: ActiveShuttleMission | null, canFit: boolean) => void)
      | null
    onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null
    onMissionComplete: ((mission: ActiveShuttleMission | null) => void) | null
    /**
     * Audio orchestrator that owns the mission-clear sting. The facade
     * delegates the one-shot play to the director instead of touching
     * Howler directly so all shuttle gameplay audio routes through a
     * single owner.
     */
    audio: ShuttleAudioDirector
  }): Inventory {
    const result = completeMission(this.board, params.missionId, params.inventory)
    if (!result.ok) return params.inventory
    this.board = result.board
    this.persistBoard()
    this.overlayOpen = false
    this.activeMinigame?.dispose()
    this.activeMinigame = null
    params.onMissionOverlay?.(false, null, false)
    params.onMissionBoardUpdate?.(this.board)
    params.onMissionComplete?.(
      result.board.activeMissions.find((mission) => mission.template.id === params.missionId) ??
        null,
    )
    params.audio.notifyMissionDelivered()
    return result.inventory
  }

  missionDeliver(params: {
    missionId: string
    profile: PlayerProfile
    inventory: Inventory
    scienceStationLevel: number
    onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null
    onMissionDeliver: ((mission: ActiveShuttleMission | null) => void) | null
  }): { profile: PlayerProfile; inventory: Inventory; creditsChanged: boolean } {
    const mission = this.board.activeMissions.find(
      (entry) => entry.template.id === params.missionId,
    )
    const result = deliverMission(
      this.board,
      params.missionId,
      params.profile,
      params.inventory,
      params.scienceStationLevel,
    )
    if (!result.ok) {
      return { profile: params.profile, inventory: params.inventory, creditsChanged: false }
    }
    this.board = result.board
    this.persistBoard()
    params.onMissionBoardUpdate?.(this.board)
    params.onMissionDeliver?.(mission ?? null)
    return { profile: result.profile, inventory: result.inventory, creditsChanged: true }
  }

  openMissionOverlay(params: {
    targetName: string | null
    inventory: Inventory
    onMissionOverlay:
      | ((visible: boolean, mission: ActiveShuttleMission | null, canFit: boolean) => void)
      | null
  }): void {
    if (!this.buttonVisible || this.overlayOpen) return
    const planet = params.targetName
      ? PLANETS.find((entry) => entry.name === params.targetName)
      : null
    if (!planet) return
    const missions = getActiveMissionsForPlanet(this.board, planet.id)
    if (missions.length === 0) return
    const mission = missions[0]!
    const gatherItem = getGatherItemForPlanet(planet.id)
    const canFit = gatherItem
      ? canFitItem(params.inventory, gatherItem, mission.template.gatherQuantity)
      : false
    this.overlayOpen = true
    // Create orbital minigame for this mission
    const orbitalConfig = getPlanetOrbitalConfig(mission.template.targetPlanet)
    const minigameType = orbitalConfig?.minigameType ?? 'default'
    this.activeMinigame = createOrbitalMiniGame(
      mission.template.id,
      minigameType,
      mission.template.gatherQuantity,
      mission.template.targetPlanet,
    )
    params.onMissionOverlay?.(true, mission, canFit)
  }

  /**
   * Closes the orbit mission minigame overlay without completing the mission.
   *
   * @param params - `onMissionOverlay` syncs Vue (or other UI) with facade state.
   */
  closeMissionOverlay(params: {
    onMissionOverlay:
      | ((visible: boolean, mission: ActiveShuttleMission | null, canFit: boolean) => void)
      | null
  }): void {
    if (!this.overlayOpen) return
    this.overlayOpen = false
    this.activeMinigame?.dispose()
    this.activeMinigame = null
    params.onMissionOverlay?.(false, null, false)
  }

  toggleOrbitMissionOverlay(params: {
    targetName: string | null
    inventory: Inventory
    onMissionOverlay:
      | ((visible: boolean, mission: ActiveShuttleMission | null, canFit: boolean) => void)
      | null
  }): void {
    if (!this.buttonVisible) return
    if (this.overlayOpen) {
      this.closeMissionOverlay({ onMissionOverlay: params.onMissionOverlay })
      return
    }
    this.openMissionOverlay(params)
  }

  syncWaypointSite(scene: THREE.Scene, livePosition: { x: number; z: number } | null = null): void {
    const mission = this.board.activeAsteroidMission

    // When the mission targets a renderable body (Hektor, etc.), the body
    // itself is the visual target. Use its live position for the waypoint
    // marker and keep `mission.waypoint` synced in-memory so distance-based
    // systems (overlay projector, proximity check) track the body's drift.
    const wpX = livePosition?.x ?? mission?.waypoint.worldX ?? 0
    const wpZ = livePosition?.z ?? mission?.waypoint.worldZ ?? 0

    if (shouldShowAsteroidMissionMapSite(mission) && !this.missionWaypointRoot) {
      const root = new THREE.Group()
      root.position.set(wpX, 0, wpZ)
      const waypoint = createWaypointMarkerGroup(WAYPOINT_MARKER_DEFAULT_COLOR, 'orbitMap')
      root.add(waypoint)
      scene.add(root)
      this.missionWaypointRoot = root
      this.missionOrbitWaypointMarker = waypoint
      // Skip the procedural preview asteroid when the mission is anchored
      // to a real body — no fake duplicate next to the actual mesh.
      if (livePosition === null) {
        const previewRoot = new THREE.Group()
        previewRoot.position.copy(root.position)
        scene.add(previewRoot)
        this.missionAsteroidPreviewRoot = previewRoot
        void this.spawnMissionAsteroidPreview(previewRoot, mission!)
      }
      console.warn(
        `[MapMissionFacade] Spawned asteroid mission site "${mission!.name}" at ${formatWaypointDebug(wpX, wpZ)}`,
      )
    } else if (!shouldShowAsteroidMissionMapSite(mission) && this.missionWaypointRoot) {
      this.disposeWaypointSite(scene)
    } else if (this.missionWaypointRoot && livePosition !== null && mission) {
      // Maintain: glue the waypoint marker to the body's live position and
      // update the active mission's waypoint coords in-memory.
      this.missionWaypointRoot.position.set(wpX, 0, wpZ)
      mission.waypoint.worldX = wpX
      mission.waypoint.worldZ = wpZ
    }

    this.syncEvaWaypointSite(scene)
  }

  private syncEvaWaypointSite(scene: THREE.Scene): void {
    this.syncCompletedEvaSites(scene)
    const evaMission = pickActiveEvaMissionMapSite(this.board.activeEvaMissions)

    if (!evaMission) {
      if (this.evaWaypointRoot) this.disposeEvaWaypointSite(scene)
      return
    }

    if (this.evaWaypointRoot && this.evaPoiRenderedMissionId !== evaMission.template.id) {
      this.disposeEvaWaypointSite(scene)
    }

    if (!this.evaWaypointRoot) {
      // Beam root sits on the orbital plane and gets auto-rescaled each frame to stay
      // visible at any zoom — that's what makes the marker findable from across the map.
      const root = new THREE.Group()
      root.position.set(evaMission.waypoint.worldX, 0, evaMission.waypoint.worldZ)
      const marker = createWaypointMarkerGroup(WAYPOINT_MARKER_DEFAULT_COLOR, 'orbitMap')
      root.add(marker)
      scene.add(root)
      this.evaWaypointRoot = root
      this.evaWaypointMarker = marker

      // POI container is a separate scene child, positioned at the waypoint + vertical
      // offset. No auto-rescale — the satellite is real-world-sized, ~shuttle-cargo scale,
      // so it vanishes into a pixel from Earth and only reads when the shuttle is close.
      const poiContainer = new THREE.Group()
      poiContainer.position.set(
        evaMission.waypoint.worldX,
        evaMission.waypoint.poiLocalY,
        evaMission.waypoint.worldZ,
      )
      scene.add(poiContainer)
      this.evaPoiContainer = poiContainer
      this.evaPoiRenderedMissionId = evaMission.template.id
      void this.spawnEvaMissionPoi(poiContainer, evaMission)
    }
  }

  private syncCompletedEvaSites(scene: THREE.Scene): void {
    const desiredKeys = new Set(this.completedEvaSites.map((site) => site.key))

    for (const [key, instance] of this.completedEvaPoiInstances) {
      if (desiredKeys.has(key)) continue
      instance.dispose()
      this.completedEvaPoiInstances.delete(key)
    }
    for (const [key, container] of this.completedEvaPoiContainers) {
      if (desiredKeys.has(key)) continue
      scene.remove(container)
      this.completedEvaPoiContainers.delete(key)
    }

    for (const site of this.completedEvaSites) {
      if (this.completedEvaPoiContainers.has(site.key)) continue
      const container = new THREE.Group()
      container.position.set(site.waypoint.worldX, site.waypoint.poiLocalY, site.waypoint.worldZ)
      const evaScale = this.evaPoiScaleByType?.[site.poiType]
      if (evaScale !== undefined) container.scale.setScalar(evaScale)
      scene.add(container)
      this.completedEvaPoiContainers.set(site.key, container)
      void this.spawnCompletedEvaMissionPoi(site, container)
    }
  }

  tickWaypointVisuals(params: {
    scene: THREE.Scene
    vehicleCamera: VehicleCamera
    shuttlePosition: { x: number; z: number }
    simTime: number
    apparentSize: number
    dt: number
    /** Suspend per-frame auto-rescales of the waypoint roots (EvaSession owns the scale). */
    freezeScales?: boolean
    /**
     * Optional live-body lookup. When provided and the active asteroid
     * mission's `asteroidId` matches a rendered body, the waypoint is
     * anchored to the body's current world position and the procedural
     * preview asteroid is suppressed.
     */
    getBodyPosition?: (id: string) => { x: number; z: number } | null
  }): void {
    const activeMission = this.board.activeAsteroidMission
    const livePosition =
      activeMission && params.getBodyPosition
        ? params.getBodyPosition(activeMission.asteroidId)
        : null
    this.syncWaypointSite(params.scene, livePosition)
    this.pruneCompletedEvaSites(params.scene, params.shuttlePosition)

    const halfFovRad = THREE.MathUtils.degToRad(params.vehicleCamera.camera.fov / 2)
    const tanHalfFov = Math.tan(halfFovRad)

    if (
      this.missionWaypointRoot &&
      this.missionOrbitWaypointMarker &&
      this.board.activeAsteroidMission
    ) {
      if (!params.freezeScales) {
        const dist = params.vehicleCamera.camera.position.distanceTo(
          this.missionWaypointRoot.position,
        )
        const targetScreenHeight = params.apparentSize * 2 * dist * tanHalfFov
        const uniformScale = targetScreenHeight / ORBIT_MAP_WAYPOINT_SCALE_REFERENCE
        this.missionWaypointRoot.scale.setScalar(uniformScale)
      }

      tickWaypointMarkerGroup(
        this.missionOrbitWaypointMarker,
        params.simTime,
        params.shuttlePosition.x,
        params.shuttlePosition.z,
      )
    }

    if (this.evaWaypointRoot && this.evaWaypointMarker) {
      // Beam is always auto-rescaled for constant apparent size — it's the find-me marker.
      const dist = params.vehicleCamera.camera.position.distanceTo(this.evaWaypointRoot.position)
      const targetScreenHeight = params.apparentSize * 2 * dist * tanHalfFov
      const uniformScale = targetScreenHeight / ORBIT_MAP_WAYPOINT_SCALE_REFERENCE
      this.evaWaypointRoot.scale.setScalar(uniformScale)

      tickWaypointMarkerGroup(
        this.evaWaypointMarker,
        params.simTime,
        params.shuttlePosition.x,
        params.shuttlePosition.z,
      )
    }

    // POI lives outside the rescaled root — tick its own animations with real time.
    this.evaPoiInstance?.tick(params.dt)
    for (const instance of this.completedEvaPoiInstances.values()) {
      instance.tick(params.dt)
    }
  }

  tryBeginAsteroidMission(params: {
    shuttlePosition: { x: number; z: number }
    orbitSystem: OrbitCaptureSystem | null
    beginMissionPressed: boolean
    cancelOrbitApproachFromMap: () => void
  }): GeneratedAsteroidMission | null {
    const activeAsteroid = this.board.activeAsteroidMission
    if (!activeAsteroid || activeAsteroid.status !== 'accepted') return null
    if (!params.beginMissionPressed) return null

    const orbitState = params.orbitSystem?.state ?? 'free'
    const orbitedBodyId = params.orbitSystem?.target?.id ?? null
    const orbitMatchesAsteroid =
      orbitState === 'orbiting' && orbitedBodyId === activeAsteroid.asteroidId

    if (orbitMatchesAsteroid) {
      // Special-mission path: orbiting the body the mission targets. The
      // orbit ring IS the approach — skip the procedural waypoint distance
      // check and don't require free flight.
      this.board = beginAsteroidMission(this.board)
      this.persistBoard()
      return activeAsteroid
    }

    const inApproachRadius = isWithinAsteroidMissionApproachRadius(
      params.shuttlePosition.x,
      params.shuttlePosition.z,
      activeAsteroid.waypoint,
    )
    if (!inApproachRadius) return null
    if (orbitState === 'approaching') {
      params.cancelOrbitApproachFromMap()
    }
    if (params.orbitSystem?.state !== 'free') return null

    this.board = beginAsteroidMission(this.board)
    this.persistBoard()
    return activeAsteroid
  }

  reset(
    scene: THREE.Scene | null,
    onMissionOverlay:
      | ((visible: boolean, mission: ActiveShuttleMission | null, canFit: boolean) => void)
      | null,
    onMissionButton: ((visible: boolean, planetName: string) => void) | null,
    onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null,
  ): void {
    this.board = createMissionBoard()
    clearMissionBoard()
    clearActiveMission()
    if (this.overlayOpen) {
      this.overlayOpen = false
      this.activeMinigame?.dispose()
      this.activeMinigame = null
      onMissionOverlay?.(false, null, false)
    }
    if (this.buttonVisible) {
      this.buttonVisible = false
      onMissionButton?.(false, '')
    }
    if (scene) {
      this.disposeWaypointSite(scene)
      this.disposeEvaWaypointSite(scene)
      this.disposeCompletedEvaSites(scene)
    }
    this.completedEvaSites = []
    clearCompletedEvaSites()
    onMissionBoardUpdate?.(this.board)
  }

  dispose(scene: THREE.Scene | null): void {
    this.activeMinigame?.dispose()
    this.activeMinigame = null
    if (scene) {
      this.disposeWaypointSite(scene)
      this.disposeEvaWaypointSite(scene)
      this.disposeCompletedEvaSites(scene)
    }
  }

  private async spawnMissionAsteroidPreview(
    root: THREE.Group,
    mission: GeneratedAsteroidMission,
  ): Promise<void> {
    try {
      const mesh = await createMapMissionAsteroidPreviewMesh(missionAsteroidShapeSeed(mission.id))
      if (this.missionAsteroidPreviewRoot !== root) {
        disposeMapMissionAsteroidPreviewMesh(mesh)
        return
      }
      const active = this.board.activeAsteroidMission
      if (!active || active.id !== mission.id || !shouldShowAsteroidMissionMapSite(active)) {
        disposeMapMissionAsteroidPreviewMesh(mesh)
        return
      }
      root.add(mesh)
      this.missionAsteroidPreviewMesh = mesh
    } catch (error) {
      console.warn('[MapView] mission asteroid preview failed', error)
    }
  }

  /**
   * World-space position of the active EVA mission POI, or null if no site is spawned.
   * Used by {@link EvaSession} as the proximity target on the solar map.
   */
  getEvaPoiWorldPos(): THREE.Vector3 | null {
    return this.evaPoiContainer ? this.evaPoiContainer.position : null
  }

  /** The scene root holding the EVA POI prop (for optional EVA huge-scale targeting). */
  getEvaPoiGroup(): THREE.Group | null {
    return this.evaPoiContainer
  }

  /**
   * `poiType` of the currently spawned EVA POI, or null if none. Lets MapViewController
   * pick a per-type huge-scale factor (e.g. Hubble boosts to real-Hubble size during EVA).
   */
  getEvaPoiType(): import('@/lib/missions/types').EvaMissionPoiType | null {
    const mission = pickActiveEvaMissionMapSite(this.board.activeEvaMissions)
    if (!mission || mission.template.id !== this.evaPoiRenderedMissionId) return null
    return mission.template.poiType
  }

  /**
   * The active EVA mission currently rendered at the POI waypoint (or null). Used by
   * the EVA minigame flow to resolve which mission the player is interacting with when
   * they approach the maintenance terminal.
   */
  getActiveEvaMissionAtPoi(): ActiveVisitRelayMission | null {
    const mission = pickActiveEvaMissionMapSite(this.board.activeEvaMissions)
    if (!mission || mission.template.id !== this.evaPoiRenderedMissionId) return null
    return mission
  }

  /**
   * Complete an active EVA mission in response to the in-EVA terminal minigame. Pays
   * the reward directly (no deliver step) and removes the mission from the active list.
   *
   * @returns Updated profile plus `creditsChanged` so the view can refresh HUD totals.
   */
  completeEvaMission(params: {
    missionId: string
    profile: PlayerProfile
    /** Optional multiplier applied to the EVA reward (e.g. contract pay bonus). */
    rewardMultiplier?: number
    onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null
  }): { profile: PlayerProfile; creditsChanged: boolean } {
    const completedMission =
      this.board.activeEvaMissions.find((mission) => mission.template.id === params.missionId) ??
      null
    const result = completeEvaMission(
      this.board,
      params.missionId,
      params.profile,
      params.rewardMultiplier ?? 1,
    )
    if (!result.ok) {
      return { profile: params.profile, creditsChanged: false }
    }
    if (completedMission) {
      const repairedSite: CompletedEvaSite = {
        key: this.makeCompletedEvaSiteKey(completedMission),
        poiType: completedMission.template.poiType,
        waypoint: completedMission.waypoint,
        cleanupArmed: false,
      }
      if (!this.completedEvaSites.some((site) => site.key === repairedSite.key)) {
        this.completedEvaSites = [...this.completedEvaSites, repairedSite]
        saveCompletedEvaSites(this.completedEvaSites)
      }
    }
    this.board = result.board
    this.persistBoard()
    params.onMissionBoardUpdate?.(this.board)
    return { profile: result.profile, creditsChanged: true }
  }

  /**
   * Record the EVA POI scale multiplier by poiType, and immediately apply it to every
   * already-spawned completed-site container. Pass `null` on EVA exit to reset all
   * completed-site containers to scale 1. New containers spawned while the scale is
   * set pick it up at construction via {@link syncCompletedEvaSites}.
   *
   * @param scaleByType - Map of poiType → uniform scale, or null to reset.
   */
  setEvaPoiScaleByType(scaleByType: Readonly<Record<string, number>> | null): void {
    this.evaPoiScaleByType = scaleByType
    for (const [key, container] of this.completedEvaPoiContainers) {
      const site = this.completedEvaSites.find((s) => s.key === key)
      if (!site) continue
      const factor = scaleByType?.[site.poiType] ?? 1
      container.scale.setScalar(factor)
    }
  }

  armCompletedEvaSiteCleanup(): void {
    let changed = false
    this.completedEvaSites = this.completedEvaSites.map((site) => {
      if (site.cleanupArmed) return site
      changed = true
      return { ...site, cleanupArmed: true }
    })
    if (changed) {
      saveCompletedEvaSites(this.completedEvaSites)
    }
  }

  private disposeWaypointSite(scene: THREE.Scene): void {
    if (this.missionAsteroidPreviewMesh) {
      disposeMapMissionAsteroidPreviewMesh(this.missionAsteroidPreviewMesh)
      this.missionAsteroidPreviewMesh = null
    }
    if (this.missionAsteroidPreviewRoot) {
      scene.remove(this.missionAsteroidPreviewRoot)
      this.missionAsteroidPreviewRoot = null
    }
    if (this.missionOrbitWaypointMarker) {
      disposeWaypointMarkerGroup(this.missionOrbitWaypointMarker)
      this.missionOrbitWaypointMarker = null
    }
    if (this.missionWaypointRoot) {
      scene.remove(this.missionWaypointRoot)
      this.missionWaypointRoot = null
    }
  }

  private async spawnEvaMissionPoi(
    container: THREE.Group,
    mission: ActiveVisitRelayMission,
  ): Promise<void> {
    try {
      // POI container already carries the Y offset; factory places the prop at origin.
      const instance = await createEvaMissionPoi(mission.template.poiType, 0)
      if (
        this.evaPoiContainer !== container ||
        this.evaPoiRenderedMissionId !== mission.template.id
      ) {
        instance.dispose()
        return
      }
      container.add(instance.object)
      this.evaPoiInstance = instance
    } catch (error) {
      console.warn('[MapView] EVA mission POI failed', error)
    }
  }

  private async spawnCompletedEvaMissionPoi(
    site: CompletedEvaSite,
    container: THREE.Group,
  ): Promise<void> {
    try {
      const instance = await createEvaMissionPoi(site.poiType, 0, 'repaired')
      if (this.completedEvaPoiContainers.get(site.key) !== container) {
        instance.dispose()
        return
      }
      container.add(instance.object)
      this.completedEvaPoiInstances.set(site.key, instance)
    } catch (error) {
      console.warn('[MapView] completed EVA mission POI failed', error)
    }
  }

  private disposeEvaWaypointSite(scene: THREE.Scene): void {
    if (this.evaPoiInstance) {
      this.evaPoiInstance.dispose()
      this.evaPoiInstance = null
    }
    if (this.evaPoiContainer) {
      scene.remove(this.evaPoiContainer)
      this.evaPoiContainer = null
    }
    if (this.evaWaypointMarker) {
      disposeWaypointMarkerGroup(this.evaWaypointMarker)
      this.evaWaypointMarker = null
    }
    if (this.evaWaypointRoot) {
      scene.remove(this.evaWaypointRoot)
      this.evaWaypointRoot = null
    }
    this.evaPoiRenderedMissionId = null
  }

  private disposeCompletedEvaSites(scene: THREE.Scene): void {
    for (const instance of this.completedEvaPoiInstances.values()) {
      instance.dispose()
    }
    this.completedEvaPoiInstances.clear()
    for (const container of this.completedEvaPoiContainers.values()) {
      scene.remove(container)
    }
    this.completedEvaPoiContainers.clear()
  }

  private pruneCompletedEvaSites(
    scene: THREE.Scene,
    shuttlePosition: { x: number; z: number },
  ): void {
    const retainedSites = this.completedEvaSites.filter((site) => {
      if (!site.cleanupArmed) return true
      const dx = shuttlePosition.x - site.waypoint.worldX
      const dz = shuttlePosition.z - site.waypoint.worldZ
      return Math.hypot(dx, dz) < COMPLETED_EVA_SITE_DESPAWN_DISTANCE
    })
    if (retainedSites.length === this.completedEvaSites.length) return

    this.completedEvaSites = retainedSites
    saveCompletedEvaSites(this.completedEvaSites)
    this.syncCompletedEvaSites(scene)
  }

  private makeCompletedEvaSiteKey(mission: ActiveVisitRelayMission): string {
    const { worldX, worldZ, poiLocalY } = mission.waypoint
    return `${mission.template.poiType}:${worldX.toFixed(3)}:${worldZ.toFixed(3)}:${poiLocalY.toFixed(3)}`
  }
}
