import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

type UnknownRecord = Record<string, unknown>

export type ClusterHardwareNode = {
  hostname?: string
  usb_audio_devices?: UnknownRecord[]
  midi_devices?: UnknownRecord[]
  audio_interfaces?: string[]
  pipewire_devices?: UnknownRecord[]
  status?: string
}

type ClusterHardwareInventoryResponse = {
  nodes?: Record<string, ClusterHardwareNode>
}

export type DeviceLocation = {
  nodeId: string
  hostname: string
  kind: 'usb_audio' | 'midi' | 'audio_interface' | 'pipewire'
  deviceInfo: UnknownRecord
  status: string
  matchedNeedle: string
}

type HardwareMenuItemLike = {
  to: string
  deviceType?: string
}

const DEVICE_TYPE_SEARCH_TERMS: Record<string, string[]> = {
  'ableton-push': ['ableton push', 'push 1', 'push 2', 'push 3', 'ableton ag push', 'push'],
  'edirol-ua1000': ['edirol ua 1000', 'ua 1000', '0582 0074'],
  'hotone-jogg': ['hotone jogg', 'jogg', '84ef 0014'],
  'generic-interface': ['hotone jogg', 'jogg', '84ef 0014'],
  'lexicon-mpx1': ['lexicon mpx 1', 'mpx 1', 'lexicon'],
  'rocktron-intelfx': ['rocktron intellifex', 'rocktron intelfx', 'intellifex', 'intel fx', 'rocktron'],
  'ground-control-pro': ['ground control pro', 'voodoo lab ground control', 'gc pro', 'groundcontrolpro', 'voodoo lab'],
  'mackie-mcu-pro': ['mackie mcu pro', 'mcu pro', 'mackie control universal', 'mackie control', 'mcu'],
  'novation-launch-control': ['novation launch control', 'launch control xl', 'launch control', 'novation'],
  'meloaudio-midi-commander': ['meloaudio midi commander', 'midi commander', 'meloaudio', 'mc6'],
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function buildNeedles(deviceTypeOrSearch: string | string[]): string[] {
  const raw = Array.isArray(deviceTypeOrSearch)
    ? deviceTypeOrSearch
    : (DEVICE_TYPE_SEARCH_TERMS[deviceTypeOrSearch] ?? [deviceTypeOrSearch])

  return Array.from(new Set(raw.map(normalize).filter(Boolean)))
}

function normalizeCompact(value: unknown): string {
  return normalize(value).replace(/\s+/g, '')
}

function searchableParts(kind: DeviceLocation['kind'], value: unknown): string[] {
  if (kind === 'audio_interface') {
    return [normalize(value)]
  }

  const device = (value ?? {}) as UnknownRecord
  return [
    normalize(device.name),
    normalize(device.product),
    normalize(device.description),
    normalize(device.media_class),
    normalize(device.vid_pid),
    normalize(device.vendor_id),
    normalize(device.product_id),
    normalize(device.direction),
    normalize(device.type),
  ].filter(Boolean)
}

function scanInventory(
  inventory: Record<string, ClusterHardwareNode> | undefined,
  deviceTypeOrSearch: string | string[],
): DeviceLocation[] {
  const needles = buildNeedles(deviceTypeOrSearch)
  if (!inventory || needles.length === 0) {
    return []
  }

  const matches: DeviceLocation[] = []

  for (const [nodeId, node] of Object.entries(inventory)) {
    const hostname = node.hostname ?? nodeId
    const status = node.status ?? 'unknown'
    const sources: Array<{ kind: DeviceLocation['kind']; values: unknown[] }> = [
      { kind: 'usb_audio', values: node.usb_audio_devices ?? [] },
      { kind: 'midi', values: node.midi_devices ?? [] },
      { kind: 'audio_interface', values: node.audio_interfaces ?? [] },
      { kind: 'pipewire', values: node.pipewire_devices ?? [] },
    ]

    for (const source of sources) {
      for (const value of source.values) {
        const haystack = searchableParts(source.kind, value).join(' ')
        const compactHaystack = normalizeCompact(haystack)
        const matchedNeedle = needles.find((needle) => {
          const compactNeedle = normalizeCompact(needle)
          return haystack.includes(needle) || compactHaystack.includes(compactNeedle)
        })
        if (!matchedNeedle) {
          continue
        }

        matches.push({
          nodeId,
          hostname,
          kind: source.kind,
          deviceInfo: typeof value === 'string' ? { name: value } : (value as UnknownRecord),
          status,
          matchedNeedle,
        })
      }
    }
  }

  return matches.sort((left, right) => {
    const leftOnline = left.status !== 'offline'
    const rightOnline = right.status !== 'offline'
    if (leftOnline !== rightOnline) {
      return leftOnline ? -1 : 1
    }
    return left.hostname.localeCompare(right.hostname)
  })
}

export function useClusterHardwareInventory(enabled = true) {
  return useQuery<ClusterHardwareInventoryResponse>({
    queryKey: ['cluster', 'hardware-inventory'],
    queryFn: async () => {
      const response = await fetch('/api/cluster/health/extended/devices')
      if (!response.ok) {
        throw new Error(`Failed to fetch cluster hardware inventory: ${response.status}`)
      }
      return response.json() as Promise<ClusterHardwareInventoryResponse>
    },
    enabled,
    staleTime: 15_000,
    gcTime: 15_000,
    refetchInterval: enabled ? 20_000 : false,
  })
}

export function useDeviceLocation(deviceTypeOrSearch: string | string[], enabled = true) {
  const inventoryQuery = useClusterHardwareInventory(enabled)
  const matches = useMemo(
    () => scanInventory(inventoryQuery.data?.nodes, deviceTypeOrSearch),
    [deviceTypeOrSearch, inventoryQuery.data?.nodes],
  )

  return {
    ...inventoryQuery,
    matches,
    location: matches[0] ?? null,
  }
}

export function useHardwareMenuLocations(items: HardwareMenuItemLike[]) {
  const inventoryQuery = useClusterHardwareInventory(items.some((item) => Boolean(item.deviceType)))

  const locationsByRoute = useMemo<Record<string, DeviceLocation | null>>(() => {
    const result: Record<string, DeviceLocation | null> = {}
    for (const item of items) {
      if (!item.deviceType) {
        continue
      }
      const matches = scanInventory(inventoryQuery.data?.nodes, item.deviceType)
      result[item.to] = matches[0] ?? null
    }
    return result
  }, [inventoryQuery.data?.nodes, items])

  return {
    ...inventoryQuery,
    locationsByRoute,
  }
}
