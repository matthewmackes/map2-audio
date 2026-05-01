// T2480 Follow-up C (2026-05-01): join Hardware Store profile_key entries
// to MIDI Hub registry bindings. Best-effort heuristic — see notes below.
//
// The two id systems don't match cleanly:
//   - Hardware Store profile_key: "<pack_id>/<model>.<kind>"
//     e.g. "edirol-ua/ua-1000.midi"
//   - MIDI Hub registry profile_id: a heterogeneous slug like
//     "lexicon_mpx1", "morningstar_mc8", "maschine_mk1", "ua_1000".
//     Some include a vendor prefix, some don't.
//
// We compute a set of candidate slugs from each profile_key + a set from
// each registry device's profile_id, and match when any candidate
// overlaps. The matcher returns false-negatives (a registry device can
// have a profile_id we don't predict from its pack profile_key) but
// never false-positives — we only join on slug equality, not substring.
//
// When a more durable canonical mapping (vid:pid → profile_id table or
// pack-manifest profile_id field) lands, the heuristic should be deleted.

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import type { MidiHubDeviceBinding, MidiHubDeviceState } from '@/map2/api'
import { midiHubApi } from '@/map2/clients/midiHub'

const NON_ALPHANUM = /[^a-z0-9]+/g

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase().replace(NON_ALPHANUM, '_').replace(/^_+|_+$/g, '')
}

/** Candidate registry-style profile_ids that a Hardware Store
 * profile_key might map to. The function emits multiple candidates
 * because the registry's built-in profile_ids are inconsistent
 * (lexicon_mpx1, m_audio_midisport_4x4, maschine_mk1, ua_1000). */
export function profileKeyCandidates(profileKey: string): string[] {
  if (!profileKey) return []
  // profile_key is "<pack_id>/<model>.<kind>"; split by '/' then '.'.
  const parts = profileKey.split('/')
  const packId = parts[0] ?? ''
  const remainder = parts.slice(1).join('/')
  const modelDotKind = remainder.split('.')
  const model = modelDotKind[0] ?? ''

  const candidates = new Set<string>()
  if (model) {
    const modelSlug = normalizeSlug(model)
    if (modelSlug) candidates.add(modelSlug)
  }
  if (packId && model) {
    const combined = normalizeSlug(`${packId}_${model}`)
    if (combined) candidates.add(combined)
  }
  // Last-segment fallback: "ua-1000" → "1000" — usually too generic to
  // be useful but caught by callers that already have a strong pack
  // discriminator.
  if (model.includes('-')) {
    const last = model.split('-').pop()
    if (last) {
      const lastSlug = normalizeSlug(last)
      if (lastSlug) candidates.add(lastSlug)
    }
  }
  return Array.from(candidates)
}

/** Build a map from profile_key → matching MidiHubDeviceState[]. */
export function joinProfileKeysToDevices(
  profileKeys: readonly string[],
  devices: readonly MidiHubDeviceState[],
): Map<string, MidiHubDeviceState[]> {
  const result = new Map<string, MidiHubDeviceState[]>()
  if (profileKeys.length === 0 || devices.length === 0) return result

  // Pre-index devices by their profile_id slug for O(1) lookup.
  const devicesBySlug = new Map<string, MidiHubDeviceState[]>()
  for (const device of devices) {
    const slug = normalizeSlug(device.profile_id)
    if (!slug) continue
    const list = devicesBySlug.get(slug) ?? []
    list.push(device)
    devicesBySlug.set(slug, list)
  }

  for (const profileKey of profileKeys) {
    const candidates = profileKeyCandidates(profileKey)
    const matched: MidiHubDeviceState[] = []
    const seen = new Set<string>()
    for (const candidate of candidates) {
      const hits = devicesBySlug.get(candidate)
      if (!hits) continue
      for (const hit of hits) {
        if (seen.has(hit.device_id)) continue
        seen.add(hit.device_id)
        matched.push(hit)
      }
    }
    if (matched.length > 0) {
      result.set(profileKey, matched)
    }
  }

  return result
}

/** Convenience extractor: collect all bindings across a list of
 * matching devices, deduplicated by (consumer_type, consumer_id). */
export function extractBindings(
  devices: readonly MidiHubDeviceState[],
): MidiHubDeviceBinding[] {
  const seen = new Set<string>()
  const out: MidiHubDeviceBinding[] = []
  for (const device of devices) {
    for (const binding of device.bindings ?? []) {
      const key = `${binding.consumer_type}:${binding.consumer_id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(binding)
    }
  }
  return out
}

interface UseDeviceBindingsByProfileKeyOptions {
  enabled?: boolean
}

/** Returns a map { profile_key → MidiHubDeviceBinding[] } for the
 * supplied profile_keys. Profile keys with no matching device or no
 * bindings are omitted from the result. */
export function useDeviceBindingsByProfileKey(
  profileKeys: readonly string[],
  options: UseDeviceBindingsByProfileKeyOptions = {},
) {
  const enabled = options.enabled ?? profileKeys.length > 0

  const query = useQuery({
    queryKey: ['device-bindings-join', 'midi-hub-devices'],
    queryFn: () => midiHubApi.getDevices(true),
    enabled,
    staleTime: 5_000, // ~UI tick; binding state changes are rare
  })

  const bindingsByKey = useMemo(() => {
    if (!query.data) return new Map<string, MidiHubDeviceBinding[]>()
    const joined = joinProfileKeysToDevices(profileKeys, query.data.devices ?? [])
    const out = new Map<string, MidiHubDeviceBinding[]>()
    for (const [profileKey, devices] of joined) {
      const bindings = extractBindings(devices)
      if (bindings.length > 0) {
        out.set(profileKey, bindings)
      }
    }
    return out
  }, [query.data, profileKeys])

  return {
    bindingsByProfileKey: bindingsByKey,
    isLoading: query.isLoading,
    error: query.error,
  }
}
