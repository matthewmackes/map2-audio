/**
 * T2499-A slice 3 — MeloAudio Commander adapter onto the framework.
 * T2499-A UI swap (2026-05-10) — the framework shell at
 * `/midi/devices/configurator/meloaudio` is now the canonical operator
 * surface; the bespoke `MeloAudioCommanderConfigurator` body is mounted
 * as the `Configurator` tab inside the shell. The legacy direct route
 * stays as a redirect for back-compat.
 */

import meloaudioCommanderApi from '../../../../map2/clients/meloaudioCommander'
import type {
  CommanderFirmwareKind,
  CommanderStatusResponse,
} from '../../../../map2/clients/meloaudioCommander'
import type {
  ConfiguratorPackDescriptor,
  DeviceDetectionStatus,
  DevicePresence,
} from '../types'
import { MeloAudioCommanderConfigurator } from '../../../pages/midi-services/MeloAudioCommanderConfigurator'

const FIRMWARE_TO_PRESENCE: Record<CommanderFirmwareKind, DevicePresence> = {
  stock: 'present_stock',
  custom: 'present_custom',
  dfu_bootloader: 'present_bootloader',
  unknown: 'present_unknown',
  not_present: 'not_present',
}

/**
 * Convert the bespoke `CommanderStatusResponse` into the generic
 * `DeviceDetectionStatus`. The pack-specific fields (vendor_id,
 * product_id, capability flags) are surfaced through `raw` so the
 * generic status card can list them without a per-pack widget.
 */
export function adaptCommanderStatus(
  status: CommanderStatusResponse,
): DeviceDetectionStatus {
  return {
    pack_id: 'meloaudio',
    presence: FIRMWARE_TO_PRESENCE[status.firmware_kind],
    transport: 'usb-sysfs',
    serial: status.serial,
    raw: {
      firmware_kind: status.firmware_kind,
      vendor_id: formatHex(status.vendor_id),
      product_id: formatHex(status.product_id),
      product_string: status.product_string ?? '',
      manufacturer_string: status.manufacturer_string ?? '',
      bcd_device: status.bcd_device ?? '',
      sysfs_path: status.sysfs_path ?? '',
      supports_discovery_wizard: status.supports_discovery_wizard,
      supports_canonical_config_push: status.supports_canonical_config_push,
    },
  }
}

function formatHex(value: number | null): string {
  if (value === null || value === undefined) return ''
  return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`
}

export const meloaudioCommanderPack: ConfiguratorPackDescriptor = {
  packId: 'meloaudio',
  displayName: 'MeloAudio MIDI Commander',
  vendorName: 'MeloAudio',
  summary:
    'Provision a MeloAudio MIDI Commander against this MAP2 install. ' +
    'Discovery wizard for stock firmware; canonical SysEx push for harvie256 custom firmware.',
  supportedPrimitives: ['detection', 'discovery', 'override', 'install', 'push'],
  fetchStatus: async () => adaptCommanderStatus(await meloaudioCommanderApi.getStatus()),
  // UI swap (2026-05-10) — the bespoke Configurator body now mounts as
  // a single tab inside the framework shell so the framework is the
  // canonical operator surface.
  tabs: [
    {
      id: 'configurator',
      label: 'Configurator',
      priority: 10,
      render: () => <MeloAudioCommanderConfigurator />,
    },
  ],
  metadata: {
    docs_url:
      'https://github.com/matthewmackes/map2-audio/blob/master/docs/midi/MELOAUDIO_COMMANDER_CONFIGURATOR.md',
    bespoke_route: '/midi/devices/configurator/meloaudio',
  },
}
