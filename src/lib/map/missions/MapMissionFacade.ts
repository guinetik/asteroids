import * as THREE from 'three'
import {
  acceptAsteroidMission,
  acceptMission,
  beginAsteroidMission,
  completeMission,
  createMissionBoard,
  deliverMission,
  getActiveMissionsForPlanet,
  offerAsteroidMission,
  offerMission,
  tickAsteroidMissionBoard,
  tickMissionBoard,
} from '@/lib/missions/shuttleMissionSession'
import type {
  ActiveShuttleMission,
  GeneratedAsteroidMission,
  ShuttleMissionBoard,
} from '@/lib/missions/types'
import { getGatherItemForPlanet, getPlanetOrbitalConfig } from '@/lib/missions/planetOrbitalConfig'
import { computeMissionDifficulty } from '@/lib/missions/missionDifficulty'
import { generateAsteroidMission } from '@/lib/missions/asteroidMissionGenerator'
import { canFitItem } from '@/lib/inventory/inventory'
import type { Inventory } from '@/lib/inventory/types'
import type { PlayerProfile } from '@/lib/player/types'
import { CURRENT_PLAYER_UPGRADE_LEVELS } from '@/lib/upgrades'
import { PLANETS } from '@/lib/planets/catalog'
import { loadActiveMission, saveActiveMission } from '@/lib/missions/missionStorage'
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
import type { MapOverlayState } from '@/lib/ShuttleTelemetry'
import type { OrbitCaptureSystem } from '@/lib/orbitCapture'
import { shouldShowAsteroidMissionMapSite } from '@/lib/map/mapViewControllerHelpers'
import type { VehicleCamera } from '@/three/VehicleCamera'
import { createOrbitalMiniGame } from '@/lib/minigame/orbitalMiniGameFactory'
import type { OrbitalMiniGame } from '@/lib/minigame/OrbitalMiniGame'

export class MapMissionFacade {
  board: ShuttleMissionBoard = createMissionBoard()
  overlayOpen = false
  buttonVisible = false
  activeMinigame: OrbitalMiniGame | null = null

  private missionWaypointRoot: THREE.Group | null = null
  private missionOrbitWaypointMarker: THREE.Group | null = null
  private missionAsteroidPreviewMesh: THREE.Mesh | null = null

  tick(dt: number): void {
    this.board = tickMissionBoard(this.board, dt)
    this.board = tickAsteroidMissionBoard(this.board, dt)
  }

