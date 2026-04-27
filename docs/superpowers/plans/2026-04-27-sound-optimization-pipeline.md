# Sound Optimization Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable `ffmpeg` pipeline that optimizes raw `sound/` MP3 files into `public/sound/`.

**Architecture:** A focused Node ESM script owns scanning, preset selection, process execution, and reporting. Helper functions are exported for unit coverage without shelling out to `ffmpeg`.

**Tech Stack:** Bun scripts, Node ESM, `ffmpeg`, Vitest.

---

## File Structure

- Create `scripts/optimize-sound.mjs`: scans source MP3s, maps output paths, selects presets, runs `ffmpeg`, and prints size savings.
- Create `scripts/__tests__/optimize-sound.spec.ts`: verifies helper behavior and candidate-size selection without invoking `ffmpeg`.
- Modify `package.json`: adds `sound:build`.

## Tasks

### Task 1: Tests

**Files:**
- Create: `scripts/__tests__/optimize-sound.spec.ts`

- [ ] Write tests for category preset selection.
- [ ] Write tests for output path mapping.
- [ ] Write tests for byte formatting.
- [ ] Write tests for keeping the source when an encoded candidate is not smaller.
- [ ] Run `bun test:unit scripts/__tests__/optimize-sound.spec.ts` and verify it fails because `scripts/optimize-sound.mjs` does not exist yet.

### Task 2: Script

**Files:**
- Create: `scripts/optimize-sound.mjs`

- [ ] Add documented constants for `sound/`, `public/sound/`, `.mp3`, and category presets.
- [ ] Add exported helpers: `presetForFileName`, `outputPathForInput`, `formatBytes`, and `shouldUseOptimizedCandidate`.
- [ ] Add recursive MP3 discovery.
- [ ] Add `ffmpeg` execution with `-y`, `-vn`, `libmp3lame`, `-b:a`, and `-ac` into a temporary candidate path.
- [ ] Compare candidate size to source size, then keep the candidate only when it is smaller.
- [ ] Add clear process failure errors.
- [ ] Run the focused test command and verify it passes.

### Task 3: Package Command

**Files:**
- Modify: `package.json`

- [ ] Add `"sound:build": "node scripts/optimize-sound.mjs"`.
- [ ] Run `bun run sound:build`.
- [ ] Run `bun run lint`, `bun run type-check`, and `bun run test:unit`.

## Self-Review

The plan covers the spec goals: source-to-public generation, filename presets,
size reporting, larger-candidate protection, clear failures, package command,
and unit coverage. No manifest, format conversion, or stale-output cleanup is
included.
