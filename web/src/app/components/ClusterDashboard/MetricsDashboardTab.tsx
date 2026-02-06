import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useQuery } from '@tanstack/react-query'

export function MetricsDashboardTab() {
  const { data: metrics } = useQuery({
    queryKey: ['cluster', 'metrics'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/metrics')
      if (!res.ok) throw new Error('Failed to fetch metrics')
      return res.json()
    },
    refetchInterval: 15000,
  })

  // Generate sample time-series data
  const timeSeriesData = Array.from({ length: 20 }, (_, i) => ({
    time: `${i}min`,
    cpu: 30 + Math.random() * 40,
    memory: 40 + Math.random() * 30,
    dsp: 20 + Math.random() * 50,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div
        style={{
          background: 'linear-gradient(155deg, #2d2d2d, #333333)',
          border: '2px solid #444',
          borderRadius: 12,
          padding: '20px',
        }}
      >
        <div style={{ fontSize: 12, color: '#a0a0a0', marginBottom: 8, textTransform: 'uppercase' }}>
          Prometheus Metrics Dashboard
        </div>
        <div style={{ fontSize: 13, color: '#d0d0d0', lineHeight: 1.5 }}>
          Real-time cluster metrics visualization. Connect to Grafana for advanced dashboards.
        </div>
      </div>

      {/* CPU Usage Over Time */}
      <div
        style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: 8,
          padding: '20px',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: '#d0d0d0' }}>CPU Usage (Last Hour)</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={timeSeriesData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#444" />
            <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#888' }} />
            <YAxis tick={{ fontSize: 11, fill: '#888' }} />
            <Tooltip
              contentStyle={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 6 }}
              formatter={(value: any) => value.toFixed(1)}
            />
            <Line
              dataKey="cpu"
              stroke="#ffa726"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Memory and DSP */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        <div
          style={{
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: 8,
            padding: '20px',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: '#d0d0d0' }}>Memory Usage</div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#444" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#888' }} />
              <YAxis tick={{ fontSize: 10, fill: '#888' }} />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 6 }}
                formatter={(value: any) => value.toFixed(1)}
              />
              <Bar dataKey="memory" fill="#3b82f6" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div
          style={{
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: 8,
            padding: '20px',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: '#d0d0d0' }}>Audio DSP Load</div>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#444" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#888' }} />
              <YAxis tick={{ fontSize: 10, fill: '#888' }} />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 6 }}
                formatter={(value: any) => value.toFixed(1)}
              />
              <Line
                dataKey="dsp"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Current Metrics Summary */}
      {metrics && (
        <div
          style={{
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: 8,
            padding: '20px',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#d0d0d0' }}>Current Metrics</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: '#a0a0a0', marginBottom: 6 }}>Avg CPU</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#ffa726' }}>
                {metrics.avg_cpu_percent?.toFixed(1) || '-'}%
              </div>
            </div>
            <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: '#a0a0a0', marginBottom: 6 }}>Avg Memory</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#3b82f6' }}>
                {metrics.avg_memory_percent?.toFixed(1) || '-'}%
              </div>
            </div>
            <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: '#a0a0a0', marginBottom: 6 }}>Audio DSP</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#22c55e' }}>
                {metrics.avg_dsp_load_percent?.toFixed(1) || '-'}%
              </div>
            </div>
            <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: '#a0a0a0', marginBottom: 6 }}>Max Latency</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#fbbf24' }}>
                {metrics.max_latency_ms?.toFixed(1) || '-'}ms
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
