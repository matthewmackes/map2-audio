// SnapshotEditor "Rename chain" modal (T2473 part 8).
// Pure presentational sub-component. Captures a new name for
// the active chain. Owns no state — open/close, the name value
// + setter, the submit handler, and the chain label come from
// the parent.

import { Modal, TextInput } from '@carbon/react'

export interface SnapshotEditorRenameChainModalProps {
  open: boolean
  chainLabel: string
  chainName: string
  hasChain: boolean
  isSaving: boolean
  onClose: () => void
  onChainNameChange: (value: string) => void
  onSubmit: () => void
}

export function SnapshotEditorRenameChainModal({
  open,
  chainLabel,
  chainName,
  hasChain,
  isSaving,
  onClose,
  onChainNameChange,
  onSubmit,
}: SnapshotEditorRenameChainModalProps) {
  if (!open) return null
  return (
    <Modal
      open
      size="sm"
      modalHeading="Rename chain"
      modalLabel={chainLabel}
      primaryButtonText={isSaving ? 'Saving...' : 'Rename chain'}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={!hasChain || chainName.trim().length === 0 || isSaving}
      onRequestClose={onClose}
      onSecondarySubmit={onClose}
      onRequestSubmit={onSubmit}
      selectorPrimaryFocus="#juce-grid-rename-chain-name"
    >
      <div className="juce-grid-page__form-modal-body">
        <p className="juce-grid-page__modal-copy">
          Rename the active chain while preserving the current routing, plugin, and
          snapshot state.
        </p>
        <TextInput
          id="juce-grid-rename-chain-name"
          labelText="Chain name"
          value={chainName}
          onChange={(event) => onChainNameChange(event.target.value)}
          placeholder="Main performance chain"
        />
      </div>
    </Modal>
  )
}
