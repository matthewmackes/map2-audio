/**
 * T2459-H3-CFG Phase 5 slice 2 — MeloAudio MIDI Commander Configurator
 * page scaffold + status card.
 *
 * The Configurator is a side-tool: operators land here to provision a
 * Commander against this MAP2 install. Three high-level paths:
 *   1. Stock firmware — run the Discovery Wizard to capture per-installation
 *      CC/PC bindings into `~/.map2/devices/meloaudio-commander-discovered.yaml`.
 *      Necessary because stock firmware's CC mapping changes by mode and the
 *      device-pack defaults won't match every operator's unit.
 *   2. Custom firmware (harvie256) — push a MAP2-canonical SysEx config so
 *      the device emits known-good messages without per-installation discovery.
 *   3. DFU bootloader — finish flashing custom firmware (or restore stock by
 *      contacting MeloAudio support; the stock binary is not bundled).
 *
 * This slice only ships the status card. The Discovery Wizard (slice 3) and
 * Custom Firmware install flow (slice 4) follow.
 */

import { useQuery } from '@tanstack/react-query'
import {
  Heading,
  InlineLoading,
  InlineNotification,
  Layer,
  Section,
  StructuredListBody,
  StructuredListCell,
  StructuredListHead,
  StructuredListRow,
  StructuredListWrapper,
  Tag,
  Tile,
} from '@carbon/react'

import meloaudioCommanderApi, {
  type CommanderFirmwareKind,
  type CommanderStatusResponse,
} from '../../../map2/clients/meloaudioCommander'
import { MeloAudioCommanderDiscoveryPanel } from './MeloAudioCommanderDiscoveryPanel'
import { MeloAudioCommanderFirmwarePanel } from './MeloAudioCommanderFirmwarePanel'
import './MeloAudioCommanderConfigurator.css'

const STATUS_POLL_MS = 2500

const FIRMWARE_KIND_TAG: Record<
  CommanderFirmwareKind,
  { label: string; type: 'green' | 'blue' | 'magenta' | 'warm-gray' | 'cool-gray' }
> = {
  stock: { label: 'Stock firmware', type: 'blue' },
  custom: { label: 'Custom firmware', type: 'green' },
  dfu_bootloader: { label: 'DFU bootloader', type: 'magenta' },
  unknown: { label: 'Unknown', type: 'warm-gray' },
  not_present: { label: 'Not present', type: 'cool-gray' },
}

const FIRMWARE_KIND_COPY: Record<CommanderFirmwareKind, string> = {
  stock: 'Factory MeloAudio firmware. CC mappings depend on the active mode — run the Discovery Wizard to capture this installation’s bindings.',
  custom: 'harvie256 community firmware. Configurable via SysEx — push the MAP2 canonical config so MAP2 emits known-good messages.',
  dfu_bootloader: 'STM32 DFU bootloader. The device is mid-flash. Finish the install in the Custom Firmware tab or contact MeloAudio support to restore stock.',
  unknown: 'A device matching the Commander’s USB IDs is connected, but its iProduct string doesn’t match any known firmware.',
  not_present: 'No MIDI Commander or DFU bootloader is on the USB bus right now. Plug the device in and refresh — the page polls automatically.',
}

