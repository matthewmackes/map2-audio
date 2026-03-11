import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Lightning, Package, ShareNetwork, SpinnerGap, Warning, WaveSine, X, XCircle } from '@phosphor-icons/react'
import { irApi, namApi } from '../../../map2/api'
import { sanitizeRestrictedDisplayText } from '../../../map2/displayNames'
import { useCluster } from '../../contexts/ClusterContext'
import { useToasts } from '../Toasts'

type PluginPresetSummary = {
  id: number
  name: string
  plugin_uri: string
  plugin_name: string
}

type PresetAvailability = {
  preset_id: number
  checksum: string
  source_node_id?: string
  available_on: string[]
  missing_on: string[]
}

type ClusterPlugin = {
  uri: string
  name: string
  installed_on?: string[]
}

type ClusterPluginResponse = {
  plugins?: ClusterPlugin[]
}

type ClusterLibraryItem = {
  path_token: string
  relative_path?: string
  filename: string
  checksum?: string
  asset_type: string
}

type ClusterLibraryFanoutResponse = {
  nodes?: Record<string, { body?: { items?: ClusterLibraryItem[] } }>
}

type IRStatus = {
  loaded_cabinet?: string | null
  loaded_reverb?: string | null
}

type NAMStatus = {
  activeModel?: string | null
}

type DependencyDescriptor = {
  kind: 'plugin' | 'nam' | 'cabinet_ir' | 'reverb_ir'
  label: string
  availableOn: string[]
  canDeploy: boolean
  pathToken?: string | null
}

interface PresetDeployModalProps {
  open: boolean
  preset: PluginPresetSummary | null
  availability?: PresetAvailability | null
  sourceNodeId: string
  onClose: () => void
}

function stripExtension(value: string): string {
  return value.replace(/\.[^/.]+$/, '').toLowerCase()
}

function normalizeCandidate(value?: string | null): string {
  return stripExtension((value || '').trim())
}

function findLibraryDependency(
  payload: ClusterLibraryFanoutResponse | undefined,
  sourceNodeId: string,
  requestedName: string,
  expectedAssetType?: string
): { item: ClusterLibraryItem | null; availableOn: string[] } {
  const nodes = payload?.nodes ?? {}
  const sourceItems = nodes[sourceNodeId]?.body?.items ?? []
  const requested = normalizeCandidate(requestedName)

  const item =
    sourceItems.find((candidate) => {
      if (expectedAssetType && candidate.asset_type !== expectedAssetType) return false
      const filename = normalizeCandidate(candidate.filename)
      const relativeName = normalizeCandidate(candidate.relative_path?.split('/').pop())
      return filename === requested || relativeName === requested
    }) ?? null

  if (!item?.checksum) {
    return { item, availableOn: [] }
  }

  const availableOn = Object.entries(nodes)
    .filter(([, nodePayload]) =>
      (nodePayload.body?.items ?? []).some((candidate) => candidate.checksum === item.checksum)
    )
    .map(([nodeId]) => nodeId)

  return { item, availableOn }
}

