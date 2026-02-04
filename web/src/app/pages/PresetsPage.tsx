/**
 * PresetsPage - Complete Preset Management
 *
 * Features:
 * - Local preset library (chain presets)
 * - Plugin presets management
 * - Community preset browser
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
  BookmarkPlus,
  Loader2,
  Star,
  Settings,
  Upload,
  Download,
  Globe,
  FolderOpen,
  Trash2,
  RefreshCw,
  FileUp,
  Users,
  Package,
  Play,
  Check,
} from 'lucide-react'
import type { Preset, FlowSnapshot } from '../../map2/types'
import { presetsApi, pluginPresetsApi, flowSnapshotsApi } from '../../map2/api'
import { PageHeader } from '../components/PageHeader'
import { useToasts } from '../components/Toasts'
import { PresetImportDialog } from '../components/presets/PresetImportDialog'
import { CommunityPresetBrowser } from '../components/presets/CommunityPresetBrowser'

type PresetsResponse = { presets: Preset[] }
type FlowSnapshotsResponse = { snapshots: FlowSnapshot[]; count: number; active_id: number | null }
type TabType = 'local' | 'plugin' | 'community'

export function PresetsPage() {
  const queryClient = useQueryClient()
  const combobox = useComboboxStore()
  const searchValue = combobox.getState().value
  const { pushToast } = useToasts()

  // State
  const [activeTab, setActiveTab] = useState<TabType>('local')
  const [showImportDialog, setShowImportDialog] = useState(false)

  // Queries - Flow Snapshots (Chain Presets)
  const snapshotsQuery = useQuery<FlowSnapshotsResponse>({
    queryKey: ['flow-snapshots'],
    queryFn: () => flowSnapshotsApi.list(),
  })

  const pluginPresetsQuery = useQuery({
    queryKey: ['plugin-presets'],
    queryFn: () => pluginPresetsApi.list({}),
    enabled: activeTab === 'plugin',
  })

  const snapshots = snapshotsQuery.data?.snapshots ?? []
  const activeSnapshotId = snapshotsQuery.data?.active_id ?? null
  const pluginPresets = pluginPresetsQuery.data?.presets ?? []

  // Filter snapshots by search value
  const filteredSnapshots = searchValue
    ? snapshots.filter((s) => s.name.toLowerCase().includes(searchValue.toLowerCase()))
    : snapshots
  const names = snapshots.map((s: FlowSnapshot) => s.name)

  // Mutations - Flow Snapshots
  const deleteSnapshotMutation = useMutation({
    mutationFn: (snapshotId: number) => flowSnapshotsApi.delete(snapshotId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      pushToast('Snapshot deleted', 'success')
    },
    onError: () => pushToast('Failed to delete snapshot', 'error'),
  })

  const toggleFavoriteMutation = useMutation({
    mutationFn: ({ id, currentValue }: { id: number; currentValue: boolean }) =>
      flowSnapshotsApi.update(id, { is_favorite: !currentValue }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      pushToast('Favorite updated', 'success')
    },
    onError: () => pushToast('Failed to update favorite', 'error'),
  })

  const loadSnapshotMutation = useMutation({
    mutationFn: (snapshotId: number) => flowSnapshotsApi.load(snapshotId),
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
  const handleImportSuccess = (presetId: number, name: string) => {
    queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
    queryClient.invalidateQueries({ queryKey: ['plugin-presets'] })
    pushToast(`Imported "${name}" successfully`, 'success')
  }

  return (
    <div className="stack">
      <PageHeader
        title="Presets"
        subtitle="Manage local presets, browse community, and import/export cross-platform formats."
        icon={<Settings size={32} style={{ color: '#3b82f6' }} />}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowImportDialog(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Upload size={16} />
              Import
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleExportAll}
              disabled={snapshots.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Download size={16} />
              Export All
            </button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="card" style={{ padding: 0 }}>
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border, #333)',
          }}
        >
          <TabButton
            active={activeTab === 'local'}
            onClick={() => setActiveTab('local')}
            icon={<FolderOpen size={16} />}
            label="Chain Presets"
            count={snapshots.length}
          />
          <TabButton
            active={activeTab === 'plugin'}
            onClick={() => setActiveTab('plugin')}
            icon={<Package size={16} />}
            label="Plugin Presets"
            count={pluginPresets.length}
          />
          <TabButton
            active={activeTab === 'community'}
            onClick={() => setActiveTab('community')}
            icon={<Globe size={16} />}
            label="Community"
          />
        </div>

        {/* Local Chain Presets Tab - Now showing Flow Snapshots */}
        {activeTab === 'local' && (
          <div style={{ padding: '16px' }}>
            <div className="section-heading">
              <div>
                <h3>Chain Preset Library</h3>
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
                      placeholder="Search presets"
                    />
                    <ComboboxPopover store={combobox} className="menu" gutter={6}>
                      {names.length === 0 ? (
                        <div className="menu-item" aria-disabled>
                          {snapshotsQuery.isLoading ? 'Loading presets…' : 'No presets yet'}
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
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>

            {snapshotsQuery.isLoading ? (
              <div className="flex" style={{ padding: '12px 4px' }}>
                <Loader2 className="spin" size={18} /> Loading presets...
              </div>
            ) : snapshotsQuery.error ? (
              <div className="pill warn">Failed to load presets</div>
            ) : snapshots.length === 0 ? (
              <div className="empty-state">
                <FolderOpen size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <p>No chain presets yet.</p>
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
                          if (confirm(`Delete preset "${snapshot.name}"?`)) {
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

        {/* Plugin Presets Tab */}
        {activeTab === 'plugin' && (
          <div style={{ padding: '16px' }}>
            <div className="section-heading">
              <div>
                <h3>Plugin Preset Library</h3>
                <p className="subtitle">
                  Individual plugin parameter presets. Reusable across chains.
                </p>
              </div>
              <button
                className="btn btn-icon"
                onClick={() => pluginPresetsQuery.refetch()}
                title="Refresh"
              >
                <RefreshCw size={16} />
              </button>
            </div>

            {pluginPresetsQuery.isLoading ? (
              <div className="flex" style={{ padding: '12px 4px' }}>
                <Loader2 className="spin" size={18} /> Loading plugin presets...
              </div>
            ) : pluginPresetsQuery.error ? (
              <div className="pill warn">Failed to load plugin presets</div>
            ) : pluginPresets.length === 0 ? (
              <div className="empty-state">
                <Package size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <p>No plugin presets yet.</p>
                <p className="subtitle">
                  Save presets from plugin parameter editors or import from file.
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
                      <th>Default</th>
                      <th>Favorite</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pluginPresets.map((preset: any) => (
                      <tr key={preset.id}>
                        <td>{preset.name}</td>
                        <td className="muted">{preset.plugin_name}</td>
                        <td>{preset.category}</td>
                        <td>{preset.usage_count}x</td>
                        <td>
                          {preset.is_default && (
                            <span className="pill success">Default</span>
                          )}
                        </td>
                        <td>
                          {preset.is_favorite ? (
                            <Star size={16} fill="#fbbf24" stroke="#fbbf24" />
                          ) : (
                            <Star size={16} style={{ opacity: 0.3 }} />
                          )}
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
          <CommunityPresetBrowser
            onPresetDownloaded={(params) => {
              pushToast('Preset downloaded and ready to apply', 'success')
            }}
            onUploadClick={() => {
              // Could open an upload dialog here
              pushToast('Upload feature coming soon', 'info')
            }}
          />
        )}
      </div>

      {/* Import Dialog */}
      <PresetImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImportSuccess={handleImportSuccess}
      />
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
        borderBottom: active ? '2px solid var(--accent, #7c3aed)' : '2px solid transparent',
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
            background: active ? 'var(--accent, #7c3aed)' : 'var(--bg-tertiary, #2a2a3e)',
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

// Snapshot Row Component (Flow Snapshot as Chain Preset)
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
            title="Load preset"
            style={{ padding: '4px' }}
            disabled={isLoading || isActive}
          >
            {isLoading ? (
              <Loader2 size={14} className="spin" />
            ) : isActive ? (
              <Check size={14} style={{ color: 'var(--success, #22c55e)' }} />
            ) : (
              <Play size={14} />
            )}
          </button>
          <button
            onClick={onDelete}
            className="btn btn-icon btn-danger"
            title="Delete preset"
            style={{ padding: '4px' }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}
