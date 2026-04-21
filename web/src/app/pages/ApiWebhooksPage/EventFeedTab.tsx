import {
  Button,
  DataTable,
  InlineLoading,
  InlineNotification,
  MultiSelect,
  NumberInput,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
} from '@carbon/react'
import { Pause, Play, Renew, Send } from '@carbon/icons-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { PlatformEvent, PlatformEventSeverity } from '../../../map2/platformEvent'
import { getPlatformEventTransport } from '../../services/platformEventTransport'
import './EventFeedTab.css'

const MAX_BUFFER = 2000
const HYDRATE_LIMIT = 200

const SEVERITIES: PlatformEventSeverity[] = ['critical', 'error', 'warning', 'info']

const COLUMN_HEADERS = [
  { key: 'occurred_at', header: 'When' },
  { key: 'severity', header: 'Severity' },
  { key: 'kind', header: 'Kind' },
  { key: 'source_node', header: 'Node' },
  { key: 'title', header: 'Title' },
  { key: 'message', header: 'Message' },
]

function severityTone(
  s: string,
): 'red' | 'magenta' | 'purple' | 'blue' | 'teal' | 'green' | 'cool-gray' | 'warm-gray' {
  switch (s) {
    case 'critical':
      return 'magenta'
    case 'error':
      return 'red'
    case 'warning':
      return 'purple'
    case 'info':
      return 'blue'
    default:
      return 'cool-gray'
  }
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toLocaleTimeString([], { hour12: false })} ${d.toLocaleDateString()}`
}

export function EventFeedTab() {
  const [events, setEvents] = useState<PlatformEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [hydrateError, setHydrateError] = useState<string | null>(null)
  const [hydrating, setHydrating] = useState(false)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(paused)
  const pausedBufferRef = useRef<PlatformEvent[]>([])

  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<PlatformEventSeverity[]>([])
  const [kindFilter, setKindFilter] = useState<string[]>([])
  const [nodeFilter, setNodeFilter] = useState<string[]>([])
  const [minPriority, setMinPriority] = useState<number>(0)

  const [testEmitting, setTestEmitting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    pausedRef.current = paused
    if (!paused && pausedBufferRef.current.length > 0) {
      const buffered = pausedBufferRef.current
      pausedBufferRef.current = []
      setEvents((prev) => [...buffered, ...prev].slice(0, MAX_BUFFER))
    }
  }, [paused])

  const hydrate = useCallback(async () => {
    setHydrating(true)
    setHydrateError(null)
    try {
      const res = await fetch(`/api/platform-events?limit=${HYDRATE_LIMIT}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { events?: PlatformEvent[] }
      const list = Array.isArray(body.events) ? body.events : []
      setEvents(list.slice(0, MAX_BUFFER))
    } catch (e) {
      setHydrateError(e instanceof Error ? e.message : 'failed to hydrate')
    } finally {
      setHydrating(false)
    }
  }, [])

  useEffect(() => {
    hydrate()
  }, [hydrate])

  useEffect(() => {
    const transport = getPlatformEventTransport()
    const unsubscribe = transport.subscribe((update) => {
      if (typeof update.connected === 'boolean') setConnected(update.connected)
      if (update.events && update.events.length > 0) {
        const incoming = update.events
        if (pausedRef.current) {
          pausedBufferRef.current = [...incoming, ...pausedBufferRef.current].slice(0, MAX_BUFFER)
        } else {
          setEvents((prev) => {
            const seen = new Set(prev.map((e) => e.event_id))
            const fresh = incoming.filter((e) => !seen.has(e.event_id))
            if (fresh.length === 0) return prev
            return [...fresh, ...prev].slice(0, MAX_BUFFER)
          })
        }
      }
    })
    const stop = transport.start()
    return () => {
      unsubscribe()
      stop()
    }
  }, [])

  const uniqueKinds = useMemo(() => {
    const s = new Set(events.map((e) => e.kind))
    return Array.from(s).sort()
  }, [events])

  const uniqueNodes = useMemo(() => {
    const s = new Set(events.map((e) => e.source_node).filter(Boolean))
    return Array.from(s).sort()
  }, [events])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events.filter((e) => {
      if (severityFilter.length > 0 && !severityFilter.includes(e.severity)) return false
      if (kindFilter.length > 0 && !kindFilter.includes(e.kind)) return false
      if (nodeFilter.length > 0 && !nodeFilter.includes(e.source_node)) return false
      if (minPriority > 0 && (e.priority ?? 0) < minPriority) return false
      if (q) {
        const hay = `${e.kind} ${e.title} ${e.message} ${e.source_node} ${e.severity}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [events, kindFilter, minPriority, nodeFilter, search, severityFilter])

  const rows = useMemo(
    () =>
      filtered.map((e) => ({
        id: e.event_id,
        occurred_at: formatWhen(e.occurred_at),
        severity: e.severity,
        kind: e.kind,
        source_node: e.source_node,
        title: e.title,
        message: e.message,
      })),
    [filtered],
  )

  const fireTestEvent = useCallback(async () => {
    setTestEmitting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/platform-events/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { event?: { event_id?: string } }
      setTestResult(`Emitted ${body.event?.event_id ?? 'event'}`)
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : 'failed')
    } finally {
      setTestEmitting(false)
    }
  }, [])

  return (
    <div className="event-feed-tab" role="region" aria-label="Event Feed">
      <header className="event-feed-tab__header">
        <Stack gap={4}>
          <div className="event-feed-tab__status-row">
            <Tag type={connected ? 'green' : 'warm-gray'}>
              {connected ? 'Live' : 'Offline'}
            </Tag>
            <Tag type="cool-gray">{events.length} in buffer</Tag>
            <Tag type="cool-gray">{filtered.length} shown</Tag>
            <Button
              kind="tertiary"
              size="sm"
              renderIcon={paused ? Play : Pause}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              kind="tertiary"
              size="sm"
              renderIcon={Renew}
              onClick={hydrate}
              disabled={hydrating}
            >
              Rehydrate
            </Button>
            <Button
              kind="primary"
              size="sm"
              renderIcon={Send}
              onClick={fireTestEvent}
              disabled={testEmitting}
            >
              Fire test event
            </Button>
            {testEmitting && <InlineLoading description="Emitting…" />}
            {testResult && (
              <Tag type={testResult.startsWith('Emitted') ? 'green' : 'red'}>{testResult}</Tag>
            )}
          </div>
          {hydrateError && (
            <InlineNotification
              kind="error"
              lowContrast
              title="Hydrate failed"
              subtitle={hydrateError}
              hideCloseButton
            />
          )}
        </Stack>
      </header>

      <div className="event-feed-tab__filters">
        <MultiSelect
          id="event-feed-severity"
          label="Severity"
          titleText="Severity"
          items={SEVERITIES.map((s) => ({ id: s, label: s }))}
          itemToString={(i) => (i ? i.label : '')}
          onChange={({ selectedItems }) =>
            setSeverityFilter(
              (selectedItems ?? []).map((i) => i.id as PlatformEventSeverity),
            )
          }
          size="sm"
        />
        <MultiSelect
          id="event-feed-kind"
          label="Kind"
          titleText="Kind"
          items={uniqueKinds.map((k) => ({ id: k, label: k }))}
          itemToString={(i) => (i ? i.label : '')}
          onChange={({ selectedItems }) =>
            setKindFilter((selectedItems ?? []).map((i) => i.id))
          }
          size="sm"
        />
        <MultiSelect
          id="event-feed-node"
          label="Node"
          titleText="Node"
          items={uniqueNodes.map((n) => ({ id: n, label: n }))}
          itemToString={(i) => (i ? i.label : '')}
          onChange={({ selectedItems }) =>
            setNodeFilter((selectedItems ?? []).map((i) => i.id))
          }
          size="sm"
        />
        <NumberInput
          id="event-feed-min-priority"
          label="Min priority"
          min={0}
          max={1}
          step={0.05}
          value={minPriority}
          onChange={(_e, { value }) =>
            setMinPriority(typeof value === 'number' ? value : Number(value) || 0)
          }
          size="sm"
        />
      </div>

      <div className="event-feed-tab__table">
        <DataTable rows={rows} headers={COLUMN_HEADERS}>
          {({
            rows: dtRows,
            headers,
            getHeaderProps,
            getRowProps,
            getTableProps,
            getTableContainerProps,
          }) => (
            <TableContainer {...getTableContainerProps()}>
              <TableToolbar>
                <TableToolbarContent>
                  <TableToolbarSearch
                    placeholder="Search events"
                    onChange={(e: React.ChangeEvent<HTMLInputElement> | undefined) => {
                      setSearch(e?.target.value ?? '')
                    }}
                    persistent
                  />
                </TableToolbarContent>
              </TableToolbar>
              <Table {...getTableProps()} size="sm" useZebraStyles>
                <TableHead>
                  <TableRow>
                    {headers.map((h) => (
                      <TableHeader key={h.key} {...getHeaderProps({ header: h })}>
                        {h.header}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dtRows.map((row) => (
                    <TableRow key={row.id} {...getRowProps({ row })}>
                      {row.cells.map((cell) => {
                        if (cell.info.header === 'severity') {
                          return (
                            <TableCell key={cell.id}>
                              <Tag type={severityTone(String(cell.value))} size="sm">
                                {String(cell.value)}
                              </Tag>
                            </TableCell>
                          )
                        }
                        return (
                          <TableCell key={cell.id}>{String(cell.value ?? '')}</TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      </div>
    </div>
  )
}

export default EventFeedTab
