// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// DiagnosticsAggregatePage — T2459-G8. Bench-wide diagnostics view.
// Lives at /devices/diagnostics (preview /devices/diagnostics-v2
// while the legacy storefront still owns the index).

import * as React from 'react'
import {
  DataTable,
  Table,
  TableHead,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
  Dropdown,
  InlineNotification,
  Loading,
} from '@carbon/react'
import { Link as RouterLink } from 'react-router-dom'

import { useDeviceDiagnostics } from './hooks/useDeviceProfiles'
import type { DiagnosticEntry } from '../../../map2/clients/devices'
import { DevicePeakMetersOverview } from './Shared/DevicePeakMetersOverview'
import { DevicePeakMetersClusterOverview } from './Shared/DevicePeakMetersClusterOverview'
import { meterRegistryIdsFromPinnedIds } from '../../data/legacyDeviceManifest'
import { usePinnedDevices } from '../../state/uiSettings'

import './DiagnosticsAggregatePage.css'

const SEVERITY_TONE: Record<DiagnosticEntry['severity'], string> = {
  info: 'gray',
  warning: 'warm-gray',
  error: 'red',
}

const SEVERITY_OPTIONS: Array<{ id: 'all' | DiagnosticEntry['severity']; label: string }> = [
  { id: 'all', label: 'All severities' },
  { id: 'info', label: 'Info' },
  { id: 'warning', label: 'Warning' },
  { id: 'error', label: 'Error' },
]

const SOURCE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All sources' },
  { id: 'profile_registry', label: 'Profile registry' },
  { id: 'controller_host', label: 'Controller host' },
  { id: 'mixxx_xml_reader', label: 'Mixxx XML reader' },
  { id: 'detection', label: 'Detection chain' },
]

interface RowShape extends DiagnosticEntry {
  id: string
}

function formatTs(ts: number): string {
  if (!Number.isFinite(ts)) return '—'
  try {
    return new Date(ts * 1000).toLocaleString()
  } catch {
    return String(ts)
  }
}

