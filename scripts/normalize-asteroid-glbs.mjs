#!/usr/bin/env node
/**
 * Normalizes `3d/astro_*.glb` assets into runtime asteroid models.
 *
 * The pipeline strips embedded textures, assigns a neutral runtime material,
 * preserves UVs for per-asteroid texture overrides, and fits each source GLB to
 * the pivot and max dimension of `public/models/asteroid.glb`.
 *
 * @author guinetik
 * @date 2026-04-24
 * @see docs/asteroid-glb-normalization-pipeline.md
 */

import { mkdirSync, readdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import {
  center,
  createTransform,
  dedup,
  flatten,
  getBounds,
  prune,
  simplify,
  sparse,
  weld,
} from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'

/** @type {string} */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const SOURCE_DIR = join(REPO_ROOT, '3d', 'asteroids')
const OUTPUT_DIR = join(REPO_ROOT, 'public', 'models', 'asteroids')
const REFERENCE_MODEL = join(REPO_ROOT, 'public', 'models', 'asteroid.glb')
const SOURCE_EXTENSION = '.glb'
// Bumped for FPS walkability. Players walk on these meshes at point-blank
// range, so triangle density needs to support visible silhouette detail
// rather than just lander-altitude readability. Override per-run with
// ASTEROID_TARGET_TRIANGLES / ASTEROID_SIMPLIFY_ERROR env vars.
const DEFAULT_TARGET_TRIANGLES = 200000
const DEFAULT_SIMPLIFY_ERROR = 0.005
const NORMALIZED_MATERIAL_NAME = 'runtimeTextureMaterial'

/**
 * Gets the axis-aligned size for glTF bounds.
 *
 * @param {{ min: number[]; max: number[] }} bounds - Bounds with min/max vectors.
 * @returns {[number, number, number]} Width, height, and depth.
 */
export function boundsSize(bounds) {
  return [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ]
}

/**
 * Gets the center point for glTF bounds.
 *
 * @param {{ min: number[]; max: number[] }} bounds - Bounds with min/max vectors.
 * @returns {[number, number, number]} Center position.
 */
export function boundsCenter(bounds) {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ]
}

/**
 * Converts a source asteroid GLB path into the normalized output file name.
 *
 * @param {string} inputPath - Source path such as `3d/asteroids/bennu.glb`.
 * @returns {string} Output file name such as `bennu.glb`.
 */
export function outputNameForInput(inputPath) {
  const fileName = basename(inputPath)
  if (!fileName.endsWith(SOURCE_EXTENSION)) {
    throw new Error(`Expected source file ending in ${SOURCE_EXTENSION}: ${inputPath}`)
  }
  return fileName.toLowerCase()
}

/**
 * Computes the uniform fit needed to match reference max dimension and pivot.
 *
 * @param {{ min: number[]; max: number[] }} sourceBounds - Source model bounds.
 * @param {{ min: number[]; max: number[] }} referenceBounds - Reference model bounds.
 * @returns {{
 *   scale: number
 *   translation: [number, number, number]
 *   fittedBounds: { min: [number, number, number]; max: [number, number, number] }
 * }} Transform summary for fitting source to reference.
 */
export function computeReferenceFit(sourceBounds, referenceBounds) {
  const sourceSize = boundsSize(sourceBounds)
  const referenceSize = boundsSize(referenceBounds)
  const sourceMax = Math.max(...sourceSize)
  const referenceMax = Math.max(...referenceSize)

  if (sourceMax <= 0 || referenceMax <= 0) {
    throw new Error('Cannot fit a model with empty source or reference bounds.')
  }

  const scale = referenceMax / sourceMax
  const sourceCenter = boundsCenter(sourceBounds)
  const referenceCenter = boundsCenter(referenceBounds)
  const translation = [
    referenceCenter[0] - sourceCenter[0] * scale,
    referenceCenter[1] - sourceCenter[1] * scale,
    referenceCenter[2] - sourceCenter[2] * scale,
  ]
  const fittedHalfSize = sourceSize.map((size) => (size * scale) / 2)

  return {
    scale,
    translation,
    fittedBounds: {
      min: [
        referenceCenter[0] - fittedHalfSize[0],
        referenceCenter[1] - fittedHalfSize[1],
        referenceCenter[2] - fittedHalfSize[2],
      ],
      max: [
        referenceCenter[0] + fittedHalfSize[0],
        referenceCenter[1] + fittedHalfSize[1],
        referenceCenter[2] + fittedHalfSize[2],
      ],
    },
  }
}

/**
 * Counts total triangles across every primitive in the document.
 *
 * @param {import('@gltf-transform/core').Document} document - glTF document.
 * @returns {number} Total triangle count.
 */
function countDocumentTriangles(document) {
  let total = 0
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices()
      const positions = primitive.getAttribute('POSITION')
      const count = indices ? indices.getCount() : (positions?.getCount() ?? 0)
      total += count / 3
    }
  }
  return total
}

