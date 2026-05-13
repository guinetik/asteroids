/**
 * Guards the /station route: allows entry when `dev=true` or when the
 * `station` query param matches a known station-interior level id.
 *
 * The contract-driven dock-prompt check will be added when the Yamada
 * contract wires up — until then, any known station id is accepted so the
 * dev-spawn flow works end-to-end.
 *
 * @author guinetik
 * @date 2026-05-12
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import type { LocationQuery } from 'vue-router'

/** Set of station-interior level ids the router will let the player enter. */
const KNOWN_STATION_IDS: ReadonlySet<string> = new Set(['yamada-titania', 'ceres-institute'])

/**
 * Pull the first scalar value for a given query key. Returns the empty
 * string when the key is missing or the value is an empty array.
 *
 * @param q - Vue-router query object.
 * @param key - Query key.
 * @returns The first string value, or the empty string.
 */
function firstString(q: LocationQuery, key: string): string {
  const v = q[key]
  if (Array.isArray(v)) return v[0] ?? ''
  if (typeof v === 'string') return v
  return ''
}

/**
 * Whether navigation to `/station` is allowed.
 *
 * @param query - Route query (`to.query`).
 * @returns `true` if the route should be entered, `false` to redirect.
 */
export function canAccessStationRoute(query: LocationQuery): boolean {
  if (firstString(query, 'dev') === 'true') return true
  const id = firstString(query, 'station')
  return id !== '' && KNOWN_STATION_IDS.has(id)
}
