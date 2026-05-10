// Snapshot editor MIDI mutations.
//
// T2459-H8 (2026-05-10) — cutover from the legacy `midi_v2.py` learn
// path to the canonical `MidiBinding` authority. Bindings authored
// inside the Snapshot Editor for plugin parameters now write through
// `midiBindingsApi.create(...)` with `consumer_type='plugin_param'`,
// `scope='snapshot'`, `scope_id=<active snapshot id>` so they
// surface on the `/midi/bindings` page filtered by
// `consumer_type=plugin_param`. The Snapshot Editor's inline learn
// UX is unchanged — only the backing API call.
//
// Prior contract (kept as comments here for reviewers retiring the
// legacy route): `midiApiV2.startLearn(params)` armed the server
// listener; `midiApiV2.stopLearn()` cancelled it. The legacy route
// wrote to `MIDIMapping` (a parallel store the `/midi/bindings` page
// never queries), which is why the user could create a binding in
// the editor and not see it on the Bindings page.
//
// New flow:
//   start: arm a 250ms × 10s poll of `/api/midi/bindings/learn/last-cc`
//          (same shape as `useMidiLearnPoll`). On first observed CC
//          newer than start time, POST a canonical binding and resolve.
//   stop:  abort the in-flight poll. Resolves locally; no backend
//          round-trip needed.

import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'

import {
  midiBindingsApi,
  type MidiBindingCreate,
  type MidiBindingRead,
} from '../../../map2/clients/midiBindings'
import type { NotificationOptions, NotificationTone } from '../../components/Toasts'

const POLL_INTERVAL_MS = 250
const POLL_TIMEOUT_MS = 10_000

export interface MidiLearnStartParams {
  chain_id: number
  plugin_uri: string
  param_symbol: string
  param_index: number
  min_val?: number
  max_val?: number
}

export interface UseSnapshotEditorMidiMutationsArgs {
  /**
   * The currently-active snapshot id. Bindings are scoped to this
   * snapshot so they fire only when that snapshot is live. When
   * null/undefined, start is a no-op (the editor's outer guard
   * already toasts in that case, but we double-check here so a
   * race can't write a global-scope binding by accident).
   */
  activeSnapshotId: number | null | undefined
  invalidateMidiQueries: () => void
  setMidiLearnActive: (active: boolean) => void
  pushToast: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
}

export interface UseSnapshotEditorMidiMutationsResult {
  startMidiLearnMutation: UseMutationResult<MidiBindingRead | null, Error, MidiLearnStartParams>
  stopMidiLearnMutation: UseMutationResult<void, Error, void>
}

// Compose the canonical consumer_id used by the plugin_param
// projection (`app/services/midi/projections/plugin_param.py::make_consumer_id`).
// Keep the format bit-identical so a binding written here lists
// alongside any binding the backend produces for the same param.
function makePluginParamConsumerId(
  chainId: number,
  pluginUri: string,
  paramIndex: number,
): string {
  return `${chainId}:${pluginUri}:${paramIndex}`
}

// Inline poll loop mirroring `useMidiLearnPoll` (which is a hook and
// therefore can't be composed inside a `mutationFn`). Resolves with
// the first non-stale CC observation, or `null` on timeout/abort.
async function pollForLearnCc(
  startedAtSec: number,
  signal: AbortSignal,
): Promise<{ channel: number | null; cc: number; value: number } | null> {
  return new Promise((resolve) => {
    const cleanup = (
      intervalHandle: ReturnType<typeof setInterval> | null,
      timeoutHandle: ReturnType<typeof setTimeout> | null,
    ) => {
      if (intervalHandle !== null) clearInterval(intervalHandle)
      if (timeoutHandle !== null) clearTimeout(timeoutHandle)
    }

    let intervalHandle: ReturnType<typeof setInterval> | null = null
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null

    const onAbort = () => {
      cleanup(intervalHandle, timeoutHandle)
      resolve(null)
    }
    if (signal.aborted) {
      resolve(null)
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })

    intervalHandle = setInterval(async () => {
      try {
        const response = await midiBindingsApi.lastCc()
        if (response && response.observed_at > startedAtSec) {
          cleanup(intervalHandle, timeoutHandle)
          signal.removeEventListener('abort', onAbort)
          resolve({ channel: response.channel, cc: response.cc, value: response.value })
        }
      } catch {
        // Transient network error: keep polling until timeout.
      }
    }, POLL_INTERVAL_MS)

    timeoutHandle = setTimeout(() => {
      cleanup(intervalHandle, timeoutHandle)
      signal.removeEventListener('abort', onAbort)
      resolve(null)
    }, POLL_TIMEOUT_MS)
  })
}

