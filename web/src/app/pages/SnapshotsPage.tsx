/**
 * SnapshotsPage - Complete Snapshot Management
 *
 * Features:
 * - Local snapshot library (chain snapshots)
 * - Plugin snapshot management
 * - Community snapshot browser
 * - Universal import/export (FXP, VST3, LV2, JUCE, MAP2UPF)
 */

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Combobox,
  ComboboxItem,
  ComboboxPopover,
  ComboboxProvider,
  useComboboxStore,
} from '@ariakit/react'
import {
  SpinnerGap,
  Star,
  GearSix,
  UploadSimple,
  DownloadSimple,
  Globe,
  FolderOpen,
  Trash,
  ArrowsClockwise,
  Package,
  Play,
  Check,
} from '@phosphor-icons/react'
import type { FlowSnapshot } from '../../map2/types'
import { pluginPresetsApi as pluginSnapshotsApi, flowSnapshotsApi } from '../../map2/api'
import { sanitizeRestrictedDisplayText } from '../../map2/displayNames'
import { PageHeader } from '../components/PageHeader'
import { useToasts } from '../components/Toasts'
import { SnapshotImportDialog } from '../components/snapshots/SnapshotImportDialog'
import { CommunitySnapshotBrowser } from '../components/snapshots/CommunitySnapshotBrowser'
import { SnapshotDeployModal } from '../components/snapshots/SnapshotDeployModal'
import { useCluster } from '../contexts/ClusterContext'

type FlowSnapshotsResponse = { snapshots: FlowSnapshot[]; count: number; active_id: number | null }
type TabType = 'local' | 'plugin' | 'community'
type SnapshotAvailability = {
  preset_id: number
  checksum: string
  source_node_id?: string
  available_on: string[]
  missing_on: string[]
}
type ClusterSnapshotCatalogRow = {
  checksum: string
  name: string
  plugin_name: string
  plugin_uri: string
  available_on: string[]
  origin_nodes: string[]
}

