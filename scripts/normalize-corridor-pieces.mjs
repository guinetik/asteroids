#!/usr/bin/env node
/**
 * Centers each fresh corridor GLB in `3d/corridor*.glb` on its bbox
 * centre and copies it to `public/models/station/pieces/` under the
 * existing in-game filenames. No meshopt, no texture compression,
 * no simplification — produces large but Blender-openable GLBs.
 *
 * Also reports each piece's new half-extents so `CORRIDOR_HALF_EXTENTS`
 * in `src/lib/station/StationLayout.ts` can be updated to match.
 *
 * Naming map:
 *   3d/corridor_C.glb (cross)        → public/.../corridor.glb
 *   3d/corridor_L.glb (L-corner)     → public/.../corridor_corner.glb
 *   3d/corridor_T.glb (T-window)     → public/.../corridor_window.glb
 *
 * @author guinetik
 * @date 2026-05-13
 */

import { dirname, join as pathJoin, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { center } from '@gltf-transform/functions'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = pathJoin(REPO_ROOT, '3d')
const OUT_DIR = pathJoin(REPO_ROOT, 'public', 'models', 'station', 'pieces')

/** Source → in-game filename mapping. */
const PIECES = [
  { src: 'corridor_C.glb', dst: 'corridor.glb', kind: 'cross' },
  { src: 'corridor_L.glb', dst: 'corridor_corner.glb', kind: 'corner' },
  { src: 'corridor_T.glb', dst: 'corridor_window.glb', kind: 'window' },
  { src: 'corridor.glb', dst: 'corridor_straight.glb', kind: 'straight' },
]

/**
 * Read a GLB, centre it, write it out, and report bbox dimensions.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

  for (const piece of PIECES) {
    const srcPath = pathJoin(SRC_DIR, piece.src)
    const dstPath = pathJoin(OUT_DIR, piece.dst)

    const doc = await io.read(srcPath)
    await doc.transform(center({ pivot: 'center' }))

    // Measure bbox by walking primitives' POSITION accessors.
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

    await io.write(dstPath, doc)
    const hx = (maxX - minX) / 2
    const hy = (maxY - minY) / 2
    const hz = (maxZ - minZ) / 2
    console.info(
      `${piece.kind.padEnd(7)} ${piece.src} → ${piece.dst}` +
        `  half-extents: x=${hx.toFixed(3)} y=${hy.toFixed(3)} z=${hz.toFixed(3)}`,
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
