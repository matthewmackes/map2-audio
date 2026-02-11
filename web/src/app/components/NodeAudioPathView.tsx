import { useState, useEffect } from 'react'
import { Warning, CheckCircle, WarningCircle, Lightning, Broadcast, MusicNote, Cpu, SpeakerHigh, Link, Clock, Monitor } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'

interface Service {
  type: string
  name: string
  health: 'healthy' | 'warning' | 'error' | 'offline'
  message: string
  last_check: string
  [key: string]: any
}

interface LatencyBreakdown {
  pipewire_graph_ms: number
  pipewire_driver_ms: number
  juce_buffer_ms: number
  alsa_hardware_ms: number
  total_ms: number
}

interface AudioPath {
  node_id: string
  hostname: string
  timestamp: string
  services: Service[]
  overall_health: string
  pipewire: any
  juce_engine: any
  alsa: any
  latency: LatencyBreakdown
  active_flows: number
  total_dsp_load: number
  dependencies: Record<string, string[]>
  alerts: string[]
}

interface NodeAudioPathViewProps {
  nodeId?: string
  showCluster?: boolean
}

const getServiceIcon = (type: string) => {
  switch (type) {
    case 'pipewire':
      return <Broadcast size={16} weight="duotone" />
    case 'juce_engine':
      return <MusicNote size={16} weight="duotone" />
    case 'alsa':
      return <SpeakerHigh size={16} weight="duotone" />
    case 'latency_compensator':
      return <Clock size={16} weight="duotone" />
    default:
      return <Lightning size={16} weight="duotone" />
  }
}

const getHealthColor = (health: string) => {
  switch (health) {
    case 'healthy':
      return { bg: '#22c55e20', border: '#22c55e', text: '#22c55e', icon: CheckCircle }
    case 'warning':
      return { bg: '#ffa72620', border: '#ffa726', text: '#ffa726', icon: WarningCircle }
    case 'error':
      return { bg: '#ef444420', border: '#ef4444', text: '#ef4444', icon: Warning }
    case 'offline':
      return { bg: '#66666620', border: '#888', text: '#888', icon: WarningCircle }
    default:
      return { bg: '#44444420', border: '#555', text: '#555', icon: WarningCircle }
  }
}

