import { useEffect, useMemo } from 'react'
import '../shared/ReactFlowTheme.css'

import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'

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

function SourceTruthNode({ data }: NodeProps<RenderNodeData>) {
  return (
    <button
      type="button"
      className="audio-engine-page__source-truth-node"
      style={{
        width: NODE_WIDTH[data.nodeId],
        minHeight: 108,
        border: `1px solid ${data.selected ? data.accentColor : toneBorder(data.tone)}`,
        borderInlineStart: `5px solid ${data.accentColor}`,
        background: data.selected ? 'var(--cds-layer-selected)' : 'var(--cds-layer)',
        boxShadow: data.selected ? `0 0 0 2px ${data.accentColor}33` : '0 10px 26px rgba(15, 98, 254, 0.08)',
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

function SourceTruthGraphCanvas({
  nodes,
  edges,
}: {
  nodes: Array<Node<RenderNodeData>>
  edges: Edge[]
}) {
  const { fitView } = useReactFlow()

  useEffect(() => {
    fitView({ padding: 0.16, duration: 180 })
  }, [edges, fitView, nodes])

  return (
    <ReactFlow
      fitView
      nodes={nodes}
      edges={edges}
      nodeTypes={{ juceSourceTruthNode: SourceTruthNode }}
      minZoom={0.5}
      maxZoom={1.5}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--cds-border-subtle-01)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

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

  if (graphNodes.length === 0) {
    return (
      <div className="audio-engine-page__workspace-graph-empty">
        Source-of-truth graph data is not available for this node.
      </div>
    )
  }

  return (
    <div className="audio-engine-page__source-truth-graph">
      <ReactFlowProvider>
        <SourceTruthGraphCanvas nodes={graphNodes} edges={model.edges} />
      </ReactFlowProvider>
    </div>
  )
}

export default JuceSourceTruthGraph
