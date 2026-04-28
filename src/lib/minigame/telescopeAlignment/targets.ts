/**
 * Typed accessor over `telescope-targets.json`. Keyed by EVA mission id. Use
 * `satisfies` so missing or malformed fields fail compile, and hand callers
 * a readonly view. Unknown ids fall back to a neutral deep-field entry so
 * the overlay is always renderable.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-19-telescope-alignment-design.md
 */
import rawTargets from '@/data/minigames/telescope-targets.json'
import type { TelescopeTarget } from './types'

/** Fallback target used for unregistered mission ids (e.g. legacy earth spec alias). */
export const FALLBACK_TARGET: TelescopeTarget = {
  image: 'deep_field.webp',
  label: 'DEEP FIELD — ARCHIVAL',
  caption: 'archival composite · no target metadata available',
}

const TARGETS: Record<string, TelescopeTarget> = rawTargets satisfies Record<
  string,
  TelescopeTarget
>

/**
 * Look up the telescope target for a given EVA mission id.
 *
 * @param missionId - EVA mission id (matches keys in the JSON).
 * @returns Registered target, or {@link FALLBACK_TARGET} when unknown.
 */
export function getTelescopeTarget(missionId: string): TelescopeTarget {
  return TARGETS[missionId] ?? FALLBACK_TARGET
}
