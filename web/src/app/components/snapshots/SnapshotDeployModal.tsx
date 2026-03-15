import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Checkbox,
  InlineLoading,
  InlineNotification,
  Modal,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@carbon/react'
import { Information, MachineLearningModel, VolumeUp, WarningAlt } from '@carbon/icons-react'
import { irApi, namApi } from '../../../map2/api'
import { sanitizeRestrictedDisplayText } from '../../../map2/displayNames'
import { useCluster } from '../../contexts/ClusterContext'
import { useToasts } from '../Toasts'
import './SnapshotDeployModal.css'

type PluginSnapshotSummary = {
  id: number
  name: string
  plugin_uri: string
  plugin_name: string
}

type SnapshotAvailability = {
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

interface SnapshotDeployModalProps {
  open: boolean
  snapshot: PluginSnapshotSummary | null
  availability?: SnapshotAvailability | null
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
  expectedAssetType?: string,
): { item: ClusterLibraryItem | null; availableOn: string[] } {
  const nodes = payload?.nodes ?? {}
  const sourceItems = nodes[sourceNodeId]?.body?.items ?? []
  const requested = normalizeCandidate(requestedName)

  const item =
    sourceItems.find((candidate) => {
      if (expectedAssetType && candidate.asset_type !== expectedAssetType) {
        return false
      }
      const filename = normalizeCandidate(candidate.filename)
      const relativeName = normalizeCandidate(candidate.relative_path?.split('/').pop())
      return filename === requested || relativeName === requested
    }) ?? null

  if (!item?.checksum) {
    return { item, availableOn: [] }
  }

  const availableOn = Object.entries(nodes)
    .filter(([, nodePayload]) => (nodePayload.body?.items ?? []).some((candidate) => candidate.checksum === item.checksum))
    .map(([nodeId]) => nodeId)

  return { item, availableOn }
}

function statusTag(type: 'green' | 'red' | 'blue' | 'purple' | 'warm-gray' | 'cool-gray', label: string) {
  return (
    <Tag type={type} size="sm">
      {label}
    </Tag>
  )
}

export function SnapshotDeployModal({
  open,
  snapshot,
  availability,
  sourceNodeId,
  onClose,
}: SnapshotDeployModalProps) {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodes, localNodeId } = useCluster()
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set())

  const sourceApiNodeId = sourceNodeId !== localNodeId ? sourceNodeId : null
  const targetNodes = useMemo(() => nodes.filter((node) => node.nodeId !== sourceNodeId), [nodes, sourceNodeId])
  const nodeLabelById = useMemo(
    () => new Map(nodes.map((node) => [node.nodeId, node.isLocal ? `${node.hostname} (Local)` : node.hostname])),
    [nodes],
  )
  const sourceNodeLabel = nodeLabelById.get(sourceNodeId) ?? sourceNodeId

  useEffect(() => {
    if (!open) {
      return
    }
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
    enabled: open && Boolean(snapshot),
    staleTime: 10000,
  })

  const namStatusQuery = useQuery<NAMStatus>({
    queryKey: ['nam', 'status', sourceNodeId, 'snapshot-deploy'],
    queryFn: () => namApi.getStatus(sourceApiNodeId),
    enabled: open && snapshot?.plugin_uri === 'map2://juce/amp/nam',
    staleTime: 5000,
  })

  const irStatusQuery = useQuery<IRStatus>({
    queryKey: ['ir', 'status', sourceNodeId, 'snapshot-deploy'],
    queryFn: () => irApi.getStatus(sourceApiNodeId),
    enabled: open && (snapshot?.plugin_uri === 'map2://juce/ir/cabinet' || snapshot?.plugin_uri === 'map2://juce/ir/reverb'),
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
    enabled: open && snapshot?.plugin_uri === 'map2://juce/amp/nam',
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
    enabled: open && (snapshot?.plugin_uri === 'map2://juce/ir/cabinet' || snapshot?.plugin_uri === 'map2://juce/ir/reverb'),
    staleTime: 10000,
  })

  const pluginDependency = useMemo<DependencyDescriptor | null>(() => {
    if (!snapshot) {
      return null
    }

    const plugin = pluginCatalogQuery.data?.plugins?.find((candidate) => candidate.uri === snapshot.plugin_uri)
    const installedOn = plugin?.installed_on ?? (snapshot.plugin_uri.startsWith('map2://juce/') ? nodes.map((node) => node.nodeId) : [])

    return {
      kind: 'plugin',
      label: sanitizeRestrictedDisplayText(snapshot.plugin_name) || snapshot.plugin_uri,
      availableOn: installedOn,
      canDeploy: false,
    }
  }, [nodes, pluginCatalogQuery.data?.plugins, snapshot])

  const assetDependency = useMemo<DependencyDescriptor | null>(() => {
    if (!snapshot) {
      return null
    }

    if (snapshot.plugin_uri === 'map2://juce/amp/nam') {
      const activeModel = namStatusQuery.data?.activeModel
      if (!activeModel) {
        return null
      }
      const { item, availableOn } = findLibraryDependency(namLibraryQuery.data, sourceNodeId, activeModel, 'nam')
      return {
        kind: 'nam',
        label: activeModel,
        availableOn,
        canDeploy: Boolean(item?.path_token),
        pathToken: item?.path_token ?? null,
      }
    }

    if (snapshot.plugin_uri === 'map2://juce/ir/cabinet') {
      const loadedCabinet = irStatusQuery.data?.loaded_cabinet
      if (!loadedCabinet) {
        return null
      }
      const { item, availableOn } = findLibraryDependency(irLibraryQuery.data, sourceNodeId, loadedCabinet, 'cabinet_ir')
      return {
        kind: 'cabinet_ir',
        label: loadedCabinet,
        availableOn,
        canDeploy: Boolean(item?.path_token),
        pathToken: item?.path_token ?? null,
      }
    }

    if (snapshot.plugin_uri === 'map2://juce/ir/reverb') {
      const loadedReverb = irStatusQuery.data?.loaded_reverb
      if (!loadedReverb) {
        return null
      }
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
    snapshot,
    sourceNodeId,
  ])

  const unresolvedAssetDependency =
    assetDependency !== null && !assetDependency.canDeploy && assetDependency.availableOn.length === 0

  const deployMutation = useMutation({
    mutationFn: async (targetNodeIds: string[]) => {
      if (!snapshot) {
        throw new Error('No snapshot selected')
      }

      const pluginMissingTargets = targetNodeIds.filter((nodeId) => pluginDependency && !pluginDependency.availableOn.includes(nodeId))
      if (pluginMissingTargets.length > 0) {
        throw new Error(
          `Missing plugin on: ${pluginMissingTargets.map((nodeId) => nodeLabelById.get(nodeId) ?? nodeId).join(', ')}`,
        )
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
            throw new Error((body as { detail?: string }).detail || 'Failed to deploy snapshot dependencies')
          }
        }
      }

      const snapshotResponse = await fetch('/api/preset-exchange/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_type: 'preset',
          preset_id: snapshot.id,
          source_node_id: sourceNodeId,
          target_node_ids: targetNodeIds,
        }),
      })
      if (!snapshotResponse.ok) {
        const body = await snapshotResponse.json().catch(() => ({}))
        throw new Error((body as { detail?: string }).detail || 'Failed to deploy snapshot')
      }
      return snapshotResponse.json() as Promise<{ successful?: string[]; failed?: string[] }>
    },
    onSuccess: async (payload, targetNodeIds) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['plugin-snapshots'] }),
        queryClient.invalidateQueries({ queryKey: ['plugin-snapshots', 'availability'] }),
        queryClient.invalidateQueries({ queryKey: ['plugin-snapshots', 'cluster-catalog'] }),
        queryClient.invalidateQueries({ queryKey: ['cluster', 'library'] }),
      ])
      pushToast(`Deployed snapshot to ${payload.successful?.length ?? targetNodeIds.length} node${targetNodeIds.length === 1 ? '' : 's'}`, 'success')
      onClose()
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Snapshot deployment failed', 'error')
    },
  })

  const rows = useMemo(() => {
    return targetNodes.map((node) => {
      const pluginReady = pluginDependency ? pluginDependency.availableOn.includes(node.nodeId) : true
      const assetReady = assetDependency ? assetDependency.availableOn.includes(node.nodeId) : true
      const assetWillDeploy = Boolean(assetDependency && !assetReady && assetDependency.canDeploy && selectedTargetIds.has(node.nodeId))
      const snapshotReady = availability?.available_on.includes(node.nodeId) ?? false
      const canTargetDeploy = node.isOnline && pluginReady && (!assetDependency || assetReady || assetDependency.canDeploy)

      return {
        node,
        pluginReady,
        assetReady,
        assetWillDeploy,
        snapshotReady,
        canTargetDeploy,
      }
    })
  }, [assetDependency, availability?.available_on, pluginDependency, selectedTargetIds, targetNodes])

  const dependencyLoading =
    pluginCatalogQuery.isLoading || namStatusQuery.isLoading || irStatusQuery.isLoading || namLibraryQuery.isLoading || irLibraryQuery.isLoading
  const dependencyError =
    pluginCatalogQuery.isError || namStatusQuery.isError || irStatusQuery.isError || namLibraryQuery.isError || irLibraryQuery.isError

  const canSubmit =
    selectedTargetIds.size > 0 && !dependencyLoading && !dependencyError && !deployMutation.isPending

  if (!open || !snapshot) {
    return null
  }

  return (
    <Modal
      open={open}
      size="lg"
      modalHeading={`Deploy snapshot: ${snapshot.name}`}
      modalLabel={`Source node: ${sourceNodeLabel}`}
      primaryButtonText={deployMutation.isPending ? 'Deploying...' : 'Deploy snapshot'}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={!canSubmit}
      onRequestClose={() => {
        if (!deployMutation.isPending) {
          onClose()
        }
      }}
      onSecondarySubmit={() => {
        if (!deployMutation.isPending) {
          onClose()
        }
      }}
      onRequestSubmit={() => {
        if (canSubmit) {
          deployMutation.mutate(Array.from(selectedTargetIds))
        }
      }}
    >
      <div className="snapshot-deploy-modal">
        <p className="snapshot-deploy-modal__description">
          Dependency checks verify plugin availability and optional NAM/IR content before deploying to selected nodes.
        </p>

        <div className="snapshot-deploy-modal__summary-grid">
          <article className="snapshot-deploy-modal__summary-card">
            <h4>
              <Information size={16} aria-hidden="true" />
              Snapshot
            </h4>
            <p>{snapshot.name}</p>
            <span>{availability?.available_on.length ?? 0}/{nodes.length} nodes already have this checksum.</span>
          </article>

          <article className="snapshot-deploy-modal__summary-card">
            <h4>
              <MachineLearningModel size={16} aria-hidden="true" />
              Plugin dependency
            </h4>
            <p>{pluginDependency?.label ?? (sanitizeRestrictedDisplayText(snapshot.plugin_name) || snapshot.plugin_uri)}</p>
            <span>Available on {pluginDependency?.availableOn.length ?? 0}/{nodes.length} nodes.</span>
          </article>

          <article className="snapshot-deploy-modal__summary-card">
            <h4>
              {assetDependency?.kind === 'nam' ? (
                <MachineLearningModel size={16} aria-hidden="true" />
              ) : (
                <VolumeUp size={16} aria-hidden="true" />
              )}
              Content dependency
            </h4>
            <p>{assetDependency ? assetDependency.label : 'No IR or NAM dependency inferred for this snapshot.'}</p>
            <span>
              {assetDependency
                ? assetDependency.canDeploy
                  ? `Available on ${assetDependency.availableOn.length}/${nodes.length} nodes.`
                  : 'Detected on source node, but not indexed for cluster deployment.'
                : 'Generic parameter snapshot.'}
            </span>
          </article>
        </div>

        {unresolvedAssetDependency && (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Content dependency unresolved"
            subtitle={`The source node reports ${assetDependency?.label}, but it is not indexed in the cluster library.`}
          />
        )}

        <TableContainer className="snapshot-deploy-modal__table-wrap">
          <Table size="sm" useZebraStyles={false}>
            <TableHead>
              <TableRow>
                <TableHeader>Target node</TableHeader>
                <TableHeader>Plugin</TableHeader>
                <TableHeader>Content</TableHeader>
                <TableHeader>Snapshot</TableHeader>
                <TableHeader>Select</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(({ node, pluginReady, assetReady, assetWillDeploy, snapshotReady, canTargetDeploy }) => {
                const checked = selectedTargetIds.has(node.nodeId)
                const nodeLabel = nodeLabelById.get(node.nodeId) ?? node.nodeId

                return (
                  <TableRow key={node.nodeId}>
                    <TableCell>
                      <p className="snapshot-deploy-modal__node-label">{nodeLabel}</p>
                      <span className="snapshot-deploy-modal__node-meta">
                        {node.isOnline ? `Latency ${node.latencyMs ?? 'n/a'} ms` : 'Offline'}
                      </span>
                    </TableCell>
                    <TableCell>{pluginReady ? statusTag('green', 'Available') : statusTag('red', 'Missing plugin')}</TableCell>
                    <TableCell>
                      {!assetDependency
                        ? statusTag('cool-gray', 'None')
                        : assetReady
                          ? statusTag('purple', 'Ready')
                          : assetWillDeploy
                            ? statusTag('blue', 'Will deploy')
                            : assetDependency.canDeploy
                              ? statusTag('warm-gray', 'Missing asset')
                              : statusTag('red', 'Blocked')}
                    </TableCell>
                    <TableCell>
                      {snapshotReady
                        ? statusTag('green', 'Installed')
                        : checked
                          ? statusTag('blue', 'Will deploy')
                          : statusTag('cool-gray', 'Not selected')}
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        id={`snapshot-deploy-select-${node.nodeId}`}
                        labelText={`Select ${nodeLabel}`}
                        hideLabel
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
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>

        {dependencyLoading && <InlineLoading description="Checking cluster dependencies" status="active" />}

        {dependencyError && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Dependency checks failed"
            subtitle="One or more dependency checks failed. Resolve that first, then deploy."
          />
        )}

        <div className="snapshot-deploy-modal__selection-status">
          {statusTag('blue', `${selectedTargetIds.size} target node${selectedTargetIds.size === 1 ? '' : 's'} selected`)}
          {assetDependency && !assetDependency.canDeploy && (
            <span className="snapshot-deploy-modal__blocked-hint">
              <WarningAlt size={16} aria-hidden="true" />
              Asset dependency cannot be deployed until indexed in library.
            </span>
          )}
        </div>

        {!targetNodes.length && (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title="No target nodes available"
            subtitle="All known nodes match the source node, so there are no deployment targets."
          />
        )}
      </div>
    </Modal>
  )
}

export default SnapshotDeployModal
