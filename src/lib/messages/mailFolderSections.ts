/**
 * Builds grouped mail-folder section view models for the shuttle control inbox.
 *
 * @author guinetik
 * @date 2026-04-29
 * @spec docs/superpowers/specs/2026-04-29-shuttle-mail-contract-sections-design.md
 */
import type { ShipMessageFolder, ShipMessageInboxRow } from './messageTypes'

/** Input for deriving expandable mail-folder sections. */
export interface BuildMailFolderSectionsInput {
  /** Visible folders in display order, such as Inbox followed by contract folders. */
  folders: readonly ShipMessageFolder[]
  /** Folder-id keyed message rows, usually sourced from `MessageSystem.listInboxRows(folderId)`. */
  rowsByFolderId: Readonly<Record<string, readonly ShipMessageInboxRow[]>>
  /** Folder ids the player has explicitly expanded in the current UI session. */
  expandedFolderIds: ReadonlySet<string>
  /** Currently selected message id, or `null` when the reader is empty. */
  selectedMessageId: string | null
}

/** One renderable grouped section in the shuttle mail browser. */
export interface MailFolderSection {
  /** Folder metadata shown in the section header. */
  folder: ShipMessageFolder
  /** Rows belonging to this folder, preserving the message-system sort order. */
  rows: readonly ShipMessageInboxRow[]
  /** Whether the section should render its rows. */
  isExpanded: boolean
  /** True when this section owns the currently selected message. */
  containsSelectedMessage: boolean
}

/**
 * Builds section view models for the mail browser.
 *
 * Explicitly expanded folders stay open. Deep links should add the target
 * folder to `expandedFolderIds` before building sections.
 *
 * @param input - Folders, rows, expansion state, and selected message id.
 * @returns Immutable-friendly section view models for the Vue mail program.
 */
export function buildMailFolderSections(input: BuildMailFolderSectionsInput): MailFolderSection[] {
  return input.folders.map((folder) => {
    const rows = input.rowsByFolderId[folder.id] ?? []
    const containsSelectedMessage =
      input.selectedMessageId !== null && rows.some((row) => row.id === input.selectedMessageId)
    const isExpanded = input.expandedFolderIds.has(folder.id)

    return {
      folder,
      rows,
      isExpanded,
      containsSelectedMessage,
    }
  })
}
