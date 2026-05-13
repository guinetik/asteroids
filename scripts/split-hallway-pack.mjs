#!/usr/bin/env node
/**
 * Splits `tmp/hallway_pack_original.glb` into one centered, optimized GLB per
 * mesh under `public/models/station/pieces/`.
 *
 * Each piece is re-centered so its bounding box origin sits at (0, 0, 0),
 * then welded + simplified + meshopt-compressed and re-saved with WebP textures.
 *
 * @author guinetik
 * @date 2026-05-13
 */

import { mkdirSync } from 'node:fs'
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
const INPUT = pathJoin(REPO_ROOT, 'tmp', 'hallway_pack_original.glb')
const OUTPUT_DIR = pathJoin(REPO_ROOT, 'public', 'models', 'station', 'pieces')

/** Vertex keep ratio for the simplify pass on each piece. */
const SIMPLIFY_RATIO = 0.4
/** Allowed simplify error (fraction of mesh radius). */
const SIMPLIFY_ERROR = 0.005
/** Max texture dimension for embedded textures. */
const TEXTURE_SIZE = 512

/**
 * Slugify a Blender-style mesh name into a filesystem-safe id.
 *
 * @param {string} name - Raw mesh name from the source GLB.
 * @returns {string} Slug suitable for use as a filename.
 */
function slug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Build the per-piece optimization transform chain.
 *
 * @returns {import('@gltf-transform/core').Transform[]}
 */
function pieceTransforms() {
  return [
    center({ pivot: 'center' }),
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
  ]
}

/**
 * Read the source GLB and write one optimized, origin-centered GLB per mesh.
 *
 * @returns {Promise<void>}
 */
async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder })

  await MeshoptEncoder.ready
  await MeshoptSimplifier.ready

  // Read once to enumerate mesh names; reload fresh for each piece so prune
  // calls don't accidentally share state across pieces.
  const source = await io.read(INPUT)
  const meshNames = source.getRoot().listMeshes().map((m) => m.getName() || 'unnamed')
  console.info(`Found ${meshNames.length} meshes in source`)

  const manifest = []

  for (const name of meshNames) {
    const id = slug(name)
    const doc = await io.read(INPUT)
    const root = doc.getRoot()

    // Drop every node whose mesh isn't this one.
    for (const node of root.listNodes()) {
      const mesh = node.getMesh()
      if (mesh && mesh.getName() !== name) {
        node.setMesh(null)
      }
    }

    // Prune unused meshes/materials/textures.
    await doc.transform(prune({ keepAttributes: true }))

    // Verify at least one mesh remains.
    const remaining = root.listMeshes()
    if (remaining.length === 0) {
      console.warn(`Skipping ${name}: prune removed all geometry`)
      continue
    }

    for (const t of pieceTransforms()) {
      await doc.transform(t)
    }

    const outPath = pathJoin(OUTPUT_DIR, `${id}.glb`)
    await io.write(outPath, doc)
    manifest.push({ id, name, file: `pieces/${id}.glb` })
    console.info(`  wrote ${id}.glb`)
  }

  console.info(`\nDone — ${manifest.length} pieces written to ${OUTPUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
