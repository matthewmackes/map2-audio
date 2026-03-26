/**
 * Hook for single-node platform operations: version, deployment, updates,
 * backup, health checks, and remediation actions.
 *
 * Provides both read (polling) queries and write (mutation) actions that
 * are consumed by the single-node layer in usePlatformShellData and by
 * the SingleNodeOperations action panel in PlatformModal.
 */
import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchUpdateApplicationJson, postUpdateApplicationJson } from './updateApplicationApi'

// ── Response types ──────────────────────────────────────────────────────────

export interface PlatformVersionInfo {
  product: string
  version: string
  build_date: string
  build_time: string
  build_channel: string
  build_timestamp: string
  api_version: string
  commit?: string
  dirty?: boolean
}

export interface DeploymentModeInfo {
  mode: string
  services?: Record<string, string>
}

export interface DeploymentStatusInfo {
  mode: string
  services: Record<string, { status: string; pid?: number }>
}

export interface UpdateStatusInfo {
  status: string            // idle, in_progress, completed, failed, rolling_back
  message: string
  current_node?: string
  total_nodes?: number
  completed_nodes?: number
  failed_nodes?: number
}

export interface UpdateHybridVersionInfo {
  version: string
  mode: string              // git | rpm
  updated_at?: string
  branch?: string
}

export interface HybridApplicationUpdateStepInfo {
  key: string
  question: string
  detail: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  started_at?: string | null
  completed_at?: string | null
  result?: string | null
}

export interface HybridApplicationStatusInfo {
  status: 'idle' | 'running' | 'completed' | 'failed'
  mode: string
  environment: string
  running: boolean
  current_version?: string
  target_version?: string
  current_step_key?: string | null
  current_step_index?: number | null
  message: string
  error?: string | null
  started_at?: string | null
  completed_at?: string | null
  last_update?: string | null
  steps: HybridApplicationUpdateStepInfo[]
}

export interface TriggerApplicationUpdateResult {
  status: string
  message: string
  success?: boolean
  commit_before?: string
  commit_after?: string
  duration_seconds?: number
}

export interface BackupStatusInfo {
  total_backups: number
  latest_backup?: string
  latest_backup_date?: string
  total_size_bytes?: number
  auto_backup_enabled?: boolean
}

export interface BackupEntry {
  backup_id: string
  created_at: string
  size_bytes: number
  type: string
  description?: string
}

export interface HealthCheckInfo {
  status: string
  uptime_seconds: number
  services: Record<string, string>
  audio?: {
    engine_running: boolean
    sample_rate: number
    buffer_size: number
    xrun_count: number
  }
}

export interface RemediationSummaryInfo {
  status: string
  counts: Record<string, number>
  manifest?: { source_node?: string; timestamp?: string }
  nodes?: Array<{
    node_id: string
    hostname: string
    adoption_state: string
    sync_states: string[]
    version?: string
  }>
}

export interface ManifestDriftInfo {
  drifted: boolean
  nodes: Array<{
    node_id: string
    hostname: string
    packages_drifted: number
  }>
}

// ── Fetchers ────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  return fetchJson<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// ── Query keys ──────────────────────────────────────────────────────────────

const KEYS = {
  version: ['node-ops', 'version'] as const,
  deploymentMode: ['node-ops', 'deployment-mode'] as const,
  deploymentStatus: ['node-ops', 'deployment-status'] as const,
  updateStatus: ['node-ops', 'update-status'] as const,
  applicationStatus: ['node-ops', 'application-status'] as const,
  updateHybridVersion: ['node-ops', 'update-hybrid-version'] as const,
  backupStatus: ['node-ops', 'backup-status'] as const,
  backupList: ['node-ops', 'backup-list'] as const,
  health: ['node-ops', 'health'] as const,
  remediation: ['node-ops', 'remediation'] as const,
  manifestDrift: ['node-ops', 'manifest-drift'] as const,
}

const POLL_MS = 10_000
const STALE_MS = 5_000

// ── Main hook ───────────────────────────────────────────────────────────────

