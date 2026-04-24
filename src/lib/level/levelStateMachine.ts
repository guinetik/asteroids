/**
 * Level state machine — orchestrates arrival cutscene, lander flight,
 * and EVA on-foot phases within a single scene.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
import { StateMachine } from '@/lib/stateMachine'
import { ARRIVAL_SEQUENCE_DURATION } from '@/three/ArrivalSequence'

/** All possible states for an asteroid level. */
export type LevelState = 'arrival' | 'lander' | 'eva' | 'dead' | 'exfil' | 'complete' | 'failed'

/** Duration of the arrival cutscene in seconds. */
export const ARRIVAL_DURATION = ARRIVAL_SEQUENCE_DURATION

/** Seconds to hold on the death screen before redirecting. Tuned to sit on
 * top of the heartbeat + flatline SFX so the YOU DIED beat lands on the audio. */
export const DEAD_SCREEN_DURATION = 7.0

/** Distance threshold for entering the lander on foot (world units). */
export const LANDER_INTERACT_RANGE = 15

/** Total exfil cutscene duration in seconds. */
export const EXFIL_SEQUENCE_DURATION = 13.0

/** Vertical distance (world units) to shuttle that enables exfil. */
export const EXFIL_PROXIMITY_RANGE = 100

/** Options for creating the level state machine. */
export interface LevelStateMachineOptions {
  /** Called on every state transition. */
  onStateChange: (current: LevelState, previous: LevelState | null, data?: unknown) => void
  /** Guard: is the lander currently grounded? Defaults to () => false. */
  isLanderGrounded?: () => boolean
  /** Guard: is the player within interact range of the lander? Defaults to () => false. */
  isPlayerNearLander?: () => boolean
  /** Guard: is the lander within exfil range of the shuttle? Defaults to () => false. */
  isLanderNearShuttle?: () => boolean
  /** Guard: has the player completed at least one EVA? Defaults to () => false. */
  hasCompletedEva?: () => boolean
}

/**
 * Create a configured level state machine.
 * Guards are injected so this remains pure and testable.
 *
 * @param options - Callbacks and guard functions
 * @returns A StateMachine\<LevelState\> starting in 'arrival'
 */
export function createLevelStateMachine(
  options: LevelStateMachineOptions,
): StateMachine<LevelState> {
  const isGrounded = options.isLanderGrounded ?? (() => false)
  const isNearLander = options.isPlayerNearLander ?? (() => false)
  const isNearShuttle = options.isLanderNearShuttle ?? (() => false)
  const hasEva = options.hasCompletedEva ?? (() => false)

  const sm = new StateMachine<LevelState>({
    initial: 'arrival',
    states: {
      arrival: {
        duration: ARRIVAL_DURATION,
        next: 'lander',
      },
      lander: {
        on: {
          exitVehicle: {
            target: 'eva',
            guard: () => isGrounded(),
          },
          exfiltrate: {
            target: 'exfil',
            guard: () => isNearShuttle() && hasEva(),
          },
        },
      },
      eva: {
        on: {
          enterVehicle: {
            target: 'lander',
            guard: () => isNearLander(),
          },
          die: 'dead',
        },
      },
      dead: {
        duration: DEAD_SCREEN_DURATION,
        next: 'failed',
      },
      exfil: {
        duration: EXFIL_SEQUENCE_DURATION,
        next: 'complete',
      },
      complete: {},
      failed: {},
    },
  })

  sm.onStateChange = options.onStateChange

  return sm
}
