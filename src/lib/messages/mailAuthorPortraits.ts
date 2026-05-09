/**
 * Portrait URLs for ShipNet message senders, keyed by the exact {@link ShipMessageDefinition.from}
 * string shown in the mail reader.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-20-contracts-design.md
 */

/** URL directory for assets in `public/portraits/` (served from site root). */
export const MAIL_AUTHOR_PORTRAIT_BASE_PATH = '/portraits'

/**
 * Maps sender display lines to portrait filenames under {@link MAIL_AUTHOR_PORTRAIT_BASE_PATH}.
 * Keys must match catalog JSON / contract definitions exactly.
 */
export const MAIL_AUTHOR_PORTRAIT_BY_FROM: Readonly<Record<string, string>> = {
  'Jay Mercer': `${MAIL_AUTHOR_PORTRAIT_BASE_PATH}/jay.webp`,
  'Marta Vale, Vale Orbital Refurb': `${MAIL_AUTHOR_PORTRAIT_BASE_PATH}/marta.webp`,
  'Col. Hélder Sampaio, MMC (Engineering & Mining Liaison)': `${MAIL_AUTHOR_PORTRAIT_BASE_PATH}/sampaio.webp`,
  'Space Consortium — Logistics Division': `${MAIL_AUTHOR_PORTRAIT_BASE_PATH}/usc.webp`,
  'United Space Consortium — Logistics Division': `${MAIL_AUTHOR_PORTRAIT_BASE_PATH}/usc.webp`,
  'USC — Operator Relations': `${MAIL_AUTHOR_PORTRAIT_BASE_PATH}/usc.webp`,
  'USC — Operator Relations, Sol Sector': `${MAIL_AUTHOR_PORTRAIT_BASE_PATH}/usc.webp`,
  'Vance Holroyd, Senior Asset Officer (Cloud City)': `${MAIL_AUTHOR_PORTRAIT_BASE_PATH}/hoyt.webp`,
  'Lucas Maverick, Exchange Floor Boss': `${MAIL_AUTHOR_PORTRAIT_BASE_PATH}/maverick.webp`,
  'Lucas Maverick, Owner — Venusian Zeppelin Exchange': `${MAIL_AUTHOR_PORTRAIT_BASE_PATH}/maverick.webp`,
  'The Cinderline, at The Anvil': `${MAIL_AUTHOR_PORTRAIT_BASE_PATH}/cinderline.webp`,
  'Mr. Finch, Saturn Ringside Estate': `${MAIL_AUTHOR_PORTRAIT_BASE_PATH}/finch.webp`,
  'Dean Bernard Porter': `${MAIL_AUTHOR_PORTRAIT_BASE_PATH}/bernard.webp`,
  'Dean Bernard Porter, Ceres Institute': `${MAIL_AUTHOR_PORTRAIT_BASE_PATH}/bernard.webp`,
  'Carmen Sedna-Deimos · Neptune Commune': `${MAIL_AUTHOR_PORTRAIT_BASE_PATH}/carmen.webp`,
  'Fantasia Mira-Io': `${MAIL_AUTHOR_PORTRAIT_BASE_PATH}/fantasia.webp`,
}

/**
 * Returns the portrait URL for a mail `from` line, or `null` when no artwork exists.
 *
 * @param from Sender label from {@link ShipMessageDefinition.from}.
 * @returns Absolute site path to a `.webp` portrait, or `null`.
 */
export function resolveMailAuthorPortraitHref(from: string): string | null {
  const href = MAIL_AUTHOR_PORTRAIT_BY_FROM[from]
  return href ?? null
}
