export type ReactFlowDensityTier = 'low' | 'medium' | 'high' | 'critical'

export interface ReactFlowDensityProfile {
  nodeCount: number
  edgeCount: number
  tier: ReactFlowDensityTier
  showBackground: boolean
  showControls: boolean
  fitViewDurationMs: number
}

export const REACT_FLOW_DENSITY_THRESHOLDS = {
  medium: { nodes: 40, edges: 80 },
  high: { nodes: 100, edges: 200 },
  critical: { nodes: 180, edges: 360 },
} as const

export function analyzeReactFlowDensity(nodeCount: number, edgeCount: number): ReactFlowDensityProfile {
  const safeNodeCount = Number.isFinite(nodeCount) ? Math.max(0, Math.trunc(nodeCount)) : 0
  const safeEdgeCount = Number.isFinite(edgeCount) ? Math.max(0, Math.trunc(edgeCount)) : 0

  let tier: ReactFlowDensityTier = 'low'
  if (
    safeNodeCount >= REACT_FLOW_DENSITY_THRESHOLDS.critical.nodes
    || safeEdgeCount >= REACT_FLOW_DENSITY_THRESHOLDS.critical.edges
  ) {
    tier = 'critical'
  } else if (
    safeNodeCount >= REACT_FLOW_DENSITY_THRESHOLDS.high.nodes
    || safeEdgeCount >= REACT_FLOW_DENSITY_THRESHOLDS.high.edges
  ) {
    tier = 'high'
  } else if (
    safeNodeCount >= REACT_FLOW_DENSITY_THRESHOLDS.medium.nodes
    || safeEdgeCount >= REACT_FLOW_DENSITY_THRESHOLDS.medium.edges
  ) {
    tier = 'medium'
  }

  return {
    nodeCount: safeNodeCount,
    edgeCount: safeEdgeCount,
    tier,
    showBackground: tier === 'low' || tier === 'medium',
    showControls: tier !== 'critical',
    fitViewDurationMs: tier === 'low' ? 180 : tier === 'medium' ? 120 : 0,
  }
}
