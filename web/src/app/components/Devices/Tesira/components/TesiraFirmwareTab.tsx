import React, { useState } from 'react'
import {
  CheckmarkOutline,
  ChevronDown,
  ChevronUp,
  Download,
  Launch,
  Power,
  Renew,
  WarningAlt,
} from '@carbon/icons-react'
import { Button, InlineNotification, Link, Tag, Tile } from '@carbon/react'
import { useDeviceFirmware, useFirmwareLatest, useRebootDevice, useTesiraDevices } from '../hooks/useTesiraApi'
import type { TesiraFirmwareStatus, TesiraLatestFirmware } from '../types'
import { EmptyState } from '../../../shared/EmptyState'
import { LoadingState } from '../../../shared/LoadingState'
import './TesiraCarbonChrome.css'

interface TesiraFirmwareTabProps {
  deviceId: string
  embedded?: boolean
}

type RebootNotice = {
  kind: 'success' | 'error'
  message: string
}

function firmwareStatusTag(firmware: TesiraFirmwareStatus): React.ReactNode {
  if (!firmware.connected) {
    return <Tag type="cool-gray" size="sm">Offline</Tag>
  }
  if (firmware.update_available) {
    return <Tag type="red" size="sm">Update available</Tag>
  }
  return <Tag type="green" size="sm">Up to date</Tag>
}

