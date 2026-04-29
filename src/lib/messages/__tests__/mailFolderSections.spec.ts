import { describe, expect, it } from 'vitest'
import { DEFAULT_INBOX_FOLDER_ID } from '../messageTypes'
import { buildMailFolderSections } from '../mailFolderSections'
import type { ShipMessageFolder, ShipMessageInboxRow } from '../messageTypes'

function makeFolder(
  overrides: Partial<ShipMessageFolder> & Pick<ShipMessageFolder, 'id'>,
): ShipMessageFolder {
  return {
    label: overrides.id,
    total: 0,
    unread: 0,
    ...overrides,
  }
}

function makeRow(
  overrides: Partial<ShipMessageInboxRow> & Pick<ShipMessageInboxRow, 'id'>,
): ShipMessageInboxRow {
  return {
    from: 'Dispatch',
    subject: overrides.id,
    sentAt: '2306-04-29',
    preview: 'Preview',
    status: 'shown',
    isUnread: false,
    folderId: DEFAULT_INBOX_FOLDER_ID,
    pinned: false,
    ...overrides,
  }
}

describe('buildMailFolderSections', () => {
  it('keeps every folder collapsed until it is explicitly expanded', () => {
    const sections = buildMailFolderSections({
      folders: [makeFolder({ id: DEFAULT_INBOX_FOLDER_ID, label: 'Inbox' })],
      rowsByFolderId: {
        [DEFAULT_INBOX_FOLDER_ID]: [makeRow({ id: 'intro' })],
      },
      expandedFolderIds: new Set(),
      selectedMessageId: null,
    })

    expect(sections).toHaveLength(1)
    expect(sections[0]).toMatchObject({
      isExpanded: false,
      containsSelectedMessage: false,
    })
    expect(sections[0]?.rows.map((row) => row.id)).toEqual(['intro'])
  })

  it('opens any non-inbox folder that is explicitly expanded', () => {
    const sections = buildMailFolderSections({
      folders: [makeFolder({ id: 'venus-cert', label: 'USC Venus Certification' })],
      rowsByFolderId: {
        'venus-cert': [makeRow({ id: 'venus-intro', folderId: 'venus-cert' })],
      },
      expandedFolderIds: new Set(['venus-cert']),
      selectedMessageId: null,
    })

    expect(sections[0]).toMatchObject({
      isExpanded: true,
      containsSelectedMessage: false,
    })
  })

  it('does not force the folder containing the selected message open', () => {
    const sections = buildMailFolderSections({
      folders: [makeFolder({ id: 'mining-contract', label: 'Deep Rock Survey' })],
      rowsByFolderId: {
        'mining-contract': [
          makeRow({ id: 'contract-brief', folderId: 'mining-contract', pinned: true }),
          makeRow({ id: 'contract-step-1', folderId: 'mining-contract' }),
        ],
      },
      expandedFolderIds: new Set(),
      selectedMessageId: 'contract-step-1',
    })

    expect(sections[0]).toMatchObject({
      isExpanded: false,
      containsSelectedMessage: true,
    })
  })

  it('preserves collapsed folders when they are not inbox, expanded, or selected', () => {
    const sections = buildMailFolderSections({
      folders: [makeFolder({ id: 'quiet-contract', label: 'Quiet Contract' })],
      rowsByFolderId: {
        'quiet-contract': [makeRow({ id: 'quiet-intro', folderId: 'quiet-contract' })],
      },
      expandedFolderIds: new Set(),
      selectedMessageId: null,
    })

    expect(sections[0]).toMatchObject({
      isExpanded: false,
      containsSelectedMessage: false,
    })
  })
})
