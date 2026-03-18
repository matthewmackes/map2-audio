import { useState, useEffect } from 'react'
import { CheckmarkFilled as CheckCircle, ErrorFilled as XCircle, Pause, Play, Renew as ArrowsClockwise, Reset as ArrowCounterClockwise, WarningAlt as Warning } from '@carbon/icons-react'

interface UpdateStage {
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
}

interface NodeProgress {
  node_id: string
  status: 'idle' | 'running' | 'success' | 'failed' | 'rollback'
  current_stage: string
  progress_percent: number
  error?: string
  stages: UpdateStage[]
}

const STAGE_NAMES = ['Validation', 'Download', 'Install', 'Restart', 'Verify']

export function UpdateProgressViewer({ updateId }: { updateId?: string }) {
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [nodeProgress, setNodeProgress] = useState<NodeProgress[]>([])
  const [logs, setLogs] = useState<Array<{ time: string; message: string; severity: string }>>([])
  const [stats, setStats] = useState({ total: 0, completed: 0, failed: 0 })

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/cluster/update/status')
        if (!response.ok) throw new Error('Failed to fetch status')
        const data = await response.json()

        const nodes: NodeProgress[] = (data.nodes || []).map((node: any) => ({
          node_id: node.node_id || 'unknown',
          status: node.status || 'idle',
          current_stage: node.current_stage || '',
          progress_percent: node.progress_percent || 0,
          error: node.error,
          stages:
            node.stages ||
            STAGE_NAMES.map(name => ({ name, status: 'pending' as const, progress: 0 })),
        }))

        setNodeProgress(nodes)
        setStats({
          total: nodes.length,
          completed: nodes.filter(n => n.status === 'success').length,
          failed: nodes.filter(n => n.status === 'failed').length,
        })

        addLog('Status refreshed', 'info')
      } catch (e: any) {
        addLog(`Failed to fetch status: ${e.message}`, 'error')
      }
    }

    const addLog = (message: string, severity: string) => {
      const now = new Date()
      const time = now.toLocaleTimeString('en-US', { hour12: false })
      setLogs(prev => [{ time, message, severity }, ...prev].slice(0, 100))
    }

    fetchStatus()

    if (autoRefresh) {
      const interval = setInterval(fetchStatus, 5000)
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  const handleRollback = async () => {
    if (!confirm('Are you sure you want to rollback this update?')) return

    try {
      const response = await fetch('/api/cluster/update/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'User-triggered rollback', force: false }),
      })

      if (!response.ok) throw new Error('Rollback failed')

      const result = await response.json()
      setLogs(prev => [
        { time: new Date().toLocaleTimeString(), message: `Rollback initiated: ${result.message || 'OK'}`, severity: 'success' },
        ...prev,
      ])
    } catch (e: any) {
      setLogs(prev => [
        { time: new Date().toLocaleTimeString(), message: `Rollback failed: ${e.message}`, severity: 'error' },
        ...prev,
      ])
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle size={16} style={{ color: '#00ff41' }} />
      case 'failed':
        return <XCircle size={16} style={{ color: '#ff3333' }} />
      case 'running':
        return <ArrowsClockwise size={16} style={{ color: '#2563eb' }} className="animate-spin" />
      default:
        return <Pause size={16} style={{ color: '#6b7280' }} />
    }
  }

  const getStageIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return '✅'
      case 'failed':
        return '❌'
      case 'running':
        return '⏳'
      default:
        return '⏸️'
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0a0a0a, #111111)',
          border: '2px solid #2563eb',
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Cluster Update Progress Monitor</h2>
        <div style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
          Update ID: {updateId || 'N/A'}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
          Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}
        </div>
      </div>

      {/* Statistics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
        }}
      >
        <div
          style={{
            padding: 16,
            background: 'rgba(37, 99, 235, 0.1)',
            border: '2px solid rgba(37, 99, 235, 0.5)',
            borderRadius: 8,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 700, color: '#2563eb' }}>{stats.total}</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Total Nodes</div>
        </div>

        <div
          style={{
            padding: 16,
            background: 'rgba(0, 255, 65, 0.1)',
            border: '2px solid rgba(0, 255, 65, 0.5)',
            borderRadius: 8,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 700, color: '#00ff41' }}>{stats.completed}</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Completed</div>
        </div>

        <div
          style={{
            padding: 16,
            background: 'rgba(255, 51, 51, 0.1)',
            border: '2px solid rgba(255, 51, 51, 0.5)',
            borderRadius: 8,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 700, color: '#ff3333' }}>{stats.failed}</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Failed</div>
        </div>

        <div
          style={{
            padding: 16,
            background: 'rgba(255, 255, 255, 0.05)',
            border: '2px solid #222222',
            borderRadius: 8,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Overall Progress</div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          <ArrowsClockwise size={16} /> Refresh Now
        </button>
        <button className="btn" onClick={() => setAutoRefresh(!autoRefresh)}>
          {autoRefresh ? <Pause size={16} /> : <Play size={16} />}
          {autoRefresh ? 'Pause' : 'Resume'} Auto-Refresh
        </button>
        <button className="btn btn-error" onClick={handleRollback}>
          <ArrowCounterClockwise size={16} /> Rollback
        </button>
      </div>

      {/* Node Progress */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Node Progress</h3>

        {nodeProgress.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              background: '#0a0a0a',
              border: '1px solid #222222',
              borderRadius: 8,
              color: '#6b7280',
            }}
          >
            No update in progress
          </div>
        ) : (
          nodeProgress.map(node => (
            <div
              key={node.node_id}
              style={{
                padding: 20,
                background: '#0a0a0a',
                border: `2px solid ${
                  node.status === 'failed'
                    ? '#ff3333'
                    : node.status === 'success'
                    ? '#00ff41'
                    : '#222222'
                }`,
                borderRadius: 12,
              }}
            >
              {/* Node Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {getStatusIcon(node.status)}
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{node.node_id}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                      Status: {node.status.toUpperCase()}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#2563eb' }}>
                    {node.progress_percent}%
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>Overall</div>
                </div>
              </div>

              {/* Current Stage */}
              <div style={{ marginBottom: 12, padding: 12, background: 'rgba(37, 99, 235, 0.05)', borderRadius: 6 }}>
                <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>
                  Current Stage: {node.current_stage || 'N/A'}
                </div>
              </div>

              {/* Stage Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {node.stages.map(stage => (
                  <div
                    key={stage.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 10,
                      background: 'rgba(255, 255, 255, 0.02)',
                      borderRadius: 6,
                      border: '1px solid #1e293b',
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{getStageIcon(stage.status)}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{stage.name}</div>
                      <div
                        style={{
                          marginTop: 6,
                          height: 6,
                          background: '#111',
                          borderRadius: 3,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${stage.progress}%`,
                            background:
                              stage.status === 'failed'
                                ? '#ff3333'
                                : stage.status === 'completed'
                                ? '#00ff41'
                                : '#2563eb',
                            transition: 'width 0.3s',
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', minWidth: 40, textAlign: 'right' }}>
                      {stage.progress}%
                    </div>
                  </div>
                ))}
              </div>

              {/* Error Message */}
              {node.error && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    background: 'rgba(255, 51, 51, 0.1)',
                    border: '2px solid #ff3333',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <Warning size={16} style={{ color: '#ff3333', marginTop: 2 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#ff3333', marginBottom: 4 }}>
                        ERROR
                      </div>
                      <div style={{ fontSize: 12, color: '#ff9999' }}>{node.error}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Event Log */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Event Log</h3>

        <div
          style={{
            padding: 16,
            background: '#111111',
            border: '1px solid #222222',
            borderRadius: 8,
            maxHeight: 300,
            overflowY: 'auto',
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: '#6b7280', textAlign: 'center', padding: 20 }}>No events yet</div>
          ) : (
            logs.map((log, idx) => (
              <div
                key={idx}
                style={{
                  padding: '8px 0',
                  borderBottom: idx < logs.length - 1 ? '1px solid #1e293b' : 'none',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span style={{ color: '#6b7280' }}>[{log.time}]</span>{' '}
                <span
                  style={{
                    color:
                      log.severity === 'error'
                        ? '#ff3333'
                        : log.severity === 'warning'
                        ? '#ffaa00'
                        : log.severity === 'success'
                        ? '#00ff41'
                        : '#2563eb',
                  }}
                >
                  {log.severity === 'error'
                    ? '❌'
                    : log.severity === 'warning'
                    ? '⚠️'
                    : log.severity === 'success'
                    ? '✅'
                    : 'ℹ️'}
                </span>{' '}
                <span>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