/**
 * Lists source asteroid GLBs in deterministic order.
 *
 * @param {string} sourceDir - Directory containing `astro_*.glb` files.
 * @returns {string[]} Absolute paths for source files.
 */
function listSourceGlbs(sourceDir) {
  // Optional filter: ASTEROID_ONLY=bennu,xg7 rebuilds just those IDs.
  const onlyFilter = process.env.ASTEROID_ONLY
    ? new Set(process.env.ASTEROID_ONLY.split(',').map((id) => `${id.trim()}${SOURCE_EXTENSION}`))
    : null
  return readdirSync(sourceDir)
    .filter((fileName) => fileName.endsWith(SOURCE_EXTENSION))
    .filter((fileName) => !onlyFilter || onlyFilter.has(fileName))
    .sort()
    .map((fileName) => join(sourceDir, fileName))
}

/**
 * Strips per-vertex normals so a subsequent {@link weld} step can dedupe by
 * position alone. The pipeline regenerates smooth normals afterwards.
 *
 * @returns {import('@gltf-transform/core').Transform} glTF Transform step.
 */
function stripNormalsForResmooth() {
  return createTransform('stripNormalsForResmooth', (document) => {
    for (const mesh of document.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        primitive.setAttribute('NORMAL', null)
      }
    }
  })
}

/**
 * Computes smooth per-vertex normals on indexed primitives in-place.
 *
 * `@gltf-transform/functions`' built-in `normals` un-indexes the geometry and
 * writes per-face normals (visible faceting). This implementation preserves
 * the index buffer and averages adjacent face normals at each shared vertex,
 * yielding smooth shading on welded asteroid meshes.
 *
 * @returns {import('@gltf-transform/core').Transform} glTF Transform step.
 */
function smoothNormalsTransform() {
  return createTransform('smoothNormalsTransform', (document) => {
    for (const mesh of document.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const indices = primitive.getIndices()
        const positions = primitive.getAttribute('POSITION')
        if (!indices || !positions) continue

        const idx = indices.getArray()
        const pos = positions.getArray()
        const vertCount = positions.getCount()
        const normals = new Float32Array(vertCount * 3)
        const triCount = idx.length / 3

        for (let t = 0; t < triCount; t++) {
          const a = idx[t * 3]
          const b = idx[t * 3 + 1]
          const c = idx[t * 3 + 2]
          const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2]
          const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2]
          const cx = pos[c * 3], cy = pos[c * 3 + 1], cz = pos[c * 3 + 2]
          const ux = bx - ax, uy = by - ay, uz = bz - az
          const vx = cx - ax, vy = cy - ay, vz = cz - az
          const nx = uy * vz - uz * vy
          const ny = uz * vx - ux * vz
          const nz = ux * vy - uy * vx
          normals[a * 3] += nx; normals[a * 3 + 1] += ny; normals[a * 3 + 2] += nz
          normals[b * 3] += nx; normals[b * 3 + 1] += ny; normals[b * 3 + 2] += nz
          normals[c * 3] += nx; normals[c * 3 + 1] += ny; normals[c * 3 + 2] += nz
        }

        for (let v = 0; v < vertCount; v++) {
          const x = normals[v * 3]
          const y = normals[v * 3 + 1]
          const z = normals[v * 3 + 2]
          const len = Math.hypot(x, y, z) || 1
          normals[v * 3] = x / len
          normals[v * 3 + 1] = y / len
          normals[v * 3 + 2] = z / len
        }

        const accessor = document
          .createAccessor()
          .setArray(normals)
          .setType('VEC3')
        primitive.setAttribute('NORMAL', accessor)
      }
    }
  })
}

/**
 * Removes texture dependencies and assigns one neutral material to all primitives.
 *
 * @returns {import('@gltf-transform/core').Transform} glTF Transform step.
 */
function stripTexturesAndUseRuntimeMaterial() {
  return createTransform('stripTexturesAndUseRuntimeMaterial', (document) => {
    const root = document.getRoot()
    const runtimeMaterial = document
      .createMaterial(NORMALIZED_MATERIAL_NAME)
      .setBaseColorFactor([1, 1, 1, 1])
      .setRoughnessFactor(0.85)
      .setMetallicFactor(0)
      .setDoubleSided(true)

    for (const mesh of root.listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        primitive.setMaterial(runtimeMaterial)
        primitive.setAttribute('TANGENT', null)
      }
    }

    for (const material of root.listMaterials()) {
      if (material !== runtimeMaterial) {
        material.dispose()
      }
    }

    for (const texture of root.listTextures()) {
      texture.dispose()
    }

    for (const extension of root.listExtensionsUsed()) {
      if (extension.extensionName.includes('materials') || extension.listProperties().length === 0) {
        extension.dispose()
      }
    }
  })
}

