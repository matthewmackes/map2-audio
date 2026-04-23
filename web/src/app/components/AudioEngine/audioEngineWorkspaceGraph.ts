import dagre from 'dagre'
import { MarkerType, type Edge, type Node } from 'reactflow'

import type {
  AudioSourceTruthPayload,
  PipeWireDeviceInfo,
  PipeWireLinkInfo,
  PipeWireNodeInfo,
  PipeWireStreamInfo,
} from '../../../map2/types'

export type AudioEngineWorkspaceAnchorId =
  | 'audio-engine-source-of-truth'
  | 'audio-engine-routing-devices'
  | 'audio-engine-routing-sinks'
  | 'audio-engine-routing-sources'
  | 'audio-engine-routing-streams'
  | 'audio-engine-routing-links'
  | 'audio-engine-diagnostics'

type AudioEngineWorkspaceNodeKind =
  | 'authority'
  | 'device'
  | 'source'
  | 'engine'
  | 'stream'
  | 'patch'
  | 'sink'
  | 'control'

type AudioEngineWorkspaceTone = 'aligned' | 'warning' | 'critical' | 'neutral'
type AudioEngineWorkspaceTrafficLevel = 'idle' | 'low' | 'medium' | 'high'

export interface AudioEngineWorkspaceNodeData {
  kind: AudioEngineWorkspaceNodeKind
  eyebrow: string
  label: string
  caption: string
  metric: string
  accentColor: string
  tone: AudioEngineWorkspaceTone
  anchorId: AudioEngineWorkspaceAnchorId
  selected?: boolean
}

export interface AudioEngineWorkspaceGraphTag {
  label: string
  type: 'green' | 'warm-gray' | 'red' | 'cool-gray'
}

export interface AudioEngineWorkspaceGraphModel {
  nodes: Array<Node<AudioEngineWorkspaceNodeData>>
  edges: Edge[]
  summaryTags: AudioEngineWorkspaceGraphTag[]
  pulseCopy: string
}

interface BuildAudioEngineWorkspaceGraphArgs {
  sourceOfTruth: AudioSourceTruthPayload | null
  detailNodeLabel: string
  devices: PipeWireDeviceInfo[]
  nodes: PipeWireNodeInfo[]
  streams: PipeWireStreamInfo[]
  links: PipeWireLinkInfo[]
  effectiveRate: number
  effectiveQuantum: number
  totalLatencyMs: number
  xruns: number
  pressurePercent: number | null
  selectedAnchorId: AudioEngineWorkspaceAnchorId | null
}

const AUTHORITY_NODE_ID = 'audio-engine-workspace:authority'
const ENGINE_NODE_ID = 'audio-engine-workspace:engine'
const PATCH_NODE_ID = 'audio-engine-workspace:patch'
const CONTROL_NODE_ID = 'audio-engine-workspace:control'

const ACCENT = {
  authority: 'var(--cds-link-primary)',
  device: 'var(--cds-support-info)',
  source: 'var(--cds-support-warning)',
  engine: 'var(--cds-link-primary-hover)',
  stream: 'var(--cds-link-primary)',
  patch: 'var(--cds-icon-secondary)',
  sink: 'var(--cds-support-success)',
  control: 'var(--cds-support-error)',
} as const

function toneToTagType(tone: AudioEngineWorkspaceTone): AudioEngineWorkspaceGraphTag['type'] {
  switch (tone) {
    case 'aligned':
      return 'green'
    case 'warning':
      return 'warm-gray'
    case 'critical':
      return 'red'
    case 'neutral':
    default:
      return 'cool-gray'
  }
}

function toneFromSourceOfTruth(sourceOfTruth: AudioSourceTruthPayload | null): AudioEngineWorkspaceTone {
  if (!sourceOfTruth) {
    return 'critical'
  }

  switch (sourceOfTruth.status) {
    case 'aligned':
      return 'aligned'
    case 'warning':
      return 'warning'
    case 'error':
      return 'critical'
    default:
      return 'neutral'
  }
}

function toneFromRuntime(state: string, xruns = 0): AudioEngineWorkspaceTone {
  const lowered = state.toLowerCase()
  if (xruns > 0 || lowered.includes('error') || lowered.includes('suspend')) {
    return 'critical'
  }
  if (lowered.includes('idle') || lowered.includes('pause')) {
    return 'warning'
  }
  if (lowered.includes('run') || lowered.includes('active')) {
    return 'aligned'
  }
  return 'neutral'
}

function trafficFromScore(score: number): AudioEngineWorkspaceTrafficLevel {
  if (score >= 8) {
    return 'high'
  }
  if (score >= 5) {
    return 'medium'
  }
  if (score >= 2) {
    return 'low'
  }
  return 'idle'
}

