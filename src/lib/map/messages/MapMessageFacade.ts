import { shipMessageSystem } from '@/lib/messages/runtime'
import type { ShipMessageTrigger } from '@/lib/messages/messageTypes'
import { isMainThrusterSpentForMessage } from '@/lib/messages/tutorialTriggers'
import type { ThrusterState } from '@/lib/physics/thrusterSystem'

/** Telemetry snapshot passed into map tutorial / comms triggers each tick. */
export interface MapRuntimeMessageParams {
  worldLineHistoryLength: number
  earthDepartureMinHistoryPoints: number
  earthDistance: number | null
  earthDepartureDistance: number
  isBraking: boolean
  thrustState: ThrusterState | null
  canFireThrust: boolean
  shipSolarDistance: number | null
  venusOrbitRadius: number | null
  venusOrbitWarningDistance: number
  onMessageUpdate: (() => void) | null
}

/** Enqueues ship messages for Earth departure, braking, slingshot tutorials, etc. */
export class MapMessageFacade {
  private didDispatchEarthDistanceMessage = false
  private didDispatchBrakeMessage = false
  private didDispatchMainThrusterMessage = false
  private didDispatchVenusOrbitMessage = false
  private didDispatchFirstSlingshotMessage = false

  notifyMapStartEarthOrbit(onMessageUpdate: (() => void) | null): void {
    this.notifyTrigger('map_start_earth_orbit', onMessageUpdate)
  }

  enqueueById(messageId: string, onMessageUpdate: (() => void) | null): void {
    shipMessageSystem.enqueueById(messageId)
    this.emitUpdate(onMessageUpdate)
  }

  hasActiveMessage(): boolean {
    return shipMessageSystem.getActiveMessage() !== null
  }

  triggerRuntimeMessages(params: MapRuntimeMessageParams): void {
    this.triggerEarthDistanceMessage(params)
    this.triggerBrakeMessage(params)
    this.triggerMainThrusterMessage(params)
    this.triggerVenusOrbitMessage(params)
  }

  private triggerEarthDistanceMessage(params: MapRuntimeMessageParams): void {
    if (
      this.didDispatchEarthDistanceMessage ||
      params.worldLineHistoryLength < params.earthDepartureMinHistoryPoints
    ) {
      return
    }
    if (params.earthDistance === null || params.earthDistance < params.earthDepartureDistance) {
      return
    }

    this.didDispatchEarthDistanceMessage = true
    this.notifyTrigger('map_leave_earth_distance', params.onMessageUpdate)
  }

  private triggerBrakeMessage(params: MapRuntimeMessageParams): void {
    if (this.didDispatchBrakeMessage || !params.isBraking) return

    this.didDispatchBrakeMessage = true
    this.notifyTrigger('map_brake_used', params.onMessageUpdate)
  }

  private triggerMainThrusterMessage(params: MapRuntimeMessageParams): void {
    if (this.didDispatchMainThrusterMessage || !params.thrustState) return
    if (!isMainThrusterSpentForMessage(params.thrustState, params.canFireThrust)) return

    this.didDispatchMainThrusterMessage = true
    this.notifyTrigger('map_main_thruster_depleted', params.onMessageUpdate)
  }

  private triggerVenusOrbitMessage(params: MapRuntimeMessageParams): void {
    if (this.didDispatchVenusOrbitMessage) return
    if (params.shipSolarDistance === null || params.venusOrbitRadius === null) return
    if (
      Math.abs(params.shipSolarDistance - params.venusOrbitRadius) >
      params.venusOrbitWarningDistance
    ) {
      return
    }

    this.didDispatchVenusOrbitMessage = true
    this.notifyTrigger('map_venus_orbit_warning', params.onMessageUpdate)
  }

  notifyFirstSlingshot(onMessageUpdate: (() => void) | null): void {
    if (this.didDispatchFirstSlingshotMessage) return
    this.didDispatchFirstSlingshotMessage = true
    this.notifyTrigger('map_first_slingshot', onMessageUpdate)
  }

  private notifyTrigger(triggerId: ShipMessageTrigger, onMessageUpdate: (() => void) | null): void {
    shipMessageSystem.notifyTrigger(triggerId)
    this.emitUpdate(onMessageUpdate)
  }

  private emitUpdate(onMessageUpdate: (() => void) | null): void {
    onMessageUpdate?.()
  }
}
