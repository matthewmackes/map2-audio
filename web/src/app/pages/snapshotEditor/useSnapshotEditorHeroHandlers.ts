/**
 * T2473 cycle 33 — hero-card handler extraction.
 *
 * Lifts the two operator-facing handlers wired into the SnapshotEditor
 * hero card off the monolith:
 *
 *   • `copyMetadataValue(value)` — write a metadata field to the
 *     clipboard with toast feedback. Used by the hero's copy-to-
 *     clipboard affordance on the snapshot ID / revision number /
 *     authority labels.
 *   • `navigateToPublishPage()` — route to `/snapshots/<id>/publish`
 *     for the active snapshot. No-op if there's no active snapshot.
 *
 * Behavioral parity verbatim:
 *   • Toast messages: "Copied to clipboard" / "Clipboard copy blocked
 *     by browser" / "Clipboard not available" — same triplet the
 *     monolith emitted.
 *   • `void navigator.clipboard.writeText(...)` is intentionally
 *     fire-and-forget (the success/failure toast lands via the .then
 *     handlers; we never await it).
 *   • `navigate` is the `react-router-dom` `useNavigate()` instance
 *     supplied by the page; this hook does not call `useNavigate`
 *     itself so a test can mock navigation cleanly.
 */

import { useCallback } from 'react'

import type { SnapshotDetail } from '../../../map2/types'
import type { NotificationTone } from '../../components/Toasts'

interface UseSnapshotEditorHeroHandlersArgs {
  /**
   * The active SnapshotDetail used by the hero card. `null` while no
   * snapshot is loaded; the publish navigation handler short-circuits
   * in that case so the operator's click is a safe no-op.
   */
  activeSnapshot: SnapshotDetail | null
  navigate: (path: string) => void
  pushToast: (message: string, tone: NotificationTone) => void
}

export interface SnapshotEditorHeroHandlers {
  handleHeroCopyMetadataValue: (value: string) => void
  handleHeroNavigateToPublishPage: () => void
}

export function useSnapshotEditorHeroHandlers({
  activeSnapshot,
  navigate,
  pushToast,
}: UseSnapshotEditorHeroHandlersArgs): SnapshotEditorHeroHandlers {
  const handleHeroCopyMetadataValue = useCallback(
    (value: string) => {
      if (!value) return
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(value).then(
          () => pushToast('Copied to clipboard', 'success'),
          () => pushToast('Clipboard copy blocked by browser', 'warn'),
        )
        return
      }
      pushToast('Clipboard not available', 'warn')
    },
    [pushToast],
  )

  const handleHeroNavigateToPublishPage = useCallback(() => {
    if (!activeSnapshot) return
    navigate(`/snapshots/${activeSnapshot.id}/publish`)
  }, [activeSnapshot, navigate])

  return { handleHeroCopyMetadataValue, handleHeroNavigateToPublishPage }
}
