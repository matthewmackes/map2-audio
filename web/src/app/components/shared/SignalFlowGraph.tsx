import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'

import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow'
import type { Edge, Node, NodeTypes } from 'reactflow'
import 'reactflow/dist/style.css'

import './ReactFlowTheme.css'

import { analyzeReactFlowDensity } from './reactFlowDensity'
import type { ReactFlowDensityProfile } from './reactFlowDensity'

/**
 * T2477 — Single signal-flow graph primitive.
 *
 * Backed by ReactFlow + dagre + Carbon-token chrome. Replaces the seven
 * per-workspace graph wrappers (NodeGraph, ManagementWorkspace,
 * ClusterDashboard, NetworkDiscovery, AudioEngineWorkspace,
 * JuceSourceTruth, AvbRoutingWorkspace) with one primitive that accepts a
 * caller-provided node body component via the standard ReactFlow
 * `nodeTypes` map (the per-workspace render-prop slot).
 *
 * Per-workspace specialization remains in caller-owned `<*NodeBody>`
 * components in their workspace folders (matching the NodeGraphCard shape
 * established in T2474 B5). The primitive owns: density-aware
 * background/controls toggling, fitView lifecycle, ReactFlowProvider
 * wrapping, and the wrapper `<div>` carrying the workspace class name +
 * density data-attributes.
 */

export type SignalFlowGraphNode<TData = unknown> = Node<TData>
export type SignalFlowGraphEdge = Edge

export interface SignalFlowGraphProps<TData> {
  /** Pre-laid-out nodes. Caller is responsible for invoking `layoutSignalFlowGraph` (or its own layout). */
  nodes: Array<SignalFlowGraphNode<TData>>
  /** Edges to render. Style/marker shape is caller-controlled. */
  edges: SignalFlowGraphEdge[]
  /**
   * The standard ReactFlow nodeTypes map. Caller wires per-workspace
   * `<*NodeBody>` components here. The primitive does not assume any
   * specific node types.
   */
  nodeTypes: NodeTypes
  /** Wrapper class name applied to the outer `<div>` (e.g. workspace-scoped). */
  wrapperClassName?: string
  /** Empty-state replacement rendered when `nodes.length === 0`. */
  emptyState?: ReactNode
  /** Optional toolbar overlay rendered above the canvas. */
  toolbar?: ReactNode
  /** ReactFlow zoom range. Defaults: 0.45 / 1.5 (the consensus across the migrated workspaces). */
  minZoom?: number
  maxZoom?: number
  /**
   * Background dot gap in px. Default 20 (the dominant value).
   * NodeGraph + JuceSourceTruth historically used 18.
   */
  backgroundDotGap?: number
  /**
   * Background dot color. Default `var(--cds-border-subtle-01)` (the
   * dominant value). NodeGraph historically used the literal Carbon gray-30
   * `#c6c6c6` because the older comment noted ReactFlow's <Background>
   * doesn't forward CSS variables — but in practice it works fine.
   */
  backgroundDotColor?: string
  /** fitView padding. Default 0.16 (the consensus). */
  fitViewPadding?: number
  /** Override the density profile entirely. If omitted the primitive analyses node/edge counts. */
  densityOverride?: ReactFlowDensityProfile
}

interface CanvasProps<TData> {
  nodes: Array<SignalFlowGraphNode<TData>>
  edges: SignalFlowGraphEdge[]
  nodeTypes: NodeTypes
  density: ReactFlowDensityProfile
  minZoom: number
  maxZoom: number
  backgroundDotGap: number
  backgroundDotColor: string
  fitViewPadding: number
}

function SignalFlowGraphCanvas<TData>({
  nodes,
  edges,
  nodeTypes,
  density,
  minZoom,
  maxZoom,
  backgroundDotGap,
  backgroundDotColor,
  fitViewPadding,
}: CanvasProps<TData>) {
  const { fitView } = useReactFlow()

  useEffect(() => {
    fitView({
      padding: fitViewPadding,
      ...(density.fitViewDurationMs > 0 ? { duration: density.fitViewDurationMs } : {}),
    })
  }, [edges, fitView, fitViewPadding, density.fitViewDurationMs, nodes])

  return (
    <ReactFlow
      className={`react-flow-density--${density.tier}`}
      fitView
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      minZoom={minZoom}
      maxZoom={maxZoom}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
    >
      {density.showBackground ? (
        <Background variant={BackgroundVariant.Dots} gap={backgroundDotGap} size={1} color={backgroundDotColor} />
      ) : null}
      {density.showControls ? <Controls showInteractive={false} /> : null}
    </ReactFlow>
  )
}

export function SignalFlowGraph<TData>({
  nodes,
  edges,
  nodeTypes,
  wrapperClassName,
  emptyState,
  toolbar,
  minZoom = 0.45,
  maxZoom = 1.5,
  backgroundDotGap = 20,
  backgroundDotColor = 'var(--cds-border-subtle-01)',
  fitViewPadding = 0.16,
  densityOverride,
}: SignalFlowGraphProps<TData>) {
  const density = useMemo(
    () => densityOverride ?? analyzeReactFlowDensity(nodes.length, edges.length),
    [densityOverride, nodes.length, edges.length],
  )

  if (nodes.length === 0) {
    return <>{emptyState ?? null}</>
  }

  const wrapperClasses = [
    wrapperClassName,
    `react-flow-density--${density.tier}`,
  ].filter(Boolean).join(' ')

  return (
    <div
      className={wrapperClasses}
      data-density-tier={density.tier}
      data-node-count={density.nodeCount}
      data-edge-count={density.edgeCount}
    >
      {toolbar}
      <ReactFlowProvider>
        <SignalFlowGraphCanvas<TData>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          density={density}
          minZoom={minZoom}
          maxZoom={maxZoom}
          backgroundDotGap={backgroundDotGap}
          backgroundDotColor={backgroundDotColor}
          fitViewPadding={fitViewPadding}
        />
      </ReactFlowProvider>
    </div>
  )
}

export default SignalFlowGraph
