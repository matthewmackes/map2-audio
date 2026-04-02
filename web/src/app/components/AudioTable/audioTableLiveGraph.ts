import dagre from 'dagre'
import { MarkerType, type Edge, type Node } from 'reactflow'

import type { Chain } from '../../../map2/types'
import type {
  JuceGridFlowSlotState,
  JuceGridRoutingMode,
  JuceGridRoutingState,
} from '../JuceGrid/juceGridState'
import type { SnapshotEditorLiveChainProjection } from '../SnapshotEditor/snapshotEditorLiveChains'
import {
  buildAudioTablePluginTargetKey,
  buildAudioTableRowAnchorId,
  getAudioTablePluginDisplayName,
  type AudioTablePluginSelectionTarget,
} from './audioTablePluginPrimitives'

type AudioTableLiveGraphNodeKind = 'path-input' | 'plugin' | 'path-output' | 'routing'
type AudioTableLiveGraphTone = 'live' | 'degraded' | 'workspace'

export interface AudioTableLiveGraphNodeData {
  kind: AudioTableLiveGraphNodeKind
  label: string
  caption: string
  accentColor: string
  tone: AudioTableLiveGraphTone
  warningText: string | null
  dimmed?: boolean
  selected?: boolean
  pluginTarget?: AudioTablePluginSelectionTarget
}

export interface AudioTableLiveGraphModel {
  nodes: Array<Node<AudioTableLiveGraphNodeData>>
  edges: Edge[]
  selectedNodeId: string | null
  livePathCount: number
  degradedPathCount: number
  syntheticPathCount: number
  routingTruthLabel: string
  routingCaption: string
  emptyCopy: string
}

const ROUTING_NODE_ID = 'audio-table-routing-stage'
const FALLBACK_ACCENT = '#525252'

function sortFlowSlotsByLabel(flowSlots: JuceGridFlowSlotState[]) {
  return [...flowSlots].sort((left, right) => {
    const labelCompare = left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
    if (labelCompare !== 0) {
      return labelCompare
    }

    return left.id.localeCompare(right.id, undefined, { sensitivity: 'base' })
  })
}

function getPrimaryFlowSlot(
  flowSlots: JuceGridFlowSlotState[],
  chainId: number,
) {
  return sortFlowSlotsByLabel(
    flowSlots.filter((flowSlot) => flowSlot.chainId === chainId),
  )[0] ?? null
}

function formatRoutingModeLabel(mode: JuceGridRoutingMode): string {
  switch (mode) {
    case 'parallel_blend':
      return 'Parallel Blend'
    case 'ab_switch':
      return 'A/B Switch'
    case 'series':
      return 'Series'
    case 'parameter_morph':
      return 'Parameter Morph'
    case 'sidechain':
      return 'Sidechain'
    default:
      return 'Routing'
  }
}

function buildPluginCaption(chainName: string, position: number, bypassed: boolean, instanceId?: number) {
  const parts = [`${chainName} · #${position}`]
  if (typeof instanceId === 'number') {
    parts.push(`Instance ${instanceId}`)
  }
  if (bypassed) {
    parts.push('Bypassed')
  }
  return parts.join(' · ')
}

function getNodeSize(kind: AudioTableLiveGraphNodeKind) {
  switch (kind) {
    case 'path-input':
      return { width: 184, height: 78 }
    case 'path-output':
      return { width: 176, height: 74 }
    case 'routing':
      return { width: 260, height: 92 }
    case 'plugin':
    default:
      return { width: 248, height: 114 }
  }
}

function layoutGraph(nodes: Array<Node<AudioTableLiveGraphNodeData>>, edges: Edge[]) {
  if (nodes.length === 0) {
    return nodes
  }

  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({
    rankdir: 'LR',
    ranksep: 120,
    nodesep: 42,
    marginx: 32,
    marginy: 24,
  })

  nodes.forEach((node) => {
    const size = getNodeSize(node.data.kind)
    graph.setNode(node.id, size)
  })

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target)
  })

  dagre.layout(graph)

  return nodes.map((node) => {
    const position = graph.node(node.id)
    const size = getNodeSize(node.data.kind)
    return {
      ...node,
      position: {
        x: position.x - size.width / 2,
        y: position.y - size.height / 2,
      },
    }
  })
}

function buildEdge(
  id: string,
  source: string,
  target: string,
  accentColor: string,
  label?: string,
): Edge {
  return {
    id,
    source,
    target,
    type: 'smoothstep',
    animated: false,
    label,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: accentColor,
    },
    style: {
      stroke: accentColor,
      strokeWidth: 2,
    },
    labelStyle: {
      fill: 'var(--cds-text-secondary)',
      fontWeight: 600,
      fontSize: 11,
    },
  }
}

