import { useMemo, type CSSProperties } from 'react'

import { Handle, Position } from 'reactflow'
import type { Node, NodeProps } from 'reactflow'

import { SignalFlowGraph } from '../shared/SignalFlowGraph'
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

export function ManagementWorkspaceNodeCard({ data }: NodeProps<RenderNodeData>) {
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

const nodeTypes = { managementWorkspaceNode: ManagementWorkspaceNodeCard }

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

  return (
    <SignalFlowGraph<RenderNodeData>
      nodes={graphNodes}
      edges={model.edges}
      nodeTypes={nodeTypes}
      wrapperClassName="management-workspace__graph"
      toolbar={
        <div className="management-workspace__graph-toolbar" aria-hidden="true">
          <span>Management map</span>
          <span>Pan and zoom to inspect service posture</span>
        </div>
      }
      emptyState={
        <div className="management-workspace__graph-empty">
          No management telemetry is currently available for this workspace.
        </div>
      }
    />
  )
}

export default ManagementWorkspaceGraph
