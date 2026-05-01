// Two-source merged device list for the Detect phase of the
// "Connect a new keyboard" setup task. Per T2480 locked decision Q18:
// - Onboarded surfaces from the controller registry come first, tagged
//   "Onboarded" with the friendly profile name.
// - Raw MIDI input ports not matched to any registry record come second,
//   tagged "New" — operator gives them a name in-line.
//
// Merge key: port_name. The registry's MidiHubDeviceState carries port_names,
// and the raw inventory (midiApiV2.getDevices().input_devices) is a flat
// string[] of those same ALSA port names. USB VID:PID is captured on the
// onboarded side for tiebreaks but is not currently exposed by midiApiV2's
// raw enumeration — VID:PID matching is a hardening pass (iter 6).

import { useQuery } from '@tanstack/react-query'

import type { MidiHubDeviceState } from '@/map2/api'
import { midiApiV2 } from '@/map2/clients/midi'
import { midiHubApi } from '@/map2/clients/midiHub'

export interface OnboardedKeyboard {
  source: 'onboarded'
  port_name: string
  device_id: string
  profile_id: string
  profile_name: string
  connected: boolean
  vendor_id: string | null
  product_id: string | null
}

export interface NewKeyboard {
  source: 'new'
  port_name: string
}

export type DetectionEntry = OnboardedKeyboard | NewKeyboard

export interface DetectionListResult {
  entries: DetectionEntry[]
  onboarded_count: number
  new_count: number
}

function dedupePortNames(names: readonly string[]): string[] {
  return Array.from(new Set(names.filter((n) => typeof n === 'string' && n.trim() !== '')))
}

function indexOnboardedPorts(
  devices: readonly MidiHubDeviceState[],
): Map<string, OnboardedKeyboard> {
  const map = new Map<string, OnboardedKeyboard>()
  for (const device of devices) {
    if (!device.port_names || device.port_names.length === 0) continue
    const onboarded: OnboardedKeyboard = {
      source: 'onboarded',
      port_name: device.port_names[0]!,
      device_id: device.device_id,
      profile_id: device.profile_id,
      profile_name: device.profile_name,
      connected: device.connected,
      vendor_id: device.vendor_id ?? null,
      product_id: device.product_id ?? null,
    }
    for (const portName of device.port_names) {
      // First-write-wins: an onboarded device with multiple port names occupies
      // each port name only with its primary record.
      if (!map.has(portName)) {
        map.set(portName, { ...onboarded, port_name: portName })
      }
    }
  }
  return map
}

export function buildDetectionEntries(
  onboarded: readonly MidiHubDeviceState[],
  rawInputPortNames: readonly string[],
): DetectionListResult {
  const onboardedIndex = indexOnboardedPorts(onboarded)
  const seenPortNames = new Set<string>()
  const onboardedEntries: OnboardedKeyboard[] = []
  const newEntries: NewKeyboard[] = []

  // Onboarded first, in registry order, deduplicated by port_name.
  for (const device of onboarded) {
    if (!device.port_names || device.port_names.length === 0) continue
    const portName = device.port_names[0]!
    if (seenPortNames.has(portName)) continue
    const entry = onboardedIndex.get(portName)
    if (entry) {
      onboardedEntries.push(entry)
      seenPortNames.add(portName)
      // Mark every alias port as seen so raw enumeration doesn't double-list.
      for (const alias of device.port_names) seenPortNames.add(alias)
    }
  }

  // Raw ports that didn't match any registry record become "New".
  for (const rawName of dedupePortNames(rawInputPortNames)) {
    if (seenPortNames.has(rawName)) continue
    newEntries.push({ source: 'new', port_name: rawName })
    seenPortNames.add(rawName)
  }

  return {
    entries: [...onboardedEntries, ...newEntries],
    onboarded_count: onboardedEntries.length,
    new_count: newEntries.length,
  }
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

  const rawQuery = useQuery({
    queryKey: ['brain-setup', 'midi-raw-devices'],
    queryFn: () => midiApiV2.getDevices(),
    enabled,
    staleTime: 0,
  })

  const isLoading = registryQuery.isLoading || rawQuery.isLoading
  const error = registryQuery.error ?? rawQuery.error

  const merged: DetectionListResult = (() => {
    if (!registryQuery.data && !rawQuery.data) {
      return { entries: [], onboarded_count: 0, new_count: 0 }
    }
    return buildDetectionEntries(
      registryQuery.data?.devices ?? [],
      rawQuery.data?.input_devices ?? [],
    )
  })()

  const refetch = async () => {
    await Promise.all([registryQuery.refetch(), rawQuery.refetch()])
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
