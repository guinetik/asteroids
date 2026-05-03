#!/usr/bin/env node
/**
 * Builds an Open Graph raster under `public/` from `image/og_image.png` using ImageMagick.
 * Matches `scripts/build-textures.mjs`: invokes `magick` from PATH (ImageMagick v7).
 *
 * @author guinetik
 * @date 2026-05-03
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** IM v7 entrypoint (same as `build-textures.mjs`). */
const MAGICK_BIN = 'magick'

/** Repo root (directory containing `package.json`). */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Authoritative OG source raster (design exports land here). */
const SOURCE_RELATIVE = join('image', 'og_image.png')

/** Published OG asset URL path segment (`public/` → site root). */
const DEST_RELATIVE = join('public', 'og-image.png')

/** Recommended Open Graph width for Facebook / LinkedIn previews (pixels). */
const OPEN_GRAPH_IMAGE_WIDTH_PX = 1200

/** Recommended Open Graph height for Facebook / LinkedIn previews (pixels). */
const OPEN_GRAPH_IMAGE_HEIGHT_PX = 630

/**
 * Runs ImageMagick; rejects when `magick` is missing or exits non-zero.
 *
 * @param {string[]} magickArgs - Arguments after the binary name.
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
 * Entry point — resize/crop to OG dimensions, strip metadata, compress PNG.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const src = resolve(REPO_ROOT, SOURCE_RELATIVE)
  const dest = resolve(REPO_ROOT, DEST_RELATIVE)

  if (!existsSync(src)) {
    throw new Error(`Missing OG source raster: ${src}`)
  }

  mkdirSync(dirname(dest), { recursive: true })

  try {
    if (existsSync(dest)) {
      unlinkSync(dest)
    }
  } catch {
    // Best-effort — encoder still tries `dest`.
  }

  const geom = `${OPEN_GRAPH_IMAGE_WIDTH_PX}x${OPEN_GRAPH_IMAGE_HEIGHT_PX}`
  await spawnMagick([
    src,
    '-auto-orient',
    '-resize',
    `${geom}^`,
    '-gravity',
    'center',
    '-extent',
    geom,
    '-strip',
    '-define',
    'png:compression-level=9',
    dest,
  ])
}

await main()
