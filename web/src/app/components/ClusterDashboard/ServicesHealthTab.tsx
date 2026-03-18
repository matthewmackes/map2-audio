import { useQuery } from '@tanstack/react-query'
import { Activity as Pulse, WarningAlt as WarningCircle, CheckmarkFilled as CheckCircle, Flash as Lightning } from '@carbon/icons-react'
import { useMemo } from 'react'
import { normalizeClusterNodes, getServiceStatusForNode } from './clusterData'

export function ServicesHealthTab() {
  const { data: nodes } = useQuery({
    queryKey: ['cluster', 'nodes'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/nodes')
      if (!res.ok) throw new Error('Failed to fetch nodes')
      return res.json()
    },
    refetchInterval: 10000,
  })

  const { data: deploymentMode } = useQuery({
    queryKey: ['deployment', 'mode'],
    queryFn: async () => {
      const res = await fetch('/api/deployment/mode')
      if (!res.ok) throw new Error('Failed to fetch deployment mode')
      return res.json()
    },
  })

  const services = [
    { name: 'juce_engine', label: '🎵 Audio Engine', runOn: ['AUDIO-NODE', 'ALL-IN-ONE'] },
    { name: 'audio_io', label: '🔊 Audio I/O', runOn: ['AUDIO-NODE', 'ALL-IN-ONE'] },
    { name: 'mdns_discovery', label: '🌐 mDNS Discovery', runOn: ['ALL'] },
    { name: 'api_server', label: '⚙️ API Server', runOn: ['ALL'] },
    { name: 'web_ui', label: '💻 Web Interface', runOn: ['MANAGEMENT-NODE', 'CONTROL-NODE', 'ALL-IN-ONE'] },
    { name: 'database', label: '💾 Database', runOn: ['ALL'] },
    { name: 'lcd_manager', label: '📱 LCD Manager', runOn: ['AUDIO-NODE', 'ALL-IN-ONE'] },
  ]

  const normalizedNodes = useMemo(() => normalizeClusterNodes(nodes), [nodes])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div
        style={{
          background: 'linear-gradient(155deg, #2d2d2d, #333333)',
          border: '2px solid #444',
          borderRadius: 12,
          padding: '20px',
        }}
      >
        <div style={{ fontSize: 12, color: '#a0a0a0', marginBottom: 8, textTransform: 'uppercase' }}>
          Service Status Matrix
        </div>
        <div style={{ fontSize: 13, color: '#d0d0d0', lineHeight: 1.5 }}>
          All services running across your cluster. Green = Running, Yellow = Degraded, Red = Offline.
        </div>
      </div>

      {normalizedNodes.length > 0 ? (
        <div
          style={{
            overflowX: 'auto',
            border: '1px solid #333',
            borderRadius: 8,
            background: '#1a1a1a',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#2d2d2d', borderBottom: '2px solid #444' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#d0d0d0' }}>Service</th>
                {normalizedNodes.map(node => (
                  <th
                    key={node.nodeId}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'center',
                      fontWeight: 600,
                      color: '#a0a0a0',
                      whiteSpace: 'nowrap',
                      borderLeft: '1px solid #333',
                    }}
                  >
                    {node.hostname}
                    <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{node.role}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {services.map(service => (
                <tr
                  key={service.name}
                  style={{
                    borderBottom: '1px solid #333',
                    background: 'transparent',
                  }}
                >
                  <td
                    style={{
                      padding: '12px 16px',
                      color: '#d0d0d0',
                      fontWeight: 500,
                      borderRight: '1px solid #333',
                    }}
                  >
                    {service.label}
                  </td>
                  {normalizedNodes.map(node => {
                    const status = getServiceStatusForNode(node, service.runOn)

                    return (
                      <td
                        key={`${service.name}-${node.nodeId}`}
                        style={{
                          padding: '12px 16px',
                          textAlign: 'center',
                          borderLeft: '1px solid #333',
                          fontSize: 12,
                          color:
                            status === 'running'
                              ? '#00ff41'
                              : status === 'degraded'
                                ? '#ffaa00'
                                : status === 'offline'
                                  ? '#ff3333'
                                  : '#888',
                        }}
                      >
                        {status === 'running' && <CheckCircle size={16} style={{ display: 'inline' }} />}
                        {status === 'degraded' && <WarningCircle size={16} style={{ display: 'inline' }} />}
                        {status === 'offline' && <WarningCircle size={16} style={{ display: 'inline' }} />}
                        {status === 'n/a' && <Lightning size={16} style={{ display: 'inline', opacity: 0.3 }} />}
                        <div style={{ marginTop: 4, fontSize: 10 }}>
                          {status === 'n/a' ? 'N/A' : status}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid #333',
            borderRadius: 8,
            padding: '20px',
            textAlign: 'center',
            color: '#a0a0a0',
          }}
        >
          {deploymentMode?.mode === 'ALL-IN-ONE' ? (
            <div>
              <Pulse size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
              <div>Single node deployment detected.</div>
              <div style={{ fontSize: 12, marginTop: 8 }}>Deploy multiple nodes to see service distribution.</div>
            </div>
          ) : (
            <div>Loading service status...</div>
          )}
        </div>
      )}

      {/* Service Legend */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid #333',
          borderRadius: 8,
          padding: '14px 16px',
          fontSize: 11,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8, color: '#d0d0d0' }}>Legend</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle size={14} style={{ color: '#00ff41' }} /> Running
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <WarningCircle size={14} style={{ color: '#ffaa00' }} /> Degraded
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <WarningCircle size={14} style={{ color: '#ff3333' }} /> Offline
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Lightning size={14} style={{ color: '#888', opacity: 0.3 }} /> N/A
          </div>
        </div>
      </div>
    </div>
  )
}
