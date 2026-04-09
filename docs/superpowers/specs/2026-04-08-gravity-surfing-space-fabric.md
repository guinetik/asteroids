# Gravity Surfing & Space Fabric gating

**Summary:** The solar-map Space Fabric overlay is locked until the player owns the **Gravity Surfing** upgrade. That upgrade lives in `src/data/upgrades.json` with `hiddenFromShop: true` so it never appears in the engineering-bay shop; mission or narrative systems can grant it later. Until then, developers can unlock it from the map dev console.

**Dev commands (development builds only):**

- `AsteroidDev.MapView.grantGravitySurfing()` — sets `gravitySurfing` to level 1.
- `AsteroidDev.MapView.setUpgradeLevel('gravitySurfing', 0)` — revoke (hides the toggle and forces fabric off).

**Related code:** `hasGravitySurfingUnlock` in `src/lib/upgrades.ts`, `MapViewController.applyInitialSpaceFabricVisibilityFromUpgrades`, `MapView.vue` Space Fabric button `v-if`.
