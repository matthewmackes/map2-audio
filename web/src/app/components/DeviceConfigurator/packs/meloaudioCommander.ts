/**
 * T2499-A slice 3 — MeloAudio Commander adapter onto the framework.
 *
 * This is the parity test for the framework: the live MeloAudio
 * Configurator UI keeps using its bespoke shell (the production HIL
 * path), but the framework now has a `ConfiguratorPackDescriptor`
 * that adapts MeloAudio's existing API client to the generic shape.
 *
 * Future slices wire this descriptor into the device-pack picker
 * (slice 4) and the bindings writer (slice 6). The full UI swap onto
 * `DeviceConfiguratorShell` is a later slice once the framework has
 * more mileage from other packs (Maschine, MPX-1, IntelFX).
 */

import meloaudioCommanderApi, {
  type CommanderFirmwareKind,
  type CommanderStatusResponse,
} from '../../../../map2/clients/meloaudioCommander'
import type {
  ConfiguratorPackDescriptor,
  DeviceDetectionStatus,
  DevicePresence,
} from '../types'

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
  // Tabs are intentionally empty in slice 3: the bespoke
  // MeloAudioCommanderConfigurator surface is the production UI and
  // continues to handle the wizard + firmware install flows. This
  // adapter exists so other framework consumers (the device-pack
  // picker, the bindings writer) can interrogate MeloAudio through
  // the generic seam.
  tabs: [],
  metadata: {
    docs_url:
      'https://github.com/matthewmackes/map2-audio/blob/master/docs/midi/MELOAUDIO_COMMANDER_CONFIGURATOR.md',
    bespoke_route: '/midi-services/devices/meloaudio-midi-commander/configurator',
  },
}
