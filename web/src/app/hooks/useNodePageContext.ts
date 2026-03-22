import { useMemo } from 'react'

import { useViewedNode } from '../stores/viewedNodeStore'
import type { NodeIdentity, NodeSummary, NodeTopology } from '../types/node'
import { useNodeIdentity, useNodeTopology } from './useNodeTopology'

function getLocalTopologyNode(topology: NodeTopology | undefined): NodeSummary | null {
  const nodes = Array.isArray(topology?.nodes) ? topology.nodes : []
  return nodes.find((node) => node.is_local) ?? nodes[0] ?? null
}

export function useNodePageContext(pageKey: string) {
  const nodeIdentityQuery = useNodeIdentity()
  const nodeTopologyQuery = useNodeTopology()

  const localTopologyNode = getLocalTopologyNode(nodeTopologyQuery.data)
  const localNode = (nodeIdentityQuery.data ?? localTopologyNode) as NodeIdentity | NodeSummary | null
  const fallbackLocalId = localNode?.node_id ?? 'local'
  const viewedNodeId = useViewedNode(pageKey, fallbackLocalId)

  const viewedNode = useMemo(() => {
    const nodes = nodeTopologyQuery.data?.nodes ?? []
    return nodes.find((node) => node.node_id === viewedNodeId) ?? localTopologyNode ?? null
  }, [localTopologyNode, nodeTopologyQuery.data?.nodes, viewedNodeId])

  return {
    localNode,
    topology: nodeTopologyQuery.data,
    viewedNode,
    viewedNodeId: viewedNode?.node_id ?? fallbackLocalId,
    nodeIdentityQuery,
    nodeTopologyQuery,
  }
}
