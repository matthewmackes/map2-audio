// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// T2517-6 — Thin client over the MPX-1 effects-block backend.

import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface ChannelMapping {
  send_left: number
  send_right: number
  return_left: number
  return_right: number
}

export interface MPX1Calibration {
  latency_samples: number
  measured_at: string
}

export interface MPX1Instance {
  chain_id: string
  interface_id: string
  connection_type: 'aes_ebu' | 'spdif_coax' | 'spdif_optical'
  channel_mapping: ChannelMapping
  bypass: boolean
  calibration: MPX1Calibration | null
}

export interface HardwareUsageRow {
  uri: string
  chain_id: string
}

export interface InterfaceCapabilityRow {
  interface_id: string
  pack_id: string
  model_id: string
  display_name: string
  capabilities: string[]
  hardware_id: string
}

const HARDWARE_USAGE_KEY = ['chains', 'hardware-usage'] as const
const INTERFACES_KEY = ['interfaces', 'capabilities'] as const
const INSTANCE_KEY = (chainId: string) => ['effects', 'mpx1', 'instance', chainId] as const

async function getJson<T>(url: string): Promise<T> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`${url} → HTTP ${resp.status}`)
  return resp.json() as Promise<T>
}

export function useHardwareUsage() {
  return useQuery({
    queryKey: HARDWARE_USAGE_KEY,
    queryFn: () => getJson<{ in_use: HardwareUsageRow[] }>('/api/v1/chains/hardware-usage'),
    refetchInterval: 2000,
    staleTime: 0,
  })
}

export function useInterfaceCapabilities() {
  return useQuery({
    queryKey: INTERFACES_KEY,
    queryFn: () => getJson<{ interfaces: InterfaceCapabilityRow[] }>('/api/v1/interfaces/capabilities'),
    staleTime: 60_000,
  })
}

export function useMpx1Instance(chainId: string | null) {
  return useQuery({
    enabled: Boolean(chainId),
    queryKey: chainId ? INSTANCE_KEY(chainId) : ['effects', 'mpx1', 'instance', '__missing__'],
    queryFn: async () => {
      if (!chainId) return null
      const resp = await fetch(`/api/v1/effects/mpx1/instance/${encodeURIComponent(chainId)}`)
      if (resp.status === 404) return null
      if (!resp.ok) throw new Error(`mpx1 instance HTTP ${resp.status}`)
      return resp.json() as Promise<MPX1Instance>
    },
    staleTime: 0,
  })
}

export function useUpsertMpx1Instance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      chainId,
      body,
    }: {
      chainId: string
      body: Omit<MPX1Instance, 'chain_id' | 'calibration'>
    }) => {
      const resp = await fetch(`/api/v1/effects/mpx1/instance/${encodeURIComponent(chainId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (resp.status === 409) {
        const detail = await resp.json().catch(() => ({}))
        throw Object.assign(
          new Error(detail?.detail?.code ?? 'hardware_singleton_in_use'),
          { code: detail?.detail?.code, detail: detail?.detail },
        )
      }
      if (!resp.ok) throw new Error(`upsert HTTP ${resp.status}`)
      return resp.json() as Promise<MPX1Instance>
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: INSTANCE_KEY(vars.chainId) })
      void qc.invalidateQueries({ queryKey: HARDWARE_USAGE_KEY })
    },
  })
}

export function useDeleteMpx1Instance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (chainId: string) => {
      const resp = await fetch(`/api/v1/effects/mpx1/instance/${encodeURIComponent(chainId)}`, {
        method: 'DELETE',
      })
      if (!resp.ok && resp.status !== 204) throw new Error(`delete HTTP ${resp.status}`)
      return chainId
    },
    onSuccess: (chainId) => {
      void qc.invalidateQueries({ queryKey: INSTANCE_KEY(chainId) })
      void qc.invalidateQueries({ queryKey: HARDWARE_USAGE_KEY })
    },
  })
}

export function useSetMpx1Bypass(chainId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (bypass: boolean) => {
      if (!chainId) throw new Error('chainId required')
      const resp = await fetch(`/api/v1/effects/mpx1/instance/${encodeURIComponent(chainId)}/bypass`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bypass }),
      })
      if (!resp.ok) throw new Error(`bypass HTTP ${resp.status}`)
      return resp.json() as Promise<MPX1Instance>
    },
    onSuccess: () => {
      if (chainId) void qc.invalidateQueries({ queryKey: INSTANCE_KEY(chainId) })
    },
  })
}

export function useCalibrateMpx1(chainId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!chainId) throw new Error('chainId required')
      const resp = await fetch(`/api/v1/effects/mpx1/instance/${encodeURIComponent(chainId)}/calibrate`, {
        method: 'POST',
      })
      if (!resp.ok) throw new Error(`calibrate HTTP ${resp.status}`)
      return resp.json() as Promise<MPX1Instance>
    },
    onSuccess: () => {
      if (chainId) void qc.invalidateQueries({ queryKey: INSTANCE_KEY(chainId) })
    },
  })
}

/**
 * Build the "auto" connection-type default given the connected interfaces:
 *   • AES preferred when any interface advertises `aes_ebu`
 *   • Falls back to S/PDIF coax otherwise
 */
export function useAutoConnectionType(): {
  preferred: 'aes_ebu' | 'spdif_coax' | null
  aesCapable: InterfaceCapabilityRow[]
  spdifCapable: InterfaceCapabilityRow[]
} {
  const { data } = useInterfaceCapabilities()
  const rows = data?.interfaces ?? []
  const aesCapable = rows.filter((r) => r.capabilities.includes('aes_ebu'))
  const spdifCapable = rows.filter((r) => r.capabilities.includes('spdif_coax'))
  const preferred = aesCapable.length > 0 ? 'aes_ebu' : spdifCapable.length > 0 ? 'spdif_coax' : null
  return { preferred, aesCapable, spdifCapable }
}

/**
 * Helper: which chain (if any) currently holds the MPX-1 singleton.
 * Treats both the canonical and legacy alias URIs as the same lock.
 */
export function useMpx1InUseByChain(): string | null {
  const { data } = useHardwareUsage()
  const rows = data?.in_use ?? []
  const row = rows.find(
    (r) => r.uri === 'hardware://lexicon-mpx1' || r.uri === 'hardware://lexicon-mpx1-spdif',
  )
  return row ? row.chain_id : null
}
