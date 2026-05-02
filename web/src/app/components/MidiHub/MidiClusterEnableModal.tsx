/**
 * T2486-1 — MIDI cluster enable modal.
 *
 * Coupled-flip onboarding flow: when an operator turns on
 * `midi.cluster.enabled` from MidiServicesNetworkPage, this modal
 * presents a default-checked "Also enable auto-connect" option. The
 * fail-closed schema default
 * (test_cluster_midi_defaults_fail_closed) is preserved — operators
 * must explicitly opt in here.
 */

import { useState } from 'react'
import { Checkbox, Modal } from '@carbon/react'

export interface MidiClusterEnableModalProps {
  open: boolean
  onClose: () => void
  /**
   * Called with the operator's choices when they confirm the modal.
   * The owner is responsible for the actual config writes.
   */
  onConfirm: (choices: { enableCluster: true; enableAutoConnect: boolean }) => void
}

export function MidiClusterEnableModal({
  open,
  onClose,
  onConfirm,
}: MidiClusterEnableModalProps) {
  const [enableAutoConnect, setEnableAutoConnect] = useState(true)

  const handleSubmit = () => {
    onConfirm({ enableCluster: true, enableAutoConnect })
  }

  return (
    <Modal
      open={open}
      modalHeading="Enable cluster MIDI?"
      modalLabel="MIDI Services / Network"
      primaryButtonText="Enable"
      secondaryButtonText="Cancel"
      onRequestClose={onClose}
      onRequestSubmit={handleSubmit}
      data-testid="midi-cluster-enable-modal"
    >
      <p style={{ marginBlockEnd: '1rem' }}>
        Cluster MIDI lets MAP2 nodes share MIDI traffic over the network — clock,
        notes, CCs, and SysEx are routed between peers via RTP-MIDI. Discovery is
        mDNS-based; peers are found automatically.
      </p>
      <p style={{ marginBlockEnd: '1rem' }}>
        Enabling cluster MIDI on its own does not auto-pair MIDI ports between
        peers — you would have to wire each pairing manually from the cluster
        bindings matrix. The recommended setting is to also enable
        <strong> auto-connect</strong>, which has the cluster router pair local
        outputs with discovered peer inputs on every <code>midi.node.discovered</code> event.
      </p>
      <Checkbox
        id="midi-cluster-auto-connect"
        labelText="Also enable auto-connect (recommended)"
        checked={enableAutoConnect}
        onChange={(_event, { checked }: { checked: boolean }) =>
          setEnableAutoConnect(checked)
        }
      />
    </Modal>
  )
}

export default MidiClusterEnableModal
