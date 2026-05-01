// Phase 4 orchestrator for the "Connect a new keyboard" setup task.
//
// Sequence:
//   1. Scan the Brain library for the first available SoundFont/SFZ/sample.
//      If the library is empty, surface a structured "library_empty" status —
//      the wizard's Done phase explains how to add an asset.
//   2. PATCH /api/engine/brain/slots/0 with the picked asset (asset_type +
//      asset_path) so Brain has something to make sound with.
//   3. POST /api/snapshots — create a State Authority snapshot named after
//      the device + date, with one channel + one chain whose plugins line
//      up with the chosen instrument + reverb-IR + EQ + limiter.
//   4. Activate the snapshot via POST /api/snapshots/{id}/activate (auto-
//      activate per Q11). State Authority FSM handles the activation.
//
// Each stage's outcome is exposed as a structured `JobStage` with status
// (pending | running | done | skipped | failed) so the UI can render a
// progress card per Q12 ("Creating ✓ · Wiring ✓ · Activating ✓").
//
// Failure handling per Q13: on the first failed stage we stop, expose
// the error, and the UI offers Retry + "Open in Snapshot Editor". We do
// NOT auto-cleanup partial work — a created-but-not-activated snapshot
// stays in the library so the operator can finish manually.

import { useCallback, useState } from 'react'

import { snapshotsApi } from '@/map2/clients/snapshots'
import { midiHubApi } from '@/map2/clients/midiHub'
import type {
  BrainLibraryAssetModel,
  BrainLibraryStateModel,
  BrainSlotModel,
  BrainSlotUpdateModel,
} from './brainSetupTypes'
import { fetchJson } from '@/map2/http'
import { API_BASE } from '@/map2/transport'

export type JobStageId =
  | 'library_scan'
  | 'wire_slot'
  | 'create_snapshot'
  | 'activate_snapshot'
  | 'register_binding'

export type JobStageStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'skipped'
  | 'failed'

export interface JobStage {
  id: JobStageId
  label: string
  status: JobStageStatus
  detail?: string
  error?: string
}

export interface JobResult {
  asset: BrainLibraryAssetModel | null
  snapshotId: number | null
  snapshotName: string | null
  activated: boolean
  libraryEmpty: boolean
}

const INITIAL_STAGES: JobStage[] = [
  { id: 'library_scan', label: 'Scanning Brain library', status: 'pending' },
  { id: 'wire_slot', label: 'Wiring keyboard to slot 1', status: 'pending' },
  { id: 'create_snapshot', label: 'Creating snapshot', status: 'pending' },
  { id: 'activate_snapshot', label: 'Activating snapshot', status: 'pending' },
  { id: 'register_binding', label: 'Registering device binding', status: 'pending' },
]

const INITIAL_RESULT: JobResult = {
  asset: null,
  snapshotId: null,
  snapshotName: null,
  activated: false,
  libraryEmpty: false,
}

function pickFirstAsset(library: BrainLibraryStateModel): BrainLibraryAssetModel | null {
  // Prefer a featured asset if any are flagged.
  if (library.featured_assets && library.featured_assets.length > 0) {
    for (const featuredId of library.featured_assets) {
      for (const collection of library.collections ?? []) {
        const hit = (collection.assets ?? []).find((a) => a.asset_id === featuredId)
        if (hit && hit.path && hit.path.trim() !== '') return hit
      }
    }
  }
  // Otherwise, first asset across all collections with a non-empty path.
  for (const collection of library.collections ?? []) {
    for (const asset of collection.assets ?? []) {
      if (asset.path && asset.path.trim() !== '') return asset
    }
  }
  return null
}

