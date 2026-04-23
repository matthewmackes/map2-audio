import dagre from 'dagre'
import { MarkerType, type Edge, type Node } from 'reactflow'

import type { AudioSourceTruthPayload } from '../../../map2/types'

export type JuceSourceTruthNodeId =
  | 'profile'
  | 'configured-engine'
  | 'juce-runtime'
  | 'pipewire-runtime'
  | 'spdif-policy'
  | 'avb-policy'
  | 'avb-runtime'

type JuceSourceTruthTone = 'aligned' | 'warning' | 'critical' | 'neutral'

interface JuceSourceTruthNodeSize {
  width: number
  height: number
}

export interface JuceSourceTruthNodeData {
  nodeId: JuceSourceTruthNodeId
  eyebrow: string
  label: string
  caption: string
  metric: string
  accentColor: string
  tone: JuceSourceTruthTone
  selected?: boolean
}

export interface JuceSourceTruthGraphTag {
  label: string
  type: 'green' | 'warm-gray' | 'red' | 'cool-gray'
}

export interface JuceSourceTruthConnectionDetail {
  label: string
  value: string
}

export interface JuceSourceTruthConnectionRow {
  id: string
  sourceId: JuceSourceTruthNodeId
  sourceLabel: string
  targetId: JuceSourceTruthNodeId
  targetLabel: string
  relationship: string
  status: string
  summary: string
  details: JuceSourceTruthConnectionDetail[]
}

export interface JuceSourceTruthGraphModel {
  nodes: Array<Node<JuceSourceTruthNodeData>>
  edges: Edge[]
  rows: JuceSourceTruthConnectionRow[]
  summaryTags: JuceSourceTruthGraphTag[]
  pulseCopy: string
}

interface BuildJuceSourceTruthGraphArgs {
  payload: AudioSourceTruthPayload | null
  selectedNodeId: JuceSourceTruthNodeId | null
}

const NODE_SIZE: Record<JuceSourceTruthNodeId, JuceSourceTruthNodeSize> = {
  profile: { width: 248, height: 108 },
  'configured-engine': { width: 260, height: 116 },
  'juce-runtime': { width: 264, height: 118 },
  'pipewire-runtime': { width: 252, height: 112 },
  'spdif-policy': { width: 224, height: 104 },
  'avb-policy': { width: 224, height: 104 },
  'avb-runtime': { width: 232, height: 104 },
}

const ACCENT: Record<JuceSourceTruthNodeId, string> = {
  profile: 'var(--cds-link-primary)',
  'configured-engine': 'var(--cds-link-primary-hover)',
  'juce-runtime': 'var(--cds-support-info)',
  'pipewire-runtime': 'var(--cds-support-info)',
  'spdif-policy': 'var(--cds-support-warning)',
  'avb-policy': 'var(--cds-support-success)',
  'avb-runtime': 'var(--cds-support-success)',
}