export interface NodeOperationsData {
  // Read state
  version: PlatformVersionInfo | undefined
  deploymentMode: DeploymentModeInfo | undefined
  deploymentStatus: DeploymentStatusInfo | undefined
  updateStatus: UpdateStatusInfo | undefined
  applicationStatus: HybridApplicationStatusInfo | undefined
  hybridVersion: UpdateHybridVersionInfo | undefined
  backupStatus: BackupStatusInfo | undefined
  backups: BackupEntry[]
  health: HealthCheckInfo | undefined
  remediation: RemediationSummaryInfo | undefined
  manifestDrift: ManifestDriftInfo | undefined

  // Loading / error
  isLoading: boolean
  errors: string[]

  // Mutations
  triggerUpdate: (opts: { version?: string; branch?: string; force?: boolean }) => Promise<TriggerApplicationUpdateResult>
  triggerBackup: (description?: string) => void
  restoreBackup: (backupId: string) => void
  switchDeploymentMode: (mode: string) => void
  triggerRemediation: (action: string, nodeId?: string) => void
  captureManifest: (sourceNodeId: string) => void
  enforceManifest: (nodeId: string) => void
  abortUpdate: () => void

  // Mutation states
  isUpdating: boolean
  isBackingUp: boolean
  isRestoring: boolean
  isSwitchingMode: boolean
  isRemediating: boolean
}

