import './NodeGraph.css'
import '../shared/ReactFlowTheme.css'

import { useMemo } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { analyzeReactFlowDensity } from '../shared/reactFlowDensity'
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

  const density = useMemo(() => analyzeReactFlowDensity(nodes.length, edges.length), [edges.length, nodes.length])

  return (
    <div
      className={`node-graph react-flow-density--${density.tier}`}
      data-density-tier={density.tier}
      data-node-count={density.nodeCount}
      data-edge-count={density.edgeCount}
    >
      <ReactFlow
        className={`react-flow-density--${density.tier}`}
        fitView
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesConnectable={false}
        elementsSelectable={false}
        minZoom={0.5}
      >
        {density.showBackground ? (
          // T2474 B5: Was hardcoded #c6c6c6 (Carbon gray-30). ReactFlow's
          // <Background> takes a literal color prop only — no CSS-var
          // forwarding. Using getComputedStyle would defeat tree-shaking
          // and add a layout dep, so we keep the hex but pin it as the
          // documented Carbon gray-30 value matching the dark-shell border
          // ramp. Light shells barely show the dots anyway.
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#c6c6c6" />
        ) : null}
        {density.showControls ? <Controls showInteractive={false} /> : null}
      </ReactFlow>
    </div>
  )
}
