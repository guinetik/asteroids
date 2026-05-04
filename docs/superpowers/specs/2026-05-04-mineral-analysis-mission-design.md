# Mineral Analysis Mission Design

## Goal

Add `mineral-analysis` as a procedural asteroid objective available from every planet and
difficulty band. The mission teaches the existing SCI rock prospecting loop by turning it into a
terminal-driven field assay: analyze rocks, file a report, mine the requested mineral sample, and
deliver it back to the terminal.

## Player Flow

1. Land near the objective terminal.
2. Interact with the terminal to start the assay.
3. Use SCIENCE mode to fully analyze distinct rocks.
4. Return to the terminal to file the analysis report.
5. The terminal selects a sample mineral from the analyzed mineral set.
6. Mine enough kilograms of that mineral from any rock.
7. Deliver the sample to the terminal to complete the objective.

The selected sample mineral is intentionally chosen after report delivery so the request always
comes from the rocks the player actually analyzed.

## Runtime Shape

`MineralAnalysisMinigame` implements the shared `MiniGame` interface and subscribes to
`RockYieldSystem` callbacks:

- `onRockProspected(spawnIndex, itemId)` counts distinct SCI-analyzed rocks.
- `onMineralExtracted(itemId, kg, spawnIndex)` tracks mined sample kilograms.

The objective uses a `TerminalModel` at the mission flat zone, standard tracker steps, and normal
`onComplete` signaling so it composes with other objective types.

## Giver Flavor

Mission templates should stay giver-specific rather than generic:

- Jay treats the work as practical science paperwork with a drill bit.
- Belt Mining Corp treats it as a dry pre-extraction assay.
- Vance frames it as portfolio classification and substrate confidence.
- Cloud City Ops frames it as routine intake validation.
- Cinderline reframes analysis as listening to stone.
- Maverick treats composition as a tell at the table.
- Sampaio treats it as a clipped field assay order.
- Finch treats it as a buyer’s compositional note.

Colonial Guard and Frontier Rescue are not default mineral-analysis givers unless a future variant
reframes the objective as contamination assay or habitat safety work.
