# Texture WebP pipeline

**Date:** 2026-04-28  
**Author:** guinetik  
**Status:** Design

## Summary

Raster sources authored under `image/textures/`, `image/telescope/`, and optionally
top-level `image/texture.jpg` are converted into WebP files under mirror paths in
`public/` via `magick` (ImageMagick).

## Duplicate files

When the same basename exists as both `.jpg` and `.png` in one folder (for example Psyche
packs shipping alternates), the pipeline prefers **`jpg → jpeg → png`** so loaders can
assume a single file per conventional name after conversion (`color.webp`,
`normal.webp`, …).

## Cleaning

After a `.webp` is written, leftover `.jpg`, `.jpeg`, and `.png` with the **same basename**
under that `public/` directory are deleted so authored sources in `image/` remain the sole
truth for regeneration.

## Size cap (`1MiB`)

Each emitted `.webp` must be **≤ 1 MiB** (`1024 × 1024` bytes). The script:

1. **PNG**: tries **lossless** WebP once; if that file is larger than the cap, it retries with
   **lossy** passes.
2. **Every source**: walks **`-quality`** from **85** down to **10** in steps of **5** until the
   output fits the ceiling.
3. If still too large, it writes temporary **JPEG** intermediates using ImageMagick
   **`-thumbnail NxN>`** with **N** in **`[2048, 1536, 1024]`** (each pass resamples from the
   original `image/` file, not from the previous thumb) and reruns the quality ladder after each
   resize. A **warning** is printed only if the file is still above the cap after all tiers.