  hydrateFromStorage(onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null): void {
    if (typeof localStorage === 'undefined') return
    const stored = loadActiveMission()
    if (!stored) return
    if (stored.status !== 'accepted' && stored.status !== 'in-transit') return
    if (this.board.activeAsteroidMission) return
    this.board = { ...this.board, activeAsteroidMission: stored }
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

  offerMissionAtPlanet(
    planetId: string,
    onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null,
  ): void {
    if (!this.board.offeredMission) {
      this.board = offerMission(this.board, planetId, CURRENT_PLAYER_UPGRADE_LEVELS)
      onMissionBoardUpdate?.(this.board)
    }
  }

  missionAccept(onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null): void {
    this.board = acceptMission(this.board)
    onMissionBoardUpdate?.(this.board)
  }

  offerAsteroidMissionFromDifficulty(
    onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null,
  ): void {
    if (this.board.offeredAsteroidMission || this.board.activeAsteroidMission) return
    if (this.board.asteroidRestockTimer) return
    const difficulty = computeMissionDifficulty(CURRENT_PLAYER_UPGRADE_LEVELS)
    const mission = generateAsteroidMission(difficulty)
    this.board = offerAsteroidMission(this.board, mission)
    onMissionBoardUpdate?.(this.board)
  }

  asteroidMissionAccept(onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null): void {
    this.board = acceptAsteroidMission(this.board)
    const active = this.board.activeAsteroidMission
    if (active) saveActiveMission(active)
    onMissionBoardUpdate?.(this.board)
  }

  missionComplete(params: {
    missionId: string
    inventory: Inventory
    onMissionOverlay:
      | ((visible: boolean, mission: ActiveShuttleMission | null, canFit: boolean) => void)
      | null
    onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null
    onMissionComplete: ((mission: ActiveShuttleMission | null) => void) | null
  }): Inventory {
    const result = completeMission(this.board, params.missionId, params.inventory)
    if (!result.ok) return params.inventory
    this.board = result.board
    this.overlayOpen = false
    this.activeMinigame?.dispose()
    this.activeMinigame = null
    params.onMissionOverlay?.(false, null, false)
    params.onMissionBoardUpdate?.(this.board)
    params.onMissionComplete?.(
      result.board.activeMissions.find((mission) => mission.template.id === params.missionId) ?? null,
    )
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
    const mission = this.board.activeMissions.find((entry) => entry.template.id === params.missionId)
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
    const planet = params.targetName ? PLANETS.find((entry) => entry.name === params.targetName) : null
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

  syncWaypointSite(scene: THREE.Scene): void {
    const mission = this.board.activeAsteroidMission
    if (shouldShowAsteroidMissionMapSite(mission) && !this.missionWaypointRoot) {
      const root = new THREE.Group()
      root.position.set(mission!.waypoint.worldX, 0, mission!.waypoint.worldZ)
      const waypoint = createWaypointMarkerGroup(WAYPOINT_MARKER_DEFAULT_COLOR, 'orbitMap')
      root.add(waypoint)
      scene.add(root)
      this.missionWaypointRoot = root
      this.missionOrbitWaypointMarker = waypoint
      void this.spawnMissionAsteroidPreview(root, mission!)
    } else if (!shouldShowAsteroidMissionMapSite(mission) && this.missionWaypointRoot) {
      this.disposeWaypointSite(scene)
    }
  }

  tickWaypointVisuals(params: {
    scene: THREE.Scene
    vehicleCamera: VehicleCamera
    shuttlePosition: { x: number; z: number }
    simTime: number
    apparentSize: number
  }): void {
    this.syncWaypointSite(params.scene)
    if (
      !this.missionWaypointRoot ||
      !this.missionOrbitWaypointMarker ||
      !this.board.activeAsteroidMission
    ) {
      return
    }

    const dist = params.vehicleCamera.camera.position.distanceTo(this.missionWaypointRoot.position)
    const halfFovRad = THREE.MathUtils.degToRad(params.vehicleCamera.camera.fov / 2)
    const targetScreenHeight = params.apparentSize * 2 * dist * Math.tan(halfFovRad)
    const uniformScale = targetScreenHeight / ORBIT_MAP_WAYPOINT_SCALE_REFERENCE
    this.missionWaypointRoot.scale.setScalar(uniformScale)

    tickWaypointMarkerGroup(
      this.missionOrbitWaypointMarker,
      params.simTime,
      params.shuttlePosition.x,
      params.shuttlePosition.z,
    )
  }

  tryBeginAsteroidMission(params: {
    shuttlePosition: { x: number; z: number }
    orbitSystem: OrbitCaptureSystem | null
    beginMissionPressed: boolean
    cancelOrbitApproachFromMap: () => void
  }): GeneratedAsteroidMission | null {
    const activeAsteroid = this.board.activeAsteroidMission
    if (!activeAsteroid || activeAsteroid.status !== 'accepted') return null
    const inApproachRadius = isWithinAsteroidMissionApproachRadius(
      params.shuttlePosition.x,
      params.shuttlePosition.z,
      activeAsteroid.waypoint,
    )
    const orbitState = params.orbitSystem?.state ?? 'free'
    if (!inApproachRadius || !params.beginMissionPressed) return null
    if (orbitState === 'approaching') {
      params.cancelOrbitApproachFromMap()
    }
    if (params.orbitSystem?.state !== 'free') return null

    this.board = beginAsteroidMission(this.board)
    saveActiveMission({ ...activeAsteroid, status: 'in-transit' })
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
    }
    onMissionBoardUpdate?.(this.board)
  }

  dispose(scene: THREE.Scene | null): void {
    this.activeMinigame?.dispose()
    this.activeMinigame = null
    if (scene) {
      this.disposeWaypointSite(scene)
    }
  }

  private async spawnMissionAsteroidPreview(
    root: THREE.Group,
    mission: GeneratedAsteroidMission,
  ): Promise<void> {
    try {
      const mesh = await createMapMissionAsteroidPreviewMesh(missionAsteroidShapeSeed(mission.id))
      if (this.missionWaypointRoot !== root) {
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

  private disposeWaypointSite(scene: THREE.Scene): void {
    if (this.missionAsteroidPreviewMesh) {
      disposeMapMissionAsteroidPreviewMesh(this.missionAsteroidPreviewMesh)
      this.missionAsteroidPreviewMesh = null
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
}
