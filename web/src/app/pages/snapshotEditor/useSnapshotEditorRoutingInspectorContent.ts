// Snapshot editor "routing inspector content" derivation hook
// (T2473 JSX partition — biggest remaining inline block).
//
// Lifts the routingInspectorContent useMemo block (~170 LoC, 8 switch
// cases) off the monolith. Returns the per-routing-mode inspector
// pane (heading + summary + tags + rows), or null when no inspector
// is open.
//
// Behavioral parity preserved verbatim across all 8 cases (input,
// output, series, split, mix, ab, morph, key, sidechain). Same memo
// deps, same input/output route lookups via getAudioRouteLabels,
// same active/standby flow label derivation.

import { useMemo } from 'react'

import type { AudioPortsResponse, AudioRoutingResponse } from '../../../map2/api'
import {
  formatInspectorList,
  getAudioRouteLabels,
} from './snapshotEditorLiveLabels'
import type { RoutingInspectorContent } from './snapshotEditorPageTypes'
import type { JuceGridLivePathLayout } from '../../components/SnapshotEditor/snapshotEditorLivePath'
import type { FlowSlot } from './snapshotEditorPageTypes'

interface AudioInterfaceStatusLite {
  isRunning?: boolean
  deviceName?: string
  sampleRate?: number
  bufferSize?: number
}

interface AudioOutputStatusLite {
  isRunning?: boolean
  deviceName?: string
}

interface RoutingPosture {
  blendPositions: Record<string, number | undefined>
  morphProgress: number
}

interface ActiveRoutingMode {
  label: string
  summary: string
}

type PortRouting = Pick<
  AudioRoutingResponse,
  | 'input_ports'
  | 'output_ports'
  | 'input_avb_endpoints'
  | 'output_avb_endpoints'
>

type PortsInfo = Pick<
  AudioPortsResponse,
  'inputs' | 'outputs' | 'avb_talkers' | 'avb_listeners'
>

export interface UseSnapshotEditorRoutingInspectorContentArgs {
  routingInspectorId: string | null
  portRouting: PortRouting | null | undefined
  portsInfo: PortsInfo | null | undefined
  flowSlots: FlowSlot[]
  flowIndexById: Map<string, number>
  livePathLayout: JuceGridLivePathLayout
  audioInterfaceStatus: AudioInterfaceStatusLite
  audioOutputStatus: AudioOutputStatusLite
  activeRoutingMode: ActiveRoutingMode
  routing: RoutingPosture
}

