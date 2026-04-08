#!/usr/bin/env node
/**
 * Optimizes `3d/virus.glb` → `public/models/virus.glb` for a small runtime download.
 *
 * Sketchfab export: many separate high-poly spheres. **Join** after an initial
 * simplify merges them for fewer draw calls; a **second** simplify (after weld)
 * shrinks the combined mesh. Simplifying only after join barely decimates
 * (non-manifold soup); pre-join simplify is required for a sub‑1 MB target.
 *
 * @see docs/virus-glb-pipeline.md
 */

import { execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join as pathJoin, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import {
  INSTANCE_DEFAULTS,
  PALETTE_DEFAULTS,
  createTransform,
  dedup,
  flatten,
  instance,
  join,
  meshopt,
  palette,
  prune,
  reorder,
  resample,
  simplify,
  sparse,
  textureCompress,
  weld,
} from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'

import { ready as keyframeReady, resample as keyframeResample } from 'keyframe-resample'

/** @type {string} */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const INPUT = pathJoin(REPO_ROOT, '3d', 'virus.glb')
const OUTPUT = pathJoin(REPO_ROOT, 'public', 'models', 'virus.glb')

/** Default vertex keep ratio for the first simplify (per-sphere, before join). */
const DEFAULT_VIRUS_PRE_JOIN_SIMPLIFY_RATIO = 0.052

/** Default vertex keep ratio for the second simplify (after join + weld). */
const DEFAULT_VIRUS_POST_JOIN_SIMPLIFY_RATIO = 0.018

/**
 * Extra vertex keep ratios applied in order after the post-join simplify step.
 * One-pass simplify hits a topology plateau; chaining nudges triangle count down for sub‑1 MB GLB.
 */
const DEFAULT_VIRUS_JOIN_EXTRA_SIMPLIFY_RATIOS = [0.4, 0.38, 0.36]

/**
 * Optional last simplify uses ratio `0` and this error cap (see `gltf-transform simplify`).
 * Default `0` skips (no benefit observed on this mesh once normals are stripped).
 */
const DEFAULT_VIRUS_FINAL_SIMPLIFY_ERROR = 0

/**
 * Error limit as fraction of mesh radius; large value lets the simplifier reach
 * the target ratio (same semantics as `gltf-transform simplify --error 1`).
 */
const DEFAULT_VIRUS_SIMPLIFY_ERROR = 1

/** Max texture dimension for embedded textures (no-op when none). */
const DEFAULT_VIRUS_TEXTURE_SIZE = 512

/** When true, run `gltf-transform draco` after Meshopt so the GLB ships under ~1 MB. */
const DEFAULT_VIRUS_APPLY_DRACO = true

/**
 * Strips NORMAL attributes so buffers only carry POSITION; Three.js computes normals on load.
 * Large win for transmission size on dense meshes.
 *
 * @returns {import('@gltf-transform/core').Transform}
 */
function stripNormalAttributes() {
  return createTransform('stripNormalAttributes', (document) => {
    for (const mesh of document.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        prim.setAttribute('NORMAL', null)
      }
    }
  })
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
async function main(inputPath, outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true })

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
    })

  await MeshoptEncoder.ready
  await MeshoptSimplifier.ready

  const document = await io.read(inputPath)

  const preRatio = Number(
    process.env.VIRUS_PRE_JOIN_SIMPLIFY_RATIO ?? DEFAULT_VIRUS_PRE_JOIN_SIMPLIFY_RATIO,
  )
  const postRatio = Number(
    process.env.VIRUS_POST_JOIN_SIMPLIFY_RATIO ?? DEFAULT_VIRUS_POST_JOIN_SIMPLIFY_RATIO,
  )
  const joinExtraRatios =
    process.env.VIRUS_JOIN_EXTRA_SIMPLIFY_RATIOS?.trim()
      ? process.env.VIRUS_JOIN_EXTRA_SIMPLIFY_RATIOS.split(/[\s,]+/).map(Number)
      : DEFAULT_VIRUS_JOIN_EXTRA_SIMPLIFY_RATIOS
  const error = Number(process.env.VIRUS_SIMPLIFY_ERROR ?? DEFAULT_VIRUS_SIMPLIFY_ERROR)
  const finalError = Number(
    process.env.VIRUS_FINAL_SIMPLIFY_ERROR ?? DEFAULT_VIRUS_FINAL_SIMPLIFY_ERROR,
  )
  const textureSize = Number(process.env.VIRUS_TEXTURE_SIZE ?? DEFAULT_VIRUS_TEXTURE_SIZE)
  const stripNormals =
    (process.env.VIRUS_STRIP_NORMALS ?? 'true').toLowerCase() !== 'false'
  const applyDraco = (process.env.VIRUS_APPLY_DRACO ?? String(DEFAULT_VIRUS_APPLY_DRACO))
    .toLowerCase() !== 'false'

  const simp = (ratio, err = error) => ({
    simplifier: MeshoptSimplifier,
    ratio,
    error: err,
    lockBorder: false,
  })

  const transforms = [
    dedup(),
    instance({ min: INSTANCE_DEFAULTS.min }),
    palette({ min: PALETTE_DEFAULTS.min, keepAttributes: true }),
    flatten(),
    weld(),
    simplify(simp(preRatio)),
    join({ keepNamed: false, keepMeshes: false }),
    weld({ overwrite: true }),
    simplify(simp(postRatio)),
    ...joinExtraRatios.filter((r) => r > 0 && r < 1).map((r) => simplify(simp(r))),
    ...(finalError > 0 ? [simplify(simp(0, finalError))] : []),
    resample({
      ready: keyframeReady,
      resample: keyframeResample,
    }),
    prune({ keepAttributes: true, keepIndices: false, keepLeaves: true, keepSolidTextures: true }),
    sparse(),
    textureCompress({
      encoder: sharp,
      resize: [textureSize, textureSize],
      targetFormat: 'webp',
    }),
    ...(stripNormals ? [stripNormalAttributes()] : []),
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  ]

  for (const t of transforms) {
    await document.transform(t)
  }

  if (!applyDraco) {
    await io.write(outputPath, document)
    console.info(`Wrote ${outputPath}`)
    return
  }

  const tmpDir = mkdtempSync(pathJoin(tmpdir(), 'virus-glb-'))
  const meshoptPath = pathJoin(tmpDir, 'meshopt.glb')
  await io.write(meshoptPath, document)
  try {
    execSync(
      `bunx gltf-transform draco ${JSON.stringify(meshoptPath)} ${JSON.stringify(outputPath)}`,
      {
        cwd: REPO_ROOT,
        stdio: 'inherit',
        shell: true,
      },
    )
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
  console.info(`Wrote ${outputPath} (Draco)`)
}

const inputPath = process.argv[2] ? resolve(REPO_ROOT, process.argv[2]) : INPUT
const outputPath = process.argv[3] ? resolve(REPO_ROOT, process.argv[3]) : OUTPUT

main(inputPath, outputPath).catch((err) => {
  console.error(err)
  process.exit(1)
})
