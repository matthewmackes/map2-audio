import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  InlineLoading,
  Modal,
  NumberInput,
  OverflowMenu,
  OverflowMenuItem,
  Select,
  SelectItem,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import {
  Add,
  ArrowsHorizontal,
  CloudUpload,
  Launch,
  Network_4,
  Renew,
  WarningAlt,
} from '@carbon/icons-react'
import { snapshotsApi, snapshotDetailToDraftData } from '../../../map2/clients/snapshots'
import type { SnapshotDetail, SnapshotExport, SnapshotRuntimeLiveState, SnapshotSummary } from '../../../map2/types'
import { fingerprintSnapshotData } from '../SnapshotEditor/snapshotEditorComparison'
import { buildDefaultSnapshotName } from '../../utils/snapshotNames'
import {
  buildSnapshotActivationFailureToastMessage,
  buildSnapshotActivationToastMessage,
} from '../../utils/snapshotActivationToast'
import { useRealtimeCadence } from '../../hooks/useRealtimeCadence'
import { useRouteActive } from '../../hooks/useRouteActive'
import {
  useClusterSnapshotRuntimeLiveState,
  useSnapshotActivationEvents,
  useSnapshotRuntimeLiveState,
} from '../../hooks/useSnapshotRuntimeState'

type ToastKind = 'error' | 'info' | 'success' | 'warning'

interface SnapshotArtifactsWorkspaceProps {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  isClusterMode: boolean
  nodes: Array<{ nodeId: string; hostname: string; isLocal: boolean }>
  localNodeId: string
  onToast: (kind: ToastKind, title: string, subtitle?: string) => void
}

