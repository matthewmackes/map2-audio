import './NodeGraph.css'

import { useMemo } from 'react'
import type { Edge, Node } from 'reactflow'

import { SignalFlowGraph } from '../shared/SignalFlowGraph'
import type { NodeTopology } from '../../types/node'
import { NodeGraphCard, type NodeGraphCardData } from './NodeGraphCard'
import { buildNodeGraphEdges, buildNodeGraphNodes, layoutNodeGraph } from './nodeGraphLayout'

interface NodeGraphProps {
  topology: NodeTopology | undefined
  viewedNodeId?: string | null
  onNodeClick: (nodeId: string) => void
}

const nodeTypes = { nodeCard: NodeGraphCard }

export function NodeGraph({ topology, viewedNodeId, onNodeClick }: NodeGraphProps) {
  const nodes = useMemo<Node<NodeGraphCardData>[]>(() => {
    const draftNodes = buildNodeGraphNodes(topology, viewedNodeId, onNodeClick)
    const draftEdges = buildNodeGraphEdges(topology)
    return layoutNodeGraph(draftNodes, draftEdges)
  }, [topology, onNodeClick, viewedNodeId])

  const edges = useMemo<Edge[]>(() => {
    return buildNodeGraphEdges(topology)
  }, [topology])

  return (
    <SignalFlowGraph<NodeGraphCardData>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      wrapperClassName="node-graph"
      minZoom={0.5}
      backgroundDotGap={18}
      // T2474 B5 carryover: Was hardcoded #c6c6c6 (Carbon gray-30). ReactFlow's
      // <Background> takes a literal color prop only — no CSS-var
      // forwarding. Using getComputedStyle would defeat tree-shaking
      // and add a layout dep, so we keep the hex but pin it as the
      // documented Carbon gray-30 value matching the dark-shell border
      // ramp. Light shells barely show the dots anyway.
      backgroundDotColor="#c6c6c6"
    />
  )
}
