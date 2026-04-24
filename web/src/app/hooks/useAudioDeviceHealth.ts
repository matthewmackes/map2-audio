import { useQuery } from '@tanstack/react-query'

import { fetchJson } from '../../map2/http'
import { API_BASE } from '../../map2/transport'

/** T2451: shape returned by /api/audio/device-health. */
export interface AudioDeviceHealth {
  available: boolean
  running: boolean
  device_connected: boolean
  device_name: string | null
  sample_rate: number | null
  buffer_size: number | null
  last_error: string | null
  recovery_attempts: number
}

export function useAudioDeviceHealth(options: { enabled?: boolean; refetchInterval?: number | false } = {}) {
  const { enabled = true, refetchInterval = 1_000 } = options
  return useQuery<AudioDeviceHealth>({
    queryKey: ['audio', 'device-health'],
    queryFn: () => fetchJson<AudioDeviceHealth>(`${API_BASE}/audio/device-health`, { cache: 'no-store' }),
    enabled,
    staleTime: 500,
    refetchInterval,
  })
}

export async function recoverAudioDevice(): Promise<AudioDeviceHealth> {
  return fetchJson<AudioDeviceHealth>(`${API_BASE}/audio/device/recover`, {
    method: 'POST',
    cache: 'no-store',
  })
}
