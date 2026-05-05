/**
 * Shared parser that splits a free-form prompt string (e.g.
 * `"[E] OPEN PROSPECTUS"`, `"Q GRAVITY SURF"`, `"START MAINTENANCE [V]"`,
 * `"F  Shuttle Control"`) into a `{key, label}` tuple suitable for the
 * standardized {@link KeyPrompt} component.
 *
 * When the string contains no parseable key binding (status banners
 * like `"RELEASING SURVIVORS"`), `key` is returned empty so the prompt
 * renders as a label-only pill — no spurious `[?]` keycap.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-key-prompt-standardization.md
 */

/** Result of parsing a prompt string. */
export interface ParsedKeyPrompt {
  /** Key cap text (e.g. `E`, `Q`, `LMB`, `ESC`). Empty when no key found. */
  key: string
  /** Human-readable action label, with any bracket/key prefix stripped. */
  label: string
}

/**
 * Tokens accepted as legitimate key prefixes when no brackets are
 * present. Single-letter A-Z is implicit; this list covers the
 * multi-character specials used in the codebase.
 */
const KEY_TOKENS = new Set([
  'LMB',
  'RMB',
  'MMB',
  'ESC',
  'TAB',
  'SHIFT',
  'CTRL',
  'ALT',
  'SPACE',
  'ENTER',
])

/** Single uppercase letter key (the most common binding pattern). */
const SINGLE_LETTER = /^[A-Z]$/

/**
 * Parse a free-form prompt string into a {@link ParsedKeyPrompt}.
 * Recognizes (in priority order):
 *   1. `[KEY] LABEL` — bracketed key prefix (e.g. `[E] OPEN PROSPECTUS`)
 *   2. `LABEL [KEY]` — bracketed key suffix (e.g. `EVA [V]`)
 *   3. `KEY LABEL` — unbracketed prefix where KEY is a single uppercase
 *      letter or a known modifier/mouse token (e.g. `Q GRAVITY SURF`,
 *      `F  Shuttle Control`, `LMB grab table`)
 * Anything else is returned as `{key: '', label: raw}` so the UI can
 * render it as a status banner without a keycap.
 *
 * @param raw - The prompt string to parse, or null.
 * @returns Parsed `{key, label}`, or null when `raw` is null/empty.
 */
export function parseKeyPrompt(raw: string | null | undefined): ParsedKeyPrompt | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  const prefix = trimmed.match(/^\[([^\]]+)\]\s*(.+)$/)
  if (prefix) return { key: prefix[1]!.trim(), label: prefix[2]!.trim() }

  const suffix = trimmed.match(/^(.+?)\s*\[([^\]]+)\]\s*$/)
  if (suffix) return { key: suffix[2]!.trim(), label: suffix[1]!.trim() }

  const spaced = trimmed.match(/^(\S+)\s+(.+)$/)
  if (spaced) {
    const candidate = spaced[1]!
    const upper = candidate.toUpperCase()
    if (SINGLE_LETTER.test(candidate) || KEY_TOKENS.has(upper)) {
      return { key: candidate, label: spaced[2]!.trim() }
    }
  }

  return { key: '', label: trimmed }
}
