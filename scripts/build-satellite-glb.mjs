#!/usr/bin/env node
/**
 * Builds `public/models/satellite.glb` for runtime with **node/graph preservation**
 * so EVA satellite-servicing can resolve manifest names ({@link validateManifest}
 * walks `THREE.Object3D` by name — see {@link SatelliteRepairController}).
 *
 * Prefers `3d/satellite_rigged.glb` when present (separate objects named like
 * `satellite_antenna`). Falls back to merged `3d/satellite.glb` (Sketchfab export)
 * with a clear warning — that asset has no rig parts, so servicing overlays will
 * not attach.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/satellite-rig-glb.md
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

/** @type {string} */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Authoring path when the satellite is split into named repair parts. */
const INPUT_RIGGED = join(REPO_ROOT, '3d', 'satellite_rigged.glb')

/** Legacy merged Sketchfab export — no per-part names for the manifest. */
const INPUT_FLAT = join(REPO_ROOT, '3d', 'satellite.glb')

const OUTPUT = join(REPO_ROOT, 'public', 'models', 'satellite.glb')

const MANIFEST_PATH = join(REPO_ROOT, 'src', 'data', 'satellite-manifests.json')

/** Flags matching `gltf-transform optimize` defaults we need for rig preservation. */
const OPTIMIZE_FLAGS = [
  '--join',
  'false',
  '--flatten',
  'false',
  '--simplify',
  'false',
  '--texture-compress',
  'webp',
  '--texture-size',
  '2048',
  '--meshopt-level',
  'high',
]

/**
 * @returns {readonly string[]}
 */
function readExpectedComponentNames() {
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  const list = raw?.satellite?.components
  if (!Array.isArray(list) || list.some((n) => typeof n !== 'string')) {
    throw new Error(`build-satellite-glb: invalid satellite-manifests.json at ${MANIFEST_PATH}`)
  }
  return list
}

/**
 * Collects every non-empty name on glTF nodes and meshes (Three uses both when
 * resolving `getObjectByName` on loaded scenes).
 *
 * @param {import('@gltf-transform/core').Document} document
 * @returns {Set<string>}
 */
function collectNamedObjects(document) {
  const names = new Set()
  for (const node of document.getRoot().listNodes()) {
    const n = node.getName()?.trim()
    if (n) names.add(n)
  }
  for (const mesh of document.getRoot().listMeshes()) {
    const n = mesh.getName()?.trim()
    if (n) names.add(n)
  }
  return names
}

/**
 * Sets up NodeIO so Meshopt-compressed runtime GLBs can be read for manifest checks.
 *
 * @returns {Promise<import('@gltf-transform/core').NodeIO>}
 */
async function createReaderIO() {
  await MeshoptDecoder.ready
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
    })
}

/**
 * @param {string} glbPath
 * @param {readonly string[]} required
 * @returns {Promise<string[]>} Manifest names absent from nodes/meshes.
 */
async function listMissingManifestNames(glbPath, required) {
  const io = await createReaderIO()
  const document = await io.read(glbPath)
  const present = collectNamedObjects(document)
  return required.filter((name) => !present.has(name))
}

/**
 * @param {string} inputPath
 * @returns {void}
 */
function runOptimize(inputPath) {
  const result = spawnSync(
    'bunx',
    ['gltf-transform', 'optimize', inputPath, OUTPUT, ...OPTIMIZE_FLAGS],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  )
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

async function main() {
  const inputPath = existsSync(INPUT_RIGGED) ? INPUT_RIGGED : INPUT_FLAT
  if (inputPath === INPUT_FLAT) {
    console.warn(
      '[build-satellite-glb] Using merged 3d/satellite.glb — EVA satellite_servicing needs 3d/satellite_rigged.glb with named parts (see docs/satellite-rig-glb.md).',
    )
  } else {
    console.info('[build-satellite-glb] Using rigged source:', INPUT_RIGGED)
  }

  if (!existsSync(inputPath)) {
    console.error(`build-satellite-glb: missing input ${inputPath}`)
    process.exit(1)
  }

  runOptimize(inputPath)

  const required = readExpectedComponentNames()
  const missing = await listMissingManifestNames(OUTPUT, required)
  if (missing.length > 0) {
    console.warn(
      '[build-satellite-glb] Output is missing manifest component names (servicing will skip these):',
      missing.join(', '),
    )
  } else {
    console.info('[build-satellite-glb] Manifest component names present in', OUTPUT)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
