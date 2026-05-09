/**
 * Minimal type declarations for the aladin-lite sky atlas viewer.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-habitat-observatory-design.md
 */

declare module 'aladin-lite' {
  /** Initialization options passed to {@link AladinFactory}. */
  export interface AladinInitOptions {
    /** Aladin survey id, e.g. `'P/DSS2/color'` or `'P/Mellinger/color'`. */
    survey: string
    /** Initial field of view in **degrees**, in `(0, 60]`. */
    fov: number
    /** Initial center; sexagesimal `'hh mm ss ±dd mm ss'` or named object resolvable by Aladin. */
    target: string
    /** When `true`, the viewer paints over the whole window. Set `false` for embedded use. */
    fullScreen: boolean
    /** Show the coordinate frame readout strip. */
    showFrame: boolean
    /** Show the layers/surveys panel control. */
    showLayersControl: boolean
    /** Show the goto control. */
    showGoToControl: boolean
    /** Show the +/− zoom control. */
    showZoomControl: boolean
    /** Render a center reticle. */
    showCrosshair: boolean
    /** Show the SIMBAD object lookup pointer tool. */
    showSimbadPointerTool: boolean
    /** Show the search box for object names. */
    showSearchBox: boolean
  }

  /** Live Aladin instance returned by `A.aladin(...)`. */
  export interface AladinInstance {
    /** Switch the active survey id; brief flash during swap. */
    setImageSurvey(survey: string): void
    /** Pan to coordinates. **Both arguments are decimal degrees.** */
    gotoRaDec(ra: number, dec: number): void
    /** Set the field of view in degrees. */
    setFoV(fovDeg: number): void
    /** Optional teardown; releases WebGL resources when present. */
    destroy?: () => void
  }

  /** The default export is the Aladin factory namespace. */
  interface AladinFactory {
    /** Resolves when the Aladin library has finished loading its internal resources. */
    readonly init: Promise<void>
    aladin(selector: string | HTMLElement, opts: AladinInitOptions): AladinInstance
  }

  const A: AladinFactory
  export default A
}
