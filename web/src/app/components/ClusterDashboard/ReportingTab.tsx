import { DownloadSimple, FileText, ChartBar, Funnel } from '@phosphor-icons/react'
import { useState } from 'react'

export function ReportingTab() {
  const [selectedDateRange, setSelectedDateRange] = useState('24h')
  const [isExporting, setIsExporting] = useState(false)

  const exportData = async (format: 'csv' | 'json') => {
    setIsExporting(true)
    try {
      const res = await fetch(`/api/cluster/metrics/export?format=${format}&range=${selectedDateRange}`)
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `cluster-metrics-${new Date().toISOString().slice(0, 10)}.${format}`
        a.click()
        window.URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  const reports = [
    {
      title: 'Cluster Health Report',
      description: 'PDF report of cluster health over selected period',
      icon: '📊',
      format: 'PDF',
      action: () => {},
      disabled: true,
      disabledReason: 'PDF report generation requires server-side rendering support (not yet available)',
    },
    {
      title: 'Metrics Export',
      description: 'CSV format for spreadsheet analysis',
      icon: '📈',
      format: 'CSV',
      action: () => exportData('csv'),
    },
    {
      title: 'Event Log Archive',
      description: 'JSON export of all events in time range',
      icon: '📋',
      format: 'JSON',
      action: () => exportData('json'),
    },
    {
      title: 'Service Uptime Report',
      description: 'Service availability and SLA metrics',
      icon: '⏱️',
      format: 'HTML',
      action: () => {},
      disabled: true,
      disabledReason: 'Uptime SLA report requires backend metrics aggregation (not yet available)',
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
          Export cluster data and generate reports for analysis and record-keeping.
        </div>
      </div>

      {/* Time Range Selector */}
      <div
        style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: 8,
          padding: '16px',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: '#d0d0d0' }}>
          <Funnel size={14} weight="duotone" style={{ display: 'inline', marginRight: 6 }} />
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
                transition: 'all 0.2s',
              }}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Report Cards */}
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
              {(report as any).disabled && (
                <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 6, fontStyle: 'italic' }}>
                  ⚠ {(report as any).disabledReason}
                </div>
              )}
            </div>
            <button
              onClick={report.action}
              disabled={isExporting || (report as any).disabled}
              style={{
                padding: '10px 14px',
                background: (report as any).disabled ? '#333' : '#2563eb',
                color: (report as any).disabled ? '#666' : '#000',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: isExporting || (report as any).disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                opacity: isExporting || (report as any).disabled ? 0.6 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              <DownloadSimple size={14} weight="duotone" />
              {isExporting ? 'Exporting...' : (report as any).disabled ? 'Not Available' : `Export ${report.format}`}
            </button>
          </div>
        ))}
      </div>

      {/* Historical Analysis */}
      <div
        style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: 8,
          padding: '20px',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#d0d0d0' }}>
          <ChartBar size={16} weight="duotone" style={{ display: 'inline', marginRight: 6 }} />
          Analysis Features
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {[
            { title: 'Event Trends', desc: 'Events over time' },
            { title: 'Service Availability', desc: 'Uptime per service' },
            { title: 'Resource Utilization', desc: 'CPU/Memory trends' },
            { title: 'DSP Load Analysis', desc: 'Audio processing trends' },
            { title: 'Network Latency', desc: 'Inter-node latency' },
            { title: 'XRUN Analysis', desc: 'Audio dropout tracking' },
          ].map((feature, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid #333',
                borderRadius: 6,
                padding: '12px',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: '#d0d0d0', marginBottom: 4 }}>
                ✓ {feature.title}
              </div>
              <div style={{ fontSize: 11, color: '#a0a0a0' }}>{feature.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scheduled Reports */}
      <div
        style={{
          background: 'rgba(37, 99, 235, 0.1)',
          border: '1px solid #2563eb',
          borderRadius: 8,
          padding: '16px',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', marginBottom: 8 }}>
          📧 Scheduled Reports
        </div>
        <div style={{ fontSize: 12, color: '#d0d0d0', lineHeight: 1.6 }}>
          Set up automatic daily/weekly reports emailed to your team. Configure in cluster settings.
        </div>
      </div>
    </div>
  )
}
