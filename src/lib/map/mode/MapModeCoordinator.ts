import type { HabitatPhase } from '@/lib/habitatState'
import type { MapPhase } from '@/lib/mapState'
import { easeInOut } from '@/three/MapCamera'
import type { MapOverlayState } from '@/lib/ShuttleTelemetry'

export type FlightOrbitState = 'free' | 'approaching' | 'orbiting'
export type FlightCameraMode = 'inspect' | 'flight'
export type MapToggleAction = 'open' | 'close' | 'none'
export type HabitatTransitionAction = 'enter' | 'leave' | 'none'

interface ResolveMapToggleActionParams {
  introLocked: boolean
  habitatActive: boolean
  toggleMapPressed: boolean
  closeMapPressed: boolean
  mapPhase: MapPhase
  mapIsOpen: boolean
  orbitState: FlightOrbitState
  isDead: boolean
}

interface ResolveInspectToggleParams {
  togglePressed: boolean
  inspectMode: boolean
  orbitState: FlightOrbitState
}

interface ResolveHabitatTransitionParams {
  togglePressed: boolean
  habitatActive: boolean
  habitatPhase: HabitatPhase
  inspectMode: boolean
  canEnterHabitat: boolean
}

export interface InspectToggleResult {
  nextInspectMode: boolean
  toggleDoors: boolean
  cameraMode: FlightCameraMode
  enableZoom: boolean
  bloomThreshold: number
  bloomStrength: number
}

export interface HabitatTransitionResult {
  action: HabitatTransitionAction
  nextInspectMode: boolean
  toggleDoors: boolean
}

export interface MapTransitionRuntimeState {
  useMapCamera: boolean
  showOverlay: boolean
  transitionProgress: number
}

export interface HabitatRenderState {
  useHabitatScene: boolean
  disableVehicleControls: boolean
  wakeUpProgress: number | null
}

const HIDDEN_MAP_OVERLAY_STATE: MapOverlayState = {
  visible: false,
  labels: [],
  shipX: 0,
  shipY: 0,
  headingDeg: 0,
  speed: 0,
  distances: [],
  gravityRings: [],
  trajectoryPoints: [],
  missionWaypoint: null,
}

export class MapModeCoordinator {
  resolveMapToggleAction(params: ResolveMapToggleActionParams): MapToggleAction {
    if (params.introLocked) return 'none'

    if (params.toggleMapPressed && !params.habitatActive) {
      if (!params.mapIsOpen) {
        if (!params.isDead && params.orbitState !== 'approaching') {
          return 'open'
        }
      } else if (params.mapPhase === 'open') {
        return 'close'
      }
    }

    if (params.closeMapPressed && params.mapPhase === 'open') {
      return 'close'
    }

    return 'none'
  }

  resolveInspectToggle(params: ResolveInspectToggleParams): InspectToggleResult | null {
    if (!params.togglePressed) return null

    const nextInspectMode = !params.inspectMode
    return {
      nextInspectMode,
      toggleDoors: true,
      cameraMode: nextInspectMode ? 'inspect' : 'flight',
      enableZoom: !nextInspectMode,
      bloomThreshold: nextInspectMode ? 1.5 : 0.45,
      bloomStrength: nextInspectMode ? 0.2 : 0.72,
    }
  }

  resolveHabitatTransition(params: ResolveHabitatTransitionParams): HabitatTransitionResult {
    if (!params.togglePressed || !params.canEnterHabitat) {
      return { action: 'none', nextInspectMode: params.inspectMode, toggleDoors: false }
    }

    if (!params.habitatActive) {
      return {
        action: 'enter',
        nextInspectMode: true,
        toggleDoors: !params.inspectMode,
      }
    }

    if (params.habitatPhase === 'habitat') {
      return {
        action: 'leave',
        nextInspectMode: params.inspectMode,
        toggleDoors: false,
      }
    }

    return { action: 'none', nextInspectMode: params.inspectMode, toggleDoors: false }
  }

  resolveMapTransitionRuntime(mapPhase: MapPhase, mapProgress: number): MapTransitionRuntimeState {
    return {
      useMapCamera: mapPhase === 'opening' || mapPhase === 'open',
      showOverlay: mapPhase === 'open',
      transitionProgress: easeInOut(mapProgress),
    }
  }

  shouldRestoreFreeFlightAfterMapClose(
    orbitState: FlightOrbitState,
    slingshotBurstActive: boolean,
  ): { unfreezeShuttle: boolean; enableInput: boolean } {
    if (orbitState !== 'free') {
      return { unfreezeShuttle: false, enableInput: false }
    }

    return {
      unfreezeShuttle: true,
      enableInput: !slingshotBurstActive,
    }
  }

  buildHiddenMapOverlayState(): MapOverlayState {
    return HIDDEN_MAP_OVERLAY_STATE
  }

  resolveHabitatRenderState(phase: HabitatPhase, progress: number): HabitatRenderState {
    switch (phase) {
      case 'transitioning_in':
        return {
          useHabitatScene: false,
          disableVehicleControls: true,
          wakeUpProgress: null,
        }
      case 'waking_up':
        return {
          useHabitatScene: true,
          disableVehicleControls: true,
          wakeUpProgress: easeInOut(progress),
        }
      case 'habitat':
      case 'transitioning_out':
        return {
          useHabitatScene: true,
          disableVehicleControls: true,
          wakeUpProgress: null,
        }
      case 'map':
        return {
          useHabitatScene: false,
          disableVehicleControls: false,
          wakeUpProgress: null,
        }
    }
  }

  getHabitatFadeOpacity(phase: HabitatPhase, progress: number): number {
    if (phase === 'transitioning_in') {
      return easeInOut(progress)
    }
    if (phase === 'waking_up') {
      const fadeProgress = Math.min(1, progress / 0.4)
      return 1 - easeInOut(fadeProgress)
    }
    if (phase === 'transitioning_out') {
      if (progress > 0.5) {
        return easeInOut((1 - progress) / 0.5)
      }
      return easeInOut(progress / 0.5)
    }
    return 0
  }
}
