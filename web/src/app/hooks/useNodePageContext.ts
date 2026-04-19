import { useMemo } from 'react'

import { useViewedNode } from '../stores/viewedNodeStore'
import type { NodeIdentity, NodeSummary, NodeTopology } from '../types/node'
import { useNodeIdentity, useNodeTopology } from './useNodeTopology'

const EMPTY_NODE_SUMMARIES: NodeSummary[] = []

function getTopologyNodes(topology: NodeTopology | undefined): NodeSummary[] {
  return Array.isArray(topology?.nodes) ? topology.nodes : EMPTY_NODE_SUMMARIES
}

function getLocalTopologyNode(topology: NodeTopology | undefined): NodeSummary | null {
  const nodes = getTopologyNodes(topology)
  return nodes.find((node) => node.is_local) ?? nodes[0] ?? null
}

export function useNodePageContext(pageKey: string) {
  const nodeIdentityQuery = useNodeIdentity()
  const nodeTopologyQuery = useNodeTopology()

  const localTopologyNode = getLocalTopologyNode(nodeTopologyQuery.data)
  const topologyNodes = getTopologyNodes(nodeTopologyQuery.data)
  const localNode = (nodeIdentityQuery.data ?? localTopologyNode) as NodeIdentity | NodeSummary | null
  const fallbackLocalId = localNode?.node_id ?? 'local'
  const viewedNodeId = useViewedNode(pageKey, fallbackLocalId)

  const viewedNode = useMemo(() => {
    return topologyNodes.find((node) => node.node_id === viewedNodeId) ?? localTopologyNode ?? null
  }, [localTopologyNode, topologyNodes, viewedNodeId])

  return {
    localNode,
    topology: nodeTopologyQuery.data,
    topologyNodes,
    viewedNode,
    viewedNodeId: viewedNode?.node_id ?? fallbackLocalId,
    nodeIdentityQuery,
    nodeTopologyQuery,
  }
}
