/**
 * Global Vitest setup — stubs browser APIs that JSDOM does not implement
 * or that throw on missing media files in the Node/JSDOM environment.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-29-jovian-outcome-side-effects-design.md
 */

// Guard: these stubs are only meaningful in a browser-like (JSDOM) environment.
// Node-environment test files (e.g. rocketSurveyState) run without `window`.
if (typeof window !== 'undefined' && typeof window.HTMLMediaElement !== 'undefined') {
  /** Prevent JSDOM from attempting to load/stat media src URLs. */
  Object.defineProperty(window.HTMLMediaElement.prototype, 'load', {
    configurable: true,
    writable: true,
    value: () => undefined,
  })

  /** Stub play() so autoplay calls in onMounted don't throw in JSDOM. */
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
    configurable: true,
    writable: true,
    value: () => Promise.resolve(),
  })

  /** Stub pause() for completeness. */
  Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    writable: true,
    value: () => undefined,
  })
}
