#!/usr/bin/env node
/**
 * Raster sources under `image/textures/`, `image/telescope/`, `image/portraits/`, and
 * any top-level raster files directly in `image/` (e.g. `image/texture.jpg`,
 * `image/jovian-ending.png`) are converted into lossy or lossless WebPs under matching
 * paths under `public/`.
 *
 * Skips an asset when the destination `.webp` already exists and its modification time is
 * greater than or equal to the chosen source raster (incremental runs). Set environment variable
 * `TEXTURES_FORCE_REBUILD=1` (or `true`) to encode every raster regardless.
 *
 * @author guinetik
 * @date 2026-04-30
 * @see docs/superpowers/specs/2026-04-28-texture-webp-pipeline-design.md
 */

import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** @type {string} */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const IMAGE_ROOT = join(REPO_ROOT, 'image')
const PUBLIC_ROOT = join(REPO_ROOT, 'public')
const MAGICK_BIN = 'magick'

/** When both `asset.jpg` and `asset.png` exist, pick in this extension order (lower wins). */
const RASTER_EXTENSIONS = /** @type {const} */ (['.jpg', '.jpeg', '.png'])

/**
 * Largest allowed written `.webp` size. Lossy `-quality` steps down toward
 * {@link MIN_LOSSY_WEBP_QUALITY}. If still over budget, successive
 * `-thumbnail WxW>` downsizing passes shrink the raster before re-running the ladder.
 */
const MAX_WEBP_OUTPUT_BYTES = 1024 * 1024

/** First lossy WebP `-quality` pass for JPEG inputs and PNGs that exceed the cap lossless. */
const INITIAL_LOSSY_WEBP_QUALITY = 85

/** Floor for lossy quality steps (`magick … -quality N …`) before trying the next thumbnail tier. */
const MIN_LOSSY_WEBP_QUALITY = 10

/** Each loop subtracts this from `-quality` while the `.webp` is still larger than {@link MAX_WEBP_OUTPUT_BYTES}. */
const WEBP_QUALITY_STEP = 5

/**
 * When quality alone keeps the WebP above {@link MAX_WEBP_OUTPUT_BYTES}, chain these
 * ImageMagick `@maxEdge>x@maxEdge>` thumbnail passes (preserve aspect ratio, shrink only).
 * Order is widest → narrower.
 */
const THUMBNAIL_MAX_EDGE_FALLBACK_CHAIN_PX = /** @type {const} */ ([2048, 1536, 1024])

const BYTE_UNIT = 1024

/** @typedef {{ dir: string, base: string, paths: string[] }} RasterGroup */

/**
 * Returns preference rank for a raster extension; lower binds first when choosing
 * one source file among same base name in one folder (e.g. `color.jpg` vs `color.png`).
 *
 * @param {string} ext - Leading-dot extension lower-case.
 * @returns {number} Ordering index (`0` = highest priority).
 */
export function rasterExtensionRank(ext) {
  const lowered = ext.toLowerCase()
  const index = RASTER_EXTENSIONS.indexOf(lowered)
  return index === -1 ? RASTER_EXTENSIONS.length + 10 : index
}

/**
 * Picks exactly one raster file from a duplicate group (same basename, same directory).
 *
 * @param {string[]} absolutePaths - Two or more full paths differing only by extension.
 * @returns {string} Highest-priority path (`.jpg` over `.jpeg` over `.png`).
 */
export function pickPreferredRasterPath(absolutePaths) {
  if (absolutePaths.length === 0) {
    throw new Error('pickPreferredRasterPath: empty paths array')
  }
  return [...absolutePaths].sort(
    (a, b) => rasterExtensionRank(extname(a)) - rasterExtensionRank(extname(b)),
  )[0]
}

/**
 * Maps a raster under `image/` to the matching `.webp` path under `public/`.
 *
 * @param {string} sourceAbsolute - Absolute raster path inside {@link IMAGE_ROOT}.
 * @param {string} imageRoot - Usually `repo/image`.
 * @param {string} publicRoot - Usually `repo/public`.
 * @returns {string} Absolute path `public/…/basename.webp`.
 */
