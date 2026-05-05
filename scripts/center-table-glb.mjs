#!/usr/bin/env node
/**
 * Bakes the table mesh pivot so the scene bounding-box center sits at the world origin
 * and the floor of the model rests on Y=0.
 *
 * Many third-party Sketchfab GLBs (table.glb included) leave mesh data far from the
 * scene root, which makes runtime rotation/placement orbit the wrong point. Running
 * this once collapses every node transform into vertex positions, then translates the
 * whole asset so:
 *   - Bounding-box center sits at (0, *, 0) on X / Z (centered horizontally).
 *   - Bounding-box minimum sits at Y = 0 (floor-aligned, ready to drop into a scene).
 *
 * Pure Node — no Blender required. Idempotent: running it again is a no-op since the
 * pivot is already at the bbox center.
 *
 * Usage:
 *   bun run models:table:center
 *   node scripts/center-table-glb.mjs [input.glb] [output.glb]
 *
 * @author guinetik
 * @date 2026-05-04
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { center } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_PATH = resolve(REPO_ROOT, 'public', 'models', 'table.glb')

const inputPath = process.argv[2] ? resolve(REPO_ROOT, process.argv[2]) : DEFAULT_PATH
const outputPath = process.argv[3] ? resolve(REPO_ROOT, process.argv[3]) : inputPath

await MeshoptDecoder.ready
await MeshoptEncoder.ready

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
})

const document = await io.read(inputPath)
await document.transform(center({ pivot: 'below' }))
await io.write(outputPath, document)
console.info(`Centered table.glb (pivot at floor center) → ${outputPath}`)
