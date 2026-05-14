// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Legacy device manifest — replaces the deprecated `deviceRegistry`
// for the residual call sites that need a label + open-route per
// legacy device id (left-rail pinned-device list in GlobalTreeNav,
// LegacyOutboardHardwareRedirect / LegacyPhysicalSurfacesRedirect
// in App.tsx).
//
// New devices ship as profile YAML under `device-packs/<vendor>/profiles/`
// and surface automatically in the Hardware Store. Add an entry below
// only when you build a new legacy hand-coded device-page route.
//
// Worklist: T2459-G11b.

import type { ComponentType } from 'react'
import { Devices as DevicesIcon } from '@carbon/icons-react'

export interface LegacyDeviceManifestEntry {
  id: string
  label: string
  legacyRoute: string
  icon: ComponentType<{ size?: number; className?: string }>
}

export const LEGACY_DEVICE_MANIFEST: ReadonlyArray<LegacyDeviceManifestEntry> = [
  { id: 'mpx1',                       label: 'Lexicon MPX-1',           legacyRoute: '/devices/mpx1',                       icon: DevicesIcon },
  { id: 'intelfx',                    label: 'IntelFX Processor',       legacyRoute: '/devices/intelfx',                    icon: DevicesIcon },
  { id: 'edirol-ua1000',              label: 'Edirol UA-1000',          legacyRoute: '/devices/edirol-ua1000',              icon: DevicesIcon },
  { id: 'hotone-jogg',                label: 'Hotone Jogg',             legacyRoute: '/devices/hotone-jogg',                icon: DevicesIcon },
  { id: 'tascam-us144mkii',           label: 'TASCAM US-144MKII',       legacyRoute: '/devices/tascam-us144mkii',           icon: DevicesIcon },
  { id: 'lcd',                        label: 'LCD Displays',            legacyRoute: '/devices/lcd',                        icon: DevicesIcon },
  { id: 'tesira',                     label: 'Biamp Tesira',            legacyRoute: '/devices/tesira',                     icon: DevicesIcon },
  { id: 'maschine-mk1',               label: 'Maschine MK1',            legacyRoute: '/maschine',                           icon: DevicesIcon },
  { id: 'ableton-push',               label: 'Ableton Push',            legacyRoute: '/labs/push-surface',                  icon: DevicesIcon },
  { id: 'ground-control-pro',         label: 'Ground Control Pro',      legacyRoute: '/ground-control-pro',                 icon: DevicesIcon },
  { id: 'meloaudio-midi-commander',   label: 'Meloaudio MIDI Commander',legacyRoute: '/midi-commander',                     icon: DevicesIcon },
  { id: 'novation-launch-control',    label: 'Novation Launch Control', legacyRoute: '/launch-control',                     icon: DevicesIcon },
  { id: 'mackie-mcu-pro',             label: 'Mackie MCU Pro',          legacyRoute: '/mcu',                                icon: DevicesIcon },
]

const _byId = new Map(LEGACY_DEVICE_MANIFEST.map((entry) => [entry.id, entry]))

export function getLegacyDeviceEntry(id: string): LegacyDeviceManifestEntry | undefined {
  return _byId.get(id)
}

export function isKnownLegacyDeviceId(id: string): boolean {
  return _byId.has(id)
}

// Pivot-13d cycle 1 — translation between the legacy pinned-device id
// space (used by the global nav pin store at
// `state/uiSettings.pinnedDevices`) and the meter-source registry id
// space (used by app/services/devices/*_meters.py + the
// /api/v1/devices/{id}/peak-meters route).
//
// The two namespaces drifted historically — manifest uses
// `edirol-ua1000` (no dash), the meter facade uses
// `edirol-ua-1000` (canonical USB-class style with the dash). Same
// for `mpx1` (manifest) vs `lexicon-mpx1` (registry vendor-prefixed).
//
// This map is intentionally narrow: only entries that appear in **both**
// namespaces need an override. Devices that are not metered (LCDs,
// Maschine, Push, controller surfaces) return null.
const PIN_TO_REGISTRY: Readonly<Record<string, string>> = Object.freeze({
  'edirol-ua1000': 'edirol-ua-1000',
  'mpx1': 'lexicon-mpx1',
  'hotone-jogg': 'hotone-jogg',
  'tascam-us144mkii': 'tascam-us144mkii',
})

/**
 * Translate a pinned-device id to the meter-source registry id used by
 * `/api/v1/devices/{id}/peak-meters`. Returns `null` when the device
 * isn't registered for metering at all (e.g. a controller surface) so
 * callers can filter it out cleanly.
 */
export function meterRegistryIdFromPinnedId(pinnedId: string): string | null {
  return PIN_TO_REGISTRY[pinnedId] ?? null
}

/** Convenience: translate a list of pinned ids, dropping non-metered entries. */
export function meterRegistryIdsFromPinnedIds(pinnedIds: readonly string[]): string[] {
  const out: string[] = []
  for (const id of pinnedIds) {
    const translated = meterRegistryIdFromPinnedId(id)
    if (translated !== null) out.push(translated)
  }
  return out
}
