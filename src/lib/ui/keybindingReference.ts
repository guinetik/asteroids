/**
 * Read-only controls reference data for the map and level keybindings overlay.
 *
 * @author guinetik
 * @date 2026-05-08
 * @spec docs/superpowers/specs/2026-05-08-keybindings-overlay-design.md
 */
import { DEFAULT_BINDINGS, FPS_BINDINGS, LANDER_BINDINGS, LEVEL_BINDINGS } from '@/lib/defaultBindings'

/** Screen ids supported by the keybindings overlay. */
export type KeybindingScreenId = 'map' | 'level'

/** Mode ids rendered inside each keybindings screen reference. */
export type KeybindingModeId = 'vehicle' | 'eva'

/** One displayed action row in the keybindings overlay. */
export interface KeybindingReferenceRow {
  /** Human-readable action label, for example `Forward thrust` or `Drill tool`. */
  action: string
  /** Human-readable key labels, for example `W`, `Shift`, or `Space`. */
  keys: string[]
  /** Optional short context hint, for example `when orbiting a mission target`. */
  hint?: string
}

/** One vehicle/EVA mode section in the keybindings overlay. */
export interface KeybindingModeReference {
  /** Stable mode id used as a Vue key, for example `vehicle` or `eva`. */
  id: KeybindingModeId
  /** Display title, for example `Shuttle`, `Lander`, or `Asteroid EVA`. */
  title: string
  /** Short flavor description shown under the mode title. */
  description: string
  /** Rows displayed for this mode, ordered by gameplay importance. */
  rows: KeybindingReferenceRow[]
}

/** A complete controls reference for one game screen. */
export interface KeybindingScreenReference {
  /** Stable screen id used by the dialog prop, for example `map` or `level`. */
  id: KeybindingScreenId
  /** Dialog heading, for example `MAP CONTROLS`. */
  title: string
  /** Short screen summary shown below the heading. */
  description: string
  /** The vehicle and EVA mode sections displayed in this screen. */
  modes: KeybindingModeReference[]
}

const KEY_CODE_PREFIX = 'Key'
const DIGIT_CODE_PREFIX = 'Digit'
const NUMPAD_CODE_PREFIX = 'Numpad'

const SPECIAL_KEY_LABELS: Readonly<Record<string, string>> = {
  Escape: 'Esc',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  Space: 'Space',
  Tab: 'Tab',
  Enter: 'Enter',
}

/**
 * Convert a DOM KeyboardEvent code into player-facing keycap text.
 *
 * @param code - KeyboardEvent code such as `KeyW`, `Digit1`, or `ShiftLeft`.
 * @returns A compact key label for the controls overlay.
 */
export function formatBindingCode(code: string): string {
  const specialLabel = SPECIAL_KEY_LABELS[code]
  if (specialLabel) return specialLabel

  if (code.startsWith(KEY_CODE_PREFIX)) return code.slice(KEY_CODE_PREFIX.length)
  if (code.startsWith(DIGIT_CODE_PREFIX)) return code.slice(DIGIT_CODE_PREFIX.length)
  if (code.startsWith(NUMPAD_CODE_PREFIX)) return `Num ${code.slice(NUMPAD_CODE_PREFIX.length)}`

  return code
}

/**
 * Resolve and format the binding codes for one action.
 *
 * @param bindings - Binding table from `defaultBindings.ts`.
 * @param actionId - Action id to read from the binding table.
 * @returns Formatted key labels for the action, or an empty array when unbound.
 */
export function formatActionBindings(
  bindings: Readonly<Record<string, string[]>>,
  actionId: string,
): string[] {
  return (bindings[actionId] ?? []).map(formatBindingCode)
}

/**
 * Build one display row from a binding table action.
 *
 * @param bindings - Binding table that owns the action.
 * @param actionId - Action id to resolve from the binding table.
 * @param action - Human-readable action label.
 * @param hint - Optional short context hint for the row.
 * @returns Display row with formatted key labels.
 */
function row(
  bindings: Readonly<Record<string, string[]>>,
  actionId: string,
  action: string,
  hint?: string,
): KeybindingReferenceRow {
  return {
    action,
    keys: formatActionBindings(bindings, actionId),
    ...(hint ? { hint } : {}),
  }
}

/**
 * Build one display row from the shared level binding table.
 *
 * @param actionId - Action id to resolve from `LEVEL_BINDINGS`.
 * @param action - Human-readable action label.
 * @param hint - Optional short context hint for the row.
 * @returns Display row with formatted level key labels.
 */
function sharedLevelRow(actionId: string, action: string, hint?: string): KeybindingReferenceRow {
  return row(LEVEL_BINDINGS, actionId, action, hint)
}

/** Read-only controls reference data keyed by screen id. */
export const KEYBINDING_SCREEN_REFERENCES: Readonly<
  Record<KeybindingScreenId, KeybindingScreenReference>
