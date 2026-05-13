/**
 * Shared sizing for sci-fi inventory category-border slots (Shuttle/table, cargo panel,
 * planet shop Buy column).
 *
 * @author guinetik
 * @date 2026-05-13
 * @spec docs/superpowers/specs/2026-04-03-inventory-system-design.md
 */

/**
 * Edge length of the square slot in CSS pixels (16px browser default).
 *
 * Matches Tailwind `h-12` / `w-12` (`3rem`) when the root font size is untouched.
 *
 * Keep `.inventory-panel` grid first column aligned to this (`3rem`) so rows do not clip.
 */
export const INVENTORY_CATEGORY_SLOT_EDGE_CSS_PIXELS = 48
