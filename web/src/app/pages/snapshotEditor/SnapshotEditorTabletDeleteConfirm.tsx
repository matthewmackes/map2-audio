// SnapshotEditor tablet "Remove block" confirmation (T2473
// part 9). Pure presentational sub-component. Asks the operator
// to confirm removing a single plugin block from the active
// branch. Owns no state — open/close + confirm action are
// parent-driven.

import { Modal } from '@carbon/react'
import type { PendingTabletDeletePluginState } from './snapshotEditorPageTypes'

export interface SnapshotEditorTabletDeleteConfirmProps {
  pendingPlugin: PendingTabletDeletePluginState | null
  isDeleting: boolean
  onClose: () => void
  onConfirm: () => void
}

export function SnapshotEditorTabletDeleteConfirm({
  pendingPlugin,
  isDeleting,
  onClose,
  onConfirm,
}: SnapshotEditorTabletDeleteConfirmProps) {
  if (!pendingPlugin) return null
  return (
    <Modal
      open
      size="sm"
      modalHeading="Remove block"
      modalLabel="Tablet block action"
      primaryButtonText={isDeleting ? 'Removing...' : 'Remove block'}
      secondaryButtonText="Cancel"
      danger
      primaryButtonDisabled={isDeleting}
      onRequestClose={onClose}
      onSecondarySubmit={onClose}
      onRequestSubmit={onConfirm}
    >
      <div className="juce-grid-page__form-modal-body">
        <p className="juce-grid-page__modal-copy">
          Remove "{pendingPlugin.name}" from the current branch?
        </p>
      </div>
    </Modal>
  )
}
