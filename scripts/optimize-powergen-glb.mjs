#!/usr/bin/env node
/**
 * Center the previously-optimized power generator GLB so its bounding-
 * box center sits at world XZ origin and the base rests on Y=0. Run
 * after `models:powergen:optimize` (which does prune + dedup + meshopt
 * with `--join false --flatten false` to preserve the named `body` +
 * `fuel_1` … `fuel_6` meshes that runtime code addresses individually).
 *
 * Mirrors the two-step pattern used by `table` / `virus`: CLI optimize
 * first, then a small node script that does pivot-bake via
 * `center({ pivot: 'below' })`. Idempotent.
 *
 * @author guinetik
 * @date 2026-05-15
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { center } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET_PATH = resolve(REPO_ROOT, 'public', 'models', 'powergen.glb')

await MeshoptDecoder.ready
await MeshoptEncoder.ready

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
})

const document = await io.read(TARGET_PATH)
await document.transform(center({ pivot: 'below' }))
await io.write(TARGET_PATH, document)
console.info(`Centered (pivot at floor center) → ${TARGET_PATH}`)
