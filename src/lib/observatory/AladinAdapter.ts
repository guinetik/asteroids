/**
 * Thin wrapper around the third-party `aladin-lite` sky atlas viewer.
 * Keeps Aladin specifics out of the Vue and Three layers, and dynamic-imports
 * the lib (~2.4 MB chunk) on first instantiation so players who never open the
 * observatory never download it.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-habitat-observatory-design.md
 */

import type { AladinInstance } from 'aladin-lite'
import type { ObservatoryTarget } from '@/lib/observatory/types'

/** Constructor options for {@link AladinAdapter.create}. */
export interface AladinAdapterOptions {
  /**
   * DOM element that will host the Aladin viewport. The adapter assigns a
   * unique id to it before initializing.
   */
  readonly hostElement: HTMLElement
  /** Target loaded into the viewer at creation time. */
  readonly initialTarget: ObservatoryTarget
}

/**
 * Counter used to generate unique Aladin container ids across multiple
 * instantiations within the same session (e.g. component remount).
 */
let aladinHostCounter = 0

/**
 * Lifecycle wrapper around an Aladin Lite instance. Construct via the static
 * {@link create} factory because initialization is async (chunk import + the
 * library's own `A.init` promise).
 */
export class AladinAdapter {
  private constructor(
    private readonly aladin: AladinInstance,
    private currentSurvey: string,
  ) {}

  /**
   * Dynamically imports `aladin-lite`, awaits its global init promise, and
   * mounts an instance into {@link AladinAdapterOptions.hostElement}.
   *
   * @param opts - Host element + initial target.
   * @returns A ready-to-use adapter pointing at the initial target.
   */
  static async create(opts: AladinAdapterOptions): Promise<AladinAdapter> {
    const mod = await import('aladin-lite')
    const A = mod.default
    await A.init

    aladinHostCounter += 1
    const containerId = `observatory-aladin-${aladinHostCounter}-${Date.now()}`
    opts.hostElement.id = containerId

    const rect = opts.hostElement.getBoundingClientRect()
    console.info(
      '[AladinAdapter] host dims at init:',
      Math.round(rect.width),
      'x',
      Math.round(rect.height),
    )

    const target = opts.initialTarget
    const instance = A.aladin(`#${containerId}`, {
      survey: target.survey,
      fov: target.fovDeg,
      target: `${target.ra} ${target.dec}`,
      fullScreen: false,
      showFrame: false,
      showLayersControl: false,
      showGoToControl: false,
      showZoomControl: false,
      showCrosshair: true,
      showSimbadPointerTool: false,
      showSearchBox: false,
    })

    // Aladin sizes its canvas at init from getBoundingClientRect. If the host
    // wasn't fully laid out, the canvas can lock to a tiny size and never
    // recover. Dispatching a resize event forces Aladin's internal handler
    // to re-measure once the dialog is visibly painted.
    window.dispatchEvent(new Event('resize'))

    return new AladinAdapter(instance, target.survey)
  }

  /**
   * Pan the viewer to a new target. Skips the survey switch (which causes a
   * brief visible flash) when the survey id is unchanged.
   *
   * @param target - Target to display.
   */
  goto(target: ObservatoryTarget): void {
    if (target.survey !== this.currentSurvey) {
      this.aladin.setImageSurvey(target.survey)
      this.currentSurvey = target.survey
    }
    const ra = parseSexagesimalRa(target.ra)
    const dec = parseSexagesimalDec(target.dec)
    this.aladin.gotoRaDec(ra, dec)
    this.aladin.setFoV(target.fovDeg)
  }

  /**
   * Tear down the underlying Aladin instance. Calls Aladin's own `destroy`
   * when present; otherwise relies on garbage collection of the host element
   * once the Vue component is unmounted.
   */
  destroy(): void {
    if (this.aladin.destroy) this.aladin.destroy()
  }
}

/**
 * Parse a sexagesimal RA `'hh mm ss[.s]'` into decimal degrees.
 *
 * @param ra - RA in `'hh mm ss[.s]'` form.
 * @returns Decimal degrees in `[0, 360)`.
 */
function parseSexagesimalRa(ra: string): number {
  const parts = ra.split(/\s+/).map(Number)
  const [h = 0, m = 0, s = 0] = parts
  return ((h + m / 60 + s / 3600) * 360) / 24
}

/**
 * Parse a sexagesimal Dec `'±dd mm ss[.s]'` into decimal degrees.
 *
 * @param dec - Dec in `'±dd mm ss[.s]'` form.
 * @returns Decimal degrees in `[-90, 90]`.
 */
function parseSexagesimalDec(dec: string): number {
  const sign = dec.trim().startsWith('-') ? -1 : 1
  const parts = dec.replace(/^[+-]/, '').split(/\s+/).map(Number)
  const [d = 0, m = 0, s = 0] = parts
  return sign * (d + m / 60 + s / 3600)
}
