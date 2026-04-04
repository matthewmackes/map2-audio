import { useEffect, useMemo } from 'react'

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
  AudioEngineWorkspaceAnchorId,
  AudioEngineWorkspaceGraphModel,
  AudioEngineWorkspaceNodeData,
} from './audioEngineWorkspaceGraph'

type AudioEngineWorkspaceRenderNodeData = AudioEngineWorkspaceNodeData & {
  onSelectAnchor: (anchorId: AudioEngineWorkspaceAnchorId) => void
}

function toneBorder(tone: AudioEngineWorkspaceNodeData['tone']) {
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

function toneLabel(tone: AudioEngineWorkspaceNodeData['tone']) {
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

function AudioEngineWorkspaceNodeCard({ data }: NodeProps<AudioEngineWorkspaceRenderNodeData>) {
  const cardStyle = {
    width: data.kind === 'engine' ? 280 : data.kind === 'authority' ? 260 : 224,
    minHeight: data.kind === 'engine' ? 124 : 104,
    border: `1px solid ${data.selected ? data.accentColor : toneBorder(data.tone)}`,
    borderInlineStart: `6px solid ${data.accentColor}`,
    borderRadius: 10,
    background: data.selected ? 'var(--cds-layer-selected-01)' : 'var(--cds-layer-01)',
    color: 'var(--cds-text-primary)',
    padding: '0.9rem',
    boxShadow: data.selected ? `0 0 0 2px ${data.accentColor}33` : '0 8px 22px rgba(15, 98, 254, 0.08)',
    textAlign: 'left' as const,
    cursor: 'pointer',
  }

  return (
    <button
      type="button"
      style={cardStyle}
      onClick={() => data.onSelectAnchor(data.anchorId)}
      aria-label={`Jump to ${data.label}`}
    >
      <Handle type="target" position={Position.Left} style={{ background: data.accentColor }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {data.eyebrow}
        </span>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: data.selected ? data.accentColor : 'var(--cds-text-secondary)' }}>
          {toneLabel(data.tone)}
        </span>
      </div>
      <div style={{ fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.25 }}>{data.label}</div>
      <div style={{ fontSize: '0.76rem', color: 'var(--cds-text-secondary)', marginTop: '0.375rem', lineHeight: 1.35 }}>
        {data.caption}
      </div>
      <div style={{ fontSize: '0.76rem', color: data.accentColor, marginTop: '0.75rem', fontWeight: 600 }}>
        {data.metric}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: data.accentColor }} />
    </button>
  )
}

function AudioEngineWorkspaceGraphCanvas({
  nodes,
  edges,
}: {
  nodes: Array<Node<AudioEngineWorkspaceRenderNodeData>>
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
      nodeTypes={{ audioEngineWorkspaceNode: AudioEngineWorkspaceNodeCard }}
      minZoom={0.5}
      maxZoom={1.55}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--cds-border-subtle-01)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}

export function AudioEngineWorkspaceGraph({
  model,
  onSelectAnchor,
}: {
  model: AudioEngineWorkspaceGraphModel
  onSelectAnchor: (anchorId: AudioEngineWorkspaceAnchorId) => void
}) {
  const graphNodes = useMemo<Array<Node<AudioEngineWorkspaceRenderNodeData>>>(() => (
    model.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onSelectAnchor,
      },
    }))
  ), [model.nodes, onSelectAnchor])

  if (graphNodes.length === 0) {
    return (
      <div className="audio-engine-page__workspace-graph-empty">
        No runtime topology is currently available for this node.
      </div>
    )
  }

  return (
    <div className="audio-engine-page__workspace-graph">
      <ReactFlowProvider>
        <AudioEngineWorkspaceGraphCanvas nodes={graphNodes} edges={model.edges} />
      </ReactFlowProvider>
    </div>
  )
}

export default AudioEngineWorkspaceGraph
