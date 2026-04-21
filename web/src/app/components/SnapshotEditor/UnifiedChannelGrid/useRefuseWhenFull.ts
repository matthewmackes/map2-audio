import { useCallback } from 'react'

import type { NotificationTone } from '../../Toasts'
import { SLOT_COUNT, type UnifiedChannelRow } from './gridConstants'

export const REFUSE_WHEN_FULL_MESSAGE = 'Channel is full — remove a block first'

export function isRowFull(row: UnifiedChannelRow, slotCount: number = SLOT_COUNT): boolean {
  let occupied = 0
  for (const slot of row.slots) {
    if (slot.kind) occupied += 1
  }
  return occupied >= slotCount
}

export interface RefuseWhenFullResult {
  refused: boolean
}

export type PushToastFn = (
  message: string,
  tone?: NotificationTone,
  options?: { title?: string; durationMs?: number },
) => string | void

/**
 * Returns a guard that the caller invokes before committing an add. If the
 * target row is full, the injected `pushToast` is called with a warn
 * notification and the guard returns `{ refused: true }`; otherwise
 * `{ refused: false }`.
 *
 * The toast function is passed in (rather than pulled from
 * `useNotifications` inside the hook) so unit tests can exercise the
 * refusal path without bringing up the full NotificationProvider context
 * tree (QueryClient + Router + WebSocket).
 */
export function useRefuseWhenFull(
  pushToast: PushToastFn,
  slotCount: number = SLOT_COUNT,
) {
  return useCallback(
    (row: UnifiedChannelRow): RefuseWhenFullResult => {
      if (isRowFull(row, slotCount)) {
        pushToast(REFUSE_WHEN_FULL_MESSAGE, 'warn', {
          title: 'Cannot add block',
          durationMs: 4000,
        })
        return { refused: true }
      }
      return { refused: false }
    },
    [pushToast, slotCount],
  )
}
