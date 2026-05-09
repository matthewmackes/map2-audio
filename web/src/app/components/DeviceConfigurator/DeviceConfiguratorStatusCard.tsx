/**
 * T2499-A slice 2 — Generic device-detection status card.
 *
 * Renders presence + transport + serial + raw descriptors for any
 * device-pack that supplies a `DeviceDetectionStatus`. Per-device
 * tabs render below; this card is the same shape across packs.
 */
import {
  Heading,
  StructuredListBody,
  StructuredListCell,
  StructuredListHead,
  StructuredListRow,
  StructuredListWrapper,
  Tag,
  Tile,
} from '@carbon/react'

import type {
  ConfiguratorPackDescriptor,
  DeviceDetectionStatus,
  DevicePresence,
} from './types'
import './DeviceConfiguratorShell.css'

const PRESENCE_TAG: Record<
  DevicePresence,
  { label: string; type: 'green' | 'blue' | 'magenta' | 'warm-gray' | 'cool-gray' }
> = {
  not_present: { label: 'Not on bus', type: 'cool-gray' },
  present_stock: { label: 'Stock', type: 'blue' },
  present_custom: { label: 'Custom', type: 'green' },
  present_bootloader: { label: 'Bootloader', type: 'magenta' },
  present_unknown: { label: 'Unknown', type: 'warm-gray' },
}

const PRESENCE_COPY: Record<DevicePresence, string> = {
  not_present:
    'No device matching this pack is on the bus. Plug it in and the page will refresh automatically.',
  present_stock:
    'Stock factory firmware. Run the Discovery Wizard or pick from device-pack defaults.',
  present_custom:
    'Custom firmware. Push a canonical config so the device emits known-good messages.',
  present_bootloader:
    'Device is in bootloader mode. Finish the firmware install or recover the previous firmware.',
  present_unknown:
    'A device matching this pack is connected, but its descriptors do not match a known mode.',
}

function formatRawValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return JSON.stringify(value)
}

interface DeviceConfiguratorStatusCardProps {
  pack: ConfiguratorPackDescriptor
  status: DeviceDetectionStatus
}

export function DeviceConfiguratorStatusCard({
  pack,
  status,
}: DeviceConfiguratorStatusCardProps) {
  const tag = PRESENCE_TAG[status.presence] ?? PRESENCE_TAG.present_unknown
  const copy = PRESENCE_COPY[status.presence] ?? PRESENCE_COPY.present_unknown
  const rawEntries = Object.entries(status.raw ?? {})

  return (
    <Tile className="device-configurator__status">
      <header className="device-configurator__status-header">
        <Heading className="device-configurator__status-title">
          Connection status
        </Heading>
        <div
          className="device-configurator__status-tags"
          data-testid="device-configurator-status-tags"
        >
          <Tag type={tag.type} size="sm" data-testid="presence-tag">
            {tag.label}
          </Tag>
          <Tag type="cool-gray" size="sm">
            {status.transport}
          </Tag>
        </div>
      </header>
      <p className="device-configurator__status-copy">{copy}</p>
      <StructuredListWrapper
        aria-label={`${pack.displayName} descriptors`}
        className="device-configurator__status-table"
      >
        <StructuredListHead>
          <StructuredListRow head>
            <StructuredListCell head>Field</StructuredListCell>
            <StructuredListCell head>Value</StructuredListCell>
          </StructuredListRow>
        </StructuredListHead>
        <StructuredListBody>
          <StructuredListRow>
            <StructuredListCell noWrap>Pack ID</StructuredListCell>
            <StructuredListCell>{status.pack_id}</StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell noWrap>Serial</StructuredListCell>
            <StructuredListCell>{formatRawValue(status.serial)}</StructuredListCell>
          </StructuredListRow>
          {rawEntries.map(([key, value]) => (
            <StructuredListRow key={key}>
              <StructuredListCell noWrap>{key}</StructuredListCell>
              <StructuredListCell>{formatRawValue(value)}</StructuredListCell>
            </StructuredListRow>
          ))}
        </StructuredListBody>
      </StructuredListWrapper>
    </Tile>
  )
}
