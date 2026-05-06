import { useMemo } from 'react'

import { Handle, Position } from 'reactflow'
import type { Node, NodeProps } from 'reactflow'

import { EmptyState } from '../shared/EmptyState'
import { SignalFlowGraph } from '../shared/SignalFlowGraph'
import type {
  AvbRoutingWorkspaceGraphModel,
  AvbRoutingWorkspaceGraphSelection,
  AvbRoutingWorkspaceNodeData,
} from './avbRoutingWorkspaceGraph'

type RenderNodeData = AvbRoutingWorkspaceNodeData & {
  onSelect: (selection: AvbRoutingWorkspaceGraphSelection) => void
}

function toneBorder(tone: AvbRoutingWorkspaceNodeData['tone']) {
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

function toneLabel(tone: AvbRoutingWorkspaceNodeData['tone']) {
  switch (tone) {
    case 'aligned':
      return 'Locked'
    case 'warning':
      return 'Watch'
    case 'critical':
      return 'Risk'
    case 'neutral':
    default:
      return 'Info'
  }
}

function cardWidth(kind: AvbRoutingWorkspaceNodeData['kind']) {
  switch (kind) {
    case 'fabric':
      return 280
    case 'tesira':
      return 232
    case 'node':
    default:
      return 244
  }
}

export function AvbRoutingWorkspaceNodeCard({ data }: NodeProps<RenderNodeData>) {
  return (
    <button
      type="button"
      style={{
        width: cardWidth(data.kind),
        minHeight: data.kind === 'fabric' ? 120 : 104,
        border: `1px solid ${data.selected ? data.accentColor : toneBorder(data.tone)}`,
        borderInlineStart: `6px solid ${data.accentColor}`,
        borderRadius: 10,
        background: data.selected ? 'var(--cds-layer-selected)' : 'var(--cds-layer)',
        color: 'var(--cds-text-primary)',
        padding: '0.9rem',
        boxShadow: data.selected ? `0 0 0 2px ${data.accentColor}33` : '0 8px 22px rgba(17, 146, 232, 0.08)',
        textAlign: 'left',
        cursor: 'pointer',
      }}
      onClick={() => data.onSelect({
        anchorId: data.anchorId,
        recordId: data.recordId,
        selectionKind: data.selectionKind,
        contextNodeId: data.contextNodeId,
      })}
      aria-label={`Jump to ${data.label}`}
    >
      <Handle type="target" position={Position.Left} style={{ background: data.accentColor }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{
          fontSize: 'var(--cds-label-01-font-size)',
          lineHeight: 'var(--cds-label-01-line-height)',
          fontWeight: 600,
          color: 'var(--cds-text-secondary)',
        }}>
          {data.eyebrow}
        </span>
        <span style={{
          fontSize: 'var(--cds-label-01-font-size)',
          lineHeight: 'var(--cds-label-01-line-height)',
          fontWeight: 600,
          color: data.selected ? data.accentColor : 'var(--cds-text-secondary)',
        }}>
          {toneLabel(data.tone)}
        </span>
      </div>
      <div style={{
        fontSize: 'var(--cds-heading-02-font-size)',
        lineHeight: 'var(--cds-heading-02-line-height)',
        fontWeight: 600,
      }}>
        {data.label}
      </div>
      <div style={{
        fontSize: 'var(--cds-body-compact-01-font-size)',
        lineHeight: 'var(--cds-body-compact-01-line-height)',
        color: 'var(--cds-text-secondary)',
        marginTop: '0.375rem',
      }}>
        {data.caption}
      </div>
      <div style={{
        fontSize: 'var(--cds-body-compact-01-font-size)',
        lineHeight: 'var(--cds-body-compact-01-line-height)',
        color: data.accentColor,
        marginTop: '0.75rem',
        fontWeight: 600,
      }}>
        {data.metric}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: data.accentColor }} />
    </button>
  )
}

const nodeTypes = { avbRoutingWorkspaceNode: AvbRoutingWorkspaceNodeCard }

export function AvbRoutingWorkspaceGraph({
  model,
  onSelect,
}: {
  model: AvbRoutingWorkspaceGraphModel
  onSelect: (selection: AvbRoutingWorkspaceGraphSelection) => void
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
      wrapperClassName="avb-routing-workspace__graph"
      maxZoom={1.55}
      emptyState={
        <EmptyState
          className="avb-routing-workspace__graph-empty"
          title="No AVB discovery nodes are currently available for this workspace"
          description="Select another node scope or wait for discovery to populate the AVB graph."
        />
      }
    />
  )
}

export default AvbRoutingWorkspaceGraph
