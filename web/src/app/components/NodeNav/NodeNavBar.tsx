import './NodeNavChip.css'

import { Popover, PopoverContent } from '@carbon/react'
import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { useNodeAlertMonitoring } from '../../hooks/useNodeAlertMonitoring'
import { useNodePageContext } from '../../hooks/useNodePageContext'
import { pageKeyFromPathname, getNodePresence } from '../../utils/nodeDisplay'
import { NodeAlertToast } from '../NodeAlerts/NodeAlertToast'
import { NodeMiniCard } from './NodeMiniCard'
import { NodeNavChip } from './NodeNavChip'

const MAX_VISIBLE_NODE_CHIPS = 5

export function NodeNavBar() {
  const location = useLocation()
  const [openNodeId, setOpenNodeId] = useState<string | null>(null)
  const pageKey = pageKeyFromPathname(location.pathname)
  const { topologyNodes, localNode, viewedNodeId, nodeTopologyQuery } = useNodePageContext(pageKey ?? 'global')

  useNodeAlertMonitoring()

  const nodes = useMemo(() => {
    return [...topologyNodes].sort((left, right) => {
      if (left.is_local) return -1
      if (right.is_local) return 1
      return left.hostname.localeCompare(right.hostname)
    })
  }, [topologyNodes])
  const visibleNodes = nodes.slice(0, MAX_VISIBLE_NODE_CHIPS)
  const overflowNodes = nodes.slice(MAX_VISIBLE_NODE_CHIPS)
  const overflowTitle = overflowNodes.map((node) => node.hostname).join(', ')
  const overflowTone = overflowNodes.some((node) => node.status === 'critical' || node.status === 'offline')
    ? 'critical'
    : overflowNodes.some((node) => node.status === 'warn')
      ? 'warn'
      : 'stable'

  if (nodeTopologyQuery.isLoading && nodes.length === 0) {
    return (
      <div className="node-nav-bar">
        <div className="node-nav-bar__skeleton" />
      </div>
    )
  }

  if (nodeTopologyQuery.isError || !localNode) {
    return (
      <div className="node-nav-bar">
        <span className="node-nav-bar__fallback">Node discovery unavailable</span>
      </div>
    )
  }

  return (
    <div className="node-nav-bar">
      <div className="node-nav-bar__chips" aria-label="Node navigation status">
        {visibleNodes.map((node) => {
          const presence = getNodePresence(node, viewedNodeId)

          return (
            <Popover
              key={node.node_id}
              align="bottom-end"
              caret
              open={openNodeId === node.node_id}
              onRequestClose={() => setOpenNodeId(null)}
            >
              <NodeNavChip
                node={node}
                presence={presence}
                onClick={() => {
                  setOpenNodeId((currentNodeId) => currentNodeId === node.node_id ? null : node.node_id)
                }}
              />
              <PopoverContent>
                <NodeMiniCard
                  node={{
                    ...node,
                    is_viewed: presence === 'VIEW',
                  }}
                  pageKey={pageKey ?? 'global'}
                  onClose={() => setOpenNodeId(null)}
                />
              </PopoverContent>
            </Popover>
          )
        })}
        {overflowNodes.length > 0 ? (
          <span
            className={`node-nav-bar__overflow node-nav-bar__overflow--${overflowTone}`}
            aria-label={`${overflowNodes.length} more nodes: ${overflowTitle}`}
            title={overflowTitle}
          >
            +{overflowNodes.length}
          </span>
        ) : null}
      </div>
      <NodeAlertToast />
    </div>
  )
}
