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

export interface DevicePeakMetersOverviewProps {
  /** Optional title above the table. Defaults to "Per-device metering". */
  title?: string
  /** Inherits the hook's default 5 s cadence. */
  refetchIntervalMs?: number
}

interface OverviewRow {
  id: string
  device_id: string
  channels: string
  source: string
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
}: DevicePeakMetersOverviewProps) {
  const { devices, isError, isLoading } = useDevicesPeakMetersRegistry({
    refetchIntervalMs,
  })

  const headers = [
    { key: 'device_id', header: 'Device' },
    { key: 'channels', header: 'Channels (in/out)' },
    { key: 'source', header: 'Metering source' },
  ]

  const rows: OverviewRow[] = devices.map((d) => ({
    id: d.device_id,
    device_id: d.device_id,
    channels: `${d.input_channels} / ${d.output_channels}`,
    source: d.has_engine_source ? 'engine' : 'placeholder',
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
