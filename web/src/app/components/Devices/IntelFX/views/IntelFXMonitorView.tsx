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

import { useIntelFXPageContext } from '../IntelFXShell'
import {
  intelfxApi,
  type IntelFXDiagnostics,
  type IntelFXHealth,
  type IntelFXMidiPorts,
  type IntelFXState,
  type IntelFXTrafficEvent,
} from '../../../../../map2/intelfxApi'
import { EmptyState } from '../../../shared/EmptyState'
import './IntelFXMonitorView.css'

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

export function IntelFXMonitorView() {
  const { intelfx, nodeId, setLcdText } = useIntelFXPageContext()

  const [diagnostics, setDiagnostics] = useState<IntelFXDiagnostics | null>(null)
  const [ports, setPorts] = useState<IntelFXMidiPorts | null>(null)
  const [stateSnapshot, setStateSnapshot] = useState<IntelFXState | null>(null)
  const [health, setHealth] = useState<IntelFXHealth | null>(null)
  const [latencySamples, setLatencySamples] = useState<number[]>([])
  const [dumpProgress, setDumpProgress] = useState(0)
  const [dumpJobId, setDumpJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [simulatorActive, setSimulatorActive] = useState(false)

  const refreshDiagnostics = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const [diag, portData, stateData, healthData] = await Promise.all([
        intelfxApi.getDiagnostics(100, nodeId),
        intelfxApi.getMidiPorts(nodeId),
        intelfxApi.getState(nodeId),
        intelfxApi.getHealth(nodeId),
      ])
      setDiagnostics(diag)
      setPorts(portData)
      setStateSnapshot(stateData)
      setHealth(healthData)
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
    }, 2000)
    return () => window.clearInterval(timer)
  }, [refreshDiagnostics])

  useEffect(() => {
    const event = intelfx.lastEvent
    if (!event) return

    if (event.type === 'intelfx:dump_progress' && event.data && typeof event.data === 'object') {
      const data = event.data as Record<string, unknown>
      if (dumpJobId && String(data.job_id ?? '') === dumpJobId) {
        setDumpProgress(Number(data.progress ?? 0))
      }
    }

    if (event.type === 'intelfx:dump_completed' && event.data && typeof event.data === 'object') {
      const data = event.data as Record<string, unknown>
      if (dumpJobId && String(data.job_id ?? '') === dumpJobId) {
        setDumpProgress(100)
      }
    }

    if (event.type === 'intelfx:midi_connected' && event.data && typeof event.data === 'object') {
      const data = event.data as Record<string, unknown>
      if (typeof data.simulator === 'boolean') {
        setSimulatorActive(data.simulator)
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

  const lastTraffic = useMemo<IntelFXTrafficEvent | null>(() => {
    if (trafficRows.length === 0) return null
    return trafficRows[trafficRows.length - 1]
  }, [trafficRows])

  const lastSysex = useMemo(() => {
    for (let i = trafficRows.length - 1; i >= 0; i -= 1) {
      const row = trafficRows[i]
      if (row?.hex) return row
    }
    return null
  }, [trafficRows])

  const errorLog = useMemo(() => {
    const errors = trafficRows.filter((row) => Boolean(row.error) || String(row.type).includes('error'))
    return errors.slice(-6).reverse()
  }, [trafficRows])

  const handlePing = async () => {
    const response = await intelfxApi.pingDiagnostics(nodeId)
    setLatencySamples((previous) => [...previous, response.latency_ms].slice(-100))
    setLcdText(`PING ${response.latency_ms.toFixed(2)}ms`)
  }

  const handleReconnect = async () => {
    await intelfxApi.disconnectMidi(nodeId)
    await intelfxApi.connectMidi({}, nodeId)
    await refreshDiagnostics()
    setLcdText('MIDI RECONNECTED')
  }

  const handleForceResync = async () => {
    const response = await intelfxApi.dumpAll(nodeId)
    setDumpJobId(response.job_id)
    setDumpProgress(0)
    setLcdText('RESYNC STARTED')
  }

  const boundedDumpProgress = Math.max(0, Math.min(100, dumpProgress))
  const simulatorLabel = stateSnapshot?.simulator || simulatorActive || ports?.rtmidi_available === false ? 'Active' : 'Inactive'
  const firmwareLabel = 'Unknown'
  const shadowCount = stateSnapshot?.shadow_state_count ?? (intelfx.shadow ? Object.keys(intelfx.shadow).length : 0)
  const shadowPayload = useMemo(() => JSON.stringify(intelfx.shadow ?? {}, null, 2), [intelfx.shadow])

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
              <span className="intelfx-monitor-page__stat-label">Firmware</span>
              <strong className="intelfx-monitor-page__stat-value">{firmwareLabel}</strong>
            </div>
            <div className="intelfx-monitor-page__stat-row">
              <span className="intelfx-monitor-page__stat-label">Simulator</span>
              <Tag type={simulatorLabel === 'Active' ? 'purple' : 'gray'}>{simulatorLabel}</Tag>
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
          <h3 className="intelfx-monitor-page__metric-title">State & sync</h3>
          <div className="intelfx-monitor-page__stats-list">
            <div className="intelfx-monitor-page__stat-row">
              <span className="intelfx-monitor-page__stat-label">Shadow params</span>
              <strong className="intelfx-monitor-page__stat-value">{shadowCount}</strong>
            </div>
            <div className="intelfx-monitor-page__stat-row">
              <span className="intelfx-monitor-page__stat-label">Pending realtime</span>
              <strong className="intelfx-monitor-page__stat-value">{stateSnapshot?.pending_realtime_updates ?? 0}</strong>
            </div>
            <div className="intelfx-monitor-page__stat-row">
              <span className="intelfx-monitor-page__stat-label">Drift status</span>
              <Tag type={stateSnapshot?.drift_status === 'clean' ? 'green' : 'warm-gray'}>{stateSnapshot?.drift_status ?? 'unknown'}</Tag>
            </div>
            <div className="intelfx-monitor-page__stat-row">
              <span className="intelfx-monitor-page__stat-label">Verify pass/fail</span>
              <strong className="intelfx-monitor-page__stat-value">{stateSnapshot?.verify_pass ?? 0}/{stateSnapshot?.verify_fail ?? 0}</strong>
            </div>
            <div className="intelfx-monitor-page__stat-row">
              <span className="intelfx-monitor-page__stat-label">Pending readbacks</span>
              <strong className="intelfx-monitor-page__stat-value">{stateSnapshot?.pending_readbacks ?? 0}</strong>
            </div>
            <div className="intelfx-monitor-page__stat-row">
              <span className="intelfx-monitor-page__stat-label">Writer lock</span>
              <strong className="intelfx-monitor-page__stat-value">{stateSnapshot?.writer_client_id ?? 'None'}</strong>
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
          <div className="intelfx-monitor-page__stat-row">
            <span className="intelfx-monitor-page__stat-label">Active dumps</span>
            <strong className="intelfx-monitor-page__stat-value">{health?.active_dump_jobs?.length ?? 0}</strong>
          </div>
        </section>
      </div>

      <section className="intelfx-monitor-page__traffic-card">
        <div className="intelfx-monitor-page__traffic-header">
          <div>
            <h3 className="intelfx-monitor-page__traffic-title">MIDI/SysEx traffic (last 100)</h3>
            <p className="intelfx-monitor-page__traffic-meta">
              Last event: {lastTraffic ? `${lastTraffic.type} @ ${new Date(lastTraffic.timestamp * 1000).toLocaleTimeString()}` : 'None'}
            </p>
          </div>
          <div className="intelfx-monitor-page__traffic-last">
            <span className="intelfx-monitor-page__stat-label">Last SysEx</span>
            <span className="intelfx-monitor-page__mono">{lastSysex?.hex || '—'}</span>
          </div>
        </div>
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
          <EmptyState
            className="intelfx-monitor-page__empty"
            title="No traffic captured yet"
            description="Send or receive MIDI traffic to populate the diagnostic log."
            compact
            align="left"
          />
        ) : null}
      </section>

      <section className="intelfx-monitor-page__log-card">
        <h3 className="intelfx-monitor-page__log-title">Error log</h3>
        {errorLog.length === 0 ? (
          <EmptyState
            className="intelfx-monitor-page__empty"
            title="No errors recorded"
            description="The diagnostic log has not captured any IntelFX errors yet."
            compact
            align="left"
          />
        ) : (
          <ul className="intelfx-monitor-page__log-list">
            {errorLog.map((row, index) => {
              const errorText = row && (row as Record<string, unknown>).error
              const formatted = typeof errorText === 'string' ? errorText : errorText ? String(errorText) : '-'
              return (
                <li key={`err-${row.timestamp}-${index}`}>
                  <span className="intelfx-monitor-page__mono">{new Date(row.timestamp * 1000).toLocaleTimeString()}</span>
                  <span>{row.type}</span>
                  <span className="intelfx-monitor-page__mono">{formatted}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="intelfx-monitor-page__shadow-card">
        <h3 className="intelfx-monitor-page__log-title">Shadow state JSON</h3>
        <pre className="intelfx-monitor-page__shadow-json">{shadowPayload}</pre>
      </section>
    </div>
  )
}

export default IntelFXMonitorView
