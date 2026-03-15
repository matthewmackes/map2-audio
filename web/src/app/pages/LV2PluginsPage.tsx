import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { Layer } from '@carbon/react'
import { PageHeader } from '../components/PageHeader'
import { Package, DownloadSimple, Trash, ArrowsClockwise, CheckCircle, XCircle, SpinnerGap, CaretDown, CaretUp, EyeSlash, Eye, Faders, Lightning, WaveSine, Gauge, Warning, Check, Plug } from '@phosphor-icons/react'
import { pluginsApi } from '../../map2/api'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../map2/displayNames'
import { useCluster } from '../contexts/ClusterContext'
import { withNodeQuery } from '../utils/clusterTransport'
import { usePluginBrowser, type PluginInfo } from '../hooks/usePluginBrowser'
import './LV2PluginsPage.css'

interface PluginPack {
  id: string
  name: string
  description: string
  packages: string[]
  category: string
  size_estimate: string
  plugin_count: number
  status: 'installed' | 'not_installed' | 'installing' | 'uninstalling' | 'disabled' | 'disabling' | 'enabling' | 'error'
  error_message?: string | null
  can_install?: boolean  // Whether this pack can be installed via package manager
  can_uninstall?: boolean  // Whether this pack can be uninstalled via package manager
}

function formatNodeName(node: { hostname: string; role: string; isLocal: boolean }) {
  if (node.isLocal) return `${node.hostname} (Local)`
  return `${node.hostname} · ${node.role}`
}

