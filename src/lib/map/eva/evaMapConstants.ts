/**
 * EVA + bloom tuning constants for the map view.
 *
 * These were previously static class fields on {@link MapViewController}. They are
 * pure data (no runtime state) and several are shared across multiple helpers, so
 * they live here to keep the controller focused on lifecycle wiring.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */

/**
 * Multiplier applied to the map shuttle when EVA starts. The map renders the shuttle
 * at `MAP_SHUTTLE_SCALE = 0.01` world units so it reads on the solar chart; EVA needs
 * it back at roughly 1 world unit for the tether (radius 0.028) to sit correctly
 * against the hull. 100× drops the native scale back into the shuttle-scene regime.
 */
export const EVA_MAP_HUGE_SHUTTLE = 100

/**
 * Per-poiType huge-scale factor applied to the EVA POI container during EVA only.
 * Base `MAP_POI_*_SCALE` values in `three.EvaMissionPoi` are tuned so POIs sit near
 * shuttle silhouette on the /map AU view; these factors reconstitute real EVA
 * close-up size (~1 world unit beside the ×100 shuttle for satellites/relays,
 * real-Hubble proportion for the telescope).
 */
export const EVA_MAP_HUGE_POI_BY_TYPE: Record<string, number> = {
  satellite: 20,
  relay_antenna: 20,
  telescope: 20,
}

/** Uniform scale applied to the sun mesh during EVA so it reads as a nearby star. */
export const EVA_MAP_HUGE_SUN = 4

/**
 * Helmet light intensity scale during EVA on the map. Default FPS intensity is tuned
 * for the dim level scene; on the sunlit map the helmet flashlight blows out nearby
 * props. 0.08 keeps the visor authentic (there is *some* forward spill) without
 * overwhelming surfaces at close range.
 */
export const EVA_MAP_HELMET_LIGHT_SCALE = 0.08

/**
 * Multiplier on the EVA spawn offset. The shuttle scene uses the shuttle huge factor
 * (ship-scale coords), but here the shuttle is only stretched back to ~1 world unit,
 * so the default offset `(0, 2.5, 6)` is already close to correct.
 */
export const EVA_MAP_SPAWN_OFFSET_SCALE = 1

/**
 * Buffer (world units) added to the POI's largest half-extent when computing the
 * "START MAINTENANCE [V]" prompt range. Keeps the trigger tight against small
 * satellites (~2-unit half-extent → ~4-unit trigger) while giving the ×20 telescope
 * enough approach room without a fixed fudge factor.
 */
export const EVA_POI_PROMPT_BUFFER = 2

/**
 * Bloom threshold applied while EVA is active. The map's default threshold is tuned
 * for a 0.01-unit shuttle seen from orbit; once we scale the ship up to ~1 world unit
 * for EVA, its TRON-emissive panels fill the screen and bloom blows out to pure white.
 * A higher threshold clamps the bloom contribution until the player returns to the
 * cockpit.
 */
export const EVA_MAP_BLOOM_THRESHOLD = 1.2

/** Bloom strength applied while EVA is active. Paired with {@link EVA_MAP_BLOOM_THRESHOLD}. */
export const EVA_MAP_BLOOM_STRENGTH = 0.35

/** Default tactical-map bloom threshold used outside inspect / EVA / orbit mitigation. */
export const MAP_BLOOM_THRESHOLD = 0.45

/** Default tactical-map bloom strength used outside inspect / EVA / orbit mitigation. */
export const MAP_BLOOM_STRENGTH = 0.72

/** Inspect-mode bloom threshold. Mirrors the inspect toggle output. */
export const MAP_INSPECT_BLOOM_THRESHOLD = 1.5

/** Inspect-mode bloom strength. Mirrors the inspect toggle output. */
export const MAP_INSPECT_BLOOM_STRENGTH = 0.2

/** Overscale where close-up shuttle bloom mitigation begins. */
export const ORBIT_BLOOM_CLAMP_OVERSCALE_START = 1.05

/** Overscale where close-up shuttle bloom mitigation reaches full effect. */
export const ORBIT_BLOOM_CLAMP_OVERSCALE_END = 1.8

/** Bloom threshold used at maximum parked/orbit bloom mitigation. */
export const ORBIT_BLOOM_CLAMP_THRESHOLD = 1.9

/** Bloom strength used at maximum parked/orbit bloom mitigation. */
export const ORBIT_BLOOM_CLAMP_STRENGTH = 0.08

/** Camera-attached fill light intensity used outside close-up shuttle suppression. */
export const MAP_CAMERA_LIGHT_BASE_INTENSITY = 0.28

/**
 * Overscale value fed into the orbit bloom clamp while the turret session is active —
 * past {@link ORBIT_BLOOM_CLAMP_OVERSCALE_END} so the clamp lerp saturates (max
 * threshold, min strength, cameraLight → 0).
 */
export const TURRET_FORCE_CLAMP_OVERSCALE = 2
