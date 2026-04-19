import type { SnapshotDraftData } from '../../map2/types'
import { fingerprintSnapshotData } from '../components/SnapshotEditor/snapshotEditorComparison'

const LIVE_WORKING_SNAPSHOT_DRAFT_STORAGE_KEY = 'map2.snapshot-live-working-drafts.v1'

export interface LiveWorkingSnapshotDraftRecord {
  version: 1
  snapshotId: number
  snapshotName: string | null
  baseFingerprint: string
  workingFingerprint: string
  draft: SnapshotDraftData
  updatedAt: string
}

interface LiveWorkingSnapshotDraftStoragePayload {
  version: 1
  drafts: Record<string, LiveWorkingSnapshotDraftRecord>
}

function readStoragePayload(): LiveWorkingSnapshotDraftStoragePayload | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(LIVE_WORKING_SNAPSHOT_DRAFT_STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as Partial<LiveWorkingSnapshotDraftStoragePayload>
    if (parsed?.version !== 1 || !parsed.drafts || typeof parsed.drafts !== 'object') {
      return null
    }
    return {
      version: 1,
      drafts: parsed.drafts as Record<string, LiveWorkingSnapshotDraftRecord>,
    }
  } catch {
    return null
  }
}

function writeStoragePayload(payload: LiveWorkingSnapshotDraftStoragePayload) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (Object.keys(payload.drafts).length === 0) {
      window.localStorage.removeItem(LIVE_WORKING_SNAPSHOT_DRAFT_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(LIVE_WORKING_SNAPSHOT_DRAFT_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    return
  }
}

function isRecordShape(value: unknown): value is LiveWorkingSnapshotDraftRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Partial<LiveWorkingSnapshotDraftRecord>
  return record.version === 1
    && Number.isInteger(record.snapshotId)
    && typeof record.baseFingerprint === 'string'
    && typeof record.workingFingerprint === 'string'
    && typeof record.updatedAt === 'string'
    && record.draft != null
    && typeof record.draft === 'object'
}

export function readLiveWorkingSnapshotDraft(snapshotId: number): LiveWorkingSnapshotDraftRecord | null {
  const payload = readStoragePayload()
  if (!payload) {
    return null
  }

  const record = payload.drafts[String(snapshotId)]
  return isRecordShape(record) ? record : null
}

export function readCompatibleLiveWorkingSnapshotDraft(
  snapshotId: number,
  baseFingerprint: string,
): LiveWorkingSnapshotDraftRecord | null {
  const record = readLiveWorkingSnapshotDraft(snapshotId)
  if (!record) {
    return null
  }
  return record.baseFingerprint === baseFingerprint ? record : null
}

export function writeLiveWorkingSnapshotDraft(input: {
  snapshotId: number
  snapshotName?: string | null
  baseFingerprint: string
  draft: SnapshotDraftData
}) {
  const payload = readStoragePayload() ?? {
    version: 1 as const,
    drafts: {},
  }

  payload.drafts[String(input.snapshotId)] = {
    version: 1,
    snapshotId: input.snapshotId,
    snapshotName: input.snapshotName ?? null,
    baseFingerprint: input.baseFingerprint,
    workingFingerprint: fingerprintSnapshotData(input.draft),
    draft: JSON.parse(JSON.stringify(input.draft)) as SnapshotDraftData,
    updatedAt: new Date().toISOString(),
  }

  writeStoragePayload(payload)
}

export function clearLiveWorkingSnapshotDraft(snapshotId: number) {
  const payload = readStoragePayload()
  if (!payload) {
    return
  }

  delete payload.drafts[String(snapshotId)]
  writeStoragePayload(payload)
}

export function clearAllLiveWorkingSnapshotDrafts() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(LIVE_WORKING_SNAPSHOT_DRAFT_STORAGE_KEY)
  } catch {
    return
  }
}

export const LIVE_WORKING_SNAPSHOT_DRAFT_TEST_ONLY = {
  STORAGE_KEY: LIVE_WORKING_SNAPSHOT_DRAFT_STORAGE_KEY,
}