function statusPill(label: string, color: string, background: string) {
  return (
    <span
      className="pill"
      style={{
        color,
        background,
        padding: '4px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {label}
    </span>
  )
}

export function PresetDeployModal({
  open,
  preset,
  availability,
  sourceNodeId,
  onClose,
}: PresetDeployModalProps) {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodes, localNodeId } = useCluster()
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set())

  const sourceApiNodeId = sourceNodeId !== localNodeId ? sourceNodeId : null
  const targetNodes = useMemo(
    () => nodes.filter((node) => node.nodeId !== sourceNodeId),
    [nodes, sourceNodeId]
  )
  const nodeLabelById = useMemo(
    () => new Map(nodes.map((node) => [node.nodeId, node.isLocal ? `${node.hostname} (Local)` : node.hostname])),
    [nodes]
  )
  const sourceNodeLabel = nodeLabelById.get(sourceNodeId) ?? sourceNodeId

  useEffect(() => {
    if (!open) return
    setSelectedTargetIds(new Set(availability?.missing_on ?? []))
  }, [availability?.missing_on, open])

  const pluginCatalogQuery = useQuery<ClusterPluginResponse>({
    queryKey: ['cluster', 'plugins', 'catalog'],
    queryFn: async () => {
      const response = await fetch('/api/cluster/health/extended/plugins')
      if (!response.ok) {
        throw new Error('Failed to fetch cluster plugin catalog')
      }
      return response.json() as Promise<ClusterPluginResponse>
    },
    enabled: open && Boolean(preset),
    staleTime: 10000,
  })

  const namStatusQuery = useQuery<NAMStatus>({
    queryKey: ['nam', 'status', sourceNodeId, 'preset-deploy'],
    queryFn: () => namApi.getStatus(sourceApiNodeId),
    enabled: open && preset?.plugin_uri === 'map2://juce/amp/nam',
    staleTime: 5000,
  })

  const irStatusQuery = useQuery<IRStatus>({
    queryKey: ['ir', 'status', sourceNodeId, 'preset-deploy'],
    queryFn: () => irApi.getStatus(sourceApiNodeId),
    enabled:
      open &&
      (preset?.plugin_uri === 'map2://juce/ir/cabinet' || preset?.plugin_uri === 'map2://juce/ir/reverb'),
    staleTime: 5000,
  })

  const namLibraryQuery = useQuery<ClusterLibraryFanoutResponse>({
    queryKey: ['cluster', 'library', 'nam'],
    queryFn: async () => {
      const response = await fetch('/api/preset-exchange/cluster/library?content_type=nam&node_id=all')
      if (!response.ok) {
        throw new Error('Failed to fetch NAM library availability')
      }
      return response.json() as Promise<ClusterLibraryFanoutResponse>
    },
    enabled: open && preset?.plugin_uri === 'map2://juce/amp/nam',
    staleTime: 10000,
  })

  const irLibraryQuery = useQuery<ClusterLibraryFanoutResponse>({
    queryKey: ['cluster', 'library', 'ir'],
    queryFn: async () => {
      const response = await fetch('/api/preset-exchange/cluster/library?content_type=ir&node_id=all')
      if (!response.ok) {
        throw new Error('Failed to fetch IR library availability')
      }
      return response.json() as Promise<ClusterLibraryFanoutResponse>
    },
    enabled:
      open &&
      (preset?.plugin_uri === 'map2://juce/ir/cabinet' || preset?.plugin_uri === 'map2://juce/ir/reverb'),
    staleTime: 10000,
  })

  const pluginDependency = useMemo<DependencyDescriptor | null>(() => {
    if (!preset) return null

    const plugin = pluginCatalogQuery.data?.plugins?.find((candidate) => candidate.uri === preset.plugin_uri)
    const installedOn = plugin?.installed_on ?? (
      preset.plugin_uri.startsWith('map2://juce/')
        ? nodes.map((node) => node.nodeId)
        : []
    )

    return {
      kind: 'plugin',
      label: sanitizeRestrictedDisplayText(preset.plugin_name) || preset.plugin_uri,
      availableOn: installedOn,
      canDeploy: false,
    }
  }, [nodes, pluginCatalogQuery.data?.plugins, preset])

  const assetDependency = useMemo<DependencyDescriptor | null>(() => {
    if (!preset) return null

    if (preset.plugin_uri === 'map2://juce/amp/nam') {
      const activeModel = namStatusQuery.data?.activeModel
      if (!activeModel) return null
      const { item, availableOn } = findLibraryDependency(namLibraryQuery.data, sourceNodeId, activeModel, 'nam')
      return {
        kind: 'nam',
        label: activeModel,
        availableOn,
        canDeploy: Boolean(item?.path_token),
        pathToken: item?.path_token ?? null,
      }
    }

    if (preset.plugin_uri === 'map2://juce/ir/cabinet') {
      const loadedCabinet = irStatusQuery.data?.loaded_cabinet
      if (!loadedCabinet) return null
      const { item, availableOn } = findLibraryDependency(irLibraryQuery.data, sourceNodeId, loadedCabinet, 'cabinet_ir')
      return {
        kind: 'cabinet_ir',
        label: loadedCabinet,
        availableOn,
        canDeploy: Boolean(item?.path_token),
        pathToken: item?.path_token ?? null,
      }
    }

    if (preset.plugin_uri === 'map2://juce/ir/reverb') {
      const loadedReverb = irStatusQuery.data?.loaded_reverb
      if (!loadedReverb) return null
      const { item, availableOn } = findLibraryDependency(irLibraryQuery.data, sourceNodeId, loadedReverb, 'reverb_ir')
      return {
        kind: 'reverb_ir',
        label: loadedReverb,
        availableOn,
        canDeploy: Boolean(item?.path_token),
        pathToken: item?.path_token ?? null,
      }
    }

    return null
  }, [
    irLibraryQuery.data,
    irStatusQuery.data?.loaded_cabinet,
    irStatusQuery.data?.loaded_reverb,
    namLibraryQuery.data,
    namStatusQuery.data?.activeModel,
    preset,
    sourceNodeId,
  ])

  const unresolvedAssetDependency =
    assetDependency !== null && !assetDependency.canDeploy && assetDependency.availableOn.length === 0

  const deployMutation = useMutation({
    mutationFn: async (targetNodeIds: string[]) => {
      if (!preset) {
        throw new Error('No preset selected')
      }

      const pluginMissingTargets = targetNodeIds.filter(
        (nodeId) => pluginDependency && !pluginDependency.availableOn.includes(nodeId)
      )
      if (pluginMissingTargets.length > 0) {
        throw new Error(`Missing plugin on: ${pluginMissingTargets.map((nodeId) => nodeLabelById.get(nodeId) ?? nodeId).join(', ')}`)
      }

      if (assetDependency && unresolvedAssetDependency) {
        throw new Error(`Unable to resolve ${assetDependency.label} on the source node for deployment`)
      }

      if (assetDependency && assetDependency.pathToken) {
        const missingAssetTargets = targetNodeIds.filter((nodeId) => !assetDependency.availableOn.includes(nodeId))
        if (missingAssetTargets.length > 0) {
          const assetResponse = await fetch('/api/preset-exchange/deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content_type: assetDependency.kind === 'nam' ? 'nam' : 'ir',
              path_token: assetDependency.pathToken,
              source_node_id: sourceNodeId,
              target_node_ids: missingAssetTargets,
            }),
          })
          if (!assetResponse.ok) {
            const body = await assetResponse.json().catch(() => ({}))
            throw new Error(body.detail || 'Failed to deploy preset dependencies')
          }
        }
      }

      const presetResponse = await fetch('/api/preset-exchange/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_type: 'preset',
          preset_id: preset.id,
          source_node_id: sourceNodeId,
          target_node_ids: targetNodeIds,
        }),
      })
      if (!presetResponse.ok) {
        const body = await presetResponse.json().catch(() => ({}))
        throw new Error(body.detail || 'Failed to deploy preset')
      }
      return presetResponse.json() as Promise<{ successful?: string[]; failed?: string[] }>
    },
    onSuccess: async (payload, targetNodeIds) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['plugin-presets'] }),
        queryClient.invalidateQueries({ queryKey: ['plugin-presets', 'availability'] }),
        queryClient.invalidateQueries({ queryKey: ['plugin-presets', 'cluster-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['cluster', 'library'] }),
      ])
      pushToast(
        `Deployed preset to ${payload.successful?.length ?? targetNodeIds.length} node${targetNodeIds.length === 1 ? '' : 's'}`,
        'success'
      )
      onClose()
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Preset deployment failed', 'error')
    },
  })

  const rows = useMemo(() => {
    return targetNodes.map((node) => {
      const pluginReady = pluginDependency ? pluginDependency.availableOn.includes(node.nodeId) : true
      const assetReady = assetDependency ? assetDependency.availableOn.includes(node.nodeId) : true
      const assetWillDeploy = Boolean(
        assetDependency &&
        !assetReady &&
        assetDependency.canDeploy &&
        selectedTargetIds.has(node.nodeId)
      )
      const presetReady = availability?.available_on.includes(node.nodeId) ?? false
      const canTargetDeploy =
        node.isOnline &&
        pluginReady &&
        (!assetDependency || assetReady || assetDependency.canDeploy)

      return {
        node,
        pluginReady,
        assetReady,
        assetWillDeploy,
        presetReady,
        canTargetDeploy,
      }
    })
  }, [assetDependency, availability?.available_on, pluginDependency, selectedTargetIds, targetNodes])

  if (!open || !preset) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.58)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={() => {
        if (!deployMutation.isPending) onClose()
      }}
    >
      <div
        className="card"
        style={{ width: 'min(980px, 94vw)', maxHeight: '90vh', overflow: 'auto', padding: 24 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.1, color: '#94a3b8', marginBottom: 8 }}>
              Deploy Preset
            </div>
            <h3 style={{ margin: 0, fontSize: 24 }}>{preset.name}</h3>
            <p style={{ margin: '8px 0 0', color: '#94a3b8', lineHeight: 1.6 }}>
              Source node: <strong style={{ color: '#e2e8f0' }}>{sourceNodeLabel}</strong>. The matrix below blocks nodes missing the plugin,
              and marks IR/NAM content that will be copied before the preset itself is deployed.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={deployMutation.isPending}>
            <X size={16} weight="bold" />
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div style={{ padding: 14, borderRadius: 10, background: 'rgba(37, 99, 235, 0.10)', border: '1px solid rgba(96, 165, 250, 0.18)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <Package size={16} weight="duotone" style={{ color: '#60a5fa' }} />
              <strong>Preset</strong>
            </div>
            <div style={{ fontSize: 13, color: '#cbd5e1' }}>{preset.name}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
              {availability?.available_on.length ?? 0}/{nodes.length} nodes already have this checksum
            </div>
          </div>

          <div style={{ padding: 14, borderRadius: 10, background: 'rgba(249, 115, 22, 0.10)', border: '1px solid rgba(249, 115, 22, 0.18)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <Lightning size={16} weight="duotone" style={{ color: '#f97316' }} />
              <strong>Plugin Dependency</strong>
            </div>
            <div style={{ fontSize: 13, color: '#cbd5e1' }}>
              {pluginDependency?.label ?? sanitizeRestrictedDisplayText(preset.plugin_name) || preset.plugin_uri}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
              Available on {pluginDependency?.availableOn.length ?? 0}/{nodes.length} nodes
            </div>
          </div>

          <div style={{ padding: 14, borderRadius: 10, background: 'rgba(168, 85, 247, 0.10)', border: '1px solid rgba(168, 85, 247, 0.18)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              {assetDependency?.kind === 'nam' ? (
                <Lightning size={16} weight="duotone" style={{ color: '#f43f5e' }} />
              ) : (
                <WaveSine size={16} weight="duotone" style={{ color: '#a855f7' }} />
              )}
              <strong>Content Dependency</strong>
            </div>
            <div style={{ fontSize: 13, color: '#cbd5e1' }}>
              {assetDependency ? assetDependency.label : 'No IR/NAM content inferred for this preset'}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
              {assetDependency
                ? assetDependency.canDeploy
                  ? `Available on ${assetDependency.availableOn.length}/${nodes.length} nodes`
                  : 'Detected on source node, but not indexed for cluster deployment'
                : 'Generic parameter preset'}
            </div>
          </div>
        </div>

        {unresolvedAssetDependency && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 10,
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.22)',
              color: '#fde68a',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <Warning size={18} weight="duotone" />
            <div>
              <strong>Content dependency unresolved.</strong>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                The source node reports <code>{assetDependency?.label}</code>, but it was not found in the cluster library index.
                Asset deployment is blocked until that content is indexed in the Library page.
              </div>
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table className="table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>Target</th>
                <th>Plugin</th>
                <th>Content</th>
                <th>Preset</th>
                <th>Select</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node, pluginReady, assetReady, assetWillDeploy, presetReady, canTargetDeploy }) => {
                const checked = selectedTargetIds.has(node.nodeId)
                return (
                  <tr key={node.nodeId}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{nodeLabelById.get(node.nodeId) ?? node.nodeId}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {node.isOnline ? `Latency ${node.latencyMs ?? 'n/a'} ms` : 'Offline'}
                      </div>
                    </td>
                    <td>
                      {pluginReady
                        ? statusPill('Available', '#86efac', 'rgba(34, 197, 94, 0.14)')
                        : statusPill('Missing Plugin', '#fca5a5', 'rgba(239, 68, 68, 0.14)')}
                    </td>
                    <td>
                      {!assetDependency ? (
                        <span className="muted">None</span>
                      ) : assetReady ? (
                        statusPill('Ready', '#c4b5fd', 'rgba(168, 85, 247, 0.14)')
                      ) : assetWillDeploy ? (
                        statusPill('Will Deploy', '#93c5fd', 'rgba(59, 130, 246, 0.14)')
                      ) : assetDependency.canDeploy ? (
                        statusPill('Missing Asset', '#fbbf24', 'rgba(245, 158, 11, 0.14)')
                      ) : (
                        statusPill('Blocked', '#fca5a5', 'rgba(239, 68, 68, 0.14)')
                      )}
                    </td>
                    <td>
                      {presetReady
                        ? statusPill('Installed', '#86efac', 'rgba(34, 197, 94, 0.14)')
                        : checked
                          ? statusPill('Will Deploy', '#93c5fd', 'rgba(59, 130, 246, 0.14)')
                          : <span className="muted">Not selected</span>}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!canTargetDeploy || deployMutation.isPending}
                        onChange={() => {
                          setSelectedTargetIds((previous) => {
                            const next = new Set(previous)
                            if (next.has(node.nodeId)) {
                              next.delete(node.nodeId)
                            } else {
                              next.add(node.nodeId)
                            }
                            return next
                          })
                        }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {(pluginCatalogQuery.isLoading || namStatusQuery.isLoading || irStatusQuery.isLoading || namLibraryQuery.isLoading || irLibraryQuery.isLoading) && (
          <div className="flex" style={{ gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <SpinnerGap size={16} weight="duotone" className="spin" />
            <span className="muted">Checking cluster dependencies…</span>
          </div>
        )}

        {(pluginCatalogQuery.isError || namStatusQuery.isError || irStatusQuery.isError || namLibraryQuery.isError || irLibraryQuery.isError) && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 10,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.22)',
              color: '#fecaca',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <XCircle size={18} weight="duotone" />
            <span>One or more dependency checks failed. Resolve that first, then deploy.</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div className="muted" style={{ fontSize: 13 }}>
            {selectedTargetIds.size} target node{selectedTargetIds.size === 1 ? '' : 's'} selected
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={deployMutation.isPending}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={
                selectedTargetIds.size === 0 ||
                deployMutation.isPending ||
                pluginCatalogQuery.isLoading ||
                Boolean(pluginCatalogQuery.isError || namStatusQuery.isError || irStatusQuery.isError || namLibraryQuery.isError || irLibraryQuery.isError)
              }
              onClick={() => deployMutation.mutate(Array.from(selectedTargetIds))}
            >
              {deployMutation.isPending ? (
                <>
                  <SpinnerGap size={14} weight="duotone" className="spin" />
                  Deploying…
                </>
              ) : (
                <>
                  <ShareNetwork size={14} weight="duotone" />
                  Deploy Preset
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PresetDeployModal
