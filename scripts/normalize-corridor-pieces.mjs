#!/usr/bin/env node
/**
 * Centers each fresh corridor GLB in `3d/corridor*.glb` on its bbox
 * centre, compacts it, and copies it to `public/models/station/pieces/`
 * using the source filename as the canonical runtime filename.
 *
 * Also reports each piece's new half-extents so `CORRIDOR_HALF_EXTENTS`
 * in `src/lib/station/StationLayout.ts` can be updated to match.
 *
 * Naming:
 *   3d/corridor_C.glb → public/.../corridor_C.glb
 *   3d/corridor_L.glb → public/.../corridor_L.glb
 *   3d/corridor_T.glb → public/.../corridor_T.glb
 *   3d/corridor.glb   → public/.../corridor.glb
 *
 * @author guinetik
 * @date 2026-05-13
 */

import { dirname, join as pathJoin, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import {
  center,
  dedup,
  meshopt,
  prune,
  reorder,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = pathJoin(REPO_ROOT, '3d')
const OUT_DIR = pathJoin(REPO_ROOT, 'public', 'models', 'station', 'pieces')

/** Vertex keep ratio for corridor pieces. */
const SIMPLIFY_RATIO = 0.5
/** Allowed simplify error as a fraction of mesh radius. */
const SIMPLIFY_ERROR = 0.001
/** Max texture dimension for embedded textures. */
const TEXTURE_SIZE = 1024

/** Source filename and semantic kind. */
const PIECES = [
  { filename: 'corridor_C.glb', kind: 'cross' },
  { filename: 'corridor_L.glb', kind: 'corner' },
  { filename: 'corridor_T.glb', kind: 'window' },
  { filename: 'corridor.glb', kind: 'straight' },
]

/**
 * Measure document mesh half-extents from POSITION accessor bounds.
 *
 * @param {import('@gltf-transform/core').Document} doc - GLB document to measure.
 * @returns {{ x: number, y: number, z: number }} Half-extents in source units.
 */
function measureHalfExtents(doc) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      if (!pos) continue
      const min = pos.getMin([0, 0, 0])
      const max = pos.getMax([0, 0, 0])
      if (min[0] < minX) minX = min[0]
      if (max[0] > maxX) maxX = max[0]
      if (min[1] < minY) minY = min[1]
      if (max[1] > maxY) maxY = max[1]
      if (min[2] < minZ) minZ = min[2]
      if (max[2] > maxZ) maxZ = max[2]
    }
  }

  return {
    x: (maxX - minX) / 2,
    y: (maxY - minY) / 2,
    z: (maxZ - minZ) / 2,
  }
}

/**
 * Read a GLB, centre it, compact it, write it out, and report bbox dimensions.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder })

  await MeshoptEncoder.ready
  await MeshoptSimplifier.ready

  for (const piece of PIECES) {
    const srcPath = pathJoin(SRC_DIR, piece.filename)
    const dstPath = pathJoin(OUT_DIR, piece.filename)

    const doc = await io.read(srcPath)
    await doc.transform(center({ pivot: 'center' }))
    const half = measureHalfExtents(doc)

    await doc.transform(
      dedup(),
      weld(),
      simplify({
        simplifier: MeshoptSimplifier,
        ratio: SIMPLIFY_RATIO,
        error: SIMPLIFY_ERROR,
        lockBorder: false,
      }),
      prune({ keepAttributes: false, keepIndices: false, keepLeaves: false }),
      textureCompress({
        encoder: sharp,
        resize: [TEXTURE_SIZE, TEXTURE_SIZE],
        targetFormat: 'webp',
      }),
      reorder({ encoder: MeshoptEncoder, target: 'size' }),
      meshopt({ encoder: MeshoptEncoder, level: 'high' }),
    )

    await io.write(dstPath, doc)
    console.info(
      `${piece.kind.padEnd(8)} ${piece.filename}` +
        `  half-extents: x=${half.x.toFixed(3)} y=${half.y.toFixed(3)} z=${half.z.toFixed(3)}`,
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