function formatHex(value: number | null): string {
  if (value === null || value === undefined) return '—'
  return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`
}

function formatString(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  return value
}

interface StatusCardProps {
  status: CommanderStatusResponse
}

export function MeloAudioCommanderStatusCard({ status }: StatusCardProps) {
  const tag = FIRMWARE_KIND_TAG[status.firmware_kind] ?? FIRMWARE_KIND_TAG.unknown
  const copy = FIRMWARE_KIND_COPY[status.firmware_kind] ?? FIRMWARE_KIND_COPY.unknown

  return (
    <Tile className="meloaudio-commander-configurator__status">
      <header className="meloaudio-commander-configurator__status-header">
        <Heading className="meloaudio-commander-configurator__status-title">
          Connection status
        </Heading>
        <div className="meloaudio-commander-configurator__status-tags">
          <Tag type={tag.type} size="sm" data-testid="firmware-kind-tag">
            {tag.label}
          </Tag>
          {status.is_present ? (
            <Tag type="green" size="sm">
              On bus
            </Tag>
          ) : (
            <Tag type="cool-gray" size="sm">
              Not on bus
            </Tag>
          )}
        </div>
      </header>
      <p className="meloaudio-commander-configurator__status-copy">{copy}</p>
      <StructuredListWrapper
        aria-label="Commander USB descriptors"
        className="meloaudio-commander-configurator__status-table"
      >
        <StructuredListHead>
          <StructuredListRow head>
            <StructuredListCell head>Field</StructuredListCell>
            <StructuredListCell head>Value</StructuredListCell>
          </StructuredListRow>
        </StructuredListHead>
        <StructuredListBody>
          <StructuredListRow>
            <StructuredListCell noWrap>USB vendor / product</StructuredListCell>
            <StructuredListCell>
              {formatHex(status.vendor_id)} / {formatHex(status.product_id)}
            </StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell noWrap>iProduct</StructuredListCell>
            <StructuredListCell>{formatString(status.product_string)}</StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell noWrap>iManufacturer</StructuredListCell>
            <StructuredListCell>{formatString(status.manufacturer_string)}</StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell noWrap>Serial</StructuredListCell>
            <StructuredListCell>{formatString(status.serial)}</StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell noWrap>bcdDevice</StructuredListCell>
            <StructuredListCell>{formatString(status.bcd_device)}</StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell noWrap>sysfs path</StructuredListCell>
            <StructuredListCell>{formatString(status.sysfs_path)}</StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell noWrap>Discovery Wizard</StructuredListCell>
            <StructuredListCell>
              {status.supports_discovery_wizard ? 'Available' : 'Not available'}
            </StructuredListCell>
          </StructuredListRow>
          <StructuredListRow>
            <StructuredListCell noWrap>Canonical SysEx push</StructuredListCell>
            <StructuredListCell>
              {status.supports_canonical_config_push ? 'Available' : 'Not available'}
            </StructuredListCell>
          </StructuredListRow>
        </StructuredListBody>
      </StructuredListWrapper>
    </Tile>
  )
}

export function MeloAudioCommanderConfigurator() {
  const statusQuery = useQuery({
    queryKey: ['meloaudio-commander', 'status'],
    queryFn: () => meloaudioCommanderApi.getStatus(),
    refetchInterval: STATUS_POLL_MS,
    refetchIntervalInBackground: false,
  })

  return (
    <Section className="meloaudio-commander-configurator">
      <Layer level={0}>
        <header className="meloaudio-commander-configurator__header">
          <Heading className="meloaudio-commander-configurator__title">
            MeloAudio MIDI Commander Configurator
          </Heading>
          <p className="meloaudio-commander-configurator__subtitle">
            Provision a connected Commander against this MAP2 install. Run the
            Discovery Wizard for stock firmware, or install + push a canonical
            config for harvie256 custom firmware.
          </p>
        </header>
      </Layer>

      {statusQuery.isLoading ? (
        <Tile className="meloaudio-commander-configurator__loading">
          <InlineLoading description="Detecting connected Commander…" />
        </Tile>
      ) : null}

      {statusQuery.isError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Could not detect Commander status"
          subtitle="The /api/devices/meloaudio/commander/status endpoint returned an error. Is the backend running?"
        />
      ) : null}

      {statusQuery.data ? (
        <Layer level={1}>
          <MeloAudioCommanderStatusCard status={statusQuery.data} />
        </Layer>
      ) : null}

      {statusQuery.data ? (
        <Layer level={1}>
          <MeloAudioCommanderDiscoveryPanel
            supportsDiscoveryWizard={statusQuery.data.supports_discovery_wizard}
          />
        </Layer>
      ) : null}

      {statusQuery.data ? (
        <Layer level={1}>
          <MeloAudioCommanderFirmwarePanel
            firmwareKind={statusQuery.data.firmware_kind}
            isPresent={statusQuery.data.is_present}
          />
        </Layer>
      ) : null}
    </Section>
  )
}

export default MeloAudioCommanderConfigurator