export function TesiraFirmwareTab({ deviceId, embedded = false }: TesiraFirmwareTabProps) {
  const { data: devices = [], isLoading: devicesLoading } = useTesiraDevices()
  const { data: latest, isLoading: latestLoading, refetch: refetchLatest } = useFirmwareLatest()

  return (
    <div className={embedded ? 'tesira-firmware-tab tesira-firmware-tab--embedded' : 'tesira-firmware-tab'}>
      <Tile className="tesira-firmware-tab__tile">
        <div className="tesira-firmware-tab__header">
          <div>
            <p className="tesira-dashboard__eyebrow">Fleet firmware</p>
            <h3 className="tesira-dashboard__title">Compare installed and latest Tesira releases</h3>
            <p className="tesira-dashboard__summary">
              Review firmware posture across the fleet before package deployment, scene capture, or recovery work on a used unit.
            </p>
          </div>
          <div className="tesira-firmware-tab__actions">
            <Button
              size="sm"
              kind="ghost"
              renderIcon={Renew}
              onClick={() => {
                refetchLatest().catch(() => undefined)
              }}
              disabled={latestLoading}
            >
              Refresh latest
            </Button>
          </div>
        </div>

        {latest ? (
          <div className="tesira-firmware-tab__meta">
            <Tag type="blue" size="sm">{`Latest ${latest.version ?? '—'}`}</Tag>
            {latest.fetched_at ? (
              <Tag type="cool-gray" size="sm">
                {`Checked ${new Date(latest.fetched_at).toLocaleTimeString()}`}
              </Tag>
            ) : null}
            {latest.release_notes_url ? (
              <Link href={latest.release_notes_url} target="_blank" rel="noopener noreferrer">
                Release notes
              </Link>
            ) : null}
          </div>
        ) : null}

        {devicesLoading ? (
          <div className="tesira-firmware-tab__loading">
            <LoadingState description="Loading firmware fleet status" />
          </div>
        ) : devices.length === 0 ? (
          <EmptyState
            className="tesira-presets-tab__empty"
            title="No devices in fleet"
            description="Add or discover Tesira devices to compare firmware posture."
            compact
            align="left"
          />
        ) : (
          <div className="tesira-firmware-tab__table-wrap">
            <table className="tesira-quick-console__table" aria-label="Tesira fleet firmware status">
              <thead>
                <tr>
                  <th scope="col">Device</th>
                  <th scope="col">Current</th>
                  <th scope="col">Latest</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <DeviceRow
                    key={device.device_id}
                    deviceId={device.device_id}
                    latestVersion={latest?.version ?? null}
                    selected={device.device_id === deviceId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tile>

      {deviceId ? (
        <Tile className="tesira-firmware-tab__tile">
          <DeviceDetail deviceId={deviceId} latestVersion={latest?.version ?? null} latestFirmware={latest} />
        </Tile>
      ) : null}
    </div>
  )
}

function DeviceRow({
  deviceId,
  latestVersion,
  selected,
}: {
  deviceId: string
  latestVersion: string | null
  selected: boolean
}) {
  const { data: firmware, isLoading } = useDeviceFirmware(deviceId)

  if (isLoading) {
    return (
      <tr>
        <td colSpan={4}>
          <div className="tesira-firmware-tab__row-loading">
            <LoadingState description="Loading device firmware" variant="inline" />
          </div>
        </td>
      </tr>
    )
  }

  if (!firmware) {
    return null
  }

  return (
    <tr className={selected ? 'tesira-firmware-tab__row tesira-firmware-tab__row--selected' : 'tesira-firmware-tab__row'}>
      <td>
        <div className="tesira-firmware-tab__device-copy">
          <span className="tesira-firmware-tab__device-name">{firmware.name || firmware.host}</span>
          <span className="tesira-firmware-tab__device-meta">{firmware.host}</span>
        </div>
      </td>
      <td>{firmware.connected ? (firmware.current_version ?? '—') : '—'}</td>
      <td>{latestVersion ?? '—'}</td>
      <td>{firmwareStatusTag(firmware)}</td>
    </tr>
  )
}

function DeviceDetail({
  deviceId,
  latestVersion,
  latestFirmware,
}: {
  deviceId: string
  latestVersion: string | null
  latestFirmware: TesiraLatestFirmware | undefined
}) {
  const { data: firmware, isLoading } = useDeviceFirmware(deviceId)
  const reboot = useRebootDevice()
  const [guideOpen, setGuideOpen] = useState(false)
  const [rebootNotice, setRebootNotice] = useState<RebootNotice | null>(null)

  const handleReboot = async () => {
    setRebootNotice(null)
    try {
      const result = await reboot.mutateAsync(deviceId)
      setRebootNotice({
        kind: 'success',
        message: result.message || 'Reboot command sent. Device will reconnect shortly.',
      })
    } catch (error: unknown) {
      setRebootNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (isLoading) {
    return (
      <div className="tesira-firmware-tab__loading">
        <LoadingState description="Loading firmware detail" />
      </div>
    )
  }

  if (!firmware) {
    return (
      <EmptyState
        className="tesira-presets-tab__empty"
        title="Firmware detail unavailable"
        description="The selected device did not return firmware detail."
        compact
        align="left"
      />
    )
  }

  return (
    <div className="tesira-firmware-tab__detail">
      <div className="tesira-firmware-tab__header">
        <div>
          <p className="tesira-dashboard__eyebrow">Selected device</p>
          <h3 className="tesira-dashboard__title">{`${firmware.name || firmware.host} firmware detail`}</h3>
          <p className="tesira-dashboard__summary">
            Tesira firmware updates still require Tesira Software on Windows or macOS. MAP2 surfaces the current version, latest release, download path, and reboot control.
          </p>
        </div>
        <div className="tesira-firmware-tab__actions">
          {firmwareStatusTag(firmware)}
          {latestVersion ? <Tag type="cool-gray" size="sm">{`Latest ${latestVersion}`}</Tag> : null}
        </div>
      </div>

      <div className="tesira-firmware-tab__stats">
        <div className="tesira-firmware-tab__stat">
          <p className="tesira-dashboard__stat-label">Current</p>
          <p className="tesira-dashboard__stat-value">{firmware.connected ? (firmware.current_version ?? '—') : '—'}</p>
        </div>
        <div className="tesira-firmware-tab__stat">
          <p className="tesira-dashboard__stat-label">Latest</p>
          <p className="tesira-dashboard__stat-value">{latestVersion ?? '—'}</p>
        </div>
        <div className="tesira-firmware-tab__stat">
          <p className="tesira-dashboard__stat-label">Connectivity</p>
          <p className="tesira-dashboard__stat-value">{firmware.connected ? 'Online' : 'Offline'}</p>
        </div>
      </div>

      <div className="tesira-firmware-tab__actions">
        <Button
          size="sm"
          kind="secondary"
          renderIcon={Power}
          disabled={!firmware.connected || reboot.isPending}
          onClick={() => {
            void handleReboot()
          }}
        >
          {reboot.isPending ? 'Rebooting…' : 'Reboot device'}
        </Button>

        {latestFirmware?.download_url ? (
          <Button
            size="sm"
            kind="primary"
            href={latestFirmware.download_url}
            target="_blank"
            rel="noopener noreferrer"
            renderIcon={Download}
          >
            Download firmware
          </Button>
        ) : null}

        {latestFirmware?.update_path_url ? (
          <Button
            size="sm"
            kind="ghost"
            href={latestFirmware.update_path_url}
            target="_blank"
            rel="noopener noreferrer"
            renderIcon={Launch}
          >
            Update path guide
          </Button>
        ) : null}
      </div>

      {rebootNotice ? (
        <InlineNotification
          kind={rebootNotice.kind === 'error' ? 'error' : 'success'}
          lowContrast
          hideCloseButton
          title={rebootNotice.kind === 'error' ? 'Reboot failed' : 'Reboot command sent'}
          subtitle={rebootNotice.message}
        />
      ) : null}

      <div className="tesira-firmware-tab__guide-toggle">
        <Button
          size="sm"
          kind="ghost"
          renderIcon={guideOpen ? ChevronUp : ChevronDown}
          onClick={() => setGuideOpen((value) => !value)}
        >
          How to update firmware
        </Button>
      </div>

      {guideOpen ? (
        <div className="tesira-firmware-tab__guide">
          <p className="tesira-dashboard__summary">
            Biamp Tesira firmware is updated through <strong>Tesira Software</strong>. MAP2 can guide the workflow, but it does not flash firmware over TTP.
          </p>
          <ol className="tesira-firmware-tab__guide-list">
            <li>
              Download the `.tfa2` firmware package from{' '}
              {latestFirmware?.download_url ? (
                <Link href={latestFirmware.download_url} target="_blank" rel="noopener noreferrer">
                  Biamp support
                </Link>
              ) : (
                'Biamp support'
              )}
              .
            </li>
            <li>Open Tesira Software on a Windows or macOS computer.</li>
            <li>Connect to the device in Tesira Software.</li>
            <li>Open Device Maintenance and choose Update Firmware.</li>
            <li>Select the `.tfa2` package and target the Tesira units that need the update.</li>
            <li>Do not interrupt power during the update window.</li>
            <li>Use the reboot control above if Tesira Software requests a restart.</li>
          </ol>
        </div>
      ) : null}
    </div>
  )
}