function toneToTagType(tone: JuceSourceTruthTone): JuceSourceTruthGraphTag['type'] {
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

function toneLabel(tone: JuceSourceTruthTone) {
  switch (tone) {
    case 'aligned':
      return 'Aligned'
    case 'warning':
      return 'Watch'
    case 'critical':
      return 'Critical'
    case 'neutral':
    default:
      return 'Info'
  }
}

function toneFromOverallStatus(status: AudioSourceTruthPayload['status']): JuceSourceTruthTone {
  switch (status) {
    case 'aligned':
      return 'aligned'
    case 'warning':
      return 'warning'
    case 'error':
    default:
      return 'critical'
  }
}

function toneForJuceRuntime(payload: AudioSourceTruthPayload): JuceSourceTruthTone {
  if (!payload.runtime.engine.available || !payload.runtime.engine.running) {
    return 'critical'
  }
  if (
    payload.runtime.engine.sample_rate_hz !== payload.configured.engine_rate_hz
    || payload.runtime.engine.buffer_size_samples !== payload.configured.buffer_size_samples
  ) {
    return 'warning'
  }

  return 'aligned'
}

function toneForPipeWire(payload: AudioSourceTruthPayload): JuceSourceTruthTone {
  if (!payload.runtime.pipewire.available) {
    return 'critical'
  }
  if (
    payload.runtime.pipewire.effective_rate_hz !== payload.runtime.engine.sample_rate_hz
    || payload.runtime.pipewire.effective_quantum_samples !== payload.runtime.engine.buffer_size_samples
  ) {
    return 'warning'
  }

  return 'aligned'
}

function toneForAvbPolicy(payload: AudioSourceTruthPayload): JuceSourceTruthTone {
  if (!payload.configured.avb.enabled) {
    return 'neutral'
  }
  return payload.runtime.avb.enabled ? 'aligned' : 'warning'
}

function toneForAvbRuntime(payload: AudioSourceTruthPayload): JuceSourceTruthTone {
  if (!payload.runtime.avb.enabled && !payload.runtime.avb.available) {
    return 'neutral'
  }

  const loweredState = payload.runtime.avb.state.toLowerCase()
  if (loweredState.includes('error') || loweredState.includes('fault')) {
    return 'critical'
  }
  if (!payload.runtime.avb.available || loweredState.includes('disabled') || loweredState.includes('waiting')) {
    return 'warning'
  }
  return 'aligned'
}

function toneForSpdifPolicy(payload: AudioSourceTruthPayload): JuceSourceTruthTone {
  if (!payload.configured.spdif.enabled) {
    return 'neutral'
  }
  if (!payload.configured.spdif.require_hard_lock || payload.configured.spdif.allow_resampler) {
    return 'warning'
  }
  return 'aligned'
}

function edgeStroke(tone: JuceSourceTruthTone) {
  switch (tone) {
    case 'aligned':
      return 'var(--cds-support-success)'
    case 'warning':
      return 'var(--cds-support-warning)'
    case 'critical':
      return 'var(--cds-support-error)'
    case 'neutral':
    default:
      return 'var(--cds-icon-secondary)'
  }
}

function toneStatus(tone: JuceSourceTruthTone) {
  switch (tone) {
    case 'aligned':
      return 'Aligned'
    case 'warning':
      return 'Review'
    case 'critical':
      return 'Critical'
    case 'neutral':
    default:
      return 'Informational'
  }
}

function formatBoolean(value: boolean) {
  return value ? 'Yes' : 'No'
}

function formatOffset(offsetNs: number | undefined) {
  if (typeof offsetNs !== 'number') {
    return 'Unavailable'
  }
  return `${offsetNs} ns`
}

function buildNode(
  nodeId: JuceSourceTruthNodeId,
  {
    eyebrow,
    label,
    caption,
    metric,
    tone,
    selected,
  }: Omit<JuceSourceTruthNodeData, 'nodeId' | 'accentColor'>,
): Node<JuceSourceTruthNodeData> {
  return {
    id: nodeId,
    type: 'juceSourceTruthNode',
    position: { x: 0, y: 0 },
    data: {
      nodeId,
      eyebrow,
      label,
      caption,
      metric,
      tone,
      selected,
      accentColor: ACCENT[nodeId],
    },
  }
}

function buildEdge(
  row: JuceSourceTruthConnectionRow,
  tone: JuceSourceTruthTone,
  highlighted: boolean,
): Edge {
  const stroke = edgeStroke(tone)

  return {
    id: row.id,
    source: row.sourceId,
    target: row.targetId,
    type: 'smoothstep',
    animated: tone !== 'neutral',
    label: row.relationship,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: stroke,
    },
    style: {
      stroke,
      strokeWidth: highlighted ? 4.5 : 3,
      opacity: highlighted || tone !== 'neutral' ? 1 : 0.8,
    },
    labelStyle: {
      fill: 'var(--cds-text-secondary)',
      fontWeight: 600,
      fontSize: 11,
    },
  }
}

function layoutGraph(nodes: Array<Node<JuceSourceTruthNodeData>>, edges: Edge[]) {
  if (nodes.length === 0) {
    return nodes
  }

  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({
    rankdir: 'LR',
    ranksep: 96,
    nodesep: 32,
    marginx: 24,
    marginy: 24,
  })

  nodes.forEach((node) => {
    graph.setNode(node.id, NODE_SIZE[node.id as JuceSourceTruthNodeId])
  })

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target)
  })

  dagre.layout(graph)

  return nodes.map((node) => {
    const size = NODE_SIZE[node.id as JuceSourceTruthNodeId]
    const position = graph.node(node.id)

    return {
      ...node,
      position: {
        x: position.x - size.width / 2,
        y: position.y - size.height / 2,
      },
    }
  })
}

