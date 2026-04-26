/**
 * T2454 slice 1 — Snapshot Preload Slots panel.
 *
 * Renders the operator-curated 5-slot preload set inside the Snapshot Editor.
 * Each slot shows the pinned snapshot's name, a warm/cold cyan dot, an
 * up/down reorder pair, and an unpin (×) button. Empty slots render as a
 * subtle placeholder; if a `selectedSnapshotId` is provided, an empty slot
 * shows a "Drop here" affordance that pins the selected snapshot into that
 * position on click (when the cap allows it).
 *
 * Drag-and-drop is deferred to slice 1B; up/down arrow reorder is sufficient
 * for an operator-curated 5-element list.
 *
 * Cyan accent comes from the T2444 design-language token `--map2-accent-active`.
 */

import { useCallback, useMemo } from 'react'
import { Tag, Button, IconButton } from '@carbon/react'
import { Pin, ChevronUp, ChevronDown, Close, Add } from '@carbon/icons-react'

import {
  SNAPSHOT_PRELOAD_PIN_LIMIT,
  useSnapshotPreloadPins,
} from '../../hooks/useSnapshotPreloadPins'
import { useSnapshotPreloadStatus } from '../../hooks/useSnapshotPreloadStatus'
import './SnapshotPreloadSlotsPanel.css'

interface SnapshotPreloadSlotsPanelProps {
  /** Map of snapshot id → display name, sourced from the editor's snapshot list. */
  snapshotNamesById: ReadonlyMap<number, string>
  /** Currently-selected snapshot row in the editor. Empty slots offer to pin
   *  this id when the operator clicks the "+" affordance. */
  selectedSnapshotId?: number | null
}

interface SlotView {
  index: number
  snapshotId: number | null
  warm: boolean
  name: string
}

export function SnapshotPreloadSlotsPanel({
  snapshotNamesById,
  selectedSnapshotId,
}: SnapshotPreloadSlotsPanelProps) {
  const { pins, isLoading, error, isCapReached, pin, unpin, reorder } = useSnapshotPreloadPins()
  const { isWarm, refetch: refetchStatus } = useSnapshotPreloadStatus()

  const slots = useMemo<SlotView[]>(() => {
    const filled: SlotView[] = pins.map((snapshotId, index) => ({
      index,
      snapshotId,
      warm: isWarm(snapshotId),
      name: snapshotNamesById.get(snapshotId) ?? `Snapshot ${snapshotId}`,
    }))
    while (filled.length < SNAPSHOT_PRELOAD_PIN_LIMIT) {
      filled.push({
        index: filled.length,
        snapshotId: null,
        warm: false,
        name: '',
      })
    }
    return filled
  }, [pins, isWarm, snapshotNamesById])

  const handleMove = useCallback(
    async (fromIndex: number, direction: -1 | 1) => {
      const toIndex = fromIndex + direction
      if (toIndex < 0 || toIndex >= pins.length) return
      const next = [...pins]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      await reorder(next)
    },
    [pins, reorder],
  )

  const handleUnpin = useCallback(
    async (snapshotId: number) => {
      await unpin(snapshotId)
      // Server eviction lags by one reconciler tick; nudge the status query
      // so the UI doesn't keep showing the warm dot for an unpinned slot.
      refetchStatus()
    },
    [unpin, refetchStatus],
  )

  const handlePinSelected = useCallback(async () => {
    if (selectedSnapshotId == null) return
    const result = await pin(selectedSnapshotId)
    if (result.ok) {
      refetchStatus()
    }
  }, [selectedSnapshotId, pin, refetchStatus])

  const canPinSelected =
    selectedSnapshotId != null &&
    Number.isInteger(selectedSnapshotId) &&
    !pins.includes(selectedSnapshotId) &&
    !isCapReached

  return (
    <section className="snapshot-preload-slots" aria-label="Snapshot preload slots">
      <header className="snapshot-preload-slots__head">
        <div className="snapshot-preload-slots__head-left">
          <Pin size={14} aria-hidden />
          <h3 className="snapshot-preload-slots__title">Preload Slots</h3>
        </div>
        <Tag size="sm" type={isCapReached ? 'cyan' : 'gray'}>
          {pins.length}/{SNAPSHOT_PRELOAD_PIN_LIMIT}
        </Tag>
      </header>

      {error ? (
        <p className="snapshot-preload-slots__error" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="snapshot-preload-slots__list">
        {slots.map((slot) => {
          const isFilled = slot.snapshotId != null
          return (
            <li
              key={`slot-${slot.index}`}
              className={`snapshot-preload-slots__row${isFilled ? ' snapshot-preload-slots__row--filled' : ' snapshot-preload-slots__row--empty'}`}
              data-warm={slot.warm ? 'true' : 'false'}
            >
              <span className="snapshot-preload-slots__index" aria-hidden>
                {slot.index + 1}
              </span>
              {isFilled ? (
                <>
                  <span
                    className="snapshot-preload-slots__dot"
                    data-warm={slot.warm ? 'true' : 'false'}
                    aria-hidden
                  />
                  <span className="snapshot-preload-slots__name" title={slot.name}>
                    {slot.name}
                  </span>
                  <span className="snapshot-preload-slots__state" aria-live="polite">
                    {slot.warm ? 'Warm' : 'Cold'}
                  </span>
                  <span className="snapshot-preload-slots__row-actions">
                    <IconButton
                      kind="ghost"
                      size="sm"
                      label="Move up"
                      disabled={slot.index === 0 || isLoading}
                      onClick={() => void handleMove(slot.index, -1)}
                    >
                      <ChevronUp />
                    </IconButton>
                    <IconButton
                      kind="ghost"
                      size="sm"
                      label="Move down"
                      disabled={slot.index >= pins.length - 1 || isLoading}
                      onClick={() => void handleMove(slot.index, 1)}
                    >
                      <ChevronDown />
                    </IconButton>
                    <IconButton
                      kind="ghost"
                      size="sm"
                      label="Unpin"
                      disabled={isLoading}
                      onClick={() => void handleUnpin(slot.snapshotId as number)}
                    >
                      <Close />
                    </IconButton>
                  </span>
                </>
              ) : (
                <>
                  <span className="snapshot-preload-slots__placeholder">Empty slot</span>
                  {canPinSelected && slot.index === pins.length ? (
                    <Button
                      kind="ghost"
                      size="sm"
                      renderIcon={Add}
                      onClick={() => void handlePinSelected()}
                    >
                      Add selected
                    </Button>
                  ) : null}
                </>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
