// Snapshot editor MIDI mutations (T2472 mutation extraction — slice 1).
//
// Lifts the start/stop MIDI-learn mutations out of the
// SnapshotEditorPageContent monolith into a sibling hook that pairs
// naturally with `useSnapshotEditorMidiReadQueries`. Both mutations
// share the same dependency surface (`midiApiV2`, the
// `invalidateMidiQueries` callback, the `setMidiLearnActive` store
// setter, and `pushToast`), so co-locating them keeps the hook
// boundary tight.
//
// Cache-key bit-identity is preserved: the `onSuccess` invalidations
// continue to flow through the `invalidateMidiQueries` callback that
// the page already memoizes on `queryClient`, so the WS-driven
// mutation flow works unchanged.

import { useMutation, type UseMutationResult } from '@tanstack/react-query'

import { midiApiV2 } from '../../../map2/api'
import type { NotificationOptions, NotificationTone } from '../../components/Toasts'

export interface MidiLearnStartParams {
  chain_id: number
  plugin_uri: string
  param_symbol: string
  param_index: number
  min_val?: number
  max_val?: number
}

export interface UseSnapshotEditorMidiMutationsArgs {
  invalidateMidiQueries: () => void
  setMidiLearnActive: (active: boolean) => void
  pushToast: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
}

export interface UseSnapshotEditorMidiMutationsResult {
  startMidiLearnMutation: UseMutationResult<unknown, Error, MidiLearnStartParams>
  stopMidiLearnMutation: UseMutationResult<unknown, Error, void>
}

export function useSnapshotEditorMidiMutations({
  invalidateMidiQueries,
  setMidiLearnActive,
  pushToast,
}: UseSnapshotEditorMidiMutationsArgs): UseSnapshotEditorMidiMutationsResult {
  const startMidiLearnMutation = useMutation({
    mutationFn: (params: MidiLearnStartParams) => midiApiV2.startLearn(params),
    onSuccess: () => {
      invalidateMidiQueries()
    },
    onError: (error) => {
      setMidiLearnActive(false)
      pushToast(error instanceof Error ? error.message : 'Failed to start MIDI learn', 'error')
    },
  })

  const stopMidiLearnMutation = useMutation({
    mutationFn: () => midiApiV2.stopLearn(),
    onSuccess: () => {
      setMidiLearnActive(false)
      invalidateMidiQueries()
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to stop MIDI learn', 'error')
    },
  })

  return { startMidiLearnMutation, stopMidiLearnMutation }
}
