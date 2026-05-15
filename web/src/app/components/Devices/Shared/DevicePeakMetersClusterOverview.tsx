// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// DevicePeakMetersClusterOverview — Carbon DataTable summarizing every
// device across the cluster. Reads from
// /api/v1/devices/peak-meters/cluster/registry via
// useDevicesPeakMetersClusterRegistry (run-13f cycle 2).
//
// Per row: node_id, device_id, channel layout, source state, optional
// peak. Local-node rows are tagged "local" so an operator can tell at
// a glance which devices live on their own bench vs which are
// projections from peers.

import * as React from 'react'
import {
  DataTable,
  InlineNotification,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@carbon/react'

import { useDevicesPeakMetersClusterRegistry } from '../../../hooks/useDevicesPeakMetersClusterRegistry'
import { useDevicesPeakMetersClusterStream } from '../../../hooks/useDevicesPeakMetersClusterStream'
import type { DeviceMetersRegistryEntry } from '../../../hooks/useDevicesPeakMetersRegistry'

export interface DevicePeakMetersClusterOverviewProps {
  /** Optional title above the table. */
  title?: string
  /** Inherits the hook's default 5 s cadence. */
  refetchIntervalMs?: number
  /** Mirror of the local overview: when true, request inline
   * snapshots for every device + show a Peak column. */
  includeSnapshot?: boolean
  /** When true, drive the table from the cluster WS fan-in
   * (/api/v1/devices/peak-meters/cluster/stream) instead of polling
   * the cluster registry. Implies the includeSnapshot semantics —
   * every cluster frame carries the same per-device snapshot shape.
   * Run-13g cycle 5. */
  useStream?: boolean
  /** Seconds after which a row's snapshot is considered stale. When
   * the wall-clock gap exceeds this threshold, the source Tag flips
   * to a warm-gray "Stale (Ns)" pill instead of the green "Live"
   * pill, and (when useStream is on) the row's Last seen column
   * shows the age. Default 10 s — matches the local overview.
   * Run-13h cycle 2. */
  staleThresholdSeconds?: number
  /** Restrict the rendered rows to one node. Pass `"local"` for the
   * local-node rows or a peer `node_id` for a single peer slice.
   * When omitted, every node's rows render (existing behavior).
   * Run-13h cycle 4. */
  nodeFilter?: string
  /** When `true`, render a small summary row above the table with
   * the number of devices per node and total channel count. Off by
   * default so single-node operators aren't shown a noisy stat.
   * Run-13h cycle 4. */
  showPerNodeCounts?: boolean
  /** When `true`, mount Carbon's built-in column sort affordances on
   * every header. Clicking a header cycles none → asc → desc. Off
   * by default so the existing local-first ordering survives.
   * Run-13i cycle 4. */
  sortable?: boolean
}

const DEFAULT_STALE_THRESHOLD_S = 10
const STALE_TICK_INTERVAL_MS = 1_000

type CarbonTagTone = 'green' | 'warm-gray' | 'red' | 'cool-gray' | 'gray'

interface ClusterRow {
  id: string
  node: string
  device_id: string
  channels: string
  source: 'engine' | 'engine_unavailable' | 'placeholder'
  peak: string
  /** Seconds since `captured_at`. `null` when the payload omitted
   * the timestamp (older backends). Run-13h cycle 2. */
  ageSeconds: number | null
  /** True when `ageSeconds` exceeds the configured threshold. */
  isStale: boolean
}

function formatLastSeen(ageSeconds: number | null): string {
  if (ageSeconds === null || !Number.isFinite(ageSeconds)) return '—'
  if (ageSeconds < 1) return '<1 s ago'
  if (ageSeconds < 60) return `${Math.round(ageSeconds)} s ago`
  if (ageSeconds < 3600) return `${Math.round(ageSeconds / 60)} m ago`
  return `${Math.round(ageSeconds / 3600)} h ago`
}

const SILENCE_THRESHOLD_DBFS = -149.9

function maxFinite(values: number[] | undefined): number | null {
  if (!values) return null
  let best: number | null = null
  for (const v of values) {
    if (!Number.isFinite(v) || v <= SILENCE_THRESHOLD_DBFS) continue
    if (best === null || v > best) best = v
  }
  return best
}

function formatPeak(snapshot: {
  input_peak_db?: number[]
  output_peak_db?: number[]
} | null | undefined): string {
  if (!snapshot) return '—'
  const inMax = maxFinite(snapshot.input_peak_db)
  const outMax = maxFinite(snapshot.output_peak_db)
  if (inMax === null && outMax === null) return '—'
  const fmt = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}`)
  return `in ${fmt(inMax)} / out ${fmt(outMax)} dBFS`
}

function sourceTagTone(
  s: ClusterRow['source'],
  isStale: boolean,
): CarbonTagTone {
  if (s === 'engine') {
    return isStale ? 'warm-gray' : 'green'
  }
  if (s === 'engine_unavailable') return 'red'
  return 'warm-gray'
}

function sourceTagLabel(
  s: ClusterRow['source'],
  isStale: boolean,
  ageSeconds: number | null,
): string {
  if (s === 'engine') {
    if (isStale) {
      const suffix = formatLastSeen(ageSeconds)
      return suffix === '—' ? 'Stale' : `Stale (${suffix.replace(' ago', '')})`
    }
    return 'Live'
  }
  if (s === 'engine_unavailable') return 'Engine unavailable'
  return 'Awaiting engine wire-up'
}

export function DevicePeakMetersClusterOverview({
  title,
  refetchIntervalMs,
  includeSnapshot,
  useStream,
  staleThresholdSeconds,
  nodeFilter,
  showPerNodeCounts,
  sortable,
}: DevicePeakMetersClusterOverviewProps): React.JSX.Element {
  const staleThreshold = staleThresholdSeconds ?? DEFAULT_STALE_THRESHOLD_S

  // Re-evaluate per-row staleness once per second even between frames
  // so a stalled cluster path surfaces as Stale within ~1 s of crossing
  // the threshold. Mirrors useDevicesPeakMetersStream / useDeviceMeterSource.
  const [, forceRender] = React.useState(0)
  React.useEffect(() => {
    const timer = setInterval(
      () => forceRender((prev) => prev + 1),
      STALE_TICK_INTERVAL_MS,
    )
    return () => clearInterval(timer)
  }, [])
  // Polling path. Disabled when streaming so two cluster queries don't
  // race.
  const polling = useDevicesPeakMetersClusterRegistry({
    refetchIntervalMs,
    includeSnapshot,
    enabled: !useStream,
  })
  // Streaming path. Disabled in polling mode so we don't keep a WS
  // socket open unnecessarily. When nodeFilter is set under
  // streaming, push it down to the subscription so the server-side
  // filter (run-13i cycle 2) drops irrelevant peers before they hit
  // the wire — operators with a single-peer focus pay one peer's
  // worth of bandwidth rather than every peer's.
  const streamingNodeIds = nodeFilter ? [nodeFilter] : undefined
  const streaming = useDevicesPeakMetersClusterStream({
    enabled: Boolean(useStream),
    includeSnapshot,
    nodeIds: streamingNodeIds,
  })

  const local = useStream ? streaming.local : polling.local
  const peers = useStream ? streaming.peers : polling.peers
  const errors = useStream ? streaming.errors : polling.errors
  const isError = useStream
    ? streaming.lastError !== null
    : polling.isError
  const isLoading = useStream
    ? !streaming.hasFirstFrame
    : polling.isLoading

  // Pulled out so the 1s tick re-derives ageSeconds against the live
  // wall-clock. useMemo would memoize the row list against a stale
  // `Date.now()` and break the per-row staleness signal.
  const nowSeconds = Date.now() / 1000

  function buildRow(
    devEntry: DeviceMetersRegistryEntry,
    id: string,
    nodeLabel: string,
  ): ClusterRow {
    const capturedAt = devEntry.snapshot?.captured_at ?? null
    let ageSeconds: number | null = null
    let isStale = false
    if (typeof capturedAt === 'number') {
      ageSeconds = Math.max(0, nowSeconds - capturedAt)
      if (ageSeconds > staleThreshold) isStale = true
    }
    return {
      id,
      node: nodeLabel,
      device_id: devEntry.device_id,
      channels: `${devEntry.input_channels} / ${devEntry.output_channels}`,
      source:
        (devEntry.snapshot?.source as ClusterRow['source']) ??
        (devEntry.has_engine_source ? 'engine' : 'placeholder'),
      peak: formatPeak(devEntry.snapshot),
      ageSeconds,
      isStale,
    }
  }

  const rows: ClusterRow[] = []
  // Per-node tallies for the optional summary row (run-13h cycle 4).
  // Keyed by the node label as it appears in the table — keeps
  // identity consistent with the filter logic below.
  const perNodeDeviceCounts: Map<string, number> = new Map()
  const perNodeChannelTotals: Map<string, number> = new Map()

  const wantLocal = nodeFilter === undefined || nodeFilter === 'local'
  if (wantLocal) {
    for (const dev of local?.devices ?? []) {
      rows.push(buildRow(dev, `local:${dev.device_id}`, 'local'))
    }
  }
  if (local?.devices?.length) {
    perNodeDeviceCounts.set('local', local.devices.length)
    perNodeChannelTotals.set(
      'local',
      (local.devices ?? []).reduce(
        (sum, d) => sum + d.input_channels + d.output_channels,
        0,
      ),
    )
  }

  for (const peer of peers) {
    const include =
      nodeFilter === undefined ||
      nodeFilter === peer.node_id ||
      nodeFilter === peer.hostname
    const sortedDevices = [...peer.devices].sort((a, b) =>
      a.device_id.localeCompare(b.device_id),
    )
    if (include) {
      for (const dev of sortedDevices) {
        rows.push(
          buildRow(
            dev,
            `${peer.node_id}:${dev.device_id}`,
            peer.hostname || peer.node_id,
          ),
        )
      }
    }
    if (peer.devices.length) {
      const label = peer.hostname || peer.node_id
      perNodeDeviceCounts.set(label, peer.devices.length)
      perNodeChannelTotals.set(
        label,
        peer.devices.reduce(
          (sum, d) => sum + d.input_channels + d.output_channels,
          0,
        ),
      )
    }
  }

  // Run-13j — synthetic rows for peers that appear in `errors` but
  // not in `peers`. Operators looking at the table want to see *which*
  // node went unreachable, not have it silently vanish below the
  // failed-peer InlineNotification. Honors the same nodeFilter as
  // the live rows so a single-peer zoom doesn't show every other
  // down node.
  const peerNodeIds = new Set(peers.map((p) => p.node_id))
  for (const [nodeId, errMsg] of Object.entries(errors)) {
    if (nodeId === '@local') continue
    if (peerNodeIds.has(nodeId)) continue
    if (
      nodeFilter !== undefined &&
      nodeFilter !== nodeId &&
      nodeFilter !== 'local'
    ) {
      // When nodeFilter targets a specific peer that didn't fail,
      // skip every other peer's down row. Filtering against
      // hostname is best-effort — errors are keyed by node_id only.
      continue
    }
    rows.push({
      id: `down:${nodeId}`,
      node: nodeId,
      device_id: `(node down: ${errMsg || 'unreachable'})`,
      channels: '—',
      source: 'engine_unavailable',
      peak: '—',
      ageSeconds: null,
      isStale: false,
    })
  }

  // Run-13h cycle 3 — Last seen column when streaming. Hidden in
  // polling mode because polling rows don't carry per-row ages
  // sub-second; the column would just be "5 s ago" repeated.
  const headers: { key: string; header: string }[] = [
    { key: 'node', header: 'Node' },
    { key: 'device_id', header: 'Device' },
    { key: 'channels', header: 'Channels (in/out)' },
    { key: 'source', header: 'Metering source' },
  ]
  if (includeSnapshot) {
    headers.push({ key: 'peak', header: 'Peak (dBFS)' })
  }
  if (useStream) {
    headers.push({ key: 'lastSeen', header: 'Last seen' })
  }

  if (isError) {
    return (
      <div data-testid="device-peak-meters-cluster-overview-error">
        <Tag type="red">Cluster endpoint unavailable</Tag>
      </div>
    )
  }

  if (isLoading && rows.length === 0) {
    return (
      <div data-testid="device-peak-meters-cluster-overview-loading">
        <Tag type="cool-gray">Loading cluster…</Tag>
      </div>
    )
  }

  const failedPeers = Object.keys(errors)

  return (
    <div data-testid="device-peak-meters-cluster-overview">
      {title ? <h4 style={{ marginBottom: 8 }}>{title}</h4> : null}
      {failedPeers.length > 0 ? (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title={`${failedPeers.length} peer${failedPeers.length === 1 ? '' : 's'} unavailable`}
          subtitle={failedPeers.join(', ')}
          style={{ marginBottom: 8 }}
          data-testid="device-peak-meters-cluster-overview-errors"
        />
      ) : null}
      {showPerNodeCounts && perNodeDeviceCounts.size > 0 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 8,
          }}
          data-testid="device-peak-meters-cluster-overview-per-node-counts"
        >
          {Array.from(perNodeDeviceCounts.entries()).map(([label, count]) => {
            const channels = perNodeChannelTotals.get(label) ?? 0
            return (
              <Tag
                key={`per-node:${label}`}
                type={label === 'local' ? 'blue' : 'cool-gray'}
                size="sm"
                data-testid={`per-node-count-${label}`}
              >
                {`${label}: ${count} device${count === 1 ? '' : 's'} · ${channels} ch`}
              </Tag>
            )
          })}
        </div>
      ) : null}
      {nodeFilter !== undefined ? (
        <div
          style={{ marginBottom: 8 }}
          data-testid="device-peak-meters-cluster-overview-filter-active"
        >
          <Tag type="purple" size="sm">
            {`Filter: ${nodeFilter}`}
          </Tag>
        </div>
      ) : null}
      <DataTable
        rows={rows}
        headers={headers}
        size="sm"
        isSortable={Boolean(sortable)}
      >
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
                    <TableHeader
                      key={header.key}
                      {...getHeaderProps({ header })}
                    >
                      {header.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {tblRows.map((row: any) => {
                  const original = rows.find((r) => r.id === row.id)
                  // Run-13i pick #3 — synthetic "node down" row. The
                  // row.id has prefix "down:" for peers that appear in
                  // `errors` but not in `peers`. Top-level data-testid
                  // matches the canonical pattern from the handoff
                  // (`cluster-overview-node-down-<node_id>`) so an
                  // operator-tooling integration test can find these
                  // failure rows without scraping cell-level test-ids.
                  const isNodeDown =
                    typeof row.id === 'string' && row.id.startsWith('down:')
                  const downNodeId = isNodeDown
                    ? row.id.slice('down:'.length)
                    : null
                  const rowProps = getRowProps({ row })
                  const trDataTestId = downNodeId
                    ? `cluster-overview-node-down-${downNodeId}`
                    : undefined
                  return (
                    <TableRow
                      key={row.id}
                      {...rowProps}
                      data-testid={trDataTestId ?? rowProps['data-testid']}
                    >
                      {row.cells.map((cell: any) => {
                        if (cell.info.header === 'node') {
                          const isLocal = original?.node === 'local'
                          const nodeTagTone = isNodeDown
                            ? 'red'
                            : isLocal
                              ? 'blue'
                              : 'cool-gray'
                          return (
                            <TableCell key={cell.id}>
                              <Tag
                                type={nodeTagTone}
                                size="sm"
                                data-testid={`cluster-overview-node-${row.id}`}
                              >
                                {original?.node ?? '—'}
                              </Tag>
                            </TableCell>
                          )
                        }
                        if (cell.info.header === 'source' && original) {
                          return (
                            <TableCell key={cell.id}>
                              <Tag
                                type={sourceTagTone(
                                  original.source,
                                  original.isStale,
                                )}
                                size="sm"
                                data-testid={`cluster-overview-source-${row.id}`}
                              >
                                {sourceTagLabel(
                                  original.source,
                                  original.isStale,
                                  original.ageSeconds,
                                )}
                              </Tag>
                            </TableCell>
                          )
                        }
                        if (cell.info.header === 'lastSeen' && original) {
                          return (
                            <TableCell
                              key={cell.id}
                              data-testid={`cluster-overview-last-seen-${row.id}`}
                            >
                              {formatLastSeen(original.ageSeconds)}
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
