import { Button, ComposedModal, ModalBody, ModalFooter, ModalHeader } from '@carbon/react'

type ShellPowerModalProps = {
  open: boolean
  onClose: () => void
  onConfirm: () => void
}

export function ShellPowerModal({ open, onClose, onConfirm }: ShellPowerModalProps) {
  return (
    <ComposedModal className="shell-power-modal" open={open} onClose={onClose} size="sm">
      <ModalHeader title="Restart backend" label="Power" closeModal={onClose} />
      <ModalBody>
        Restart the MAP2 backend service? Audio processing will pause briefly while the shell reconnects.
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button kind="primary" onClick={onConfirm}>
          Confirm restart
        </Button>
      </ModalFooter>
    </ComposedModal>
  )
}
