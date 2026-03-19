/**
 * useExportData Hook - Export metrics and alerts to CSV and PDF formats
 * Supports filtering by date range and metric type
 */

import { useCallback } from 'react'
import type { HistoricalMetric } from '@/app/hooks/useHealthMonitoring'
import type { StoredAlert } from '@/app/hooks/useLocalStorage'

export interface ExportOptions {
  startDate?: Date
  endDate?: Date
  format: 'csv' | 'pdf'
  includeMetrics?: boolean
  includeAlerts?: boolean
  filename?: string
}

/**
 * Convert data to CSV format
 */
export function dataToCSV(
  metrics: HistoricalMetric[],
  alerts: StoredAlert[],
  options: Omit<ExportOptions, 'format' | 'filename'>
): string {
  const { startDate, endDate, includeMetrics = true, includeAlerts = true } = options

  let csv = ''

  // Filter data by date range
  const filterByDate = (timestamp: number) => {
    if (startDate && timestamp < startDate.getTime()) return false
    if (endDate && timestamp > endDate.getTime()) return false
    return true
  }

  // Export metrics
  if (includeMetrics && metrics.length > 0) {
    const filteredMetrics = metrics.filter((m) => filterByDate(m.timestamp))

    if (filteredMetrics.length > 0) {
      csv += 'HISTORICAL METRICS\n'
      csv += 'Timestamp,Temperature (°C),CPU Usage (%),Memory Usage (%)\n'

      filteredMetrics.forEach((metric) => {
        const timestamp = new Date(metric.timestamp).toISOString()
        csv += `${timestamp},${metric.cpuTemp.toFixed(1)},${metric.cpuUsage.toFixed(1)},${metric.memoryUsage.toFixed(1)}\n`
      })

      csv += '\n\n'
    }
  }

  // Export alerts
  if (includeAlerts && alerts.length > 0) {
    const filteredAlerts = alerts.filter((a) => filterByDate(a.timestamp))

    if (filteredAlerts.length > 0) {
      csv += 'ALERT HISTORY\n'
      csv += 'Timestamp,Type,Severity,Value,Threshold,Acknowledged\n'

      filteredAlerts.forEach((alert) => {
        const timestamp = new Date(alert.timestamp).toISOString()
        csv += `${timestamp},${alert.type},${alert.severity},${alert.value},${alert.threshold},${alert.acknowledged}\n`
      })
    }
  }

  return csv
}

/**
 * Generate HTML for PDF export
 */