export function useNodeOperations(): NodeOperationsData {
  const qc = useQueryClient()

  // ── Queries ─────────────────────────────────────────────────────────────

  const versionQ = useQuery({
    queryKey: KEYS.version,
    queryFn: () => fetchJson<PlatformVersionInfo>('/api/version'),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

  const deployModeQ = useQuery({
    queryKey: KEYS.deploymentMode,
    queryFn: () => fetchJson<DeploymentModeInfo>('/api/deployment/mode'),
    refetchInterval: POLL_MS,
    staleTime: STALE_MS,
  })

  const deployStatusQ = useQuery({
    queryKey: KEYS.deploymentStatus,
    queryFn: () => fetchJson<DeploymentStatusInfo>('/api/deployment/status'),
    refetchInterval: POLL_MS,
    staleTime: STALE_MS,
  })

  const updateStatusQ = useQuery({
    queryKey: KEYS.updateStatus,
    queryFn: () => fetchJson<UpdateStatusInfo>('/api/cluster/update/status'),
    refetchInterval: POLL_MS,
    staleTime: STALE_MS,
  })

  const applicationStatusQ = useQuery({
    queryKey: KEYS.applicationStatus,
    queryFn: () => fetchUpdateApplicationJson<HybridApplicationStatusInfo>('/application/status'),
    refetchInterval: 1_500,
    staleTime: 1_000,
  })

  const hybridVersionQ = useQuery({
    queryKey: KEYS.updateHybridVersion,
    queryFn: () => fetchUpdateApplicationJson<UpdateHybridVersionInfo>('/application/version'),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

  const backupStatusQ = useQuery({
    queryKey: KEYS.backupStatus,
    queryFn: () => fetchJson<BackupStatusInfo>('/api/backup/status'),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

  const backupListQ = useQuery({
    queryKey: KEYS.backupList,
    queryFn: () => fetchJson<{ backups: BackupEntry[] }>('/api/backup/'),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

  const healthQ = useQuery({
    queryKey: KEYS.health,
    queryFn: () => fetchJson<HealthCheckInfo>('/api/health'),
    refetchInterval: POLL_MS,
    staleTime: STALE_MS,
  })

  const remediationQ = useQuery({
    queryKey: KEYS.remediation,
    queryFn: () => fetchJson<RemediationSummaryInfo>('/api/platform-remediation/summary'),
    refetchInterval: POLL_MS,
    staleTime: STALE_MS,
  })

  const manifestDriftQ = useQuery({
    queryKey: KEYS.manifestDrift,
    queryFn: () => fetchJson<ManifestDriftInfo>('/api/cluster/update/manifest/drift'),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

  // ── Mutations ───────────────────────────────────────────────────────────

  const updateMut = useMutation({
    mutationFn: (opts: { version?: string; branch?: string; force?: boolean }) =>
      postUpdateApplicationJson<TriggerApplicationUpdateResult>('/application', {
        mode: 'auto',
        version: opts.version,
        branch: opts.branch ?? 'master',
        force: opts.force ?? false,
      }),
    onMutate: async () => {
      await qc.invalidateQueries({ queryKey: KEYS.applicationStatus })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.applicationStatus })
      qc.invalidateQueries({ queryKey: KEYS.updateStatus })
      qc.invalidateQueries({ queryKey: KEYS.updateHybridVersion })
      qc.invalidateQueries({ queryKey: KEYS.version })
    },
  })

  const backupMut = useMutation({
    mutationFn: (description?: string) =>
      postJson('/api/backup/create', description ? { description } : undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.backupStatus })
      qc.invalidateQueries({ queryKey: KEYS.backupList })
    },
  })

  const restoreMut = useMutation({
    mutationFn: (backupId: string) =>
      postJson(`/api/backup/${encodeURIComponent(backupId)}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.backupStatus })
      qc.invalidateQueries({ queryKey: KEYS.backupList })
      qc.invalidateQueries({ queryKey: KEYS.health })
    },
  })

  const modeMut = useMutation({
    mutationFn: (mode: string) =>
      postJson('/api/deployment/mode', { mode }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.deploymentMode })
      qc.invalidateQueries({ queryKey: KEYS.deploymentStatus })
    },
  })

  const remediationMut = useMutation({
    mutationFn: (args: { action: string; nodeId?: string }) =>
      postJson('/api/platform-remediation/sync/fix', args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.remediation })
      qc.invalidateQueries({ queryKey: KEYS.health })
    },
  })

  const captureManifestMut = useMutation({
    mutationFn: (sourceNodeId: string) =>
      postJson('/api/cluster/update/manifest/capture', { source_node_id: sourceNodeId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.manifestDrift })
    },
  })

  const enforceManifestMut = useMutation({
    mutationFn: (nodeId: string) =>
      postJson('/api/cluster/update/manifest/enforce', { node_id: nodeId, dry_run: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.manifestDrift })
    },
  })

  const abortMut = useMutation({
    mutationFn: () => postJson('/api/cluster/update/abort'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.updateStatus })
    },
  })

  // ── Derived ─────────────────────────────────────────────────────────────

  const errors = useMemo(() => {
    const errs: string[] = []
    if (versionQ.error) errs.push(`Version: ${(versionQ.error as Error).message}`)
    if (updateStatusQ.error) errs.push(`Update: ${(updateStatusQ.error as Error).message}`)
    if (applicationStatusQ.error) errs.push(`Application update: ${(applicationStatusQ.error as Error).message}`)
    if (healthQ.error) errs.push(`Health: ${(healthQ.error as Error).message}`)
    return errs
  }, [applicationStatusQ.error, healthQ.error, updateStatusQ.error, versionQ.error])

  return {
    version: versionQ.data,
    deploymentMode: deployModeQ.data,
    deploymentStatus: deployStatusQ.data,
    updateStatus: updateStatusQ.data,
    applicationStatus: applicationStatusQ.data,
    hybridVersion: hybridVersionQ.data,
    backupStatus: backupStatusQ.data,
    backups: backupListQ.data?.backups ?? [],
    health: healthQ.data,
    remediation: remediationQ.data,
    manifestDrift: manifestDriftQ.data,

    isLoading: versionQ.isLoading || healthQ.isLoading,
    errors,

    triggerUpdate: (opts) => updateMut.mutateAsync(opts),
    triggerBackup: (desc) => backupMut.mutate(desc),
    restoreBackup: (id) => restoreMut.mutate(id),
    switchDeploymentMode: (mode) => modeMut.mutate(mode),
    triggerRemediation: (action, nodeId) => remediationMut.mutate({ action, nodeId }),
    captureManifest: (sourceNodeId) => captureManifestMut.mutate(sourceNodeId),
    enforceManifest: (nodeId) => enforceManifestMut.mutate(nodeId),
    abortUpdate: () => abortMut.mutate(),

    isUpdating: updateMut.isPending || Boolean(applicationStatusQ.data?.running),
    isBackingUp: backupMut.isPending,
    isRestoring: restoreMut.isPending,
    isSwitchingMode: modeMut.isPending,
    isRemediating: remediationMut.isPending,
  }
}
