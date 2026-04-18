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
import { snapshotsApi } from '../../../map2/clients/snapshots'
import type { PluginLoaderState, SnapshotDetail, SnapshotPlugin } from '../../../map2/types'
import { sanitizeRestrictedDisplayText } from '../../../map2/displayNames'
import { useCluster } from '../../contexts/useCluster'
import { useToasts } from '../Toasts'
import { buildSnapshotWorkflowStageToast } from '../../utils/snapshotActivationToast'
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

type DependencyDescriptor = {
  key: string
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
  const normalized = (value || '').trim().split(/[\\/]/).pop() ?? ''
  return stripExtension(normalized)
}

function snapshotLoaderLabel(loaderState: PluginLoaderState): string | null {
  return (
    loaderState.selected_asset_name ||
    loaderState.selected_model ||
    loaderState.selected_ir ||
    loaderState.selected_asset_path?.split(/[\\/]/).pop() ||
    null
  )
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
  const { nodes } = useCluster()
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set())

  const snapshotPluginUri = snapshot?.plugin_uri
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

  const snapshotDetailQuery = useQuery({
    queryKey: ['snapshots', snapshot?.id, 'detail'],
    queryFn: () => snapshotsApi.get(snapshot!.id),
    enabled: open && Boolean(snapshot?.id),
    staleTime: 10000,
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
    enabled: open && Boolean(snapshotDetailQuery.data),
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
    enabled: open && Boolean(snapshotDetailQuery.data),
    staleTime: 10000,
  })

  const pluginDependency = useMemo<DependencyDescriptor | null>(() => {
    if (!snapshot) {
      return null
    }

    const plugin = pluginCatalogQuery.data?.plugins?.find((candidate) => candidate.uri === snapshotPluginUri)
    const installedOn = plugin?.installed_on ?? (snapshotPluginUri.startsWith('map2://juce/') ? nodes.map((node) => node.nodeId) : [])

    return {
      key: `plugin:${snapshotPluginUri ?? 'unknown'}`,
      kind: 'plugin',
      label: sanitizeRestrictedDisplayText(snapshot.plugin_name) || snapshotPluginUri,
      availableOn: installedOn,
      canDeploy: false,
    }
  }, [nodes, pluginCatalogQuery.data?.plugins, snapshot, snapshotPluginUri])

  const assetDependencies = useMemo<DependencyDescriptor[]>(() => {
    const snapshotData: SnapshotDetail | undefined = snapshotDetailQuery.data
    if (!snapshotData) {
      return []
    }

    const descriptors = new Map<string, DependencyDescriptor>()
    const plugins = snapshotData.chains.flatMap((chain) => chain.plugins ?? [])

    for (const plugin of plugins as SnapshotPlugin[]) {
      const loaderState = (plugin.loader_state ?? {}) as PluginLoaderState
      const label = snapshotLoaderLabel(loaderState)
      if (!label) {
        continue
      }

      if (plugin.uri === 'map2://juce/nam') {
        const { item, availableOn } = findLibraryDependency(namLibraryQuery.data, sourceNodeId, label, 'nam')
        const key = `nam:${item?.path_token ?? normalizeCandidate(label)}`
        const current = descriptors.get(key)
        descriptors.set(key, {
          key,
          kind: 'nam',
          label,
          availableOn: current ? Array.from(new Set([...current.availableOn, ...availableOn])) : availableOn,
          canDeploy: current?.canDeploy || Boolean(item?.path_token),
          pathToken: current?.pathToken ?? item?.path_token ?? null,
        })
        continue
      }

      if (plugin.uri === 'map2://juce/convolution/cabinet' || loaderState.ir_type === 'cabinet') {
        const { item, availableOn } = findLibraryDependency(irLibraryQuery.data, sourceNodeId, label, 'cabinet_ir')
        const key = `cabinet_ir:${item?.path_token ?? normalizeCandidate(label)}`
        const current = descriptors.get(key)
        descriptors.set(key, {
          key,
          kind: 'cabinet_ir',
          label,
          availableOn: current ? Array.from(new Set([...current.availableOn, ...availableOn])) : availableOn,
          canDeploy: current?.canDeploy || Boolean(item?.path_token),
          pathToken: current?.pathToken ?? item?.path_token ?? null,
        })
        continue
      }

      if (plugin.uri === 'map2://juce/convolution/reverb' || loaderState.ir_type === 'reverb') {
        const { item, availableOn } = findLibraryDependency(irLibraryQuery.data, sourceNodeId, label, 'reverb_ir')
        const key = `reverb_ir:${item?.path_token ?? normalizeCandidate(label)}`
        const current = descriptors.get(key)
        descriptors.set(key, {
          key,
          kind: 'reverb_ir',
          label,
          availableOn: current ? Array.from(new Set([...current.availableOn, ...availableOn])) : availableOn,
          canDeploy: current?.canDeploy || Boolean(item?.path_token),
          pathToken: current?.pathToken ?? item?.path_token ?? null,
        })
      }
    }

    return Array.from(descriptors.values())
  }, [
    namLibraryQuery.data,
    irLibraryQuery.data,
    snapshotDetailQuery.data,
    sourceNodeId,
  ])

  const unresolvedAssetDependencies = assetDependencies.filter(
    (dependency) => !dependency.canDeploy && dependency.availableOn.length === 0,
  )

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

      if (unresolvedAssetDependencies.length > 0) {
        throw new Error(
          `Unable to resolve snapshot dependencies: ${unresolvedAssetDependencies.map((dependency) => dependency.label).join(', ')}`,
        )
      }

      for (const assetDependency of assetDependencies) {
        if (!assetDependency.pathToken) {
          continue
        }
        const missingAssetTargets = targetNodeIds.filter((nodeId) => !assetDependency.availableOn.includes(nodeId))
        if (missingAssetTargets.length === 0) {
          continue
        }
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
      const message = `Deployed snapshot to ${payload.successful?.length ?? targetNodeIds.length} node${targetNodeIds.length === 1 ? '' : 's'}`
      const stageToast = buildSnapshotWorkflowStageToast({
        workflowId: 'snapshot-deploy',
        snapshotId: snapshot.id,
        snapshotName: snapshot.name,
        title: 'Snapshot deployed',
        message,
        severity: 'success',
        nodeId: sourceNodeId,
      })
      pushToast(message, 'success', {
        id: stageToast.options.id,
        title: stageToast.title,
        stage: stageToast.options.stage,
      })
      onClose()
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Snapshot deployment failed'
      const stageToast = buildSnapshotWorkflowStageToast({
        workflowId: 'snapshot-deploy-failed',
        snapshotId: snapshot?.id ?? null,
        snapshotName: snapshot?.name ?? 'Snapshot',
        title: 'Snapshot deploy failed',
        message,
        severity: 'warning',
        nodeId: sourceNodeId,
      })
      pushToast(message, 'error', {
        id: stageToast.options.id,
        title: stageToast.title,
        stage: stageToast.options.stage,
      })
    },
  })

  const rows = useMemo(() => {
    return targetNodes.map((node) => {
      const pluginReady = pluginDependency ? pluginDependency.availableOn.includes(node.nodeId) : true
      const assetReady = assetDependencies.every((dependency) => dependency.availableOn.includes(node.nodeId))
      const blockedAsset = assetDependencies.some(
        (dependency) => !dependency.availableOn.includes(node.nodeId) && !dependency.canDeploy,
      )
      const assetWillDeploy = Boolean(
        assetDependencies.length > 0 &&
          selectedTargetIds.has(node.nodeId) &&
          assetDependencies.some(
            (dependency) => !dependency.availableOn.includes(node.nodeId) && dependency.canDeploy,
          ),
      )
      const snapshotReady = availability?.available_on.includes(node.nodeId) ?? false
      const canTargetDeploy = node.isOnline && pluginReady && !blockedAsset

      return {
        node,
        pluginReady,
        assetReady,
        blockedAsset,
        assetWillDeploy,
        snapshotReady,
        canTargetDeploy,
      }
    })
  }, [assetDependencies, availability?.available_on, pluginDependency, selectedTargetIds, targetNodes])

  const dependencyLoading =
    pluginCatalogQuery.isLoading || snapshotDetailQuery.isLoading || namLibraryQuery.isLoading || irLibraryQuery.isLoading
  const dependencyError =
    pluginCatalogQuery.isError || snapshotDetailQuery.isError || namLibraryQuery.isError || irLibraryQuery.isError

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
              {assetDependencies.some((dependency) => dependency.kind === 'nam') ? (
                <MachineLearningModel size={16} aria-hidden="true" />
              ) : (
                <VolumeUp size={16} aria-hidden="true" />
              )}
              Content dependency
            </h4>
            <p>
              {assetDependencies.length > 0
                ? assetDependencies.map((dependency) => dependency.label).join(', ')
                : 'No IR or NAM dependency inferred for this snapshot.'}
            </p>
            <span>
              {assetDependencies.length > 0
                ? unresolvedAssetDependencies.length > 0
                  ? 'One or more snapshot assets are missing from the source node library index.'
                  : `${assetDependencies.length} persisted asset dependency${assetDependencies.length === 1 ? '' : 'ies'} detected.`
                : 'Generic parameter snapshot.'}
            </span>
          </article>
        </div>

        {unresolvedAssetDependencies.length > 0 && (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Content dependency unresolved"
            subtitle={`The source node snapshot references ${unresolvedAssetDependencies.map((dependency) => dependency.label).join(', ')}, but they are not indexed in the cluster library.`}
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
              {rows.map(({ node, pluginReady, assetReady, blockedAsset, assetWillDeploy, snapshotReady, canTargetDeploy }) => {
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
                      {assetDependencies.length === 0
                        ? statusTag('cool-gray', 'None')
                        : assetReady
                          ? statusTag('purple', 'Ready')
                          : assetWillDeploy
                            ? statusTag('blue', 'Will deploy')
                            : !blockedAsset
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
          {unresolvedAssetDependencies.length > 0 && (
            <span className="snapshot-deploy-modal__blocked-hint">
              <WarningAlt size={16} aria-hidden="true" />
              Asset dependencies cannot be deployed until indexed in the cluster library.
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
