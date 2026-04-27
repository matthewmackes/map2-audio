// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// DeviceCard — T2459-G4 Hardware Store card with locked Q6/Q11/Q12/Q15 surfaces.
//
// Q6: 4-button card actions: Open, Pin, Configure, Identify-or-Test.
// Q11: hot-plug pulse animation triggered when the row's profile key
//      matches the latest WS event timestamp.
// Q12: severity-tinted disconnect badge — "warning" tone for first 30s,
//      "warm-gray" once moved to the Recently disconnected section.
// Q15: single source tag (shipped / user / imported) on the card.

import * as React from 'react'
import { Button, Tag, Tile } from '@carbon/react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'

import { pinDeviceProfile, unpinDeviceProfile } from '../../../map2/clients/devices'
import { useUndoToast } from './hooks/useUndoToast'
import { useToasts } from '../Toasts'

import './DeviceCard.css'

export type DeviceCardSourceLabel = 'shipped' | 'user' | 'imported' | undefined

export interface DeviceCardRow {
  profileKey: string
  packId: string
  model: string
  kind: 'audio' | 'midi' | 'hid'
  vendor?: string
  source?: DeviceCardSourceLabel
  isDegraded?: boolean
  isConnected: boolean
  isPinned: boolean
  /** Set by the page when the row is in the recently-disconnected window
   * (Q12 grace state). Drives the severity-tinted "Disconnected" badge. */
  recentlyDisconnected?: boolean
  lastSeenAt: number | null
  /** Hot-plug pulse trigger — when this changes, the card briefly
   * highlights itself. Pages set this to the WS lastEvent.timestamp
   * scoped to events that match this row. */
  pulseToken?: number
  /** T2459-G8 — diagnostic count + worst severity scoped to this
   * device's pack, surfaced as a Carbon Tag on the card. The page
   * computes this from `useDeviceDiagnostics`. */
  diagnosticCount?: number
  diagnosticWorstSeverity?: 'info' | 'warning' | 'error'
}

export interface DeviceCardProps {
  row: DeviceCardRow
  /** Optional refresh callback fired after pin/unpin completes so the
   * page can re-fetch the known/connected lists if it isn't already
   * driven by the WS. */
  onPinChanged?: () => void
}

const SOURCE_TAG_TYPE: Record<NonNullable<DeviceCardSourceLabel>, string> = {
  shipped: 'green',
  user: 'cyan',
  imported: 'magenta',
}

const SOURCE_TAG_LABEL: Record<NonNullable<DeviceCardSourceLabel>, string> = {
  shipped: 'Shipped',
  user: 'User',
  imported: 'Imported',
}

function formatLastSeen(ts: number | null): string {
  if (ts === null) return '—'
  const ago = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (ago < 60) return `${ago}s ago`
  if (ago < 3600) return `${Math.floor(ago / 60)}m ago`
  if (ago < 86400) return `${Math.floor(ago / 3600)}h ago`
  return `${Math.floor(ago / 86400)}d ago`
}