export function buildJuceSourceTruthGraphModel({
  payload,
  selectedNodeId,
}: BuildJuceSourceTruthGraphArgs): JuceSourceTruthGraphModel {
  if (!payload) {
    return {
      nodes: [],
      edges: [],
      rows: [],
      summaryTags: [
        { label: 'Source of truth unavailable', type: 'red' },
      ],
      pulseCopy: 'Waiting for the latest authority snapshot before building the JUCE source-of-truth chain.',
    }
  }

  const overallTone = toneFromOverallStatus(payload.status)
  const juceTone = toneForJuceRuntime(payload)
  const pipewireTone = toneForPipeWire(payload)
  const spdifTone = toneForSpdifPolicy(payload)
  const avbPolicyTone = toneForAvbPolicy(payload)
  const avbRuntimeTone = toneForAvbRuntime(payload)

  const nodes = [
    buildNode('profile', {
      eyebrow: 'Authority',
      label: 'Profile Authority',
      caption: `Clock master ${payload.profile.clock_master}`,
      metric: payload.profile.selected_profile,
      tone: overallTone,
      selected: selectedNodeId === 'profile',
    }),
    buildNode('configured-engine', {
      eyebrow: 'Configured',
      label: 'Configured Engine',
      caption: `${payload.configured.bits_per_sample}-bit target with ${payload.configured.allowed_rates_hz.length} allowed rates`,
      metric: `${payload.configured.engine_rate_hz} Hz / ${payload.configured.buffer_size_samples} smp`,
      tone: overallTone,
      selected: selectedNodeId === 'configured-engine',
    }),
    buildNode('juce-runtime', {
      eyebrow: 'Observed',
      label: 'JUCE Runtime',
      caption: payload.runtime.engine.audio_device || 'Runtime device unavailable',
      metric: payload.runtime.engine.running
        ? `${payload.runtime.engine.sample_rate_hz} Hz / ${payload.runtime.engine.buffer_size_samples} smp`
        : 'Runtime stopped',
      tone: juceTone,
      selected: selectedNodeId === 'juce-runtime',
    }),
    buildNode('pipewire-runtime', {
      eyebrow: 'Observed',
      label: 'PipeWire Runtime',
      caption: payload.runtime.pipewire.available ? 'Negotiated host clock and quantum' : (payload.runtime.pipewire.error || 'PipeWire runtime unavailable'),
      metric: `${payload.runtime.pipewire.effective_rate_hz} Hz / ${payload.runtime.pipewire.effective_quantum_samples} smp`,
      tone: pipewireTone,
      selected: selectedNodeId === 'pipewire-runtime',
    }),
    buildNode('spdif-policy', {
      eyebrow: 'Policy',
      label: 'S/PDIF Policy',
      caption: payload.configured.spdif.device || 'No dedicated S/PDIF device configured',
      metric: `${payload.configured.spdif.enabled ? 'Enabled' : 'Disabled'} / ${payload.configured.spdif_rate_hz} Hz`,
      tone: spdifTone,
      selected: selectedNodeId === 'spdif-policy',
    }),
    buildNode('avb-policy', {
      eyebrow: 'Policy',
      label: 'AVB Policy',
      caption: payload.configured.avb.interface || 'No AVB interface configured',
      metric: payload.configured.avb.enabled ? `PTP ${payload.configured.avb.ptp_domain}` : 'Disabled',
      tone: avbPolicyTone,
      selected: selectedNodeId === 'avb-policy',
    }),
    buildNode('avb-runtime', {
      eyebrow: 'Observed',
      label: 'AVB Runtime',
      caption: payload.runtime.avb.ptp.state || 'No live PTP state reported',
      metric: payload.runtime.avb.state,
      tone: avbRuntimeTone,
      selected: selectedNodeId === 'avb-runtime',
    }),
  ]

  const rows = [
    {
      id: 'profile-to-configured',
      sourceId: 'profile',
      sourceLabel: 'Profile Authority',
      targetId: 'configured-engine',
      targetLabel: 'Configured Engine',
      relationship: 'Selects profile policy',
      status: toneStatus(overallTone),
      summary: `${payload.profile.selected_profile} / master ${payload.profile.clock_master}`,
      details: [
        { label: 'Selected profile', value: payload.profile.selected_profile },
        { label: 'Profile version', value: payload.profile.profile_version },
        { label: 'Clock master', value: payload.profile.clock_master },
        { label: 'Allowed rates', value: payload.configured.allowed_rates_hz.join(', ') || 'None' },
        { label: 'Hard lock required', value: formatBoolean(payload.configured.require_hard_lock) },
        { label: 'Resampler allowed', value: formatBoolean(payload.configured.allow_resampler) },
      ],
    },
    {
      id: 'configured-to-juce',
      sourceId: 'configured-engine',
      sourceLabel: 'Configured Engine',
      targetId: 'juce-runtime',
      targetLabel: 'JUCE Runtime',
      relationship: 'Applies engine settings',
      status: toneStatus(juceTone),
      summary: `${payload.configured.engine_rate_hz} Hz / ${payload.configured.buffer_size_samples} smp -> ${payload.runtime.engine.sample_rate_hz} Hz / ${payload.runtime.engine.buffer_size_samples} smp`,
      details: [
        { label: 'Configured rate', value: `${payload.configured.engine_rate_hz} Hz` },
        { label: 'Configured buffer', value: `${payload.configured.buffer_size_samples} samples` },
        { label: 'Runtime rate', value: `${payload.runtime.engine.sample_rate_hz} Hz` },
        { label: 'Runtime buffer', value: `${payload.runtime.engine.buffer_size_samples} samples` },
        { label: 'Runtime running', value: formatBoolean(payload.runtime.engine.running) },
        { label: 'Runtime available', value: formatBoolean(payload.runtime.engine.available) },
        { label: 'CPU load', value: `${payload.runtime.engine.cpu_load_percent}%` },
        { label: 'Runtime device', value: payload.runtime.engine.audio_device || 'Unavailable' },
      ],
    },
    {
      id: 'juce-to-pipewire',
      sourceId: 'juce-runtime',
      sourceLabel: 'JUCE Runtime',
      targetId: 'pipewire-runtime',
      targetLabel: 'PipeWire Runtime',
      relationship: 'Negotiates host runtime',
      status: toneStatus(pipewireTone),
      summary: `${payload.runtime.engine.sample_rate_hz} Hz / ${payload.runtime.engine.buffer_size_samples} smp -> ${payload.runtime.pipewire.effective_rate_hz} Hz / ${payload.runtime.pipewire.effective_quantum_samples} smp`,
      details: [
        { label: 'JUCE runtime rate', value: `${payload.runtime.engine.sample_rate_hz} Hz` },
        { label: 'JUCE runtime buffer', value: `${payload.runtime.engine.buffer_size_samples} samples` },
        { label: 'PipeWire effective rate', value: `${payload.runtime.pipewire.effective_rate_hz} Hz` },
        { label: 'PipeWire effective quantum', value: `${payload.runtime.pipewire.effective_quantum_samples} samples` },
        { label: 'Forced rate', value: `${payload.runtime.pipewire.clock_force_rate_hz} Hz` },
        { label: 'Forced quantum', value: `${payload.runtime.pipewire.clock_force_quantum_samples} samples` },
        { label: 'PipeWire available', value: formatBoolean(payload.runtime.pipewire.available) },
      ],
    },
    {
      id: 'configured-to-spdif',
      sourceId: 'configured-engine',
      sourceLabel: 'Configured Engine',
      targetId: 'spdif-policy',
      targetLabel: 'S/PDIF Policy',
      relationship: 'Constrains digital output',
      status: toneStatus(spdifTone),
      summary: `${payload.configured.spdif.enabled ? 'Enabled' : 'Disabled'} / ${payload.configured.spdif_rate_hz} Hz`,
      details: [
        { label: 'S/PDIF enabled', value: formatBoolean(payload.configured.spdif.enabled) },
        { label: 'S/PDIF rate', value: `${payload.configured.spdif_rate_hz} Hz` },
        { label: 'Transport mode', value: payload.configured.spdif.transport_mode || 'Unavailable' },
        { label: 'Configured device', value: payload.configured.spdif.device || 'Unavailable' },
        { label: 'Allow resampler', value: formatBoolean(payload.configured.spdif.allow_resampler) },
        { label: 'Require hard lock', value: formatBoolean(payload.configured.spdif.require_hard_lock) },
      ],
    },
    {
      id: 'configured-to-avb-policy',
      sourceId: 'configured-engine',
      sourceLabel: 'Configured Engine',
      targetId: 'avb-policy',
      targetLabel: 'AVB Policy',
      relationship: 'Publishes transport policy',
      status: toneStatus(avbPolicyTone),
      summary: payload.configured.avb.enabled
        ? `${payload.configured.avb.interface || 'Interface pending'} / PTP ${payload.configured.avb.ptp_domain}`
        : 'AVB disabled in authority',
      details: [
        { label: 'AVB enabled', value: formatBoolean(payload.configured.avb.enabled) },
        { label: 'Interface', value: payload.configured.avb.interface || 'Unavailable' },
        { label: 'Auto connect', value: formatBoolean(payload.configured.avb.auto_connect) },
        { label: 'PTP domain', value: `${payload.configured.avb.ptp_domain}` },
        { label: 'Max streams', value: `${payload.configured.avb.max_streams}` },
      ],
    },
    {
      id: 'avb-policy-to-runtime',
      sourceId: 'avb-policy',
      sourceLabel: 'AVB Policy',
      targetId: 'avb-runtime',
      targetLabel: 'AVB Runtime',
      relationship: 'Reports live transport',
      status: toneStatus(avbRuntimeTone),
      summary: payload.runtime.avb.reason ? `${payload.runtime.avb.state} / ${payload.runtime.avb.reason}` : payload.runtime.avb.state,
      details: [
        { label: 'Runtime enabled', value: formatBoolean(payload.runtime.avb.enabled) },
        { label: 'Runtime available', value: formatBoolean(payload.runtime.avb.available) },
        { label: 'State', value: payload.runtime.avb.state },
        { label: 'Reason', value: payload.runtime.avb.reason || 'Unavailable' },
        { label: 'PTP state', value: payload.runtime.avb.ptp.state || 'Unavailable' },
        { label: 'PTP offset', value: formatOffset(payload.runtime.avb.ptp.offset_ns) },
      ],
    },
  ] satisfies JuceSourceTruthConnectionRow[]

  const edgeTones: Record<string, JuceSourceTruthTone> = {
    'profile-to-configured': overallTone,
    'configured-to-juce': juceTone,
    'juce-to-pipewire': pipewireTone,
    'configured-to-spdif': spdifTone,
    'configured-to-avb-policy': avbPolicyTone,
    'avb-policy-to-runtime': avbRuntimeTone,
  }

  const edges = rows.map((row) => buildEdge(
    row,
    edgeTones[row.id] ?? 'neutral',
    selectedNodeId === row.sourceId || selectedNodeId === row.targetId,
  ))

  const issueCount = payload.consistency.issue_count || payload.consistency.issues.length

  return {
    nodes: layoutGraph(nodes, edges),
    edges,
    rows,
    summaryTags: [
      { label: `Authority ${payload.status.toUpperCase()}`, type: toneToTagType(overallTone) },
      { label: `${rows.length} connections`, type: 'cool-gray' },
      { label: `${issueCount} issues`, type: issueCount > 0 ? 'warm-gray' : 'green' },
      { label: toneLabel(selectedNodeId ? nodes.find((node) => node.id === selectedNodeId)?.data.tone ?? 'neutral' : overallTone), type: toneToTagType(selectedNodeId ? nodes.find((node) => node.id === selectedNodeId)?.data.tone ?? 'neutral' : overallTone) },
    ],
    pulseCopy: 'Authority policy flows left-to-right into JUCE runtime, host-clock negotiation, and transport policy edges. Selecting a node expands the matching connection rows below.',
  }
}
