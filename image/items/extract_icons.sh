#!/usr/bin/env bash
# Splits 128x128 sprite sheets (2x2 grid) into 64x64 transparent WebP icons.
# Output goes to public/images/items/
set -euo pipefail

SHEETS="D:/Developer/asteroids/tmp/items/sheets"
OUT="D:/Developer/asteroids/public/items"

crop() {
  local sheet="$1" pos="$2" name="$3"
  local offsets=("0+0" "128+0" "0+128" "128+128")
  local off="${offsets[$((pos-1))]}"
  magick "${SHEETS}/${sheet}.png" -crop "128x128+${off}" +repage "${OUT}/${name}.webp"
  echo "  ${sheet}[${pos}] -> ${name}.webp"
}

declare -A SHEETS_MAP
# sheet -> "name1 name2 name3 name4"
SHEETS_MAP[001]="fuel-cell shuttle-fuel-cell viroid-psychosphere grid-coupling-module"
SHEETS_MAP[002]="ceres-canister ceres-mineral-crate ceres-dan-crate yamada-organ-case"
SHEETS_MAP[003]="luxury-foods medicine entertainment-media textiles"
SHEETS_MAP[004]="heat-resistant-alloys solar-panels radiation-shielding thermal-regulators"
SHEETS_MAP[005]="acid-resistant-coatings pressure-vessels sulfuric-compounds atmospheric-filters"
SHEETS_MAP[006]="construction-prefabs iron-composites terraforming-enzymes drill-bits"
SHEETS_MAP[007]="purified-water ice-cores hydroponics-kits filtration-membranes"
SHEETS_MAP[008]="helium-3-cells magnetic-coils atmospheric-samples plasma-conduits"
SHEETS_MAP[009]="cryogenic-coolants superconductors exotic-isotopes frost-compounds"
SHEETS_MAP[010]="navigation-beacons dark-matter-sensors deep-space-probes signal-amplifiers"
SHEETS_MAP[011]="ancient-artifacts void-crystals dark-ice-specimens kuiper-relics"
SHEETS_MAP[012]="sun-forged-glass dense-gas-canisters biocultures cat-food"
SHEETS_MAP[013]="red-soil-ceramics brine-concentrates storm-glass cryo-silicates"
SHEETS_MAP[014]="null-temp-alloys void-wave-emitters shadow-minerals keycard"
SHEETS_MAP[015]="olivine magnetite iron-sulfides carbonates"
SHEETS_MAP[016]="organic-compounds hydrated-silicates pyroxene plagioclase-feldspar"
SHEETS_MAP[017]="iron-nickel-alloy water-ice troilite enstatite"
SHEETS_MAP[018]="carbon-dioxide-ice ammonia-hydrate silicate-dust sodium-chloride"
SHEETS_MAP[019]="basaltic-lava sulfur-deposits iron-oxide carbonaceous-chondrite"
SHEETS_MAP[020]="organic-macromolecules volcanic-glass hydrogel silicone-block"
SHEETS_MAP[021]="ring-ice-crystals exotic-gems resonance-instruments prismatic-dust"

for sheet in $(printf '%s\n' "${!SHEETS_MAP[@]}" | sort); do
  echo "Sheet $sheet:"
  read -ra names <<< "${SHEETS_MAP[$sheet]}"
  for i in 1 2 3 4; do
    crop "$sheet" "$i" "${names[$((i-1))]}"
  done
done

echo "Done — $(ls "$OUT"/*.webp | wc -l) webp files in $OUT"