export function generatePDFHTML(
  metrics: HistoricalMetric[],
  alerts: StoredAlert[],
  options: Omit<ExportOptions, 'format' | 'filename'>
): string {
  const { startDate, endDate, includeMetrics = true, includeAlerts = true } = options

  const filterByDate = (timestamp: number) => {
    if (startDate && timestamp < startDate.getTime()) return false
    if (endDate && timestamp > endDate.getTime()) return false
    return true
  }

  const filteredMetrics = includeMetrics ? metrics.filter((m) => filterByDate(m.timestamp)) : []
  const filteredAlerts = includeAlerts ? alerts.filter((a) => filterByDate(a.timestamp)) : []

  const metricsStats = filteredMetrics.length > 0 ? {
    tempMin: Math.min(...filteredMetrics.map((m) => m.cpuTemp)),
    tempMax: Math.max(...filteredMetrics.map((m) => m.cpuTemp)),
    tempAvg: filteredMetrics.reduce((sum, m) => sum + m.cpuTemp, 0) / filteredMetrics.length,
    cpuMin: Math.min(...filteredMetrics.map((m) => m.cpuUsage)),
    cpuMax: Math.max(...filteredMetrics.map((m) => m.cpuUsage)),
    cpuAvg: filteredMetrics.reduce((sum, m) => sum + m.cpuUsage, 0) / filteredMetrics.length,
    memMin: Math.min(...filteredMetrics.map((m) => m.memoryUsage)),
    memMax: Math.max(...filteredMetrics.map((m) => m.memoryUsage)),
    memAvg: filteredMetrics.reduce((sum, m) => sum + m.memoryUsage, 0) / filteredMetrics.length,
  } : null

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Host Machine Monitoring Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
    h1 { color: #1f2937; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
    h2 { color: #374151; margin-top: 30px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background-color: #3b82f6; color: white; padding: 12px; text-align: left; }
    td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
    tr:hover { background-color: #f9fafb; }
    .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0; }
    .stat-box { background: #f3f4f6; padding: 15px; border-radius: 8px; }
    .stat-label { font-size: 12px; color: #666; font-weight: 600; }
    .stat-value { font-size: 24px; font-weight: 700; color: #3b82f6; }
    .warning { background-color: #fef3c7; }
    .critical { background-color: #fee2e2; }
    .footer { margin-top: 40px; font-size: 12px; color: #999; border-top: 1px solid #e5e7eb; padding-top: 20px; }
  </style>
</head>
<body>
  <h1>Host Machine Monitoring Report</h1>
  <p>Generated: ${new Date().toLocaleString()}</p>
  ${startDate ? `<p>Period: ${startDate.toLocaleDateString()} to ${endDate?.toLocaleDateString() || 'now'}</p>` : ''}

  ${includeMetrics && metricsStats ? `
    <h2>Metrics Summary</h2>
    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-label">Temperature (°C)</div>
        <div>Min: <span class="stat-value">${metricsStats.tempMin.toFixed(1)}</span></div>
        <div>Max: <span class="stat-value">${metricsStats.tempMax.toFixed(1)}</span></div>
        <div>Avg: <span class="stat-value">${metricsStats.tempAvg.toFixed(1)}</span></div>
      </div>
      <div class="stat-box">
        <div class="stat-label">CPU Usage (%)</div>
        <div>Min: <span class="stat-value">${metricsStats.cpuMin.toFixed(1)}</span></div>
        <div>Max: <span class="stat-value">${metricsStats.cpuMax.toFixed(1)}</span></div>
        <div>Avg: <span class="stat-value">${metricsStats.cpuAvg.toFixed(1)}</span></div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Memory Usage (%)</div>
        <div>Min: <span class="stat-value">${metricsStats.memMin.toFixed(1)}</span></div>
        <div>Max: <span class="stat-value">${metricsStats.memMax.toFixed(1)}</span></div>
        <div>Avg: <span class="stat-value">${metricsStats.memAvg.toFixed(1)}</span></div>
      </div>
    </div>

    <h2>Detailed Metrics (Last 50)</h2>
    <table>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Temperature (°C)</th>
          <th>CPU Usage (%)</th>
          <th>Memory Usage (%)</th>
        </tr>
      </thead>
      <tbody>
        ${filteredMetrics.slice(-50).map((m) => `
          <tr>
            <td>${new Date(m.timestamp).toLocaleString()}</td>
            <td>${m.cpuTemp.toFixed(1)}</td>
            <td>${m.cpuUsage.toFixed(1)}</td>
            <td>${m.memoryUsage.toFixed(1)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : ''}

  ${includeAlerts && filteredAlerts.length > 0 ? `
    <h2>Alert History</h2>
    <p>Total Alerts: ${filteredAlerts.length}</p>
    <table>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Type</th>
          <th>Severity</th>
          <th>Value</th>
          <th>Threshold</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${filteredAlerts.map((a) => `
          <tr class="${a.severity === 'critical' ? 'critical' : 'warning'}">
            <td>${new Date(a.timestamp).toLocaleString()}</td>
            <td>${a.type}</td>
            <td>${a.severity}</td>
            <td>${a.value}</td>
            <td>${a.threshold}</td>
            <td>${a.acknowledged ? 'Acknowledged' : 'Pending'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : ''}

  <div class="footer">
    <p>This report was automatically generated by the Host Machine Monitoring System.</p>
    <p>For more information, visit the dashboard.</p>
  </div>
</body>
</html>
  `
}

/**
 * Hook for exporting metrics and alerts
 */
export function useExportData() {
  const downloadFile = useCallback((content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [])

  const exportMetricsAndAlerts = useCallback(
    (metrics: HistoricalMetric[], alerts: StoredAlert[], options: ExportOptions) => {
      const timestamp = new Date().toISOString().split('T')[0]
      const filename = options.filename || `host-machine-${timestamp}.${options.format}`

      if (options.format === 'csv') {
        const csv = dataToCSV(metrics, alerts, options)
        downloadFile(csv, filename, 'text/csv')
      } else if (options.format === 'pdf') {
        const html = generatePDFHTML(metrics, alerts, options)
        // Note: PDF generation requires a library like pdfkit or html2pdf
        // For now, we'll provide HTML that can be printed to PDF
        const blob = new Blob([html], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        const printWindow = window.open(url)
        if (printWindow) {
          printWindow.print()
        }
      }
    },
    [downloadFile]
  )

  const exportMetricsOnly = useCallback(
    (metrics: HistoricalMetric[], options: Omit<ExportOptions, 'includeAlerts'>) => {
      exportMetricsAndAlerts(metrics, [], { ...options, includeAlerts: false, includeMetrics: true })
    },
    [exportMetricsAndAlerts]
  )

  const exportAlertsOnly = useCallback(
    (alerts: StoredAlert[], options: Omit<ExportOptions, 'includeMetrics'>) => {
      exportMetricsAndAlerts([], alerts, { ...options, includeMetrics: false, includeAlerts: true })
    },
    [exportMetricsAndAlerts]
  )

  return {
    exportMetricsAndAlerts,
    exportMetricsOnly,
    exportAlertsOnly,
    dataToCSV,
    generatePDFHTML,
  }
}
