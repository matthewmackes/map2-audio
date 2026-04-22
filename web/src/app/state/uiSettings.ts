import { useEffect, useState } from 'react'

const STORAGE_KEY = 'map2.ui.settings'
const SCHEMA_VERSION = 1
const BROADCAST_EVENT = 'map2:ui-settings:changed'

export interface UiSettings {
  version: number
  pinnedDevices: string[]
}

function emptySettings(): UiSettings {
  return { version: SCHEMA_VERSION, pinnedDevices: [] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalize(parsed: unknown): UiSettings {
  if (!isRecord(parsed)) return emptySettings()
  const pinnedRaw = parsed.pinnedDevices
  const pinnedDevices = Array.isArray(pinnedRaw)
    ? pinnedRaw.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : []
  const versionRaw = parsed.version
  const version = typeof versionRaw === 'number' && Number.isFinite(versionRaw) ? versionRaw : SCHEMA_VERSION
  return { version, pinnedDevices }
}

function readRawBag(): Record<string, unknown> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function readUiSettings(): UiSettings {
  return normalize(readRawBag())
}

function writeUiSettings(next: UiSettings): void {
  if (typeof window === 'undefined') return
  try {
    const merged = { ...readRawBag(), version: next.version, pinnedDevices: next.pinnedDevices }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
    window.dispatchEvent(new CustomEvent(BROADCAST_EVENT))
  } catch {
    // Storage full or disabled — fail silently; pin state is a soft preference.
  }
}

export function getPinnedDeviceIds(): string[] {
  return readUiSettings().pinnedDevices
}

export function isDevicePinned(deviceId: string): boolean {
  return getPinnedDeviceIds().includes(deviceId)
}

export function pinDevice(deviceId: string): void {
  const current = readUiSettings()
  if (current.pinnedDevices.includes(deviceId)) return
  writeUiSettings({ ...current, pinnedDevices: [...current.pinnedDevices, deviceId] })
}

export function unpinDevice(deviceId: string): void {
  const current = readUiSettings()
  if (!current.pinnedDevices.includes(deviceId)) return
  writeUiSettings({
    ...current,
    pinnedDevices: current.pinnedDevices.filter((entry) => entry !== deviceId),
  })
}

export function togglePinnedDevice(deviceId: string): boolean {
  if (isDevicePinned(deviceId)) {
    unpinDevice(deviceId)
    return false
  }
  pinDevice(deviceId)
  return true
}

export function usePinnedDevices(): string[] {
  const [pinned, setPinned] = useState<string[]>(() => getPinnedDeviceIds())

  useEffect(() => {
    if (typeof window === 'undefined') return
    const sync = () => setPinned(getPinnedDeviceIds())
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) sync()
    }
    window.addEventListener(BROADCAST_EVENT, sync as EventListener)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(BROADCAST_EVENT, sync as EventListener)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return pinned
}

export const UI_SETTINGS_STORAGE_KEY = STORAGE_KEY
export const UI_SETTINGS_BROADCAST_EVENT = BROADCAST_EVENT
