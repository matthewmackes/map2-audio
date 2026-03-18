import { useQuery } from '@tanstack/react-query'
import { Branch as GitBranch } from '@carbon/icons-react'

export function FlowManagementTab() {
  const { data: flows } = useQuery({
    queryKey: ['cluster', 'flows'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/cluster/flows/assignments')
        if (!res.ok) throw new Error('Failed to fetch flows')
        return res.json()
      } catch {
        return { flows: [] }
      }
    },
    refetchInterval: 5000,
  })

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
          Flow Distribution
        </div>
        <div style={{ fontSize: 13, color: '#d0d0d0', lineHeight: 1.5 }}>
          Shows how audio flows are distributed across cluster nodes with primary/standby assignments.
        </div>
      </div>

      {flows && flows.flows && flows.flows.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {flows.flows.map((flow: any, idx: number) => (
            <div
              key={idx}
              style={{
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: 8,
                padding: '16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#d0d0d0' }}>
                    <GitBranch size={14} style={{ display: 'inline', marginRight: 6 }} />
                    {flow.flow_id || `Flow ${idx + 1}`}
                  </div>
                  <div style={{ fontSize: 12, color: '#a0a0a0', marginTop: 4 }}>
                    DSP Load: {flow.dsp_load?.toFixed(1) || '0'}%
                  </div>
                </div>
                <div
                  style={{
                    padding: '4px 10px',
                    background: '#00ff41',
                    color: '#000',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  Active
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Primary Assignment */}
                <div
                  style={{
                    background: 'rgba(0, 255, 65, 0.1)',
                    border: '1px solid #00ff41',
                    borderRadius: 6,
                    padding: '10px 12px',
                  }}
                >
                  <div style={{ fontSize: 10, color: '#00ff41', fontWeight: 600, marginBottom: 6 }}>PRIMARY</div>
                  <div style={{ fontSize: 12, color: '#d0d0d0', fontWeight: 500 }}>
                    {flow.primary_node || 'Unassigned'}
                  </div>
                </div>

                {/* Standby Assignment */}
                <div
                  style={{
                    background: 'rgba(255, 170, 0, 0.1)',
                    border: '1px solid #ffaa00',
                    borderRadius: 6,
                    padding: '10px 12px',
                  }}
                >
                  <div style={{ fontSize: 10, color: '#ffaa00', fontWeight: 600, marginBottom: 6 }}>STANDBY</div>
                  <div style={{ fontSize: 12, color: '#d0d0d0', fontWeight: 500 }}>
                    {flow.standby_node || 'None'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid #333',
            borderRadius: 8,
            padding: '40px 20px',
            textAlign: 'center',
            color: '#a0a0a0',
          }}
        >
          <GitBranch size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <div>No flows currently assigned</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>
            Create flows in the Grid interface to see distributions here.
          </div>
        </div>
      )}

      {/* Flow Distribution Benefits */}
      <div
        style={{
          background: 'rgba(37, 99, 235, 0.1)',
          border: '1px solid #2563eb',
          borderRadius: 8,
          padding: '16px',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', marginBottom: 8 }}>💡 Distribution Tips</div>
        <ul style={{ fontSize: 12, color: '#d0d0d0', margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
          <li>Assign heavy flows to nodes with more available DSP</li>
          <li>Use standby nodes for critical audio flows</li>
          <li>Monitor per-node DSP load to balance processing</li>
          <li>High latency links reduce suitability for failover</li>
        </ul>
      </div>
    </div>
  )
}
