import React, { useMemo, useState } from 'react'
import { Tag } from '@carbon/react'
import { Filter, Pin } from '@carbon/icons-react'
import { StatCard } from '../../../StatCard'
import { LCDFeed } from '../../../LCDFeed'
import { useLcdFeed, useLcdFeedStats } from '../../../../hooks/useLcdFeed'
import { useCluster } from '../../../../contexts/useCluster'
import type { LCDFeedEntry, LCDFeedSeverity } from '../../../../models/lcdFeed'
import { EventDetailsModal } from '../LCDView'

export function LCDEventsView() {
  const { entries: wsEntries, connected: wsEventConnected, error: wsEventError } = useLcdFeed()
  const { stats: lcdFeedStats } = useLcdFeedStats()
  const { activeNodeId } = useCluster()

  const [filterSeverity, setFilterSeverity] = useState<LCDFeedSeverity | 'all'>('all')
  const [filterType, setFilterType] = useState<string | 'all'>('all')
  const [pinned, setPinned] = useState<Set<string>>(new Set())
  const [selectedEvent, setSelectedEvent] = useState<LCDFeedEntry | null>(null)

  // Per Q3 — pill-aware filter: when pill scope is "all" (or null) show everything
  // from every node; when scope is a specific node id, filter to events whose
  // source_node matches the pill selection.
  const pillScopedEntries = useMemo(() => {
    if (!activeNodeId || activeNodeId === 'all') return wsEntries
    return wsEntries.filter((e) => e.source_node === activeNodeId)
  }, [wsEntries, activeNodeId])

  const filteredEvents = useMemo(
    () =>
      pillScopedEntries.filter((e) => {
        if (filterSeverity !== 'all' && e.severity !== filterSeverity) return false
        if (filterType !== 'all' && e.category !== filterType) return false
        return true
      }),
    [pillScopedEntries, filterSeverity, filterType],
  )
  const pinnedEvents = useMemo(
    () => pillScopedEntries.filter((e) => pinned.has(e.event_id)),
    [pillScopedEntries, pinned],
  )

  const pillLabel = !activeNodeId || activeNodeId === 'all' ? 'All cluster nodes' : activeNodeId

  return (
    <div className="lcd-page">
      <div className="events-tab">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <Tag type={wsEventConnected ? 'green' : 'warm-gray'}>
            {wsEventConnected ? 'WebSocket connected' : 'Disconnected'}
          </Tag>
          <Tag type="cool-gray">Scope: {pillLabel}</Tag>
          {wsEventError && (
            <span style={{ color: '#ef4444', fontSize: 12 }}>{wsEventError.message}</span>
          )}
        </div>

        <div className="grid five" style={{ marginBottom: 20 }}>
          <StatCard label="Total Events" value={lcdFeedStats.total_events} tone="default" />
          <StatCard label="Local Events" value={lcdFeedStats.local_events} tone="success" />
          <StatCard label="Remote Events" value={lcdFeedStats.remote_events} tone="default" />
          <StatCard
            label="Active Nodes"
            value={(lcdFeedStats as { active_nodes?: unknown[] }).active_nodes?.length ?? 0}
            tone="default"
          />
          <StatCard
            label="Connected Peers"
            value={(lcdFeedStats as { connected_peers?: unknown[] }).connected_peers?.length ?? 0}
            tone="default"
          />
        </div>

        <div className="lcd-filters-bar">
          <Filter size={16} style={{ color: '#60a5fa' }} />
          <div className="lcd-filter-group">
            <label>Severity</label>
            <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value as LCDFeedSeverity | 'all')}>
              <option value="all">All Severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="lcd-filter-group">
            <label>Type</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">All Types</option>
              <option value="audio">Audio</option>
              <option value="system">System</option>
              <option value="network">Network</option>
              <option value="service">Service</option>
              <option value="user">User</option>
              <option value="alert">Alert</option>
            </select>
          </div>
        </div>

        {pinnedEvents.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: '#f59e0b',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Pin size={16} /> Pinned Events ({pinnedEvents.length})
            </h3>
            <LCDFeed entries={pinnedEvents} maxHeight="200px" onEntryClick={(e) => setSelectedEvent(e)} />
          </div>
        )}

        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#60a5fa', marginBottom: 12 }}>
            Event Feed ({filteredEvents.length})
          </h3>
          <LCDFeed entries={filteredEvents} maxHeight="500px" onEntryClick={(e) => setSelectedEvent(e)} />
        </div>

        {selectedEvent && (
          <EventDetailsModal
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onPin={() => {
              const s = new Set(pinned)
              s.add(selectedEvent.event_id)
              setPinned(s)
            }}
            onUnpin={() => {
              const s = new Set(pinned)
              s.delete(selectedEvent.event_id)
              setPinned(s)
            }}
            isPinned={pinned.has(selectedEvent.event_id)}
          />
        )}
      </div>
    </div>
  )
}
