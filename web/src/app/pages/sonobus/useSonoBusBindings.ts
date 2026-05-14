/**
 * T2521-6 — TanStack Query helpers for the canonical `/api/sonobus/*`
 * surface (T2521-5).
 *
 * Mirrors `useAvbBindings.ts` so the SonoBus operator surface stays
 * shape-compatible with the AVB one. The daemon-side fields in
 * `useSonoBusStatus` stay at their stub defaults until T2521-4 lands
 * the `map2-sonobus-transport` daemon.
 */

import { useQuery } from '@tanstack/react-query'

export interface SonoBusBindingRecord {
  binding_id: string
  consumer_type: string
  consumer_id: string
  consumer_label: string
  binding_kind: 'peer' | 'group' | 'stream' | 'client_session'
  source_type: string
  source_descriptor: Record<string, unknown>
  target_type: string
  target_descriptor: Record<string, unknown>
  stream_format: string | null
  codec_profile: 'pcm' | 'opus_lowlatency' | 'opus_voip' | null
  jitter_buffer_ms: number | null
  resend_policy: 'off' | 'burst_loss_only' | 'full' | null
  latency_target_ms: number | null
  channel_count: number
  group_id: string | null
  session_label: string | null
  transport_protocol: 'udp' | 'udp_tls'
  bind_interface: string | null
  bind_port_local: number | null
  server_endpoint: string | null
  talker_node_id: string | null
  listener_node_id: string | null
  listener_capability: 'map2' | 'sonobus_native' | 'aoo_native' | null
  cluster_role: 'primary' | 'fallback' | 'peer' | null
  transport_priority: 'avb_preferred' | 'sonobus_preferred' | 'sonobus_only'
  scope: 'global' | 'snapshot' | 'node' | 'cluster'
  scope_id: string | null
  enabled: boolean
  source: string
  metadata: Record<string, unknown>
  created_at: string
  created_by: string
  modified_at: string
  modified_by: string
}

export interface SonoBusMatrixCell {
  count: number
  enabled_count: number
}

export interface SonoBusBindingsMatrixResponse {
  matrix: Record<string, Record<string, SonoBusMatrixCell>>
  total_bindings: number
  bindings: SonoBusBindingRecord[]
}

export interface SonoBusStatusResponse {
  authority_ok: boolean
  table_present: boolean
  binding_count: number
  enabled_binding_count: number
  daemon_running: boolean
  daemon_endpoint: string | null
  connection_server_enabled: boolean
  connection_server_running: boolean
  default_transport_priority: 'avb_preferred' | 'sonobus_preferred' | 'sonobus_only'
}

async function fetchSonoBusStatus(): Promise<SonoBusStatusResponse> {
  const response = await fetch('/api/sonobus/status')
  if (!response.ok) {
    throw new Error(`sonobus status failed: ${response.status}`)
  }
  return (await response.json()) as SonoBusStatusResponse
}

async function fetchSonoBusBindingsCount(): Promise<number> {
  const response = await fetch('/api/sonobus/bindings/count')
  if (!response.ok) {
    throw new Error(`sonobus bindings count failed: ${response.status}`)
  }
  const value = (await response.json()) as number
  return typeof value === 'number' ? value : 0
}

async function fetchSonoBusBindingsMatrix(): Promise<SonoBusBindingsMatrixResponse> {
  const response = await fetch('/api/sonobus/bindings/matrix')
  if (!response.ok) {
    throw new Error(`sonobus bindings matrix failed: ${response.status}`)
  }
  return (await response.json()) as SonoBusBindingsMatrixResponse
}

export function useSonoBusStatus() {
  return useQuery({
    queryKey: ['sonobus-status'],
    queryFn: fetchSonoBusStatus,
    refetchInterval: 5000,
    staleTime: 0,
  })
}

export function useSonoBusBindingsCount() {
  return useQuery({
    queryKey: ['sonobus-bindings-count'],
    queryFn: fetchSonoBusBindingsCount,
    refetchInterval: 5000,
    staleTime: 0,
  })
}

export function useSonoBusBindingsMatrix() {
  return useQuery({
    queryKey: ['sonobus-bindings-matrix'],
    queryFn: fetchSonoBusBindingsMatrix,
    refetchInterval: 5000,
    staleTime: 0,
  })
}

export interface SonoBusClusterPeerMatrix {
  node_id: string
  hostname: string
  matrix: Record<string, Record<string, SonoBusMatrixCell>>
  total_bindings: number
  health: string
}

export interface SonoBusClusterBindingsMatrixResponse {
  local: SonoBusBindingsMatrixResponse
  peers: SonoBusClusterPeerMatrix[]
  errors: Record<string, string>
}

async function fetchSonoBusClusterMatrix(): Promise<SonoBusClusterBindingsMatrixResponse> {
  const response = await fetch('/api/sonobus/cluster/bindings/matrix')
  if (!response.ok) {
    throw new Error(`sonobus cluster matrix failed: ${response.status}`)
  }
  return (await response.json()) as SonoBusClusterBindingsMatrixResponse
}

export function useSonoBusClusterMatrix() {
  return useQuery({
    queryKey: ['sonobus-cluster-matrix'],
    queryFn: fetchSonoBusClusterMatrix,
    refetchInterval: 5000,
    staleTime: 0,
  })
}

export interface SonoBusPeerSummary {
  peer_id: string
  listener_node_id: string | null
  listener_endpoint: string | null
  listener_capability: string | null
  binding_count: number
  enabled_binding_count: number
}

export interface SonoBusGroupSummary {
  group_id: string
  session_label: string | null
  binding_count: number
  enabled_binding_count: number
  channel_count_total: number
}

async function fetchSonoBusPeers(): Promise<SonoBusPeerSummary[]> {
  const response = await fetch('/api/sonobus/peers')
  if (!response.ok) throw new Error(`sonobus peers failed: ${response.status}`)
  return (await response.json()) as SonoBusPeerSummary[]
}

async function fetchSonoBusGroups(): Promise<SonoBusGroupSummary[]> {
  const response = await fetch('/api/sonobus/groups')
  if (!response.ok) throw new Error(`sonobus groups failed: ${response.status}`)
  return (await response.json()) as SonoBusGroupSummary[]
}

export function useSonoBusPeers() {
  return useQuery({
    queryKey: ['sonobus-peers'],
    queryFn: fetchSonoBusPeers,
    refetchInterval: 5000,
    staleTime: 0,
  })
}

export function useSonoBusGroups() {
  return useQuery({
    queryKey: ['sonobus-groups'],
    queryFn: fetchSonoBusGroups,
    refetchInterval: 5000,
    staleTime: 0,
  })
}

export interface SonoBusProfilePreset {
  profile_id: string
  label: string
  codec_profile: string
  stream_format: string
  jitter_buffer_ms: number
  resend_policy: string
  latency_target_ms: number
  description: string
}

async function fetchSonoBusProfiles(): Promise<SonoBusProfilePreset[]> {
  const response = await fetch('/api/sonobus/profiles')
  if (!response.ok) {
    throw new Error(`sonobus profiles failed: ${response.status}`)
  }
  return (await response.json()) as SonoBusProfilePreset[]
}

export function useSonoBusProfiles() {
  return useQuery({
    queryKey: ['sonobus-profiles'],
    queryFn: fetchSonoBusProfiles,
    // Profile presets are immutable until T2521-4 ships custom profiles.
    // Poll cheaply at 30s for forward-compat.
    refetchInterval: 30000,
    staleTime: 30000,
  })
}
