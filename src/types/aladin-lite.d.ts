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
    survey: string
    fov: number
    target: string
    fullScreen: boolean
    showFrame: boolean
    showLayersControl: boolean
    showGoToControl: boolean
    showZoomControl: boolean
    showCrosshair: boolean
    showSimbadPointerTool: boolean
    showSearchBox: boolean
  }

  /** Live Aladin instance returned by `A.aladin(...)`. */
  export interface AladinInstance {
    setImageSurvey(survey: string): void
    gotoRaDec(ra: number, dec: number): void
    setFoV(fovDeg: number): void
    destroy?: () => void
  }

  /** The default export is the Aladin factory namespace. */
  interface AladinFactory {
    init: Promise<void>
    aladin(selector: string | HTMLElement, opts: AladinInitOptions): AladinInstance
  }

  const A: AladinFactory
  export default A
}
