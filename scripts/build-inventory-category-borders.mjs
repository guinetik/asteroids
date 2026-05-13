#!/usr/bin/env node
/**
 * Raster category slot frames authored under {@link SOURCE_DIR_RELATIVE} are resized and
 * emitted as compressed WebPs under {@link DESTINATION_DIR_RELATIVE} for HUD inventory rows.
 *
 * Environment: set `ITEM_BORDERS_FORCE_REBUILD=1` (or `true`) to re-encode even when outputs
 * are newer than sources.
 *
 * @author guinetik
 * @date 2026-05-13
 */
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

/** Repo root (directory containing `package.json`). */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Authoritative JPG borders from design (`border_yellow.jpg`, …). */
const SOURCE_DIR_RELATIVE = join('image', 'items')

/** Served from site root (`/images/items/…`). */
const DESTINATION_DIR_RELATIVE = join('public', 'images', 'items')

/**
 * Borders to ship; basename becomes `basename.webp`.
 *
 * @type {readonly string[]}
 */
const BORDER_SOURCE_FILENAMES = [
  'border_yellow.jpg',
  'border_green.jpg',
  'border_cyan.jpg',
  'border_orange.jpg',
  'border_purple.jpg',
]

/** Longest edge cap (pixels) — HUD slots are CSS-small; downsizing saves bandwidth. */
const MAX_BORDER_EDGE_PIXELS = 512

/** Lossy WebP quality (Sharp 1–100). */
const WEBP_QUALITY = 80

/** Libwebp effort (Sharp 0–6). Higher = slower, slightly smaller files. */
const WEBP_EFFORT = 6

/**
 * True when destination should be regenerated from source timestamps.
 *
 * @param {number} srcMtime - Source file `mtimeMs`.
 * @param {number | null} destMtime - Destination `.webp` mtime or `null` when missing.
 * @param {boolean} forceRebuild - Bypass skip logic when true.
 * @returns {boolean} Encode when true.
 */
function shouldRebuildInventoryBorderWebp(srcMtime, destMtime, forceRebuild) {
  if (forceRebuild) return true
  if (destMtime === null) return true
  return srcMtime > destMtime
}

/**
 * @returns {Promise<void>}
 */
async function main() {
  const forceRebuild =
    process.env.ITEM_BORDERS_FORCE_REBUILD === '1' ||
    process.env.ITEM_BORDERS_FORCE_REBUILD === 'true'

  const srcDir = resolve(REPO_ROOT, SOURCE_DIR_RELATIVE)
  const destDir = resolve(REPO_ROOT, DESTINATION_DIR_RELATIVE)
  mkdirSync(destDir, { recursive: true })

  for (const filename of BORDER_SOURCE_FILENAMES) {
    const srcPath = resolve(srcDir, filename)
    if (!existsSync(srcPath)) {
      throw new Error(`Missing inventory border source: ${relative(REPO_ROOT, srcPath)}`)
    }

    const baseNoExt = basename(filename, extname(filename))
    const destPath = join(destDir, `${baseNoExt}.webp`)

    const srcMtime = statSync(srcPath).mtimeMs

    /** @type {number | null} */
    let destMtime = null
    try {
      destMtime = statSync(destPath).mtimeMs
    } catch {
      destMtime = null
    }

    if (!shouldRebuildInventoryBorderWebp(srcMtime, destMtime, forceRebuild)) {
      console.info(
        `Skip up-to-date: ${relative(REPO_ROOT, srcPath)} → ${relative(REPO_ROOT, destPath)}`,
      )
      continue
    }

    mkdirSync(dirname(destPath), { recursive: true })

    const pipeline = sharp(srcPath).rotate()

    pipeline.resize(MAX_BORDER_EDGE_PIXELS, MAX_BORDER_EDGE_PIXELS, {
      fit: 'inside',
      withoutEnlargement: true,
    })

    await pipeline.webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT }).toFile(destPath)

    const beforeBytes = statSync(srcPath).size
    const afterBytes = statSync(destPath).size

    console.info(
      `${relative(REPO_ROOT, srcPath)} → ${relative(REPO_ROOT, destPath)}: `
        + `${beforeBytes} B → ${afterBytes} B`,
    )
  }
}

await main()
