# Satellite rig (`satellite_rigged.glb` → servicing)

Authoring **`3d/satellite_rigged.glb`** replaces the merged Sketchfab **`3d/satellite.glb`** so EVA `satellite_servicing` missions can find named sub-objects (`THREE.Object3D.getObjectByName`).

## Manifest names (exact)

Listed in **`src/data/satellite-manifests.json`** under `"satellite"`. Blender object / mesh names must match exactly:

| Name | Typical part |
|------|----------------|
| `satellite_antenna` | Dish |
| `satellite_circuits` | Body electronics |
| `satellite_solar_A` | One solar wing |
| `satellite_solar_B` | Other solar wing |
| `satellite_thruster` | Nozzle |

Extra geometry (`satellite_chassis`, wrappers, Sketchfab leftovers) is fine as long as the five manifest names appear on the glTF scene graph.

## Runtime build

```bash
bun run models:satellite:build
```

Runs **`scripts/build-satellite-glb.mjs`**: prefers **`3d/satellite_rigged.glb`** when present, otherwise falls back with a warning. Uses **`gltf-transform optimize … --join false --flatten false --simplify false`** so the hierarchy and labels survive; then verifies the manifest keys still exist after Meshopt (**`meshoptimizer` `MeshoptDecoder`** reads the compressed output for checks).
