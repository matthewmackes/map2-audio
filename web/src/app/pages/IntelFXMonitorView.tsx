/**
 * IntelFXMonitorView - Diagnostics view for IntelFX MIDI communication.
 *
 * Features:
 * - Round-trip latency stats (ping)
 * - Connection health metrics
 * - MIDI traffic log (last 100 events)
 * - Reconnect and force-resync controls
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Flash, Renew } from '@carbon/icons-react'
import {
  Button,
  InlineNotification,
  Layer,
  ProgressBar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@carbon/react'

import { useIntelFXPageContext } from './IntelFXPage'
import { mpx1Api, type MPX1Diagnostics, type MPX1MidiPorts } from '../../map2/mpx1Api'
import './IntelFXMonitorView.css'

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

export function IntelFXMonitorView() {
  const { intelfx, nodeId, setLcdText } = useIntelFXPageContext()

  const [diagnostics, setDiagnostics] = useState<MPX1Diagnostics | null>(null)
  const [ports, setPorts] = useState<MPX1MidiPorts | null>(null)
  const [latencySamples, setLatencySamples] = useState<number[]>([])
  const [dumpProgress, setDumpProgress] = useState(0)
  const [dumpJobId, setDumpJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const refreshDiagnostics = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const [diag, portData] = await Promise.all([
        mpx1Api.getDiagnostics(100, nodeId),
        mpx1Api.getMidiPorts(nodeId),
      ])
      setDiagnostics(diag)
      setPorts(portData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsRefreshing(false)
    }
  }, [nodeId])

  useEffect(() => {
    void refreshDiagnostics()
  }, [refreshDiagnostics])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshDiagnostics()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [refreshDiagnostics])

  useEffect(() => {
    const event = intelfx.lastEvent
    if (!event) return

    if (event.type === 'mpx1:dump_progress' && event.data && typeof event.data === 'object') {
      const data = event.data as Record<string, unknown>
      if (dumpJobId && String(data.job_id ?? '') === dumpJobId) {
        setDumpProgress(Number(data.progress ?? 0))
      }
    }

    if (event.type === 'mpx1:dump_completed' && event.data && typeof event.data === 'object') {
      const data = event.data as Record<string, unknown>
      if (dumpJobId && String(data.job_id ?? '') === dumpJobId) {
        setDumpProgress(100)
      }
    }
  }, [dumpJobId, intelfx.lastEvent])

  const latencyStats = useMemo(() => {
    if (latencySamples.length === 0) {
      return { min: 0, avg: 0, max: 0, p99: 0 }
    }
    const min = Math.min(...latencySamples)
    const max = Math.max(...latencySamples)
    const avg = latencySamples.reduce((sum, value) => sum + value, 0) / latencySamples.length
    const p99 = percentile(latencySamples, 99)
    return { min, avg, max, p99 }
  }, [latencySamples])

  const trafficRows = diagnostics?.traffic ?? []

  const handlePing = async () => {
    const response = await mpx1Api.pingDiagnostics(nodeId)
    setLatencySamples((previous) => [...previous, response.latency_ms].slice(-100))
    setLcdText(`PING ${response.latency_ms.toFixed(2)}ms`)
  }

  const handleReconnect = async () => {
    await mpx1Api.disconnectMidi(nodeId)
    await mpx1Api.connectMidi({}, nodeId)
    await refreshDiagnostics()
    setLcdText('MIDI RECONNECTED')
  }

  const handleForceResync = async () => {
    const response = await mpx1Api.dumpAll(nodeId)
    setDumpJobId(response.job_id)
    setDumpProgress(0)
    setLcdText('RESYNC STARTED')
  }

  const boundedDumpProgress = Math.max(0, Math.min(100, dumpProgress))

  return (
    <div className="intelfx-monitor-page">
      <Layer className="intelfx-monitor-page__hero">
        <div className="intelfx-monitor-page__hero-title-row">
          <Flash size={24} aria-hidden="true" className="intelfx-monitor-page__hero-icon" />
          <div>
            <h2 className="intelfx-monitor-page__title">Diagnostics monitor</h2>
            <p className="intelfx-monitor-page__subtitle">Monitor MIDI traffic, latency, and connection health in real time.</p>
          </div>
        </div>
      </Layer>

      <div className="intelfx-monitor-page__actions">
        <Button size="sm" kind="tertiary" renderIcon={Renew} onClick={() => void refreshDiagnostics()} disabled={isRefreshing}>
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
        <Button size="sm" kind="tertiary" onClick={() => void handlePing()}>
          Ping
        </Button>
        <Button size="sm" kind="tertiary" onClick={() => void handleReconnect()}>
          Reconnect
        </Button>
        <Button size="sm" kind="tertiary" renderIcon={Flash} onClick={() => void handleForceResync()}>
          Force resync
        </Button>
      </div>

      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Diagnostics error"
          subtitle={error}
          className="intelfx-monitor-page__error"
        />
      ) : null}

      <div className="intelfx-monitor-page__metrics-grid">
        <section className="intelfx-monitor-page__metric-card">
          <h3 className="intelfx-monitor-page__metric-title">Round-trip latency (ms)</h3>
          <div className="intelfx-monitor-page__stats-grid">
            <div className="intelfx-monitor-page__stat-row">
              <span className="intelfx-monitor-page__stat-label">Min</span>
              <strong className="intelfx-monitor-page__stat-value">{latencyStats.min.toFixed(2)}</strong>
            </div>
            <div className="intelfx-monitor-page__stat-row">
              <span className="intelfx-monitor-page__stat-label">Avg</span>
              <strong className="intelfx-monitor-page__stat-value">{latencyStats.avg.toFixed(2)}</strong>
            </div>
            <div className="intelfx-monitor-page__stat-row">
              <span className="intelfx-monitor-page__stat-label">Max</span>
              <strong className="intelfx-monitor-page__stat-value">{latencyStats.max.toFixed(2)}</strong>
            </div>
            <div className="intelfx-monitor-page__stat-row">
              <span className="intelfx-monitor-page__stat-label">P99</span>
              <strong className="intelfx-monitor-page__stat-value">{latencyStats.p99.toFixed(2)}</strong>
            </div>
          </div>
        </section>

        <section className="intelfx-monitor-page__metric-card">
          <h3 className="intelfx-monitor-page__metric-title">Connection health</h3>
          <div className="intelfx-monitor-page__stats-list">
            <div className="intelfx-monitor-page__stat-row">
              <span className="intelfx-monitor-page__stat-label">Connected</span>
              <Tag type={intelfx.state?.connected ? 'green' : 'red'}>{intelfx.state?.connected ? 'Yes' : 'No'}</Tag>
            </div>
            <div className="intelfx-monitor-page__stat-row">
              <span className="intelfx-monitor-page__stat-label">Packet errors</span>
              <strong className="intelfx-monitor-page__stat-value">{diagnostics?.packet_error_count ?? 0}</strong>
            </div>
            <div className="intelfx-monitor-page__stat-row">
              <span className="intelfx-monitor-page__stat-label">Last heartbeat</span>
              <strong className="intelfx-monitor-page__stat-value">
                {diagnostics?.last_heartbeat ? new Date(diagnostics.last_heartbeat * 1000).toLocaleTimeString() : '--'}
              </strong>
            </div>
            <div className="intelfx-monitor-page__stat-row">
              <span className="intelfx-monitor-page__stat-label">Input port</span>
              <strong className="intelfx-monitor-page__stat-value">{ports?.inputs.find((port) => port.connected)?.name ?? 'None'}</strong>
            </div>
            <div className="intelfx-monitor-page__stat-row">
              <span className="intelfx-monitor-page__stat-label">Output port</span>
              <strong className="intelfx-monitor-page__stat-value">{ports?.outputs.find((port) => port.connected)?.name ?? 'None'}</strong>
            </div>
          </div>
        </section>

        <section className="intelfx-monitor-page__metric-card">
          <h3 className="intelfx-monitor-page__metric-title">Force resync</h3>
          <ProgressBar
            label="Dump progress"
            helperText={dumpJobId ? `Job ${dumpJobId}` : 'No active dump job'}
            value={boundedDumpProgress}
            max={100}
            className="intelfx-monitor-page__progress"
          />
          <div className="intelfx-monitor-page__stat-row">
            <span className="intelfx-monitor-page__stat-label">Progress</span>
            <strong className="intelfx-monitor-page__stat-value">{Math.round(boundedDumpProgress)}%</strong>
          </div>
        </section>
      </div>

      <section className="intelfx-monitor-page__traffic-card">
        <h3 className="intelfx-monitor-page__traffic-title">MIDI/SysEx traffic (last 100)</h3>
        <div className="intelfx-monitor-page__traffic-table-wrap">
          <Table size="sm" className="intelfx-monitor-page__traffic-table">
            <TableHead>
              <TableRow>
                <TableHeader>Time</TableHeader>
                <TableHeader>Type</TableHeader>
                <TableHeader>Hex</TableHeader>
                <TableHeader>Decoded</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {trafficRows.slice(-100).reverse().map((row, index) => (
                <TableRow key={`${row.timestamp}-${index}`}>
                  <TableCell>{new Date(row.timestamp * 1000).toLocaleTimeString()}</TableCell>
                  <TableCell>{row.type}</TableCell>
                  <TableCell className="intelfx-monitor-page__mono">{row.hex || '-'}</TableCell>
                  <TableCell className="intelfx-monitor-page__decoded-cell">
                    {typeof row.param_id === 'string' ? `${row.param_id} = ${row.value ?? ''}` : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!isRefreshing && trafficRows.length === 0 ? (
          <p className="intelfx-monitor-page__empty">No traffic captured yet.</p>
        ) : null}
      </section>
    </div>
  )
}

export default IntelFXMonitorView