export function outputWebpPathForSource(sourceAbsolute, imageRoot = IMAGE_ROOT, publicRoot = PUBLIC_ROOT) {
  const relToImage = relative(imageRoot, sourceAbsolute)
  if (relToImage.startsWith('..')) {
    throw new Error(`Source must lie under ${imageRoot}: ${sourceAbsolute}`)
  }
  const ext = extname(sourceAbsolute)
  const baseNameNoExt = basename(sourceAbsolute, ext)
  const relDir = dirname(relToImage)
  const finalName = `${baseNameNoExt}.webp`

  return relDir === '.' || relDir === ''
    ? join(publicRoot, finalName)
    : join(publicRoot, relDir, finalName)
}

/**
 * Formats byte counts for concise CLI output.
 *
 * @param {number} bytes - Byte count from `fs.statSync`.
 * @returns {string} Human-readable size.
 */
export function formatBytes(bytes) {
  if (bytes < BYTE_UNIT) {
    return `${bytes} B`
  }
  const kilobytes = bytes / BYTE_UNIT
  if (kilobytes < BYTE_UNIT) {
    return `${kilobytes.toFixed(1)} KB`
  }

  return `${(kilobytes / BYTE_UNIT).toFixed(1)} MB`
}

/**
 * Whether a texture WebP needs to be encoded from source vs destination mtimes.
 *
 * @param {number} sourceMtimeMs - `mtimeMs` of the authoritative raster under `image/`.
 * @param {number | null} outputMtimeMs - `mtimeMs` of the destination `.webp` under `public/`, or `null` if absent.
 * @param {boolean} forceRebuild - When true, always treat as needing a rebuild.
 * @returns {boolean} True when {@link encodeWebpUntilUnderCap} should run.
 */
export function shouldRebuildTextureWebp(sourceMtimeMs, outputMtimeMs, forceRebuild) {
  if (forceRebuild) {
    return true
  }
  if (outputMtimeMs === null) {
    return true
  }
  return sourceMtimeMs > outputMtimeMs
}

/**
 * Builds {@link RasterGroup} keys for same-directory same-basename lookups.
 *
 * @param {string} directory - Absolute directory path containing the raster.
 * @param {string} fileBase - Filename without extension.
 * @returns {string} Stable grouping key.
 */
export function rasterGroupKey(directory, fileBase) {
  return `${directory}::${fileBase}`
}

/**
 * Ordered list of lossy WebP qualities used when iteratively shrinking files over
 * {@link MAX_WEBP_OUTPUT_BYTES}. Exported for unit tests.
 *
 * @param {number} [initial] - Starting quality. Defaults to {@link INITIAL_LOSSY_WEBP_QUALITY}.
 * @param {number} [minQ] - Final possible quality. Defaults to {@link MIN_LOSSY_WEBP_QUALITY}.
 * @param {number} [step] - Decrement per step. Defaults to {@link WEBP_QUALITY_STEP}.
 * @returns {number[]} Descending qualities (e.g. `[85, 80, …, 35]`).
 */
export function lossyWebpQualityLadder(
  initial = INITIAL_LOSSY_WEBP_QUALITY,
  minQ = MIN_LOSSY_WEBP_QUALITY,
  step = WEBP_QUALITY_STEP,
) {
  /** @type {number[]} */
  const list = []
  for (let q = initial; q >= minQ; q -= step) {
    list.push(q)
  }
  return list
}

/**
 * Walks subtree for `jpg/jpeg/png` files recursively.
 *
 * @param {string} rootDir - Directory to descend.
 * @returns {string[]} Sorted absolute paths.
 */
function listRasterSources(rootDir) {
  /** @type {string[]} */
  const collected = []

  /**
   * @param {string} current - Current directory absolute path.
   * @returns {void}
   */
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(entryPath)
        continue
      }
      if (!entry.isFile()) continue

      const lowerExt = extname(entry.name).toLowerCase()

      const isRaster =
        lowerExt === '.jpg' || lowerExt === '.jpeg' || lowerExt === '.png'

      if (isRaster) {
        collected.push(entryPath)
      }
    }
  }

  walk(rootDir)
  return collected.sort()
}

/**
 * @param {string[]} filePaths - Absolute paths from one scanned subtree (`image/`).
 * @returns {Map<string, RasterGroup>} Duplicate groups keyed by {@link rasterGroupKey}.
 */