export function buildAudioTableLiveGraphModel(args: {
  chains: Chain[]
  flowSlots: JuceGridFlowSlotState[]
  routing: JuceGridRoutingState
  projections: SnapshotEditorLiveChainProjection[]
  selectedPluginTargetKey: string | null
}): AudioTableLiveGraphModel {
  const {
    chains,
    flowSlots,
    routing,
    projections,
    selectedPluginTargetKey,
  } = args

  if (projections.length === 0) {
    return {
      nodes: [],
      edges: [],
      selectedNodeId: null,
      livePathCount: 0,
      degradedPathCount: 0,
      syntheticPathCount: 0,
      routingTruthLabel: 'Workspace only',
      routingCaption: 'No backend-live paths are currently reported by the runtime.',
      emptyCopy: 'No backend-live paths are currently reported by the runtime.',
    }
  }

  const chainMap = new Map(chains.map((chain) => [chain.id, chain]))
  const nodes: Array<Node<AudioTableLiveGraphNodeData>> = []
  const edges: Edge[] = []
  let selectedNodeId: string | null = null
  const livePathCount = projections.filter((projection) => projection.status === 'live').length
  const degradedPathCount = projections.length - livePathCount
  const syntheticPathCount = projections.filter((projection) => projection.syntheticFlow).length

  nodes.push({
    id: ROUTING_NODE_ID,
    type: 'audioTableLiveNode',
    position: { x: 0, y: 0 },
    draggable: false,
    selectable: false,
    data: {
      kind: 'routing',
      label: formatRoutingModeLabel(routing.mode),
      caption: 'Workspace-derived final routing stage',
      accentColor: '#6f6f6f',
      tone: 'workspace',
      warningText: 'Runtime routing truth is unavailable, so the merge stage reflects workspace routing only.',
    },
  })

  projections.forEach((projection) => {
    const chain = chainMap.get(projection.chainId)
    if (!chain) {
      return
    }

    const primaryFlowSlot = getPrimaryFlowSlot(flowSlots, chain.id)
    const accentColor = primaryFlowSlot?.color ?? FALLBACK_ACCENT
    const flowSummary = projection.flowLabels.length > 1
      ? `Paths ${projection.flowLabels.join(', ')}`
      : `Path ${projection.primaryFlowLabel}`
    const tone: AudioTableLiveGraphTone = projection.status === 'live' ? 'live' : 'degraded'
    const inputNodeId = `chain:${chain.id}:input`
    const outputNodeId = `chain:${chain.id}:output`

    nodes.push({
      id: inputNodeId,
      type: 'audioTableLiveNode',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        kind: 'path-input',
        label: flowSummary,
        caption: projection.syntheticFlow
          ? `${chain.name} · runtime-only`
          : chain.name,
        accentColor,
        tone,
        warningText: projection.warningText,
      },
    })

    nodes.push({
      id: outputNodeId,
      type: 'audioTableLiveNode',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        kind: 'path-output',
        label: `${chain.name} output`,
        caption: projection.runtimeStatus.replace(/_/g, ' '),
        accentColor,
        tone,
        warningText: projection.warningText,
      },
    })

    const sortedPlugins = [...chain.plugins].sort((left, right) => left.position - right.position)
    let previousNodeId = inputNodeId

    if (sortedPlugins.length === 0) {
      edges.push(buildEdge(
        `edge:${inputNodeId}:${outputNodeId}`,
        inputNodeId,
        outputNodeId,
        accentColor,
        projection.primaryFlowLabel,
      ))
    }

    sortedPlugins.forEach((plugin, pluginIndex) => {
      const pluginTarget: AudioTablePluginSelectionTarget = {
        chainId: chain.id,
        chainName: chain.name,
        flowLabel: primaryFlowSlot?.label ?? projection.primaryFlowLabel,
        flowSlotId: primaryFlowSlot?.id ?? null,
        pluginUri: plugin.uri,
        pluginName: getAudioTablePluginDisplayName(plugin),
        pluginPosition: plugin.position,
        instanceId: plugin.instance_id,
        rowAnchorId: primaryFlowSlot ? buildAudioTableRowAnchorId(primaryFlowSlot.id, plugin) : null,
        syntheticFlow: projection.syntheticFlow,
      }
      const pluginTargetKey = buildAudioTablePluginTargetKey(pluginTarget)
      const pluginNodeId = `chain:${chain.id}:plugin:${plugin.position}:${plugin.instance_id ?? pluginIndex}`
      const selected = pluginTargetKey === selectedPluginTargetKey

      if (selected) {
        selectedNodeId = pluginNodeId
      }

      nodes.push({
        id: pluginNodeId,
        type: 'audioTableLiveNode',
        position: { x: 0, y: 0 },
        draggable: false,
        selectable: false,
        data: {
          kind: 'plugin',
          label: pluginTarget.pluginName,
          caption: buildPluginCaption(
            chain.name,
            plugin.position,
            plugin.bypassed,
            plugin.instance_id,
          ),
          accentColor,
          tone,
          warningText: projection.warningText,
          dimmed: Boolean(plugin.bypassed),
          selected,
          pluginTarget,
        },
      })

      edges.push(buildEdge(
        `edge:${previousNodeId}:${pluginNodeId}`,
        previousNodeId,
        pluginNodeId,
        accentColor,
        pluginIndex === 0 ? projection.primaryFlowLabel : undefined,
      ))

      previousNodeId = pluginNodeId
    })

    if (sortedPlugins.length > 0) {
      edges.push(buildEdge(
        `edge:${previousNodeId}:${outputNodeId}`,
        previousNodeId,
        outputNodeId,
        accentColor,
      ))
    }

    edges.push(buildEdge(
      `edge:${outputNodeId}:${ROUTING_NODE_ID}`,
      outputNodeId,
      ROUTING_NODE_ID,
      accentColor,
    ))
  })

  return {
    nodes: layoutGraph(nodes, edges),
    edges,
    selectedNodeId,
    livePathCount,
    degradedPathCount,
    syntheticPathCount,
    routingTruthLabel: 'Workspace only',
    routingCaption: 'Final routing/merge state is shown as workspace-derived because the runtime does not expose authoritative routing truth here.',
    emptyCopy: 'No backend-live paths are currently reported by the runtime.',
  }
}
