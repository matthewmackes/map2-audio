import './NodeGraph.css'

import dagre from 'dagre'
import { useMemo } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  type Edge,
  type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'

import type { NodeTopology } from '../../types/node'
import { getNodePresence } from '../../utils/nodeDisplay'
import { NodeGraphCard, type NodeGraphCardData } from './NodeGraphCard'

interface NodeGraphProps {
  topology: NodeTopology
  viewedNodeId?: string | null
  onNodeClick: (nodeId: string) => void
}

const NODE_WIDTH = 260
const NODE_HEIGHT = 92
const nodeTypes = { nodeCard: NodeGraphCard }

function layoutGraph(nodes: Node<NodeGraphCardData>[], edges: Edge[]) {
  if (nodes.length <= 1) {
    return nodes.map((node) => ({
      ...node,
      position: { x: 160, y: 140 },
    }))
  }

  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: 'LR', ranksep: 150, nodesep: 70 })

  nodes.forEach((node) => {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  })

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target)
  })

  dagre.layout(graph)

  return nodes.map((node) => {
    const position = graph.node(node.id)
    return {
      ...node,
      position: {
        x: position.x - NODE_WIDTH / 2,
        y: position.y - NODE_HEIGHT / 2,
      },
    }
  })
}

export function NodeGraph({ topology, viewedNodeId, onNodeClick }: NodeGraphProps) {
  const nodes = useMemo<Node<NodeGraphCardData>[]>(() => {
    const draftNodes = topology.nodes.map((node) => ({
      id: node.node_id,
      type: 'nodeCard',
      position: { x: 0, y: 0 },
      data: {
        node,
        presence: getNodePresence(node, viewedNodeId),
        onSelect: onNodeClick,
      },
      draggable: false,
      selectable: false,
    }))

    const draftEdges: Edge[] = [
      ...topology.audio_edges.map((edge) => ({
        id: `audio:${edge.source_node_id}:${edge.dest_node_id}:${edge.stream_type}`,
        source: edge.source_node_id,
        target: edge.dest_node_id,
        type: 'smoothstep',
        animated: edge.active,
        label: edge.stream_type.toUpperCase(),
        markerEnd: { type: MarkerType.ArrowClosed, color: '#0f62fe' },
        style: { stroke: '#0f62fe', strokeWidth: 2 },
        labelStyle: { fill: '#0f62fe', fontWeight: 600 },
      })),
      ...topology.network_edges.map((edge) => ({
        id: `network:${edge.source_node_id}:${edge.dest_node_id}`,
        source: edge.source_node_id,
        target: edge.dest_node_id,
        type: 'smoothstep',
        label: edge.latency_ms == null ? '' : `${edge.latency_ms.toFixed(1)}ms`,
        style: { stroke: '#8d8d8d', strokeDasharray: '6 3', strokeWidth: 1.5 },
        labelStyle: { fill: '#8d8d8d', fontWeight: 500 },
      })),
    ]

    return layoutGraph(draftNodes, draftEdges)
  }, [onNodeClick, topology, viewedNodeId])

  const edges = useMemo<Edge[]>(() => {
    return [
      ...topology.audio_edges.map((edge) => ({
        id: `audio:${edge.source_node_id}:${edge.dest_node_id}:${edge.stream_type}`,
        source: edge.source_node_id,
        target: edge.dest_node_id,
        type: 'smoothstep',
        animated: edge.active,
        label: edge.stream_type.toUpperCase(),
        markerEnd: { type: MarkerType.ArrowClosed, color: '#0f62fe' },
        style: { stroke: '#0f62fe', strokeWidth: 2 },
        labelStyle: { fill: '#0f62fe', fontWeight: 600 },
      })),
      ...topology.network_edges.map((edge) => ({
        id: `network:${edge.source_node_id}:${edge.dest_node_id}`,
        source: edge.source_node_id,
        target: edge.dest_node_id,
        type: 'smoothstep',
        label: edge.latency_ms == null ? '' : `${edge.latency_ms.toFixed(1)}ms`,
        style: { stroke: '#8d8d8d', strokeDasharray: '6 3', strokeWidth: 1.5 },
        labelStyle: { fill: '#8d8d8d', fontWeight: 500 },
      })),
    ]
  }, [topology.audio_edges, topology.network_edges])

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