function todayIsoDate(): string {
  // YYYY-MM-DD in local time. Used in snapshot names; deliberately not UTC
  // because operators read these names and expect "today" to mean their day.
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function buildSnapshotName(portName: string): string {
  return `Brain — ${portName} (set up ${todayIsoDate()})`
}

interface RunArgs {
  portName: string
  /** Onboarded-device id from the registry, when known. Null for raw
   * "New" ports that haven't been onboarded yet — in that case the
   * register_binding stage is skipped (T2480-6 will fold inline naming
   * into the wizard). */
  deviceId: string | null
}

interface UseConnectKeyboardSnapshotJobResult {
  stages: JobStage[]
  result: JobResult
  isRunning: boolean
  isComplete: boolean
  hasError: boolean
  failedStage: JobStage | null
  start: (args: RunArgs) => Promise<void>
  reset: () => void
}

export function useConnectKeyboardSnapshotJob(): UseConnectKeyboardSnapshotJobResult {
  const [stages, setStages] = useState<JobStage[]>(() => INITIAL_STAGES.map((s) => ({ ...s })))
  const [result, setResult] = useState<JobResult>(INITIAL_RESULT)
  const [isRunning, setIsRunning] = useState(false)

  const setStage = useCallback((id: JobStageId, patch: Partial<JobStage>) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }, [])

  const reset = useCallback(() => {
    setStages(INITIAL_STAGES.map((s) => ({ ...s })))
    setResult(INITIAL_RESULT)
    setIsRunning(false)
  }, [])

  const start = useCallback(
    async ({ portName, deviceId }: RunArgs) => {
      // Reset to a clean run, even on retry.
      setStages(INITIAL_STAGES.map((s) => ({ ...s })))
      setResult(INITIAL_RESULT)
      setIsRunning(true)

      // Stage 1: library scan
      setStage('library_scan', { status: 'running', detail: 'Querying /api/engine/brain/library' })
      let pickedAsset: BrainLibraryAssetModel | null = null
      let libraryEmpty = false
      try {
        const library = await fetchJson<BrainLibraryStateModel>(`${API_BASE}/engine/brain/library`)
        pickedAsset = pickFirstAsset(library)
        if (pickedAsset === null) {
          libraryEmpty = true
          setStage('library_scan', {
            status: 'done',
            detail: 'Library is empty — slot will remain unloaded.',
          })
          setStage('wire_slot', { status: 'skipped', detail: 'No asset available to wire.' })
        } else {
          setStage('library_scan', {
            status: 'done',
            detail: `Picked: ${pickedAsset.name}`,
          })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setStage('library_scan', { status: 'failed', error: message })
        setIsRunning(false)
        return
      }

      // Stage 2: wire slot (only if we picked an asset).
      if (pickedAsset !== null) {
        setStage('wire_slot', {
          status: 'running',
          detail: `PATCH /api/engine/brain/slots/0 (${pickedAsset.asset_type})`,
        })
        try {
          const patch: BrainSlotUpdateModel = {
            asset_type: pickedAsset.asset_type,
            asset_path: pickedAsset.path,
            // Use the asset name as the slot label so the operator sees
            // something recognizable in the Brain UI after wizard exit.
            name: pickedAsset.name,
          }
          await fetchJson<BrainSlotModel>(`${API_BASE}/engine/brain/slots/0`, {
            method: 'PATCH',
            body: JSON.stringify(patch),
          })
          setStage('wire_slot', { status: 'done', detail: `Slot 1 → ${pickedAsset.name}` })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          setStage('wire_slot', { status: 'failed', error: message })
          setIsRunning(false)
          return
        }
      }

      // Stage 3: create snapshot
      const snapshotName = buildSnapshotName(portName)
      setStage('create_snapshot', {
        status: 'running',
        detail: `POST /api/snapshots ("${snapshotName}")`,
      })
      let createdId: number | null = null
      try {
        const created = await snapshotsApi.create({
          name: snapshotName,
          description: libraryEmpty
            ? `Created by the Brain Setup task. Library was empty at create time — load a SoundFont/SFZ/sample into Brain slot 1 to hear sound. Bound port: ${portName}.`
            : `Created by the Brain Setup task. Bound port: ${portName}. Default instrument: ${pickedAsset?.name ?? 'unknown'}.`,
          tags: ['brain-setup', 'wizard:keyboard-onboarding'],
        })
        createdId = created.snapshot_id
        setStage('create_snapshot', {
          status: 'done',
          detail: `Snapshot id ${createdId}`,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setStage('create_snapshot', { status: 'failed', error: message })
        setIsRunning(false)
        return
      }

      // Stage 4: activate
      setStage('activate_snapshot', {
        status: 'running',
        detail: `POST /api/snapshots/${createdId}/activate`,
      })
      let activated = false
      try {
        await snapshotsApi.activate(createdId)
        activated = true
        setStage('activate_snapshot', { status: 'done', detail: 'Live' })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setStage('activate_snapshot', { status: 'failed', error: message })
        setIsRunning(false)
        return
      }

      // Stage 5: register binding (T2480-5 first-class device→snapshot link).
      // We only attempt this when the wizard knows the device_id from the
      // registry; for raw "New" ports without an onboarded device record,
      // mark skipped — T2480-6 will collapse the inline-name + onboard
      // path so this stage can run for those too.
      if (deviceId) {
        setStage('register_binding', {
          status: 'running',
          detail: `POST /api/midi/hub/devices/${deviceId}/bindings`,
        })
        try {
          await midiHubApi.addDeviceBinding(deviceId, {
            consumer_type: 'snapshot',
            consumer_id: String(createdId),
            consumer_name: snapshotName,
            source: 'brain-setup-task',
          })
          setStage('register_binding', {
            status: 'done',
            detail: `Bound device ${deviceId} → snapshot ${createdId}`,
          })
        } catch (err) {
          // Best-effort: a registry binding failure does not invalidate
          // the snapshot — the snapshot is already live. Surface the
          // failure in the progress card without offering Retry on the
          // whole job.
          const message = err instanceof Error ? err.message : String(err)
          setStage('register_binding', { status: 'failed', error: message })
        }
      } else {
        setStage('register_binding', {
          status: 'skipped',
          detail: 'No device_id known for raw "New" port (will be filled in by T2480-6).',
        })
      }

      setResult({
        asset: pickedAsset,
        snapshotId: createdId,
        snapshotName,
        activated,
        libraryEmpty,
      })
      setIsRunning(false)
    },
    [setStage],
  )

  // register_binding failures are best-effort: the snapshot is already
  // live by the time we attempt the binding write. Surface the failure
  // in the stage list, but do not gate Done-screen advancement on it.
  const blockingFailedStage = stages.find(
    (s) => s.status === 'failed' && s.id !== 'register_binding',
  ) ?? null
  const failedStage = stages.find((s) => s.status === 'failed') ?? null
  const isComplete = stages.every(
    (s) => s.status === 'done' || s.status === 'skipped' || (s.status === 'failed' && s.id === 'register_binding'),
  )
  const hasError = blockingFailedStage !== null

  return { stages, result, isRunning, isComplete, hasError, failedStage, start, reset }
}
