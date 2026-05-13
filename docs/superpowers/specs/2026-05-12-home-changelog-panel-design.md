# Home Changelog Panel Design

**Date:** 2026-05-12
**Status:** Implemented in this pass

## Goal

When the `index.html` prelude title-screen canvas finishes its playable loading beat
and exposes the `PLAY` button, show a top-right `Change Log` panel. The panel should
be data-driven so future updates can be added without editing the prelude markup.

## Data Shape

Changelog entries live in `public/data/changelog/home-updates.json` so the prelude
can fetch them before the Vue app has mounted. Each entry has:

- `title`: release title shown in the card header.
- `date`: human-readable release date shown under the title.
- `backgroundImage`: public asset URL used as the card image.
- `description`: short release summary.
- `changes`: bullet list of player-facing changes.

The first entry is `The Habitat Update`, covering the new walkable habitat, Sushi care,
furniture/props, and bringing Pimp My Ride cosmetics into the living space. Its date
is `May 13, 2026`.

The second entry is `Pimp My Ride Update`, dated `May 05, 2026`, introducing Fantasia's
cosmetics shop, paint jobs, thruster trails, and title flair.

The third entry is `Launch Update`, dated `May 01, 2026`, using the OG image and
summarizing the full planetary orrery, gravity flight, procedural asteroid landings,
asteroid science, and story/lore discovery.

## UI Behavior

The prelude script in `index.html` fetches the JSON when the canvas game starts. The
panel stays hidden while the player is still falling/landing, then becomes visible
from the same `_showReadyUi()` path that reveals the title and `PLAY` button.

The panel is fixed to the top-right of the title-screen canvas layer. Its scroll
container is sized so roughly two changelog cards are visible before scrolling. Empty,
missing, or malformed entries simply render no cards and never block the prelude.
Cards should stay teaser-length: one short description and a few bullets, not the full
release notes.

## Testing

Verification covers `bun run type-check`, `bun run lint`, and `bun run test:unit`.
Manual browser verification should confirm the panel appears over the prelude canvas
when the title and `PLAY` button appear.
