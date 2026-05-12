// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// T2517-6 — Per-instance configuration side-panel for the MPX-1 effects block.
// Rendered as a Carbon `Modal` triggered from the effects-chooser hardware tile
// (and from the chain block selection in the snapshot editor, in a follow-up).

import { useEffect, useState } from 'react'
import {
  Button,
  ComposedModal,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  NumberInput,
  RadioButton,
  RadioButtonGroup,
  Select,
  SelectItem,
  Tag,
} from '@carbon/react'

import {
  useAutoConnectionType,
  useCalibrateMpx1,
  useDeleteMpx1Instance,
  useInterfaceCapabilities,
  useMpx1Instance,
  useSetMpx1Bypass,
  useUpsertMpx1Instance,
} from './useMpx1BlockApi'

export interface MPX1BlockSidePanelProps {
  open: boolean
  chainId: string
  onClose: () => void
}

const DEFAULT_SPDIF_MAPPING = { send_left: 2, send_right: 3, return_left: 2, return_right: 3 }

export function MPX1BlockSidePanel({ open, chainId, onClose }: MPX1BlockSidePanelProps) {
  const instanceQuery = useMpx1Instance(open ? chainId : null)
  const interfacesQuery = useInterfaceCapabilities()
  const { preferred } = useAutoConnectionType()

  const upsertMutation = useUpsertMpx1Instance()
  const bypassMutation = useSetMpx1Bypass(chainId)
  const calibrateMutation = useCalibrateMpx1(chainId)
  const deleteMutation = useDeleteMpx1Instance()

  const interfaces = interfacesQuery.data?.interfaces ?? []
  const eligibleInterfaces = interfaces.filter((r) =>
    r.capabilities.includes('digital_io_stereo'),
  )

  // Local form state — initialised from the server when the modal opens.
  const [interfaceId, setInterfaceId] = useState<string>('')
  const [connectionType, setConnectionType] = useState<'aes_ebu' | 'spdif_coax' | 'spdif_optical'>(
    'spdif_coax',
  )
  const [sendL, setSendL] = useState<number>(DEFAULT_SPDIF_MAPPING.send_left)
  const [sendR, setSendR] = useState<number>(DEFAULT_SPDIF_MAPPING.send_right)
  const [returnL, setReturnL] = useState<number>(DEFAULT_SPDIF_MAPPING.return_left)
  const [returnR, setReturnR] = useState<number>(DEFAULT_SPDIF_MAPPING.return_right)

  useEffect(() => {
    if (!open) return
    const inst = instanceQuery.data
    if (inst) {
      setInterfaceId(inst.interface_id)
      setConnectionType(inst.connection_type)
      setSendL(inst.channel_mapping.send_left)
      setSendR(inst.channel_mapping.send_right)
      setReturnL(inst.channel_mapping.return_left)
      setReturnR(inst.channel_mapping.return_right)
      return
    }
    // First-time configuration defaults.
    if (eligibleInterfaces.length > 0) {
      setInterfaceId(eligibleInterfaces[0].interface_id)
    }
    if (preferred) {
      setConnectionType(preferred)
    }
  }, [open, instanceQuery.data, eligibleInterfaces, preferred])

  const isLoading =
    upsertMutation.isPending ||
    bypassMutation.isPending ||
    calibrateMutation.isPending ||
    deleteMutation.isPending

  const conflictDetail =
    upsertMutation.error && (upsertMutation.error as any)?.detail
      ? (upsertMutation.error as any).detail
      : null

  const handleSave = () => {
    upsertMutation.mutate({
      chainId,
      body: {
        interface_id: interfaceId,
        connection_type: connectionType,
        channel_mapping: {
          send_left: sendL,
          send_right: sendR,
          return_left: returnL,
          return_right: returnR,
        },
        bypass: instanceQuery.data?.bypass ?? false,
      },
    })
  }

  const handleDelete = () => {
    deleteMutation.mutate(chainId, {
      onSuccess: () => onClose(),
    })
  }

  const handleCalibrate = () => calibrateMutation.mutate()
  const handleBypass = () => bypassMutation.mutate(!instanceQuery.data?.bypass)

  return (
    <ComposedModal open={open} onClose={onClose} size="md">
      <ModalHeader
        title="Lexicon MPX-1 — bridge configuration"
        label={`Chain ${chainId}`}
      />
      <ModalBody hasForm>
        {conflictDetail ? (
          <InlineNotification
            kind="error"
            lowContrast
            title="MPX-1 is already in use by another chain"
            subtitle={`Hold currently belongs to chain ${conflictDetail.in_use_by_chain}. Remove it from that chain first, or pick a different effect.`}
            hideCloseButton
          />
        ) : null}

        <section className="stack">
          <h5>Connection type</h5>
          <RadioButtonGroup
            name="mpx1-connection"
            valueSelected={connectionType}
            onChange={(value: string) =>
              setConnectionType(value as 'aes_ebu' | 'spdif_coax' | 'spdif_optical')
            }
            orientation="vertical"
          >
            <RadioButton
              id="mpx1-conn-aes"
              value="aes_ebu"
              labelText="AES/EBU (preferred — requires AES-capable interface)"
            />
            <RadioButton
              id="mpx1-conn-spdif"
              value="spdif_coax"
              labelText="S/PDIF coax (fallback — works with US-144MKII)"
            />
            <RadioButton id="mpx1-conn-toslink" value="spdif_optical" labelText="S/PDIF optical (TOSLINK)" />
          </RadioButtonGroup>
          {preferred ? (
            <Tag type="cool-gray">{`Auto preference: ${preferred}`}</Tag>
          ) : (
            <Tag type="warm-gray">No connected interface advertises a digital bridge</Tag>
          )}
        </section>

        <section className="stack">
          <h5>Interface</h5>
          <Select
            id="mpx1-iface"
            labelText="Audio interface"
            value={interfaceId}
            onChange={(e) => setInterfaceId(e.target.value)}
            disabled={eligibleInterfaces.length === 0}
          >
            {eligibleInterfaces.map((r) => (
              <SelectItem key={r.interface_id} value={r.interface_id} text={r.display_name} />
            ))}
          </Select>
        </section>

        <section className="stack">
          <h5>Channel mapping (0-indexed)</h5>
          <NumberInput
            id="mpx1-send-l"
            label="Send Left"
            value={sendL}
            min={0}
            max={254}
            onChange={(_e, { value }) => setSendL(Number(value))}
          />
          <NumberInput
            id="mpx1-send-r"
            label="Send Right"
            value={sendR}
            min={0}
            max={254}
            onChange={(_e, { value }) => setSendR(Number(value))}
          />
          <NumberInput
            id="mpx1-return-l"
            label="Return Left"
            value={returnL}
            min={0}
            max={254}
            onChange={(_e, { value }) => setReturnL(Number(value))}
          />
          <NumberInput
            id="mpx1-return-r"
            label="Return Right"
            value={returnR}
            min={0}
            max={254}
            onChange={(_e, { value }) => setReturnR(Number(value))}
          />
        </section>

        <section className="stack">
          <h5>Latency calibration</h5>
          <p>
            Current:{' '}
            {instanceQuery.data?.calibration?.latency_samples != null
              ? `${instanceQuery.data.calibration.latency_samples} samples`
              : 'uncalibrated (using 256-sample placeholder)'}
          </p>
          <Button
            size="sm"
            kind="tertiary"
            disabled={!instanceQuery.data || isLoading}
            onClick={handleCalibrate}
          >
            Run calibration
          </Button>
        </section>

        <section className="stack">
          <h5>Bypass</h5>
          <Button
            size="sm"
            kind={instanceQuery.data?.bypass ? 'primary' : 'tertiary'}
            disabled={!instanceQuery.data || isLoading}
            onClick={handleBypass}
          >
            {instanceQuery.data?.bypass ? 'Bypassed — re-engage' : 'Bypass MPX-1'}
          </Button>
        </section>
      </ModalBody>
      <ModalFooter>
        <Button
          kind="danger--tertiary"
          disabled={!instanceQuery.data || isLoading}
          onClick={handleDelete}
        >
          Remove from chain
        </Button>
        <Button kind="secondary" onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button kind="primary" onClick={handleSave} disabled={isLoading || !interfaceId}>
          {instanceQuery.data ? 'Save changes' : 'Add MPX-1 to chain'}
        </Button>
      </ModalFooter>
    </ComposedModal>
  )
}
