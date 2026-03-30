import './NodeGraph.css'

import { useMemo } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'

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
    <div className="node-graph">
      <ReactFlow
        fitView
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesConnectable={false}
        elementsSelectable={false}
        minZoom={0.5}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#c6c6c6" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
