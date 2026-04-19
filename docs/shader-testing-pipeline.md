# Shader testing pipeline

This project now validates GLSL shader sources in two ways:

- `bun run lint:shaders` compiles every shader in `src/three/shaders` with `glslx`.
- `bun run test:shaders` runs Vitest coverage for the same compile checks.

## How it works

The pipeline composes each shader with required runtime chunks before compiling:

- `src/three/shaders/threejs-stubs.glsl` for Three.js-provided symbols.
- `src/three/shaders/common.glsl` prepended for fragment shaders.

This matches runtime assembly (`common.glsl + fragment shader`) while keeping syntax/type checks in CI and local development.
