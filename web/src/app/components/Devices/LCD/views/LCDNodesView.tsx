import React, { useMemo, useState } from 'react'
import { Tag } from '@carbon/react'
import { LCDFeed } from '../../../LCDFeed'
import { LCDDisplayEmulator } from '../../../LCDDisplayEmulator'
import { NodeLCDGrid } from '../../../NodeLCDCard'
import { useLcdFeedHistory } from '../../../../hooks/useLcdFeed'
import { useCluster } from '../../../../contexts/useCluster'
import { NodeHealthBar, NodeOverviewCard, type MockNodeStatus } from '../LCDView'

export function LCDNodesView() {
  const { nodes: clusterNodes, localNodeId, activeNodeId } = useCluster()

  // Map cluster NodeInfo → MockNodeStatus shape expected by NodeLCDGrid + NodeOverviewCard.
  // Event counts / CPU / memory are placeholders until Phase 2 (per-node LCD telemetry API).
  const clusterNodesMapped = useMemo<MockNodeStatus[]>(
    () =>
      clusterNodes.map((n) => ({
        nodeId: n.nodeId,
        status:
          n.isLocal ? ('local' as const)
            : n.isOnline ? ('online' as const)
            : ('offline' as const),
        lastEvent: n.lastSeen ?? undefined,
        eventCount: 0,
      })),
    [clusterNodes],
  )

  // Per Q3 — cluster-wide view respects pill: when pill selects a specific node,
  // constrain to that one. When pill = "all", show every node.
  const scoped = useMemo(() => {
    if (!activeNodeId || activeNodeId === 'all') return clusterNodesMapped
    return clusterNodesMapped.filter((n) => n.nodeId === activeNodeId)
  }, [clusterNodesMapped, activeNodeId])

  const defaultSelection = scoped[0]?.nodeId ?? clusterNodesMapped[0]?.nodeId ?? localNodeId
  const [selectedNode, setSelectedNode] = useState<string>(defaultSelection)
  const selectedNodeData = scoped.find((n) => n.nodeId === selectedNode) ?? null

  const { entries: nodeEvents } = useLcdFeedHistory(
    50,
    undefined,
    undefined,
    selectedNodeData?.status === 'local' ? 'local' : undefined,
  )
  const currentNodeEvent = nodeEvents[0]

  const pillLabel = !activeNodeId || activeNodeId === 'all' ? 'All cluster nodes' : activeNodeId

  return (
    <div className="lcd-page">
      <div className="nodes-tab">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Tag type="cool-gray">Scope: {pillLabel}</Tag>
          <Tag type="gray">{scoped.length} node{scoped.length === 1 ? '' : 's'} in scope</Tag>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#60a5fa', marginBottom: 16 }}>Audio Nodes</h3>
            <NodeLCDGrid nodes={scoped} selectedNode={selectedNode} onNodeSelect={setSelectedNode} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="lcd-section-card">
              <h4 style={{ fontSize: 14, fontWeight: 600, color: '#60a5fa', marginBottom: 16 }}>LCD Preview</h4>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <LCDDisplayEmulator entry={currentNodeEvent} nodeLabel={selectedNode} loading={!selectedNodeData} />
              </div>
            </div>

            {selectedNodeData && (
              <div className="lcd-section-card">
                <h4 style={{ fontSize: 14, fontWeight: 600, color: '#60a5fa', marginBottom: 16 }}>Node Status</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
                  <div>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>Node ID</span>
                    <p style={{ fontFamily: 'var(--font-ui-tight)', fontSize: 12, margin: 'var(--cds-spacing-02) 0 0', color: '#f3f4f6' }}>
                      {selectedNodeData.nodeId}
                    </p>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>Status</span>
                    <p
                      style={{
                        fontWeight: 700,
                        margin: 'var(--cds-spacing-02) 0 0',
                        color:
                          selectedNodeData.status === 'online'
                            ? '#22c55e'
                            : selectedNodeData.status === 'local'
                            ? '#3b82f6'
                            : '#ef4444',
                      }}
                    >
                      {selectedNodeData.status.toUpperCase()}
                    </p>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>Last Event</span>
                    <p style={{ fontFamily: 'var(--font-ui-tight)', fontSize: 12, margin: 'var(--cds-spacing-02) 0 0', color: '#f3f4f6' }}>
                      {selectedNodeData.lastEvent || '—'}
                    </p>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>Event Count</span>
                    <p style={{ fontWeight: 700, margin: 'var(--cds-spacing-02) 0 0', color: '#60a5fa' }}>
                      {selectedNodeData.eventCount}
                    </p>
                  </div>
                </div>
                {selectedNodeData.cpu !== undefined && <NodeHealthBar label="CPU Load" value={selectedNodeData.cpu} />}
                {selectedNodeData.memory !== undefined && <NodeHealthBar label="Memory" value={selectedNodeData.memory} />}
              </div>
            )}

            <div className="lcd-section-card">
              <h4 style={{ fontSize: 14, fontWeight: 600, color: '#60a5fa', marginBottom: 12 }}>Recent Events (10)</h4>
              <LCDFeed entries={nodeEvents.slice(0, 10)} maxHeight="300px" />
            </div>
          </div>
        </div>

        <div className="lcd-section-card" style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#60a5fa', marginBottom: 16 }}>Cluster Overview</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {scoped.map((node) => (
              <NodeOverviewCard key={node.nodeId} node={node} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
