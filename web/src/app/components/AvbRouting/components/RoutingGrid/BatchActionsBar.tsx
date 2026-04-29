// Batch Actions Bar — floating action bar for drag-selected cells.
// T2475 (E1) Carbon migration:
//   Box/Typography  → semantic divs/spans
//   Button (MUI)    → Carbon Button (kind primary/danger/ghost)
//   IconButton      → Carbon Button hasIconOnly
//   Tooltip (MUI)   → Carbon Tooltip
//   Dialog          → Carbon Modal (size="xs")
//   CircularProgress → Carbon InlineLoading inside the button
// Confirmation dialogs reuse the same Carbon Modal primitive; the
// destructive (disconnect) flow keeps the explicit "cannot be
// undone" copy.

import { useState } from 'react'
import {
  Button,
  InlineLoading,
  Modal,
  Tooltip,
} from '@carbon/react'
import { Checkmark, Close, Link, Unlink, WarningFilled } from '@carbon/icons-react'
import './BatchActionsBar.css'

interface BatchActionsBarProps {
  selectedCount: number
  onConnectAll: () => Promise<void>
  onDisconnectAll: () => Promise<void>
  onClearSelection: () => void
  isLoading?: boolean
}

type ConfirmDialog = 'connect' | 'disconnect' | null

export function BatchActionsBar({
  selectedCount,
  onConnectAll,
  onDisconnectAll,
  onClearSelection,
  isLoading = false,
}: BatchActionsBarProps) {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null)

  if (selectedCount === 0) {
    return null
  }

  const handleConnectAll = async () => {
    setConfirmDialog(null)
    await onConnectAll()
  }

  const handleDisconnectAll = async () => {
    setConfirmDialog(null)
    await onDisconnectAll()
  }

  return (
    <>
      <div className="batch-actions-bar">
        <div className="batch-actions-bar__count">
          <Checkmark size={20} />
          <span className="batch-actions-bar__count-label">
            {selectedCount} selected
          </span>
        </div>

        <span className="batch-actions-bar__divider" aria-hidden="true" />

        <div className="batch-actions-bar__actions">
          <Tooltip label="Connect all selected cells" align="top">
            <Button
              kind="primary"
              size="md"
              renderIcon={isLoading ? undefined : Link}
              onClick={() => setConfirmDialog('connect')}
              disabled={isLoading}
            >
              {isLoading ? <InlineLoading description="Working..." /> : 'Connect All'}
            </Button>
          </Tooltip>

          <Tooltip label="Disconnect all selected cells" align="top">
            <Button
              kind="danger"
              size="md"
              renderIcon={isLoading ? undefined : Unlink}
              onClick={() => setConfirmDialog('disconnect')}
              disabled={isLoading}
            >
              {isLoading ? <InlineLoading description="Working..." /> : 'Disconnect All'}
            </Button>
          </Tooltip>
        </div>

        <span className="batch-actions-bar__divider" aria-hidden="true" />

        <Tooltip label="Clear selection" align="top">
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={Close}
            iconDescription="Clear selection"
            onClick={onClearSelection}
            disabled={isLoading}
          />
        </Tooltip>
      </div>

      <Modal
        open={confirmDialog === 'connect'}
        onRequestClose={() => setConfirmDialog(null)}
        modalHeading="Connect All Selected?"
        modalLabel="Batch routing"
        primaryButtonText="Connect All"
        secondaryButtonText="Cancel"
        onRequestSubmit={handleConnectAll}
        size="xs"
      >
        <p>
          This will create {selectedCount} new audio route{selectedCount === 1 ? '' : 's'}.
        </p>
        {selectedCount > 10 && (
          <p className="batch-actions-bar__warning">
            <WarningFilled size={16} />
            Large batch operation - this may take a few moments.
          </p>
        )}
      </Modal>

      <Modal
        open={confirmDialog === 'disconnect'}
        onRequestClose={() => setConfirmDialog(null)}
        modalHeading="Disconnect All Selected?"
        modalLabel="Batch routing"
        primaryButtonText="Disconnect All"
        secondaryButtonText="Cancel"
        danger
        onRequestSubmit={handleDisconnectAll}
        size="xs"
      >
        <p>
          This will disconnect {selectedCount} audio route{selectedCount === 1 ? '' : 's'}.
        </p>
        {selectedCount > 10 && (
          <p className="batch-actions-bar__warning">
            <WarningFilled size={16} />
            Large batch operation - this may take a few moments.
          </p>
        )}
        <p className="batch-actions-bar__danger-note">
          This action cannot be undone.
        </p>
      </Modal>
    </>
  )
}

export default BatchActionsBar