export function NodeAudioPathView({ nodeId, showCluster = false }: NodeAudioPathViewProps) {
  const [selectedNode, setSelectedNode] = useState(nodeId)
  
  // Fetch audio path for local or specific node
  const { data: audioPathResp, isLoading } = useQuery({
    queryKey: ['audio-path', selectedNode],
    queryFn: async () => {
      const url = selectedNode && selectedNode !== 'local'
        ? `/api/audio-path/nodes/${selectedNode}`
        : '/api/audio-path/local'
      
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to fetch audio path`)
      return res.json()
    },
    refetchInterval: 3000,
  })
  
  // Fetch cluster audio paths (management node only)
  const { data: clusterResp } = useQuery({
    queryKey: ['audio-path-cluster'],
    queryFn: async () => {
      const res = await fetch('/api/audio-path/nodes')
      if (!res.ok) throw new Error('Failed to fetch cluster audio paths')
      return res.json()
    },
    refetchInterval: 5000,
    enabled: showCluster,
  })
  
  const audioPath = audioPathResp?.data as AudioPath | undefined
  const clusterNodes = clusterResp?.nodes as any[] | undefined
  
  if (isLoading) {
    return <div style={{ padding: 20, color: '#888' }}>Loading audio path...</div>
  }
  
  if (!audioPath) {
    return <div style={{ padding: 20, color: '#f59e0b' }}>Failed to load audio path</div>
  }
  
  const healthColor = getHealthColor(audioPath.overall_health)
  const HealthIcon = healthColor.icon
  
  return (
    <div className="stack">
      {/* Node selector for cluster view */}
      {showCluster && clusterNodes && (
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ marginBottom: 12 }}>Select Node</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {clusterNodes.map(node => (
              <button
                key={node.node_id}
                onClick={() => setSelectedNode(node.node_id)}
                style={{
                  padding: '8px 16px',
                  background: selectedNode === node.node_id ? '#3b82f6' : '#444',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: selectedNode === node.node_id ? 600 : 400,
                }}
              >
                {node.hostname}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Overall Health */}
      <div className="card" style={{ padding: 16, background: healthColor.bg, border: `2px solid ${healthColor.border}` }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <HealthIcon size={24} style={{ color: healthColor.text }} />
          <div>
            <h3 style={{ margin: 0, color: healthColor.text }}>
              {audioPath.hostname} - Audio Path
            </h3>
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
              Status: <strong>{audioPath.overall_health.toUpperCase()}</strong> • 
              Updated: {new Date(audioPath.timestamp).toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>
      
      {/* Services Grid */}
      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ marginBottom: 16 }}>Audio Services</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
          {audioPath.services.map((svc, i) => {
            const svcHealth = getHealthColor(svc.health)
            const SvcIcon = svcHealth.icon
            return (
              <div
                key={i}
                style={{
                  padding: 12,
                  background: svcHealth.bg,
                  border: `1px solid ${svcHealth.border}`,
                  borderRadius: 6,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  {getServiceIcon(svc.type)}
                  <strong style={{ color: svcHealth.text, fontSize: 13 }}>{svc.name}</strong>
                  <SvcIcon size={14} style={{ marginLeft: 'auto', color: svcHealth.text }} />
                </div>
                <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.5 }}>
                  {svc.message}
                </div>
                {Object.entries(svc).length > 5 && (
                  <div style={{ fontSize: 10, color: '#666', marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    {Object.entries(svc)
                      .filter(([k]) => !['type', 'name', 'health', 'message', 'last_check'].includes(k))
                      .slice(0, 3)
                      .map(([k, v]) => (
                        <div key={k}>{k}: <span style={{ color: '#fff' }}>{String(v).substring(0, 20)}</span></div>
                      ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      
      {/* Detailed Service Info */}
      {audioPath.pipewire && (
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ marginBottom: 12 }}>PipeWire Details</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, color: '#aaa' }}>
            <div className="flex-between"><span>Daemon</span><span style={{ color: '#fff' }}>{audioPath.pipewire.daemon_running ? '✓ Running' : '✗ Offline'}</span></div>
            <div className="flex-between"><span>Version</span><span style={{ color: '#fff' }}>{audioPath.pipewire.version}</span></div>
            <div className="flex-between"><span>Sample Rate</span><span style={{ color: '#fff' }}>{audioPath.pipewire.sample_rate} Hz</span></div>
            <div className="flex-between"><span>Quantum</span><span style={{ color: '#fff' }}>{audioPath.pipewire.quantum} samples</span></div>
            <div className="flex-between"><span>Latency</span><span style={{ color: audioPath.pipewire.latency_ms > 20 ? '#f59e0b' : '#22c55e' }}>{audioPath.pipewire.latency_ms.toFixed(1)} ms</span></div>
            <div className="flex-between"><span>XRuns</span><span style={{ color: audioPath.pipewire.xruns > 0 ? '#f59e0b' : '#22c55e' }}>{audioPath.pipewire.xruns}</span></div>
            <div className="flex-between"><span>Devices</span><span style={{ color: '#fff' }}>{audioPath.pipewire.devices.length}</span></div>
            <div className="flex-between"><span>Streams</span><span style={{ color: '#fff' }}>{audioPath.pipewire.streams.length}</span></div>
            <div className="flex-between"><span>Links</span><span style={{ color: '#fff' }}>{audioPath.pipewire.links.length}</span></div>
            <div className="flex-between"><span>Graph Nodes</span><span style={{ color: '#fff' }}>{audioPath.pipewire.graph_nodes}</span></div>
          </div>
        </div>
      )}
      
      {/* JUCE Engine */}
      {audioPath.juce_engine && (
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ marginBottom: 12 }}>JUCE Audio Engine</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, color: '#aaa' }}>
            <div className="flex-between"><span>Status</span><span style={{ color: audioPath.juce_engine.running ? '#22c55e' : '#ef4444' }}>{audioPath.juce_engine.running ? '▶ Running' : '⏸ Stopped'}</span></div>
            <div className="flex-between"><span>Sample Rate</span><span style={{ color: '#fff' }}>{audioPath.juce_engine.sample_rate} Hz</span></div>
            <div className="flex-between"><span>Buffer Size</span><span style={{ color: '#fff' }}>{audioPath.juce_engine.buffer_size} samples</span></div>
            <div className="flex-between"><span>CPU Load</span><span style={{ color: audioPath.juce_engine.cpu_load > 0.8 ? '#ef4444' : audioPath.juce_engine.cpu_load > 0.5 ? '#f59e0b' : '#22c55e' }}>{(audioPath.juce_engine.cpu_load * 100).toFixed(1)}%</span></div>
            <div className="flex-between"><span>Input Channels</span><span style={{ color: '#fff' }}>{audioPath.juce_engine.input_channels}</span></div>
            <div className="flex-between"><span>Output Channels</span><span style={{ color: '#fff' }}>{audioPath.juce_engine.output_channels}</span></div>
            <div className="flex-between"><span>Plugins Loaded</span><span style={{ color: '#fff' }}>{audioPath.juce_engine.plugin_count}</span></div>
            <div className="flex-between"><span>XRun Count</span><span style={{ color: audioPath.juce_engine.xrun_count > 0 ? '#f59e0b' : '#22c55e' }}>{audioPath.juce_engine.xrun_count}</span></div>
          </div>
        </div>
      )}
      
      {/* Latency Breakdown */}
      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ marginBottom: 12 }}>Latency Breakdown</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, color: '#aaa', marginBottom: 12 }}>
          <div className="flex-between"><span>PipeWire Graph</span><span style={{ color: '#fff' }}>{audioPath.latency.pipewire_graph_ms.toFixed(2)} ms</span></div>
          <div className="flex-between"><span>PipeWire Driver</span><span style={{ color: '#fff' }}>{audioPath.latency.pipewire_driver_ms.toFixed(2)} ms</span></div>
          <div className="flex-between"><span>JUCE Buffer</span><span style={{ color: '#fff' }}>{audioPath.latency.juce_buffer_ms.toFixed(2)} ms</span></div>
          <div className="flex-between"><span>ALSA Hardware</span><span style={{ color: '#fff' }}>{audioPath.latency.alsa_hardware_ms.toFixed(2)} ms</span></div>
        </div>
        <div style={{ padding: 8, background: 'rgba(100, 181, 246, 0.1)', borderRadius: 4, borderLeft: '3px solid #64b5f6' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#64b5f6' }}>
            Total Latency: {audioPath.latency.total_ms.toFixed(2)} ms
          </div>
          <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>
            {audioPath.latency.total_ms <= 10 && '✓ Excellent (< 10ms)'}
            {audioPath.latency.total_ms > 10 && audioPath.latency.total_ms <= 20 && '✓ Good (10-20ms)'}
            {audioPath.latency.total_ms > 20 && audioPath.latency.total_ms <= 50 && '⚠️ Acceptable (20-50ms)'}
            {audioPath.latency.total_ms > 50 && '❌ High (> 50ms)'}
          </div>
        </div>
      </div>
      
      {/* Dependency Graph */}
      {audioPath.dependencies && Object.keys(audioPath.dependencies).length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ marginBottom: 12 }}>Service Dependencies</h4>
          <div style={{ fontSize: 12, color: '#aaa', lineHeight: 2 }}>
            {Object.entries(audioPath.dependencies).map(([svc, deps]) => (
              <div key={svc}>
                <strong style={{ color: '#fff' }}>{svc}</strong> depends on:{' '}
                <span style={{ color: '#64b5f6' }}>{deps.join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Alerts */}
      {audioPath.alerts && audioPath.alerts.length > 0 && (
        <div className="card" style={{ padding: 16, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444' }}>
          <h4 style={{ marginBottom: 12, color: '#ef4444' }}>⚠️ Alerts</h4>
          <ul style={{ fontSize: 12, color: '#ddd', margin: 0, paddingLeft: 20 }}>
            {audioPath.alerts.map((alert, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{alert}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
