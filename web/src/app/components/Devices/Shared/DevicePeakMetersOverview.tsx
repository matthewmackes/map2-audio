// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// DevicePeakMetersOverview — Carbon DataTable summarizing every
// device registered with the meter-source primitive. Reads from
// /api/v1/devices/peak-meters/registry via useDevicesPeakMetersRegistry.
//
// Intended for the Devices landing page so an operator can see at
// a glance which devices are wired up to the engine vs still serving
// the placeholder. Renders nothing structural beyond the table — the
// caller decides where to mount it.

import { useMemo, useState } from 'react'
import {
  ContentSwitcher,
  DataTable,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Toggle,
} from '@carbon/react'

import { useDevicesPeakMetersRegistry } from '../../../hooks/useDevicesPeakMetersRegistry'
import { useDevicesPeakMetersStream } from '../../../hooks/useDevicesPeakMetersStream'
import { DeviceMeterSourceTag } from './DeviceMeterSourceTag'
import type { DeviceMeterSource } from '../../../hooks/useDeviceMeterSource'

export type DevicePeakMetersOverviewSortMode = 'name' | 'source'

export interface DevicePeakMetersOverviewProps {
  /** Optional title above the table. Defaults to "Per-device metering". */
  title?: string
  /** Inherits the hook's default 5 s cadence. */
  refetchIntervalMs?: number
  /** When true, the registry route is asked to inline a peak-meter
   * snapshot for every device and the overview gains a "Peak (dBFS)"
   * column summarizing the loudest channel per direction. */
  includeSnapshot?: boolean
  /** When true, drive the table from the 30 fps WebSocket fan-out
   * (`/api/v1/devices/peak-meters/stream`) instead of polling the
   * registry route. Implies `includeSnapshot` semantics — every WS
   * frame carries the full per-device snapshot. */
  useStream?: boolean
  /** When true, mount the column-toggle row + sort switcher above the
   * table (pivot-13b cycle 4 / Pick-3 of the eleventh-run handoff).
   * Persisted state stays in component-local React state — the caller
   * doesn't have to wire any storage. */
  showControls?: boolean
  /** Initial sort mode when `showControls` is on. Defaults to `name`. */
  initialSortMode?: DevicePeakMetersOverviewSortMode
  /** When set with `useStream`, restricts the WS subscription to these
   * meter-registry device IDs. Translation from pinned-id namespace
   * is the caller's responsibility (see
   * `data/legacyDeviceManifest.meterRegistryIdsFromPinnedIds`).
   * Pivot-13d cycle 1. */
  deviceIds?: readonly string[]
}

interface OverviewRow {
  id: string
  device_id: string
  channels: string
  source: string
  peak: string
  /** Streamed-row metadata threaded through for the source Tag. Only
   * populated when `useStream` is on; polling mode leaves these
   * undefined so the Tag falls back to the existing has-engine /
   * placeholder colour policy. Pivot-13e cycle 1. */
  meterSource?: DeviceMeterSource
  isStale?: boolean
  ageSeconds?: number | null
  /** Formatted "last seen" label for the new column (run-13f cycle 3). */
  lastSeen?: string
}

function formatLastSeen(ageSeconds: number | null | undefined): string {
  if (typeof ageSeconds !== 'number' || !Number.isFinite(ageSeconds)) return '—'
  if (ageSeconds < 1) return '<1 s ago'
  if (ageSeconds < 60) return `${Math.round(ageSeconds)} s ago`
  if (ageSeconds < 3600) return `${Math.round(ageSeconds / 60)} m ago`
  return `${Math.round(ageSeconds / 3600)} h ago`
}

const SILENCE_THRESHOLD_DBFS = -149.9

function maxFinite(values: number[]): number | null {
  let best: number | null = null
  for (const v of values) {
    if (!Number.isFinite(v) || v <= SILENCE_THRESHOLD_DBFS) continue
    if (best === null || v > best) best = v
  }
  return best
}

