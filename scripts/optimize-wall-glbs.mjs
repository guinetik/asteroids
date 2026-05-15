#!/usr/bin/env node
/**
 * Bake a wall-mount pivot into the optimized wall prop GLBs
 * (`wall_oxygen`, `wall_heal`) so callers can drop them onto a wall
 * surface with `mesh.position.set(wallX, floorY, wallZ)` and rotate
 * around Y to face into the room.
 *
 * Target pivot: back-center-center (vertical midline anchor).
 *  - X: bbox X-center → 0 (horizontally centered on the wall anchor).
 *  - Y: bbox Y-center → 0 (vertically centered — runtime places the
 *    prop at the wall's vertical midline directly).
 *  - Z: bbox Z-min → 0  (back face flush with the wall; body extends
 *    into +Z, i.e. away from a wall whose outward normal is +Z).
 *
 * Run after the matching `gltf-transform optimize` passes, which use
 * `--join false --flatten false` so the Sketchfab mesh names survive
 * (runtime code addresses sub-meshes for emissive overlays). The
 * translation is applied as a single root-node offset and written back
 * to the same file. Idempotent: re-running re-bakes from the current
 * bbox without drift because we always solve for the *current* min.
 *
 * @author guinetik
 * @date 2026-05-15
 */

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Accessor, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

void Accessor

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TARGETS = ['wall_oxygen.glb', 'wall_heal.glb'].map((file) =>
  resolve(REPO_ROOT, 'public', 'models', file),
)

await MeshoptDecoder.ready
await MeshoptEncoder.ready

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
})

for (const target of TARGETS) {
  const document = await io.read(target)
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0]
  if (!scene) {
    console.warn(`No scene in ${target}, skipping`)
    continue
  }

  const bounds = getBounds(scene)
  const cx = (bounds.min[0] + bounds.max[0]) * 0.5
  const cy = (bounds.min[1] + bounds.max[1]) * 0.5
  const minZ = bounds.min[2]
  const offset = [-cx, -cy, -minZ]

  for (const child of scene.listChildren()) {
    const [tx, ty, tz] = child.getTranslation()
    child.setTranslation([tx + offset[0], ty + offset[1], tz + offset[2]])
  }

  await io.write(target, document)
  console.info(
    `Anchored back-center-center (offset ${offset.map((n) => n.toFixed(3)).join(', ')}) → ${target}`,
  )
}
