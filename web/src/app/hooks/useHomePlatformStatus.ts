import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { API_BASE as MAP2_API_BASE } from '@/map2/api'

// ── Types ────────────────────────────────────────────────────────────────────

interface AvdeccStats {
  enabled: boolean
  entities_discovered: number
  connections_active: number
  error?: string
}

interface AvbStatusResponse {
  enabled: boolean
  available: boolean
  state?: string
  operational?: boolean
  degraded?: boolean
  reason?: string
}

interface AdoptionCandidate {
  candidate_id: string
  adoption_state: string
  activation_state: string
}

export interface HomePlatformStatus {
  avb: { label: string; state: 'ok' | 'warn' | 'off' | 'loading' }
  avdecc: { label: string; state: 'ok' | 'warn' | 'off' | 'loading' }
  nodes: { label: string; state: 'ok' | 'warn' | 'off' | 'loading' }
}

// ── Fetchers ─────────────────────────────────────────────────────────────────

const AVB_API = `${MAP2_API_BASE}/avb`

async function fetchAvbStatus(): Promise<AvbStatusResponse> {
  const res = await fetch(`${AVB_API}/status`)
  if (!res.ok && res.status !== 503) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function fetchAvdeccStats(): Promise<AvdeccStats> {
  const res = await fetch(`${AVB_API}/avdecc/stats`)
  if (!res.ok && res.status !== 503) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function fetchAdoptionCandidates(): Promise<{ items: AdoptionCandidate[] }> {
  const res = await fetch(`${MAP2_API_BASE}/adoption/candidates`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Hook ─────────────────────────────────────────────────────────────────────

const POLL_MS = 10_000
const STALE_MS = 8_000

const retryPolicy = (failureCount: number, error: Error) => {
  if (error.message.includes('503')) return false
  return failureCount < 3
}

export function useHomePlatformStatus(): HomePlatformStatus {
  const avb = useQuery({
    queryKey: ['home', 'avb-status'],
    queryFn: fetchAvbStatus,
    refetchInterval: POLL_MS,
    staleTime: STALE_MS,
    retry: retryPolicy,
  })

  const avdecc = useQuery({
    queryKey: ['home', 'avdecc-stats'],
    queryFn: fetchAvdeccStats,
    refetchInterval: POLL_MS,
    staleTime: STALE_MS,
    retry: retryPolicy,
  })

  const adoption = useQuery({
    queryKey: ['home', 'adoption-candidates'],
    queryFn: fetchAdoptionCandidates,
    refetchInterval: POLL_MS,
    staleTime: STALE_MS,
    retry: retryPolicy,
  })

  return useMemo(() => {
    // ── AVB ──
    let avbResult: HomePlatformStatus['avb']
    if (avb.isLoading) {
      avbResult = { label: 'AVB: …', state: 'loading' }
    } else if (!avb.data || !avb.data.enabled) {
      avbResult = { label: 'AVB: disabled', state: 'off' }
    } else if (avb.data.degraded) {
      avbResult = { label: 'AVB: degraded', state: 'warn' }
    } else if (avb.data.operational || avb.data.available) {
      avbResult = { label: `AVB: ${avb.data.state ?? 'operational'}`, state: 'ok' }
    } else {
      avbResult = { label: `AVB: ${avb.data.reason ?? 'unavailable'}`, state: 'warn' }
    }

    // ── AVDECC ──
    let avdeccResult: HomePlatformStatus['avdecc']
    if (avdecc.isLoading) {
      avdeccResult = { label: 'AVDECC: …', state: 'loading' }
    } else if (!avdecc.data || !avdecc.data.enabled) {
      avdeccResult = { label: 'AVDECC: disabled', state: 'off' }
    } else if (avdecc.data.error) {
      avdeccResult = { label: 'AVDECC: error', state: 'warn' }
    } else {
      const ent = avdecc.data.entities_discovered
      const conn = avdecc.data.connections_active
      const parts = [`${ent} ${ent === 1 ? 'entity' : 'entities'}`]
      if (conn > 0) parts.push(`${conn} ${conn === 1 ? 'conn' : 'conns'}`)
      avdeccResult = { label: `AVDECC: ${parts.join(', ')}`, state: ent > 0 ? 'ok' : 'off' }
    }

    // ── Adopted nodes ──
    let nodesResult: HomePlatformStatus['nodes']
    if (adoption.isLoading) {
      nodesResult = { label: 'Nodes: …', state: 'loading' }
    } else if (!adoption.data) {
      nodesResult = { label: 'Nodes: unavailable', state: 'warn' }
    } else {
      const items = adoption.data.items ?? []
      const adopted = items.filter((n) => n.adoption_state === 'adopted' || n.adoption_state === 'ready')
      const active = adopted.filter((n) => n.activation_state === 'active').length
      const standby = adopted.filter((n) => n.activation_state === 'standby').length
      const total = adopted.length
      if (total === 0) {
        nodesResult = { label: 'Nodes: 0 adopted', state: 'off' }
      } else {
        const parts: string[] = []
        if (active > 0) parts.push(`${active} active`)
        if (standby > 0) parts.push(`${standby} standby`)
        if (parts.length === 0) parts.push(`${total} adopted`)
        nodesResult = { label: `Nodes: ${parts.join(' · ')}`, state: active > 0 ? 'ok' : 'warn' }
      }
    }

    return { avb: avbResult, avdecc: avdeccResult, nodes: nodesResult }
  }, [avb.data, avb.isLoading, avdecc.data, avdecc.isLoading, adoption.data, adoption.isLoading])
}
