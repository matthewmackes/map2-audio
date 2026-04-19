import React, { useState } from 'react'
import { Button, ComposedModal, ModalBody, ModalFooter, ModalHeader, Tag, TextInput, Tile } from '@carbon/react'
import './TesiraCarbonChrome.css'

interface TesiraDspProbeDialogProps {
  open: boolean
  busy?: boolean
  onClose: () => void
  onProbe: (maxInstances: number) => Promise<void> | void
}

function normalizeIntegerInput(value: string): string {
  return value.replace(/[^0-9]/g, '')
}

function clampInstanceCount(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return 32
  return Math.max(1, Math.min(128, parsed))
}

export function TesiraDspProbeDialog({
  open,
  busy = false,
  onClose,
  onProbe,
}: TesiraDspProbeDialogProps) {
  const [maxInstances, setMaxInstances] = useState('32')

  const runProbe = async () => {
    await onProbe(clampInstanceCount(maxInstances))
  }

  return (
    <ComposedModal open={open} onClose={busy ? undefined : onClose} size="sm" className="tesira-dsp-probe-modal">
      <ModalHeader
        title="Probe DSP Blocks"
        label="Tesira DSP"
        closeModal={busy ? undefined : onClose}
      />
      <ModalBody className="tesira-dsp-probe-modal__body">
        <Tile className="tesira-dsp-probe-modal__tile">
          <div className="tesira-deploy-modal__section-header">
            <div>
              <p className="tesira-dashboard__eyebrow">Runtime discovery</p>
              <h3 className="tesira-dashboard__title">Probe active DSP block families</h3>
              <p className="tesira-dashboard__summary">
                MAP2 walks the runtime design to surface instance tags for levels, mixers, EQ, routers, and GPIO blocks that are not already declared.
              </p>
            </div>
            <Tag type="cool-gray" size="sm">1-128 per family</Tag>
          </div>

          <TextInput
            id="tesira-dsp-probe-max-instances"
            labelText="Max instances per block family"
            value={maxInstances}
            onChange={(event) => setMaxInstances(normalizeIntegerInput(event.target.value))}
            inputMode="numeric"
            disabled={busy}
          />
        </Tile>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          kind="primary"
          onClick={() => {
            void runProbe()
          }}
          disabled={busy}
        >
          {busy ? 'Probing…' : 'Probe'}
        </Button>
      </ModalFooter>
    </ComposedModal>
  )
}
