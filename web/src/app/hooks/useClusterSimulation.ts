import { useState, useEffect, useCallback } from 'react'

export interface SimulatedClusterNode {
  node_id: string
  hostname: string
  role: string
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED'
  health_score: number
  cpu_percent: number
  memory_used_gb: number
  memory_total_gb: number
  dsp_load_percent: number
  latency_ms: number
  xrun_count: number
  flow_count: number
  assigned_flows?: Array<{ flow_id: string; type: 'primary' | 'standby' }>
}

interface SimulationScenario {
  type: 'normal' | 'high-load' | 'node-failure' | 'degraded' | 'failover'
  targetNode?: string
  duration?: number
}

function generateBaseNodes(): SimulatedClusterNode[] {
  return [
    {
      node_id: 'MGMT-PRIMARY-001',
      hostname: 'mgmt-primary',
      role: 'MANAGEMENT-NODE',
      status: 'ONLINE',
      health_score: 95,
      cpu_percent: 25,
      memory_used_gb: 3.2,
      memory_total_gb: 8,
      dsp_load_percent: 0,
      latency_ms: 0,
      xrun_count: 0,
      flow_count: 0,
    },
    {
      node_id: 'AUDIO-NODE-A1B2',
      hostname: 'audio-01',
      role: 'AUDIO-NODE',
      status: 'ONLINE',
      health_score: 88,
      cpu_percent: 62,
      memory_used_gb: 5.8,
      memory_total_gb: 16,
      dsp_load_percent: 58,
      latency_ms: 8.5,
      xrun_count: 0,
      flow_count: 3,
      assigned_flows: [
        { flow_id: 'Flow-A', type: 'primary' },
        { flow_id: 'Flow-B', type: 'primary' },
        { flow_id: 'Flow-D', type: 'standby' },
      ],
    },
    {
      node_id: 'AUDIO-NODE-C3D4',
      hostname: 'audio-02',
      role: 'AUDIO-NODE',
      status: 'ONLINE',
      health_score: 92,
      cpu_percent: 45,
      memory_used_gb: 6.2,
      memory_total_gb: 16,
      dsp_load_percent: 42,
      latency_ms: 12.3,
      xrun_count: 0,
      flow_count: 2,
      assigned_flows: [
        { flow_id: 'Flow-C', type: 'primary' },
        { flow_id: 'Flow-D', type: 'primary' },
      ],
    },
    {
      node_id: 'AUDIO-NODE-E5F6',
      hostname: 'audio-03',
      role: 'AUDIO-NODE',
      status: 'ONLINE',
      health_score: 85,
      cpu_percent: 78,
      memory_used_gb: 10.5,
      memory_total_gb: 16,
      dsp_load_percent: 72,
      latency_ms: 15.7,
      xrun_count: 2,
      flow_count: 2,
      assigned_flows: [
        { flow_id: 'Flow-A', type: 'standby' },
        { flow_id: 'Flow-B', type: 'standby' },
      ],
    },
    {
      node_id: 'MGMT-STANDBY-002',
      hostname: 'mgmt-standby',
      role: 'STANDBY-MANAGEMENT',
      status: 'ONLINE',
      health_score: 93,
      cpu_percent: 18,
      memory_used_gb: 2.8,
      memory_total_gb: 8,
      dsp_load_percent: 0,
      latency_ms: 5.2,
      xrun_count: 0,
      flow_count: 0,
    },
  ]
}

