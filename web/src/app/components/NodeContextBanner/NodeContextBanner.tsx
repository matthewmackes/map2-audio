import './NodeContextBanner.css'

import { InlineLoading, Layer, Tag } from '@carbon/react'

import type { NodeIdentity, NodeTopology } from '../../types/node'
import { useNodeTopology } from '../../hooks/useNodeTopology'
import { useViewedNode } from '../../stores/viewedNodeStore'
import { formatNodeDisplayName } from '../../utils/nodeDisplay'

interface NodeContextBannerProps {
  pageKey: string
  localNode: NodeIdentity
  topology?: NodeTopology
}

export function NodeContextBanner({ pageKey, localNode, topology: providedTopology }: NodeContextBannerProps) {
  const topologyQuery = useNodeTopology()
  const topology = providedTopology ?? topologyQuery.data
  const viewedNodeId = useViewedNode(pageKey, localNode.node_id)
  const viewedNode = topology?.nodes.find((node) => node.node_id === viewedNodeId) ?? topology?.nodes.find((node) => node.is_local) ?? null
  const isViewingRemote = Boolean(viewedNode && viewedNode.node_id !== localNode.node_id)

  return (
    <Layer className="node-context-banner">
      {topologyQuery.isLoading && !topology ? (
        <InlineLoading description="Loading node context" />
      ) : (
        <>
          <div className="node-context-banner__section">
            <span className="node-context-banner__label">LOCAL:</span>
            <Tag type="blue">{formatNodeDisplayName(localNode)}</Tag>
          </div>
          <span className="node-context-banner__separator" aria-hidden="true">|</span>
          <div className="node-context-banner__section">
            {isViewingRemote && viewedNode ? (
              <>
                <span className="node-context-banner__label">VIEWING:</span>
                <Tag type="green">{formatNodeDisplayName(viewedNode)}</Tag>
                <span className="node-context-banner__live">
                  <span className="node-context-banner__pulse" aria-hidden="true" />
                  LIVE
                </span>
              </>
            ) : (
              <span className="node-context-banner__self">(This machine)</span>
            )}
          </div>
        </>
      )}
    </Layer>
  )
}

export type { NodeContextBannerProps }

