#!/usr/bin/env node
/**
 * Ensures authoring GLBs exist under `3d/` before running optimize scripts.
 * If a file is missing in `3d/` but present in `public/models/`, copies it once
 * so `gltf-transform optimize` has a stable source path (see `package.json` `models:*:build`).
 *
 * @author guinetik
 * @date 2026-04-30
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** @type {string} */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** @type {readonly string[]} */
const SOURCES = [
  'bed.glb',
  'table.glb',
  'city.glb',
  'asteroid.glb',
  'virus.glb',
  'arcade_machine.glb',
  'cat_tower.glb',
  'coffee_machine.glb',
  'lounge_chair.glb',
  'record_player.glb',
  'refractor_telescope.glb',
  'lamp.glb',
]

/**
 * @param {string} fileName
 * @returns {void}
 */
function ensureOne(fileName) {
  const dest = join(REPO_ROOT, '3d', fileName)
  if (existsSync(dest)) {
    return
  }
  const src = join(REPO_ROOT, 'public', 'models', fileName)
  if (!existsSync(src)) {
    console.error(`bootstrap-heavy-glb-sources: missing both 3d/${fileName} and public/models/${fileName}`)
    process.exit(1)
  }
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(src, dest)
  console.info(`bootstrap-heavy-glb-sources: copied public/models/${fileName} → 3d/${fileName}`)
}

function main() {
  for (const name of SOURCES) {
    ensureOne(name)
  }
}

main()
