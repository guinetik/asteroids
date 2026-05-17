/**
 * Resolves the WebGL device pixel ratio cap used by {@link SceneManager}.
 *
 * Default cap is 1.5 — sharp enough to look crisp on hi-DPI displays
 * while cutting fragment cost roughly in half vs the OS-reported DPR 2.
 * The `?dpr=N` URL parameter overrides this for one page load and is
 * persisted to localStorage, so a weak GPU only needs to be told once.
 *
 * @author guinetik
 * @date 2026-05-16
 * @spec docs/asteroid-lander-gdd.md
 */

/** localStorage key for the persisted DPR cap. */
const STORAGE_KEY = 'asteroid.renderDprCap'

/** URL query parameter that overrides + persists the DPR cap. */
const QUERY_PARAM = 'dpr'

/** Fallback cap when nothing is configured — preserves prior behaviour. */
const DEFAULT_DPR_CAP = 1.5

/** Lowest cap accepted from URL or storage. Below this the image breaks down. */
const MIN_DPR_CAP = 0.5

/** Highest cap accepted from URL or storage. Above this the GPU usually melts. */
const MAX_DPR_CAP = 3

/**
 * Parse a stored / URL string into a valid DPR cap, or null if the raw
 * value is missing, non-numeric, or out of range.
 *
 * @param raw - String value pulled from URL or localStorage.
 * @returns Clamped cap, or null when the value should be ignored.
 */
function parseDprCap(raw: string | null): number | null {
  if (raw === null) return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  if (value < MIN_DPR_CAP || value > MAX_DPR_CAP) return null
  return value
}

/**
 * Compute the effective pixel ratio to hand to
 * `WebGLRenderer.setPixelRatio`. Resolution order:
 *
 * 1. `?dpr=N` URL parameter, if present and valid. Persisted to
 *    localStorage so subsequent loads keep the override.
 * 2. Previously persisted localStorage value.
 * 3. {@link DEFAULT_DPR_CAP}.
 *
 * The resulting cap is then `min`ed against `window.devicePixelRatio`
 * so the renderer never up-samples past the native display.
 *
 * @returns Pixel ratio to set on the WebGL renderer.
 */
export function resolvePixelRatio(): number {
  if (typeof window === 'undefined') return DEFAULT_DPR_CAP

  let cap = DEFAULT_DPR_CAP
  const stored = parseDprCap(getStoredCap())
  if (stored !== null) cap = stored

  const params = new URLSearchParams(window.location.search)
  const fromUrl = parseDprCap(params.get(QUERY_PARAM))
  if (fromUrl !== null) {
    cap = fromUrl
    persistCap(fromUrl)
  }

  const native = window.devicePixelRatio || 1
  return Math.min(native, cap)
}

/**
 * Read the persisted cap from localStorage, tolerating environments
 * where storage is unavailable (private browsing, quota errors).
 *
 * @returns Stored cap string, or null if unavailable.
 */
function getStoredCap(): string | null {
  try {
    return window.localStorage?.getItem(STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

/**
 * Write the cap to localStorage, swallowing any storage errors.
 *
 * @param cap - Validated DPR cap to persist.
 */
function persistCap(cap: number): void {
  try {
    window.localStorage?.setItem(STORAGE_KEY, String(cap))
  } catch {
    // localStorage may be unavailable (private mode, quota, etc.) — ignore.
  }
}
