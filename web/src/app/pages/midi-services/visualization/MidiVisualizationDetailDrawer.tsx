/**
 * T2500-MV-D3 — Detail drawer for the visualization page.
 *
 * Composes <DrawerPanel> (the canonical right-side surface from
 * primitives/). Shows tier-specific metadata + the last 50 events
 * touching the selected node from the rolling activity rollup.
 */

import { useMemo } from 'react'
import {
  DataTable,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@carbon/react'

import DrawerPanel from '../../../components/primitives/DrawerPanel'
import type { MidiVisualizationNodeData } from './midiVisualizationLayout'
import type { MidiVisualizationEvent } from './midiVisualizationTypes'

export interface MidiVisualizationDetailDrawerProps {
  open: boolean
  onClose: () => void
  selectedNode: {
    id: string
    label: string
    activity: MidiVisualizationNodeData
  } | null
}

const EVENT_TABLE_HEADERS = [
  { key: 'ts', header: 'Time' },
  { key: 'kind', header: 'Kind' },
  { key: 'detail', header: 'Detail' },
] as const

interface EventRow {
  id: string
  ts: string
  kind: 'raw' | 'dispatched'
  detail: string
}

export function MidiVisualizationDetailDrawer({
  open,
  onClose,
  selectedNode,
}: MidiVisualizationDetailDrawerProps) {
  const eyebrow = selectedNode?.activity.kind?.toUpperCase() ?? ''
  const title = selectedNode?.label ?? 'Select a node'

  const rows = useMemo<EventRow[]>(() => {
    if (!selectedNode) return []
    return selectedNode.activity.recentEvents.map((evt, idx) =>
      eventToRow(evt, idx, selectedNode.id),
    )
  }, [selectedNode])

  return (
    <DrawerPanel
      open={open}
      onClose={onClose}
      eyebrow={eyebrow || undefined}
      title={title}
      side="right"
    >
      {selectedNode === null ? (
        <p>Select a node on the canvas to inspect its activity.</p>
      ) : (
        <div className="midi-viz-detail">
          <RawMetadataBlock activity={selectedNode.activity} />
          <RecentEventsBlock rows={rows} />
        </div>
      )}
    </DrawerPanel>
  )
}

function RawMetadataBlock({ activity }: { activity: MidiVisualizationNodeData }) {
  const entries = Object.entries(activity.raw).filter(
    ([, v]) => v !== undefined && v !== null,
  )
  return (
    <section style={{ marginBottom: '1.5rem' }}>
      <h4 style={{ marginBottom: '0.5rem' }}>Metadata</h4>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 0.75rem' }}>
        <dt>Kind</dt>
        <dd>
          <Tag type="cool-gray">{activity.kind}</Tag>
        </dd>
        <dt>Last event</dt>
        <dd>{activity.lastEventAt ? new Date(activity.lastEventAt).toLocaleTimeString() : '—'}</dd>
        <dt>Rate</dt>
        <dd>{activity.rateHz.toFixed(2)} evt/s</dd>
        {entries.map(([k, v]) => (
          <RawDtDd key={k} k={k} v={v} />
        ))}
      </dl>
    </section>
  )
}

function RawDtDd({ k, v }: { k: string; v: unknown }) {
  return (
    <>
      <dt>{k}</dt>
      <dd style={{ wordBreak: 'break-all' }}>{String(v)}</dd>
    </>
  )
}

function RecentEventsBlock({ rows }: { rows: EventRow[] }) {
  return (
    <section>
      <h4 style={{ marginBottom: '0.5rem' }}>Recent events</h4>
      {rows.length === 0 ? (
        <p>No events recorded for this node yet.</p>
      ) : (
        <DataTable rows={rows as never} headers={EVENT_TABLE_HEADERS as never}>
          {({
            rows: r,
            headers,
            getTableProps,
            getHeaderProps,
            getRowProps,
          }: never) => (
            <TableContainer>
              <Table {...(getTableProps as () => Record<string, unknown>)()} size="sm">
                <TableHead>
                  <TableRow>
                    {(headers as Array<{ key: string; header: string }>).map(
                      (header) => (
                        <TableHeader
                          {...(getHeaderProps as (a: unknown) => Record<string, unknown>)({
                            header,
                          })}
                          key={header.key}
                        >
                          {header.header}
                        </TableHeader>
                      ),
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(r as Array<{ id: string; cells: Array<{ value: unknown }> }>).map(
                    (row) => (
                      <TableRow {...(getRowProps as (a: unknown) => Record<string, unknown>)({ row })} key={row.id}>
                        {row.cells.map((cell, i) => (
                          <TableCell key={i}>{String(cell.value)}</TableCell>
                        ))}
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      )}
    </section>
  )
}

function eventToRow(
  event: MidiVisualizationEvent,
  index: number,
  selectedNodeId: string,
): EventRow {
  return {
    id: `${selectedNodeId}-${index}-${event.ts_ms}`,
    ts: new Date(event.ts_ms).toLocaleTimeString(),
    kind: event.kind,
    detail: detailFor(event),
  }
}

function detailFor(event: MidiVisualizationEvent): string {
  if (event.raw_hex) return `0x${event.raw_hex}`
  if (event.target) {
    return `${event.target}${event.value !== null && event.value !== undefined ? ` = ${event.value}` : ''}`
  }
  return ''
}

export default MidiVisualizationDetailDrawer
