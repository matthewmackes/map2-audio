import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { audioApi, midiApi } from '../../map2/api'
import { useClusterHardwareInventory } from '../hooks/useDeviceLocation'

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

type ClusterHardwareInventoryResponse = {
  nodes?: Record<string, {
    status?: string
    audio_interfaces?: string[]
    usb_audio_devices?: Array<Record<string, unknown>>
    pipewire_devices?: Array<Record<string, unknown>>
  }>
}

export type LauncherInterfaceSummary = {
  audioInterfaces: string[]
  midiInterfaces: string[]
  isLoading: boolean
}

const EMPTY_INTERFACE_TRANSITION_DELAY_MS = 1200

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

function normalizeHardwareDeviceName(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.trim() || null
  }
  if (!value || typeof value !== 'object') {
    return null
  }

  const device = value as Record<string, unknown>
  for (const key of ['description', 'name', 'product', 'nick']) {
    const candidate = device[key]
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return null
}

function isGenericAudioInterfaceName(name: string): boolean {
  return /^(alsa|jack|pipewire|pulseaudio|pulseaudio|default|system)$/i.test(name.trim())
}

function collectHardwareAudioInterfaces(inventory: ClusterHardwareInventoryResponse | undefined): string[] {
  const nodes = inventory?.nodes ?? {}
  const names: string[] = []

  for (const node of Object.values(nodes)) {
    if (node?.status === 'offline') {
      continue
    }

    names.push(
      ...(node?.usb_audio_devices ?? []).map(normalizeHardwareDeviceName).filter((name): name is string => Boolean(name)),
    )
    names.push(
      ...(node?.pipewire_devices ?? []).map(normalizeHardwareDeviceName).filter((name): name is string => Boolean(name)),
    )
    names.push(
      ...((node?.audio_interfaces ?? []).filter((name) => !isGenericAudioInterfaceName(name))),
    )
  }

  return dedupeNames(names)
}

function sameNames(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
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
  const hardwareInventoryQuery = useClusterHardwareInventory(navOpen)
  const query = useQuery({
    queryKey: ['app-shell', 'launcher-interface-summary'],
    queryFn: fetchLauncherInterfaces,
    enabled: false,
    staleTime: 0,
  })
  const [audioInterfaces, setAudioInterfaces] = useState<string[]>([])
  const [midiInterfaces, setMidiInterfaces] = useState<string[]>([])
  const audioEmptyTimerRef = useRef<number | null>(null)
  const midiEmptyTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!navOpen) {
      return
    }
    void query.refetch()
  }, [navOpen, query.refetch])

  useEffect(() => {
    return () => {
      if (audioEmptyTimerRef.current !== null) {
        window.clearTimeout(audioEmptyTimerRef.current)
      }
      if (midiEmptyTimerRef.current !== null) {
        window.clearTimeout(midiEmptyTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const nextAudioInterfaces = dedupeNames([
      ...(query.data?.audioInterfaces ?? []),
      ...collectHardwareAudioInterfaces(hardwareInventoryQuery.data),
    ])

    if (audioEmptyTimerRef.current !== null) {
      window.clearTimeout(audioEmptyTimerRef.current)
      audioEmptyTimerRef.current = null
    }

    if (nextAudioInterfaces.length > 0 || audioInterfaces.length === 0) {
      if (!sameNames(audioInterfaces, nextAudioInterfaces)) {
        setAudioInterfaces(nextAudioInterfaces)
      }
      return
    }

    audioEmptyTimerRef.current = window.setTimeout(() => {
      setAudioInterfaces((current) => (current.length === 0 ? current : []))
      audioEmptyTimerRef.current = null
    }, EMPTY_INTERFACE_TRANSITION_DELAY_MS)
  }, [audioInterfaces, hardwareInventoryQuery.data, query.data?.audioInterfaces])

  useEffect(() => {
    const nextMidiInterfaces = query.data?.midiInterfaces ?? []

    if (midiEmptyTimerRef.current !== null) {
      window.clearTimeout(midiEmptyTimerRef.current)
      midiEmptyTimerRef.current = null
    }

    if (nextMidiInterfaces.length > 0 || midiInterfaces.length === 0) {
      if (!sameNames(midiInterfaces, nextMidiInterfaces)) {
        setMidiInterfaces(nextMidiInterfaces)
      }
      return
    }

    midiEmptyTimerRef.current = window.setTimeout(() => {
      setMidiInterfaces((current) => (current.length === 0 ? current : []))
      midiEmptyTimerRef.current = null
    }, EMPTY_INTERFACE_TRANSITION_DELAY_MS)
  }, [midiInterfaces, query.data?.midiInterfaces])

  const hasResolvedOnce =
    query.dataUpdatedAt > 0
    || query.error != null
    || hardwareInventoryQuery.dataUpdatedAt > 0
    || hardwareInventoryQuery.error != null

  return {
    audioInterfaces,
    midiInterfaces,
    isLoading: !hasResolvedOnce && (
      query.isLoading
      || query.isFetching
      || hardwareInventoryQuery.isLoading
      || hardwareInventoryQuery.isFetching
    ),
  }
}
