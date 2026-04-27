# Sound Optimization Pipeline

**Date:** 2026-04-27
**Author:** guinetik
**Status:** Design

## Summary

Raw MP3 files live in `sound/`. The runtime assets served by Vite live in
`public/sound/`. This spec adds a Bun-invoked Node script that uses the local
`ffmpeg` executable to rebuild optimized runtime MP3s from the raw source folder.

## Goals

- Keep `sound/` as the editable source of truth for audio.
- Generate optimized MP3s into `public/sound/` with deterministic names.
- Use filename categories for sensible audio quality defaults.
- Print before and after file sizes so asset savings are visible.
- Never replace a runtime asset with an encoded candidate that is larger than
  the source file.
- Fail clearly when `ffmpeg` is not installed or an input file cannot be processed.

## Non-Goals

- Converting to Ogg, WAV, or WebM.
- Generating a sound manifest for game code.
- Deleting old files from `public/sound/` that no longer exist in `sound/`.
- Per-file tuning through a separate config manifest.

## Pipeline

The script scans `sound/**/*.mp3`, preserves relative paths, and writes each
output to `public/sound/<relative-path>`.

Category presets are selected by filename:

- `ambient.*`, `level_*`, and `theme`: stereo MP3 at `128k`.
- `jay-*` and `marta-*`: mono MP3 at `96k`.
- `sfx.*` and `ui.*`: mono MP3 at `64k`.
- Unknown MP3 names use mono MP3 at `96k`.

Each file is rebuilt to a temporary candidate with `ffmpeg -y -i <input> -vn
-codec:a libmp3lame -b:a <bitrate> -ac <channels> <temp-output>`. If the
candidate is smaller than the source, it replaces the runtime output. If the
candidate is the same size or larger, the source file is copied to the runtime
output instead.

## Developer Workflow

Run `bun run sound:build`. The command calls `node scripts/optimize-sound.mjs`.

The script exports small helper functions so Vitest can verify category preset
selection, output path mapping, and byte-size formatting without invoking
`ffmpeg`.

## Testing

Unit tests cover:

- Category preset selection for music, voice, UI, SFX, and fallback filenames.
- Output path mapping from `sound/` to `public/sound/`.
- Human-readable byte-size formatting for script output.
- Candidate-size selection so already-small sources are not inflated.

Manual verification is `bun run sound:build`, followed by the repo quality bar:
`bun run lint`, `bun run type-check`, and `bun run test:unit`.
