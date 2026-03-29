import type { SnapshotDetail } from '../../map2/types'
import { ApiError } from '../../map2/http'
import { snapshotsApi } from '../../map2/clients/snapshots'

export async function fetchLiveSnapshotOrNull(): Promise<SnapshotDetail | null> {
  try {
    return await snapshotsApi.getLive()
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}
