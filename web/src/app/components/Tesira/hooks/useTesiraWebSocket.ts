/**
 * WebSocket hooks for Tesira real-time events.
 * Uses the existing MAP2 useWebSocketTopic hook.
 */
import { useRef } from 'react'
import { useWebSocketTopic } from '../../../../map2/hooks/useWebSocket'
import type {
  TesiraMeterPush,
  TesiraDeviceStateEvent,
  TesiraPTPEvent,
  TesiraDiscoveryEvent,
  TesiraReversePresetSyncEvent,
} from '../types'

/**
 * Subscribe to live metering pushes for a specific device + instance tag.
 * Callback fires on every push (≥ 8 Hz during audio).
 */
export function useTesiraMeters(
  deviceId: string,
  instanceTag: string,
  onUpdate: (levels: number[]) => void,
): void {
  const cbRef = useRef(onUpdate)
  cbRef.current = onUpdate

  useWebSocketTopic<TesiraMeterPush>('tesira:meters', (data) => {
    if (data?.device_id === deviceId && data?.instance_tag === instanceTag) {
      cbRef.current(data.levels_dbu)
    }
  })
}

/**
 * Subscribe to device state change events (connect/disconnect/fault).
 */
export function useTesiraDeviceState(
  onStateChange: (event: TesiraDeviceStateEvent) => void,
): void {
  const cbRef = useRef(onStateChange)
  cbRef.current = onStateChange

  useWebSocketTopic<TesiraDeviceStateEvent>('tesira:device_state', (data) => {
    if (data) cbRef.current(data)
  })
}

/**
 * Subscribe to PTP status events for a specific device.
 */
export function useTesiraPTPEvents(
  deviceId: string,
  onUpdate: (event: TesiraPTPEvent) => void,
): void {
  const cbRef = useRef(onUpdate)
  cbRef.current = onUpdate

  useWebSocketTopic<TesiraPTPEvent>('tesira:ptp', (data) => {
    if (data?.device_id === deviceId) cbRef.current(data)
  })
}

/**
 * Subscribe to auto-discovery events.
 * Fires on: 'device_found' (as each unit is found), 'scan_complete', 'scan_error'.
 * Used inside DiscoveryDialog to show devices in real time as they are discovered.
 */
export function useTesiraDiscoveryEvents(
  onEvent: (event: TesiraDiscoveryEvent) => void,
): void {
  const cbRef = useRef(onEvent)
  cbRef.current = onEvent

  useWebSocketTopic<TesiraDiscoveryEvent>('tesira:discovery', (data) => {
    if (data) cbRef.current(data)
  })
}

/**
 * Subscribe to reverse-sync detections (Tesira-side preset changes).
 */
export function useTesiraReversePresetSync(
  onEvent: (event: TesiraReversePresetSyncEvent) => void,
): void {
  const cbRef = useRef(onEvent)
  cbRef.current = onEvent

  useWebSocketTopic<TesiraReversePresetSyncEvent>('tesira:preset_reverse_sync', (data) => {
    if (data) cbRef.current(data)
  })
}
