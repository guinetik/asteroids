#!/usr/bin/env node
/**
 * Optimizes `3d/multitool.glb` → `public/models/multitool.glb`, matching
 * `gltf-transform optimize` but skipping mesh simplification for meshes
 * attached to gameplay nodes (LEDs, trigger, lock).
 *
 * Node names are matched after Blender export; the source file may use
 * `pistal_led_back_left` (typo) — both spellings are preserved for simplification skip.
 *
 * @see docs/multitool-glb-pipeline.md
 */

import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  INSTANCE_DEFAULTS,
  PALETTE_DEFAULTS,
  createTransform,
  dedup,
  flatten,
  instance,
  meshopt,
  palette,
  prune,
  resample,
  simplifyPrimitive,
  sparse,
  textureCompress,
  weld,
} from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

import { ready as keyframeReady, resample as keyframeResample } from 'keyframe-resample';

/** @type {string} */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const INPUT = join(REPO_ROOT, '3d', 'multitool.glb');
const OUTPUT = join(REPO_ROOT, 'public', 'models', 'multitool.glb');

/** glTF node names whose meshes must not be decimated (gameplay attach points). */
const PRESERVED_NODE_NAMES = new Set([
  'pistal_led_back_left',
  'pistol_led_back_left',
  'pistol_led_back_right',
  'pistol_led_front',
  'pistol_power_indicator_1',
  'pistol_power_indicator_2',
  'pistol_trigger',
  'pistol_trigger_lock',
]);

/**
 * Meshes referenced by preserved nodes (by identity), so simplification skips them
 * even when mesh names are generic Blender splits (`pistol001_02 - Default_0.00x`).
 *
 * @param {import('@gltf-transform/core').Document} document
 * @returns {Set<import('@gltf-transform/core').Mesh>}
 */
function meshesForPreservedNodes(document) {
  const meshes = new Set();
  for (const node of document.getRoot().listNodes()) {
    if (!PRESERVED_NODE_NAMES.has(node.getName())) {
      continue;
    }
    const mesh = node.getMesh();
    if (mesh) {
      meshes.add(mesh);
    }
  }
  return meshes;
}

/**
 * Same primitive filter as {@link simplify}, but only for meshes that are not preserved.
 *
 * @param {{ ratio: number; error: number; lockBorder?: boolean }} opts
 * @returns {import('@gltf-transform/core').Transform}
 */
function selectiveSimplify(opts) {
  return createTransform('selectiveSimplify', async (document) => {
    await MeshoptSimplifier.ready;
    await document.transform(weld({ overwrite: false }));

    const preservedMeshes = meshesForPreservedNodes(document);

    const simplifyOpts = {
      simplifier: MeshoptSimplifier,
      ratio: opts.ratio,
      error: opts.error,
      lockBorder: opts.lockBorder ?? false,
    };

    for (const mesh of document.getRoot().listMeshes()) {
      if (preservedMeshes.has(mesh)) {
        continue;
      }
      for (const prim of mesh.listPrimitives()) {
        const mode = prim.getMode();
        if (
          mode !== Primitive.Mode.TRIANGLES &&
          mode !== Primitive.Mode.TRIANGLE_STRIP &&
          mode !== Primitive.Mode.TRIANGLE_FAN &&
          mode !== Primitive.Mode.POINTS
        ) {
          continue;
        }
        simplifyPrimitive(prim, simplifyOpts);
      }
    }
  });
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
async function main(inputPath, outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
    });

  await MeshoptEncoder.ready;

  const document = await io.read(inputPath);

  const ratio = Number(process.env.MULTITOOL_SIMPLIFY_RATIO ?? 0.58);
  const error = Number(process.env.MULTITOOL_SIMPLIFY_ERROR ?? 0.001);
  const textureSize = Number(process.env.MULTITOOL_TEXTURE_SIZE ?? 2048);

  const transforms = [
    dedup(),
    instance({ min: INSTANCE_DEFAULTS.min }),
    palette({ min: PALETTE_DEFAULTS.min, keepAttributes: true }),
    flatten(),
    weld(),
    selectiveSimplify({ ratio, error, lockBorder: false }),
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
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  ];

  for (const t of transforms) {
    await document.transform(t);
  }

  await io.write(outputPath, document);
  console.info(`Wrote ${outputPath}`);
}

const inputPath = process.argv[2] ? resolve(REPO_ROOT, process.argv[2]) : INPUT;
const outputPath = process.argv[3] ? resolve(REPO_ROOT, process.argv[3]) : OUTPUT;

main(inputPath, outputPath).catch((err) => {
  console.error(err);
  process.exit(1);
});
