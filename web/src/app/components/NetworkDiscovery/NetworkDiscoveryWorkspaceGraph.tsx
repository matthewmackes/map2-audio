import { useMemo } from 'react'

import { Handle, Position } from 'reactflow'
import type { Node, NodeProps } from 'reactflow'

import { SignalFlowGraph } from '../shared/SignalFlowGraph'
import type {
  NetworkDiscoveryWorkspaceGraphModel,
  NetworkDiscoveryWorkspaceGraphSelection,
  NetworkDiscoveryWorkspaceNodeData,
} from './networkDiscoveryWorkspaceGraph'

type RenderNodeData = NetworkDiscoveryWorkspaceNodeData & {
  onSelect: (selection: NetworkDiscoveryWorkspaceGraphSelection) => void
}

function toneBorder(tone: NetworkDiscoveryWorkspaceNodeData['tone']) {
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

function toneLabel(tone: NetworkDiscoveryWorkspaceNodeData['tone']) {
  switch (tone) {
    case 'aligned':
      return 'Ready'
    case 'warning':
      return 'Watch'
    case 'critical':
      return 'Risk'
    case 'neutral':
    default:
      return 'Info'
  }
}

function cardWidth(kind: NetworkDiscoveryWorkspaceNodeData['kind']) {
  switch (kind) {
    case 'source':
      return 284
    case 'fabric':
      return 268
    case 'peer':
    default:
      return 228
  }
}

export function NetworkDiscoveryWorkspaceNodeCard({ data }: NodeProps<RenderNodeData>) {
  return (
    <button
      type="button"
      style={{
        width: cardWidth(data.kind),
        minHeight: data.kind === 'source' ? 128 : data.kind === 'fabric' ? 116 : 108,
        border: `1px solid ${data.selected ? data.accentColor : toneBorder(data.tone)}`,
        borderInlineStart: `6px solid ${data.accentColor}`,
        borderRadius: 10,
        background: data.selected ? 'var(--cds-layer-selected)' : 'var(--cds-layer)',
        color: 'var(--cds-text-primary)',
        padding: '0.9rem',
        boxShadow: data.selected ? `0 0 0 2px ${data.accentColor}33` : '0 10px 24px rgba(15, 98, 254, 0.08)',
        textAlign: 'left',
        cursor: 'pointer',
      }}
      onClick={() => data.onSelect({
        anchorId: data.anchorId,
        recordId: data.recordId,
        contextNodeId: data.contextNodeId,
      })}
      aria-label={`Jump to ${data.label}`}
    >
      <Handle type="target" position={Position.Left} style={{ background: data.accentColor }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--cds-text-secondary)', letterSpacing: '0.02em' }}>
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

const nodeTypes = { networkDiscoveryWorkspaceNode: NetworkDiscoveryWorkspaceNodeCard }

export function NetworkDiscoveryWorkspaceGraph({
  model,
  onSelect,
}: {
  model: NetworkDiscoveryWorkspaceGraphModel
  onSelect: (selection: NetworkDiscoveryWorkspaceGraphSelection) => void
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
      wrapperClassName="network-discovery-workspace__graph"
      emptyState={
        <div className="network-discovery-workspace__graph-empty">
          No discovery telemetry is currently available for this workspace.
        </div>
      }
    />
  )
}

export default NetworkDiscoveryWorkspaceGraph
