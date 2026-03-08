import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowsClockwise, Lightning, Pulse } from '@phosphor-icons/react'

import { mpx1Api, type MPX1Diagnostics, type MPX1MidiPorts } from '../../map2/mpx1Api'
import { useMPX1PageContext } from './MPX1Page'
import './MPX1DiagView.css'

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

export function MPX1DiagView() {
  const { mpx1, setLcdText } = useMPX1PageContext()

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
        mpx1Api.getDiagnostics(100),
        mpx1Api.getMidiPorts(),
      ])
      setDiagnostics(diag)
      setPorts(portData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsRefreshing(false)
    }
  }, [])

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
    const event = mpx1.lastEvent
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
  }, [dumpJobId, mpx1.lastEvent])

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
    const response = await mpx1Api.pingDiagnostics()
    setLatencySamples((prev) => [...prev, response.latency_ms].slice(-100))
    setLcdText(`PING ${response.latency_ms.toFixed(2)}ms`)
  }

  const handleReconnect = async () => {
    await mpx1Api.disconnectMidi()
    await mpx1Api.connectMidi({})
    await refreshDiagnostics()
    setLcdText('MIDI RECONNECTED')
  }

  const handleForceResync = async () => {
    const response = await mpx1Api.dumpAll()
    setDumpJobId(response.job_id)
    setDumpProgress(0)
    setLcdText('RESYNC STARTED')
  }

  return (
    <div className="mpx1-diag">
      <header className="mpx1-diag__header">
        <button type="button" onClick={() => void refreshDiagnostics()}>
          <ArrowsClockwise size={14} weight="bold" /> Refresh
        </button>
        <button type="button" onClick={() => void handlePing()}>
          <Pulse size={14} weight="bold" /> Ping
        </button>
        <button type="button" onClick={() => void handleReconnect()}>
          <ArrowsClockwise size={14} weight="bold" /> Reconnect
        </button>
        <button type="button" onClick={() => void handleForceResync()}>
          <Lightning size={14} weight="bold" /> Force Resync
        </button>
      </header>

      {error && <div className="mpx1-diag__error">{error}</div>}

      <section className="mpx1-diag__metrics">
        <article className="mpx1-diag__card">
          <h3>Round-Trip Latency (ms)</h3>
          <div className="mpx1-diag__stat-grid">
            <div><span>Min</span><strong>{latencyStats.min.toFixed(2)}</strong></div>
            <div><span>Avg</span><strong>{latencyStats.avg.toFixed(2)}</strong></div>
            <div><span>Max</span><strong>{latencyStats.max.toFixed(2)}</strong></div>
            <div><span>P99</span><strong>{latencyStats.p99.toFixed(2)}</strong></div>
          </div>
        </article>

        <article className="mpx1-diag__card">
          <h3>Connection Health</h3>
          <div className="mpx1-diag__health-row">
            <span>Connected:</span>
            <strong>{mpx1.state?.connected ? 'Yes' : 'No'}</strong>
          </div>
          <div className="mpx1-diag__health-row">
            <span>Packet Errors:</span>
            <strong>{diagnostics?.packet_error_count ?? 0}</strong>
          </div>
          <div className="mpx1-diag__health-row">
            <span>Last Heartbeat:</span>
            <strong>{diagnostics?.last_heartbeat ? new Date(diagnostics.last_heartbeat * 1000).toLocaleTimeString() : '--'}</strong>
          </div>
          <div className="mpx1-diag__health-row">
            <span>Input Port:</span>
            <strong>{ports?.inputs.find((port) => port.connected)?.name ?? 'None'}</strong>
          </div>
          <div className="mpx1-diag__health-row">
            <span>Output Port:</span>
            <strong>{ports?.outputs.find((port) => port.connected)?.name ?? 'None'}</strong>
          </div>
        </article>

        <article className="mpx1-diag__card">
          <h3>Force Resync</h3>
          <div className="mpx1-diag__resync-track">
            <span style={{ width: `${Math.max(0, Math.min(100, dumpProgress))}%` }} />
          </div>
          <div className="mpx1-diag__health-row">
            <span>Dump Job:</span>
            <strong>{dumpJobId ?? 'idle'}</strong>
          </div>
          <div className="mpx1-diag__health-row">
            <span>Progress:</span>
            <strong>{Math.round(dumpProgress)}%</strong>
          </div>
        </article>
      </section>

      <section className="mpx1-diag__traffic">
        <h3>MIDI/SysEx Traffic (last 100)</h3>
        <div className="mpx1-diag__traffic-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Hex</th>
                <th>Decoded</th>
              </tr>
            </thead>
            <tbody>
              {trafficRows.slice(-100).reverse().map((row, index) => (
                <tr key={`${row.timestamp}-${index}`}>
                  <td>{new Date(row.timestamp * 1000).toLocaleTimeString()}</td>
                  <td>{row.type}</td>
                  <td>{row.hex || '-'}</td>
                  <td>{typeof row.param_id === 'string' ? `${row.param_id} = ${row.value ?? ''}` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isRefreshing && trafficRows.length === 0 && (
            <div className="mpx1-diag__empty">No traffic captured yet.</div>
          )}
        </div>
      </section>
    </div>
  )
}
