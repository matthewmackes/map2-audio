import { useEffect, useMemo, type CSSProperties } from 'react'

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
  ManagementWorkspaceGraphModel,
  ManagementWorkspaceGraphSelection,
  ManagementWorkspaceNodeData,
} from './managementWorkspaceGraph'

type RenderNodeData = ManagementWorkspaceNodeData & {
  onSelect: (selection: ManagementWorkspaceGraphSelection) => void
}

function toneBorder(tone: ManagementWorkspaceNodeData['tone']) {
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

function toneLabel(tone: ManagementWorkspaceNodeData['tone']) {
  switch (tone) {
    case 'aligned':
      return 'Stable'
    case 'warning':
      return 'Watch'
    case 'critical':
      return 'Risk'
    case 'neutral':
    default:
      return 'Info'
  }
}

function cardWidth(kind: ManagementWorkspaceNodeData['kind']) {
  switch (kind) {
    case 'hub':
      return 290
    case 'service':
    default:
      return 232
  }
}

function ManagementWorkspaceNodeCard({ data }: NodeProps<RenderNodeData>) {
  const nodeStyle = {
    '--management-graph-node-width': `${cardWidth(data.kind)}px`,
    '--management-graph-node-min-height': `${data.kind === 'hub' ? 132 : 108}px`,
    '--management-graph-node-accent': data.accentColor,
    '--management-graph-node-tone': data.selected ? data.accentColor : toneBorder(data.tone),
  } as CSSProperties

  return (
    <button
      type="button"
      className={`management-workspace__graph-node management-workspace__graph-node--${data.kind}${data.selected ? ' is-selected' : ''}`}
      style={nodeStyle}
      onClick={() => data.onSelect({
        anchorId: data.anchorId,
        recordId: data.recordId,
        contextNodeId: data.contextNodeId,
      })}
      aria-label={`Jump to ${data.label}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="management-workspace__graph-handle management-workspace__graph-handle--target"
        style={{ background: data.accentColor }}
      />
      <div className="management-workspace__graph-node-head">
        <span className="management-workspace__graph-node-eyebrow">
          {data.eyebrow}
        </span>
        <span className="management-workspace__graph-node-tone">
          {toneLabel(data.tone)}
        </span>
      </div>
      <div className="management-workspace__graph-node-label">{data.label}</div>
      <div className="management-workspace__graph-node-caption">
        {data.caption}
      </div>
      <div className="management-workspace__graph-node-metric">
        {data.metric}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="management-workspace__graph-handle management-workspace__graph-handle--source"
        style={{ background: data.accentColor }}
      />
    </button>
  )
}

function ManagementWorkspaceGraphCanvas({
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
      className="management-workspace__graph-flow"
      fitView
      nodes={nodes}
      edges={edges}
      nodeTypes={{ managementWorkspaceNode: ManagementWorkspaceNodeCard }}
      minZoom={0.45}
      maxZoom={1.5}
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

export function ManagementWorkspaceGraph({
  model,
  onSelect,
}: {
  model: ManagementWorkspaceGraphModel
  onSelect: (selection: ManagementWorkspaceGraphSelection) => void
}) {
  const graphNodes = useMemo<Array<Node<RenderNodeData>>>(() => (
    model.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onSelect,
      },
    }))
  ), [model.nodes, onSelect])

  if (graphNodes.length === 0) {
    return (
      <div className="management-workspace__graph-empty">
        No management telemetry is currently available for this workspace.
      </div>
    )
  }

  return (
    <div className="management-workspace__graph">
      <div className="management-workspace__graph-toolbar" aria-hidden="true">
        <span>Management map</span>
        <span>Pan and zoom to inspect service posture</span>
      </div>
      <ReactFlowProvider>
        <ManagementWorkspaceGraphCanvas nodes={graphNodes} edges={model.edges} />
      </ReactFlowProvider>
    </div>
  )
}

export default ManagementWorkspaceGraph
