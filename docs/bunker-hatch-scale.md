# Bunker Hatch Scale

The bunker hatch should read as a person-sized metal pipe entrance on uneven asteroid terrain.

The hatch model remains a reusable Three.js prop for both the surface entrance and the bunker
exit. It is not a circular floor door. It is a vertical metal cylinder coming up from the floor,
with the player implied to enter through a door on the side of that cylinder. Its height is tied
to the existing lander collision height, but shortened from the original tall stack so it reads
as a broad bunker entrance instead of a light pole. The pipe starts six units below placement
height so uneven terrain can cover the buried section without exposing the bottom edge. The door
sits above visible ground, while the pipe body is capped and double-sided so it renders correctly
from exterior and interior angles.

Acceptance checks:

- The cylinder is large enough for a suited person to plausibly fit inside.
- The metal pipe is chunky, 16 units across, and extrudes upward from a buried base.
- The pipe uses bright steel coloring with high metalness so it reads as metal, not obsidian.
- A raised, lit side door/frame on the cylinder communicates how the player enters.
- The pipe renders both sides and has a visible top cap.
- The change is visual only; interaction ranges and bunker minigame state stay unchanged.
