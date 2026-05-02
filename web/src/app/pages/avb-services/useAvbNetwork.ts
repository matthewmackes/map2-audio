/**
 * T2490-9 — TanStack Query helpers for the AVB Network page.
 *
 * Pulls from the existing `/api/avb/{ptp,srp,tsn,status}` endpoints —
 * no new backend needed. T2486-style cluster auto-connect onboarding
 * modal deferred.
 */

import { useQuery } from '@tanstack/react-query'

export interface PtpStatus {
  available?: boolean
  state?: string
  offset_ns?: number | null
  mean_path_delay_ns?: number | null
  grandmaster_id?: string | null
  grandmaster_priority1?: number | null
  grandmaster_clock_class?: number | null
  local_clock_id?: string | null
  domain?: number | null
}

export interface SrpStatus {
  enabled?: boolean
  required?: boolean
  daemon_preference?: string
  daemon_type?: string
  binary_path?: string
  control_socket?: string
  running?: boolean
  protocol_mode?: string
  timeout_ms?: number
}

export interface SrpAdmissionRecord {
  admission_id?: string
  decision?: string
  endpoint?: string
  stream_id?: string
  bandwidth_mbps?: number | null
  observed_at?: string | null
  reason?: string | null
  payload?: Record<string, unknown>
}

export interface SrpAdmissionsResponse {
  count: number
  admissions: SrpAdmissionRecord[]
}

export interface TsnStatus {
  available?: boolean
  interface?: string | null
  mqprio_configured?: boolean
  cbs_configured?: boolean
  etf_configured?: boolean
  vlan_configured?: boolean
  num_traffic_classes?: number | null
  cbs_idleslope?: number | null
  cbs_sendslope?: number | null
}

export interface AvbStatus {
  enabled?: boolean
  configured?: boolean
  operational?: boolean
  degraded?: boolean
  available?: boolean
  interface?: string | null
  state?: string
  ptp?: Partial<PtpStatus>
  srp?: Partial<SrpStatus>
  tsn?: Partial<TsnStatus>
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} failed: ${response.status}`)
  return (await response.json()) as T
}

export function useAvbStatus() {
  return useQuery({
    queryKey: ['avb-status'],
    queryFn: () => fetchJson<AvbStatus>('/api/avb/status'),
    refetchInterval: 5000,
    staleTime: 0,
  })
}

export function useAvbPtpStatus() {
  return useQuery({
    queryKey: ['avb-ptp-status'],
    queryFn: () => fetchJson<PtpStatus>('/api/avb/ptp/status'),
    refetchInterval: 5000,
    staleTime: 0,
  })
}

export function useAvbSrpStatus() {
  return useQuery({
    queryKey: ['avb-srp-status'],
    queryFn: () => fetchJson<SrpStatus>('/api/avb/srp/status'),
    refetchInterval: 5000,
    staleTime: 0,
  })
}

export function useAvbSrpAdmissions(limit = 25) {
  return useQuery({
    queryKey: ['avb-srp-admissions', limit],
    queryFn: () =>
      fetchJson<SrpAdmissionsResponse>(`/api/avb/srp/admissions?limit=${limit}`),
    refetchInterval: 5000,
    staleTime: 0,
  })
}

export function useAvbTsnStatus() {
  return useQuery({
    queryKey: ['avb-tsn-status'],
    queryFn: () => fetchJson<TsnStatus>('/api/avb/tsn/status'),
    refetchInterval: 5000,
    staleTime: 0,
  })
}
