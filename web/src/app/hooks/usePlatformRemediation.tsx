import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export type RemediationWorkflow = 'adoption' | 'sync' | 'clone'

export interface RemediationWorkflowStatus {
  available: boolean
  state: 'ready' | 'unavailable'
  reason?: string | null
  detail?: string | null
}

export interface RemediationNode {
  node_id: string
  hostname: string
  api_url?: string | null
  host?: string | null
  visible: boolean
  registered: boolean
  is_online: boolean
  adoption_state: string
  activation_state?: string | null
  trust_state?: string | null
  routing_ready: boolean
  readiness_status?: string | null
  avb_auto_provision?: {
    state: string
    reason?: string | null
    connected?: number
    failed?: number
    candidate_pairs?: number
    last_run_at?: string | null
    error?: string | null
  } | null
  version?: string | null
  commit?: string | null
  version_error?: string | null
  remote_fingerprint?: string | null
  sync_states: string[]
  clone_states: string[]
  is_source_of_truth: boolean
  rollback_available: boolean
}

export interface RemediationSummary {
  status: 'ok' | 'degraded'
  counts: {
    adoption: Record<string, number>
    sync: Record<string, number>
    clone: Record<string, number>
  }
  workflows?: {
    adoption?: RemediationWorkflowStatus
    sync?: RemediationWorkflowStatus
    clone?: RemediationWorkflowStatus
  }
  manifest?: {
    source_node?: string | null
    timestamp?: string | null
  }
  nodes: RemediationNode[]
}

export interface RemediationHistoryEntry {
  history_file: string
  timestamp?: string | null
  source_node?: string | null
  package_count?: number | null
}

export interface RemediationHistoryResponse {
  status: 'ok' | 'degraded'
  available: boolean
  reason?: string | null
  detail?: string | null
  items: RemediationHistoryEntry[]
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

export function usePlatformRemediationSummary() {
  return useQuery<RemediationSummary>({
    queryKey: ['platform-remediation', 'summary'],
    queryFn: () => fetchJson('/api/platform-remediation/summary'),
    refetchInterval: 10000,
    staleTime: 0,
  })
}

export function usePlatformRemediationHistory() {
  return useQuery<RemediationHistoryResponse>({
    queryKey: ['platform-remediation', 'sync-history'],
    queryFn: () => fetchJson('/api/platform-remediation/sync/history'),
    staleTime: 0,
  })
}

export function usePlatformRemediationActions() {
  const queryClient = useQueryClient()

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['platform-remediation'] }),
      queryClient.invalidateQueries({ queryKey: ['nodeTopology'] }),
    ])
  }

  const captureSource = useMutation({
    mutationFn: (sourceNodeId: string) =>
      fetchJson('/api/platform-remediation/sync/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_node_id: sourceNodeId }),
      }),
    onSuccess: invalidate,
  })

  const runSync = useMutation({
    mutationFn: (payload: { nodeIds: string[]; dryRun?: boolean }) =>
      fetchJson('/api/platform-remediation/sync/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_ids: payload.nodeIds, dry_run: Boolean(payload.dryRun) }),
      }),
    onSuccess: invalidate,
  })

  const restoreSync = useMutation({
    mutationFn: (historyFile: string) =>
      fetchJson('/api/platform-remediation/sync/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history_file: historyFile }),
      }),
    onSuccess: invalidate,
  })

  const fixSync = useMutation({
    mutationFn: (nodeId: string) =>
      fetchJson('/api/platform-remediation/sync/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_ids: [nodeId] }),
      }),
    onSuccess: invalidate,
  })

  const recoverClone = useMutation({
    mutationFn: (payload: { nodeIds: string[]; managementNodeIp?: string | null }) =>
      fetchJson('/api/platform-remediation/clone/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node_ids: payload.nodeIds,
          management_node_ip: payload.managementNodeIp ?? null,
        }),
      }),
    onSuccess: invalidate,
  })

  return {
    captureSource,
    runSync,
    restoreSync,
    fixSync,
    recoverClone,
  }
}

export function useRemediationNodesByState(summary: RemediationSummary | undefined) {
  return useMemo(() => {
    const byState: Record<string, RemediationNode[]> = {}
    for (const node of summary?.nodes ?? []) {
      const keys = [node.adoption_state, ...node.sync_states, ...node.clone_states].filter(Boolean)
      for (const key of keys) {
        if (!byState[key]) {
          byState[key] = []
        }
        byState[key].push(node)
      }
    }
    return byState
  }, [summary])
}
