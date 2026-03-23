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
  const nodes = Array.isArray(topology?.nodes) ? topology.nodes : []
  const viewedNodeId = useViewedNode(pageKey, localNode.node_id)
  const viewedNode = nodes.find((node) => node.node_id === viewedNodeId) ?? nodes.find((node) => node.is_local) ?? null
  const isViewingRemote = Boolean(viewedNode && viewedNode.node_id !== localNode.node_id)
  const localLabel = formatNodeDisplayName(localNode)
  const viewedLabel = viewedNode ? formatNodeDisplayName(viewedNode) : localLabel

  return (
    <Layer className="node-context-banner">
      {topologyQuery.isLoading && !topology ? (
        <InlineLoading description="Loading node context" />
      ) : (
        <>
          <div className="node-context-banner__headline">
            <span className="node-context-banner__eyebrow">MAP2 MIDI Hub</span>
            <strong>Studio node scope</strong>
          </div>

          <div className="node-context-banner__rail">
            <div className="node-context-banner__section">
              <span className="node-context-banner__label">Host</span>
              <div className="node-context-banner__value">
                <Tag type="blue">{localLabel}</Tag>
                <span className="node-context-banner__meta">Local engine</span>
              </div>
            </div>

            <div className="node-context-banner__section">
              <span className="node-context-banner__label">Scope</span>
              <div className="node-context-banner__value">
                <Tag type={isViewingRemote ? 'green' : 'cool-gray'}>{viewedLabel}</Tag>
                {isViewingRemote ? (
                  <span className="node-context-banner__live">
                    <span className="node-context-banner__pulse" aria-hidden="true" />
                    Remote live view
                  </span>
                ) : (
                  <span className="node-context-banner__meta">Local studio view</span>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </Layer>
  )
}

export type { NodeContextBannerProps }