function createDefaultSnapshotRequest(name: string) {
  const pathDefinitions = [
    {
      id: 'ch_a',
      name: `${name} Path A`,
      label: 'A',
      color: '#2563eb',
      muted: false,
      solo: false,
      dry_wet_mix: 100,
      order_index: 0,
      snapshot_chain_id: 1,
      runtime_chain_id: null,
      plugins: [],
      loop_insertions: [],
      effects_loops: [],
    },
    {
      id: 'ch_b',
      name: `${name} Path B`,
      label: 'B',
      color: '#22c55e',
      muted: false,
      solo: false,
      dry_wet_mix: 100,
      order_index: 1,
      snapshot_chain_id: 2,
      runtime_chain_id: null,
      plugins: [],
      loop_insertions: [],
      effects_loops: [],
    },
  ]

  return {
    name,
    description: 'Created from Audio Artifacts snapshots workspace',
    io_bindings: {
      input_device: null,
      output_device: null,
      remap_required: false,
    },
    controls: {
      midi_map: [],
      automation_lanes: [],
      expression_mappings: [],
      maschine_encoder_map: {
        enc1: null,
        enc2: null,
        enc3: null,
        enc4: null,
        enc5: null,
        enc6: null,
        enc7: null,
        enc8: null,
        vol: { fixed: true, label: 'Master Gain' },
        tempo: { fixed: true, label: 'MIDI Clock BPM' },
        swing: { label: 'Swing' },
      },
    },
    paths: pathDefinitions,
    chains: pathDefinitions.map((path) => ({
      id: path.snapshot_chain_id,
      name: path.name,
      plugins: [],
      loop_insertions: [],
      effects_loops: [],
    })),
    routing: {
      mode: 'parallel_blend' as const,
      active_channel_key: 'ch_a',
      blend_positions: { ch_a: 100, ch_b: 100 },
      morph_position: 0,
      morph_source_channel_key: 'ch_a',
      morph_target_channel_key: 'ch_b',
      series_order: ['ch_a', 'ch_b'],
    },
    midi_map: [],
  }
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function computeDirty(
  snapshot: SnapshotSummary,
  snapshotDetail: SnapshotDetail | undefined,
  liveSnapshot: SnapshotDetail | null | undefined,
  runtimeState: SnapshotRuntimeLiveState | undefined,
) {
  if (runtimeState?.snapshot_id !== snapshot.id || !snapshotDetail || !liveSnapshot) {
    return false
  }
  if (snapshotDetail.snapshot_revision && liveSnapshot.snapshot_revision) {
    return snapshotDetail.snapshot_revision !== liveSnapshot.snapshot_revision
  }
  return fingerprintSnapshotData(snapshotDetailToDraftData(snapshotDetail)) !== fingerprintSnapshotData(snapshotDetailToDraftData(liveSnapshot))
}

function summarizeDeploymentNodes(snapshotId: number, deployments: SnapshotDetail['deployments'] | Array<{ snapshot_id: number; primary_node_id: string }>) {
  const matching = deployments.filter((deployment) => deployment.snapshot_id === snapshotId)
  if (matching.length === 0) {
    return 'Cluster canonical'
  }
  return matching.map((deployment) => deployment.primary_node_id).join(', ')
}

export function SnapshotArtifactsWorkspace({
  searchQuery,
  onSearchQueryChange,
  isClusterMode,
  nodes,
  localNodeId,
  onToast,
}: SnapshotArtifactsWorkspaceProps) {
  const queryClient = useQueryClient()
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | null>(null)
  const [targetNodeId, setTargetNodeId] = useState<string>('')
  const [programValue, setProgramValue] = useState<string>('')
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importPayloadText, setImportPayloadText] = useState('')
  const [importBundleFile, setImportBundleFile] = useState<File | null>(null)
  const routeActive = useRouteActive(['/artifacts'])
  const snapshotCadence = useRealtimeCadence({
    routeActive,
    visibleMs: 5_000,
    hiddenMs: 20_000,
    inactiveMs: false,
  })
  const deploymentCadence = useRealtimeCadence({
    routeActive,
    visibleMs: 10_000,
    hiddenMs: 30_000,
    inactiveMs: false,
  })

  const snapshotsQuery = useQuery({
    queryKey: ['snapshots'],
    queryFn: () => snapshotsApi.list(),
    refetchInterval: snapshotCadence,
  })
  const liveSnapshotQuery = useQuery({
    queryKey: ['snapshots', 'live'],
    queryFn: () => snapshotsApi.getLive(),
    retry: false,
    refetchInterval: snapshotCadence,
  })
  const runtimeStateQuery = useSnapshotRuntimeLiveState(undefined, {
    refetchInterval: snapshotCadence,
  })
  const clusterRuntimeStateQuery = useClusterSnapshotRuntimeLiveState({
    enabled: isClusterMode,
    refetchInterval: deploymentCadence,
  })
  const activationEventsQuery = useSnapshotActivationEvents(undefined, {
    limit: 100,
    refetchInterval: snapshotCadence,
  })
  const nodesQuery = useQuery({
    queryKey: ['cluster', 'nodes'],
    queryFn: () => snapshotsApi.listNodes(),
    enabled: isClusterMode,
    staleTime: 10000,
  })
  const deploymentsQuery = useQuery({
    queryKey: ['cluster', 'snapshots', 'deployments'],
    queryFn: () => snapshotsApi.listDeployments(),
    enabled: isClusterMode,
    refetchInterval: deploymentCadence,
  })

  const snapshots = snapshotsQuery.data?.snapshots ?? []
  const activeSnapshotId = snapshotsQuery.data?.active_id ?? null
  const selectedId = selectedSnapshotId ?? activeSnapshotId ?? snapshots[0]?.id ?? null
  const runtimeState = runtimeStateQuery.data

  const selectedSnapshotQuery = useQuery({
    queryKey: ['snapshots', 'detail', selectedId],
    queryFn: () => snapshotsApi.get(selectedId as number),
    enabled: selectedId !== null,
  })

  const selectedSnapshot = selectedSnapshotQuery.data

  const remoteNodes = useMemo(() => {
    const source = nodesQuery.data?.nodes ?? nodes.map((node) => ({
      id: node.nodeId,
      hostname: node.hostname,
      status: node.isLocal ? 'online' : 'online',
    }))
    return source.filter((node) => node.id !== localNodeId)
  }, [localNodeId, nodes, nodesQuery.data?.nodes])

  const filteredSnapshots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const list = [...snapshots].sort((a, b) => {
      if (a.is_favorite && !b.is_favorite) return -1
      if (!a.is_favorite && b.is_favorite) return 1
      if (a.is_active && !b.is_active) return -1
      if (!a.is_active && b.is_active) return 1
      return a.display_order - b.display_order
    })
    if (!q) {
      return list
    }
    return list.filter((snapshot) => {
      const haystack = [
        snapshot.name,
        snapshot.description,
        snapshot.program_number === null ? '' : String(snapshot.program_number),
        snapshot.tags.join(' '),
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [searchQuery, snapshots])

  const activateMutation = useMutation({
    mutationFn: (snapshotId: number) => snapshotsApi.activate(snapshotId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      void queryClient.invalidateQueries({ queryKey: ['snapshots', 'runtime', 'cluster-live-state'] })
      queryClient.setQueryData(['snapshots', 'live'], result.snapshot_data)
      if (result.runtime_live_state) {
        queryClient.setQueryData(['snapshots', 'runtime', 'live-state', 'local'], result.runtime_live_state)
      }
      setSelectedSnapshotId(result.snapshot_id)
      onToast('success', buildSnapshotActivationToastMessage(result.snapshot_data))
    },
    onError: (error, snapshotId) => {
      const snapshotName = snapshots.find((snapshot) => snapshot.id === snapshotId)?.name ?? 'Snapshot'
      onToast('warning', buildSnapshotActivationFailureToastMessage(snapshotName, error))
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: (snapshotId: number) => snapshotsApi.duplicate(snapshotId),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      setSelectedSnapshotId(result.snapshot_id)
      onToast('success', 'Snapshot duplicated', result.snapshot.name)
    },
    onError: (error: Error) => onToast('error', 'Failed to duplicate snapshot', error.message),
  })

  const favoriteMutation = useMutation({
    mutationFn: ({ snapshotId, isFavorite }: { snapshotId: number; isFavorite: boolean }) =>
      snapshotsApi.update(snapshotId, { is_favorite: isFavorite }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      await queryClient.invalidateQueries({ queryKey: ['snapshots', 'detail', result.snapshot.id] })
      onToast('success', result.snapshot.is_favorite ? 'Snapshot marked as favorite' : 'Snapshot removed from favorites', result.snapshot.name)
    },
    onError: (error: Error) => onToast('error', 'Failed to update snapshot favorite', error.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (snapshotId: number) => snapshotsApi.delete(snapshotId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      setSelectedSnapshotId(null)
      onToast('success', 'Snapshot deleted')
    },
    onError: (error: Error) => onToast('error', 'Failed to delete snapshot', error.message),
  })

  const deployMutation = useMutation({
    mutationFn: ({ snapshotId, nodeId }: { snapshotId: number; nodeId: string }) =>
      snapshotsApi.deploy({ snapshot_id: snapshotId, node_id: nodeId, redundancy_enabled: false }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['cluster', 'snapshots', 'deployments'] })
      await queryClient.invalidateQueries({ queryKey: ['snapshots', 'detail', result.snapshot_id] })
      onToast('success', 'Snapshot published to cluster', `${result.snapshot?.name ?? 'Snapshot'} -> ${result.node_id}`)
    },
    onError: (error: Error) => onToast('error', 'Cluster publish failed', error.message),
  })

  const failoverMutation = useMutation({
    mutationFn: (snapshotId: number) => snapshotsApi.failover(snapshotId),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['cluster', 'snapshots', 'deployments'] })
      await queryClient.invalidateQueries({ queryKey: ['snapshots', 'detail', result.snapshot_id] })
      onToast('success', 'Remote deployment promoted', result.deployment.primary_node_id)
    },
    onError: (error: Error) => onToast('error', 'Promote remote failed', error.message),
  })

  const programMutation = useMutation({
    mutationFn: ({ snapshotId, programNumber }: { snapshotId: number; programNumber: number | null }) =>
      snapshotsApi.setProgram(snapshotId, programNumber),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      await queryClient.invalidateQueries({ queryKey: ['snapshots', 'detail', variables.snapshotId] })
      onToast('success', 'MIDI program updated')
    },
    onError: (error: Error) => onToast('error', 'Failed to update MIDI program', error.message),
  })

  const createMutation = useMutation({
    mutationFn: async (snapshotName: string) => {
      const created = await snapshotsApi.create({
        ...createDefaultSnapshotRequest(snapshotName),
      })
      return snapshotsApi.activate(created.snapshot_id)
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      await queryClient.invalidateQueries({ queryKey: ['snapshots', 'runtime', 'cluster-live-state'] })
      queryClient.setQueryData(['snapshots', 'live'], result.snapshot_data)
      if (result.runtime_live_state) {
        queryClient.setQueryData(['snapshots', 'runtime', 'live-state', 'local'], result.runtime_live_state)
      }
      setSelectedSnapshotId(result.snapshot_id)
      onToast('success', buildSnapshotActivationToastMessage(result.snapshot_data))
    },
    onError: (error, snapshotName) => onToast('warning', buildSnapshotActivationFailureToastMessage(snapshotName, error)),
  })

  const importMutation = useMutation({
    mutationFn: async () => {
      if (importBundleFile) {
        return snapshotsApi.importSnapshotBundle(importBundleFile, importBundleFile.name)
      }
      const payload = JSON.parse(importPayloadText) as SnapshotExport | SnapshotDetail | { snapshot: SnapshotDetail }
      return snapshotsApi.importSnapshot(payload)
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      setSelectedSnapshotId(result.snapshot_id)
      setImportModalOpen(false)
      setImportPayloadText('')
      setImportBundleFile(null)
      onToast('success', 'Snapshot imported', result.snapshot.name)
    },
    onError: (error: Error) => onToast('error', 'Snapshot import failed', error.message),
  })

  const exportMutation = useMutation({
    mutationFn: (snapshotId: number) => snapshotsApi.exportSnapshot(snapshotId),
    onSuccess: (payload) => {
      const url = URL.createObjectURL(payload.blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = payload.filename
      anchor.click()
      URL.revokeObjectURL(url)
      onToast('success', 'Snapshot exported', payload.filename)
    },
    onError: (error: Error) => onToast('error', 'Snapshot export failed', error.message),
  })

  const selectedSnapshotDirty = computeDirty(
    selectedSnapshot ?? ({
      is_active: false,
    } as SnapshotSummary),
    selectedSnapshot,
    liveSnapshotQuery.data ?? null,
    runtimeState,
  )

  const selectedDeployment = useMemo(
    () => deploymentsQuery.data?.deployments.filter((deployment) => deployment.snapshot_id === selectedId) ?? [],
    [deploymentsQuery.data?.deployments, selectedId],
  )
  const selectedSnapshotRuntimeNodes = useMemo(
    () => (
      clusterRuntimeStateQuery.data?.nodes ?? []
    ).filter((node) => node.snapshot_id === selectedId || node.live_snapshot_payload?.id === selectedId),
    [clusterRuntimeStateQuery.data?.nodes, selectedId],
  )
  const selectedSnapshotLocalRuntime = selectedId !== null && runtimeState?.snapshot_id === selectedId
    ? runtimeState
    : null

  const targetNodeName = remoteNodes.find((node) => node.id === targetNodeId)?.hostname ?? targetNodeId

  return (
    <>
      <div className="aap-snapshots">
        <Tile className="aap-snapshots__library">
          <div className="aap-snapshots__toolbar">
            <div>
              <p className="aap-snapshots__eyebrow">Snapshots</p>
              <h3 className="aap-snapshots__title">Saved state artifacts with cluster lifecycle and node deployment context</h3>
            </div>
            <div className="aap-snapshots__toolbar-actions">
              <Button kind="ghost" size="sm" renderIcon={Renew} onClick={() => {
                void queryClient.invalidateQueries({ queryKey: ['snapshots'] })
                void queryClient.invalidateQueries({ queryKey: ['snapshots', 'live'] })
                void queryClient.invalidateQueries({ queryKey: ['snapshots', 'runtime', 'live-state', 'local'] })
                void queryClient.invalidateQueries({ queryKey: ['snapshots', 'runtime', 'activation-events', 'local', 100] })
                void queryClient.invalidateQueries({ queryKey: ['snapshots', 'runtime', 'cluster-live-state'] })
                void queryClient.invalidateQueries({ queryKey: ['cluster', 'snapshots', 'deployments'] })
              }}>
                Refresh
              </Button>
              <Button kind="secondary" size="sm" renderIcon={CloudUpload} onClick={() => setImportModalOpen(true)}>
                Import snapshot
              </Button>
              <Button
                kind="primary"
                size="sm"
                renderIcon={Add}
                onClick={() => createMutation.mutate(buildDefaultSnapshotName(snapshots.length + 1))}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating…' : 'Create snapshot'}
              </Button>
            </div>
          </div>

          <div className="aap-snapshots__search-row">
            <TextInput
              id="artifacts-snapshots-search"
              labelText="Search snapshots"
              placeholder="Search by name, description, tags, or MIDI PC"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
            />
          </div>

          {snapshotsQuery.isLoading ? (
            <div className="aap-snapshots__loading">
              <InlineLoading description="Loading snapshots" status="active" />
            </div>
          ) : filteredSnapshots.length === 0 ? (
            <div className="aap-snapshots__empty">
              <p>No saved snapshots match the current query.</p>
            </div>
          ) : (
            <div className="aap-snapshots__list" role="list" aria-label="Snapshots library">
              {filteredSnapshots.map((snapshot) => {
                const isSelected = snapshot.id === selectedId
                const isLiveSnapshot = runtimeState?.snapshot_id === snapshot.id
                const isDirty = snapshot.id === selectedId
                  ? selectedSnapshotDirty
                  : false
                const deploymentNodes = summarizeDeploymentNodes(snapshot.id, deploymentsQuery.data?.deployments ?? [])
                return (
                  <button
                    type="button"
                    key={snapshot.id}
                    className={`aap-snapshots__card${isSelected ? ' aap-snapshots__card--selected' : ''}`}
                    onClick={() => {
                      setSelectedSnapshotId(snapshot.id)
                      setProgramValue(snapshot.program_number === null ? '' : String(snapshot.program_number))
                    }}
                  >
                    <div className="aap-snapshots__card-header">
                      <div>
                        <p className="aap-snapshots__card-name">{snapshot.name}</p>
                        <p className="aap-snapshots__card-meta">
                          MIDI PC {snapshot.program_number === null ? '—' : snapshot.program_number} · {snapshot.channel_count} paths · {snapshot.chain_count} chains
                        </p>
                      </div>
                      <div className="aap-snapshots__card-actions">
                        <OverflowMenu ariaLabel={`Snapshot actions for ${snapshot.name}`} onClick={(event) => event.stopPropagation()}>
                          <OverflowMenuItem itemText="Make Live" onClick={() => activateMutation.mutate(snapshot.id)} />
                          <OverflowMenuItem
                            itemText={snapshot.is_favorite ? 'Remove favorite' : 'Mark favorite'}
                            onClick={() => favoriteMutation.mutate({ snapshotId: snapshot.id, isFavorite: !snapshot.is_favorite })}
                          />
                          <OverflowMenuItem itemText="Duplicate snapshot" onClick={() => duplicateMutation.mutate(snapshot.id)} />
                          <OverflowMenuItem itemText="Export snapshot" onClick={() => exportMutation.mutate(snapshot.id)} />
                          <OverflowMenuItem
                            isDelete
                            itemText="Delete snapshot"
                            disabled={isLiveSnapshot}
                            title={isLiveSnapshot ? 'Cannot delete a live snapshot.' : undefined}
                            onClick={() => deleteMutation.mutate(snapshot.id)}
                          />
                        </OverflowMenu>
                      </div>
                    </div>
                    <div className="aap-snapshots__card-flags">
                      <Tag
                        type={
                          runtimeState?.snapshot_id === snapshot.id
                            ? runtimeState.display_state === 'live_warning'
                              ? 'warm-gray'
                              : runtimeState.display_state === 'offline'
                                ? 'red'
                                : 'green'
                            : 'cool-gray'
                        }
                      >
                        {runtimeState?.snapshot_id === snapshot.id
                          ? runtimeState.display_state === 'live_warning'
                            ? 'Live + Warning'
                            : runtimeState.display_label
                          : 'Saved'}
                      </Tag>
                      {snapshot.is_favorite ? <Tag type="purple">Favorite</Tag> : null}
                      <Tag type={isDirty ? 'purple' : 'warm-gray'}>{isDirty ? 'Modified / Dirty' : 'Saved'}</Tag>
                      {snapshot.program_number !== null ? <Tag type="blue">MIDI PC {snapshot.program_number}</Tag> : null}
                    </div>
                    <div className="aap-snapshots__card-foot">
                      <span>{deploymentNodes}</span>
                      <span>{formatDate(snapshot.updated_at ?? snapshot.created_at)}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </Tile>

        <Tile className="aap-snapshots__detail" role="complementary" aria-label="Snapshot details">
          {selectedSnapshotQuery.isLoading ? (
            <InlineLoading description="Loading snapshot detail" status="active" />
          ) : !selectedSnapshot ? (
            <p>Select a snapshot to inspect its full contents, lifecycle, and cluster state.</p>
          ) : (
            <>
              <div className="aap-snapshots__detail-header">
                <div>
                  <p className="aap-snapshots__eyebrow">Snapshot detail</p>
                  <h3 className="aap-snapshots__detail-title">{selectedSnapshot.name}</h3>
                  <p className="aap-snapshots__detail-subtitle">{selectedSnapshot.description || 'No description provided.'}</p>
                </div>
                <OverflowMenu ariaLabel="Snapshot cluster and sync operations">
                  <OverflowMenuItem
                    itemText={selectedSnapshot.is_favorite ? 'Remove favorite' : 'Mark favorite'}
                    onClick={() => {
                      if (!selectedId) {
                        return
                      }
                      favoriteMutation.mutate({ snapshotId: selectedId, isFavorite: !selectedSnapshot.is_favorite })
                    }}
                  />
                  <OverflowMenuItem itemText="Publish to cluster" onClick={() => {
                    if (!selectedId || !targetNodeId) {
                      onToast('warning', 'Choose a target node first')
                      return
                    }
                    deployMutation.mutate({ snapshotId: selectedId, nodeId: targetNodeId })
                  }} />
                  <OverflowMenuItem itemText="Pull from node" onClick={() => {
                    onToast('info', 'Pull uses the canonical snapshot record', targetNodeId ? `Best-effort refresh for ${targetNodeName}` : 'Choose a target node to anchor the refresh context.')
                    void queryClient.invalidateQueries({ queryKey: ['snapshots', 'detail', selectedId] })
                  }} />
                  <OverflowMenuItem itemText="Compare local vs remote" onClick={() => {
                    onToast('info', 'Compare local vs remote', selectedDeployment.length > 0 ? 'Deployment history and node status are shown below for best-effort comparison.' : 'No remote deployment recorded for this snapshot yet.')
                  }} />
                  <OverflowMenuItem
                    isDelete
                    itemText="Delete snapshot"
                    disabled={selectedSnapshotLocalRuntime != null}
                    title={selectedSnapshotLocalRuntime ? 'Cannot delete a live snapshot.' : undefined}
                    onClick={() => {
                      if (!selectedId) {
                        return
                      }
                      deleteMutation.mutate(selectedId)
                    }}
                  />
                  <OverflowMenuItem itemText="Pin to node" onClick={() => {
                    if (!selectedId || !targetNodeId) {
                      onToast('warning', 'Choose a target node first')
                      return
                    }
                    deployMutation.mutate({ snapshotId: selectedId, nodeId: targetNodeId })
                  }} />
                  <OverflowMenuItem itemText="Promote remote to active" onClick={() => {
                    if (!selectedId) return
                    failoverMutation.mutate(selectedId)
                  }} />
                  <OverflowMenuItem itemText="Inspect per-node status" onClick={() => {
                    onToast('info', 'Per-node status', 'Deployment state, history, and node health are shown in the Node sync section below.')
                  }} />
                  <OverflowMenuItem itemText="Retry failed sync" onClick={() => {
                    if (!selectedId || !targetNodeId) {
                      onToast('warning', 'Choose a target node first')
                      return
                    }
                    deployMutation.mutate({ snapshotId: selectedId, nodeId: targetNodeId })
                  }} />
                  <OverflowMenuItem itemText="Conflict resolution" onClick={() => {
                    onToast('info', 'Conflict resolution uses defaults', 'Missing plugins, hardware, or remote resources fall back to defaults instead of failing the restore.')
                  }} />
                </OverflowMenu>
              </div>

              <div className="aap-snapshots__detail-tags">
                <Tag
                  type={
                    selectedSnapshotLocalRuntime
                      ? selectedSnapshotLocalRuntime.display_state === 'live_warning'
                        ? 'warm-gray'
                        : selectedSnapshotLocalRuntime.display_state === 'offline'
                          ? 'red'
                          : 'green'
                      : 'cool-gray'
                  }
                >
                  {selectedSnapshotLocalRuntime ? selectedSnapshotLocalRuntime.display_label : 'Saved'}
                </Tag>
                {selectedSnapshot.is_favorite ? <Tag type="purple">Favorite</Tag> : null}
                <Tag type={selectedSnapshotDirty ? 'purple' : 'warm-gray'}>{selectedSnapshotDirty ? 'Modified / Dirty' : 'Saved'}</Tag>
                <Tag type="blue">MIDI PC {selectedSnapshot.program_number === null ? '—' : selectedSnapshot.program_number}</Tag>
                <Tag type="cool-gray">Routing {selectedSnapshot.routing.mode}</Tag>
              </div>

              <div className="aap-snapshots__section-grid">
                <section className="aap-snapshots__section">
                  <h4>Lifecycle</h4>
                  <dl>
                    <div><dt>Created</dt><dd>{formatDate(selectedSnapshot.created_at)}</dd></div>
                    <div><dt>Updated</dt><dd>{formatDate(selectedSnapshot.updated_at)}</dd></div>
                    <div><dt>Lifecycle flags</dt><dd>{selectedSnapshotDirty ? 'Saved, Modified / Dirty' : 'Saved'}</dd></div>
                    <div><dt>Live activation</dt><dd>{selectedSnapshotLocalRuntime ? formatDate(selectedSnapshotLocalRuntime.emitted_at) : 'Not live'}</dd></div>
                    <div><dt>Runtime freshness</dt><dd>{selectedSnapshotLocalRuntime ? selectedSnapshotLocalRuntime.display_label : 'Stopped'}</dd></div>
                  </dl>
                </section>

                <section className="aap-snapshots__section">
                  <h4>Surface fields</h4>
                  <dl>
                    <div><dt>Name</dt><dd>{selectedSnapshot.name}</dd></div>
                    <div><dt>Flag</dt><dd>{selectedSnapshotLocalRuntime ? selectedSnapshotLocalRuntime.display_label : 'Saved'}</dd></div>
                    <div><dt>MIDI PC</dt><dd>{selectedSnapshot.program_number === null ? '—' : selectedSnapshot.program_number}</dd></div>
                    <div><dt>Revision</dt><dd>{selectedSnapshot.snapshot_revision ?? '—'}</dd></div>
                  </dl>
                </section>

                <section className="aap-snapshots__section">
                  <h4>Contained data</h4>
                  <dl>
                    <div><dt>Paths</dt><dd>{selectedSnapshot.paths.length}</dd></div>
                    <div><dt>Channels</dt><dd>{selectedSnapshot.channels.length}</dd></div>
                    <div><dt>Chains</dt><dd>{selectedSnapshot.chains.length}</dd></div>
                    <div><dt>Plugins</dt><dd>{selectedSnapshot.chains.reduce((sum, chain) => sum + chain.plugins.length, 0)}</dd></div>
                    <div><dt>Loop insertions</dt><dd>{selectedSnapshot.chains.reduce((sum, chain) => sum + (chain.loop_insertions?.length ?? 0), 0)}</dd></div>
                    <div><dt>Effects loops</dt><dd>{selectedSnapshot.chains.reduce((sum, chain) => sum + (chain.effects_loops?.length ?? 0), 0)}</dd></div>
                    <div><dt>MIDI mappings</dt><dd>{selectedSnapshot.midi_map.length}</dd></div>
                    <div><dt>Automation lanes</dt><dd>{selectedSnapshot.controls.automation_lanes.length}</dd></div>
                    <div><dt>Expression mappings</dt><dd>{selectedSnapshot.controls.expression_mappings.length}</dd></div>
                    <div><dt>Assets</dt><dd>{selectedSnapshot.assets.length}</dd></div>
                    <div><dt>Runtime chains</dt><dd>{selectedSnapshot.live_state.runtime_chains.length}</dd></div>
                  </dl>
                </section>

                <section className="aap-snapshots__section">
                  <h4>Routing and environment</h4>
                  <dl>
                    <div><dt>Routing mode</dt><dd>{selectedSnapshot.routing.mode}</dd></div>
                    <div><dt>Active path</dt><dd>{selectedSnapshot.routing.active_channel_key ?? 'Default'}</dd></div>
                    <div><dt>Series order</dt><dd>{selectedSnapshot.routing.series_order.join(', ') || '—'}</dd></div>
                    <div><dt>Input device</dt><dd>{selectedSnapshot.io_bindings.input_device ?? 'Default'}</dd></div>
                    <div><dt>Output device</dt><dd>{selectedSnapshot.io_bindings.output_device ?? 'Default'}</dd></div>
                    <div><dt>Missing resource policy</dt><dd>Use default</dd></div>
                  </dl>
                </section>
              </div>

              <section className="aap-snapshots__section">
                <h4>Node sync</h4>
                <div className="aap-snapshots__node-controls">
                  <Select
                    id="snapshot-node-target"
                    labelText="Target node"
                    value={targetNodeId}
                    onChange={(event) => setTargetNodeId(event.target.value)}
                  >
                    <SelectItem value="" text="Choose a node" />
                    {remoteNodes.map((node) => (
                      <SelectItem key={node.id} value={node.id} text={`${node.hostname ?? node.id} (${node.status ?? 'unknown'})`} />
                    ))}
                  </Select>
                  <div className="aap-snapshots__node-buttons">
                    <Button size="sm" kind="secondary" renderIcon={Network_4} onClick={() => {
                      if (!selectedId || !targetNodeId) {
                        onToast('warning', 'Choose a target node first')
                        return
                      }
                      deployMutation.mutate({ snapshotId: selectedId, nodeId: targetNodeId })
                    }}>
                      Publish
                    </Button>
                    <Button size="sm" kind="ghost" renderIcon={ArrowsHorizontal} onClick={() => {
                      if (!selectedId) return
                      failoverMutation.mutate(selectedId)
                    }}>
                      Promote remote
                    </Button>
                  </div>
                </div>
                {selectedDeployment.length === 0 ? (
                  <p className="aap-snapshots__section-copy">No remote deployment recorded yet. Cluster operations are best-effort and keep the canonical snapshot available locally.</p>
                ) : (
                  <div className="aap-snapshots__deployment-list">
                    {selectedDeployment.map((deployment) => (
                      <div key={deployment.id} className="aap-snapshots__deployment-card">
                        <div className="aap-snapshots__deployment-header">
                          <strong>{deployment.primary_node_id}</strong>
                          <Tag type={deployment.deployment_status === 'active' ? 'green' : deployment.deployment_status === 'failed' ? 'red' : 'cool-gray'}>
                            {deployment.deployment_status}
                          </Tag>
                        </div>
                        <p>Strategy: {deployment.assignment_strategy}</p>
                        <p>Redundancy: {deployment.redundancy_enabled ? 'Enabled' : 'Disabled'}</p>
                        <p>Standby nodes: {deployment.standby_node_ids.join(', ') || '—'}</p>
                        <p>Deployed: {formatDate(deployment.deployed_at)}</p>
                        <p>Last failover: {formatDate(deployment.last_failover_time)}</p>
                        {deployment.error_message ? (
                          <Tag type="red" renderIcon={WarningAlt}>{deployment.error_message}</Tag>
                        ) : null}
                        {deployment.history.length > 0 ? (
                          <div className="aap-snapshots__deployment-history">
                            {deployment.history.slice(0, 4).map((entry) => (
                              <div key={entry.id}>
                                <strong>{entry.action}</strong> · {entry.to_node_id} · {formatDate(entry.created_at)}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
                {(selectedSnapshotRuntimeNodes.length > 0 || selectedSnapshotLocalRuntime) ? (
                  <div className="aap-snapshots__deployment-list">
                    {(selectedSnapshotRuntimeNodes.length > 0 ? selectedSnapshotRuntimeNodes : selectedSnapshotLocalRuntime ? [selectedSnapshotLocalRuntime] : []).map((node) => (
                      <div key={node.node_id} className="aap-snapshots__deployment-card">
                        <div className="aap-snapshots__deployment-header">
                          <strong>{node.node_id}</strong>
                          <Tag
                            type={
                              node.display_state === 'live_warning'
                                ? 'warm-gray'
                                : node.display_state === 'offline'
                                  ? 'red'
                                  : node.display_state === 'live'
                                    ? 'green'
                                    : 'cool-gray'
                            }
                          >
                            {node.display_label}
                          </Tag>
                        </div>
                        <p>Triggered by: {node.triggered_by ?? '—'}</p>
                        <p>Last runtime event: {formatDate(node.emitted_at)}</p>
                        <p>Revision: {node.snapshot_revision ?? '—'}</p>
                        <p>Freshness age: {node.age_seconds === null ? '—' : `${node.age_seconds.toFixed(1)}s`}</p>
                        {node.failure_reason ? (
                          <Tag type="red" renderIcon={WarningAlt}>{node.failure_reason}</Tag>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="aap-snapshots__section">
                <h4>Activation history</h4>
                {activationEventsQuery.isLoading ? (
                  <InlineLoading description="Loading activation history" status="active" />
                ) : activationEventsQuery.data?.events.length ? (
                  <div className="aap-snapshots__deployment-history">
                    {activationEventsQuery.data.events.map((event) => (
                      <div key={event.request_id}>
                        <strong>{event.snapshot_name ?? 'Snapshot'}</strong> · {event.outcome} · {formatDate(event.confirmed_live_at ?? event.requested_at)}
                        {event.failure_reason ? ` · ${event.failure_reason}` : ''}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="aap-snapshots__section-copy">No local activation events recorded yet. The backend retains the last 100 events per node.</p>
                )}
              </section>

              <section className="aap-snapshots__section">
                <h4>MIDI program</h4>
                <div className="aap-snapshots__program-row">
                  <NumberInput
                    id="snapshot-midi-program"
                    label="MIDI program"
                    min={0}
                    max={127}
                    step={1}
                    value={programValue}
                    onChange={(_event, { value }) => setProgramValue(String(value))}
                  />
                  <Button
                    size="sm"
                    kind="secondary"
                    renderIcon={Launch}
                    onClick={() => programMutation.mutate({
                      snapshotId: selectedSnapshot.id,
                      programNumber: programValue === '' ? null : Number(programValue),
                    })}
                  >
                    Save MIDI PC
                  </Button>
                </div>
              </section>

              <section className="aap-snapshots__section">
                <h4>Paths and assets</h4>
                <div className="aap-snapshots__path-list">
                  {selectedSnapshot.paths.map((path) => (
                    <div key={path.id} className="aap-snapshots__path-card">
                      <strong>{path.label} · {path.name}</strong>
                      <span>{path.plugins.length} plugins</span>
                      <span>Snapshot chain {path.snapshot_chain_id ?? 'Default'} · Runtime chain {path.runtime_chain_id ?? 'Default'}</span>
                    </div>
                  ))}
                  {selectedSnapshot.assets.map((asset, index) => (
                    <div key={`${asset.kind}-${index}`} className="aap-snapshots__path-card">
                      <strong>{asset.kind}</strong>
                      <span>{asset.asset_name ?? asset.plugin_uri ?? 'Unnamed asset'}</span>
                      <span>{asset.available ? 'Available' : 'Missing -> default on restore'}</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </Tile>
      </div>

      <Modal
        open={importModalOpen}
        modalHeading="Import snapshot"
        primaryButtonText={importMutation.isPending ? 'Importing…' : 'Import'}
        secondaryButtonText="Cancel"
        onRequestClose={() => setImportModalOpen(false)}
        onSecondarySubmit={() => {
          setImportBundleFile(null)
          setImportPayloadText('')
          setImportModalOpen(false)
        }}
        onRequestSubmit={() => importMutation.mutate()}
        primaryButtonDisabled={(!importPayloadText.trim() && !importBundleFile) || importMutation.isPending}
      >
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="snapshot-import-bundle" className="cds--label">Snapshot bundle</label>
          <input
            id="snapshot-import-bundle"
            type="file"
            accept=".map2snapshot,.zip,.json,.map2snapshot.json,application/vnd.map2.snapshot+zip,application/zip,application/json"
            onChange={(event) => setImportBundleFile(event.target.files?.[0] ?? null)}
          />
          {importBundleFile ? <p>{importBundleFile.name}</p> : null}
        </div>
        <TextArea
          id="snapshot-import-json"
          labelText="Snapshot JSON payload"
          helperText="Optional fallback for legacy JSON imports."
          placeholder='Paste a SnapshotExport or {"snapshot": ...} payload'
          value={importPayloadText}
          onChange={(event) => setImportPayloadText(event.target.value)}
        />
      </Modal>
    </>
  )
}