export function DiagnosticsAggregatePage(): React.JSX.Element {
  const [severity, setSeverity] = React.useState<'all' | DiagnosticEntry['severity']>('all')
  const [source, setSource] = React.useState<string>('all')
  const [query, setQuery] = React.useState('')

  const { data, error, isLoading } = useDeviceDiagnostics({
    severity: severity === 'all' ? undefined : severity,
    source: source === 'all' ? undefined : source,
  })

  const rows: RowShape[] = React.useMemo(() => {
    const list = data?.diagnostics ?? []
    const lower = query.trim().toLowerCase()
    return list
      .map((r, i) => ({ ...r, id: `${r.code}-${r.source}-${i}` }))
      .filter((r) => {
        if (!lower) return true
        const haystack = [
          r.code, r.detail, r.source, r.pack_id ?? '', r.file ?? '',
        ].join(' ').toLowerCase()
        return haystack.includes(lower)
      })
  }, [data, query])

  const counts = data?.counts_by_severity ?? { info: 0, warning: 0, error: 0 }

  // Pivot-13d cycle 1 — translate the operator's pinned-device list
  // (nav-shell namespace) into meter-registry IDs and feed them to the
  // streaming overview when at least one pinned device is metered.
  const pinnedDevices = usePinnedDevices()
  const pinnedMeterIds = React.useMemo(
    () => meterRegistryIdsFromPinnedIds(pinnedDevices),
    [pinnedDevices],
  )

  return (
    <div className="diagnostics-aggregate-page">
      <header className="diagnostics-aggregate-page__head">
        <div>
          <p className="diagnostics-aggregate-page__crumb">
            <RouterLink to="/devices">Hardware Store</RouterLink> / Diagnostics
          </p>
          <h1>Bench-wide diagnostics</h1>
          <p className="diagnostics-aggregate-page__sub">
            Aggregated from <code>/api/devices/diagnostics</code> — profile registry, controller host, and Mixxx XML reader.
          </p>
        </div>
        <div className="diagnostics-aggregate-page__counts">
          <Tag size="md" type="red">{counts.error} error</Tag>
          <Tag size="md" type="warm-gray">{counts.warning} warning</Tag>
          <Tag size="md" type="gray">{counts.info} info</Tag>
        </div>
      </header>

      {error ? (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="Diagnostics unavailable"
          subtitle="GET /api/devices/diagnostics returned an error. Backend may be pre-T2459 — restart map2-backend.service."
          className="diagnostics-aggregate-page__notice"
        />
      ) : null}

      {isLoading ? (
        <div className="diagnostics-aggregate-page__loading">
          <Loading withOverlay={false} small description="Loading diagnostics…" />
        </div>
      ) : null}

      {pinnedMeterIds.length > 0 ? (
        <section
          className="diagnostics-aggregate-page__meters-overview"
          data-testid="dx-meters-overview-pinned"
          style={{ marginBottom: 24 }}
        >
          <DevicePeakMetersOverview
            title="Pinned devices (live)"
            useStream
            deviceIds={pinnedMeterIds}
          />
        </section>
      ) : null}

      <section
        className="diagnostics-aggregate-page__meters-overview"
        data-testid="dx-meters-overview"
        style={{ marginBottom: 24 }}
      >
        <DevicePeakMetersOverview title="Per-device metering" includeSnapshot />
      </section>

      <section
        className="diagnostics-aggregate-page__meters-overview"
        data-testid="dx-meters-cluster-overview"
        style={{ marginBottom: 24 }}
      >
        <DevicePeakMetersClusterOverview
          title="Cluster-wide metering (live)"
          includeSnapshot
          useStream
          sortable
          showPerNodeCounts
        />
      </section>

      <DataTable
        rows={rows}
        headers={[
          { key: 'severity', header: 'Severity' },
          { key: 'source', header: 'Source' },
          { key: 'code', header: 'Code' },
          { key: 'detail', header: 'Detail' },
          { key: 'pack_id', header: 'Pack' },
          { key: 'ts', header: 'When' },
        ]}
      >
        {({ rows: dtRows, headers, getHeaderProps, getRowProps, getTableProps }) => (
          <TableContainer>
            <TableToolbar>
              <TableToolbarContent>
                <Dropdown
                  id="dx-severity"
                  size="sm"
                  titleText=""
                  hideLabel
                  label="Severity"
                  items={SEVERITY_OPTIONS}
                  itemToString={(i) => (i ? i.label : '')}
                  selectedItem={SEVERITY_OPTIONS.find((o) => o.id === severity)}
                  onChange={(e) => setSeverity((e.selectedItem?.id ?? 'all') as 'all' | DiagnosticEntry['severity'])}
                />
                <Dropdown
                  id="dx-source"
                  size="sm"
                  titleText=""
                  hideLabel
                  label="Source"
                  items={SOURCE_OPTIONS}
                  itemToString={(i) => (i ? i.label : '')}
                  selectedItem={SOURCE_OPTIONS.find((o) => o.id === source)}
                  onChange={(e) => setSource((e.selectedItem?.id ?? 'all') as string)}
                />
                <TableToolbarSearch
                  persistent
                  placeholder="Search code, detail, pack…"
                  onChange={(evt) => {
                    if (typeof evt === 'string') setQuery(evt)
                    else if (evt && 'target' in evt) setQuery((evt.target as HTMLInputElement).value ?? '')
                  }}
                />
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()}>
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
                {dtRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={headers.length}>
                      <em>No diagnostics match the current filters. Bench is healthy.</em>
                    </TableCell>
                  </TableRow>
                ) : dtRows.map((dtr) => {
                  const r = rows.find((rr) => rr.id === dtr.id)!
                  return (
                    <TableRow key={dtr.id} {...getRowProps({ row: dtr })}>
                      <TableCell>
                        <Tag size="sm" type={SEVERITY_TONE[r.severity] as never}>{r.severity}</Tag>
                      </TableCell>
                      <TableCell><code>{r.source}</code></TableCell>
                      <TableCell><code>{r.code}</code></TableCell>
                      <TableCell>{r.detail}</TableCell>
                      <TableCell>
                        {r.pack_id ? (
                          <RouterLink
                            to={`/devices/profile/${encodeURIComponent(r.pack_id)}/?from=diagnostics`}
                            className="diagnostics-aggregate-page__pack-link"
                          >
                            {r.pack_id}
                          </RouterLink>
                        ) : <span>—</span>}
                      </TableCell>
                      <TableCell>{formatTs(r.ts)}</TableCell>
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
