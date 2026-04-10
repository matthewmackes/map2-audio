import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { audioApi, midiApi } from '../../map2/api'

type AudioStatusLike = {
  available_input_devices?: string[]
  available_output_devices?: string[]
} | null

type MidiDeviceLike =
  | string
  | {
      name?: string | null
      is_virtual?: boolean | null
      kind?: string | null
    }

type MidiDevicesResponse = {
  inputs?: MidiDeviceLike[]
  outputs?: MidiDeviceLike[]
} | null

export type LauncherInterfaceSummary = {
  audioInterfaces: string[]
  midiInterfaces: string[]
  isLoading: boolean
}

function dedupeNames(names: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []

  for (const rawName of names) {
    const name = rawName?.trim()
    if (!name) {
      continue
    }
    const key = name.toLocaleLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(name)
  }

  return deduped
}

function normalizeMidiName(device: MidiDeviceLike): string | null {
  return typeof device === 'string' ? device : device?.name ?? null
}

function isPhysicalMidiDevice(device: MidiDeviceLike): boolean {
  if (typeof device === 'string') {
    return !/virtual/i.test(device)
  }

  if (!device) {
    return false
  }

  if (device.is_virtual) {
    return false
  }

  if (device.kind && device.kind !== 'alsa') {
    return false
  }

  return !/virtual/i.test(device.name ?? '')
}

async function fetchLauncherInterfaces(): Promise<LauncherInterfaceSummary> {
  const [audioStatus, midiDevices] = await Promise.all([
    audioApi.getStatus().catch(() => null as AudioStatusLike),
    midiApi.getDevices().catch(() => null as MidiDevicesResponse),
  ])

  const audioInterfaces = dedupeNames([
    ...(audioStatus?.available_input_devices ?? []),
    ...(audioStatus?.available_output_devices ?? []),
  ])

  const midiInterfaces = dedupeNames([
    ...((midiDevices?.inputs ?? []).filter(isPhysicalMidiDevice).map(normalizeMidiName)),
    ...((midiDevices?.outputs ?? []).filter(isPhysicalMidiDevice).map(normalizeMidiName)),
  ])

  return {
    audioInterfaces,
    midiInterfaces,
    isLoading: false,
  }
}

export function useLauncherInterfaceSummary(navOpen: boolean): LauncherInterfaceSummary {
  const query = useQuery({
    queryKey: ['app-shell', 'launcher-interface-summary'],
    queryFn: fetchLauncherInterfaces,
    enabled: false,
    staleTime: 0,
  })

  useEffect(() => {
    if (!navOpen) {
      return
    }
    void query.refetch()
  }, [navOpen, query])

  return useMemo(
    () => ({
      audioInterfaces: query.data?.audioInterfaces ?? [],
      midiInterfaces: query.data?.midiInterfaces ?? [],
      isLoading: query.isLoading || query.isFetching,
    }),
    [query.data?.audioInterfaces, query.data?.midiInterfaces, query.isFetching, query.isLoading],
  )
}
