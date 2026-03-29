/**
 * ChainAssignmentModal
 *
 * Carbon-compliant modal for assigning a chain to a specific flow slot.
 * Opens automatically when a flow has no chain assigned, and can be opened
 * manually via the "Edit Assigned Chain" button on each flow card.
 *
 * Contains the full SnapshotChainManagementCard lifecycle (create, rename,
 * duplicate, activate/deactivate, delete) plus an Apply button that commits
 * the selection to the flow.
 */

import { useState, useEffect } from 'react'
import { Modal } from '@carbon/react'
import { Branch } from '@carbon/icons-react'
import { SnapshotChainManagementCard } from '../SnapshotEditor/SnapshotChainManagementCard'
import type { Plugin } from '../../../map2/types'

export interface ChainAssignmentModalProps {
  /** Whether the modal is open */
  open: boolean
  /** The flow slot being edited (label like "A", "B", "C", "D") */
  flowLabel: string
  /** Currently assigned chainId for this flow (null = unassigned) */
  currentChainId: number | null
  /** All flow slots (for the "assigned to" chip display inside the card) */
  flowSlots: Array<{ id: string; chainId: number | null; label: string; color: string }>
  /** Plugin metadata for chip rendering */
  pluginMeta?: Record<string, Plugin>
  /** Called with the selected chainId when user clicks Apply */
  onApply: (chainId: number) => void
  /** Called when the modal is dismissed without applying */
  onClose: () => void
  /** Called when the selected chain is removed/deleted inside the modal */
  onSelectedChainRemoved?: (chainId: number) => void
  /**
   * Called when a plugin chip is clicked.
   * Receives the pending (locally selected) chainId so the parent can
   * apply the chain selection and open the plugin editor.
   */
  onPluginChipClick?: (chainId: number, pluginUri: string, pluginPosition: number) => void
  /**
   * Chain lifecycle handlers — receive the currently-pending chainId so
   * SnapshotEditorPage can operate on the right chain while the modal is open.
   */
  onToggleActive?: (chainId: number) => void
  onDuplicate?: (chainId: number) => void
  onRename?: (chainId: number) => void
}

export function ChainAssignmentModal({
  open,
  flowLabel,
  currentChainId,
  flowSlots,
  pluginMeta = {},
  onApply,
  onClose,
  onSelectedChainRemoved,
  onPluginChipClick,
  onToggleActive,
  onDuplicate,
  onRename,
}: ChainAssignmentModalProps) {
  // Local pending selection — only committed on Apply
  const [pendingChainId, setPendingChainId] = useState<number | null>(currentChainId)

  // Sync when the modal opens or the external currentChainId changes
  useEffect(() => {
    if (open) {
      setPendingChainId(currentChainId)
    }
  }, [open, currentChainId])

  const handleApply = () => {
    if (pendingChainId !== null) {
      onApply(pendingChainId)
    }
    onClose()
  }

  const isUnassigned = currentChainId === null

  return (
    <Modal
      open={open}
      size="lg"
      modalHeading={
        isUnassigned
          ? `Assign chain to Flow ${flowLabel}`
          : `Edit chain for Flow ${flowLabel}`
      }
      primaryButtonText="Apply"
      secondaryButtonText="Cancel"
      primaryButtonDisabled={pendingChainId === null}
      onRequestClose={onClose}
      onSecondarySubmit={onClose}
      onRequestSubmit={handleApply}
      aria-label={`Chain assignment for Flow ${flowLabel}`}
    >
      <div className="chain-assignment-modal__body">
        {isUnassigned && (
          <div className="chain-assignment-modal__notice">
            <Branch size={16} aria-hidden />
            <p>
              Flow <strong>{flowLabel}</strong> has no chain assigned. Select one from the
              chooser below, then click <strong>Apply</strong> to bind it to this flow.
            </p>
          </div>
        )}

        <SnapshotChainManagementCard
          selectedChainId={pendingChainId}
          onChainSelect={(chainId) => setPendingChainId(chainId)}
          onSelectedChainRemoved={(chainId) => {
            if (pendingChainId === chainId) setPendingChainId(null)
            onSelectedChainRemoved?.(chainId)
          }}
          flowSlots={flowSlots}
          focusedFlowLabel={flowLabel}
          onToggleSelectedChainActive={() => {
            if (pendingChainId !== null) onToggleActive?.(pendingChainId)
          }}
          onDuplicateChain={() => {
            if (pendingChainId !== null) onDuplicate?.(pendingChainId)
          }}
          onRenameChain={() => {
            if (pendingChainId !== null) onRename?.(pendingChainId)
          }}
          pluginMeta={pluginMeta}
          onPluginChipClick={onPluginChipClick}
        />
      </div>
    </Modal>
  )
}
