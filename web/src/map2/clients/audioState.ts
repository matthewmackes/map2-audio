import { fetchJson } from '../http'
import { API_BASE } from '../transport'
import type {
  ActivateSnapshotIntoAudioStateRequest,
  AudioStateObservation,
  AudioStateObservationListResponse,
  AudioStateObservationEnvelope,
  AudioStateRouteStatus,
  AuthoritativeAudioStateEnvelope,
  DesiredAudioStateEnvelope,
  SubmitDesiredAudioStateRequest,
} from '../types'

export const audioStateApi = {
  getStatus: () => fetchJson<AudioStateRouteStatus>(`${API_BASE}/audio/state/status`),
  getCommitted: () => fetchJson<AuthoritativeAudioStateEnvelope>(`${API_BASE}/audio/state/committed`),
  getDesired: () => fetchJson<DesiredAudioStateEnvelope>(`${API_BASE}/audio/state/desired`),
  putDesired: (request: SubmitDesiredAudioStateRequest) => fetchJson<AuthoritativeAudioStateEnvelope>(`${API_BASE}/audio/state/desired`, {
    method: 'PUT',
    body: JSON.stringify(request),
  }),
  getObserved: (stateVersion?: number) => fetchJson<AudioStateObservationListResponse>(
    `${API_BASE}/audio/state/observed${typeof stateVersion === 'number' ? `?state_version=${encodeURIComponent(String(stateVersion))}` : ''}`,
  ),
  putObserved: (nodeId: string, observation: AudioStateObservation) => fetchJson<AudioStateObservationEnvelope>(
    `${API_BASE}/audio/state/observed/${encodeURIComponent(nodeId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(observation),
    },
  ),
  reconcileCommitted: () => fetchJson<AuthoritativeAudioStateEnvelope>(`${API_BASE}/audio/state/reconcile`, {
    method: 'POST',
  }),
  activateSnapshot: (snapshotId: number, request: ActivateSnapshotIntoAudioStateRequest) => fetchJson<AuthoritativeAudioStateEnvelope>(
    `${API_BASE}/audio/state/snapshots/${encodeURIComponent(String(snapshotId))}/activate`,
    {
      method: 'POST',
      body: JSON.stringify(request),
    },
  ),
}
