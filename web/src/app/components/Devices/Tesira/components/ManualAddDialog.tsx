/**
 * ManualAddDialog — add a Tesira device by IP address without requiring TTP.
 *
 * Uses POST /api/tesira/devices which skips the TTP probe, so this works for
 * configured (non-factory-reset) units even when port 23 is disabled.
 *
 * The device is persisted to config and the fleet attempts connection.
 * If TTP is still disabled the device will appear Offline in the fleet panel
 * until TTP is enabled in Tesira Software (Device Maintenance → Network Settings).
 */
import React, { useState } from 'react'
import {
  Button,
  ComposedModal,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Tag,
  TextInput,
  Tile,
} from '@carbon/react'
import { Add } from '@carbon/icons-react'
import { useAddDevice } from '../hooks/useTesiraApi'
import './TesiraCarbonChrome.css'

interface ManualAddDialogProps {
  open: boolean
  onClose: () => void
}

export function ManualAddDialog({ open, onClose }: ManualAddDialogProps) {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('23')
  const [name, setName] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const addDevice = useAddDevice()

  const resetForm = () => {
    setHost('')
    setPort('23')
    setName('')
    setError(null)
    setSuccess(false)
    setShowAdvanced(false)
  }

  const handleAdd = async () => {
    const trimmedHost = host.trim()
    if (!trimmedHost) {
      setError('IP address is required')
      return
    }

    const portNum = Number.parseInt(port, 10)
    if (Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setError('Port must be between 1 and 65535')
      return
    }

    setError(null)
    try {
      await addDevice.mutateAsync({ host: trimmedHost, port: portNum, name: name.trim() || undefined })
      setSuccess(true)
      setTimeout(() => {
        resetForm()
        onClose()
      }, 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add device')
    }
  }

  const handleClose = () => {
    if (!addDevice.isPending) {
      resetForm()
      onClose()
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      void handleAdd()
    }
  }

  return (
    <ComposedModal open={open} onClose={handleClose} size="sm" className="tesira-manual-add-modal">
      <ModalHeader
        title="Add Tesira Device"
        label="Tesira enrollment"
        closeModal={handleClose}
      />
      <ModalBody className="tesira-manual-add-modal__body">
        <Tile className="tesira-manual-add-modal__tile">
          <div className="tesira-deploy-modal__section-header">
            <div>
              <p className="tesira-dashboard__eyebrow">Known IP path</p>
              <h3 className="tesira-dashboard__title">Enroll by control address</h3>
              <p className="tesira-dashboard__summary">
                Enter the control IP of a Tesira unit. MAP2 adds it to the fleet even if TTP is still disabled, and the device can be reconnected once Telnet or SSH is enabled in Tesira Software.
              </p>
            </div>
            <Tag type="cool-gray" size="sm">Fallback path</Tag>
          </div>

          {error ? (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title="Unable to add device"
              subtitle={error}
            />
          ) : null}

          {success ? (
            <InlineNotification
              kind="success"
              lowContrast
              hideCloseButton
              title="Device added to fleet"
              subtitle="MAP2 stored the device and will attempt runtime control once the transport is reachable."
            />
          ) : null}

          <TextInput
            id="tesira-manual-add-host"
            labelText="IP Address"
            placeholder="192.168.1.100"
            value={host}
            onChange={(event) => {
              setHost(event.target.value)
              setError(null)
            }}
            disabled={addDevice.isPending || success}
            onKeyDown={handleKeyDown}
          />

          <Button
            kind="ghost"
            size="sm"
            onClick={() => setShowAdvanced((value) => !value)}
            disabled={addDevice.isPending || success}
          >
            {showAdvanced ? 'Hide advanced options' : 'Show advanced options'}
          </Button>

          {showAdvanced ? (
            <div className="tesira-manual-add-modal__grid">
              <TextInput
                id="tesira-manual-add-name"
                labelText="Name (optional)"
                placeholder="Main Hall DSP"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={addDevice.isPending || success}
                onKeyDown={handleKeyDown}
              />
              <TextInput
                id="tesira-manual-add-port"
                labelText="TTP Port"
                value={port}
                onChange={(event) => setPort(event.target.value.replace(/[^0-9]/g, ''))}
                disabled={addDevice.isPending || success}
                onKeyDown={handleKeyDown}
                inputMode="numeric"
              />
            </div>
          ) : null}
        </Tile>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={handleClose} disabled={addDevice.isPending}>
          Cancel
        </Button>
        <Button
          kind="primary"
          renderIcon={Add}
          onClick={() => {
            void handleAdd()
          }}
          disabled={addDevice.isPending || success || !host.trim()}
        >
          {addDevice.isPending ? 'Adding…' : 'Add Device'}
        </Button>
      </ModalFooter>
    </ComposedModal>
  )
}
