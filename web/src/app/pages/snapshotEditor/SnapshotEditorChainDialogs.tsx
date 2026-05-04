// SnapshotEditor chain-level dialogs (T2473 part 17).
// Aggregates the five chain/preset confirmation dialogs that
// were inline in the page monolith. All state and callbacks
// remain parent-owned; this aggregate is purely declarative
// wiring so the monolith's render stays focused on layout.

import type { Snapshot } from '../../../map2/types'

import { SnapshotEditorTabletDeleteConfirm } from './SnapshotEditorTabletDeleteConfirm'
import { SnapshotEditorSavePresetModal } from './SnapshotEditorSavePresetModal'
import { SnapshotEditorRenameChainModal } from './SnapshotEditorRenameChainModal'
import { SnapshotEditorPresetDeleteConfirm } from './SnapshotEditorPresetDeleteConfirm'
import { SnapshotEditorClearFlowsConfirm } from './SnapshotEditorClearFlowsConfirm'
import type { PendingTabletDeletePluginState } from './snapshotEditorPageTypes'

export interface SnapshotEditorChainDialogsProps {
  // Tablet delete confirm
  pendingTabletDeletePlugin: PendingTabletDeletePluginState | null
  isDeletePending: boolean
  onCloseTabletDelete: () => void
  onConfirmTabletDelete: () => void

  // Save preset modal
  showSavePresetModal: boolean
  saveChainLabel: string
  savePresetName: string
  saveHasChain: boolean
  isSavingPreset: boolean
  onCloseSavePreset: () => void
  onSavePresetNameChange: (name: string) => void
  onSubmitSavePreset: () => void

  // Rename chain modal
  showRenameChainModal: boolean
  renameChainLabel: string
  renameChainName: string
  renameHasChain: boolean
  isRenameSaving: boolean
  onCloseRenameChain: () => void
  onRenameChainNameChange: (name: string) => void
  onSubmitRenameChain: () => void

  // Preset delete confirm
  presetPendingDelete: Snapshot | null
  isDeletePresetPending: boolean
  onClosePresetDelete: () => void
  onConfirmDeletePreset: () => void

  // Clear flows confirm
  showClearFlowsModal?: boolean
  onCloseClearFlows?: () => void
  onConfirmClearFlows?: () => void
}

export function SnapshotEditorChainDialogs({
  pendingTabletDeletePlugin,
  isDeletePending,
  onCloseTabletDelete,
  onConfirmTabletDelete,
  showSavePresetModal,
  saveChainLabel,
  savePresetName,
  saveHasChain,
  isSavingPreset,
  onCloseSavePreset,
  onSavePresetNameChange,
  onSubmitSavePreset,
  showRenameChainModal,
  renameChainLabel,
  renameChainName,
  renameHasChain,
  isRenameSaving,
  onCloseRenameChain,
  onRenameChainNameChange,
  onSubmitRenameChain,
  presetPendingDelete,
  isDeletePresetPending,
  onClosePresetDelete,
  onConfirmDeletePreset,
  showClearFlowsModal = false,
  onCloseClearFlows,
  onConfirmClearFlows,
}: SnapshotEditorChainDialogsProps) {
  return (
    <>
      <SnapshotEditorTabletDeleteConfirm
        pendingPlugin={pendingTabletDeletePlugin}
        isDeleting={isDeletePending}
        onClose={onCloseTabletDelete}
        onConfirm={onConfirmTabletDelete}
      />
      <SnapshotEditorSavePresetModal
        open={showSavePresetModal}
        chainLabel={saveChainLabel}
        presetName={savePresetName}
        hasChain={saveHasChain}
        isSaving={isSavingPreset}
        onClose={onCloseSavePreset}
        onPresetNameChange={onSavePresetNameChange}
        onSubmit={onSubmitSavePreset}
      />
      <SnapshotEditorRenameChainModal
        open={showRenameChainModal}
        chainLabel={renameChainLabel}
        chainName={renameChainName}
        hasChain={renameHasChain}
        isSaving={isRenameSaving}
        onClose={onCloseRenameChain}
        onChainNameChange={onRenameChainNameChange}
        onSubmit={onSubmitRenameChain}
      />
      <SnapshotEditorPresetDeleteConfirm
        pendingPreset={presetPendingDelete}
        isDeleting={isDeletePresetPending}
        onClose={onClosePresetDelete}
        onConfirm={onConfirmDeletePreset}
      />
      <SnapshotEditorClearFlowsConfirm
        open={showClearFlowsModal}
        onClose={onCloseClearFlows ?? (() => {})}
        onConfirm={onConfirmClearFlows ?? (() => {})}
      />
    </>
  )
}
