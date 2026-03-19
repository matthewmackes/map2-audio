import { Download as DownloadSimple, Document as FileText, ChartLine as ChartBar, Filter as Funnel, Time, Activity, DataBase } from '@carbon/icons-react'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  normalizeClusterMetrics,
  normalizeClusterNodes,
  filterMetricsByRange,
  summarizeClusterMetrics,
} from './clusterData'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function downloadBlob(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.URL.revokeObjectURL(url)
}

function buildCsv(rows: string[][]): string {
  return rows
    .map(columns =>
      columns
        .map(value => `"${String(value).replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n')
}

interface ReportEntry {
  title: string
  description: string
  icon: React.ReactNode
  format: 'CSV' | 'JSON' | 'HTML'
  action: () => void
  disabled?: boolean
  disabledReason?: string
}

export function ReportingTab() {
  const [selectedDateRange, setSelectedDateRange] = useState('24h')
  const [isExporting, setIsExporting] = useState(false)

  const { data: metricsPayload, error: metricsError } = useQuery({
    queryKey: ['cluster', 'metrics'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/metrics')
      if (!res.ok) throw new Error('Failed to fetch metrics')
      return res.json()
    },
    refetchInterval: 15000,
  })

  const { data: nodesPayload } = useQuery({
    queryKey: ['cluster', 'nodes'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/nodes')
      if (!res.ok) throw new Error('Failed to fetch nodes')
      return res.json()
    },
    refetchInterval: 15000,
  })

  const { data: eventsPayload } = useQuery({
    queryKey: ['cluster', 'events', 'reporting'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/events?hours=720&limit=5000')
      if (!res.ok) return { events: [] }
      return res.json()
    },
    refetchInterval: 30000,
  })

  const nodes = useMemo(() => normalizeClusterNodes(nodesPayload), [nodesPayload])
  const metrics = useMemo(() => normalizeClusterMetrics(metricsPayload), [metricsPayload])
  const filteredMetrics = useMemo(
    () => filterMetricsByRange(metrics, selectedDateRange),
    [metrics, selectedDateRange]
  )
  const summary = useMemo(
    () => summarizeClusterMetrics(metricsPayload, filteredMetrics),
    [metricsPayload, filteredMetrics]
  )

  const filteredEvents = useMemo(() => {
    const allEvents = Array.isArray(eventsPayload?.events)
      ? (eventsPayload.events as Array<Record<string, unknown>>)
      : []
    const rangeMs =
      selectedDateRange === '5m'
        ? 5 * 60 * 1000
        : selectedDateRange === '1h'
          ? 60 * 60 * 1000
          : selectedDateRange === '7d'
            ? 7 * 24 * 60 * 60 * 1000
            : selectedDateRange === '30d'
              ? 30 * 24 * 60 * 60 * 1000
              : 24 * 60 * 60 * 1000
    const cutoff = Date.now() - rangeMs
    return allEvents.filter(event => {
      const ts = Date.parse(String(event.timestamp ?? ''))
      return Number.isFinite(ts) ? ts >= cutoff : false
    })
  }, [eventsPayload, selectedDateRange])

  const exportMetricsCsv = () => {
    const rows = [
      ['timestamp', 'node_id', 'cpu_percent', 'memory_percent', 'dsp_load_percent', 'xrun_count', 'latency_ms'],
      ...filteredMetrics.map(sample => [
        sample.isoTimestamp,
        sample.nodeId,
        sample.cpuPercent.toFixed(2),
        sample.memoryPercent.toFixed(2),
        sample.dspLoadPercent.toFixed(2),
        String(sample.xrunCount),
        sample.latencyMs.toFixed(2),
      ]),
    ]
    const csv = buildCsv(rows)
    downloadBlob(`cluster-metrics-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8', csv)
  }

  const exportEventsJson = () => {
    const payload = {
      generated_at: new Date().toISOString(),
      range: selectedDateRange,
      total_events: filteredEvents.length,
      events: filteredEvents,
    }
    downloadBlob(
      `cluster-events-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json;charset=utf-8',
      JSON.stringify(payload, null, 2)
    )
  }

  const exportHealthHtml = () => {
    const generatedAt = new Date().toISOString()
    const healthRows = nodes
      .map(node => {
        const statusColor =
          node.status === 'ONLINE' ? '#10b981' : node.status === 'DEGRADED' ? '#f59e0b' : '#ef4444'
        return `
          <tr>
            <td>${escapeHtml(node.hostname)}</td>
            <td>${escapeHtml(node.nodeId)}</td>
            <td>${escapeHtml(node.role)}</td>
            <td style="color:${statusColor};font-weight:700;">${escapeHtml(node.status)}</td>
            <td>${node.healthScore.toFixed(1)}%</td>
          </tr>
        `
      })
      .join('')

    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Cluster Health Report</title>
    <style>
      body { font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; margin: 20px; }
      h1, h2 { margin: 0 0 12px 0; }
      .meta { color: #94a3b8; margin-bottom: 20px; }
      .cards { display: grid; grid-template-columns: repeat(4, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
      .card { border: 1px solid #334155; border-radius: 8px; padding: 12px; background: #111827; }
      .label { color: #94a3b8; font-size: 12px; }
      .value { font-size: 22px; font-weight: 700; margin-top: 6px; }
      table { width: 100%; border-collapse: collapse; background: #111827; border: 1px solid #334155; border-radius: 8px; overflow: hidden; }
      th, td { text-align: left; padding: 10px; border-bottom: 1px solid #1e293b; font-size: 13px; }
      th { color: #94a3b8; font-weight: 600; text-transform: uppercase; font-size: 11px; }
    </style>
  </head>
  <body>
    <h1>Cluster Health Report</h1>
    <div class="meta">Generated: ${escapeHtml(generatedAt)} | Range: ${escapeHtml(selectedDateRange)}</div>
    <div class="cards">
      <div class="card"><div class="label">Avg CPU</div><div class="value">${summary.avgCpuPercent.toFixed(1)}%</div></div>
      <div class="card"><div class="label">Avg Memory</div><div class="value">${summary.avgMemoryPercent.toFixed(1)}%</div></div>
      <div class="card"><div class="label">Avg DSP</div><div class="value">${summary.avgDspLoadPercent.toFixed(1)}%</div></div>
      <div class="card"><div class="label">Max Latency</div><div class="value">${summary.maxLatencyMs.toFixed(1)}ms</div></div>
    </div>
    <h2>Node Status</h2>
    <table>
      <thead>
        <tr>
          <th>Hostname</th>
          <th>Node ID</th>
          <th>Role</th>
          <th>Status</th>
          <th>Health</th>
        </tr>
      </thead>
      <tbody>
        ${healthRows || '<tr><td colspan="5">No node data available</td></tr>'}
      </tbody>
    </table>
  </body>
</html>
    `.trim()

    downloadBlob(`cluster-health-${new Date().toISOString().slice(0, 10)}.html`, 'text/html;charset=utf-8', html)
  }

  const exportUptimeHtml = () => {
    const totalNodes = nodes.length
    const onlineNodes = nodes.filter(node => node.status === 'ONLINE').length
    const degradedNodes = nodes.filter(node => node.status === 'DEGRADED').length
    const availabilityPercent = totalNodes > 0 ? (onlineNodes / totalNodes) * 100 : 0

    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Service Uptime Snapshot</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; color: #111827; }
      h1 { margin: 0 0 8px 0; }
      .muted { color: #6b7280; margin-bottom: 20px; }
      .grid { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 12px; margin-bottom: 20px; }
      .box { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; background: #f9fafb; }
      .k { font-size: 12px; color: #6b7280; }
      .v { font-size: 22px; font-weight: 700; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
      th { font-size: 11px; text-transform: uppercase; color: #6b7280; }
    </style>
  </head>
  <body>
    <h1>Service Uptime Snapshot</h1>
    <div class="muted">Generated: ${escapeHtml(new Date().toISOString())} | Range filter: ${escapeHtml(selectedDateRange)}</div>
    <div class="grid">
      <div class="box"><div class="k">Nodes</div><div class="v">${totalNodes}</div></div>
      <div class="box"><div class="k">Online</div><div class="v">${onlineNodes}</div></div>
      <div class="box"><div class="k">Degraded</div><div class="v">${degradedNodes}</div></div>
      <div class="box"><div class="k">Availability</div><div class="v">${availabilityPercent.toFixed(1)}%</div></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Node</th>
          <th>Role</th>
          <th>Status</th>
          <th>Health</th>
        </tr>
      </thead>
      <tbody>
        ${
          nodes.length > 0
            ? nodes
                .map(
                  node => `
        <tr>
          <td>${escapeHtml(node.hostname)}</td>
          <td>${escapeHtml(node.role)}</td>
          <td>${escapeHtml(node.status)}</td>
          <td>${node.healthScore.toFixed(1)}%</td>
        </tr>`
                )
                .join('')
            : '<tr><td colspan="4">No node data available</td></tr>'
        }
      </tbody>
    </table>
  </body>
</html>
    `.trim()

    downloadBlob(`cluster-uptime-${new Date().toISOString().slice(0, 10)}.html`, 'text/html;charset=utf-8', html)
  }

  const runExport = async (action: () => void) => {
    setIsExporting(true)
    try {
      action()
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  const reports: ReportEntry[] = [
    {
      title: 'Cluster Health Report',
      description: 'HTML report summarizing node status and cluster health metrics',
      icon: <ChartBar size={24} />,
      format: 'HTML',
      action: () => runExport(exportHealthHtml),
      disabled: nodes.length === 0,
      disabledReason: nodes.length === 0 ? 'No cluster node data available yet' : undefined,
    },
    {
      title: 'Metrics Export',
      description: 'CSV export of metrics in selected time range',
      icon: <Activity size={24} />,
      format: 'CSV',
      action: () => runExport(exportMetricsCsv),
      disabled: filteredMetrics.length === 0,
      disabledReason: filteredMetrics.length === 0 ? 'No metric samples in selected range' : undefined,
    },
    {
      title: 'Event Log Archive',
      description: 'JSON export of cluster events within selected range',
      icon: <DataBase size={24} />,
      format: 'JSON',
      action: () => runExport(exportEventsJson),
      disabled: filteredEvents.length === 0,
      disabledReason: filteredEvents.length === 0 ? 'No events in selected range' : undefined,
    },
    {
      title: 'Service Uptime Report',
      description: 'HTML snapshot of current node availability and health',
      icon: <Time size={24} />,
      format: 'HTML',
      action: () => runExport(exportUptimeHtml),
      disabled: nodes.length === 0,
      disabledReason: nodes.length === 0 ? 'No cluster node data available yet' : undefined,
    },
  ]

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
          Export & Reporting
        </div>
        <div style={{ fontSize: 13, color: '#d0d0d0', lineHeight: 1.5 }}>
          Export cluster data and generate usable reports from live API data.
        </div>
      </div>

      {metricsError && (
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
          Metrics endpoint unavailable. Some exports are disabled until `/api/cluster/metrics` responds.
        </div>
      )}

      <div
        style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: 8,
          padding: '16px',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: '#d0d0d0' }}>
          <Funnel size={14} style={{ display: 'inline', marginRight: 6 }} />
          Time Range
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Last 5 Minutes', value: '5m' },
            { label: 'Last Hour', value: '1h' },
            { label: 'Last 24 Hours', value: '24h' },
            { label: 'Last 7 Days', value: '7d' },
            { label: 'Last 30 Days', value: '30d' },
          ].map(range => (
            <button
              key={range.value}
              onClick={() => setSelectedDateRange(range.value)}
              style={{
                padding: '8px 14px',
                background: selectedDateRange === range.value ? '#2563eb' : 'rgba(255, 255, 255, 0.05)',
                color: selectedDateRange === range.value ? '#000' : '#d0d0d0',
                border: `1px solid ${selectedDateRange === range.value ? '#2563eb' : '#333'}`,
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
        {reports.map((report, idx) => (
          <div
            key={idx}
            style={{
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: 8,
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 12 }}>{report.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#d0d0d0', marginBottom: 6 }}>{report.title}</div>
            <div style={{ fontSize: 12, color: '#a0a0a0', marginBottom: 14, flex: 1 }}>
              {report.description}
              {report.disabled && report.disabledReason && (
                <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 6, fontStyle: 'italic' }}>
                  ⚠ {report.disabledReason}
                </div>
              )}
            </div>
            <button
              onClick={report.action}
              disabled={isExporting || report.disabled}
              style={{
                padding: '10px 14px',
                background: report.disabled ? '#333' : '#2563eb',
                color: report.disabled ? '#666' : '#000',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: isExporting || report.disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                opacity: isExporting || report.disabled ? 0.6 : 1,
              }}
            >
              <DownloadSimple size={14} />
              {isExporting ? 'Exporting...' : report.disabled ? 'Unavailable' : `Export ${report.format}`}
            </button>
          </div>
        ))}
      </div>

      <div
        style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: 8,
          padding: '20px',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#d0d0d0' }}>
          <ChartBar size={16} style={{ display: 'inline', marginRight: 6 }} />
          Current Data Snapshot
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid #333', borderRadius: 6, padding: '12px' }}>
            <div style={{ fontSize: 11, color: '#a0a0a0' }}>Metric Samples</div>
            <div style={{ fontSize: 20, color: '#d0d0d0', fontWeight: 700, marginTop: 4 }}>{filteredMetrics.length}</div>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid #333', borderRadius: 6, padding: '12px' }}>
            <div style={{ fontSize: 11, color: '#a0a0a0' }}>Events</div>
            <div style={{ fontSize: 20, color: '#d0d0d0', fontWeight: 700, marginTop: 4 }}>{filteredEvents.length}</div>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid #333', borderRadius: 6, padding: '12px' }}>
            <div style={{ fontSize: 11, color: '#a0a0a0' }}>Nodes</div>
            <div style={{ fontSize: 20, color: '#d0d0d0', fontWeight: 700, marginTop: 4 }}>{nodes.length}</div>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid #333', borderRadius: 6, padding: '12px' }}>
            <div style={{ fontSize: 11, color: '#a0a0a0' }}>Avg CPU</div>
            <div style={{ fontSize: 20, color: '#d0d0d0', fontWeight: 700, marginTop: 4 }}>{summary.avgCpuPercent.toFixed(1)}%</div>
          </div>
        </div>
      </div>

      <div
        style={{
          background: 'rgba(37, 99, 235, 0.1)',
          border: '1px solid #2563eb',
          borderRadius: 8,
          padding: '16px',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', marginBottom: 8 }}>
          <FileText size={14} style={{ display: 'inline', marginRight: 6 }} />
          Reporting Note
        </div>
        <div style={{ fontSize: 12, color: '#d0d0d0', lineHeight: 1.6 }}>
          Exports are generated client-side from currently available API data. If historical retention is short on the backend, report depth is limited to retained records.
        </div>
      </div>
    </div>
  )
}
