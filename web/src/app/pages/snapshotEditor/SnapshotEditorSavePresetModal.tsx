// SnapshotEditor "Save preset" modal (T2473 part 7).
// Pure presentational sub-component. Captures a preset name
// for the current chain. Owns no state — open/close, the name
// value + setter, the submit handler, and the chain label
// come from the parent so the parent's mutation cache stays
// canonical.

import { Modal, TextInput } from '@carbon/react'

export interface SnapshotEditorSavePresetModalProps {
  open: boolean
  chainLabel: string
  presetName: string
  hasChain: boolean
  isSaving: boolean
  onClose: () => void
  onPresetNameChange: (value: string) => void
  onSubmit: () => void
}

export function SnapshotEditorSavePresetModal({
  open,
  chainLabel,
  presetName,
  hasChain,
  isSaving,
  onClose,
  onPresetNameChange,
  onSubmit,
}: SnapshotEditorSavePresetModalProps) {
  if (!open) return null
  return (
    <Modal
      open
      size="sm"
      modalHeading="Save preset"
      modalLabel={chainLabel}
      primaryButtonText={isSaving ? 'Saving...' : 'Save preset'}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={!hasChain || presetName.trim().length === 0 || isSaving}
      onRequestClose={onClose}
      onSecondarySubmit={onClose}
      onRequestSubmit={onSubmit}
      selectorPrimaryFocus="#juce-grid-save-preset-name"
    >
      <div className="juce-grid-page__form-modal-body">
        <p className="juce-grid-page__modal-copy">
          Save the current chain state into the preset library without leaving the
          grid workflow.
        </p>
        <TextInput
          id="juce-grid-save-preset-name"
          labelText="Preset name"
          value={presetName}
          onChange={(event) => onPresetNameChange(event.target.value)}
          placeholder="My JUCE preset"
        />
      </div>
    </Modal>
  )
}
