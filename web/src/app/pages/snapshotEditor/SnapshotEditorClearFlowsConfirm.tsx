// SnapshotEditor "Reset paths" confirmation modal (T2473 part 6).
// Pure presentational sub-component. Asks the operator to
// confirm discarding the current multi-path layout state and
// resetting the workspace to a single empty path. Owns no
// state — open/close + confirm action are parent-driven.

import { Modal } from '@carbon/react'

export interface SnapshotEditorClearFlowsConfirmProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
}

export function SnapshotEditorClearFlowsConfirm({
  open,
  onClose,
  onConfirm,
}: SnapshotEditorClearFlowsConfirmProps) {
  if (!open) return null
  return (
    <Modal
      open
      size="sm"
      modalHeading="Reset paths"
      modalLabel="Audio Grid workspace"
      primaryButtonText="Reset paths"
      secondaryButtonText="Cancel"
      onRequestClose={onClose}
      onSecondarySubmit={onClose}
      onRequestSubmit={onConfirm}
      danger
    >
      <div className="juce-grid-page__form-modal-body">
        <p className="juce-grid-page__modal-copy">
          Reset the workspace to a single empty path and discard the current
          multi-path layout state.
        </p>
      </div>
    </Modal>
  )
}