export function useSnapshotEditorMidiMutations({
  activeSnapshotId,
  invalidateMidiQueries,
  setMidiLearnActive,
  pushToast,
}: UseSnapshotEditorMidiMutationsArgs): UseSnapshotEditorMidiMutationsResult {
  // Cross-mutation abort handle: stop signals the in-flight start.
  const abortRef = useRef<AbortController | null>(null)

  const cancelInflight = useCallback(() => {
    if (abortRef.current !== null) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  const startMidiLearnMutation = useMutation<MidiBindingRead | null, Error, MidiLearnStartParams>({
    mutationFn: async (params) => {
      if (activeSnapshotId == null) {
        // Guard mirrors the outer callsite's "select a block" toast;
        // bail without a network call so we never write a global-scope
        // binding from a snapshot-scoped UI.
        throw new Error('Cannot author a snapshot binding without an active snapshot.')
      }

      cancelInflight()
      const controller = new AbortController()
      abortRef.current = controller

      const startedAtSec = Date.now() / 1000
      const captured = await pollForLearnCc(startedAtSec, controller.signal)
      if (controller.signal.aborted) {
        return null
      }
      if (captured === null) {
        throw new Error('MIDI learn timed out — no controller activity in 10s.')
      }

      const consumerId = makePluginParamConsumerId(
        params.chain_id,
        params.plugin_uri,
        params.param_index,
      )
      const sourceDescriptor: Record<string, unknown> = {
        cc: captured.cc,
      }
      if (captured.channel !== null) {
        sourceDescriptor.channel = captured.channel
      }
      if (params.min_val !== undefined) sourceDescriptor.min = params.min_val
      if (params.max_val !== undefined) sourceDescriptor.max = params.max_val

      const targetDescriptor: Record<string, unknown> = {
        chain_id: params.chain_id,
        plugin_uri: params.plugin_uri,
        param_index: params.param_index,
        parameter_symbol: params.param_symbol,
      }

      const payload: MidiBindingCreate = {
        consumer_type: 'plugin_param',
        consumer_id: consumerId,
        consumer_label: `chain ${params.chain_id} param ${params.param_index}`,
        source_type: 'midi_cc',
        source_descriptor: sourceDescriptor,
        target_type: 'engine_param',
        target_descriptor: targetDescriptor,
        scope: 'snapshot',
        scope_id: String(activeSnapshotId),
        enabled: true,
        source: 'snapshot-editor',
        created_by: 'snapshot-editor',
      }

      const created = await midiBindingsApi.create(payload)
      return created
    },
    onSuccess: (binding) => {
      // `null` here means stop() aborted mid-poll; we already cleared
      // the learn-active flag in that path. On a real capture, drop
      // the flag and refresh both editor-side and bindings-page caches.
      if (binding !== null) {
        setMidiLearnActive(false)
      }
      abortRef.current = null
      invalidateMidiQueries()
    },
    onError: (error) => {
      abortRef.current = null
      setMidiLearnActive(false)
      pushToast(error instanceof Error ? error.message : 'Failed to start MIDI learn', 'error')
    },
  })

  const stopMidiLearnMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      cancelInflight()
    },
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