function formatPeak(snapshot: { input_peak_db: number[]; output_peak_db: number[] } | null | undefined): string {
  if (!snapshot) return '—'
  const inMax = maxFinite(snapshot.input_peak_db)
  const outMax = maxFinite(snapshot.output_peak_db)
  if (inMax === null && outMax === null) return '—'
  const fmt = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}`)
  return `in ${fmt(inMax)} / out ${fmt(outMax)} dBFS`
}

function sourceTag(hasEngine: boolean) {
  if (hasEngine) {
    return (
      <Tag type="green" size="sm" data-testid={`overview-source-engine`}>
        Live
      </Tag>
    )
  }
  return (
    <Tag type="warm-gray" size="sm" data-testid={`overview-source-placeholder`}>
      Awaiting engine wire-up
    </Tag>
  )
}

export function DevicePeakMetersOverview({
  title,
  refetchIntervalMs,
  includeSnapshot,
  useStream,
  showControls,
  initialSortMode,
  deviceIds,
}: DevicePeakMetersOverviewProps) {
  const pollingResult = useDevicesPeakMetersRegistry({
    refetchIntervalMs,
    includeSnapshot,
    enabled: !useStream,
  })
  const streamResult = useDevicesPeakMetersStream({
    enabled: Boolean(useStream),
    deviceIds,
  })

  const devices = useStream ? streamResult.devices : pollingResult.devices
  const streamRows = useStream ? streamResult.rows : []
  const streamRowsById = useMemo(() => {
    const map = new Map<string, (typeof streamRows)[number]>()
    for (const r of streamRows) map.set(r.device_id, r)
    return map
  }, [streamRows])
  const isError = useStream ? streamResult.lastError !== null : pollingResult.isError
  const isLoading = useStream
    ? !streamResult.hasFirstFrame
    : pollingResult.isLoading

  const [splitChannels, setSplitChannels] = useState<boolean>(false)
  const [sortMode, setSortMode] = useState<DevicePeakMetersOverviewSortMode>(
    initialSortMode ?? 'name',
  )

  // Streaming frames always include a snapshot; treat the table as if
  // includeSnapshot is on in that case.
  const showPeakColumn = Boolean(includeSnapshot || useStream)

  const headers = useMemo(() => {
    const cols: { key: string; header: string }[] = [
      { key: 'device_id', header: 'Device' },
    ]
    if (showControls && splitChannels) {
      cols.push(
        { key: 'inputs', header: 'Inputs' },
        { key: 'outputs', header: 'Outputs' },
      )
    } else {
      cols.push({ key: 'channels', header: 'Channels (in/out)' })
    }
    cols.push({ key: 'source', header: 'Metering source' })
    if (showPeakColumn) {
      cols.push({ key: 'peak', header: 'Peak (dBFS)' })
    }
    // Run-13f cycle 3 — "Last seen" column only appears in streaming
    // mode where every row carries a captured_at timestamp.
    if (useStream) {
      cols.push({ key: 'lastSeen', header: 'Last seen' })
    }
    return cols
  }, [showControls, splitChannels, showPeakColumn, useStream])

  const baseRows: OverviewRow[] = devices.map((d) => {
    const streamRow = streamRowsById.get(d.device_id)
    const snapshotSource = d.snapshot?.source as DeviceMeterSource | undefined
    return {
      id: d.device_id,
      device_id: d.device_id,
      channels: `${d.input_channels} / ${d.output_channels}`,
      source: d.has_engine_source ? 'engine' : 'placeholder',
      peak: formatPeak(d.snapshot ?? null),
      // When the row is streamed, prefer the snapshot's source field
      // (which covers engine / engine_unavailable / placeholder) over
      // the cheaper has_engine_source flag. Polling mode keeps
      // meterSource undefined so the existing Tag rendering is
      // unchanged.
      meterSource: useStream ? snapshotSource ?? (d.has_engine_source ? 'engine' : 'placeholder') : undefined,
      isStale: streamRow?.isStale,
      ageSeconds: streamRow?.ageSeconds,
      lastSeen: useStream ? formatLastSeen(streamRow?.ageSeconds) : undefined,
    }
  })

  const splitMeta = useMemo(() => {
    const out: Record<string, { inputs: string; outputs: string }> = {}
    for (const d of devices) {
      out[d.device_id] = {
        inputs: String(d.input_channels),
        outputs: String(d.output_channels),
      }
    }
    return out
  }, [devices])

  const rows: OverviewRow[] = useMemo(() => {
    const list = [...baseRows]
    if (sortMode === 'source') {
      // Live (engine) devices first, then placeholders. Stable by
      // device_id within each group so the operator sees a
      // deterministic ordering.
      list.sort((a, b) => {
        const aLive = a.source === 'engine' ? 0 : 1
        const bLive = b.source === 'engine' ? 0 : 1
        if (aLive !== bLive) return aLive - bLive
        return a.device_id.localeCompare(b.device_id)
      })
    } else {
      list.sort((a, b) => a.device_id.localeCompare(b.device_id))
    }
    return list
  }, [baseRows, sortMode])

  if (isError) {
    return (
      <div data-testid="device-peak-meters-overview-error">
        <Tag type="red">Endpoint unavailable</Tag>
      </div>
    )
  }

  if (isLoading && rows.length === 0) {
    return (
      <div data-testid="device-peak-meters-overview-loading">
        <Tag type="cool-gray">Loading…</Tag>
      </div>
    )
  }

  return (
    <div data-testid="device-peak-meters-overview">
      {title ? <h4 style={{ marginBottom: 8 }}>{title}</h4> : null}
      {showControls ? (
        <div
          data-testid="device-peak-meters-overview-controls"
          style={{ display: 'flex', gap: 24, marginBottom: 12, alignItems: 'center' }}
        >
          <Toggle
            id="device-peak-meters-overview-split-channels"
            labelText="Channel columns"
            labelA="Combined"
            labelB="Split"
            toggled={splitChannels}
            onToggle={(checked: boolean) => setSplitChannels(checked)}
            data-testid="device-peak-meters-overview-toggle-split"
          />
          <ContentSwitcher
            selectedIndex={sortMode === 'name' ? 0 : 1}
            onChange={({ name }: { name?: string }) => {
              if (name === 'source') setSortMode('source')
              else setSortMode('name')
            }}
            size="sm"
            data-testid="device-peak-meters-overview-sort"
          >
            <Switch name="name" text="Sort: name" />
            <Switch name="source" text="Sort: live first" />
          </ContentSwitcher>
        </div>
      ) : null}
      <DataTable rows={rows} headers={headers} size="sm">
        {({
          rows: tblRows,
          headers: tblHeaders,
          getHeaderProps,
          getRowProps,
          getTableProps,
        }: any) => (
          <TableContainer>
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {tblHeaders.map((header: any) => (
                    <TableHeader key={header.key} {...getHeaderProps({ header })}>
                      {header.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {tblRows.map((row: any) => {
                  const original = rows.find((r) => r.id === row.id)
                  return (
                    <TableRow key={row.id} {...getRowProps({ row })}>
                      {row.cells.map((cell: any) => {
                        if (cell.info.header === 'source') {
                          // Streaming mode: render the shared
                          // DeviceMeterSourceTag so engine_unavailable
                          // and stale states light up the per-row Tag.
                          // Polling mode: keep the existing two-state
                          // local Tag — no behavioral change.
                          if (useStream && original?.meterSource) {
                            return (
                              <TableCell key={cell.id}>
                                <DeviceMeterSourceTag
                                  source={original.meterSource}
                                  isError={false}
                                  isStale={original.isStale}
                                  ageSeconds={original.ageSeconds}
                                  testId={`overview-stream-tag-${original.device_id}`}
                                />
                              </TableCell>
                            )
                          }
                          return (
                            <TableCell key={cell.id}>
                              {sourceTag(original?.source === 'engine')}
                            </TableCell>
                          )
                        }
                        if (cell.info.header === 'inputs') {
                          const meta = splitMeta[row.id]
                          return <TableCell key={cell.id}>{meta?.inputs ?? '—'}</TableCell>
                        }
                        if (cell.info.header === 'outputs') {
                          const meta = splitMeta[row.id]
                          return <TableCell key={cell.id}>{meta?.outputs ?? '—'}</TableCell>
                        }
                        if (cell.info.header === 'lastSeen') {
                          return (
                            <TableCell
                              key={cell.id}
                              data-testid={`overview-last-seen-${row.id}`}
                            >
                              {original?.lastSeen ?? '—'}
                            </TableCell>
                          )
                        }
                        return <TableCell key={cell.id}>{cell.value}</TableCell>
                      })}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
    </div>
  )
}
