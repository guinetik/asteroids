/**
 * Thin wrapper that accepts an unknown blob (typically a Vite-imported
 * JSON file), runs {@link validateLayout} over it, and returns a
 * strongly-typed {@link StationLayout} usable by the builder.
 *
 * Validation happens at load time so authoring mistakes surface as
 * descriptive errors instead of silently broken levels.
 *
 * @author guinetik
 * @date 2026-05-13
 */
import { type StationLayout, validateLayout } from '@/lib/station/StationLayout'

/**
 * Cast a parsed JSON blob into a {@link StationLayout} after running
 * {@link validateLayout}. The blob is trusted to have the right shape;
 * the validator catches every authoring bug we know how to detect.
 *
 * @param raw - Parsed JSON object from a station layout file.
 * @returns The same blob, typed as {@link StationLayout}.
 * @throws If validation fails.
 */
export function loadStationLayout(raw: unknown): StationLayout {
  const layout = raw as StationLayout
  validateLayout(layout)
  return layout
}
