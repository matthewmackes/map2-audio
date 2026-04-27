// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// HardwareStorePage — T2459-G3 page shell.
//
// Section ordering (locked Q2/Q7/Q12):
//   1. Connected           (live, WS-driven via useDeviceConnections)
//   2. Recently disconnected (Q12 30s grace + 24h ageing)
//   3. Known to this bench   (Q14 pinned + 24h-window)
//   4. Catalogue             (Q7 split-pane, full G10 build lands later)
//
// G3 ships the shell skeleton + REST data wiring + Q9 empty state.
// Card polish (Q6/Q11/Q12 badges) lands in G4.
// Tabbed detail strip (Q10) lands in G5+.

import * as React from 'react'
import {
  Tag,
  Loading,
  InlineNotification,
  SkeletonText,
} from '@carbon/react'
import { useQueryClient } from '@tanstack/react-query'

import { useDeviceConnections } from './hooks/useDeviceConnections'
import { useHotPlugToast } from './hooks/useHotPlugToast'
import {
  useDeviceDiagnostics,
  useKnownDevices,
  useRecentlyDisconnected,
  useConnectedDevices,
  useDeviceProfiles,
  usePackSources,
} from './hooks/useDeviceProfiles'
import { DeviceCard, type DeviceCardRow } from './DeviceCard'
import { CatalogueSection } from './CatalogueSection'
import type {
  DeviceProfileSummary,
  PackSourceRow,
} from '../../../map2/clients/devices'

import './HardwareStorePage.css'

type ProfileRow = DeviceCardRow

function indexProfiles(profiles: DeviceProfileSummary[]): Record<string, DeviceProfileSummary> {
  const out: Record<string, DeviceProfileSummary> = {}
  for (const p of profiles) {
    out[`${p.pack_id}/${p.model}.${p.kind}`] = p
  }
  return out
}

function indexPacks(rows: PackSourceRow[]): Record<string, PackSourceRow> {
  const out: Record<string, PackSourceRow> = {}
  for (const r of rows) out[r.pack_id] = r
  return out
}

function buildProfileRows(args: {
  profileKeys: string[]
  profileIndex: Record<string, DeviceProfileSummary>
  packIndex: Record<string, PackSourceRow>
  connectedKeys: Set<string>
  pinnedKeys: Set<string>
  recentlyDisconnectedKeys: Set<string>
  knownLastSeen: Record<string, number | null>
  knownLastBound: Record<string, number | null>
  diagByPack: Record<string, { count: number; worst: 'info' | 'warning' | 'error' }>
}): ProfileRow[] {
  const {
    profileKeys, profileIndex, packIndex, connectedKeys, pinnedKeys,
    recentlyDisconnectedKeys, knownLastSeen, knownLastBound, diagByPack,
  } = args
  return profileKeys
    .map<ProfileRow>((key) => {
      const p = profileIndex[key]
      if (!p) {
        const [packId, rest] = key.split('/')
        const [model, kind] = (rest ?? '').split('.')
        const dx = diagByPack[packId ?? '']
        return {
          profileKey: key,
          packId: packId ?? '',
          model: model ?? '',
          kind: (kind as ProfileRow['kind']) ?? 'audio',
          vendor: packIndex[packId ?? '']?.vendor,
          source: packIndex[packId ?? '']?.source,
          isDegraded: packIndex[packId ?? '']?.is_degraded,
          isConnected: connectedKeys.has(key),
          isPinned: pinnedKeys.has(key),
          recentlyDisconnected: recentlyDisconnectedKeys.has(key),
          lastSeenAt: knownLastSeen[key] ?? null,
          lastBoundAt: knownLastBound[key] ?? null,
          diagnosticCount: dx?.count,
          diagnosticWorstSeverity: dx?.worst,
        }
      }
      const dx = diagByPack[p.pack_id]
      return {
        profileKey: key,
        packId: p.pack_id,
        model: p.model,
        kind: p.kind,
        vendor: packIndex[p.pack_id]?.vendor,
        source: packIndex[p.pack_id]?.source,
        isDegraded: packIndex[p.pack_id]?.is_degraded,
        isConnected: connectedKeys.has(key),
        isPinned: pinnedKeys.has(key),
        recentlyDisconnected: recentlyDisconnectedKeys.has(key),
        lastSeenAt: knownLastSeen[key] ?? null,
        lastBoundAt: knownLastBound[key] ?? null,
        diagnosticCount: dx?.count,
        diagnosticWorstSeverity: dx?.worst,
        capabilities: p?.capabilities,
      }
    })
    .sort((a, b) => a.profileKey.localeCompare(b.profileKey))
}

interface SectionProps {
  title: string
  subtitle?: string
  rows: ProfileRow[]
  emptyMessage?: string
  pulseTokenFor?: (row: ProfileRow) => number | undefined
  onPinChanged?: () => void
}

