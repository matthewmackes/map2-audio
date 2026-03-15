import './NodeNavChip.css'

import { Popover, PopoverContent } from '@carbon/react'
import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { useNodePageContext } from '../../hooks/useNodePageContext'
import { pageKeyFromPathname, getNodePresence } from '../../utils/nodeDisplay'
import { NodeMiniCard } from './NodeMiniCard'
import { NodeNavChip } from './NodeNavChip'

export function NodeNavBar() {
  const location = useLocation()
  const [openNodeId, setOpenNodeId] = useState<string | null>(null)
  const pageKey = pageKeyFromPathname(location.pathname)
  const { topology, localNode, viewedNodeId, nodeTopologyQuery } = useNodePageContext(pageKey ?? 'global')

  const nodes = useMemo(() => {
    return [...(topology?.nodes ?? [])].sort((left, right) => {
      if (left.is_local) return -1
      if (right.is_local) return 1
      return left.hostname.localeCompare(right.hostname)
    })
  }, [topology?.nodes])

  if (nodeTopologyQuery.isLoading && nodes.length === 0) {
    return (
      <div className="node-nav-bar">
        <div className="node-nav-bar__divider" aria-hidden="true" />
        <div className="node-nav-bar__skeleton" />
      </div>
    )
  }

  if (nodeTopologyQuery.isError || !localNode) {
    return (
      <div className="node-nav-bar">
        <div className="node-nav-bar__divider" aria-hidden="true" />
        <span className="node-nav-bar__fallback">Node discovery unavailable</span>
      </div>
    )
  }

  return (
    <div className="node-nav-bar">
      <div className="node-nav-bar__divider" aria-hidden="true" />
      <div className="node-nav-bar__chips" aria-label="Node navigation status">
        {nodes.map((node) => {
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
      </div>
    </div>
  )
}

