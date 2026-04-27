/**
 * useUndoToast — Q13 8s Undo toast hook.
 *
 * T2459-G4. Schedules an "operator just changed something live"
 * toast that surfaces an Undo action for `timeoutMs` (default 8s).
 * After the timeout the toast fades and the undo handler is no
 * longer reachable from the UI.
 *
 * Wraps the existing app-wide Carbon toast queue (`useToasts`) so
 * the visual treatment matches Pin/Unpin and MPX1 A/B compare.
 */

import { useCallback, useRef } from 'react'
import { useToasts } from '../../Toasts'

export interface UndoToastOptions {
  message: string
  /** ms before the undo affordance disappears. Default 8000. */
  timeoutMs?: number
  onUndo: () => void | Promise<void>
}

export function useUndoToast() {
  const { pushToast, dismissToast } = useToasts()
  const lastIdRef = useRef<string | null>(null)

  const showUndo = useCallback(
    (opts: UndoToastOptions) => {
      const timeoutMs = opts.timeoutMs ?? 8000
      let undoToken = ''
      const id = pushToast(opts.message, 'info', {
        durationMs: timeoutMs,
        action: {
          label: 'Undo',
          onClick: () => {
            void Promise.resolve(opts.onUndo()).finally(() => {
              dismissToast(undoToken)
            })
          },
        },
      })
      undoToken = id
      lastIdRef.current = id
      return id
    },
    [pushToast, dismissToast],
  )

  const dismissLast = useCallback(() => {
    if (lastIdRef.current) {
      dismissToast(lastIdRef.current)
      lastIdRef.current = null
    }
  }, [dismissToast])

  return { showUndo, dismissLast }
}
