/**
 * T2459-H5 Slice 20 — TanStack Query hook for the MIDI v1 legacy-route
 * retirement schedule (`/api/v2/midi/legacy_retirement_status`).
 *
 * Returned payload (matches the slice-15 backend envelope):
 *   - retired: boolean — has MAP2_MIDI_LEGACY_RETIRED been flipped?
 *   - sunset: RFC 8594 Sunset header value
 *   - sunset_iso: ISO 8601 sunset timestamp (or null if header malformed)
 *   - successor_prefix: '/api/v2/midi'
 *   - now: ISO 8601 timestamp
 *   - days_remaining: integer | null — null after retirement
 *   - flag_env_var: 'MAP2_MIDI_LEGACY_RETIRED'
 *
 * The retirement banner uses this hook to render an InlineNotification
 * countdown ("MIDI v1 retires in N days") on every MIDI Services page.
 * 60s poll — the schedule changes daily at most, no need to hammer it.
 */

import { useQuery } from '@tanstack/react-query'

export interface MidiLegacyRetirementStatus {
  retired: boolean
  sunset: string
  sunset_iso: string | null
  successor_prefix: string
  now: string
  days_remaining: number | null
  flag_env_var: string
}

async function fetchMidiLegacyRetirementStatus(): Promise<MidiLegacyRetirementStatus> {
  const response = await fetch('/api/v2/midi/legacy_retirement_status')
  if (!response.ok) {
    throw new Error(`legacy_retirement_status failed: ${response.status}`)
  }
  return (await response.json()) as MidiLegacyRetirementStatus
}

export function useMidiLegacyRetirement() {
  return useQuery({
    queryKey: ['midi-legacy-retirement-status'],
    queryFn: fetchMidiLegacyRetirementStatus,
    refetchInterval: 60_000,
    staleTime: 0,
  })
}
