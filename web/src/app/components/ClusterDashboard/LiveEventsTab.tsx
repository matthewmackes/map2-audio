import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { WarningAlt as WarningCircle, Information as Info, Flash as Lightning } from '@carbon/icons-react'
import { EmptyState } from '../shared/EmptyState'

interface LCDEvent {
  event_id: string
  timestamp: string
  source_node: string
  event_type: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  title: string
  message: string
  icon?: string
}

export function LiveEventsTab() {
  const [events, setEvents] = useState<LCDEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [filters, setFilters] = useState({
    severity: 'all' as string,
    type: 'all' as string,
  })
  const [paused, setPaused] = useState(false)

  const wsRef = React.useRef<WebSocket | null>(null)

  const connectWebSocket = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/lcd/ws/events`

    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      setIsConnected(true)
    }

    ws.onmessage = event => {
      if (paused) return

      try {
        const lcdEvent = JSON.parse(event.data)
        setEvents(prev => [lcdEvent, ...prev].slice(0, 200))
      } catch (e) {
        console.error('Failed to parse event:', e)
      }
    }

    ws.onerror = () => {
      setIsConnected(false)
    }

    ws.onclose = () => {
      setIsConnected(false)
      // Reconnect after delay
      setTimeout(connectWebSocket, 3000)
    }

    wsRef.current = ws
  }, [paused])

  useEffect(() => {
    connectWebSocket()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connectWebSocket])

  const filteredEvents = useMemo(() => {
    return events.filter(
      event =>
        (filters.severity === 'all' || event.severity === filters.severity) &&
        (filters.type === 'all' || event.event_type === filters.type)
    )
  }, [events, filters])

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '#ff3333'
      case 'error':
        return '#ff6b35'
      case 'warning':
        return '#ffaa00'
      default:
        return '#60a5fa'
    }
  }

  const severityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'error':
        return <WarningCircle size={14} />
      case 'warning':
        return <Lightning size={14} />
      default:
        return <Info size={14} />
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header and Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(155deg, #2d2d2d, #333333)',
          border: '2px solid #444',
          borderRadius: 12,
          padding: '16px 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: isConnected ? '#00ff41' : '#ff3333',
              animation: isConnected ? 'pulse 2s infinite' : 'none',
            }}
          />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#d0d0d0' }}>Live Event Stream</div>
            <div style={{ fontSize: 11, color: '#a0a0a0', marginTop: 2 }}>
              {isConnected ? 'Connected' : 'Connecting...'}
            </div>
          </div>
        </div>
        <button
          onClick={() => setPaused(!paused)}
          style={{
            padding: '8px 12px',
            background: paused ? '#ff6b35' : '#00ff41',
            color: '#000',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
      </div>

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          padding: '12px 16px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid #333',
          borderRadius: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#a0a0a0' }}>Severity:</label>
          <select
            value={filters.severity}
            onChange={e => setFilters({ ...filters, severity: e.target.value })}
            style={{
              padding: '6px 8px',
              background: '#1a1a1a',
              border: '1px solid #333',
              color: '#d0d0d0',
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <option value="all">All</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12, color: '#a0a0a0' }}>Type:</label>
          <select
            value={filters.type}
            onChange={e => setFilters({ ...filters, type: e.target.value })}
            style={{
              padding: '6px 8px',
              background: '#1a1a1a',
              border: '1px solid #333',
              color: '#d0d0d0',
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <option value="all">All Types</option>
            <option value="audio">Audio</option>
            <option value="system">System</option>
            <option value="network">Network</option>
            <option value="service">Service</option>
          </select>
        </div>

        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#a0a0a0', display: 'flex', alignItems: 'center' }}>
          {filteredEvents.length} events
        </div>
      </div>

      {/* Event List */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxHeight: '600px',
          overflowY: 'auto',
        }}
      >
        {filteredEvents.length > 0 ? (
          filteredEvents.map(event => (
            <div
              key={event.event_id}
              style={{
                background: '#1a1a1a',
                border: `1px solid ${severityColor(event.severity)}`,
                borderLeft: `4px solid ${severityColor(event.severity)}`,
                borderRadius: 6,
                padding: '12px 14px',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ color: severityColor(event.severity), marginTop: 2, flexShrink: 0 }}>
                  {severityIcon(event.severity)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#d0d0d0', fontWeight: 500, marginBottom: 4 }}>{event.title}</div>
                  <div style={{ color: '#a0a0a0', fontSize: 11, marginBottom: 6 }}>{event.message}</div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#888' }}>
                    <span>{event.source_node}</span>
                    <span>•</span>
                    <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div style={{ padding: '24px 20px' }}>
            <EmptyState
              title={paused ? 'Live events are paused' : 'No events yet'}
              description={paused
                ? 'Resume the stream to watch new cluster activity here.'
                : 'Waiting for cluster activity to arrive over the live event stream.'}
              compact
            />
          </div>
        )}
      </div>

      {/* Auto-scroll indicator */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
