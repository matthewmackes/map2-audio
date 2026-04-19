/**
 * Performance Metrics - Real-Time System Performance Graphs
 */

import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Renew as ArrowsClockwise } from '@carbon/icons-react'
import { useDiskHealth, useHealthOverview } from '@/app/hooks/useHostMachine'

interface PerformanceMetricsProps {
  autoRefresh: boolean
  onAutoRefreshChange: (value: boolean) => void
  nodeId?: string | null
}

interface MetricPoint {
  time: string
  cpu: number
  memory: number
  temp: number
  disk: number
}

function getMetricTone(value: number, warnAt: number, dangerAt: number) {
  if (value >= dangerAt) return 'danger'
  if (value >= warnAt) return 'warning'
  return 'success'
}

function getMetricLabel(tone: string) {
  if (tone === 'danger') return 'High'
  if (tone === 'warning') return 'Moderate'
  return 'Normal'
}

export default function PerformanceMetrics({ autoRefresh, onAutoRefreshChange, nodeId }: PerformanceMetricsProps) {
  const [metrics, setMetrics] = useState<MetricPoint[]>([])

  const healthQ = useHealthOverview(autoRefresh ? 2000 : undefined, nodeId)
  const diskQ = useDiskHealth(autoRefresh ? 5000 : undefined, nodeId)

  useEffect(() => {
    if (!healthQ.data) return

    const diskPercent =
      diskQ.data?.use_percent ?? diskQ.data?.disks?.[0]?.use_percent ?? 0

    const next: MetricPoint = {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      cpu: healthQ.data.cpu_usage_percent ?? 0,
      memory: healthQ.data.memory_usage_percent ?? 0,
      temp: healthQ.data.cpu_temp_celsius ?? 0,
      disk: diskPercent,
    }

    setMetrics((prev) => {
      const last = prev[prev.length - 1]
      const unchanged =
        last &&
        Math.abs(last.cpu - next.cpu) < 0.01 &&
        Math.abs(last.memory - next.memory) < 0.01 &&
        Math.abs(last.temp - next.temp) < 0.01 &&
        Math.abs(last.disk - next.disk) < 0.01
      if (unchanged) return prev
      return [...prev.slice(-23), next]
    })
  }, [healthQ.data, diskQ.data])

  const latest = metrics[metrics.length - 1] ?? { cpu: 0, memory: 0, temp: 0, disk: 0 }

  const cpuTone = getMetricTone(latest.cpu, 70, 85)
  const memTone = getMetricTone(latest.memory, 70, 85)
  const tempTone = getMetricTone(latest.temp, 60, 75)

  // Carbon-palette chart colors
  const chartColors = {
    cpu: 'var(--cds-link-primary, #4589ff)',
    memory: '#ee5396',
    temp: '#f1c21b',
    disk: '#8a3ffc',
  }

  const chartGridColor = 'var(--border, #393939)'
  const chartAxisColor = 'var(--text-tertiary, #8d8d8d)'

  return (
    <div className="hm-perf">

      {/* Controls */}
      <div className="hm-perf__toolbar">
        <span className="hm-perf__title">Real-Time Performance Monitoring</span>
        <div className="hm-perf__toolbar-actions">
          <label className="hm-toggle-label">
            <input
              type="checkbox"
              className="hm-toggle-input"
              checked={autoRefresh}
              onChange={(e) => onAutoRefreshChange(e.target.checked)}
            />
            <span className="hm-toggle-track">
              <span className="hm-toggle-thumb" />
            </span>
            Auto-refresh
          </label>
          <button
            className="hm-btn hm-btn--ghost"
            onClick={() => { healthQ.refetch(); diskQ.refetch() }}
            disabled={healthQ.isFetching || diskQ.isFetching}
          >
            <ArrowsClockwise size={14} className={healthQ.isFetching ? 'hm-spin' : ''} />
            {healthQ.isFetching || diskQ.isFetching ? 'Refreshing…' : 'Force Refresh'}
          </button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="hm-perf__kpis">
        {[
          { label: 'CPU Usage', value: `${latest.cpu.toFixed(0)}%`, tone: cpuTone, sub: getMetricLabel(cpuTone) },
          { label: 'Memory Usage', value: `${latest.memory.toFixed(0)}%`, tone: memTone, sub: getMetricLabel(memTone) },
          { label: 'Temperature', value: `${latest.temp.toFixed(0)}°C`, tone: tempTone, sub: getMetricLabel(tempTone) },
          { label: 'Disk Usage', value: `${latest.disk.toFixed(0)}%`, tone: 'info', sub: 'Storage' },
        ].map(({ label, value, tone, sub }) => (
          <div key={label} className={`hm-perf-tile hm-perf-tile--${tone}`}>
            <div className="hm-perf-tile__label">{label}</div>
            <div className="hm-perf-tile__value">{value}</div>
            <div className="hm-perf-tile__sub">{sub}</div>
          </div>
        ))}
      </div>

      {/* CPU & Memory chart */}
      <div className="hm-section-card hm-perf__chart-card">
        <div className="hm-section-card__title">CPU &amp; Memory Utilization</div>
        {metrics.length === 0 ? (
          <div className="hm-chart-empty">Waiting for data{autoRefresh ? '…' : ' — enable auto-refresh'}</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={metrics} margin={{ top: 4, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
              <XAxis dataKey="time" stroke={chartAxisColor} tick={{ fontSize: 11 }} />
              <YAxis stroke={chartAxisColor} tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
              <Tooltip
                contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 0, fontSize: 12 }}
                labelStyle={{ color: 'var(--text-secondary)' }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
              <Line type="monotone" dataKey="cpu" stroke={chartColors.cpu} strokeWidth={2} dot={false} name="CPU %" />
              <Line type="monotone" dataKey="memory" stroke={chartColors.memory} strokeWidth={2} dot={false} name="Memory %" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Temperature & Disk chart */}
      <div className="hm-section-card hm-perf__chart-card">
        <div className="hm-section-card__title">Temperature &amp; Disk Usage</div>
        {metrics.length === 0 ? (
          <div className="hm-chart-empty">Waiting for data{autoRefresh ? '…' : ' — enable auto-refresh'}</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={metrics} margin={{ top: 4, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
              <XAxis dataKey="time" stroke={chartAxisColor} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" stroke={chartAxisColor} tick={{ fontSize: 11 }} unit="°C" />
              <YAxis yAxisId="right" orientation="right" stroke={chartAxisColor} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip
                contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 0, fontSize: 12 }}
                labelStyle={{ color: 'var(--text-secondary)' }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
              <Line yAxisId="left" type="monotone" dataKey="temp" stroke={chartColors.temp} strokeWidth={2} dot={false} name="Temp °C" />
              <Line yAxisId="right" type="monotone" dataKey="disk" stroke={chartColors.disk} strokeWidth={2} dot={false} name="Disk %" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Tips */}
      <div className="hm-tips">
        <div className="hm-tips__title">Performance Tips</div>
        <ul className="hm-tips__list">
          <li>Keep CPU usage below 75% for reliable real-time audio</li>
          <li>Sustained high temperatures may trigger thermal throttling and increase latency</li>
          <li>Allocate dedicated cores to the audio engine via CPU Core Config</li>
          <li>Use the Performance tab for live monitoring during critical sessions</li>
        </ul>
      </div>

    </div>
  )
}
