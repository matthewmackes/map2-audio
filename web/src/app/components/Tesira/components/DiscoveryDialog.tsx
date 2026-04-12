/**
 * DiscoveryDialog — auto-discover and adopt Biamp Tesira Forte AVB units.
 *
 * Flow:
 *   idle → scanning (POST /discovery/start)
 *        → found/not_found (scan complete)
 *        → adopting (POST /discovery/adopt per device)
 *        → adopted (green check per device)
 *        → error (scan or adopt failure)
 *
 * Uses:
 *   - REST polling via useDiscoveryStatus (1 s interval while scanning)
 *   - WebSocket push via useTesiraDiscoveryEvents (live device-found events)
 */
import React, { useState, useCallback, useEffect } from 'react'
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
import { Search } from '@carbon/icons-react'
import { MapMatrixProcessorIcon } from '../../icons/map'
import { EmptyState } from '../../shared/EmptyState'
import { LoadingState } from '../../shared/LoadingState'
import {
  useStartDiscovery,
  useDiscoveryStatus,
  useAdoptDevice,
  useAddDevice,
} from '../hooks/useTesiraApi'
import { useTesiraDiscoveryEvents } from '../hooks/useTesiraWebSocket'
import type { DiscoveredTesiraDevice } from '../types'
import './TesiraCarbonChrome.css'

const DEFAULT_TIMEOUT = 8

interface DiscoveryDialogProps {
  open: boolean
  onClose: () => void
}

function modelVariant(model: string | null): 'CI' | 'VI' | null {
  if (!model) return null
  const upper = model.toUpperCase()
  if (upper.includes(' CI')) return 'CI'
  if (upper.includes(' VI')) return 'VI'
  return null
}

function DeviceModelTag({ model }: { model: string | null }) {
  const variant = modelVariant(model)
  if (!variant) return null

  return (
    <Tag type={variant === 'CI' ? 'teal' : 'blue'} size="sm">
      {variant}
    </Tag>
  )
}

function deviceMeta(device: DiscoveredTesiraDevice): string {
  return [
    `${device.host}:${device.port}`,
    device.serial_number ? `SN ${device.serial_number}` : null,
    device.firmware_version ? `FW ${device.firmware_version}` : null,
    device.mac_address ? `MAC ${device.mac_address}` : null,
  ].filter(Boolean).join(' · ')
}

interface DiscoveryDeviceTileProps {
  device: DiscoveredTesiraDevice
  nameValue: string
  onNameChange: (name: string) => void
  onAdopt: () => void
  adopted: boolean
  adopting: boolean
  adoptError: string | null
}

function DiscoveryDeviceTile({
  device,
  nameValue,
  onNameChange,
  onAdopt,
  adopted,
  adopting,
  adoptError,
}: DiscoveryDeviceTileProps) {
  const ttpEnabled = device.ttp_enabled !== false
  const hostId = device.host.replace(/[^a-z0-9_-]/gi, '-')

  return (
    <Tile className="tesira-discovery-modal__device">
      <div className="tesira-discovery-modal__device-header">
        <div>
          <div className="tesira-discovery-modal__device-title-row">
            <span className="tesira-discovery-modal__device-icon" aria-hidden>
              <MapMatrixProcessorIcon size={16} color="var(--cds-support-error)" />
            </span>
            <h3 className="tesira-discovery-modal__device-title">
              {device.model ?? device.hostname ?? device.mdns_name ?? device.host}
            </h3>
          </div>
          <p className="tesira-discovery-modal__device-meta">{deviceMeta(device)}</p>
        </div>

        <div className="tesira-discovery-modal__device-tags">
          <DeviceModelTag model={device.model} />
          {!ttpEnabled ? <Tag type="warm-gray" size="sm">TTP off</Tag> : null}
          {device.already_configured ? <Tag type="cool-gray" size="sm">Already configured</Tag> : null}
          {adopted ? <Tag type="green" size="sm">Added to fleet</Tag> : null}
        </div>
      </div>

      {!ttpEnabled ? (
        <p className="tesira-discovery-modal__device-note">
          Detected via port 61451. Enable TTP in Tesira Software before MAP2 can establish full runtime control.
        </p>
      ) : null}

      {adoptError ? <p className="tesira-discovery-modal__device-error">{adoptError}</p> : null}

      {!adopted ? (
        <div className="tesira-discovery-modal__device-actions">
          <TextInput
            id={`tesira-discovery-name-${hostId}`}
            labelText="Name"
            value={nameValue}
            onChange={(event) => onNameChange(event.target.value)}
            disabled={adopting || device.already_configured}
          />
          <Button
            size="sm"
            kind={ttpEnabled ? 'primary' : 'secondary'}
            onClick={onAdopt}
            disabled={adopting || device.already_configured}
          >
            {adopting ? 'Working…' : ttpEnabled ? 'Adopt' : 'Add'}
          </Button>
        </div>
      ) : (
        <p className="tesira-discovery-modal__device-note">
          This device is now tracked in the Tesira fleet. Continue from the onboarding wizard or the device dashboard.
        </p>
      )}
    </Tile>
  )
}

