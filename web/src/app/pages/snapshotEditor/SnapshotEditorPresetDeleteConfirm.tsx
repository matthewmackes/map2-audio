// SnapshotEditor "Delete preset" confirmation (T2473 part 10).
// Pure presentational danger-Modal. Confirms deleting a single
// preset from the preset library. Owns no state — the pending
// preset, isDeleting flag, and the confirm/close handlers come
// from the parent.

import { Modal } from '@carbon/react'
import type { Snapshot } from '../../../map2/types'

export interface SnapshotEditorPresetDeleteConfirmProps {
  pendingPreset: Snapshot | null
  isDeleting: boolean
  onClose: () => void
  onConfirm: () => void
}

export function SnapshotEditorPresetDeleteConfirm({
  pendingPreset,
  isDeleting,
  onClose,
  onConfirm,
}: SnapshotEditorPresetDeleteConfirmProps) {
  if (!pendingPreset) return null
  return (
    <Modal
      open
      size="sm"
      modalHeading="Delete preset"
      modalLabel={pendingPreset.name}
      primaryButtonText={isDeleting ? 'Deleting...' : 'Delete preset'}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={isDeleting}
      onRequestClose={onClose}
      onSecondarySubmit={onClose}
      onRequestSubmit={onConfirm}
      danger
    >
      <div className="juce-grid-page__form-modal-body">
        <p className="juce-grid-page__modal-copy">
          Delete{' '}
          <span className="juce-grid-page__modal-copy-emphasis">
            {pendingPreset.name}
          </span>{' '}
          from the preset library. This action cannot be undone.
        </p>
      </div>
    </Modal>
  )
}
