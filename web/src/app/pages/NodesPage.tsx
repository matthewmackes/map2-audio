import './NodesPage.css'

import { InlineLoading, InlineNotification, Layer, Tag } from '@carbon/react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { NodeContextBanner } from '../components/NodeContextBanner/NodeContextBanner'
import { NodeDetailTearsheet } from '../components/NodeGraph/NodeDetailTearsheet'
import { NodeGraph } from '../components/NodeGraph/NodeGraph'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'

export function NodesPage() {
  const [searchParams] = useSearchParams()
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const { localNode, topology, viewedNodeId, nodeTopologyQuery } = useNodePageContext(NODE_PAGE_KEYS.nodes)

  useEffect(() => {
    const requestedNodeId = searchParams.get('selectedNodeId')
    if (!requestedNodeId || !topology?.nodes.some((node) => node.node_id === requestedNodeId)) {
      return
    }
    setSelectedNodeId(requestedNodeId)
  }, [searchParams, topology?.nodes])

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) {
      return null
    }
    return topology?.nodes.find((node) => node.node_id === selectedNodeId) ?? null
  }, [selectedNodeId, topology?.nodes])

  const warnCount = topology?.nodes.filter((node) => node.status === 'warn').length ?? 0
  const criticalCount = topology?.nodes.filter((node) => node.status === 'critical' || node.status === 'offline').length ?? 0

  return (
    <div className="nodes-page">
      {localNode ? (
        <NodeContextBanner pageKey={NODE_PAGE_KEYS.nodes} localNode={localNode} topology={topology} />
      ) : null}
      <Layer className="nodes-page__surface">
        <div className="nodes-page__header">
          <div>
            <h1>Platform Nodes</h1>
            <p>Topology, health, and per-node identity across the MAP2 fabric.</p>
          </div>
          <div className="nodes-page__tags">
            <Tag type="cool-gray">{`${topology?.nodes.length ?? 0} nodes`}</Tag>
            <Tag type={warnCount > 0 ? 'warm-gray' : 'green'}>{`${warnCount} warn`}</Tag>
            <Tag type={criticalCount > 0 ? 'red' : 'green'}>{`${criticalCount} critical`}</Tag>
          </div>
        </div>

        {nodeTopologyQuery.isLoading && !topology ? (
          <div className="nodes-page__state">
            <InlineLoading description="Loading node topology" />
          </div>
        ) : nodeTopologyQuery.isError || !topology ? (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Node discovery unavailable"
            subtitle="Check backend connectivity and cluster discovery status."
          />
        ) : (
          <NodeGraph
            topology={topology}
            viewedNodeId={viewedNodeId}
            onNodeClick={setSelectedNodeId}
          />
        )}
      </Layer>

      <NodeDetailTearsheet
        node={selectedNode}
        open={Boolean(selectedNode)}
        pageKey={NODE_PAGE_KEYS.nodes}
        onClose={() => setSelectedNodeId(null)}
      />
    </div>
  )
}