export function LV2PluginsPage() {
  const { activeNodeId, nodes, localNodeId, isClusterMode, setActiveNode } = useCluster()
  const queryClient = useQueryClient()
  const [pluginPacks, setPluginPacks] = useState<PluginPack[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshingPlugins, setRefreshingPlugins] = useState(false)
  const [clusterView, setClusterView] = useState(activeNodeId === 'all')

  // Plugin management state (bulk select/delete)
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [managementSearchTerm, setManagementSearchTerm] = useState('')
  const [managementSortBy, setManagementSortBy] = useState<'name' | 'author' | 'format'>('name')
  const detailNodeId = activeNodeId === 'all' ? null : activeNodeId
  const selectedNode = nodes.find((node) => node.nodeId === activeNodeId)
  const remoteSelected = Boolean(activeNodeId && activeNodeId !== 'all' && activeNodeId !== localNodeId)
  const clusterViewActive = activeNodeId === 'all' || clusterView
  const pluginBrowser = usePluginBrowser({ nodeId: clusterViewActive ? 'all' : detailNodeId })
  const availabilityNodes = useMemo(
    () => (nodes.length ? nodes : [{ nodeId: localNodeId, hostname: 'local', role: 'LOCAL', isLocal: true, isOnline: true, latencyMs: 0, lastSeen: null }]),
    [localNodeId, nodes]
  )

  useEffect(() => {
    if (activeNodeId === 'all') {
      setClusterView(true)
    }
  }, [activeNodeId])

  useEffect(() => {
    setSelectedUris(new Set())
    setShowDeleteConfirm(false)
  }, [activeNodeId, clusterViewActive])

  // Refresh plugins with force refresh to pick up newly installed plugins
  const refreshPlugins = useCallback(async () => {
    setRefreshingPlugins(true)
    try {
      if (!clusterViewActive) {
        await pluginsApi.discover(true, detailNodeId)
      }
      await queryClient.invalidateQueries({ queryKey: ['plugins'] })
    } catch (err) {
      console.error('Failed to refresh plugins:', err)
    } finally {
      setRefreshingPlugins(false)
    }
  }, [clusterViewActive, detailNodeId, queryClient])

  // Filtered plugins for management table
  const managementPlugins = useMemo(() => {
    const list = pluginBrowser.allPlugins || []
    
    // Filter by search term
    const filtered = list.filter((p: PluginInfo) =>
      getDisplayPluginName(p.name, p.uri).toLowerCase().includes(managementSearchTerm.toLowerCase()) ||
      sanitizeRestrictedDisplayText(p.author || '').toLowerCase().includes(managementSearchTerm.toLowerCase()) ||
      p.uri.toLowerCase().includes(managementSearchTerm.toLowerCase())
    )

    // Sort
    filtered.sort((a: PluginInfo, b: PluginInfo) => {
      switch (managementSortBy) {
        case 'author':
          return sanitizeRestrictedDisplayText(a.author || '').localeCompare(sanitizeRestrictedDisplayText(b.author || ''))
            || getDisplayPluginName(a.name, a.uri).localeCompare(getDisplayPluginName(b.name, b.uri))
        case 'format':
          return (a.format || '').localeCompare(b.format || '')
            || getDisplayPluginName(a.name, a.uri).localeCompare(getDisplayPluginName(b.name, b.uri))
        case 'name':
        default:
          return getDisplayPluginName(a.name, a.uri).localeCompare(getDisplayPluginName(b.name, b.uri))
      }
    })

    return filtered
  }, [pluginBrowser.allPlugins, managementSearchTerm, managementSortBy])

  const clusterPlugins = useMemo(() => {
    if (!clusterViewActive) return []
    return managementPlugins
  }, [clusterViewActive, managementPlugins])
  const clusterNodeCount = availabilityNodes.length
  const fullyReplicatedCount = useMemo(
    () => clusterPlugins.filter((plugin) => (plugin.installedOn?.length ?? 0) >= clusterNodeCount).length,
    [clusterNodeCount, clusterPlugins]
  )
  const partiallyReplicatedCount = useMemo(
    () => clusterPlugins.filter((plugin) => {
      const installedCount = plugin.installedOn?.length ?? 0
      return installedCount > 0 && installedCount < clusterNodeCount
    }).length,
    [clusterNodeCount, clusterPlugins]
  )
  const missingInstallSlots = useMemo(
    () => clusterPlugins.reduce((total, plugin) => total + Math.max(clusterNodeCount - (plugin.installedOn?.length ?? 0), 0), 0),
    [clusterNodeCount, clusterPlugins]
  )

  // Delete mutation for plugin management
  const deleteMutation = useMutation({
    mutationFn: async (uris: string[]) => {
      const errors: string[] = []
      const successes: string[] = []
      
      for (const uri of uris) {
        try {
          const result = await pluginsApi.delete(uri, detailNodeId)
          successes.push(result.uri)
          console.log(`Deleted: ${uri}`, result)
        } catch (error: any) {
          const message = error?.message || `Failed to delete ${uri}`
          errors.push(message)
          console.error(`Error deleting ${uri}:`, error)
        }
      }
      
      if (errors.length > 0) {
        throw new Error(`${errors.length}/${uris.length} failed: ${errors.join(', ')}`)
      }
      
      return { successes, errors }
    },
    onSuccess: () => {
      setSelectedUris(new Set())
      setShowDeleteConfirm(false)
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
    },
  })

  // Selection handlers for plugin management
  const toggleSelectAll = useCallback(() => {
    if (selectedUris.size === managementPlugins.length) {
      setSelectedUris(new Set())
    } else {
      setSelectedUris(new Set(managementPlugins.map((p: PluginInfo) => p.uri)))
    }
  }, [managementPlugins, selectedUris.size])

  const toggleSelect = useCallback((uri: string) => {
    const newSelected = new Set(selectedUris)
    if (newSelected.has(uri)) {
      newSelected.delete(uri)
    } else {
      newSelected.add(uri)
    }
    setSelectedUris(newSelected)
  }, [selectedUris])

  const handleDeletePlugins = useCallback(() => {
    if (selectedUris.size === 0) return
    deleteMutation.mutate(Array.from(selectedUris))
  }, [selectedUris, deleteMutation])

  const handleFocusMissingNode = useCallback((plugin: PluginInfo, nodeId: string) => {
    const targetNode = availabilityNodes.find((node) => node.nodeId === nodeId)
    if (!targetNode) return

    const shouldSwitch = window.confirm(
      `${getDisplayPluginName(plugin.name, plugin.uri)} is not installed on ${formatNodeName(targetNode)}.\n\nSwitch to that node and open package management so you can install the required plugin pack?`
    )
    if (!shouldSwitch) return

    setClusterView(false)
    setActiveNode(nodeId)
  }, [availabilityNodes, setActiveNode])

  const loadPluginPacks = useCallback(async () => {
    if (clusterViewActive) {
      setPluginPacks([])
      setLoading(false)
      setError(null)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const response = await fetch(withNodeQuery('/api/plugin-packages/list', detailNodeId))
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`)
      }
      const data = await response.json()
      console.log('Plugin packs response:', data)
      if (!data.packs || data.packs.length === 0) {
        setError('No plugin packs returned from API')
      }
      setPluginPacks(data.packs || [])
    } catch (err) {
      console.error('Failed to load plugin packs:', err)
      setError(err instanceof Error ? err.message : 'Failed to load plugin packs')
    } finally {
      setLoading(false)
    }
  }, [clusterViewActive, detailNodeId])

  useEffect(() => {
    loadPluginPacks()
  }, [loadPluginPacks])

  const handleInstall = async (packId: string) => {
    try {
      await fetch(withNodeQuery(`/api/plugin-packages/${packId}/install`, detailNodeId), { method: 'POST' })
      setPluginPacks(prev => prev.map(p =>
        p.id === packId ? { ...p, status: 'installing' as const } : p
      ))
      pollPackStatus(packId)
    } catch (err) {
      console.error('Failed to install:', err)
    }
  }

  const handleUninstall = async (packId: string) => {
    if (!confirm('Are you sure you want to uninstall this plugin pack?')) return
    try {
      await fetch(withNodeQuery(`/api/plugin-packages/${packId}/uninstall`, detailNodeId), { method: 'POST' })
      setPluginPacks(prev => prev.map(p =>
        p.id === packId ? { ...p, status: 'uninstalling' as const } : p
      ))
      pollPackStatus(packId)
    } catch (err) {
      console.error('Failed to uninstall:', err)
    }
  }

  const handleDisable = async (packId: string) => {
    if (!confirm('Are you sure you want to disable this plugin pack? The plugins will be moved to a disabled folder.')) return
    try {
      await fetch(withNodeQuery(`/api/plugin-packages/${packId}/disable`, detailNodeId), { method: 'POST' })
      setPluginPacks(prev => prev.map(p =>
        p.id === packId ? { ...p, status: 'disabling' as const } : p
      ))
      pollPackStatus(packId)
    } catch (err) {
      console.error('Failed to disable:', err)
    }
  }

  const handleEnable = async (packId: string) => {
    try {
      await fetch(withNodeQuery(`/api/plugin-packages/${packId}/enable`, detailNodeId), { method: 'POST' })
      setPluginPacks(prev => prev.map(p =>
        p.id === packId ? { ...p, status: 'enabling' as const } : p
      ))
      pollPackStatus(packId)
    } catch (err) {
      console.error('Failed to enable:', err)
    }
  }

  const pollPackStatus = (packId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(withNodeQuery(`/api/plugin-packages/${packId}/status`, detailNodeId))
        const data = await response.json()
        setPluginPacks(prev => prev.map(p =>
          p.id === packId ? { ...p, status: data.status, error_message: data.error_message } : p
        ))
        // Stop polling when no longer in a transitional state
        const transitionalStates = ['installing', 'uninstalling', 'disabling', 'enabling']
        if (!transitionalStates.includes(data.status)) {
          clearInterval(interval)
        }
      } catch {
        clearInterval(interval)
      }
    }, 2000)
    setTimeout(() => clearInterval(interval), 300000)
  }

  const installedCount = pluginPacks.filter(p => p.status === 'installed').length
  const disabledCount = pluginPacks.filter(p => p.status === 'disabled').length
  const totalPlugins = pluginPacks.reduce((acc, p) => acc + (p.status === 'installed' ? p.plugin_count : 0), 0)

  const packCategories = [...new Set(pluginPacks.map(p => p.category))].sort()

  return (
    <section className="lv2-plugins-page">
      <Layer className="lv2-plugins-page__surface">
    <div className="stack">
      <PageHeader
        title="LV2 Plugin Pack Manager"
        subtitle={
          clusterViewActive
            ? 'Unified plugin catalog with per-node availability across the cluster'
            : remoteSelected
              ? `Install and manage curated LV2 plugin collections on ${selectedNode?.hostname ?? detailNodeId}`
              : 'Install and manage curated LV2 plugin collections from system packages'
        }
        icon={<Plug size={32} style={{ color: '#3b82f6' }} />}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {isClusterMode && (
              <button
                className={clusterViewActive ? 'btn btn-primary' : 'btn btn-ghost'}
                onClick={() => {
                  if (activeNodeId === 'all') return
                  setClusterView((prev) => !prev)
                }}
                disabled={activeNodeId === 'all'}
                title={activeNodeId === 'all' ? 'All Nodes view already uses the unified cluster catalog' : 'Toggle unified cluster catalog'}
              >
                {clusterViewActive ? 'Cluster View On' : 'Cluster View'}
              </button>
            )}
            <button
              className="btn btn-ghost"
              onClick={clusterViewActive ? refreshPlugins : loadPluginPacks}
              disabled={clusterViewActive ? pluginBrowser.isLoading : loading}
            >
              {(clusterViewActive ? pluginBrowser.isLoading : loading) ? <SpinnerGap weight="bold" size={16} className="animate-spin" /> : <ArrowsClockwise weight="duotone" size={16} />}
              Refresh
            </button>
          </div>
        }
      />

      {isClusterMode && (
        <div
          className="card"
          style={{
            background: clusterViewActive
              ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(30, 41, 59, 0.92))'
              : remoteSelected
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(30, 41, 59, 0.92))'
                : 'linear-gradient(135deg, rgba(71, 85, 105, 0.18), rgba(15, 23, 42, 0.92))',
            borderColor: clusterViewActive
              ? 'rgba(96, 165, 250, 0.35)'
              : remoteSelected
                ? 'rgba(52, 211, 153, 0.35)'
                : 'rgba(148, 163, 184, 0.25)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2, color: '#94a3b8', marginBottom: 8 }}>
                Cluster Target
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>
                {activeNodeId === 'all'
                  ? `All Nodes · ${clusterNodeCount} nodes`
                  : clusterViewActive
                    ? `Cluster catalog from ${selectedNode ? formatNodeName(selectedNode) : formatNodeName(availabilityNodes[0])}`
                    : selectedNode
                      ? formatNodeName(selectedNode)
                      : formatNodeName(availabilityNodes[0])}
              </div>
              <p style={{ margin: '8px 0 0', color: '#cbd5e1', fontSize: 14, maxWidth: 760, lineHeight: 1.6 }}>
                {clusterViewActive
                  ? 'This view is read-only. Empty node dots mark missing plugin installs. Click one to switch into that node and open package management for remediation.'
                  : remoteSelected
                    ? 'Package installs, uninstall actions, and scans now run remotely through the cluster proxy for the selected node.'
                    : 'Use Cluster View to compare plugin availability across every node before deploying content or presets.'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignContent: 'flex-start' }}>
              {availabilityNodes.map((node) => (
                <button
                  key={node.nodeId}
                  type="button"
                  className={activeNodeId === node.nodeId ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                  onClick={() => {
                    setClusterView(false)
                    setActiveNode(node.nodeId === localNodeId ? null : node.nodeId)
                  }}
                  style={{
                    borderColor: node.isOnline ? undefined : 'rgba(239, 68, 68, 0.35)',
                    opacity: node.isOnline ? 1 : 0.7,
                  }}
                >
                  {node.hostname}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Native Plugins Warning */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(234, 88, 12, 0.05))',
        borderColor: 'rgba(245, 158, 11, 0.4)',
        borderLeft: '6px solid #f59e0b',
        padding: 32
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
          <Warning weight="duotone" size={36} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 4 }} />
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 22, fontWeight: 700, color: '#fbbf24', marginBottom: 12 }}>
              Native Realtime Processors Available
            </h3>
            {/* Quote */}
            <div style={{
              fontStyle: 'italic',
              color: '#9ca3af',
              fontSize: 16,
              paddingLeft: 20,
              paddingTop: 8,
              paddingBottom: 8,
              marginBottom: 20,
              borderLeft: '3px solid rgba(245, 158, 11, 0.4)'
            }}>
              <span style={{ color: '#d1d5db' }}>"Beware the man with one gun. He can probably use it."</span>
              <span style={{ color: '#6b7280', marginLeft: 12 }}>— Jeff Cooper</span>
            </div>
            <p style={{ fontSize: 16, color: '#d1d5db', lineHeight: 1.7, marginBottom: 24 }}>
              This system fully supports LV2 plugins. However, for <strong style={{ color: '#fbbf24' }}>maximum realtime performance</strong> and
              <strong style={{ color: '#fbbf24' }}> lowest latency</strong>, the following best-in-class processors have been compiled directly
              into the audio engine as native JUCE DSP modules:
            </p>

            {/* Native Processors Chart */}
            <div style={{
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: 12,
              overflow: 'hidden',
              marginBottom: 24
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                <thead>
                  <tr style={{ background: 'rgba(245, 158, 11, 0.15)' }}>
                    <th style={{ padding: '16px 20px', textAlign: 'left', color: '#fbbf24', fontWeight: 700, fontSize: 16, borderBottom: '1px solid rgba(245, 158, 11, 0.2)' }}>Category</th>
                    <th style={{ padding: '16px 20px', textAlign: 'left', color: '#fbbf24', fontWeight: 700, fontSize: 16, borderBottom: '1px solid rgba(245, 158, 11, 0.2)' }}>Native Processor</th>
                    <th style={{ padding: '16px 20px', textAlign: 'left', color: '#fbbf24', fontWeight: 700, fontSize: 16, borderBottom: '1px solid rgba(245, 158, 11, 0.2)' }}>Features</th>
                    <th style={{ padding: '16px 20px', textAlign: 'right', color: '#fbbf24', fontWeight: 700, fontSize: 16, borderBottom: '1px solid rgba(245, 158, 11, 0.2)' }}>Project / Build</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '16px 20px', color: '#22c55e' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 500 }}>
                        <Gauge size={20} weight="duotone" /> Dynamics
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: '#e5e7eb', fontWeight: 600, fontSize: 15 }}>DynamicsProcessor</td>
                    <td style={{ padding: '16px 20px', color: '#9ca3af', fontSize: 14 }}>Compressor, Limiter, Noise Gate with RT metering</td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 600 }}>MAP2</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>FEB 2026</div>
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '16px 20px', color: '#4ecdc4' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 500 }}>
                        <Faders size={20} weight="duotone" /> EQ
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: '#e5e7eb', fontWeight: 600, fontSize: 15 }}>FilterProcessor</td>
                    <td style={{ padding: '16px 20px', color: '#9ca3af', fontSize: 14 }}>8-band Parametric EQ with multiple filter types</td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 600 }}>MAP2</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>FEB 2026</div>
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '16px 20px', color: '#ff6b6b' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 500 }}>
                        <Lightning size={20} weight="duotone" /> Amp Modeling
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: '#e5e7eb', fontWeight: 600, fontSize: 15 }}>NAMProcessor</td>
                    <td style={{ padding: '16px 20px', color: '#9ca3af', fontSize: 14 }}>Neural Amp Modeler with ML inference</td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 600 }}>MAP2</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>FEB 2026</div>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '16px 20px', color: '#a855f7' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 500 }}>
                        <WaveSine size={20} weight="duotone" /> Cabinet / Reverb
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', color: '#e5e7eb', fontWeight: 600, fontSize: 15 }}>ConvolutionProcessor</td>
                    <td style={{ padding: '16px 20px', color: '#9ca3af', fontSize: 14 }}>Zero-latency IR convolution for cabs & spaces</td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 600 }}>MAP2</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>FEB 2026</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="card" style={{
          background: 'rgba(239, 68, 68, 0.1)',
          borderColor: 'rgba(239, 68, 68, 0.4)',
          padding: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <XCircle size={20} weight="duotone" style={{ color: '#ef4444' }} />
            <div>
              <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>Error Loading Plugin Packs</div>
              <div style={{ fontSize: 12, color: '#f87171' }}>{error}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>
                Check that the backend API is running at /api/plugin-packages/list
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, rgba(14, 22, 37, 0.95), rgba(20, 30, 50, 0.9))',
        borderColor: 'rgba(37, 99, 235, 0.3)'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 20 }}>
          {clusterViewActive ? (
            <>
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#60a5fa' }}>{clusterPlugins.length}</div>
                <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Catalog Entries</div>
              </div>
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#4ade80' }}>{fullyReplicatedCount}</div>
                <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>On Every Node</div>
              </div>
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#f59e0b' }}>{partiallyReplicatedCount}</div>
                <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Partial Coverage</div>
              </div>
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#a78bfa' }}>{clusterNodeCount}</div>
                <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Nodes</div>
              </div>
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#ef4444' }}>{missingInstallSlots}</div>
                <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Missing Installs</div>
              </div>
            </>
          ) : (
            <>
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#60a5fa' }}>{installedCount}</div>
                <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Installed</div>
              </div>
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#6b7280' }}>{disabledCount}</div>
                <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Disabled</div>
              </div>
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#a78bfa' }}>{pluginPacks.length}</div>
                <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Total</div>
              </div>
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#4ade80' }}>{totalPlugins}</div>
                <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Plugins Active</div>
              </div>
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#f59e0b' }}>{packCategories.length}</div>
                <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Categories</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Plugin Management */}
      <div className="card">
        <div className="section-heading">
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Plugin Management</h2>
            <p className="subtitle">
              {clusterViewActive
                ? `${managementPlugins.length} plugins across ${clusterNodeCount} nodes`
                : `${managementPlugins.length} plugins installed`}
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div
          className="lv2-management-toolbar"
          style={{
          background: 'rgba(30, 41, 59, 0.8)', 
          borderRadius: 8, 
          border: '1px solid rgba(71, 85, 105, 0.5)', 
          padding: 16, 
          marginBottom: 16 
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Search and Sort */}
            <div className="lv2-management-toolbar-row lv2-management-toolbar-row--search" style={{ display: 'flex', gap: 16 }}>
              <input
                type="text"
                placeholder="Search plugins..."
                value={managementSearchTerm}
                onChange={(e) => setManagementSearchTerm(e.target.value)}
                className="input"
                style={{ flex: 1 }}
              />
              <select
                value={managementSortBy}
                onChange={(e) => setManagementSortBy(e.target.value as 'name' | 'author' | 'format')}
                className="input"
              >
                <option value="name">Sort by Name</option>
                <option value="author">Sort by Author</option>
                <option value="format">Sort by Format</option>
              </select>
            </div>

            {/* Actions */}
            <div className="lv2-management-toolbar-row lv2-management-toolbar-row--actions" style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="lv2-management-toolbar-actions-left" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {clusterViewActive ? (
                  <span style={{ color: '#94a3b8', fontSize: 13 }}>
                    Unified catalog is read-only. Select a specific node to scan, install packs, or delete plugins.
                  </span>
                ) : (
                  <>
                    <button
                      onClick={toggleSelectAll}
                      className="btn btn-ghost btn-sm lv2-management-action-btn"
                    >
                      {selectedUris.size === managementPlugins.length && managementPlugins.length > 0
                        ? 'Deselect All'
                        : 'Select All'}
                    </button>
                    <span style={{ color: '#94a3b8', fontSize: 13 }}>
                      {selectedUris.size} of {managementPlugins.length} selected
                    </span>
                  </>
                )}
              </div>

              <div className="lv2-management-toolbar-actions-right" style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={refreshPlugins}
                  disabled={pluginBrowser.isLoading || refreshingPlugins}
                  className="btn btn-ghost btn-sm lv2-management-action-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {refreshingPlugins ? (
                    <>
                      <SpinnerGap weight="bold" size={14} className="animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <ArrowsClockwise weight="duotone" size={14} />
                      Refresh
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={clusterViewActive || selectedUris.size === 0 || deleteMutation.isPending}
                  className="btn btn-sm lv2-management-action-btn"
                  style={{ 
                    background: !clusterViewActive && selectedUris.size > 0 ? 'rgba(220, 38, 38, 0.8)' : 'rgba(71, 85, 105, 0.5)',
                    color: !clusterViewActive && selectedUris.size > 0 ? '#fff' : '#64748b',
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 6 
                  }}
                >
                  {deleteMutation.isPending ? (
                    <>
                      <SpinnerGap weight="bold" size={14} className="animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash weight="duotone" size={14} />
                      Delete Selected
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50
          }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.98), rgba(15, 23, 42, 0.98))',
              border: '1px solid rgba(71, 85, 105, 0.5)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 400
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, color: '#ef4444' }}>
                <Warning size={24} weight="duotone" />
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f3f4f6' }}>Delete Plugins</h2>
              </div>
              <p style={{ color: '#94a3b8', marginBottom: 24 }}>
                This will permanently delete {selectedUris.size} plugin{selectedUris.size === 1 ? '' : 's'} from your system.
                This action cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="btn btn-ghost"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeletePlugins}
                  disabled={deleteMutation.isPending}
                  className="btn"
                  style={{ 
                    flex: 1, 
                    background: 'rgba(220, 38, 38, 0.8)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                >
                  {deleteMutation.isPending ? (
                    <>
                      <SpinnerGap weight="bold" size={16} className="animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash weight="duotone" size={16} />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Status Messages */}
        {deleteMutation.isError && (
          <div style={{
            marginBottom: 16,
            padding: 16,
            background: 'rgba(127, 29, 29, 0.5)',
            border: '1px solid rgba(185, 28, 28, 0.5)',
            borderRadius: 8,
            color: '#fecaca'
          }}>
            <p style={{ fontWeight: 600 }}>Error deleting plugins</p>
            <p style={{ fontSize: 13 }}>{(deleteMutation.error as any)?.message || 'Unknown error'}</p>
          </div>
        )}

        {deleteMutation.isSuccess && (
          <div style={{
            marginBottom: 16,
            padding: 16,
            background: 'rgba(20, 83, 45, 0.5)',
            border: '1px solid rgba(34, 197, 94, 0.5)',
            borderRadius: 8,
            color: '#bbf7d0',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <Check weight="bold" size={20} />
            <p style={{ fontWeight: 600 }}>Plugins deleted successfully</p>
          </div>
        )}

        {/* Plugin Table */}
        <div style={{
          background: 'rgba(30, 41, 59, 0.5)',
          borderRadius: 8,
          border: '1px solid rgba(71, 85, 105, 0.3)',
          overflow: 'hidden'
        }}>
          {pluginBrowser.isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
              <SpinnerGap weight="bold" className="animate-spin" size={32} style={{ color: '#3b82f6' }} />
            </div>
          ) : pluginBrowser.isError ? (
            <div style={{ padding: 32, color: '#f87171', textAlign: 'center' }}>
              Failed to load plugins{pluginBrowser.error instanceof Error ? `: ${pluginBrowser.error.message}` : ''}
            </div>
          ) : managementPlugins.length === 0 ? (
            <div style={{ padding: 32, color: '#94a3b8', textAlign: 'center' }}>
              No plugins found
            </div>
          ) : (
            <div className="lv2-management-table-wrap" style={{ overflowX: 'auto', maxHeight: 500 }}>
              <table className="lv2-management-table" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead style={{ background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid rgba(71, 85, 105, 0.5)', position: 'sticky', top: 0 }}>
                  <tr>
                    {!clusterViewActive && (
                      <th style={{ padding: '12px 16px', textAlign: 'left', width: 32 }}>
                        <input
                          type="checkbox"
                          checked={selectedUris.size === managementPlugins.length && managementPlugins.length > 0}
                          onChange={toggleSelectAll}
                          style={{ width: 16, height: 16, borderRadius: 4, cursor: 'pointer' }}
                        />
                      </th>
                    )}
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#94a3b8' }}>Name</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#94a3b8' }}>Category</th>
                    {clusterViewActive ? (
                      <>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#94a3b8' }}>Version</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#94a3b8' }}>Installed On</th>
                      </>
                    ) : (
                      <>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#94a3b8' }}>Author</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#94a3b8' }}>Format</th>
                      </>
                    )}
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#94a3b8' }}>URI</th>
                  </tr>
                </thead>
                <tbody>
                  {managementPlugins.map((plugin: PluginInfo, idx: number) => {
                    const installedNodes = new Set(
                      clusterViewActive
                        ? (plugin.installedOn ?? [])
                        : [detailNodeId ?? localNodeId]
                    )

                    return (
                    <tr
                      key={plugin.uri}
                      className="lv2-management-row"
                      style={{
                        borderBottom: '1px solid rgba(71, 85, 105, 0.3)',
                        background: selectedUris.has(plugin.uri) 
                          ? 'rgba(30, 58, 138, 0.3)' 
                          : idx % 2 === 0 
                            ? 'rgba(30, 41, 59, 0.5)' 
                            : 'transparent',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        if (!selectedUris.has(plugin.uri)) {
                          e.currentTarget.style.background = 'rgba(51, 65, 85, 0.5)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!selectedUris.has(plugin.uri)) {
                          e.currentTarget.style.background = idx % 2 === 0 ? 'rgba(30, 41, 59, 0.5)' : 'transparent'
                        }
                      }}
                    >
                      {!clusterViewActive && (
                        <td data-label="Select" style={{ padding: '12px 16px' }}>
                          <input
                            type="checkbox"
                            checked={selectedUris.has(plugin.uri)}
                            onChange={() => toggleSelect(plugin.uri)}
                            style={{ width: 16, height: 16, borderRadius: 4, cursor: 'pointer' }}
                          />
                        </td>
                      )}
                      <td data-label="Name" style={{ padding: '12px 16px', fontWeight: 500, color: '#fff' }}>{getDisplayPluginName(plugin.name, plugin.uri)}</td>
                      <td data-label="Category" style={{ padding: '12px 16px', color: '#94a3b8' }}>{plugin.category || '-'}</td>
                      {clusterViewActive ? (
                        <>
                          <td data-label="Version" style={{ padding: '12px 16px', color: '#cbd5e1' }}>{plugin.version || 'unknown'}</td>
                          <td data-label="Installed On" style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                              {availabilityNodes.map((node) => {
                                const installed = installedNodes.has(node.nodeId)
                                return (
                                  <button
                                    key={`${plugin.uri}-${node.nodeId}`}
                                    type="button"
                                    onClick={() => {
                                      if (!installed) {
                                        handleFocusMissingNode(plugin, node.nodeId)
                                      }
                                    }}
                                    title={installed ? `${getDisplayPluginName(plugin.name, plugin.uri)} is installed on ${formatNodeName(node)}` : `Missing on ${formatNodeName(node)}. Click to switch there and install.`}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      background: 'transparent',
                                      border: 'none',
                                      padding: 0,
                                      cursor: installed ? 'default' : 'pointer',
                                      color: installed ? '#86efac' : '#fca5a5',
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: 12,
                                        height: 12,
                                        borderRadius: 9999,
                                        border: `2px solid ${installed ? '#22c55e' : '#ef4444'}`,
                                        background: installed ? '#22c55e' : 'transparent',
                                        boxShadow: installed ? '0 0 0 4px rgba(34, 197, 94, 0.14)' : 'none',
                                      }}
                                    />
                                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{node.hostname}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td data-label="Author" style={{ padding: '12px 16px', color: '#94a3b8' }}>{sanitizeRestrictedDisplayText(plugin.author || '') || '-'}</td>
                          <td data-label="Format" style={{ padding: '12px 16px' }}>
                            <span style={{
                              padding: '2px 8px',
                              background: 'rgba(30, 58, 138, 0.5)',
                              color: '#93c5fd',
                              borderRadius: 4,
                              fontSize: 11
                            }}>
                              {plugin.format || 'LV2'}
                            </span>
                          </td>
                        </>
                      )}
                      <td data-label="URI" style={{ padding: '12px 16px', color: '#64748b', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={plugin.uri}>
                        {plugin.uri}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Quick Status Row */}
      {!clusterViewActive && (
      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Package weight="duotone" size={16} style={{ color: '#60a5fa' }} />
          <span style={{ fontSize: 12, color: '#6b7280' }}>Quick Status:</span>
          {pluginPacks.map(pack => {
            const isTransitional = ['installing', 'uninstalling', 'disabling', 'enabling'].includes(pack.status)
            const isDisabled = pack.status === 'disabled'
            return (
              <span
                key={pack.id}
                onClick={() => setExpanded(true)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: pack.status === 'installed'
                    ? 'rgba(74, 222, 128, 0.2)'
                    : isDisabled
                      ? 'rgba(107, 114, 128, 0.2)'
                      : isTransitional
                        ? 'rgba(245, 158, 11, 0.2)'
                        : 'rgba(255, 255, 255, 0.05)',
                  color: pack.status === 'installed'
                    ? '#4ade80'
                    : isDisabled
                      ? '#6b7280'
                      : isTransitional
                        ? '#f59e0b'
                        : '#6b7280',
                  border: `1px solid ${pack.status === 'installed' ? 'rgba(74, 222, 128, 0.3)' : isDisabled ? 'rgba(107, 114, 128, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                  textDecoration: isDisabled ? 'line-through' : 'none',
                  opacity: isDisabled ? 0.7 : 1
                }}
              >
                {isTransitional ? (
                  <SpinnerGap weight="bold" size={10} className="animate-spin" style={{ marginRight: 4, display: 'inline' }} />
                ) : pack.status === 'installed' ? (
                  <CheckCircle weight="duotone" size={10} style={{ marginRight: 4, display: 'inline' }} />
                ) : isDisabled ? (
                  <EyeSlash weight="duotone" size={10} style={{ marginRight: 4, display: 'inline' }} />
                ) : null}
                {pack.name}
              </span>
            )
          })}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setExpanded(!expanded)}
            style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {expanded ? <CaretUp weight="bold" size={14} /> : <CaretDown weight="bold" size={14} />}
            {expanded ? 'Collapse Packs' : 'Expand Packs'}
          </button>
        </div>
      </div>
      )}

      {/* Plugin Packs Grid */}
      {!clusterViewActive && expanded && (
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#f3f4f6', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Package weight="duotone" size={16} />
            Available Plugin Packs
          </h3>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
              <SpinnerGap size={24} className="animate-spin" weight="bold" style={{ color: '#60a5fa' }} />
              <span style={{ marginLeft: 12, color: '#6b7280' }}>Loading plugin packs...</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {pluginPacks.map(pack => {
                const isDisabled = pack.status === 'disabled'
                const isTransitional = ['installing', 'uninstalling', 'disabling', 'enabling'].includes(pack.status)
                return (
                  <div
                    key={pack.id}
                    style={{
                      padding: 16,
                      background: pack.status === 'installed'
                        ? 'linear-gradient(135deg, rgba(74, 222, 128, 0.1), rgba(0,0,0,0.2))'
                        : isDisabled
                          ? 'linear-gradient(135deg, rgba(107, 114, 128, 0.1), rgba(0,0,0,0.3))'
                          : 'linear-gradient(135deg, rgba(55, 214, 201, 0.05), rgba(0,0,0,0.2))',
                      border: `1px solid ${pack.status === 'installed' ? 'rgba(74, 222, 128, 0.3)' : isDisabled ? 'rgba(107, 114, 128, 0.3)' : 'rgba(55, 214, 201, 0.2)'}`,
                      borderLeft: `4px solid ${pack.status === 'installed' ? '#4ade80' : isDisabled ? '#6b7280' : '#60a5fa'}`,
                      borderRadius: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      opacity: isTransitional ? 0.7 : isDisabled ? 0.6 : 1,
                      transition: 'all 0.3s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h4 style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: isDisabled ? '#6b7280' : '#f3f4f6',
                          margin: 0,
                          textDecoration: isDisabled ? 'line-through' : 'none'
                        }}>
                          {pack.name}
                        </h4>
                        <span style={{
                          fontSize: 10,
                          color: '#6b7280',
                          textTransform: 'uppercase',
                          letterSpacing: 1
                        }}>
                          {pack.category}
                        </span>
                      </div>
                      {pack.status === 'installed' && (
                        <CheckCircle weight="duotone" size={18} style={{ color: '#4ade80' }} />
                      )}
                      {pack.status === 'disabled' && (
                        <span title="Disabled">
                          <EyeSlash weight="duotone" size={18} style={{ color: '#6b7280' }} />
                        </span>
                      )}
                      {pack.status === 'error' && (
                        <span title={pack.error_message || 'Error'}>
                          <XCircle size={18} style={{ color: '#ef4444' }} />
                        </span>
                      )}
                      {isTransitional && (
                        <SpinnerGap weight="bold" size={18} className="animate-spin" style={{ color: '#f59e0b' }} />
                      )}
                    </div>

                  <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
                    {pack.description}
                  </p>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '3px 8px',
                      background: 'rgba(167, 139, 250, 0.2)',
                      border: '1px solid rgba(167, 139, 250, 0.3)',
                      borderRadius: 4,
                      fontSize: 10,
                      color: '#a78bfa'
                    }}>
                      {pack.plugin_count} plugins
                    </span>
                    <span style={{
                      padding: '3px 8px',
                      background: 'rgba(37, 99, 235, 0.1)',
                      border: '1px solid rgba(37, 99, 235, 0.2)',
                      borderRadius: 4,
                      fontSize: 10,
                      color: '#60a5fa'
                    }}>
                      {pack.size_estimate}
                    </span>
                  </div>

                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {pack.status === 'installing' ? (
                        <button className="btn btn-ghost" disabled style={{ width: '100%' }}>
                          <SpinnerGap weight="bold" size={14} className="animate-spin" /> Installing...
                        </button>
                      ) : pack.status === 'uninstalling' ? (
                        <button className="btn btn-ghost" disabled style={{ width: '100%' }}>
                          <SpinnerGap weight="bold" size={14} className="animate-spin" /> Uninstalling...
                        </button>
                      ) : pack.status === 'disabling' ? (
                        <button className="btn btn-ghost" disabled style={{ width: '100%' }}>
                          <SpinnerGap weight="bold" size={14} className="animate-spin" /> Disabling...
                        </button>
                      ) : pack.status === 'enabling' ? (
                        <button className="btn btn-ghost" disabled style={{ width: '100%' }}>
                          <SpinnerGap weight="bold" size={14} className="animate-spin" /> Enabling...
                        </button>
                      ) : pack.status === 'disabled' ? (
                        <button
                          className="btn btn-primary"
                          onClick={() => handleEnable(pack.id)}
                          style={{ width: '100%' }}
                        >
                          <Eye weight="duotone" size={14} /> Enable
                        </button>
                      ) : pack.status === 'installed' ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn btn-ghost"
                            onClick={() => handleDisable(pack.id)}
                            style={{
                              flex: 1,
                              color: '#6b7280',
                              borderColor: 'rgba(107, 114, 128, 0.3)'
                            }}
                            title="Temporarily disable without uninstalling"
                          >
                            <EyeSlash weight="duotone" size={14} /> Disable
                          </button>
                          {pack.can_uninstall !== false && (
                            <button
                              className="btn btn-ghost"
                              onClick={() => handleUninstall(pack.id)}
                              style={{
                                flex: 1,
                                color: '#ef4444',
                                borderColor: 'rgba(239, 68, 68, 0.3)'
                              }}
                            >
                              <Trash weight="duotone" size={14} /> Uninstall
                            </button>
                          )}
                        </div>
                      ) : pack.can_install !== false ? (
                        <button
                          className="btn btn-primary"
                          onClick={() => handleInstall(pack.id)}
                          style={{ width: '100%' }}
                        >
                          <DownloadSimple weight="duotone" size={14} /> Install
                        </button>
                      ) : (
                        <div style={{
                          padding: '8px 12px',
                          background: 'rgba(107, 114, 128, 0.1)',
                          border: '1px solid rgba(107, 114, 128, 0.2)',
                          borderRadius: 6,
                          fontSize: 11,
                          color: '#6b7280',
                          textAlign: 'center'
                        }}>
                          Not available via package manager
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Info Section */}
      <div className="card" style={{ background: 'rgba(37, 99, 235, 0.05)', borderColor: 'rgba(37, 99, 235, 0.2)' }}>
        <h4 style={{ fontSize: 13, fontWeight: 600, color: '#60a5fa', marginBottom: 8 }}>
          About LV2 Plugin Packs
        </h4>
        <p style={{ fontSize: 12, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>
          LV2 (LADSPA Version 2) plugins are audio processing modules that can be loaded into the signal chain.
          {clusterViewActive
            ? ' Cluster View merges inventory from every node so you can see where a processor is present before you deploy presets or content across the fleet.'
            : ' These curated packs are installed via apt package manager and provide high-quality effects, instruments, and utilities. Installation requires sudo privileges and an internet connection.'}
        </p>
      </div>
    </div>
      </Layer>
    </section>
  )
}