export function DiscoveryDialog({ open, onClose }: DiscoveryDialogProps) {
  const [names, setNames] = useState<Record<string, string>>({})
  const [adopted, setAdopted] = useState<Record<string, boolean>>({})
  const [adoptingHost, setAdoptingHost] = useState<string | null>(null)
  const [adoptErrors, setAdoptErrors] = useState<Record<string, string>>({})
  const [hasScanned, setHasScanned] = useState(false)

  const startDiscovery = useStartDiscovery()
  const { data: status } = useDiscoveryStatus()
  const adoptDevice = useAdoptDevice()
  const addDevice = useAddDevice()

  const isScanning = status?.is_scanning ?? false
  const devices = status?.devices ?? []
  const scanError = status?.error ?? null

  useTesiraDiscoveryEvents(useCallback((event) => {
    if (event.event === 'device_found' && event.device) {
      const discovered = event.device
      setNames((prev) => (
        prev[discovered.host] !== undefined
          ? prev
          : { ...prev, [discovered.host]: discovered.hostname ?? discovered.mdns_name ?? discovered.host }
      ))
    }
  }, []))

  useEffect(() => {
    devices.forEach((device) => {
      setNames((prev) => (
        prev[device.host] !== undefined
          ? prev
          : { ...prev, [device.host]: device.hostname ?? device.mdns_name ?? device.host }
      ))
    })
  }, [devices])

  const handleScan = () => {
    setAdopted({})
    setAdoptErrors({})
    setHasScanned(true)
    startDiscovery.mutate(DEFAULT_TIMEOUT)
  }

  const handleAdopt = async (device: DiscoveredTesiraDevice) => {
    setAdoptingHost(device.host)
    setAdoptErrors((prev) => ({ ...prev, [device.host]: '' }))
    try {
      if (device.ttp_enabled === false) {
        await addDevice.mutateAsync({ host: device.host, port: device.port, name: names[device.host] })
      } else {
        await adoptDevice.mutateAsync({ host: device.host, name: names[device.host] })
      }
      setAdopted((prev) => ({ ...prev, [device.host]: true }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add device'
      setAdoptErrors((prev) => ({ ...prev, [device.host]: message }))
    } finally {
      setAdoptingHost(null)
    }
  }

  const handleClose = () => {
    if (!isScanning) onClose()
  }

  return (
    <ComposedModal open={open} onClose={handleClose} size="lg" className="tesira-discovery-modal">
      <ModalHeader
        title="Discover Tesira Devices"
        label="Tesira enrollment"
        closeModal={handleClose}
      />
      <ModalBody hasScrollingContent className="tesira-discovery-modal__body">
        <Tile className="tesira-discovery-modal__tile">
          <div className="tesira-discovery-modal__header">
            <div>
              <p className="tesira-dashboard__eyebrow">Discovery scan</p>
              <h3 className="tesira-dashboard__title">Find factory-reset Tesira units on the LAN</h3>
              <p className="tesira-dashboard__summary">
                MAP2 scans mDNS plus Biamp discovery visibility for Tesira Forte units. The scan runs for {DEFAULT_TIMEOUT} seconds and can add units even before TTP is enabled.
              </p>
            </div>
            <div className="tesira-discovery-modal__device-tags">
              <Tag type="blue" size="sm">Factory reset</Tag>
              <Tag type="cool-gray" size="sm">mDNS + port 61451</Tag>
              <Tag type="green" size="sm">MAP2 fleet handoff</Tag>
            </div>
          </div>
        </Tile>

        {startDiscovery.isError ? (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Failed to start discovery scan"
            subtitle={String(startDiscovery.error)}
          />
        ) : null}

        {scanError && !isScanning ? (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Discovery scan finished with a warning"
            subtitle={scanError}
          />
        ) : null}

        <Tile className="tesira-discovery-modal__tile">
          <div className="tesira-discovery-modal__header">
            <div>
              <p className="tesira-dashboard__eyebrow">Scan status</p>
              <h3 className="tesira-dashboard__title">
                {isScanning ? 'Scanning the network now' : hasScanned ? 'Latest scan complete' : 'No scan started yet'}
              </h3>
              <p className="tesira-dashboard__summary">
                {isScanning
                  ? devices.length > 0
                    ? `${devices.length} device${devices.length === 1 ? '' : 's'} found so far.`
                    : 'Looking for Tesira units that are visible from the current network segment.'
                  : hasScanned
                    ? `${devices.length} device${devices.length === 1 ? '' : 's'} found in the latest discovery run.`
                    : 'Run a discovery scan to populate this dialog with adoptable Tesira devices.'}
              </p>
            </div>
            <div className="tesira-discovery-modal__device-tags">
              <Tag type={isScanning ? 'blue' : hasScanned ? 'cool-gray' : 'warm-gray'} size="sm">
                {isScanning ? 'Scanning' : hasScanned ? 'Scan complete' : 'Idle'}
              </Tag>
              {devices.length > 0 ? (
                <Tag type="green" size="sm">
                  {devices.length} found
                </Tag>
              ) : null}
            </div>
          </div>

          {isScanning ? <LoadingState description="Scanning Tesira discovery sources" /> : null}
        </Tile>

        {devices.length > 0 ? (
          <div className="tesira-discovery-modal__results">
            {devices.map((device) => (
              <DiscoveryDeviceTile
                key={device.host}
                device={device}
                nameValue={names[device.host] ?? ''}
                onNameChange={(name) => setNames((prev) => ({ ...prev, [device.host]: name }))}
                onAdopt={() => {
                  void handleAdopt(device)
                }}
                adopted={adopted[device.host] ?? false}
                adopting={adoptingHost === device.host}
                adoptError={adoptErrors[device.host] || null}
              />
            ))}
          </div>
        ) : hasScanned && !isScanning ? (
          <EmptyState
            title="No Tesira devices were discovered on the current network segment"
            description="Fall back to manual IP enrollment if the unit is reachable but blocked from discovery."
            align="left"
          />
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={handleClose} disabled={isScanning}>
          Close
        </Button>
        <Button kind="primary" renderIcon={Search} onClick={handleScan} disabled={isScanning}>
          {isScanning ? 'Scanning…' : 'Start discovery scan'}
        </Button>
      </ModalFooter>
    </ComposedModal>
  )
}