> = {
  map: {
    id: 'map',
    title: 'MAP CONTROLS',
    description: 'Orbital navigation, ship systems, and spacewalk controls.',
    modes: [
      {
        id: 'vehicle',
        title: 'Shuttle',
        description: 'Pilot the shuttle, manage orbital approach, and open ship terminals.',
        rows: [
          row(DEFAULT_BINDINGS, 'thrust', 'Forward thrust'),
          row(DEFAULT_BINDINGS, 'brake', 'Reverse thrust'),
          row(DEFAULT_BINDINGS, 'yawLeft', 'Yaw left'),
          row(DEFAULT_BINDINGS, 'yawRight', 'Yaw right'),
          row(DEFAULT_BINDINGS, 'gravitySurfingToggle', 'Gravity surf'),
          row(DEFAULT_BINDINGS, 'orbitAction', 'Orbit / slingshot'),
          row(DEFAULT_BINDINGS, 'beginMission', 'Begin mission', 'when orbiting a mission target'),
          row(DEFAULT_BINDINGS, 'evaToggle', 'Start EVA', 'near an EVA point of interest'),
          row(DEFAULT_BINDINGS, 'toggleMap', 'Tactical map'),
          row(DEFAULT_BINDINGS, 'missionAction', 'Mission details'),
        ],
      },
      {
        id: 'eva',
        title: 'Space EVA',
        description: 'Move outside the shuttle and interact with orbital mission hardware.',
        rows: [
          row(DEFAULT_BINDINGS, 'evaForward', 'Move forward'),
          row(DEFAULT_BINDINGS, 'evaBack', 'Move backward'),
          row(DEFAULT_BINDINGS, 'evaStrafeLeft', 'Strafe left'),
          row(DEFAULT_BINDINGS, 'evaStrafeRight', 'Strafe right'),
          row(DEFAULT_BINDINGS, 'evaUp', 'Ascend'),
          row(DEFAULT_BINDINGS, 'evaDown', 'Descend'),
          row(DEFAULT_BINDINGS, 'interact', 'Interact / repair'),
          row(DEFAULT_BINDINGS, 'evaToggle', 'Return to shuttle'),
        ],
      },
    ],
  },
  level: {
    id: 'level',
    title: 'LEVEL CONTROLS',
    description: 'Asteroid descent, surface EVA, tools, and in-level panels.',
    modes: [
      {
        id: 'vehicle',
        title: 'Lander',
        description: 'Control descent thrusters and stabilize the lander near the surface.',
        rows: [
          row(LANDER_BINDINGS, 'mainEngine', 'Main engine'),
          row(LANDER_BINDINGS, 'rcsFore', 'Forward RCS'),
          row(LANDER_BINDINGS, 'rcsAft', 'Aft RCS'),
          row(LANDER_BINDINGS, 'rcsLeft', 'Left RCS'),
          row(LANDER_BINDINGS, 'rcsRight', 'Right RCS'),
          row(LANDER_BINDINGS, 'rcsAscend', 'Ascend RCS'),
          row(LANDER_BINDINGS, 'rcsDescend', 'Descend RCS'),
          row(LANDER_BINDINGS, 'yawLeft', 'Yaw left'),
          row(LANDER_BINDINGS, 'yawRight', 'Yaw right'),
          row(LANDER_BINDINGS, 'resetCamera', 'Reset camera'),
          sharedLevelRow('toggleMap', 'Minimap'),
          sharedLevelRow('toggleInventory', 'Cargo hold'),
        ],
      },
      {
        id: 'eva',
        title: 'Asteroid EVA',
        description: 'Traverse the asteroid on foot, interact with terminals, and swap tools.',
        rows: [
          row(FPS_BINDINGS, 'moveForward', 'Move forward'),
          row(FPS_BINDINGS, 'moveBack', 'Move backward'),
          row(FPS_BINDINGS, 'moveLeft', 'Move left'),
          row(FPS_BINDINGS, 'moveRight', 'Move right'),
          row(FPS_BINDINGS, 'jump', 'Jump'),
          row(FPS_BINDINGS, 'sprint', 'Sprint'),
          row(FPS_BINDINGS, 'toolDrill', 'Drill tool'),
          row(FPS_BINDINGS, 'toolWeapon', 'Weapon tool'),
          row(FPS_BINDINGS, 'toolScience', 'Science tool'),
          sharedLevelRow('interact', 'Interact'),
          sharedLevelRow('terminalInteract', 'Terminal interact'),
          sharedLevelRow('toggleInventory', 'Cargo hold'),
        ],
      },
    ],
  },
}

/**
 * Get the controls reference for a keybindings overlay screen.
 *
 * @param screen - Screen id requested by the dialog.
 * @returns Read-only screen reference for the selected screen.
 */
export function getKeybindingScreenReference(
  screen: KeybindingScreenId,
): KeybindingScreenReference {
  return KEYBINDING_SCREEN_REFERENCES[screen]
}