export function useSnapshotEditorRoutingInspectorContent({
  routingInspectorId,
  portRouting,
  portsInfo,
  flowSlots,
  flowIndexById,
  livePathLayout,
  audioInterfaceStatus,
  audioOutputStatus,
  activeRoutingMode,
  routing,
}: UseSnapshotEditorRoutingInspectorContentArgs): RoutingInspectorContent | null {
  return useMemo<RoutingInspectorContent | null>(() => {
    if (!routingInspectorId) {
      return null
    }

    const inputRoutes = getAudioRouteLabels(
      portRouting?.input_ports,
      portsInfo?.inputs,
      portRouting?.input_avb_endpoints,
      portsInfo?.avb_talkers,
    )
    const outputRoutes = getAudioRouteLabels(
      portRouting?.output_ports,
      portsInfo?.outputs,
      portRouting?.output_avb_endpoints,
      portsInfo?.avb_listeners,
    )
    const activeFlowLabels = livePathLayout.activeFlowIds.map(
      (flowId) =>
        flowSlots[flowIndexById.get(flowId) ?? -1]?.label ?? flowId,
    )
    const standbyFlowLabels = flowSlots
      .filter((flow) => !livePathLayout.activeFlowIds.includes(flow.id))
      .map((flow) => flow.label)
    const primaryFlowLabel = livePathLayout.primaryFlowId
      ? flowSlots[flowIndexById.get(livePathLayout.primaryFlowId) ?? -1]
          ?.label ?? livePathLayout.primaryFlowId
      : 'None'
    const secondaryFlowLabel = livePathLayout.secondaryFlowId
      ? flowSlots[flowIndexById.get(livePathLayout.secondaryFlowId) ?? -1]
          ?.label ?? livePathLayout.secondaryFlowId
      : 'None'
    const blendDetail = flowSlots
      .filter((flow) => livePathLayout.activeFlowIds.includes(flow.id))
      .map(
        (flow) =>
          `${flow.label} ${Math.round(routing.blendPositions[flow.id] ?? 100)}%`,
      )

    switch (routingInspectorId) {
      case 'input':
        return {
          heading: 'Input routing',
          summary: 'Engine input sources feeding the current live path.',
          tags: [
            audioInterfaceStatus.isRunning ? 'Running' : 'Stopped',
            activeRoutingMode.label,
          ],
          rows: [
            { label: 'Device', value: audioInterfaceStatus.deviceName || 'Audio interface' },
            { label: 'Source routes', value: formatInspectorList(inputRoutes) },
            { label: 'Active branches', value: formatInspectorList(activeFlowLabels) },
            { label: 'Clocking', value: `${audioInterfaceStatus.sampleRate || 48000} Hz / ${audioInterfaceStatus.bufferSize || 256} smp` },
          ],
        }
      case 'output':
        return {
          heading: 'Output routing',
          summary: 'Current destinations receiving the live Audio Grid signal path.',
          tags: [
            audioOutputStatus.isRunning ? 'Running' : 'Stopped',
            activeRoutingMode.label,
          ],
          rows: [
            { label: 'Device', value: audioOutputStatus.deviceName || 'Audio interface' },
            { label: 'Destinations', value: formatInspectorList(outputRoutes) },
            { label: 'Live branches', value: formatInspectorList(activeFlowLabels) },
            { label: 'Delivery mode', value: activeRoutingMode.summary },
          ],
        }
      case 'series':
        return {
          heading: 'Series routing',
          summary: 'Flows are processed sequentially from left to right before the output stage.',
          tags: [
            activeRoutingMode.label,
            livePathLayout.status === 'available' ? 'Live' : 'Unavailable',
          ],
          rows: [
            { label: 'Ordered path', value: formatInspectorList(activeFlowLabels) },
            { label: 'Bypassed context', value: formatInspectorList(standbyFlowLabels) },
            { label: 'Primary edit focus', value: primaryFlowLabel },
            { label: 'Output destination', value: formatInspectorList(outputRoutes) },
          ],
        }
      case 'split':
        return {
          heading: 'Parallel split',
          summary: 'Input audio is split into simultaneous branches before it is summed back to the output bus.',
          tags: ['Parallel', `${activeFlowLabels.length} live branches`],
          rows: [
            { label: 'Live branches', value: formatInspectorList(activeFlowLabels) },
            { label: 'Branch blend', value: formatInspectorList(blendDetail) },
            { label: 'Dimmed branches', value: formatInspectorList(standbyFlowLabels) },
            { label: 'Input source', value: formatInspectorList(inputRoutes) },
          ],
        }
      case 'mix':
        return {
          heading: 'Parallel mix',
          summary: 'Parallel branches are recombined at the mix bus and delivered to the active output routes.',
          tags: ['Parallel', 'Mix bus'],
          rows: [
            { label: 'Incoming branches', value: formatInspectorList(blendDetail) },
            { label: 'Primary branch', value: primaryFlowLabel },
            { label: 'Output destination', value: formatInspectorList(outputRoutes) },
            { label: 'Routing status', value: livePathLayout.status === 'available' ? 'Mix configured' : 'Configured path unavailable' },
          ],
        }
      case 'ab':
        return {
          heading: 'A/B selector',
          summary: 'One branch is selected while alternate branches remain in standby for immediate recall.',
          tags: ['A/B', livePathLayout.status === 'available' ? 'Configured' : 'Unavailable'],
          rows: [
            { label: 'Selected branch', value: primaryFlowLabel },
            { label: 'Standby branches', value: formatInspectorList(standbyFlowLabels) },
            { label: 'Input source', value: formatInspectorList(inputRoutes) },
            { label: 'Output destination', value: formatInspectorList(outputRoutes) },
          ],
        }
      case 'morph':
        return {
          heading: 'Morph control',
          summary: 'Morph transitions parameters from the source flow to the target flow without pausing the live path.',
          tags: ['Morph', `${Math.round(routing.morphProgress * 100)}%`],
          rows: [
            { label: 'Source flow', value: primaryFlowLabel },
            { label: 'Target flow', value: secondaryFlowLabel },
            { label: 'Morph amount', value: `${Math.round(routing.morphProgress * 100)}%` },
            { label: 'Output destination', value: formatInspectorList(outputRoutes) },
          ],
        }
      case 'key':
        return {
          heading: 'Sidechain key input',
          summary: 'A separate key path drives detector or control behavior without replacing the main audio path.',
          tags: ['Sidechain', 'Key input'],
          rows: [
            { label: 'Key source flow', value: secondaryFlowLabel },
            { label: 'Key source routes', value: formatInspectorList(inputRoutes) },
            { label: 'Controlled branch', value: primaryFlowLabel },
            { label: 'Standby context', value: formatInspectorList(standbyFlowLabels) },
          ],
        }
      case 'sidechain':
        return {
          heading: 'Sidechain routing',
          summary: 'The main audio branch remains live while a dedicated key path modulates its response.',
          tags: ['Sidechain', livePathLayout.status === 'available' ? 'Live' : 'Unavailable'],
          rows: [
            { label: 'Audio branch', value: primaryFlowLabel },
            { label: 'Key branch', value: secondaryFlowLabel },
            { label: 'Audio destination', value: formatInspectorList(outputRoutes) },
            { label: 'Input source', value: formatInspectorList(inputRoutes) },
          ],
        }
      default:
        return null
    }
  }, [
    activeRoutingMode.label,
    activeRoutingMode.summary,
    audioInterfaceStatus.bufferSize,
    audioInterfaceStatus.deviceName,
    audioInterfaceStatus.isRunning,
    audioInterfaceStatus.sampleRate,
    audioOutputStatus.deviceName,
    audioOutputStatus.isRunning,
    flowIndexById,
    flowSlots,
    livePathLayout.activeFlowIds,
    livePathLayout.primaryFlowId,
    livePathLayout.secondaryFlowId,
    livePathLayout.status,
    portRouting?.input_avb_endpoints,
    portRouting?.input_ports,
    portRouting?.output_avb_endpoints,
    portRouting?.output_ports,
    portsInfo?.avb_listeners,
    portsInfo?.avb_talkers,
    portsInfo?.inputs,
    portsInfo?.outputs,
    routing.blendPositions,
    routing.morphProgress,
    routingInspectorId,
  ])
}