function trafficToStrokeWidth(level: AudioEngineWorkspaceTrafficLevel) {
  switch (level) {
    case 'high':
      return 4.5
    case 'medium':
      return 3.5
    case 'low':
      return 2.5
    case 'idle':
    default:
      return 1.75
  }
}

function trafficToColor(level: AudioEngineWorkspaceTrafficLevel) {
  switch (level) {
    case 'high':
      return 'var(--cds-support-success)'
    case 'medium':
      return 'var(--cds-support-warning)'
    case 'low':
      return 'var(--cds-link-primary)'
    case 'idle':
    default:
      return 'var(--cds-icon-secondary)'
  }
}

function getNodeSize(kind: AudioEngineWorkspaceNodeKind) {
  switch (kind) {
    case 'authority':
      return { width: 260, height: 118 }
    case 'engine':
      return { width: 280, height: 124 }
    case 'patch':
    case 'control':
      return { width: 236, height: 104 }
    case 'stream':
      return { width: 248, height: 112 }
    case 'device':
    case 'source':
    case 'sink':
    default:
      return { width: 224, height: 104 }
  }
}

function layoutGraph(nodes: Array<Node<AudioEngineWorkspaceNodeData>>, edges: Edge[]) {
  if (nodes.length === 0) {
    return nodes
  }

  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({
    rankdir: 'LR',
    ranksep: 120,
    nodesep: 36,
    marginx: 32,
    marginy: 24,
  })

  nodes.forEach((node) => {
    graph.setNode(node.id, getNodeSize(node.data.kind))
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
  trafficLevel: AudioEngineWorkspaceTrafficLevel,
  label?: string,
): Edge {
  const stroke = trafficToColor(trafficLevel)

  return {
    id,
    source,
    target,
    type: 'smoothstep',
    animated: trafficLevel !== 'idle',
    label,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: stroke,
    },
    style: {
      stroke,
      strokeWidth: trafficToStrokeWidth(trafficLevel),
    },
    labelStyle: {
      fill: 'var(--cds-text-secondary)',
      fontWeight: 600,
      fontSize: 11,
    },
  }
}

function sourceCaption(sourceOfTruth: AudioSourceTruthPayload | null, effectiveRate: number, effectiveQuantum: number) {
  if (!sourceOfTruth) {
    return `Runtime view only · ${effectiveRate} Hz / ${effectiveQuantum} smp`
  }

  return `${sourceOfTruth.configured.engine_rate_hz} Hz / ${sourceOfTruth.configured.buffer_size_samples} smp configured`
}

function formatNodeLabel(node: PipeWireNodeInfo) {
  return node.nick || node.name
}

function formatDeviceLabel(device: PipeWireDeviceInfo) {
  return device.nick || device.name
}

function formatStreamLabel(stream: PipeWireStreamInfo) {
  return stream.media_name || stream.client_name
}

export function buildAudioEngineWorkspaceGraphModel({
  sourceOfTruth,
  detailNodeLabel,
  devices,
  nodes,
  streams,
  links,
  effectiveRate,
  effectiveQuantum,
  totalLatencyMs,
  xruns,
  pressurePercent,
  selectedAnchorId,
}: BuildAudioEngineWorkspaceGraphArgs): AudioEngineWorkspaceGraphModel {
  const authorityTone = toneFromSourceOfTruth(sourceOfTruth)
  const sourceNodes = nodes.filter((node) => node.media_class.includes('Source')).slice(0, 5)
  const sinkNodes = nodes.filter((node) => node.media_class.includes('Sink')).slice(0, 5)
  const visibleDevices = devices.slice(0, 4)
  const visibleStreams = streams.slice(0, 4)

  const nodesModel: Array<Node<AudioEngineWorkspaceNodeData>> = [
    {
      id: AUTHORITY_NODE_ID,
      type: 'audioEngineWorkspaceNode',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        kind: 'authority',
        eyebrow: 'Control plane',
        label: sourceOfTruth?.profile.selected_profile || 'Authority unavailable',
        caption: sourceCaption(sourceOfTruth, effectiveRate, effectiveQuantum),
        metric: sourceOfTruth ? `${sourceOfTruth.consistency.issue_count} consistency issue${sourceOfTruth.consistency.issue_count === 1 ? '' : 's'}` : 'Source-of-truth query unavailable',
        accentColor: ACCENT.authority,
        tone: authorityTone,
        anchorId: 'audio-engine-source-of-truth',
        selected: selectedAnchorId === 'audio-engine-source-of-truth',
      },
    },
    {
      id: ENGINE_NODE_ID,
      type: 'audioEngineWorkspaceNode',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        kind: 'engine',
        eyebrow: 'JUCE runtime',
        label: detailNodeLabel,
        caption: `${effectiveRate} Hz · ${effectiveQuantum} smp · ${visibleStreams.length || streams.length} observed stream${(visibleStreams.length || streams.length) === 1 ? '' : 's'}`,
        metric: `${totalLatencyMs.toFixed(2)} ms RTL · ${xruns} xrun${xruns === 1 ? '' : 's'}`,
        accentColor: ACCENT.engine,
        tone: toneFromRuntime(xruns > 0 ? 'error' : 'running', xruns),
        anchorId: 'audio-engine-diagnostics',
        selected: selectedAnchorId === 'audio-engine-diagnostics',
      },
    },
    {
      id: PATCH_NODE_ID,
      type: 'audioEngineWorkspaceNode',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        kind: 'patch',
        eyebrow: 'Patch map',
        label: links.length ? `${links.length} active patch link${links.length === 1 ? '' : 's'}` : 'Patch map idle',
        caption: links.length ? 'Observed PipeWire port connections and handoff surface.' : 'No active port links are currently reported.',
        metric: links.length ? `Traffic pulse ${trafficFromScore(links.length + visibleStreams.length)}` : 'Waiting for activity',
        accentColor: ACCENT.patch,
        tone: toneFromRuntime(links.length ? 'active' : 'idle'),
        anchorId: 'audio-engine-routing-links',
        selected: selectedAnchorId === 'audio-engine-routing-links',
      },
    },
    {
      id: CONTROL_NODE_ID,
      type: 'audioEngineWorkspaceNode',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        kind: 'control',
        eyebrow: 'Controls',
        label: 'Quantum, clock, latency',
        caption: pressurePercent != null ? `Pressure ${pressurePercent}% with direct quantum and xrun controls below.` : 'Direct quantum, clock, and xrun controls live below the canvas.',
        metric: `${effectiveQuantum} smp target`,
        accentColor: ACCENT.control,
        tone: xruns > 0 ? 'critical' : pressurePercent != null && pressurePercent >= 60 ? 'warning' : 'aligned',
        anchorId: 'audio-engine-diagnostics',
        selected: selectedAnchorId === 'audio-engine-diagnostics',
      },
    },
  ]

  const edges: Edge[] = [
    buildEdge(
      'authority-engine',
      AUTHORITY_NODE_ID,
      ENGINE_NODE_ID,
      authorityTone === 'critical' ? 'low' : 'medium',
      sourceOfTruth ? `${sourceOfTruth.runtime.engine.sample_rate_hz || effectiveRate} Hz` : undefined,
    ),
    buildEdge(
      'engine-control',
      ENGINE_NODE_ID,
      CONTROL_NODE_ID,
      pressurePercent != null && pressurePercent >= 70 ? 'high' : pressurePercent != null && pressurePercent >= 35 ? 'medium' : 'low',
    ),
  ]

  const relatedLinkCountByNode = new Map<number, number>()
  links.forEach((link) => {
    relatedLinkCountByNode.set(link.output_node, (relatedLinkCountByNode.get(link.output_node) ?? 0) + 1)
    relatedLinkCountByNode.set(link.input_node, (relatedLinkCountByNode.get(link.input_node) ?? 0) + 1)
  })

  visibleDevices.forEach((device) => {
    const deviceNodeId = `audio-engine-workspace:device:${device.id}`
    nodesModel.push({
      id: deviceNodeId,
      type: 'audioEngineWorkspaceNode',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        kind: 'device',
        eyebrow: 'Device',
        label: formatDeviceLabel(device),
        caption: `${device.bus || device.driver || device.media_class} interface`,
        metric: device.is_default ? 'Default interface' : 'Available interface',
        accentColor: ACCENT.device,
        tone: device.is_default ? 'aligned' : 'neutral',
        anchorId: 'audio-engine-routing-devices',
        selected: selectedAnchorId === 'audio-engine-routing-devices',
      },
    })

    sourceNodes
      .filter((node) => node.device_id === device.id)
      .forEach((node) => {
        const trafficLevel = trafficFromScore(node.channels + (relatedLinkCountByNode.get(node.id) ?? 0))
        edges.push(buildEdge(
          `${deviceNodeId}->source:${node.id}`,
          deviceNodeId,
          `audio-engine-workspace:source:${node.id}`,
          trafficLevel,
          `${node.channels} ch`,
        ))
      })

    sinkNodes
      .filter((node) => node.device_id === device.id)
      .forEach((node) => {
        const trafficLevel = trafficFromScore(node.channels + (relatedLinkCountByNode.get(node.id) ?? 0))
        edges.push(buildEdge(
          `${deviceNodeId}->sink:${node.id}`,
          deviceNodeId,
          `audio-engine-workspace:sink:${node.id}`,
          trafficLevel,
          `${node.channels} ch`,
        ))
      })
  })

  sourceNodes.forEach((node) => {
    const nodeId = `audio-engine-workspace:source:${node.id}`
    const trafficLevel = trafficFromScore(node.channels + (relatedLinkCountByNode.get(node.id) ?? 0))

    nodesModel.push({
      id: nodeId,
      type: 'audioEngineWorkspaceNode',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        kind: 'source',
        eyebrow: 'Input node',
        label: formatNodeLabel(node),
        caption: `${node.sample_rate || effectiveRate} Hz · ${node.format}`,
        metric: `${node.channels} ch · ${node.state}`,
        accentColor: ACCENT.source,
        tone: toneFromRuntime(node.state),
        anchorId: 'audio-engine-routing-sources',
        selected: selectedAnchorId === 'audio-engine-routing-sources',
      },
    })

    edges.push(buildEdge(
      `${nodeId}->engine`,
      nodeId,
      ENGINE_NODE_ID,
      trafficLevel,
      `${node.channels} ch`,
    ))
  })

  visibleStreams.forEach((stream) => {
    const streamNodeId = `audio-engine-workspace:stream:${stream.id}`
    const trafficLevel = trafficFromScore(stream.channels + (stream.state === 'running' ? 3 : 1))

    nodesModel.push({
      id: streamNodeId,
      type: 'audioEngineWorkspaceNode',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        kind: 'stream',
        eyebrow: 'Observed stream',
        label: formatStreamLabel(stream),
        caption: `${stream.client_name} · ${stream.direction}`,
        metric: `${stream.sample_rate || effectiveRate} Hz · ${stream.channels} ch`,
        accentColor: ACCENT.stream,
        tone: toneFromRuntime(stream.state),
        anchorId: 'audio-engine-routing-streams',
        selected: selectedAnchorId === 'audio-engine-routing-streams',
      },
    })

    edges.push(buildEdge(
      `${ENGINE_NODE_ID}->${streamNodeId}`,
      ENGINE_NODE_ID,
      streamNodeId,
      trafficLevel,
      `${stream.channels} ch`,
    ))
    edges.push(buildEdge(
      `${streamNodeId}->${PATCH_NODE_ID}`,
      streamNodeId,
      PATCH_NODE_ID,
      trafficLevel,
    ))
  })

  if (visibleStreams.length === 0) {
    edges.push(buildEdge(
      `${ENGINE_NODE_ID}->${PATCH_NODE_ID}`,
      ENGINE_NODE_ID,
      PATCH_NODE_ID,
      trafficFromScore(links.length),
    ))
  }

  sinkNodes.forEach((node) => {
    const nodeId = `audio-engine-workspace:sink:${node.id}`
    const trafficLevel = trafficFromScore(node.channels + (relatedLinkCountByNode.get(node.id) ?? 0))

    nodesModel.push({
      id: nodeId,
      type: 'audioEngineWorkspaceNode',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        kind: 'sink',
        eyebrow: 'Output node',
        label: formatNodeLabel(node),
        caption: `${node.sample_rate || effectiveRate} Hz · ${node.format}`,
        metric: `${node.channels} ch · ${node.state}`,
        accentColor: ACCENT.sink,
        tone: toneFromRuntime(node.state),
        anchorId: 'audio-engine-routing-sinks',
        selected: selectedAnchorId === 'audio-engine-routing-sinks',
      },
    })

    edges.push(buildEdge(
      `${PATCH_NODE_ID}->${nodeId}`,
      PATCH_NODE_ID,
      nodeId,
      trafficLevel,
      `${node.channels} ch`,
    ))
  })

  const summaryTags: AudioEngineWorkspaceGraphTag[] = [
    {
      label: sourceOfTruth ? sourceOfTruth.status.toUpperCase() : 'RUNTIME ONLY',
      type: toneToTagType(authorityTone),
    },
    {
      label: `${devices.length} device${devices.length === 1 ? '' : 's'}`,
      type: 'cool-gray',
    },
    {
      label: `${links.length} patch link${links.length === 1 ? '' : 's'}`,
      type: links.length > 0 ? 'green' : 'cool-gray',
    },
    {
      label: xruns > 0 ? `${xruns} xruns` : 'No xruns',
      type: xruns > 0 ? 'red' : 'green',
    },
  ]

  if (pressurePercent != null) {
    summaryTags.push({
      label: `Pressure ${pressurePercent}%`,
      type: pressurePercent >= 70 ? 'red' : pressurePercent >= 35 ? 'warm-gray' : 'green',
    })
  }

  const pulseCopy = visibleStreams.length > 0 || links.length > 0
    ? 'Animated edges reflect observed stream and patch-link volume. Click any card to jump to the matching table or control section below.'
    : 'The workspace is currently idle. Click any card to jump to devices, nodes, patch links, or controls while waiting for live traffic.'

  return {
    nodes: layoutGraph(nodesModel, edges),
    edges,
    summaryTags,
    pulseCopy,
  }
}