function groupRasterSources(filePaths) {
  /** @type {Map<string, RasterGroup>} */
  const groupMap = new Map()

  for (const filePath of filePaths) {
    const directory = dirname(filePath)
    const extension = extname(filePath).toLowerCase()
    const isRaster =
      extension === '.jpg' ||
      extension === '.jpeg' ||
      extension === '.png'
    if (!isRaster) continue
    const fileBase = basename(filePath).slice(
      0,
      basename(filePath).length - extname(filePath).length,
    )

    const key = rasterGroupKey(directory, fileBase)
    const existing = groupMap.get(key)
    if (!existing) {
      groupMap.set(key, { dir: directory, base: fileBase, paths: [filePath] })
      continue
    }
    existing.paths.push(filePath)
  }

  return groupMap
}

/**
 * Low-level ImageMagick invocation for WebP encode.
 *
 * @param {string[]} magickArgs - Full argv after {@link MAGICK_BIN} (excluding binary name).
 * @returns {Promise<void>}
 */
async function spawnMagick(magickArgs) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(MAGICK_BIN, magickArgs, { stdio: ['ignore', 'pipe', 'pipe'] })

    /** @type {string} */
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.on('error', (err) => {
      if ('code' in err && /** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
        rejectPromise(
          new Error('`magick` was not found on PATH. Install ImageMagick and retry.'),
        )
        return
      }
      rejectPromise(err)
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      rejectPromise(new Error(`magick failed (${code}).\n${stderr}`))
    })
  })
}

/**
 * Writes `outputPath` once at the given WebP encoder mode/size target.
 *
 * @param {string} inputPath - Source raster absolute path (jpg/jpeg/png).
 * @param {string} outputPath - Destination `.webp` path (parent dirs created).
 * @param {'lossless' | 'lossy'} mode - Encoder mode.
 * @param {number} [lossyQuality] - Required when `mode === 'lossy'` (1–100).
 * @returns {Promise<void>}
 */
async function encodeWebpOnce(inputPath, outputPath, mode, lossyQuality) {
  mkdirSync(dirname(outputPath), { recursive: true })

  /*
   * Windows ImageMagick intermittently fails with OpenBlob "Invalid argument" when overwriting
   * an existing destination `.webp`. Remove first so each encode is a fresh write.
   */
  try {
    if (existsSync(outputPath)) {
      unlinkSync(outputPath)
    }
  } catch {
    // Best-effort — encoder still tries `outputPath`.
  }

  /** @type {string[]} */
  const args = [inputPath]

  if (mode === 'lossless') {
    args.push('-define', 'webp:lossless=true')
  } else {
    if (lossyQuality === undefined) {
      throw new Error('encodeWebpOnce: lossyQuality required for lossy mode')
    }
    args.push('-quality', String(lossyQuality))
  }
  args.push(outputPath)

  await spawnMagick(args)
}

/**
 * Resizes authoritative `originalAbsolute` with ImageMagick `@maxEdge^x@maxEdge>` thumbnail semantics.
 *
 * @param {string} originalAbsolute - Raster under `image/`.
 * @param {number} maxEdgePx - Longest edge bound (pixels).
 * @param {string} destJpegAbsolute - Intermediate `.jpg` path (temp file).
 * @returns {Promise<void>}
 */
async function writeThumbnailMaxEdgeJpeg(originalAbsolute, maxEdgePx, destJpegAbsolute) {
  mkdirSync(dirname(destJpegAbsolute), { recursive: true })
  const geom = `${maxEdgePx}x${maxEdgePx}>`
  await spawnMagick([originalAbsolute, '-auto-orient', '-thumbnail', geom, destJpegAbsolute])
}

/**
 * Runs PNG lossless (optional), then iterative lossy quality passes targeting
 * {@link MAX_WEBP_OUTPUT_BYTES}.
 *
 * @param {string} workingSourceAbsolute - Raster to encode (original or resized temp JPEG).
 * @param {string} destWebpAbsolute - Final `.webp` output path shared across attempts.
 * @param {boolean} tryLosslessWhenPngSource - Attempt lossless PNG before lossy tiers.
 * @returns {Promise<{ fits: boolean, label: string }>} Whether `destWebpAbsolute` is under cap.
 */
async function encodeUntilCapWithQualityLadder(
  workingSourceAbsolute,
  destWebpAbsolute,
  tryLosslessWhenPngSource,
) {
  const lowerExt = extname(workingSourceAbsolute).toLowerCase()
  const pngSource = lowerExt === '.png'

  if (tryLosslessWhenPngSource && pngSource) {
    await encodeWebpOnce(workingSourceAbsolute, destWebpAbsolute, 'lossless')

    /** @type {number} */
    let sz
    try {
      sz = statSync(destWebpAbsolute).size
    } catch {
      throw new Error(`encode produced no WebP yet: ${destWebpAbsolute}`)
    }

    if (sz <= MAX_WEBP_OUTPUT_BYTES) {
      return { fits: true, label: 'lossless' }
    }

    console.info(
      `  Oversized lossless (${formatBytes(sz)} > ${formatBytes(MAX_WEBP_OUTPUT_BYTES)}) — tightening lossy: `
        + `${relative(REPO_ROOT, workingSourceAbsolute)}`,
    )
  }

  const qualities = lossyWebpQualityLadder()

  if (qualities.length === 0) {
    throw new Error('`lossyWebpQualityLadder()` produced no stepping sequence')
  }

  /** @type {number | undefined} */
  let lastQuality

  for (const quality of qualities) {
    lastQuality = quality
    await encodeWebpOnce(workingSourceAbsolute, destWebpAbsolute, 'lossy', quality)

    const sizeNow = statSync(destWebpAbsolute).size
    if (sizeNow <= MAX_WEBP_OUTPUT_BYTES) {
      return { fits: true, label: `lossy q=${quality}` }
    }
  }

  const finalSize = statSync(destWebpAbsolute).size

  return {
    fits: false,
    label: `lossy q=${lastQuality ?? '?'} still ${formatBytes(finalSize)}`,
  }
}

/**
 * Encode WebP until file size ≤ {@link MAX_WEBP_OUTPUT_BYTES}. Escalates from quality-only
 * passes to {@link THUMBNAIL_MAX_EDGE_FALLBACK_CHAIN_PX} downscales from the original source.
 *
 * @param {string} inputPath - Original source raster from `image/`.
 * @param {string} outputPath - Absolute destination `.webp` path (parent dirs created).
 * @returns {Promise<{ label: string }>} Encode description for CLI logging.
 */
async function encodeWebpUntilUnderCap(inputPath, outputPath) {
  /** @type {string[]} */
  const tempCleanup = []

  try {
    let pass = await encodeUntilCapWithQualityLadder(inputPath, outputPath, true)

    if (pass.fits) {
      return { label: pass.label }
    }

    /** @type {string | undefined} */
    let lastFailedLabel = pass.label

    for (const tierPx of THUMBNAIL_MAX_EDGE_FALLBACK_CHAIN_PX) {
      console.info(
        `  Still over cap after quality ladder — trying ${tierPx}px thumbnail: ${relative(
          REPO_ROOT,
          inputPath,
        )}`,
      )

      const tempJpeg = join(
        tmpdir(),
        `asteroids-tex-${basename(inputPath, extname(inputPath))}-${tierPx}px-${process.pid}.jpg`,
      )
      tempCleanup.push(tempJpeg)

      await writeThumbnailMaxEdgeJpeg(inputPath, tierPx, tempJpeg)

      pass = await encodeUntilCapWithQualityLadder(tempJpeg, outputPath, false)

      if (pass.fits) {
        return { label: `${tierPx}px src ${pass.label}` }
      }

      lastFailedLabel = pass.label
    }

    const finalBytes = statSync(outputPath).size

    console.warn(
      `[textures:build] ${relative(REPO_ROOT, inputPath)} still ${formatBytes(finalBytes)} after `
        + `quality + ${THUMBNAIL_MAX_EDGE_FALLBACK_CHAIN_PX.join('/')} px fallbacks (${lastFailedLabel})`,
    )

    return { label: `WARN ${formatBytes(finalBytes)} — ${lastFailedLabel}` }
  } finally {
    for (const p of tempCleanup) {
      try {
        unlinkSync(p)
      } catch {
        // Best-effort temp cleanup — ignore ENOENT races.
      }
    }
  }
}

/**
 * Deletes legacy `.jpg`/`.jpeg`/`.png` siblings when a sibling `.webp` was just written.
 *
 * @param {string} outputDirectory - Directory containing emitted `*.webp`.
 * @param {string} baseWithoutExt - File base name excluding extension.
 * @returns {void}
 */
function removeStaleRastersSameBase(outputDirectory, baseWithoutExt) {
  /** @type {readonly string[]} */
  const suffixes = ['.jpg', '.jpeg', '.png']
  const webpCandidate = join(outputDirectory, `${baseWithoutExt}.webp`)
  try {
    if (!statSync(webpCandidate).isFile()) {
      return
    }
  } catch {
    return
  }

  for (const suf of suffixes) {
    const stale = join(outputDirectory, `${baseWithoutExt}${suf}`)
    try {
      if (statSync(stale).isFile()) {
        unlinkSync(stale)
      }
    } catch {
      // Ignore missing stale files — best-effort cleanup only.
    }
  }
}

/**
 * Converts every authored raster grouped under {@link IMAGE_ROOT} subtree paths.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const forceRebuild =
    process.env.TEXTURES_FORCE_REBUILD === '1' ||
    process.env.TEXTURES_FORCE_REBUILD === 'true'

  /** @type {readonly string[]} */
  const scanRoots = [
    join(IMAGE_ROOT, 'textures'),
    join(IMAGE_ROOT, 'telescope'),
    join(IMAGE_ROOT, 'portraits'),
  ]

  /** @type {string[]} */
  const allFiles = []

  for (const sub of scanRoots) {
    try {
      if (!statSync(sub).isDirectory()) {
        console.warn(`No directory at ${sub} — skipping`)
        continue
      }
    } catch {
      console.warn(`No directory at ${sub} — skipping`)
      continue
    }
    allFiles.push(...listRasterSources(sub))
  }

  // Pick up any top-level raster files directly in `image/` (e.g. texture.jpg, jovian-ending.png).
  // Non-recursive — subdirectories are already handled by scanRoots above.
  try {
    for (const entry of readdirSync(IMAGE_ROOT, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      const ext = extname(entry.name).toLowerCase()
      if (!RASTER_EXTENSIONS.includes(ext)) continue
      allFiles.push(join(IMAGE_ROOT, entry.name))
    }
  } catch {
    // image/ root unreadable — skip top-level rasters.
  }

  if (allFiles.length === 0) {
    console.info(`No raster files found under ${IMAGE_ROOT}`)
    return
  }

  const groups = groupRasterSources(allFiles)

  /** @type {RasterGroup[]} */
  const condensed = [...groups.values()].sort((a, b) =>
    a.paths[0].localeCompare(b.paths[0], 'en'),
  )

  for (const group of condensed) {
    const chosen =
      group.paths.length === 1 ? group.paths[0] : pickPreferredRasterPath(group.paths)
    if (group.paths.length > 1) {
      const skipped = group.paths.filter((p) => p !== chosen)
      for (const s of skipped) {
        console.info(
          `Skipped duplicate (${relative(IMAGE_ROOT, s)} loses to ${relative(IMAGE_ROOT, chosen)})`,
        )
      }
    }

    const outputPath = outputWebpPathForSource(chosen, IMAGE_ROOT, PUBLIC_ROOT)
    const sourceStat = statSync(chosen)
    const sourceMtimeMs = sourceStat.mtimeMs

    /** @type {number | null} */
    let outputMtimeMs = null
    try {
      outputMtimeMs = statSync(outputPath).mtimeMs
    } catch {
      outputMtimeMs = null
    }

    if (!shouldRebuildTextureWebp(sourceMtimeMs, outputMtimeMs, forceRebuild)) {
      console.info(
        `Skip up-to-date: ${relative(REPO_ROOT, chosen)} → ${relative(PUBLIC_ROOT, outputPath)}`,
      )
      continue
    }

    const beforeBytes = sourceStat.size

    const encodeHint = await encodeWebpUntilUnderCap(chosen, outputPath)

    const afterBytes = statSync(outputPath).size

    /** @type {string} */
    const relOutPath = relative(PUBLIC_ROOT, outputPath)

    console.info(
      `${relative(REPO_ROOT, chosen)} → ${relOutPath}: ${formatBytes(beforeBytes)} -> `
        + `${formatBytes(afterBytes)} [${encodeHint.label}]`,
    )

    removeStaleRastersSameBase(dirname(outputPath), group.base)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