function Section({
  title, subtitle, rows, emptyMessage, pulseTokenFor, onPinChanged,
}: SectionProps): React.JSX.Element {
  return (
    <section className="hwstore-section">
      <header className="hwstore-section__head">
        <h2 className="hwstore-section__title">{title}</h2>
        <span className="hwstore-section__count">{rows.length}</span>
        {subtitle ? <span className="hwstore-section__subtitle">{subtitle}</span> : null}
      </header>
      {rows.length === 0 ? (
        <p className="hwstore-section__empty">{emptyMessage ?? 'Nothing here yet.'}</p>
      ) : (
        <div className="hwstore-section__grid">
          {rows.map((row) => (
            <DeviceCard
              key={row.profileKey}
              row={{ ...row, pulseToken: pulseTokenFor?.(row) }}
              onPinChanged={onPinChanged}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function HardwareStorePage(): React.JSX.Element {
  const ws = useDeviceConnections()
  useHotPlugToast(ws.lastEvent)
  const queryClient = useQueryClient()
  const profilesQuery = useDeviceProfiles()
  const packsQuery = usePackSources()
  const connectedFallback = useConnectedDevices()
  const knownQuery = useKnownDevices()
  const recentQuery = useRecentlyDisconnected()
  const diagnosticsQuery = useDeviceDiagnostics()

  const handlePinChanged = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['devices', 'known'] })
  }, [queryClient])

  // Compute the per-row pulse token for the most recent WS event.
  // The WS hook doesn't scope events to a specific row (it stores
  // lastEvent), so we resolve here: if the event names a profile_key
  // and that key matches the row, use the event timestamp; otherwise
  // undefined (no pulse).
  const lastEventProfileKey = React.useMemo<string | null>(() => {
    const evt = ws.lastEvent
    if (!evt) return null
    if (evt.type === 'device.connected' || evt.type === 'device.disconnected') {
      return String(evt.data?.profile_key ?? '')
    }
    return null
  }, [ws.lastEvent])

  const lastEventTimestamp = ws.lastEvent?.timestamp ?? 0

  // T2459-G8 — per-pack diagnostic rollup. Counts + worst severity
  // scoped to each pack id; passed into DeviceCard as a Carbon Tag.
  const diagByPack = React.useMemo<Record<string, { count: number; worst: 'info' | 'warning' | 'error' }>>(() => {
    const out: Record<string, { count: number; worst: 'info' | 'warning' | 'error' }> = {}
    const order = { error: 2, warning: 1, info: 0 } as const
    for (const r of diagnosticsQuery.data?.diagnostics ?? []) {
      const pid = r.pack_id
      if (!pid) continue
      const existing = out[pid]
      if (!existing) {
        out[pid] = { count: 1, worst: r.severity }
      } else {
        existing.count += 1
        if (order[r.severity] > order[existing.worst]) {
          existing.worst = r.severity
        }
      }
    }
    return out
  }, [diagnosticsQuery.data])

  const pulseTokenFor = React.useCallback(
    (row: ProfileRow): number | undefined => {
      if (lastEventProfileKey && row.profileKey === lastEventProfileKey) {
        return lastEventTimestamp
      }
      return undefined
    },
    [lastEventProfileKey, lastEventTimestamp],
  )

  const profileIndex = React.useMemo(
    () => indexProfiles(profilesQuery.data?.profiles ?? []),
    [profilesQuery.data],
  )
  const packIndex = React.useMemo(
    () => indexPacks(packsQuery.data?.sources ?? []),
    [packsQuery.data],
  )

  // Connected: prefer WS state (live), fall back to polled snapshot if
  // the socket hasn't delivered anything yet.
  const connectedKeys = React.useMemo<Set<string>>(() => {
    if (ws.connectedKeys.size > 0) return ws.connectedKeys
    const fallback = connectedFallback.data?.snapshot.records ?? []
    return new Set(fallback.map((r) => r.profile_key))
  }, [ws.connectedKeys, connectedFallback.data])

  const pinnedKeys = ws.pinnedKeys
  const knownLastSeen = React.useMemo<Record<string, number | null>>(() => {
    const out: Record<string, number | null> = {}
    for (const r of knownQuery.data?.known ?? []) {
      out[r.profile_key] = r.last_seen_at
    }
    return out
  }, [knownQuery.data])

  const knownLastBound = React.useMemo<Record<string, number | null>>(() => {
    const out: Record<string, number | null> = {}
    for (const r of knownQuery.data?.known ?? []) {
      out[r.profile_key] = r.last_bound_at ?? null
    }
    return out
  }, [knownQuery.data])

  const recentlyDisconnectedKeys = React.useMemo(() => {
    return new Set(
      (recentQuery.data?.recently_disconnected ?? []).map((r) => r.profile_key),
    )
  }, [recentQuery.data])

  const knownKeys = React.useMemo(() => {
    return new Set((knownQuery.data?.known ?? []).map((r) => r.profile_key))
  }, [knownQuery.data])

  // Section partitioning. Connected first, then recently-disconnected,
  // then known-but-not-recent (pinned or 24h-window).
  const connectedRows = buildProfileRows({
    profileKeys: Array.from(connectedKeys),
    profileIndex, packIndex,
    connectedKeys, pinnedKeys, recentlyDisconnectedKeys,
    knownLastSeen, knownLastBound, diagByPack,
  })

  const recentRows = buildProfileRows({
    profileKeys: Array.from(recentlyDisconnectedKeys).filter((k) => !connectedKeys.has(k)),
    profileIndex, packIndex,
    connectedKeys, pinnedKeys, recentlyDisconnectedKeys,
    knownLastSeen, knownLastBound, diagByPack,
  })

  const knownNotRecentRows = buildProfileRows({
    profileKeys: Array.from(knownKeys).filter(
      (k) => !connectedKeys.has(k) && !recentlyDisconnectedKeys.has(k),
    ),
    profileIndex, packIndex,
    connectedKeys, pinnedKeys, recentlyDisconnectedKeys,
    knownLastSeen, knownLastBound, diagByPack,
  })

  // Catalogue: all known profiles minus those already shown in
  // Connected / Recently disconnected / Known. Renders read-only in
  // G3; Q4/Q5/Q8 facet UI lands in G10.
  const catalogueRows = React.useMemo(() => {
    const usedKeys = new Set([
      ...connectedKeys,
      ...recentlyDisconnectedKeys,
      ...knownKeys,
    ])
    const all = Object.keys(profileIndex)
    return buildProfileRows({
      profileKeys: all.filter((k) => !usedKeys.has(k)),
      profileIndex, packIndex,
      connectedKeys, pinnedKeys, recentlyDisconnectedKeys,
      knownLastSeen, knownLastBound, diagByPack,
    })
  }, [
    connectedKeys, recentlyDisconnectedKeys, knownKeys, profileIndex, packIndex,
    pinnedKeys, knownLastSeen, knownLastBound, diagByPack,
  ])

  const isLoading = profilesQuery.isLoading || packsQuery.isLoading
  const isEmpty =
    !isLoading &&
    connectedRows.length === 0 &&
    recentRows.length === 0 &&
    knownNotRecentRows.length === 0 &&
    catalogueRows.length === 0

  return (
    <div className="hwstore-page" data-ws-status={ws.status}>
      <header className="hwstore-page__head">
        <div>
          <h1 className="hwstore-page__title">Hardware Store</h1>
          <p className="hwstore-page__subtitle">
            Live bench inventory · profile-registry-driven (T2459)
          </p>
        </div>
        <div className="hwstore-page__status">
          <Tag
            size="sm"
            type={
              ws.status === 'open'
                ? 'green'
                : ws.status === 'connecting'
                  ? 'cyan'
                  : 'red'
            }
          >
            WS · {ws.status}
          </Tag>
        </div>
      </header>

      {(profilesQuery.error || packsQuery.error) && (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="Hardware Store: backend reads degraded"
          subtitle="Some sections may show stale data until /api/devices/profiles + /packs/sources recover."
          className="hwstore-page__notice"
        />
      )}

      {isLoading && (
        <div className="hwstore-page__loading">
          <Loading withOverlay={false} small description="Loading device inventory…" />
          <SkeletonText paragraph lineCount={4} />
        </div>
      )}

      {isEmpty && (
        <div className="hwstore-page__empty">
          <h2>No hardware detected</h2>
          <p>
            Connect a USB audio interface (Edirol UA-1000, Hotone Jogg, …) or
            a MIDI controller, or browse the catalogue below.
          </p>
        </div>
      )}

      {!isLoading && !isEmpty && (
        <>
          <Section
            title="Connected"
            subtitle="Detected on the bench right now"
            rows={connectedRows}
            emptyMessage="No devices currently connected. Plug something in to populate this section."
            pulseTokenFor={pulseTokenFor}
            onPinChanged={handlePinChanged}
          />
          <Section
            title="Recently disconnected"
            subtitle="Within the last 30 seconds"
            rows={recentRows}
            pulseTokenFor={pulseTokenFor}
            onPinChanged={handlePinChanged}
          />
          <Section
            title="Known to this bench"
            subtitle="Pinned or seen within the last 24 hours"
            rows={knownNotRecentRows}
            pulseTokenFor={pulseTokenFor}
            onPinChanged={handlePinChanged}
          />
          <CatalogueSection
            rows={catalogueRows}
            pulseTokenFor={pulseTokenFor}
            onPinChanged={handlePinChanged}
          />
        </>
      )}
    </div>
  )
}
