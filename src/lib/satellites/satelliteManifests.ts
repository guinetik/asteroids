/**
 * Satellite component manifests — per-POI-type lists of rigged sub-object
 * names eligible for damage during EVA satellite-servicing missions.
 *
 * Loaded statically by Vite from the JSON source. Callers read the list
 * by POI type key (currently only `"satellite"` is populated — Hubble and
 * Voyager POIs do not support satellite-servicing in this pass).
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/superpowers/specs/2026-04-19-eva-minigame-wiring-design.md
 */
import type * as THREE from 'three'
import rawManifests from '@/data/satellite-manifests.json'

/**
 * Component list for a single satellite POI type.
 */
export interface SatelliteManifest {
  /** Named rigged sub-objects eligible for damage. */
  components: string[]
}

/**
 * Result of validating a manifest against a real Three.js object tree.
 */
export interface ManifestValidationResult {
  /** True when every manifest component exists in the object tree. */
  ok: boolean
  /** Components that were located on the tree by name. */
  found: string[]
  /** Components listed in the manifest but missing from the tree. */
  missing: string[]
}

const MANIFESTS = rawManifests as Record<string, SatelliteManifest>

/**
 * Look up the manifest for a POI type.
 *
 * @param poiType - The mission template's `poiType` value.
 * @returns The manifest, or `null` if no manifest is registered for that POI type.
 */
export function getSatelliteManifest(poiType: string): SatelliteManifest | null {
  const entry = MANIFESTS[poiType]
  return entry ?? null
}

/**
 * True when a manifest is registered for the given POI type.
 *
 * @param poiType - The mission template's `poiType` value.
 * @returns Whether a manifest exists for that POI type.
 */
export function hasSatelliteManifest(poiType: string): boolean {
  return MANIFESTS[poiType] != null
}

/**
 * Verify that every component in `names` exists as a named descendant of `root`.
 * Used by `SatelliteRepairController` on attach so silently-broken manifests
 * fail loud instead of producing invisible damage overlays.
 *
 * @param root - The POI root Object3D to traverse.
 * @param names - Component names expected on the tree.
 * @returns Validation result — ok + which names were found vs. missing.
 */
export function validateManifest(
  root: THREE.Object3D,
  names: readonly string[],
): ManifestValidationResult {
  const found: string[] = []
  const missing: string[] = []
  for (const name of names) {
    if (root.getObjectByName(name) != null) {
      found.push(name)
    } else {
      missing.push(name)
    }
  }
  return { ok: missing.length === 0, found, missing }
}
