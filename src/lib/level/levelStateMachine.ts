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

/** Seconds to hold on the death screen before redirecting. */
export const DEAD_SCREEN_DURATION = 5.0

/** Distance threshold for entering the lander on foot (world units). */
export const LANDER_INTERACT_RANGE = 15

/** Options for creating the level state machine. */
export interface LevelStateMachineOptions {
  /** Called on every state transition. */
  onStateChange: (current: LevelState, previous: LevelState | null, data?: unknown) => void
  /** Guard: is the lander currently grounded? Defaults to () => false. */
  isLanderGrounded?: () => boolean
  /** Guard: is the player within interact range of the lander? Defaults to () => false. */
  isPlayerNearLander?: () => boolean
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
      exfil: {},
      complete: {},
      failed: {},
    },
  })

  sm.onStateChange = options.onStateChange

  return sm
}
