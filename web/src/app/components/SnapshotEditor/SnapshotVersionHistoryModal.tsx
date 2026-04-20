import { Button, Modal, Tag } from '@carbon/react'
import type { SnapshotRevisionSummary } from '../../../map2/types'
import { EmptyState } from '../shared/EmptyState'
import { LoadingState } from '../shared/LoadingState'
import {
  SnapshotSchematicLed,
  SnapshotSchematicReadout,
} from './SnapshotSchematicSurface'

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
  const revisionReadout = loading
    ? 'Loading'
    : errorMessage
      ? 'Unavailable'
      : revisions.length === 0
        ? 'No rev'
        : `${revisions.length} rev`

  return (
    <Modal
      open={open}
      passiveModal
      modalHeading={snapshotName ? `Version History · ${snapshotName}` : 'Version History'}
      onRequestClose={onClose}
      size="md"
      className="snapshot-schematic-modal"
    >
      <div className="juce-grid-page__version-history">
        <SnapshotSchematicReadout
          label="Revision bus"
          value={revisionReadout}
          tone={errorMessage ? 'error' : revisions.length > 0 ? 'active' : 'idle'}
        />

        {loading ? (
          <LoadingState description="Loading snapshot revisions" />
        ) : errorMessage ? (
          <EmptyState
            className="juce-grid-page__version-history-empty"
            title="Version history unavailable"
            description={errorMessage}
            compact
            align="left"
          />
        ) : revisions.length === 0 ? (
          <EmptyState
            className="juce-grid-page__version-history-empty"
            title="No saved revisions yet"
            description="Use the editor save action to start a version history for this snapshot."
            compact
            align="left"
          />
        ) : (
          <div className="snapshot-schematic-revision-list" role="list" aria-label="Snapshot revision history">
            {revisions.map((revision) => {
              const restorePending = restoringRevisionNumber === revision.revision_number
              return (
                <article
                  key={revision.id}
                  className="snapshot-schematic-revision-item"
                  role="listitem"
                >
                  <div className="snapshot-schematic-revision-item__copy">
                    <div className="snapshot-schematic-revision-item__headline">
                      <SnapshotSchematicLed tone={restorePending ? 'warning' : 'active'} />
                      <Tag type="cool-gray" size="sm">{`Rev ${revision.revision_number}`}</Tag>
                      {revision.snapshot_revision ? (
                        <span className="snapshot-schematic-revision-item__hash">
                          {revision.snapshot_revision.slice(0, 8)}
                        </span>
                      ) : null}
                    </div>
                    <p className="snapshot-schematic-revision-item__summary">
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
