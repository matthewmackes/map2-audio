import { useMemo } from 'react'

import { Handle, Position } from 'reactflow'
import type { Node, NodeProps } from 'reactflow'

import { SignalFlowGraph } from '../shared/SignalFlowGraph'
import type {
  JuceSourceTruthGraphModel,
  JuceSourceTruthNodeData,
  JuceSourceTruthNodeId,
} from './juceSourceTruthGraph'

type RenderNodeData = JuceSourceTruthNodeData & {
  onSelectNode: (nodeId: JuceSourceTruthNodeId) => void
}

const NODE_WIDTH: Record<JuceSourceTruthNodeId, number> = {
  profile: 248,
  'configured-engine': 260,
  'juce-runtime': 264,
  'pipewire-runtime': 252,
  'spdif-policy': 224,
  'avb-policy': 224,
  'avb-runtime': 232,
}

function toneBorder(tone: JuceSourceTruthNodeData['tone']) {
  switch (tone) {
    case 'aligned':
      return 'var(--cds-support-success)'
    case 'warning':
      return 'var(--cds-support-warning)'
    case 'critical':
      return 'var(--cds-support-error)'
    case 'neutral':
    default:
      return 'var(--cds-border-strong-01)'
  }
}

function toneLabel(tone: JuceSourceTruthNodeData['tone']) {
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

export function SourceTruthNode({ data }: NodeProps<RenderNodeData>) {
  return (
    <button
      type="button"
      className="audio-engine-page__source-truth-node"
      style={{
        width: NODE_WIDTH[data.nodeId],
        minHeight: 108,
        border: `1px solid ${data.selected ? data.accentColor : toneBorder(data.tone)}`,
        borderInlineStart: `5px solid ${data.accentColor}`,
        background: data.selected ? 'var(--cds-layer-selected)' : 'var(--audio-engine-page-panel, var(--cds-layer))',
        boxShadow: data.selected
          ? `0 0 0 2px color-mix(in srgb, ${data.accentColor} 18%, transparent)`
          : 'var(--audio-engine-graph-node-shadow-strong, 0 10px 26px color-mix(in srgb, var(--cds-layer-selected) 38%, transparent))',
      }}
      onClick={() => data.onSelectNode(data.nodeId)}
      aria-label={`Inspect ${data.label}`}
    >
      <Handle type="target" position={Position.Left} style={{ background: data.accentColor }} />
      <div className="audio-engine-page__source-truth-node-header">
        <span className="audio-engine-page__source-truth-node-eyebrow">{data.eyebrow}</span>
        <span className="audio-engine-page__source-truth-node-tone">{toneLabel(data.tone)}</span>
      </div>
      <div className="audio-engine-page__source-truth-node-label">{data.label}</div>
      <div className="audio-engine-page__source-truth-node-caption">{data.caption}</div>
      <div className="audio-engine-page__source-truth-node-metric">{data.metric}</div>
      <Handle type="source" position={Position.Right} style={{ background: data.accentColor }} />
    </button>
  )
}

const nodeTypes = { juceSourceTruthNode: SourceTruthNode }

export function JuceSourceTruthGraph({
  model,
  onSelectNode,
}: {
  model: JuceSourceTruthGraphModel
  onSelectNode: (nodeId: JuceSourceTruthNodeId) => void
}) {
  const graphNodes = useMemo<Array<Node<RenderNodeData>>>(() => (
    model.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onSelectNode,
      },
    }))
  ), [model.nodes, onSelectNode])

  return (
    <SignalFlowGraph<RenderNodeData>
      nodes={graphNodes}
      edges={model.edges}
      nodeTypes={nodeTypes}
      wrapperClassName="audio-engine-page__source-truth-graph"
      minZoom={0.5}
      backgroundDotGap={18}
      emptyState={
        <div className="audio-engine-page__workspace-graph-empty">
          Source-of-truth graph data is not available for this node.
        </div>
      }
    />
  )
}

export default JuceSourceTruthGraph
