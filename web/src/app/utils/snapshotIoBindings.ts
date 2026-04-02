import type { AudioStatus, SnapshotDetail } from '../../map2/types'

export const SNAPSHOT_IO_USE_DEFAULT_OPTION = '__use_default__'

export interface SnapshotIoModalState {
  snapshotInputValue: string
  snapshotOutputValue: string
  defaultInputValue: string
  defaultOutputValue: string
}

export interface SnapshotIoDefaults {
  input_device?: string | null
  output_device?: string | null
}

function normalizeDeviceName(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized.length > 0 ? normalized : null
}

function toSelectValue(value: string | null | undefined): string {
  return normalizeDeviceName(value) ?? SNAPSHOT_IO_USE_DEFAULT_OPTION
}

export function buildSnapshotIoModalState(
  snapshot: SnapshotDetail | null | undefined,
  defaults: SnapshotIoDefaults | null | undefined,
): SnapshotIoModalState {
  return {
    snapshotInputValue: toSelectValue(snapshot?.io_bindings?.input_device ?? snapshot?.input_device),
    snapshotOutputValue: toSelectValue(snapshot?.io_bindings?.output_device ?? snapshot?.output_device),
    defaultInputValue: normalizeDeviceName(defaults?.input_device) ?? '',
    defaultOutputValue: normalizeDeviceName(defaults?.output_device) ?? '',
  }
}

export function buildSnapshotIoUpdateRequest(state: SnapshotIoModalState) {
  return {
    input_device: normalizeSelectDeviceValue(state.snapshotInputValue),
    output_device: normalizeSelectDeviceValue(state.snapshotOutputValue),
  }
}

export function buildSnapshotIoDefaultsUpdate(state: SnapshotIoModalState): SnapshotIoDefaults {
  return {
    input_device: normalizeDeviceName(state.defaultInputValue),
    output_device: normalizeDeviceName(state.defaultOutputValue),
  }
}

export function normalizeSelectDeviceValue(value: string | null | undefined): string | null {
  if (value === SNAPSHOT_IO_USE_DEFAULT_OPTION) {
    return null
  }
  return normalizeDeviceName(value)
}

export function collectSnapshotIoDeviceOptions(
  audioStatus: AudioStatus | null | undefined,
  extras?: {
    input?: Array<string | null | undefined>
    output?: Array<string | null | undefined>
  },
): {
  inputOptions: string[]
  outputOptions: string[]
} {
  const inputOptions = collectOrderedDeviceOptions([
    ...(audioStatus?.available_input_devices ?? []),
    audioStatus?.input_device ?? null,
    ...(extras?.input ?? []),
  ])
  const outputOptions = collectOrderedDeviceOptions([
    ...(audioStatus?.available_output_devices ?? []),
    audioStatus?.output_device ?? null,
    ...(extras?.output ?? []),
  ])
  return { inputOptions, outputOptions }
}

function collectOrderedDeviceOptions(values: Array<string | null | undefined>): string[] {
  const ordered: string[] = []
  const seen = new Set<string>()
  values.forEach((value) => {
    const normalized = normalizeDeviceName(value)
    if (!normalized || seen.has(normalized)) {
      return
    }
    seen.add(normalized)
    ordered.push(normalized)
  })
  return ordered
}
