import { useMemo, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { EmptyState } from '../shared/EmptyState'
import { LoadingState } from '../shared/LoadingState'
import {
  normalizeClusterMetrics,
  filterMetricsByRange,
  summarizeClusterMetrics,
  buildClusterMetricsSeries,
} from './clusterData'

export function MetricsDashboardTab() {
  const [selectedDateRange, setSelectedDateRange] = useState('1h')

  const { data: metricsPayload, isLoading, error } = useQuery({
    queryKey: ['cluster', 'metrics'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/metrics')
      if (!res.ok) throw new Error('Failed to fetch metrics')
      return res.json()
    },
    refetchInterval: 15000,
  })

  const metricSamples = useMemo(() => normalizeClusterMetrics(metricsPayload), [metricsPayload])
  const filteredSamples = useMemo(
    () => filterMetricsByRange(metricSamples, selectedDateRange),
    [metricSamples, selectedDateRange]
  )
  const summary = useMemo(
    () => summarizeClusterMetrics(metricsPayload, filteredSamples),
    [metricsPayload, filteredSamples]
  )
  const timeSeriesData = useMemo(
    () => buildClusterMetricsSeries(filteredSamples, 24).map(point => ({
      time: point.timeLabel,
      cpu: point.cpu,
      memory: point.memory,
      dsp: point.dsp,
      latency: point.latency,
    })),
    [filteredSamples]
  )

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
        <div style={{ fontSize: 12, color: '#a0a0a0', marginBottom: 8, letterSpacing: '0.02em' }}>
          Prometheus Metrics Dashboard
        </div>
        <div style={{ fontSize: 13, color: '#d0d0d0', lineHeight: 1.5 }}>
          Real cluster metrics aggregated from node telemetry. No synthetic data.
        </div>
      </div>

      <div
        style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: 8,
          padding: '14px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        {[
          { label: 'Last 5m', value: '5m' },
          { label: 'Last 1h', value: '1h' },
          { label: 'Last 24h', value: '24h' },
          { label: 'Last 7d', value: '7d' },
        ].map(range => (
          <button
            key={range.value}
            onClick={() => setSelectedDateRange(range.value)}
            style={{
              padding: '8px 12px',
              background: selectedDateRange === range.value ? '#2563eb' : 'rgba(255,255,255,0.05)',
              color: selectedDateRange === range.value ? '#000' : '#d0d0d0',
              border: `1px solid ${selectedDateRange === range.value ? '#2563eb' : '#333'}`,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {range.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            borderRadius: 8,
            padding: '12px 14px',
            color: '#fca5a5',
            fontSize: 12,
          }}
        >
          Failed to load cluster metrics. Verify `/api/cluster/metrics` is available.
        </div>
      )}

      <div
        style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: 8,
          padding: '20px',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: '#d0d0d0' }}>
          CPU Usage ({selectedDateRange})
        </div>
        {timeSeriesData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#444" />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#888' }} />
              <YAxis tick={{ fontSize: 11, fill: '#888' }} />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 6 }}
                formatter={(value: number | string) => `${Number(value).toFixed(1)}%`}
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
        ) : (
          isLoading ? (
            <LoadingState description="Loading metrics" />
          ) : (
            <EmptyState
              compact
              title="No metrics in the selected time range"
              description="Choose a wider time range or wait for fresh cluster telemetry samples."
            />
          )
        )}
      </div>

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
          {timeSeriesData.length > 0 ? (
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#888' }} />
                <YAxis tick={{ fontSize: 10, fill: '#888' }} />
                <Tooltip
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 6 }}
                  formatter={(value: number | string) => `${Number(value).toFixed(1)}%`}
                />
                <Bar dataKey="memory" fill="#3b82f6" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            isLoading ? (
              <LoadingState description="Loading metrics" />
            ) : (
              <EmptyState
                compact
                title="No memory data in the selected range"
                description="Choose a wider time range or wait for memory telemetry to publish."
              />
            )
          )}
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
          {timeSeriesData.length > 0 ? (
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#888' }} />
                <YAxis tick={{ fontSize: 10, fill: '#888' }} />
                <Tooltip
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 6 }}
                  formatter={(value: number | string) => `${Number(value).toFixed(1)}%`}
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
          ) : (
            isLoading ? (
              <LoadingState description="Loading metrics" />
            ) : (
              <EmptyState
                compact
                title="No DSP data in the selected range"
                description="Choose a wider time range or wait for DSP telemetry to publish."
              />
            )
          )}
        </div>
      </div>

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
              {summary.avgCpuPercent.toFixed(1)}%
            </div>
          </div>
          <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: '#a0a0a0', marginBottom: 6 }}>Avg Memory</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#3b82f6' }}>
              {summary.avgMemoryPercent.toFixed(1)}%
            </div>
          </div>
          <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: '#a0a0a0', marginBottom: 6 }}>Audio DSP</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#22c55e' }}>
              {summary.avgDspLoadPercent.toFixed(1)}%
            </div>
          </div>
          <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: '#a0a0a0', marginBottom: 6 }}>Max Latency</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#fbbf24' }}>
              {summary.maxLatencyMs.toFixed(1)}ms
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