/**
 * Fits the default scene to reference bounds with one wrapper node transform.
 *
 * @param {{ min: number[]; max: number[] }} referenceBounds - Bounds to match.
 * @returns {import('@gltf-transform/core').Transform} glTF Transform step.
 */
function fitToReferenceBounds(referenceBounds) {
  return createTransform('fitToReferenceBounds', (document) => {
    const root = document.getRoot()
    const scene = root.getDefaultScene() ?? root.listScenes()[0]
    if (!scene) {
      throw new Error('Cannot normalize a GLB without a scene.')
    }

    const sourceBounds = getBounds(scene)
    const fit = computeReferenceFit(sourceBounds, referenceBounds)
    const originalChildren = scene.listChildren()
    const wrapper = document
      .createNode('asteroidReferenceFit')
      .setScale([fit.scale, fit.scale, fit.scale])
      .setTranslation(fit.translation)

    for (const child of originalChildren) {
      scene.removeChild(child)
      wrapper.addChild(child)
    }
    scene.addChild(wrapper)
  })
}

/**
 * Normalizes one asteroid GLB to the output path.
 *
 * @param {NodeIO} io - glTF Transform IO instance.
 * @param {{ min: number[]; max: number[] }} referenceBounds - Bounds to match.
 * @param {string} inputPath - Source GLB path.
 * @param {string} outputPath - Destination GLB path.
 * @returns {Promise<void>} Resolves after writing the normalized GLB.
 */
async function normalizeAsteroidGlb(io, referenceBounds, inputPath, outputPath) {
  const document = await io.read(inputPath)
  const sourceTriangles = countDocumentTriangles(document)
  console.info(`[${basename(inputPath)}] source triangles: ${sourceTriangles}`)
  const targetTriangles = Number(process.env.ASTEROID_TARGET_TRIANGLES ?? DEFAULT_TARGET_TRIANGLES)
  const ratio = Math.min(1, targetTriangles / Math.max(1, sourceTriangles))
  const error = Number(process.env.ASTEROID_SIMPLIFY_ERROR ?? DEFAULT_SIMPLIFY_ERROR)

  await MeshoptSimplifier.ready
  const preserveTextures = process.env.ASTEROID_PRESERVE_TEXTURES === '1'
  // When preserving textures, skip the simplify+resmooth pass entirely. Both
  // steps can puncture holes: simplify collapses border vertices on multi-
  // submesh GLBs (UV seams, material splits), and stripping normals before
  // weld destroys the authored UV-aware welds, leaving cracks at seams. The
  // procedural-material path still simplifies because it owns the look and
  // can tolerate the topology damage.
  const transforms = preserveTextures
    ? [
        center({ pivot: 'center' }),
        fitToReferenceBounds(referenceBounds),
        dedup(),
        flatten(),
        prune({
          keepAttributes: true,
          keepIndices: true,
          keepLeaves: true,
          keepSolidTextures: true,
        }),
        sparse(),
      ]
    : [
        stripTexturesAndUseRuntimeMaterial(),
        center({ pivot: 'center' }),
        fitToReferenceBounds(referenceBounds),
        dedup(),
        flatten(),
        // lockBorder: true keeps submesh borders intact so simplify can't
        // open seams between primitives.
        simplify({ simplifier: MeshoptSimplifier, ratio, error, lockBorder: true }),
        stripNormalsForResmooth(),
        weld(),
        smoothNormalsTransform(),
        prune({ keepAttributes: true, keepIndices: true, keepLeaves: true }),
        sparse(),
      ]
  await document.transform(...transforms)
  const finalTriangles = countDocumentTriangles(document)
  console.info(`[${basename(inputPath)}] final triangles:  ${finalTriangles}`)

  await io.write(outputPath, document)
}

/**
 * Runs the asteroid normalization pipeline.
 *
 * @param {string} sourceDir - Directory containing source `astro_*.glb` files.
 * @param {string} outputDir - Directory to receive normalized GLBs.
 * @param {string} referencePath - Reference GLB whose bounds define output fit.
 * @returns {Promise<void>} Resolves after all asteroid GLBs are written.
 */
export async function main(sourceDir = SOURCE_DIR, outputDir = OUTPUT_DIR, referencePath = REFERENCE_MODEL) {
  mkdirSync(outputDir, { recursive: true })

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

  const referenceDocument = await io.read(referencePath)
  const referenceScene =
    referenceDocument.getRoot().getDefaultScene() ?? referenceDocument.getRoot().listScenes()[0]
  if (!referenceScene) {
    throw new Error(`Reference GLB has no scene: ${referencePath}`)
  }
  const referenceBounds = getBounds(referenceScene)

  for (const inputPath of listSourceGlbs(sourceDir)) {
    const outputPath = join(outputDir, outputNameForInput(inputPath))
    await normalizeAsteroidGlb(io, referenceBounds, inputPath, outputPath)
    console.info(`Wrote ${outputPath}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
