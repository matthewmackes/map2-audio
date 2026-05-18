// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// NodeDetailPage — route at /node/:nodeId. Replaces the popover that used
// to hang off the global-nav NodeIdentityCard. Renders the full V4-A3
// card body for the node plus the cluster node switcher ("Switch all
// pages to") that previously lived inside the popover.
//
// Routed from App.tsx:
//   /node            -> picks the locally viewed node
//   /node/:nodeId    -> resolves to that specific node

import React, { useMemo } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

import { NodeIdentityCard } from '../components/NodeNav/NodeIdentityCard'
import { NodeMiniCard } from '../components/NodeNav/NodeMiniCard'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { useViewedNodeStore } from '../stores/viewedNodeStore'
import { formatNodeDisplayName, getNodeStatusLabel, NODE_PAGE_KEYS, pageKeyFromPathname } from '../utils/nodeDisplay'
import { applyViewedNodeScopeToAllPages, writeViewedHostToSearch } from '../utils/viewedNodeScope'
import './NodeDetailPage.css'

export function NodeDetailPage(): React.JSX.Element {
  const { nodeId: nodeIdParam } = useParams<{ nodeId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const setViewedNode = useViewedNodeStore((state) => state.setViewedNode)

  const pageKey = pageKeyFromPathname(location.pathname) ?? NODE_PAGE_KEYS.home
  const { topologyNodes, viewedNodeId, nodeTopologyQuery } = useNodePageContext(pageKey)

  // Resolve the node from the URL param, falling back to the currently
  // viewed node (when the route was hit as bare /node).
  const targetNode = useMemo(() => {
    const explicitId = nodeIdParam ? decodeURIComponent(nodeIdParam) : null
    if (explicitId) {
      return topologyNodes.find((n) => n.node_id === explicitId) ?? null
    }
    return (
      topologyNodes.find((n) => n.node_id === viewedNodeId)
      ?? topologyNodes.find((n) => n.is_local)
      ?? null
    )
  }, [nodeIdParam, topologyNodes, viewedNodeId])

  const sortedNodes = useMemo(
    () =>
      [...topologyNodes].sort((left, right) => {
        if (left.is_local) return -1
        if (right.is_local) return 1
        return left.hostname.localeCompare(right.hostname)
      }),
    [topologyNodes],
  )

  const isLoading = nodeTopologyQuery.isLoading
  const showNotFound = !targetNode && !isLoading && nodeIdParam !== undefined

  return (
    <div className="node-detail-page" data-testid="node-detail-page">
      <header className="node-detail-page__header">
        <h1 className="node-detail-page__title">Node detail</h1>
        <p className="node-detail-page__subtitle">
          Live health, latency pressure, and CPU/MEM/LAT for the selected node.
        </p>
      </header>

      <div className="node-detail-page__body">
        {showNotFound ? (
          <div className="node-detail-page__not-found">
            <p>
              No node with id <code>{nodeIdParam}</code> was found in the current cluster topology.
            </p>
            <Link to="/node">View the locally selected node</Link>
          </div>
        ) : (
          <NodeIdentityCard
            node={targetNode}
            loadingLabel={isLoading ? 'LOADING' : 'UNAVAILABLE'}
          />
        )}

        {targetNode ? (
          <div className="node-detail-page__mini">
            <NodeMiniCard node={targetNode} pageKey={pageKey} />
          </div>
        ) : null}

        <section className="node-detail-page__switcher" aria-label="Switch all pages to a different node">
          <h2 className="node-detail-page__switcher-title">Switch all pages to</h2>
          <ul className="node-detail-page__switcher-list">
            {sortedNodes.map((node) => {
              const isActive = node.node_id === (targetNode?.node_id ?? viewedNodeId)
              return (
                <li key={node.node_id}>
                  <button
                    type="button"
                    className={`node-detail-page__switcher-button${isActive ? ' is-active' : ''}`}
                    onClick={() => {
                      applyViewedNodeScopeToAllPages(setViewedNode, node.node_id)
                      const nextSearch = writeViewedHostToSearch(location.search, node.node_id)
                      const nextPath = `/node/${encodeURIComponent(node.node_id)}`
                      if (nextSearch !== location.search || nextPath !== location.pathname) {
                        navigate({ pathname: nextPath, search: nextSearch }, { replace: true })
                      }
                    }}
                  >
                    <span>{formatNodeDisplayName(node)}</span>
                    <span className="node-detail-page__switcher-status">
                      {getNodeStatusLabel(node.status)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}

export default NodeDetailPage
