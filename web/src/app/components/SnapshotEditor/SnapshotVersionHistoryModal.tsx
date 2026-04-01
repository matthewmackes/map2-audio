import { Button, InlineLoading, Modal, Tag } from '@carbon/react'
import type { SnapshotRevisionSummary } from '../../../map2/types'

const REVISION_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
})

function formatSavedAt(value?: string | null): string {
  if (!value) {
    return 'Saved at an unknown time'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Saved at an unknown time'
  }
  return `Saved ${REVISION_TIMESTAMP_FORMATTER.format(parsed)}`
}

interface SnapshotVersionHistoryModalProps {
  open: boolean
  snapshotName?: string | null
  revisions: SnapshotRevisionSummary[]
  loading?: boolean
  errorMessage?: string | null
  restoringRevisionNumber?: number | null
  onClose: () => void
  onRestore: (revision: SnapshotRevisionSummary) => void
}

export function SnapshotVersionHistoryModal({
  open,
  snapshotName,
  revisions,
  loading = false,
  errorMessage = null,
  restoringRevisionNumber = null,
  onClose,
  onRestore,
}: SnapshotVersionHistoryModalProps) {
  return (
    <Modal
      open={open}
      passiveModal
      modalHeading={snapshotName ? `Version History · ${snapshotName}` : 'Version History'}
      onRequestClose={onClose}
      size="md"
    >
      <div className="juce-grid-page__version-history">
        {loading ? (
          <InlineLoading status="active" description="Loading snapshot revisions..." />
        ) : errorMessage ? (
          <p className="juce-grid-page__version-history-empty">{errorMessage}</p>
        ) : revisions.length === 0 ? (
          <p className="juce-grid-page__version-history-empty">
            No saved revisions yet. Use the editor save action to start a version history for this snapshot.
          </p>
        ) : (
          <div className="juce-grid-page__version-history-list" role="list" aria-label="Snapshot revision history">
            {revisions.map((revision) => {
              const restorePending = restoringRevisionNumber === revision.revision_number
              return (
                <article
                  key={revision.id}
                  className="juce-grid-page__version-history-item"
                  role="listitem"
                >
                  <div className="juce-grid-page__version-history-copy">
                    <div className="juce-grid-page__version-history-headline">
                      <Tag type="cool-gray" size="sm">{`Rev ${revision.revision_number}`}</Tag>
                      {revision.snapshot_revision ? (
                        <span className="juce-grid-page__version-history-revision-hash">
                          {revision.snapshot_revision.slice(0, 8)}
                        </span>
                      ) : null}
                    </div>
                    <p className="juce-grid-page__version-history-summary">
                      {formatSavedAt(revision.saved_at)}{' '}
                      <span aria-hidden>·</span>{' '}
                      {revision.summary}
                    </p>
                  </div>
                  <Button
                    kind="secondary"
                    size="sm"
                    onClick={() => onRestore(revision)}
                    disabled={restoringRevisionNumber !== null}
                  >
                    {restorePending ? 'Restoring...' : 'Restore'}
                  </Button>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
