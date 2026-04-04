#!/usr/bin/env node
/**
 * Optimizes `3d/lander_from_blender.glb` → `public/models/lander.glb`, matching
 * `gltf-transform optimize` but skipping mesh simplification for:
 * - Antenna Front (`Antennas_Lunar Lander_0.001`)
 * - All RCS thruster meshes (`Thrusters_Lunar Lander_0…`)
 *
 * Uses selective {@link simplifyPrimitive} for everything else. See docs/lander-glb-pipeline.md.
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

const INPUT = join(REPO_ROOT, '3d', 'lander_from_blender.glb');
const OUTPUT = join(REPO_ROOT, 'public', 'models', 'lander.glb');

/** Mesh names that must not be decimated (Blender object / mesh naming). */
function shouldPreserveMeshSimplify(meshName) {
  if (meshName === 'Antennas_Lunar Lander_0.001') {
    return true;
  }
  if (meshName.startsWith('Thrusters_Lunar Lander_0')) {
    return true;
  }
  return false;
}

/**
 * Same primitive filter as {@link simplify}, but only for meshes that are not preserved.
 * @param {{ ratio: number; error: number; lockBorder?: boolean }} opts
 * @returns {import('@gltf-transform/core').Transform}
 */
function selectiveSimplify(opts) {
  return createTransform('selectiveSimplify', async (document) => {
    await MeshoptSimplifier.ready;
    await document.transform(weld({ overwrite: false }));

    const simplifyOpts = {
      simplifier: MeshoptSimplifier,
      ratio: opts.ratio,
      error: opts.error,
      lockBorder: opts.lockBorder ?? false,
    };

    for (const mesh of document.getRoot().listMeshes()) {
      const name = mesh.getName();
      if (shouldPreserveMeshSimplify(name)) {
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

  const ratio = Number(process.env.LANDER_SIMPLIFY_RATIO ?? 0.58);
  const error = Number(process.env.LANDER_SIMPLIFY_ERROR ?? 0.001);
  const textureSize = Number(process.env.LANDER_TEXTURE_SIZE ?? 2048);

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
