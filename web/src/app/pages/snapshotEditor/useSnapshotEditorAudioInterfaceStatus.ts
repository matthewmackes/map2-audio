// Snapshot editor "audio interface status" derivation hook
// (T2473 JSX partition — audio-interface input/output status extraction).
//
// Lifts the parallel useMemo blocks for audioInterfaceStatus +
// audioOutputStatus + avbReadinessState off the monolith. Both
// JuceGridAudioInterfaceStatus shapes share the same routing-mode /
// AVB-readiness / chain-active wiring; the only differences are the
// input vs. output sides of the routing record (input_bindings vs.
// output_bindings, input_ports vs. output_ports, etc.) and the meter
// channel pair.
//
// Behavioral parity preserved verbatim: same defaults, same fallback
// values, same memo dependencies, same avbReadinessState resolution
// rule (string with non-empty trim → state, anything else → 'unknown').

import { useMemo } from 'react'

import type { AudioRoutingResponse } from '../../../map2/api'
import type { Chain } from '../../../map2/types'
import type { JuceGridAudioInterfaceStatus } from '../../components/SnapshotEditor/SnapshotEditorSignalCanvas'
import { countAudioBindingChannels } from './snapshotEditorLiveLabels'

type PortRouting = Pick<
  AudioRoutingResponse,
  | 'input_bindings'
  | 'output_bindings'
  | 'input_ports'
  | 'output_ports'
  | 'input_avb_endpoints'
  | 'output_avb_endpoints'
>

interface PortsInfo {
  device?: string
  input_count?: number
  output_count?: number
  avb_readiness?: unknown
}

interface JackMetrics {
  sample_rate?: number
  buffer_size?: number
}

interface AudioStatus {
  engine?: string
  running?: boolean
}

interface AudioLevels {
  input_left?: number
  input_right?: number
  output_left?: number
  output_right?: number
}

interface RoutingPosture {
  mode: JuceGridAudioInterfaceStatus['routingMode']
}

export interface UseSnapshotEditorAudioInterfaceStatusArgs {
  portRouting: PortRouting | null | undefined
  portsInfo: PortsInfo | null | undefined
  jackMetrics: JackMetrics | null | undefined
  audioStatus: AudioStatus | null | undefined
  audioLevels: AudioLevels | null | undefined
  routing: RoutingPosture
  activeFlowChain: Chain | null | undefined
}

export interface UseSnapshotEditorAudioInterfaceStatusResult {
  avbReadinessState: string
  audioInterfaceStatus: JuceGridAudioInterfaceStatus
  audioOutputStatus: JuceGridAudioInterfaceStatus
}

export function useSnapshotEditorAudioInterfaceStatus({
  portRouting,
  portsInfo,
  jackMetrics,
  audioStatus,
  audioLevels,
  routing,
  activeFlowChain,
}: UseSnapshotEditorAudioInterfaceStatusArgs): UseSnapshotEditorAudioInterfaceStatusResult {
  const avbReadinessState = useMemo(() => {
    const readiness = portsInfo?.avb_readiness
    if (!readiness || typeof readiness !== 'object') {
      return 'unknown'
    }
    const state = (readiness as Record<string, unknown>).state
    return typeof state === 'string' && state.trim() ? state : 'unknown'
  }, [portsInfo?.avb_readiness])

  const audioInterfaceStatus: JuceGridAudioInterfaceStatus = useMemo(() => ({
    deviceName: portsInfo?.device || audioStatus?.engine || 'JACK Audio',
    sampleRate: jackMetrics?.sample_rate || 48000,
    bufferSize: jackMetrics?.buffer_size || 256,
    channels: countAudioBindingChannels(
      portRouting?.input_bindings,
      portRouting?.input_ports?.length || 0,
      portRouting?.input_avb_endpoints?.length || 0,
    ),
    isRunning: audioStatus?.running ?? true,
    selectedPorts: portRouting?.input_ports || [],
    selectedAvbEndpoints: portRouting?.input_avb_endpoints || [],
    totalPorts: portsInfo?.input_count || 2,
    routingMode: routing.mode,
    chainActive: activeFlowChain?.is_active ?? false,
    chainName: activeFlowChain?.name,
    bindings: portRouting?.input_bindings || [],
    avbReadinessState,
    meterLevels: [audioLevels?.input_left || 0, audioLevels?.input_right || 0],
  }), [
    audioLevels,
    audioStatus,
    avbReadinessState,
    jackMetrics,
    portRouting,
    portsInfo,
    routing.mode,
    activeFlowChain,
  ])

  const audioOutputStatus: JuceGridAudioInterfaceStatus = useMemo(() => ({
    deviceName: portsInfo?.device || audioStatus?.engine || 'JACK Audio',
    sampleRate: jackMetrics?.sample_rate || 48000,
    bufferSize: jackMetrics?.buffer_size || 256,
    channels: countAudioBindingChannels(
      portRouting?.output_bindings,
      portRouting?.output_ports?.length || 0,
      portRouting?.output_avb_endpoints?.length || 0,
    ),
    isRunning: audioStatus?.running ?? true,
    selectedPorts: portRouting?.output_ports || [],
    selectedAvbEndpoints: portRouting?.output_avb_endpoints || [],
    totalPorts: portsInfo?.output_count || 2,
    routingMode: routing.mode,
    chainActive: activeFlowChain?.is_active ?? false,
    chainName: activeFlowChain?.name,
    bindings: portRouting?.output_bindings || [],
    avbReadinessState,
    meterLevels: [audioLevels?.output_left || 0, audioLevels?.output_right || 0],
  }), [
    audioLevels,
    audioStatus,
    avbReadinessState,
    jackMetrics,
    portRouting,
    portsInfo,
    routing.mode,
    activeFlowChain,
  ])

  return { avbReadinessState, audioInterfaceStatus, audioOutputStatus }
}