export function useClusterSimulation(enabled: boolean) {
  const [nodes, setNodes] = useState<SimulatedClusterNode[]>(generateBaseNodes())
  const [scenario, setScenario] = useState<SimulationScenario | null>(null)
  const [scenarioTime, setScenarioTime] = useState(0)

  // Update metrics continuously with some randomness
  useEffect(() => {
    if (!enabled) return

    const interval = setInterval(() => {
      setNodes(prevNodes =>
        prevNodes.map(node => {
          const baseNode = generateBaseNodes().find(n => n.node_id === node.node_id)!

          // Apply scenario effects
          let cpuVariance = (Math.random() - 0.5) * 8 // ±4%
          let memVariance = (Math.random() - 0.5) * 1 // ±0.5GB
          let dspVariance = node.role === 'AUDIO-NODE' ? (Math.random() - 0.5) * 10 : 0
          let health = baseNode.health_score
          let status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' = 'ONLINE'
          let xruns = node.xrun_count

          // Apply scenarios
          if (scenario) {
            if (scenario.type === 'high-load' && (!scenario.targetNode || scenario.targetNode === node.node_id)) {
              cpuVariance = 15 + Math.random() * 20 // CPU spike
              dspVariance = 20 + Math.random() * 15 // DSP spike
              if (node.role === 'AUDIO-NODE' && Math.random() > 0.7) {
                xruns = Math.min(node.xrun_count + 1, 10)
              }
            }

            if (scenario.type === 'node-failure' && scenario.targetNode === node.node_id) {
              status = 'OFFLINE'
              health = 0
              cpuVariance = 0
              memVariance = 0
              dspVariance = 0
            }

            if (scenario.type === 'degraded' && scenario.targetNode === node.node_id) {
              status = 'DEGRADED'
              health = Math.max(30, baseNode.health_score - 50)
              cpuVariance = 25 + Math.random() * 15
              if (node.role === 'AUDIO-NODE' && Math.random() > 0.5) {
                xruns = Math.min(node.xrun_count + 2, 20)
              }
            }

            if (scenario.type === 'failover' && scenario.targetNode === node.node_id && node.role === 'AUDIO-NODE') {
              // Simulate failover - flows switch to standby
              cpuVariance = 5 + Math.random() * 10
              status = 'DEGRADED'
              health = Math.max(50, baseNode.health_score - 20)
            }
          } else {
            // Reset xruns gradually when scenario ends
            if (xruns > baseNode.xrun_count) {
              xruns = Math.max(baseNode.xrun_count, xruns - 1)
            }
          }

          return {
            ...node,
            cpu_percent: Math.max(5, Math.min(100, baseNode.cpu_percent + cpuVariance)),
            memory_used_gb: Math.max(1, Math.min(baseNode.memory_total_gb, baseNode.memory_used_gb + memVariance)),
            dsp_load_percent: Math.max(0, Math.min(100, baseNode.dsp_load_percent + dspVariance)),
            health_score: Math.max(0, Math.min(100, health)),
            status,
            xrun_count: xruns,
          }
        })
      )

      setScenarioTime(t => t + 1)
    }, 1500) // Update every 1.5 seconds

    return () => clearInterval(interval)
  }, [enabled, scenario])

  // Auto-stop scenarios after duration
  useEffect(() => {
    if (!scenario || !scenario.duration) return
    if (scenarioTime >= scenario.duration) {
      setScenario(null)
      setScenarioTime(0)
    }
  }, [scenarioTime, scenario])

  const triggerScenario = useCallback((newScenario: SimulationScenario) => {
    setScenario(newScenario)
    setScenarioTime(0)
  }, [])

  const simulateNodeFailure = useCallback((nodeId: string) => {
    triggerScenario({
      type: 'node-failure',
      targetNode: nodeId,
      duration: 30, // 45 seconds
    })
  }, [triggerScenario])

  const simulateHighLoad = useCallback(() => {
    triggerScenario({
      type: 'high-load',
      duration: 20, // 30 seconds
    })
  }, [triggerScenario])

  const simulateDegradedNode = useCallback((nodeId: string) => {
    triggerScenario({
      type: 'degraded',
      targetNode: nodeId,
      duration: 25, // 37.5 seconds
    })
  }, [triggerScenario])

  const simulateFailover = useCallback((nodeId: string) => {
    triggerScenario({
      type: 'failover',
      targetNode: nodeId,
      duration: 20, // 30 seconds
    })
  }, [triggerScenario])

  const clearScenario = useCallback(() => {
    setScenario(null)
    setScenarioTime(0)
    setNodes(generateBaseNodes())
  }, [])

  return {
    nodes,
    scenario,
    scenarioTime,
    simulateNodeFailure,
    simulateHighLoad,
    simulateDegradedNode,
    simulateFailover,
    clearScenario,
  }
}
