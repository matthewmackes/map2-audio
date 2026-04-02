import type { AudioPort } from '../../map2/api'
import type { AudioStatus, SnapshotControls, SnapshotDetail } from '../../map2/types'

export const SNAPSHOT_IO_USE_DEFAULT_OPTION = '__use_default__'

export interface SnapshotIoModalState {
  snapshotInputValue: string
  snapshotOutputValue: string
  snapshotMonitoringOutputValue: string
  defaultInputValue: string
  defaultOutputValue: string
  defaultMonitoringOutputValue: string
}

export interface SnapshotIoDefaults {
  input_device?: string | null
  output_device?: string | null
  monitoring_output_index?: number | null
}

export interface MonitoringOutputOption {
  value: string
  label: string
}

function normalizeDeviceName(value: string | null | undefined): string | null {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized.length > 0 ? normalized : null
}

function toSelectValue(value: string | null | undefined): string {
  return normalizeDeviceName(value) ?? SNAPSHOT_IO_USE_DEFAULT_OPTION
}

function normalizeMonitoringOutputIndex(value: string | number | null | undefined): number | null {
  if (value === SNAPSHOT_IO_USE_DEFAULT_OPTION) {
    return null
  }
  const numericValue = typeof value === 'number'
    ? value
    : Number.parseInt(typeof value === 'string' ? value.trim() : '', 10)
  return Number.isFinite(numericValue) && numericValue >= 0 ? Math.trunc(numericValue) : null
}

function toMonitoringSelectValue(value: string | number | null | undefined): string {
  const normalized = normalizeMonitoringOutputIndex(value)
  return normalized == null ? SNAPSHOT_IO_USE_DEFAULT_OPTION : String(normalized)
}

export function buildSnapshotIoModalState(
  snapshot: SnapshotDetail | null | undefined,
  defaults: SnapshotIoDefaults | null | undefined,
): SnapshotIoModalState {
  return {
    snapshotInputValue: toSelectValue(snapshot?.io_bindings?.input_device ?? snapshot?.input_device),
    snapshotOutputValue: toSelectValue(snapshot?.io_bindings?.output_device ?? snapshot?.output_device),
    snapshotMonitoringOutputValue: toMonitoringSelectValue(
      snapshot?.controls?.monitoring_output_index ?? snapshot?.io_bindings?.monitoring_output_index,
    ),
    defaultInputValue: normalizeDeviceName(defaults?.input_device) ?? '',
    defaultOutputValue: normalizeDeviceName(defaults?.output_device) ?? '',
    defaultMonitoringOutputValue: toMonitoringSelectValue(defaults?.monitoring_output_index),
  }
}

export function buildSnapshotIoUpdateRequest(state: SnapshotIoModalState) {
  return {
    input_device: normalizeSelectDeviceValue(state.snapshotInputValue),
    output_device: normalizeSelectDeviceValue(state.snapshotOutputValue),
  }
}

export function buildSnapshotIoControlsUpdate(
  state: SnapshotIoModalState,
  currentControls?: Partial<SnapshotControls> | null,
): Partial<SnapshotControls> {
  return {
    ...(currentControls ?? {}),
    monitoring_output_index: normalizeMonitoringOutputIndex(state.snapshotMonitoringOutputValue),
  }
}

export function buildSnapshotIoDefaultsUpdate(state: SnapshotIoModalState): SnapshotIoDefaults {
  return {
    input_device: normalizeDeviceName(state.defaultInputValue),
    output_device: normalizeDeviceName(state.defaultOutputValue),
    monitoring_output_index: normalizeMonitoringOutputIndex(state.defaultMonitoringOutputValue),
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

export function collectMonitoringOutputPairOptions(outputs: AudioPort[]): MonitoringOutputOption[] {
  const sortedOutputs = [...outputs]
    .filter((port) => port.type === 'output')
    .sort((left, right) => left.index - right.index)
  const options: MonitoringOutputOption[] = []

  for (let index = 0; index < sortedOutputs.length; index += 2) {
    const first = sortedOutputs[index]
    const second = sortedOutputs[index + 1]
    if (!first) {
      continue
    }
    const value = String(first.index)
    const label = second
      ? `Output ${first.index + 1}/${second.index + 1}`
      : `Output ${first.index + 1}`
    options.push({ value, label })
  }

  return options
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
