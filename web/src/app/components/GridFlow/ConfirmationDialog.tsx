import { Dialog, DialogDismiss, DialogHeading, DialogProvider, useDialogStore } from '@ariakit/react'
import { X } from '@phosphor-icons/react'

interface ConfirmationDialogProps {
  open: boolean
  title: string
  message: string | React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'info'
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

export function ConfirmationDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'info',
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmationDialogProps) {
  const dialog = useDialogStore({
    open,
    setOpen: (isOpen) => {
      if (!isOpen) {
        onCancel()
      }
    },
  })

  const handleConfirm = async () => {
    await onConfirm()
    dialog.setOpen(false)
  }

  const handleCancel = () => {
    onCancel()
    dialog.setOpen(false)
  }

  return (
    <DialogProvider store={dialog}>
      <Dialog
        store={dialog}
        className="toolbar-confirmation-dialog"
        backdrop={<div className="toolbar-confirmation-backdrop" />}
      >
        <div className="toolbar-confirmation-header">
          <DialogHeading className="toolbar-confirmation-title">{title}</DialogHeading>
          <DialogDismiss className="toolbar-confirmation-close">
            <X size={20} weight="bold" />
          </DialogDismiss>
        </div>

        <div className="toolbar-confirmation-content">{message}</div>

        <div className="toolbar-confirmation-actions">
          <button
            className="toolbar-confirmation-btn cancel"
            onClick={handleCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button
            className={`toolbar-confirmation-btn ${variant}`}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="toolbar-confirmation-loading">
                <span className="spin-mini">⟳</span> {confirmLabel}
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </Dialog>
    </DialogProvider>
  )
}
