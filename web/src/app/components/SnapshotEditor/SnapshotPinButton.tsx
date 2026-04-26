/**
 * T2454-D — Carbon `Pin` icon button for per-row pinning on the snapshot
 * library / artifacts page (and any other surface that renders a snapshot
 * row). Cyan-fill when pinned. Disabled with a tooltip when the operator's
 * pin set is at cap (5/5).
 *
 * Self-contained: subscribes to `useSnapshotPreloadPins` and
 * `useSnapshotPreloadStatus` directly so callers only need to pass the
 * snapshot id. The hooks already debounce updates through Special Settings
 * + Raft, so spamming pin/unpin is safe.
 */

import { useCallback, useState } from 'react'
import { Button } from '@carbon/react'
import { Pin, PinFilled } from '@carbon/icons-react'

import {
  SNAPSHOT_PRELOAD_PIN_LIMIT,
  useSnapshotPreloadPins,
} from '../../hooks/useSnapshotPreloadPins'
import { useSnapshotPreloadStatus } from '../../hooks/useSnapshotPreloadStatus'

export interface SnapshotPinButtonProps {
  snapshotId: number
  /** Carbon Button size override — defaults to 'sm' to fit table action rows. */
  size?: 'sm' | 'md' | 'lg'
}

export function SnapshotPinButton({ snapshotId, size = 'sm' }: SnapshotPinButtonProps) {
  const { isPinned, isCapReached, pin, unpin } = useSnapshotPreloadPins()
  const { preloadNow, refetch } = useSnapshotPreloadStatus()
  const [isBusy, setIsBusy] = useState(false)
  const pinned = isPinned(snapshotId)

  const handleClick = useCallback(async () => {
    setIsBusy(true)
    try {
      if (pinned) {
        await unpin(snapshotId)
      } else {
        const result = await pin(snapshotId)
        if (result.ok) {
          // Kick the orchestrator so the new pin warms within ~ms instead of
          // waiting for the next reconciler tick. Best-effort — silent on
          // failure since the reconciler will retry.
          try {
            await preloadNow(snapshotId)
          } catch {
            // ignore — reconciler retries
          }
        }
      }
      refetch()
    } finally {
      setIsBusy(false)
    }
  }, [pinned, snapshotId, pin, unpin, preloadNow, refetch])

  // The cap only blocks adding new pins — unpinning a pinned snapshot is
  // always available.
  const disabled = isBusy || (!pinned && isCapReached)
  const description = pinned
    ? 'Unpin from preload slots'
    : isCapReached
    ? `Pin set full (${SNAPSHOT_PRELOAD_PIN_LIMIT}/${SNAPSHOT_PRELOAD_PIN_LIMIT})`
    : 'Pin to preload slots'

  return (
    <Button
      size={size}
      kind="ghost"
      renderIcon={pinned ? PinFilled : Pin}
      iconDescription={description}
      hasIconOnly
      onClick={() => void handleClick()}
      disabled={disabled}
      aria-pressed={pinned}
      data-pinned={pinned ? 'true' : 'false'}
      className="snapshot-pin-button"
    />
  )
}