export function SnapshotsPage() {
  const queryClient = useQueryClient()
  const combobox = useComboboxStore()
  const searchValue = combobox.getState().value
  const { pushToast } = useToasts()
  const { nodes: clusterNodes, activeNodeId, localNodeId, isClusterMode } = useCluster()

  // State
  const [activeTab, setActiveTab] = useState<TabType>('local')
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [uploadForm, setUploadForm] = useState({ name: '', description: '', category: 'User', tags: '' })
  const [uploading, setUploading] = useState(false)
  const [clusterSnapshotView, setClusterSnapshotView] = useState(activeNodeId === 'all')
  const [deploySnapshot, setDeploySnapshot] = useState<any | null>(null)
  const apiNodeId = activeNodeId && activeNodeId !== 'all' && activeNodeId !== localNodeId ? activeNodeId : null
  const sourceNodeId = activeNodeId && activeNodeId !== 'all' ? activeNodeId : localNodeId
  const selectedNode = clusterNodes.find((node) => node.nodeId === sourceNodeId)
  const sourceNodeLabel = selectedNode?.isLocal ? `${selectedNode.hostname} (Local)` : selectedNode?.hostname ?? 'Local'
  const clusterSnapshotViewActive = activeTab === 'plugin' && (activeNodeId === 'all' || clusterSnapshotView)

  useEffect(() => {
    if (activeNodeId === 'all') {
      setClusterSnapshotView(true)
    }
  }, [activeNodeId])

  // Queries - Flow Snapshots (Chain Snapshots)
  const snapshotsQuery = useQuery<FlowSnapshotsResponse>({
    queryKey: ['flow-snapshots', sourceNodeId],
    queryFn: () => flowSnapshotsApi.list(apiNodeId),
  })

  const pluginSnapshotsQuery = useQuery({
    queryKey: ['plugin-snapshots', sourceNodeId],
    queryFn: () => pluginSnapshotsApi.list({}, apiNodeId),
    enabled: activeTab === 'plugin' && !clusterSnapshotViewActive,
  })

  const snapshots = snapshotsQuery.data?.snapshots ?? []
  const activeSnapshotId = snapshotsQuery.data?.active_id ?? null
  const pluginSnapshots = pluginSnapshotsQuery.data?.presets ?? []
  const clusterNodeCount = clusterNodes.length

  const clusterSnapshotCatalogQuery = useQuery<ClusterSnapshotCatalogRow[]>({
    queryKey: ['plugin-snapshots', 'cluster-catalog'],
    queryFn: async () => {
      const response = await fetch('/api/preset-exchange/cluster/library?content_type=preset&node_id=all')
      if (!response.ok) {
        throw new Error('Failed to load cluster snapshot catalog')
      }
      const payload = await response.json() as {
        nodes?: Record<string, { body?: { items?: Array<{ checksum: string; name: string; plugin_name: string; plugin_uri: string }> } }>
      }
      const byChecksum = new Map<string, ClusterSnapshotCatalogRow>()
      Object.entries(payload.nodes ?? {}).forEach(([nodeId, nodePayload]) => {
        for (const item of nodePayload.body?.items ?? []) {
          const existing = byChecksum.get(item.checksum)
          if (existing) {
            if (!existing.available_on.includes(nodeId)) existing.available_on.push(nodeId)
            if (!existing.origin_nodes.includes(nodeId)) existing.origin_nodes.push(nodeId)
            continue
          }
          byChecksum.set(item.checksum, {
            checksum: item.checksum,
            name: item.name,
            plugin_name: item.plugin_name,
            plugin_uri: item.plugin_uri,
            available_on: [nodeId],
            origin_nodes: [nodeId],
          })
        }
      })
      return Array.from(byChecksum.values()).sort((a, b) => a.name.localeCompare(b.name))
    },
    enabled: clusterSnapshotViewActive,
    staleTime: 10000,
  })

  const snapshotAvailabilityQuery = useQuery<Record<number, SnapshotAvailability>>({
    queryKey: ['plugin-snapshots', 'availability', sourceNodeId, pluginSnapshots.map((snapshot: any) => snapshot.id)],
    queryFn: async () => {
      const entries = await Promise.all(
        pluginSnapshots.map(async (snapshot: any) => {
          const response = await fetch(`/api/preset-exchange/availability?preset_id=${snapshot.id}&source_node_id=${encodeURIComponent(sourceNodeId)}`)
          if (!response.ok) {
            throw new Error(`Failed to load availability for snapshot ${snapshot.id}`)
          }
          const payload = (await response.json()) as SnapshotAvailability
          return [snapshot.id, payload] as const
        })
      )
      return Object.fromEntries(entries)
    },
    enabled: activeTab === 'plugin' && !clusterSnapshotViewActive && pluginSnapshots.length > 0,
    staleTime: 10000,
  })

  // Filter snapshots by search value
  const filteredSnapshots = searchValue
    ? snapshots.filter((s) => s.name.toLowerCase().includes(searchValue.toLowerCase()))
    : snapshots
  const names = snapshots.map((s: FlowSnapshot) => s.name)

  // Mutations - Flow Snapshots
  const deleteSnapshotMutation = useMutation({
    mutationFn: (snapshotId: number) => flowSnapshotsApi.delete(snapshotId, apiNodeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      pushToast('Snapshot deleted', 'success')
    },
    onError: () => pushToast('Failed to delete snapshot', 'error'),
  })

  const toggleFavoriteMutation = useMutation({
    mutationFn: ({ id, currentValue }: { id: number; currentValue: boolean }) =>
      flowSnapshotsApi.update(id, { is_favorite: !currentValue }, apiNodeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      pushToast('Favorite updated', 'success')
    },
    onError: () => pushToast('Failed to update favorite', 'error'),
  })

  const loadSnapshotMutation = useMutation({
    mutationFn: (snapshotId: number) => flowSnapshotsApi.load(snapshotId, apiNodeId),
    onSuccess: (_, snapshotId) => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      const snapshot = snapshots.find((s) => s.id === snapshotId)
      pushToast(`Loaded "${snapshot?.name || 'snapshot'}"`, 'success')
    },
    onError: () => pushToast('Failed to load snapshot', 'error'),
  })

  useEffect(() => {
    if (snapshotsQuery.isError) pushToast('Failed to load snapshots', 'error')
  }, [snapshotsQuery.isError, pushToast])

  // Export all snapshots
  const handleExportAll = async () => {
    try {
      const allSnapshots = snapshotsQuery.data?.snapshots ?? []
      const exportData = {
        format_version: '1.0.0',
        format_type: 'map2_snapshots',
        exported_at: new Date().toISOString(),
        snapshots: allSnapshots,
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `map2-snapshots-${Date.now()}.map2bank`
      a.click()
      URL.revokeObjectURL(url)
      pushToast('Snapshots exported successfully', 'success')
    } catch (error) {
      pushToast('Export failed', 'error')
    }
  }

  // Import success handler
  const handleImportSuccess = (_snapshotId: number, name: string) => {
    queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
    queryClient.invalidateQueries({ queryKey: ['plugin-snapshots'] })
    pushToast(`Imported "${name}" successfully`, 'success')
  }

  // Community snapshot upload handler
  const handleCommunityUpload = async () => {
    if (!uploadForm.name.trim()) {
      pushToast('Snapshot name is required', 'error')
      return
    }
    setUploading(true)
    try {
      const response = await fetch('/api/preset-exchange/community/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: uploadForm.name.trim(),
          plugin_uri: 'map2://flow-snapshot',
          plugin_name: 'Flow Snapshot',
          parameters: {},
          description: uploadForm.description.trim(),
          category: uploadForm.category || 'User',
          tags: uploadForm.tags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.detail || response.statusText)
      }
      pushToast(`"${uploadForm.name}" uploaded to community library`, 'success')
      setShowUploadDialog(false)
      setUploadForm({ name: '', description: '', category: 'User', tags: '' })
    } catch (err) {
      pushToast(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="stack snapshots-page">
      <PageHeader
        title="Snapshots"
        subtitle={
          activeNodeId === 'all'
            ? 'Compare cluster-wide snapshot coverage, then switch to a source node to deploy missing content.'
            : `Manage snapshots for ${sourceNodeLabel}, browse community, and import/export cross-platform formats.`
        }
        icon={<GearSix size={32} weight="duotone" style={{ color: '#2563eb' }} />}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowImportDialog(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <UploadSimple size={16} weight="duotone" />
              Import
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleExportAll}
              disabled={snapshots.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <DownloadSimple size={16} weight="duotone" />
              Export All
            </button>
          </div>
        }
      />

      {isClusterMode && (
        <div
          className="card"
          style={{
            background: activeNodeId === 'all'
              ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(15, 23, 42, 0.94))'
              : apiNodeId
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(15, 23, 42, 0.94))'
                : 'linear-gradient(135deg, rgba(71, 85, 105, 0.18), rgba(15, 23, 42, 0.94))',
            borderColor: activeNodeId === 'all' ? 'rgba(96, 165, 250, 0.28)' : 'rgba(52, 211, 153, 0.22)',
          }}
        >
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.1, color: '#94a3b8', marginBottom: 8 }}>
            Snapshot Scope
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
            {activeNodeId === 'all' ? 'All Nodes cluster comparison' : sourceNodeLabel}
          </div>
          <p style={{ margin: 0, color: '#cbd5e1', fontSize: 14, lineHeight: 1.6 }}>
            {activeNodeId === 'all'
              ? 'Cluster Snapshots mode merges the union of all plugin snapshots and shows which nodes already have each checksum. Switch to a specific node to deploy missing snapshots from that source.'
              : apiNodeId
                ? 'Snapshot actions run on the selected remote node through the cluster proxy. Availability and deploy commands use that node as the source.'
                : 'Snapshot availability is still measured across the cluster, so you can push missing snapshots from the local node without leaving the page.'}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="card" style={{ padding: 0 }}>
        <div
          className="snapshots-tab-strip"
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border, #333)',
          }}
        >
          <TabButton
            active={activeTab === 'local'}
            onClick={() => setActiveTab('local')}
            icon={<FolderOpen size={16} weight="duotone" />}
            label="Chain Snapshots"
            count={snapshots.length}
          />
          <TabButton
            active={activeTab === 'plugin'}
            onClick={() => setActiveTab('plugin')}
            icon={<Package size={16} weight="duotone" />}
            label="Plugin Snapshots"
            count={pluginSnapshots.length}
          />
          <TabButton
            active={activeTab === 'community'}
            onClick={() => setActiveTab('community')}
            icon={<Globe size={16} weight="duotone" />}
            label="Community"
          />
        </div>

        {/* Local Chain Snapshots Tab - backed by Flow Snapshots */}
        {activeTab === 'local' && (
          <div style={{ padding: '16px' }}>
            <div className="section-heading">
              <div>
                <h3>Chain Snapshot Library</h3>
                <p className="subtitle">
                  Complete signal chain configurations (Flow Snapshots). Type to filter or pick from the popover.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <ComboboxProvider store={combobox}>
                  <div style={{ minWidth: 260 }}>
                    <Combobox
                      store={combobox}
                      className="combobox"
                      placeholder="Search snapshots"
                    />
                    <ComboboxPopover store={combobox} className="menu" gutter={6}>
                      {names.length === 0 ? (
                        <div className="menu-item" aria-disabled>
                          {snapshotsQuery.isLoading ? 'Loading snapshots…' : 'No snapshots yet'}
                        </div>
                      ) : (
                        names.map((name) => (
                          <ComboboxItem key={name} value={name} className="menu-item" />
                        ))
                      )}
                    </ComboboxPopover>
                  </div>
                </ComboboxProvider>
                <button
                  className="btn btn-icon"
                  onClick={() => snapshotsQuery.refetch()}
                  title="Refresh"
                >
                  <ArrowsClockwise size={16} weight="duotone" />
                </button>
              </div>
            </div>

            {snapshotsQuery.isLoading ? (
              <div className="flex" style={{ padding: '12px 4px' }}>
                <SpinnerGap className="spin" size={18} weight="duotone" /> Loading snapshots...
              </div>
            ) : snapshotsQuery.error ? (
              <div className="pill warn">Failed to load snapshots</div>
            ) : snapshots.length === 0 ? (
              <div className="empty-state">
                <FolderOpen size={48} weight="duotone" style={{ opacity: 0.3, marginBottom: '12px' }} />
                <p>No chain snapshots yet.</p>
                <p className="subtitle">Save one from the Grid editor (press S) or import from file.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Flows</th>
                      <th>PC#</th>
                      <th>Favorite</th>
                      <th>Active</th>
                      <th>Updated</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSnapshots.map((snapshot) => (
                      <SnapshotRow
                        key={snapshot.id}
                        snapshot={snapshot}
                        isActive={snapshot.id === activeSnapshotId}
                        onLoad={() => loadSnapshotMutation.mutate(snapshot.id)}
                        onToggleFavorite={() => toggleFavoriteMutation.mutate({ id: snapshot.id, currentValue: snapshot.is_favorite })}
                        onDelete={() => {
                          if (confirm(`Delete snapshot "${snapshot.name}"?`)) {
                            deleteSnapshotMutation.mutate(snapshot.id)
                          }
                        }}
                        isLoading={loadSnapshotMutation.isPending}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Plugin Snapshots Tab */}
        {activeTab === 'plugin' && (
          <div style={{ padding: '16px' }}>
            <div className="section-heading">
              <div>
                <h3>Plugin Snapshot Library</h3>
                <p className="subtitle">
                  {clusterSnapshotViewActive
                    ? 'Unified snapshot catalog across the cluster with per-node coverage.'
                    : 'Individual plugin parameter snapshots. Reusable across chains.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {isClusterMode && (
                  <button
                    className={clusterSnapshotViewActive ? 'btn btn-primary' : 'btn btn-secondary'}
                    onClick={() => {
                      if (activeNodeId === 'all') return
                      setClusterSnapshotView((previous) => !previous)
                    }}
                    disabled={activeNodeId === 'all'}
                  >
                    {clusterSnapshotViewActive ? 'Cluster View On' : 'Cluster Snapshots'}
                  </button>
                )}
                <button
                  className="btn btn-icon"
                  onClick={() => {
                    if (clusterSnapshotViewActive) {
                      clusterSnapshotCatalogQuery.refetch()
                    } else {
                      pluginSnapshotsQuery.refetch()
                    }
                  }}
                  title="Refresh"
                >
                  <ArrowsClockwise size={16} weight="duotone" />
                </button>
              </div>
            </div>

            {clusterSnapshotViewActive ? (
              clusterSnapshotCatalogQuery.isLoading ? (
                <div className="flex" style={{ padding: '12px 4px' }}>
                  <SpinnerGap className="spin" size={18} weight="duotone" /> Loading cluster snapshot catalog...
                </div>
              ) : clusterSnapshotCatalogQuery.error ? (
                <div className="pill warn">Failed to load cluster snapshot catalog</div>
              ) : !clusterSnapshotCatalogQuery.data?.length ? (
                <div className="empty-state">
                  <Package size={48} weight="duotone" style={{ opacity: 0.3, marginBottom: '12px' }} />
                  <p>No plugin snapshots found across the cluster.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Plugin</th>
                        <th>Origin Node</th>
                        <th>Cluster Coverage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clusterSnapshotCatalogQuery.data.map((snapshot) => (
                        <tr key={snapshot.checksum}>
                          <td>{snapshot.name}</td>
                          <td className="muted">{sanitizeRestrictedDisplayText(snapshot.plugin_name) || 'Processor'}</td>
                          <td>{snapshot.origin_nodes.join(', ')}</td>
                          <td>
                            <span
                              className={snapshot.available_on.length === clusterNodeCount ? 'pill success' : 'pill warn'}
                              title={`Available on: ${snapshot.available_on.join(', ')}`}
                            >
                              {snapshot.available_on.length}/{clusterNodeCount || snapshot.available_on.length} nodes
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : pluginSnapshotsQuery.isLoading ? (
              <div className="flex" style={{ padding: '12px 4px' }}>
                <SpinnerGap className="spin" size={18} weight="duotone" /> Loading plugin snapshots...
              </div>
            ) : pluginSnapshotsQuery.error ? (
              <div className="pill warn">Failed to load plugin snapshots</div>
            ) : pluginSnapshots.length === 0 ? (
              <div className="empty-state">
                <Package size={48} weight="duotone" style={{ opacity: 0.3, marginBottom: '12px' }} />
                <p>No plugin snapshots yet.</p>
                <p className="subtitle">
                  Save snapshots from plugin parameter editors or import from file.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Plugin</th>
                      <th>Category</th>
                      <th>Usage</th>
                      <th>Cluster</th>
                      <th>Default</th>
                      <th>Favorite</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pluginSnapshots.map((snapshot: any) => (
                      <tr key={snapshot.id}>
                        <td>{snapshot.name}</td>
                        <td className="muted">{sanitizeRestrictedDisplayText(snapshot.plugin_name) || 'Processor'}</td>
                        <td>{snapshot.category}</td>
                        <td>{snapshot.usage_count}x</td>
                        <td>
                          {snapshotAvailabilityQuery.isLoading ? (
                            <span className="muted">Checking…</span>
                          ) : snapshotAvailabilityQuery.error ? (
                            <span className="pill warn">Unavailable</span>
                          ) : (() => {
                            const availability = snapshotAvailabilityQuery.data?.[snapshot.id]
                            if (!availability) return <span className="muted">Unknown</span>
                            if (availability.missing_on.length === 0) {
                              return <span className="pill success">In Sync {availability.available_on.length}/{clusterNodeCount || availability.available_on.length}</span>
                            }
                            return (
                              <span className="pill warn" title={`Missing on: ${availability.missing_on.join(', ')}`}>
                                {availability.available_on.length}/{clusterNodeCount || availability.available_on.length + availability.missing_on.length} nodes
                              </span>
                            )
                          })()}
                        </td>
                        <td>
                          {snapshot.is_default && (
                            <span className="pill success">Default</span>
                          )}
                        </td>
                        <td>
                          {snapshot.is_favorite ? (
                            <Star size={16} fill="#fbbf24" stroke="#fbbf24" />
                          ) : (
                            <Star size={16} style={{ opacity: 0.3 }} />
                          )}
                        </td>
                        <td>
                          {(() => {
                            const availability = snapshotAvailabilityQuery.data?.[snapshot.id]
                            return (
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 10px', fontSize: 12 }}
                                onClick={() => setDeploySnapshot(snapshot)}
                              >
                                {availability?.missing_on.length ? 'Deploy…' : 'Review…'}
                              </button>
                            )
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Community Tab */}
        {activeTab === 'community' && (
          <CommunitySnapshotBrowser
            onSnapshotDownloaded={() => {
              pushToast('Snapshot downloaded and ready to apply', 'success')
            }}
            onUploadClick={() => {
              setShowUploadDialog(true)
            }}
          />
        )}
      </div>

      {/* Import Dialog */}
      <SnapshotImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImportSuccess={handleImportSuccess}
      />

      <SnapshotDeployModal
        open={Boolean(deploySnapshot)}
        snapshot={deploySnapshot}
        availability={deploySnapshot ? snapshotAvailabilityQuery.data?.[deploySnapshot.id] ?? null : null}
        sourceNodeId={sourceNodeId}
        onClose={() => setDeploySnapshot(null)}
      />

      {/* Community Upload Dialog */}
      {showUploadDialog && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowUploadDialog(false) }}
        >
          <div style={{
            background: '#111111', border: '1px solid #1e293b', borderRadius: 12,
            padding: 24, width: 420, maxWidth: '90vw',
          }}>
            <h3 style={{ margin: '0 0 16px', color: '#f3f4f6' }}>Upload to Community Library</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Snapshot Name *</label>
                <input
                  value={uploadForm.name}
                  onChange={(e) => setUploadForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Warm Crunch"
                  style={{ width: '100%', padding: 8, background: '#0a0a0a', border: '1px solid #1e293b', borderRadius: 6, color: '#f3f4f6' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Description</label>
                <textarea
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Describe your snapshot..."
                  rows={3}
                  style={{ width: '100%', padding: 8, background: '#0a0a0a', border: '1px solid #1e293b', borderRadius: 6, color: '#f3f4f6', resize: 'vertical' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Category</label>
                <select
                  value={uploadForm.category}
                  onChange={(e) => setUploadForm(f => ({ ...f, category: e.target.value }))}
                  style={{ width: '100%', padding: 8, background: '#0a0a0a', border: '1px solid #1e293b', borderRadius: 6, color: '#f3f4f6' }}
                >
                  <option value="User">User</option>
                  <option value="Guitar">Guitar</option>
                  <option value="Bass">Bass</option>
                  <option value="Vocal">Vocal</option>
                  <option value="Synth">Synth</option>
                  <option value="Drums">Drums</option>
                  <option value="Ambient">Ambient</option>
                  <option value="Production">Production</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Tags (comma separated)</label>
                <input
                  value={uploadForm.tags}
                  onChange={(e) => setUploadForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="e.g., warm, crunch, blues"
                  style={{ width: '100%', padding: 8, background: '#0a0a0a', border: '1px solid #1e293b', borderRadius: 6, color: '#f3f4f6' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button
                onClick={() => setShowUploadDialog(false)}
                style={{ padding: '8px 16px', background: '#1a1a1a', border: 'none', borderRadius: 6, color: '#9ca3af', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCommunityUpload}
                disabled={uploading || !uploadForm.name.trim()}
                style={{
                  padding: '8px 20px', background: uploading ? '#222222' : '#2563eb',
                  border: 'none', borderRadius: 6, color: '#f3f4f6', cursor: uploading ? 'not-allowed' : 'pointer',
                  fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {uploading ? <SpinnerGap size={14} className="animate-spin" weight="duotone" /> : <UploadSimple size={14} weight="duotone" />}
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Tab Button Component
function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '12px 20px',
        background: active ? 'var(--bg-secondary, #1e1e2e)' : 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid var(--accent, #2563eb)' : '2px solid transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        color: active ? 'var(--text-primary, #fff)' : 'var(--text-secondary, #888)',
        fontWeight: active ? 600 : 400,
        transition: 'all 0.2s ease',
      }}
    >
      {icon}
      {label}
      {count !== undefined && (
        <span
          style={{
            background: active ? 'var(--accent, #2563eb)' : 'var(--bg-tertiary, #1a1a1a)',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '0.75rem',
          }}
        >
          {count}
        </span>
      )}
    </button>
  )
}

// Snapshot Row Component (Flow Snapshot as Chain Snapshot)
function SnapshotRow({
  snapshot,
  isActive,
  onLoad,
  onToggleFavorite,
  onDelete,
  isLoading,
}: {
  snapshot: FlowSnapshot
  isActive: boolean
  onLoad: () => void
  onToggleFavorite: () => void
  onDelete: () => void
  isLoading: boolean
}) {
  return (
    <tr style={{ background: isActive ? 'var(--bg-tertiary, #2a2a3e)' : undefined }}>
      <td>
        <span style={{ fontWeight: isActive ? 600 : 400 }}>{snapshot.name}</span>
        {snapshot.description && (
          <span className="muted" style={{ display: 'block', fontSize: '0.8rem' }}>
            {snapshot.description}
          </span>
        )}
      </td>
      <td>
        {/* Flow indicator dots */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {snapshot.flow_slots && snapshot.flow_slots.length > 0 ? (
            snapshot.flow_slots.map((slot) => (
              <span
                key={slot.id}
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: slot.color,
                  boxShadow: `0 0 4px ${slot.color}`,
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                }}
                title={`${slot.label}${slot.chainId ? ` (Chain ${slot.chainId})` : ''}`}
              />
            ))
          ) : (
            <span className="muted">—</span>
          )}
        </div>
      </td>
      <td className="muted">
        {snapshot.program_number !== null ? `PC ${snapshot.program_number}` : '—'}
      </td>
      <td>
        <button
          onClick={onToggleFavorite}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
          }}
          title={snapshot.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          {snapshot.is_favorite ? (
            <Star size={16} fill="#fbbf24" stroke="#fbbf24" />
          ) : (
            <Star size={16} style={{ opacity: 0.3 }} />
          )}
        </button>
      </td>
      <td>
        {isActive && (
          <span
            className="pill success"
            style={{ fontSize: '0.7rem', padding: '2px 6px' }}
          >
            Active
          </span>
        )}
      </td>
      <td className="muted" style={{ fontSize: '0.85rem' }}>
        {new Date(snapshot.updated_at).toLocaleDateString()}
      </td>
      <td>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={onLoad}
            className="btn btn-icon"
            title="Load snapshot"
            style={{ padding: '4px' }}
            disabled={isLoading || isActive}
          >
            {isLoading ? (
              <SpinnerGap size={14} className="spin" weight="duotone" />
            ) : isActive ? (
              <Check size={14} weight="duotone" style={{ color: 'var(--success, #22c55e)' }} />
            ) : (
              <Play size={14} weight="duotone" />
            )}
          </button>
          <button
            onClick={onDelete}
            className="btn btn-icon btn-danger"
            title="Delete snapshot"
            style={{ padding: '4px' }}
          >
            <Trash size={14} weight="duotone" />
          </button>
        </div>
      </td>
    </tr>
  )
}
