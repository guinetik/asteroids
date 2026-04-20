/**
 * Wiggly sine-wave SVG path generator. Perpendicular offset tapered by
 * `sin(t·π)` so the path touches the endpoints exactly at `t=0` and `t=1`.
 * Matches `docs/inspo/RelayRepairMinigame.jsx` lines 211–232.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */
import {
  WIGGLE_AMPLITUDE_PX,
  WIGGLE_MIN_STEPS,
  WIGGLE_PX_PER_STEP,
  WIGGLE_SPEED,
  WIGGLE_WAVELENGTH_PX,
} from './constants'

/**
 * Build an SVG path `d` string for an animated wiggly line.
 *
 * @param x1 - Start x.
 * @param y1 - Start y.
 * @param x2 - End x.
 * @param y2 - End y.
 * @param time - Elapsed seconds since the canvas mounted (drives phase).
 * @returns SVG path command string (e.g. `M 0.0,0.0 L 1.2,0.3 ...`).
 */
export function wigglyPath(x1: number, y1: number, x2: number, y2: number, time: number): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.hypot(dx, dy)
  if (length < 0.1) return `M ${x1.toFixed(1)},${y1.toFixed(1)}`
  const ux = dx / length
  const uy = dy / length
  const px = -uy
  const py = ux
  const steps = Math.max(WIGGLE_MIN_STEPS, Math.ceil(length / WIGGLE_PX_PER_STEP))
  const pts: string[] = []
  for (let i = 0; i <= steps; i++) {
    // Pin the exact endpoints to avoid floating-point drift (sin(π) ≠ 0).
    if (i === 0) {
      pts.push(`${x1.toFixed(1)},${y1.toFixed(1)}`)
      continue
    }
    if (i === steps) {
      pts.push(`${x2.toFixed(1)},${y2.toFixed(1)}`)
      continue
    }
    const t = i / steps
    const d = t * length
    const edgeFade = Math.sin(t * Math.PI)
    const phase = (d / WIGGLE_WAVELENGTH_PX) * Math.PI * 2 - time * WIGGLE_SPEED
    const offset = Math.sin(phase) * WIGGLE_AMPLITUDE_PX * edgeFade
    const cx = x1 + ux * d + px * offset
    const cy = y1 + uy * d + py * offset
    pts.push(`${cx.toFixed(1)},${cy.toFixed(1)}`)
  }
  return 'M ' + pts.join(' L ')
}
