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

import { DataTable, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, Tag } from '@carbon/react'

import { useDevicesPeakMetersRegistry } from '../../../hooks/useDevicesPeakMetersRegistry'
import { useDevicesPeakMetersStream } from '../../../hooks/useDevicesPeakMetersStream'

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
}

interface OverviewRow {
  id: string
  device_id: string
  channels: string
  source: string
  peak: string
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
}: DevicePeakMetersOverviewProps) {
  const pollingResult = useDevicesPeakMetersRegistry({
    refetchIntervalMs,
    includeSnapshot,
    enabled: !useStream,
  })
  const streamResult = useDevicesPeakMetersStream({
    enabled: Boolean(useStream),
  })

  const devices = useStream ? streamResult.devices : pollingResult.devices
  const isError = useStream ? streamResult.lastError !== null : pollingResult.isError
  const isLoading = useStream
    ? !streamResult.hasFirstFrame
    : pollingResult.isLoading

  // Streaming frames always include a snapshot; treat the table as if
  // includeSnapshot is on in that case.
  const showPeakColumn = Boolean(includeSnapshot || useStream)

  const headers = showPeakColumn
    ? [
        { key: 'device_id', header: 'Device' },
        { key: 'channels', header: 'Channels (in/out)' },
        { key: 'source', header: 'Metering source' },
        { key: 'peak', header: 'Peak (dBFS)' },
      ]
    : [
        { key: 'device_id', header: 'Device' },
        { key: 'channels', header: 'Channels (in/out)' },
        { key: 'source', header: 'Metering source' },
      ]

  const rows: OverviewRow[] = devices.map((d) => ({
    id: d.device_id,
    device_id: d.device_id,
    channels: `${d.input_channels} / ${d.output_channels}`,
    source: d.has_engine_source ? 'engine' : 'placeholder',
    peak: formatPeak(d.snapshot ?? null),
  }))

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
                          return (
                            <TableCell key={cell.id}>
                              {sourceTag(original?.source === 'engine')}
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
