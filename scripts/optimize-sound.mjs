#!/usr/bin/env node
/**
 * Optimizes recursive raw MP3 files from `sound/` into runtime MP3 files under
 * `public/sound/` with filename-based quality presets.
 *
 * @author guinetik
 * @date 2026-04-27
 * @see docs/superpowers/specs/2026-04-27-sound-optimization-pipeline-design.md
 */

import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** @type {string} */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const SOURCE_DIR = join(REPO_ROOT, 'sound')
const OUTPUT_DIR = join(REPO_ROOT, 'public', 'sound')
const MP3_EXTENSION = '.mp3'
const FFMPEG_BIN = 'ffmpeg'
const BYTE_UNIT = 1024
const PERCENT_SCALE = 100

/** @type {{ bitrate: string; channels: number }} */
const MUSIC_PRESET = { bitrate: '128k', channels: 2 }
/** @type {{ bitrate: string; channels: number }} */
const VOICE_PRESET = { bitrate: '96k', channels: 1 }
/** @type {{ bitrate: string; channels: number }} */
const COMPACT_PRESET = { bitrate: '64k', channels: 1 }
/** @type {{ bitrate: string; channels: number }} */
const FALLBACK_PRESET = VOICE_PRESET

/**
 * Selects an MP3 optimization preset from the source file name.
 *
 * @param {string} fileName - MP3 file name such as `sfx.collect.mp3`.
 * @returns {{ bitrate: string; channels: number }} ffmpeg audio settings.
 */
export function presetForFileName(fileName) {
  const normalized = basename(fileName).toLowerCase()

  if (
    normalized.startsWith('ambient.') ||
    normalized.startsWith('level_') ||
    normalized === 'theme.mp3'
  ) {
    return MUSIC_PRESET
  }

  if (normalized.startsWith('jay-') || normalized.startsWith('marta-')) {
    return VOICE_PRESET
  }

  if (normalized.startsWith('sfx.') || normalized.startsWith('ui.')) {
    return COMPACT_PRESET
  }

  return FALLBACK_PRESET
}

/**
 * Maps a source file under `sound/` to the matching output file under
 * `public/sound/`.
 *
 * @param {string} inputPath - Absolute or relative source MP3 path.
 * @param {string} sourceDir - Source sound directory.
 * @param {string} outputDir - Runtime sound directory.
 * @returns {string} Output MP3 path.
 */
export function outputPathForInput(inputPath, sourceDir = SOURCE_DIR, outputDir = OUTPUT_DIR) {
  const relativePath = relative(sourceDir, inputPath)
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Input must be inside ${sourceDir}: ${inputPath}`)
  }
  return join(outputDir, relativePath)
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
 * Decides whether the encoded candidate should replace the source bytes.
 *
 * @param {number} sourceBytes - Original source file size.
 * @param {number} candidateBytes - Encoded candidate file size.
 * @returns {boolean} True when the candidate is smaller than the source.
 */
export function shouldUseOptimizedCandidate(sourceBytes, candidateBytes) {
  return candidateBytes < sourceBytes
}

/**
 * Lists MP3 source files recursively in deterministic order.
 *
 * @param {string} sourceDir - Directory to scan.
 * @returns {string[]} Absolute MP3 paths.
 */
function listSourceMp3s(sourceDir) {
  /** @type {string[]} */
  const files = []

  /**
   * @param {string} currentDir - Directory currently being scanned.
   * @returns {void}
   */
  function walk(currentDir) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(entryPath)
        continue
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(MP3_EXTENSION)) {
        files.push(entryPath)
      }
    }
  }

  walk(sourceDir)
  return files.sort()
}

/**
 * Runs ffmpeg for one source and destination pair.
 *
 * @param {string} inputPath - Source MP3 path.
 * @param {string} outputPath - Optimized MP3 path.
 * @param {{ bitrate: string; channels: number }} preset - ffmpeg audio settings.
 * @returns {Promise<void>} Resolves when ffmpeg exits successfully.
 */
async function optimizeMp3(inputPath, outputPath, preset) {
  const outputDir = dirname(outputPath)
  const tempOutputPath = join(outputDir, `${basename(outputPath)}.tmp-${process.pid}.mp3`)
  mkdirSync(outputDir, { recursive: true })

  const args = [
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-codec:a',
    'libmp3lame',
    '-b:a',
    preset.bitrate,
    '-ac',
    String(preset.channels),
    tempOutputPath,
  ]

  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        rejectPromise(new Error('ffmpeg was not found on PATH. Install ffmpeg and try again.'))
        return
      }
      rejectPromise(err)
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      rejectPromise(new Error(`ffmpeg failed for ${inputPath} with code ${code}.\n${stderr}`))
    })
  })

  const sourceBytes = statSync(inputPath).size
  const candidateBytes = statSync(tempOutputPath).size
  if (shouldUseOptimizedCandidate(sourceBytes, candidateBytes)) {
    renameSync(tempOutputPath, outputPath)
    return
  }

  copyFileSync(inputPath, outputPath)
  unlinkSync(tempOutputPath)
}

/**
 * Runs the sound optimization pipeline.
 *
 * @param {string} sourceDir - Directory containing raw MP3s.
 * @param {string} outputDir - Directory to receive optimized MP3s.
 * @returns {Promise<void>} Resolves after all MP3s are optimized.
 */
export async function main(sourceDir = SOURCE_DIR, outputDir = OUTPUT_DIR) {
  const inputPaths = listSourceMp3s(sourceDir)

  if (inputPaths.length === 0) {
    console.info(`No MP3 files found in ${sourceDir}`)
    return
  }

  for (const inputPath of inputPaths) {
    const outputPath = outputPathForInput(inputPath, sourceDir, outputDir)
    const preset = presetForFileName(inputPath)
    const beforeBytes = statSync(inputPath).size

    await optimizeMp3(inputPath, outputPath, preset)

    const afterBytes = statSync(outputPath).size
    const savings = beforeBytes > 0 ? ((beforeBytes - afterBytes) / beforeBytes) * PERCENT_SCALE : 0
    console.info(
      `${relative(sourceDir, inputPath)}: ${formatBytes(beforeBytes)} -> ${formatBytes(afterBytes)} `
        + `(${savings.toFixed(1)}%)`,
    )
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
