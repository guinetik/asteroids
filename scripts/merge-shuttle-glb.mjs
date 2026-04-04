#!/usr/bin/env node
/**
 * Merge NASA split Shuttle GLBs into a single file using glTF Transform CLI.
 * Prerequisite: door GLBs need `SHUT-DOO.JPG` and `SHUT-DOA.JPG` beside them in
 * `public/models/` (or embedded GLBs). See docs/space-shuttle-glb-pipeline.md.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {string} */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** glTF Transform CLI entry (local devDependency). */
const GLTF_TRANSFORM_CLI = join(
  REPO_ROOT,
  'node_modules',
  '@gltf-transform',
  'cli',
  'bin',
  'cli.js',
);

const MODEL_DIR = join(REPO_ROOT, 'public', 'models');

/** Input GLBs in merge order: main body first, then add-on parts. */
const SHUTTLE_INPUTS = [
  'Space Shuttle (D).glb',
  'Space Shuttle (D) door-prt.glb',
  'Space Shuttle (D) door-stb.glb',
  'Space Shuttle (D) eng.glb',
  'Space Shuttle (D) rcs.glb',
];

/** JPEGs required on disk for door GLBs that reference external URIs. */
const DOOR_TEXTURE_DEPS = ['SHUT-DOO.JPG', 'SHUT-DOA.JPG'];

const DEFAULT_OUTPUT = 'shuttle.glb';

/**
 * @param {string} message
 * @returns {void}
 */
function fail(message) {
  console.error(`merge-shuttle-glb: ${message}`);
  process.exit(1);
}

/**
 * Parse `--output <path>` from argv; defaults under public/models.
 * @param {string[]} argv
 * @returns {string} Absolute path to output GLB
 */
function resolveOutputPath(argv) {
  const outIdx = argv.indexOf('--output');
  if (outIdx !== -1 && argv[outIdx + 1]) {
    return resolve(REPO_ROOT, argv[outIdx + 1]);
  }
  return join(MODEL_DIR, DEFAULT_OUTPUT);
}

/**
 * Ensure door piece dependencies exist when those inputs are used.
 * @param {string[]} inputPaths
 * @returns {void}
 */
function assertDoorTexturesIfNeeded(inputPaths) {
  const needsDoors = inputPaths.some((p) => /door-(prt|stb)\.glb$/i.test(p));
  if (!needsDoors) {
    return;
  }
  const missing = DOOR_TEXTURE_DEPS.map((f) => join(MODEL_DIR, f)).filter((p) => !existsSync(p));
  if (missing.length > 0) {
    fail(
      `Missing door textures (place NASA files next to door GLBs):\n  ${missing.join('\n  ')}\n` +
        'Or embed images in the door GLBs first. See docs/space-shuttle-glb-pipeline.md.',
    );
  }
}

/**
 * Run `gltf-transform merge` with merged scenes.
 * @returns {void}
 */
function main() {
  const argv = process.argv.slice(2);
  if (!existsSync(GLTF_TRANSFORM_CLI)) {
    fail(`CLI not found at ${GLTF_TRANSFORM_CLI}. Run bun install.`);
  }

  const inputPaths = SHUTTLE_INPUTS.map((f) => join(MODEL_DIR, f));
  for (const p of inputPaths) {
    if (!existsSync(p)) {
      fail(`Input not found: ${p}`);
    }
  }

  assertDoorTexturesIfNeeded(inputPaths);

  const outputPath = resolveOutputPath(argv);
  const outDir = dirname(outputPath);
  if (!existsSync(outDir)) {
    fail(`Output directory does not exist: ${outDir}`);
  }

  const args = [
    GLTF_TRANSFORM_CLI,
    'merge',
    ...inputPaths,
    outputPath,
    '--merge-scenes',
  ];

  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    fail(`gltf-transform exited with code ${result.status ?? 'unknown'}.`);
  }

  console.info(`Wrote ${outputPath}`);
}

main();