export function DeviceCard({ row, onPinChanged }: DeviceCardProps): React.JSX.Element {
  const navigate = useNavigate()
  const { showUndo } = useUndoToast()
  const { pushToast } = useToasts()
  const [pulseActive, setPulseActive] = React.useState(false)

  // Hot-plug pulse: trigger the highlight when pulseToken changes.
  React.useEffect(() => {
    if (!row.pulseToken) return
    setPulseActive(true)
    const t = window.setTimeout(() => setPulseActive(false), 1200)
    return () => window.clearTimeout(t)
  }, [row.pulseToken])

  // ---- Q6 actions -----------------------------------------------------

  const handleOpen = React.useCallback(() => {
    navigate(
      `/devices/profile/${encodeURIComponent(row.packId)}/${encodeURIComponent(row.model)}`,
    )
  }, [navigate, row.packId, row.model])

  const handleConfigure = React.useCallback(() => {
    navigate(
      `/devices/profile/${encodeURIComponent(row.packId)}/${encodeURIComponent(row.model)}/learn`,
    )
  }, [navigate, row.packId, row.model])

  const handleIdentifyOrTest = React.useCallback(() => {
    if (row.kind === 'audio') {
      // G6 wires the loopback measurement; for now route to the device
      // page and surface the intent so operators see the path.
      pushToast(
        `Latency test for ${row.model} lands in T2459-G6 (Audio I/O tab).`,
        'info',
        { durationMs: 4000 },
      )
      navigate(
        `/devices/profile/${encodeURIComponent(row.packId)}/${encodeURIComponent(row.model)}#audio-io`,
      )
    } else {
      pushToast(`MIDI Identify ping for ${row.model}: queued (G7).`, 'info', {
        durationMs: 4000,
      })
    }
  }, [row.kind, row.packId, row.model, pushToast, navigate])

  const handleTogglePin = React.useCallback(async () => {
    if (row.isPinned) {
      try {
        await unpinDeviceProfile(row.profileKey)
        showUndo({
          message: `Unpinned ${row.model}.`,
          onUndo: async () => {
            await pinDeviceProfile(row.profileKey)
            onPinChanged?.()
          },
        })
        onPinChanged?.()
      } catch (err) {
        pushToast(
          `Could not unpin ${row.model}: ${(err as Error).message ?? 'request failed'}.`,
          'error',
          { durationMs: 5000 },
        )
      }
    } else {
      try {
        await pinDeviceProfile(row.profileKey)
        showUndo({
          message: `Pinned ${row.model} to bench.`,
          onUndo: async () => {
            await unpinDeviceProfile(row.profileKey)
            onPinChanged?.()
          },
        })
        onPinChanged?.()
      } catch (err) {
        pushToast(
          `Could not pin ${row.model}: ${(err as Error).message ?? 'request failed'}.`,
          'error',
          { durationMs: 5000 },
        )
      }
    }
  }, [row.isPinned, row.profileKey, row.model, showUndo, onPinChanged, pushToast])

  // ---- Render ---------------------------------------------------------

  const sourceTag = row.source ? (
    <Tag size="sm" type={SOURCE_TAG_TYPE[row.source] as never}>
      {SOURCE_TAG_LABEL[row.source]}
    </Tag>
  ) : null

  const statusBadge = row.isConnected ? (
    <Tag size="sm" type="green">Connected</Tag>
  ) : row.recentlyDisconnected ? (
    <Tag size="sm" type="red">Disconnected (recent)</Tag>
  ) : null

  return (
    <Tile
      className={`device-card${pulseActive ? ' device-card--pulse' : ''}${row.isConnected ? ' device-card--connected' : ''}`}
      data-profile-key={row.profileKey}
      data-pinned={row.isPinned ? 'true' : 'false'}
      data-connected={row.isConnected ? 'true' : 'false'}
      data-recently-disconnected={row.recentlyDisconnected ? 'true' : 'false'}
    >
      <div className="device-card__head">
        <div className="device-card__title">
          <RouterLink
            to={`/devices/profile/${encodeURIComponent(row.packId)}/${encodeURIComponent(row.model)}`}
            className="device-card__model-link"
          >
            <span className="device-card__model">{row.model}</span>
          </RouterLink>
          <span className="device-card__vendor">{row.vendor ?? row.packId}</span>
        </div>
        {statusBadge}
      </div>

      <div className="device-card__tags">
        <Tag size="sm" type="cool-gray">{row.kind}</Tag>
        {sourceTag}
        {row.isPinned ? <Tag size="sm" type="purple">Pinned</Tag> : null}
        {row.isDegraded ? <Tag size="sm" type="warm-gray">Pack degraded</Tag> : null}
        {row.diagnosticCount && row.diagnosticCount > 0 && row.diagnosticWorstSeverity ? (
          <Tag
            size="sm"
            type={
              row.diagnosticWorstSeverity === 'error' ? 'red'
              : row.diagnosticWorstSeverity === 'warning' ? 'warm-gray'
              : 'gray'
            }
          >
            {row.diagnosticCount} {row.diagnosticWorstSeverity}
            {row.diagnosticCount > 1 ? 's' : ''}
          </Tag>
        ) : null}
      </div>

      {row.lastSeenAt !== null && !row.isConnected ? (
        <p className="device-card__last-seen">Last seen {formatLastSeen(row.lastSeenAt)}</p>
      ) : null}

      <div className="device-card__actions" role="group" aria-label={`${row.model} actions`}>
        <Button kind="primary" size="sm" onClick={handleOpen}>Open</Button>
        <Button
          kind={row.isPinned ? 'danger--ghost' : 'tertiary'}
          size="sm"
          onClick={handleTogglePin}
        >
          {row.isPinned ? 'Unpin' : 'Pin'}
        </Button>
        <Button kind="ghost" size="sm" onClick={handleConfigure}>Configure</Button>
        <Button kind="ghost" size="sm" onClick={handleIdentifyOrTest}>
          {row.kind === 'audio' ? 'Test latency' : 'Identify'}
        </Button>
      </div>
    </Tile>
  )
}
