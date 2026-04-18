import { analyzeReactFlowDensity, REACT_FLOW_DENSITY_THRESHOLDS } from './reactFlowDensity'

describe('analyzeReactFlowDensity', () => {
  it('keeps light graphs in the low tier with full chrome', () => {
    expect(analyzeReactFlowDensity(8, 12)).toEqual({
      nodeCount: 8,
      edgeCount: 12,
      tier: 'low',
      showBackground: true,
      showControls: true,
      fitViewDurationMs: 180,
    })
  })

  it('promotes medium graphs once either node or edge thresholds are crossed', () => {
    const byNodes = analyzeReactFlowDensity(REACT_FLOW_DENSITY_THRESHOLDS.medium.nodes, 0)
    const byEdges = analyzeReactFlowDensity(0, REACT_FLOW_DENSITY_THRESHOLDS.medium.edges)

    expect(byNodes.tier).toBe('medium')
    expect(byEdges.tier).toBe('medium')
    expect(byNodes.fitViewDurationMs).toBe(120)
    expect(byEdges.showBackground).toBe(true)
  })

  it('drops decorative background and fit animation for high-density graphs', () => {
    expect(analyzeReactFlowDensity(REACT_FLOW_DENSITY_THRESHOLDS.high.nodes, 0)).toEqual({
      nodeCount: REACT_FLOW_DENSITY_THRESHOLDS.high.nodes,
      edgeCount: 0,
      tier: 'high',
      showBackground: false,
      showControls: true,
      fitViewDurationMs: 0,
    })
  })

  it('hides controls as well for critical-density graphs', () => {
    expect(analyzeReactFlowDensity(0, REACT_FLOW_DENSITY_THRESHOLDS.critical.edges)).toEqual({
      nodeCount: 0,
      edgeCount: REACT_FLOW_DENSITY_THRESHOLDS.critical.edges,
      tier: 'critical',
      showBackground: false,
      showControls: false,
      fitViewDurationMs: 0,
    })
  })
})
