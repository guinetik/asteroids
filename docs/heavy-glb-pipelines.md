# Heavy runtime GLB pipelines

Authoring stays under **`3d/`**; **`bun run models:heavy-runtime:build`** (or individual `models:<name>:build` scripts) writes **`public/models/`** for Vite/`loadGLB` URLs.

## Bootstrap (`3d/` missing)

```bash
bun run models:bootstrap-heavy-sources
```

Copies from `public/models/` → `3d/` when absent: `bed.glb`, `table.glb`, `city.glb`, `asteroid.glb`, `virus.glb`.

## One-shot batch

```bash
bun run models:heavy-runtime:build
```

Runs bootstrap, then `gltf-transform optimize` for habitat / intro / mission props, then **`models:virus:build`** (custom Node pipeline — see [`virus-glb-pipeline.md`](./virus-glb-pipeline.md)).

## Per-asset scripts

| Bun script | `3d/` input | `public/` output |
|------------|-------------|------------------|
| `models:bed:build` | `bed.glb` | `bed.glb` |
| `models:table:build` | `table.glb` | `table.glb` |
| `models:city:build` | `city.glb` | `city.glb` |
| `models:asteroid:build` | `asteroid.glb` | `asteroid.glb` (`normalize-asteroid-glbs.mjs` uses this as bbox reference — re-run **`models:asteroids:normalize`** if you materially change bounds) |
| `models:hubble:build` | `hubble_rigged.glb` | `hubble.glb` |
| `models:voyager:build` | `voyager_rigged.glb` | `voyager.glb` |
| `models:satellite:build` | `satellite.glb` | `satellite.glb` |
| `models:virus:build` | `virus.glb` | `virus.glb` |

## Already documented elsewhere

- **Shuttle assembled mesh:** [`space-shuttle-glb-pipeline.md`](./space-shuttle-glb-pipeline.md) + `bun run models:shuttle:merge`.
- **Lander / multitool** (selective simplify): [`lander-glb-pipeline.md`](./lander-glb-pipeline.md), [`multitool-glb-pipeline.md`](./multitool-glb-pipeline.md).
- **Instanced asteroid belt chunks:** [`asteroids-glb-pipeline.md`](./asteroids-glb-pipeline.md) + `models:asteroids:build`.
- **Per-mission normalized asteroids:** [`asteroid-glb-normalization-pipeline.md`](./asteroid-glb-normalization-pipeline.md) + `models:asteroids:normalize`.

## Smaller props (no dedicated row above)

Files like **`hostage.glb`**, **`nest.glb`**, **`hektor.glb`**, **`eng.glb` / `rcs.glb`** (shuttle merge inputs) are lighter; add a `gltf-transform optimize` line in `package.json` if they grow past ~500 KB and need the same treatment.
