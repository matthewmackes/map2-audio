// Single-source device list for the Detect phase of the "Connect a new
// keyboard" setup task. Per T2480 locked decision Q18 + Follow-up B
// (2026-05-01) refactor:
//
// All devices come from midiHubApi.getDevices(). The MIDI Hub registry
// already iterates every plugged-in ALSA port, attaches USB VID:PID
// (via discover_alsa_port_descriptors), and matches it to a profile —
// falling back to the 'generic_controller' profile when nothing matches.
//
// Distinction:
//   - Onboarded: profile_id !== 'generic_controller' OR manual_assignment
//     is set. The device has either been auto-matched to a curated profile
//     (by USB VID:PID or name pattern) or explicitly bound by the
//     operator. We can write a binding against device_id directly.
//   - New: profile_id === 'generic_controller' AND no manual_assignment.
//     The port is plugged in and discoverable but not yet associated with
//     a profile pack. Wizard offers an inline name-and-onboard prompt
//     (T2480 Follow-up D, 2026-05-01) before allowing Continue.
//
// VID:PID is now first-class on every entry (when known) — it shows up
// in the Detect-phase row sub-line and is available for any future
// downstream use.
//
// Old design (pre-Follow-up B): merged midiHubApi.getDevices() with
// midiApiV2.getDevices() (flat string list of port names). The v2 path
// added zero information beyond what the registry already had, and the
// port_name join key made VID:PID a tiebreaker rather than a primary
// signal. Removed in favor of registry-only.

import { useQuery } from '@tanstack/react-query'

import type { MidiHubDeviceState } from '@/map2/api'
import { midiHubApi } from '@/map2/clients/midiHub'

const GENERIC_CONTROLLER_PROFILE_ID = 'generic_controller'

export interface OnboardedKeyboard {
  source: 'onboarded'
  port_name: string
  device_id: string
  profile_id: string
  profile_name: string
  connected: boolean
  vendor_id: string | null
  product_id: string | null
  // Existing bindings on this device (e.g., a Brain snapshot that was
  // previously bound by this wizard or by the operator).
  bindings: Array<{
    consumer_type: string
    consumer_id: string
    consumer_name: string
    bound_at: string
    source: string
  }>
}

export interface NewKeyboard {
  source: 'new'
  port_name: string
  // Even "New" devices carry VID:PID when discovered via USB — the
  // wizard's inline name-and-onboard step uses it as a hint.
  vendor_id: string | null
  product_id: string | null
  /** The auto-generated device_id under the generic profile, e.g.
   * "generic_controller:my_kbd". Wizard onboarding upgrades this to
   * a real profile binding. */
  generic_device_id: string
}

export type DetectionEntry = OnboardedKeyboard | NewKeyboard

export interface DetectionListResult {
  entries: DetectionEntry[]
  onboarded_count: number
  new_count: number
}

function isGenericFallback(device: MidiHubDeviceState): boolean {
  return device.profile_id === GENERIC_CONTROLLER_PROFILE_ID && !device.manual_assignment
}

function toEntries(devices: readonly MidiHubDeviceState[]): DetectionEntry[] {
  const seenPortNames = new Set<string>()
  const onboarded: OnboardedKeyboard[] = []
  const newOnes: NewKeyboard[] = []

  for (const device of devices) {
    if (!device.port_names || device.port_names.length === 0) continue
    const primaryPort = device.port_names[0]!
    if (seenPortNames.has(primaryPort)) continue

    if (isGenericFallback(device)) {
      newOnes.push({
        source: 'new',
        port_name: primaryPort,
        vendor_id: device.vendor_id ?? null,
        product_id: device.product_id ?? null,
        generic_device_id: device.device_id,
      })
    } else {
      onboarded.push({
        source: 'onboarded',
        port_name: primaryPort,
        device_id: device.device_id,
        profile_id: device.profile_id,
        profile_name: device.profile_name,
        connected: device.connected,
        vendor_id: device.vendor_id ?? null,
        product_id: device.product_id ?? null,
        bindings: device.bindings ?? [],
      })
    }
    for (const alias of device.port_names) seenPortNames.add(alias)
  }

  return [...onboarded, ...newOnes]
}

/** Pure helper kept exported for the unit-test suite. */
export function buildDetectionEntries(
  devices: readonly MidiHubDeviceState[],
): DetectionListResult {
  const entries = toEntries(devices)
  const onboarded_count = entries.filter((e) => e.source === 'onboarded').length
  const new_count = entries.length - onboarded_count
  return { entries, onboarded_count, new_count }
}

interface UseKeyboardDetectionListOptions {
  enabled?: boolean
}

export function useKeyboardDetectionList({
  enabled = true,
}: UseKeyboardDetectionListOptions = {}) {
  const registryQuery = useQuery({
    queryKey: ['brain-setup', 'midi-hub-devices'],
    queryFn: () => midiHubApi.getDevices(true),
    enabled,
    staleTime: 0,
  })

  const isLoading = registryQuery.isLoading
  const error = registryQuery.error

  const merged: DetectionListResult = registryQuery.data
    ? buildDetectionEntries(registryQuery.data.devices ?? [])
    : { entries: [], onboarded_count: 0, new_count: 0 }

  const refetch = async () => {
    await registryQuery.refetch()
  }

  return {
    entries: merged.entries,
    onboardedCount: merged.onboarded_count,
    newCount: merged.new_count,
    isLoading,
    error,
    refetch,
  }
}
