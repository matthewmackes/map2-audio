// SnapshotEditor MIDI mappings Modal wrapper (T2473 part 18).
// Extracted from the page monolith. The actual mappings workspace
// content is rendered by the parent's `renderMidiMappingsWorkspace`
// helper, passed in via the children render-prop. This sibling
// owns only the open/close + Carbon Modal chrome.

import type { ReactNode } from 'react'
import { Modal } from '@carbon/react'

export interface SnapshotEditorMidiMappingsModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function SnapshotEditorMidiMappingsModal({
  open,
  onClose,
  children,
}: SnapshotEditorMidiMappingsModalProps) {
  if (!open) return null
  return (
    <Modal
      open
      size="lg"
      modalHeading="Audio Grid MIDI mappings"
      primaryButtonText="Close"
      onRequestClose={onClose}
      onRequestSubmit={onClose}
    >
      <div className="juce-grid-page__modal-stack juce-grid-page__midi-modal-shell" id="juce-grid-midi-modal">
        <div className="juce-grid-page__midi-modal-panel">{children}</div>
      </div>
    </Modal>
  )
}
