/**
 * DSPPage - Digital Signal Processing Controls
 *
 * Dedicated page for built-in DSP processors:
 * - Standalone Controls: Compressor, Limiter, Noise Gate, Parametric EQ
 * - Native JUCE Plugin Catalog: all built-in processors available in the Grid editor
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Renew, Waveform } from '@carbon/icons-react'
import { Button, ClickableTile, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, Tag, Tile } from '@carbon/react'
import { useNavigate } from 'react-router-dom'
import { CompressorCard, LimiterCard, GateCard } from '../components/Dynamics'
import { EQCard } from '../components/EQ'
import { MapAudioGridIcon } from '../components/icons/map'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { useCluster } from '../contexts/useCluster'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { useViewedNodeStore } from '../stores/viewedNodeStore'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'

type ActiveSection = 'dynamics' | 'eq' | 'catalog' | 'all'

type ClusterDSPStatus = {
  mode?: string
  utilization_percent?: number
  target_cpu_percent?: number
  active_plugins?: number
  registered_plugins?: number
  is_overloaded?: boolean
}

type ClusterDSPResponse = {
  nodes?: Record<string, ClusterDSPStatus>
}

// Native JUCE processors available in the Grid editor
const NATIVE_PLUGINS = [
  { uri: 'map2://juce/dynamics/compressor', name: 'Compressor', category: 'Dynamics', color: '#ff6644', standalone: true },
  { uri: 'map2://juce/dynamics/celestial', name: 'Celestial Compressor', category: 'Dynamics', color: '#c084fc', standalone: false },
  { uri: 'map2://juce/dynamics/limiter', name: 'Limiter', category: 'Dynamics', color: '#ff4488', standalone: true },
  { uri: 'map2://juce/dynamics/gate', name: 'Noise Gate', category: 'Dynamics', color: '#44aaff', standalone: true },
  { uri: 'map2://juce/eq/parametric', name: 'Parametric EQ', category: 'EQ', color: '#44ff88', standalone: true },
  { uri: 'map2://juce/delay', name: 'Stereo Delay', category: 'Delay', color: '#a78bfa' },
  { uri: 'map2://juce/modulation/chorus', name: 'Chorus', category: 'Modulation', color: '#06b6d4' },
  { uri: 'map2://juce/modulation/phaser', name: 'Phaser', category: 'Modulation', color: '#ec4899' },
  { uri: 'map2://juce/modulation/intellifx', name: 'AMDiFX', category: 'Modulation', color: '#14b8a6' },
  { uri: 'map2://juce/pitch/shifter', name: 'Vintage Harmonizer', category: 'Pitch', color: '#eab308' },
  { uri: 'map2://juce/pitch/interval', name: 'Interval Shifter', category: 'Pitch', color: '#f59e0b' },
  { uri: 'map2://juce/pitch/boss-xs1', name: 'Mutii WR-2 Shifter', category: 'Pitch', color: '#f97316' },
  { uri: 'map2://juce/pitch/h3000', name: 'Ultra Harmonizer', category: 'Pitch', color: '#8b5cf6' },
  { uri: 'map2://juce/reverb/pcm70', name: 'Lexi Love (PCM 70)', category: 'Reverb', color: '#22c55e' },
  { uri: 'map2://juce/convolution/cabinet', name: 'Cabinet IR', category: 'Convolution', color: '#78716c' },
  { uri: 'map2://juce/convolution/reverb', name: 'Reverb IR', category: 'Convolution', color: '#a3a3a3' },
  { uri: 'map2://juce/nam', name: 'Neural Amp Modeler', category: 'Amp Modeling', color: '#ef4444' },
  { uri: 'map2://juce/amp/peavey5150', name: 'Block Letter Amp', category: 'Amp Models', color: '#dc2626' },
  { uri: 'map2://juce/amp/tweedbassman', name: 'Tweed Bassman 5F6-A', category: 'Amp Models', color: '#d97706' },
  { uri: 'map2://juce/multieffect/shoegaze', name: 'ShoeGaze', category: 'Multi-FX', color: '#6366f1' },
  { uri: 'map2://juce/multieffect/passionfx', name: 'PassionFX', category: 'Multi-FX', color: '#e11d48' },
  { uri: 'map2://juce/effects/eventide-h9', name: 'Multi-Effect Rack', category: 'Multi-FX', color: '#0ea5e9' },
]

export function DSPPage() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('all')
  const navigate = useNavigate()
  const setViewedNode = useViewedNodeStore((state) => state.setViewedNode)
  const { localNode: pageLocalNode, viewedNode, viewedNodeId } = useNodePageContext(NODE_PAGE_KEYS.dsp)
  const { activeNodeId, nodes, localNodeId, setActiveNode } = useCluster()
  const allNodesSelected = activeNodeId === 'all'
  const selectedNode = (viewedNode?.node_id === viewedNodeId ? viewedNode : null)
    ?? nodes.find((node) => node.nodeId === viewedNodeId)
    ?? nodes.find((node) => node.nodeId === activeNodeId)
  const resolvedLocalNodeId = pageLocalNode?.node_id ?? localNodeId
  const remoteSelected = !allNodesSelected && Boolean(viewedNodeId && viewedNodeId !== resolvedLocalNodeId)
  const detailNodeId = remoteSelected ? viewedNodeId : null
  const selectedLatencyMs = selectedNode && 'latencyMs' in selectedNode ? selectedNode.latencyMs ?? null : null

  const clusterDspQuery = useQuery<ClusterDSPResponse>({
    queryKey: ['cluster', 'dsp', 'status'],
    queryFn: async () => {
      const response = await fetch('/api/cluster/health/extended/dsp')
      if (!response.ok) {
        throw new Error('Failed to load cluster DSP status')
      }
      return response.json() as Promise<ClusterDSPResponse>
    },
    enabled: allNodesSelected,
    staleTime: 5000,
  })

  const clusterRows = useMemo(() => {
    const dspByNode = clusterDspQuery.data?.nodes ?? {}
    return nodes.map((node) => {
      const status = dspByNode[node.nodeId] ?? null
      return {
        node,
        status,
        activePlugins: status?.active_plugins ?? 0,
        utilization: typeof status?.utilization_percent === 'number' ? status.utilization_percent : null,
      }
    })
  }, [clusterDspQuery.data?.nodes, nodes])

  const pluginsByCategory = useMemo(() => {
    return NATIVE_PLUGINS.reduce((acc, plugin) => {
      if (!acc[plugin.category]) acc[plugin.category] = []
      acc[plugin.category].push(plugin)
      return acc
    }, {} as Record<string, typeof NATIVE_PLUGINS>)
  }, [])

  const totalClusterPlugins = clusterRows.reduce((sum, row) => sum + row.activePlugins, 0)
  const overloadedNodes = clusterRows.filter((row) => row.status?.is_overloaded).length

  if (allNodesSelected) {
    return (
      <div className="dsp-page">
        <PageHeader
          title="DSP · All Nodes"
          subtitle="Cluster-wide DSP budget, load, and processor inventory comparison"
          icon={<Waveform size={32} style={{ color: 'var(--interactive)' }} />}
          actions={
            <Button
              kind="secondary"
              size="sm"
              onClick={() => clusterDspQuery.refetch()}
              renderIcon={Renew}
            >
              Refresh
            </Button>
          }
        />

        <div className="cluster-banner">
          All Nodes mode compares DSP headroom and active processors across the cluster. Select a single node to edit live compressor, gate, limiter, and EQ parameters.
        </div>

        <div className="grid two">
          <StatCard label="Nodes compared" value={clusterRows.length || '—'} helper="Cluster scope" />
          <StatCard label="Active processors" value={totalClusterPlugins} helper="Across all nodes" />
          <StatCard
            label="Overloaded nodes"
            value={overloadedNodes}
            helper={overloadedNodes > 0 ? 'Needs attention' : 'Healthy'}
            tone={overloadedNodes > 0 ? 'warn' : 'success'}
          />
        </div>

        <div className="dsp-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 16 }}>
            <h2 className="section-title" style={{ margin: 0 }}>Cluster DSP Status</h2>
            {clusterDspQuery.isLoading && <span className="muted">Loading cluster DSP telemetry…</span>}
          </div>

          {clusterDspQuery.isError ? (
            <div className="pill warn">Failed to load cluster DSP status</div>
          ) : (
            <TableContainer title="Cluster DSP status" style={{ overflowX: 'auto' }}>
              <Table size="sm" className="cluster-summary-table">
                <TableHead>
                  <TableRow>
                    <TableHeader>Node</TableHeader>
                    <TableHeader>Mode</TableHeader>
                    <TableHeader>Utilization</TableHeader>
                    <TableHeader>Target CPU</TableHeader>
                    <TableHeader>Active Plugins</TableHeader>
                    <TableHeader>Registered</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Action</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {clusterRows.map(({ node, status, utilization, activePlugins }) => (
                    <TableRow key={node.nodeId}>
                      <TableCell>
                        <div style={{ fontWeight: 700 }}>{node.isLocal ? `${node.hostname} (Local)` : node.hostname}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{node.nodeId}</div>
                      </TableCell>
                      <TableCell>{status?.mode ?? (node.isOnline ? 'Unknown' : 'Offline')}</TableCell>
                      <TableCell>{utilization == null ? '—' : `${utilization.toFixed(1)}%`}</TableCell>
                      <TableCell>{typeof status?.target_cpu_percent === 'number' ? `${status.target_cpu_percent.toFixed(0)}%` : '—'}</TableCell>
                      <TableCell>{activePlugins}</TableCell>
                      <TableCell>{status?.registered_plugins ?? '—'}</TableCell>
                      <TableCell>
                        <Tag type={status?.is_overloaded ? 'warm-gray' : node.isOnline ? 'green' : 'cool-gray'}>
                          {status?.is_overloaded ? 'Overloaded' : node.isOnline ? 'Online' : 'Offline'}
                        </Tag>
                      </TableCell>
                      <TableCell>
                        <Button
                          kind="secondary"
                          size="sm"
                          onClick={() => {
                            setActiveNode(null)
                            setViewedNode(NODE_PAGE_KEYS.dsp, node.nodeId)
                          }}
                        >
                          Inspect
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </div>

        <style>{styles}</style>
      </div>
    )
  }

  return (
    <div className="dsp-page">
      <PageHeader
        title={remoteSelected ? `DSP · ${selectedNode?.hostname ?? viewedNodeId}` : 'Native DSP Processors'}
        subtitle={
          remoteSelected
            ? `Live JUCE DSP controls proxied to ${selectedNode?.hostname ?? viewedNodeId}.`
            : `Built-in JUCE audio engine controls with ${NATIVE_PLUGINS.length} processors available.`
        }
        icon={<Waveform size={32} style={{ color: 'var(--interactive)' }} />}
        actions={
          <Button
            onClick={() => navigate('/juce-grid')}
            disabled={remoteSelected}
            kind={remoteSelected ? 'secondary' : 'primary'}
            size="sm"
            renderIcon={MapAudioGridIcon}
            title={remoteSelected ? 'Audio Grid is still local-only. Select the node locally to edit chains there.' : 'Open in Audio Grid'}
          >
            Open in Audio Grid
          </Button>
        }
      />

      {remoteSelected && (
        <div className="cluster-banner">
          Viewing remote node {selectedNode?.hostname ?? viewedNodeId}
          {selectedLatencyMs != null ? ` · peer latency ${selectedLatencyMs.toFixed(1)} ms` : ''}. Parameter changes on this page target that node through the cluster proxy.
        </div>
      )}

      <div className="section-tabs">
        <button
          className={`section-tab ${activeSection === 'all' ? 'active' : ''}`}
          onClick={() => setActiveSection('all')}
        >
          All
        </button>
        <button
          className={`section-tab ${activeSection === 'dynamics' ? 'active' : ''}`}
          onClick={() => setActiveSection('dynamics')}
        >
          Dynamics
        </button>
        <button
          className={`section-tab ${activeSection === 'eq' ? 'active' : ''}`}
          onClick={() => setActiveSection('eq')}
        >
          EQ
        </button>
        <button
          className={`section-tab ${activeSection === 'catalog' ? 'active' : ''}`}
          onClick={() => setActiveSection('catalog')}
        >
          Native Plugin Catalog
        </button>
      </div>

      <div className="dsp-content">
        {(activeSection === 'all' || activeSection === 'dynamics') && (
          <section className="dsp-section">
            <h2 className="section-title">Dynamics</h2>
            <div className="dynamics-grid">
              <CompressorCard accentColor="#ff6644" nodeId={detailNodeId} />
              <LimiterCard accentColor="#ff4488" nodeId={detailNodeId} />
              <GateCard accentColor="#44aaff" nodeId={detailNodeId} />
            </div>
          </section>
        )}

        {(activeSection === 'all' || activeSection === 'eq') && (
          <section className="dsp-section">
            <h2 className="section-title">Parametric EQ</h2>
            <div className="eq-container">
              <EQCard accentColor="#44ff88" nodeId={detailNodeId} />
            </div>
          </section>
        )}

        {(activeSection === 'all' || activeSection === 'catalog') && (
          <section className="dsp-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 className="section-title" style={{ margin: 0 }}>Native JUCE Plugin Catalog</h2>
              <span className="muted" style={{ fontSize: 13 }}>
                {remoteSelected ? 'Catalog is read-only while targeting a remote node.' : 'Click a processor to jump into the Grid editor.'}
              </span>
            </div>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 13, marginBottom: 20 }}>
              All {NATIVE_PLUGINS.length} built-in JUCE processors. DSP controls above target {remoteSelected ? selectedNode?.hostname ?? viewedNodeId : 'the local node'}.
            </p>
            {Object.entries(pluginsByCategory).map(([category, plugins]) => (
              <div key={category} style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                  {category} <span style={{ color: 'var(--text-tertiary)' }}>({plugins.length})</span>
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                  {plugins.map((plugin) => (
                    <ClickableTile
                      key={plugin.uri}
                      href={remoteSelected ? undefined : '/juce-grid'}
                      disabled={remoteSelected}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderLeft: `3px solid ${plugin.color}`,
                        opacity: remoteSelected ? 0.75 : 1,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-primary)' }}>{plugin.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Built-in processor</div>
                      </div>
                      {plugin.standalone && (
                        <Tag type="green">Standalone</Tag>
                      )}
                      <ChevronRight size={14} style={{ color: 'var(--text-tertiary)' }} />
                    </ClickableTile>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
      </div>

      <style>{styles}</style>
    </div>
  )
}

const styles = `
  .dsp-page {
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .cluster-banner {
    margin-bottom: 20px;
    padding: 14px 16px;
    border-radius: 12px;
    border: 1px solid rgba(96, 165, 250, 0.2);
    background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(15, 23, 42, 0.92));
    color: #cbd5e1;
    line-height: 1.6;
  }

  .section-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #1e293b;
  }

  .section-tab {
    background: #111111;
    border: 1px solid #1e293b;
    border-radius: 6px;
    color: #6b7280;
    font-size: 13px;
    padding: 8px 16px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .section-tab:hover {
    background: #1a1a1a;
    color: #f3f4f6;
  }

  .section-tab.active {
    background: #222222;
    border-color: #1e293b;
    color: #f3f4f6;
  }

  .dsp-content {
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  .dsp-section {
    background: #0a0a0a;
    border: 1px solid #1a1a1a;
    border-radius: 12px;
    padding: 20px;
  }

  .section-title {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 500;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .dynamics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
  }

  .eq-container {
    width: 100%;
  }

  .cluster-summary-table td,
  .cluster-summary-table th {
    white-space: nowrap;
  }

  @media (max-width: 768px) {
    .dsp-page {
      padding: 16px;
    }

    .dynamics-grid {
      grid-template-columns: 1fr;
    }

    .section-tabs {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
  }
`

export default DSPPage
