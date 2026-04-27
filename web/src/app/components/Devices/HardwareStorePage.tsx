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
  Tile,
  Tag,
  Loading,
  InlineNotification,
  SkeletonText,
} from '@carbon/react'
import { Link as RouterLink } from 'react-router-dom'

import { useDeviceConnections } from './hooks/useDeviceConnections'
import {
  useKnownDevices,
  useRecentlyDisconnected,
  useConnectedDevices,
  useDeviceProfiles,
  usePackSources,
} from './hooks/useDeviceProfiles'
import type {
  DeviceProfileSummary,
  PackSourceRow,
} from '../../../map2/clients/devices'

import './HardwareStorePage.css'

interface ProfileRow {
  profileKey: string
  packId: string
  model: string
  kind: 'audio' | 'midi' | 'hid'
  vendor?: string
  source?: PackSourceRow['source']
  isDegraded?: boolean
  isConnected: boolean
  isPinned: boolean
  lastSeenAt: number | null
}

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

function formatLastSeen(ts: number | null): string {
  if (ts === null) return '—'
  const ago = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (ago < 60) return `${ago}s ago`
  if (ago < 3600) return `${Math.floor(ago / 60)}m ago`
  if (ago < 86400) return `${Math.floor(ago / 3600)}h ago`
  return `${Math.floor(ago / 86400)}d ago`
}

function buildProfileRows(args: {
  profileKeys: string[]
  profileIndex: Record<string, DeviceProfileSummary>
  packIndex: Record<string, PackSourceRow>
  connectedKeys: Set<string>
  pinnedKeys: Set<string>
  knownKeys: Set<string>
  knownLastSeen: Record<string, number | null>
}): ProfileRow[] {
  const { profileKeys, profileIndex, packIndex, connectedKeys, pinnedKeys, knownLastSeen } = args
  return profileKeys
    .map((key) => {
      const p = profileIndex[key]
      if (!p) {
        const [packId, rest] = key.split('/')
        const [model, kind] = (rest ?? '').split('.')
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
          lastSeenAt: knownLastSeen[key] ?? null,
        }
      }
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
        lastSeenAt: knownLastSeen[key] ?? null,
      }
    })
    .sort((a, b) => a.profileKey.localeCompare(b.profileKey))
}

interface DeviceTileProps {
  row: ProfileRow
  badge?: React.ReactNode
}

function DeviceTile({ row, badge }: DeviceTileProps): React.JSX.Element {
  const sourceLabel: Record<NonNullable<ProfileRow['source']>, string> = {
    shipped: 'Shipped',
    user: 'User',
    imported: 'Imported',
  }
  const sourceTag: Record<NonNullable<ProfileRow['source']>, string> = {
    shipped: 'green',
    user: 'cyan',
    imported: 'magenta',
  }
  return (
    <Tile className="hwstore-tile" data-profile-key={row.profileKey}>
      <div className="hwstore-tile__head">
        <div className="hwstore-tile__title">
          <span className="hwstore-tile__model">{row.model}</span>
          <span className="hwstore-tile__vendor">{row.vendor ?? row.packId}</span>
        </div>
        {badge}
      </div>
      <div className="hwstore-tile__tags">
        <Tag size="sm" type="cool-gray">{row.kind}</Tag>
        {row.source ? (
          <Tag size="sm" type={sourceTag[row.source] as never}>
            {sourceLabel[row.source]}
          </Tag>
        ) : null}
        {row.isPinned ? <Tag size="sm" type="purple">Pinned</Tag> : null}
        {row.isDegraded ? <Tag size="sm" type="warm-gray">Pack degraded</Tag> : null}
      </div>
      <div className="hwstore-tile__meta">
        <RouterLink
          to={`/devices/profile/${encodeURIComponent(row.packId)}/${encodeURIComponent(row.model)}`}
          className="hwstore-tile__open"
        >
          Open
        </RouterLink>
        {row.lastSeenAt !== null && !row.isConnected ? (
          <span className="hwstore-tile__last-seen">Last seen {formatLastSeen(row.lastSeenAt)}</span>
        ) : null}
      </div>
    </Tile>
  )
}

interface SectionProps {
  title: string
  subtitle?: string
  rows: ProfileRow[]
  emptyMessage?: string
  badgeFor?: (row: ProfileRow) => React.ReactNode
}

function Section({ title, subtitle, rows, emptyMessage, badgeFor }: SectionProps): React.JSX.Element {
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
            <DeviceTile key={row.profileKey} row={row} badge={badgeFor?.(row)} />
          ))}
        </div>
      )}
    </section>
  )
}

export function HardwareStorePage(): React.JSX.Element {
  const ws = useDeviceConnections()
  const profilesQuery = useDeviceProfiles()
  const packsQuery = usePackSources()
  const connectedFallback = useConnectedDevices()
  const knownQuery = useKnownDevices()
  const recentQuery = useRecentlyDisconnected()

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
    connectedKeys, pinnedKeys, knownKeys,
    knownLastSeen,
  })

  const recentRows = buildProfileRows({
    profileKeys: Array.from(recentlyDisconnectedKeys).filter((k) => !connectedKeys.has(k)),
    profileIndex, packIndex,
    connectedKeys, pinnedKeys, knownKeys,
    knownLastSeen,
  })

  const knownNotRecentRows = buildProfileRows({
    profileKeys: Array.from(knownKeys).filter(
      (k) => !connectedKeys.has(k) && !recentlyDisconnectedKeys.has(k),
    ),
    profileIndex, packIndex,
    connectedKeys, pinnedKeys, knownKeys,
    knownLastSeen,
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
      connectedKeys, pinnedKeys, knownKeys,
      knownLastSeen,
    })
  }, [
    connectedKeys, recentlyDisconnectedKeys, knownKeys, profileIndex, packIndex,
    pinnedKeys, knownLastSeen,
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
            badgeFor={(row) => (
              <Tag size="sm" type="green">
                {row.isConnected ? 'Connected' : ''}
              </Tag>
            )}
          />
          <Section
            title="Recently disconnected"
            subtitle="Within the last 30 seconds"
            rows={recentRows}
            badgeFor={() => <Tag size="sm" type="warm-gray">Disconnected</Tag>}
          />
          <Section
            title="Known to this bench"
            subtitle="Pinned or seen within the last 24 hours"
            rows={knownNotRecentRows}
            badgeFor={(row) => (
              row.isPinned
                ? <Tag size="sm" type="purple">Pinned</Tag>
                : <Tag size="sm" type="cool-gray">Known</Tag>
            )}
          />
          <Section
            title="Catalogue"
            subtitle="Every shipped, user, and imported device pack"
            rows={catalogueRows}
          />
        </>
      )}
    </div>
  )
}
