/**
 * GridFlowAdvancedPage - 3D Signal Flow Visualization
 *
 * Production-ready baseline for the advanced 3D graph:
 * - Deterministic graph layout from live chain data
 * - Robust empty/error/loading states
 * - Working toolbar controls (refresh, reset camera, re-layout, snapshots)
 * - Interactive node selection/hover wired into Inspector
 */

import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from 'react'
import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Camera,
  Cube,
  Stack,
  X,
  ArrowsClockwise,
  MagnifyingGlass,
  WarningCircle,
} from '@phosphor-icons/react'
import { useGraphStore, type GraphLink, type GraphNode } from '../stores/graphStore'
import { chainsApi } from '../../map2/api'
import { getDisplayPluginName } from '../../map2/displayNames'
import { useToasts } from '../components/Toasts'
import type { Chain, ChainPlugin } from '../../map2/types'

const LazyScene3D = lazy(() =>
  import('../components/GridFlowAdvanced/3d/Scene3D').then((module) => ({ default: module.Scene3D })),
)

const CHAIN_X_SPACING = 22
const NODE_Y_SPACING = 8
const CHAIN_EDGE_PADDING = 8
const JITTER_SPREAD = 1.4

function stableJitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

function inferCategory(plugin: ChainPlugin): string {
  const text = `${plugin.name} ${plugin.uri}`.toLowerCase()

  if (/(amp|preamp|cab|5150|marshall|fender|mesa)/.test(text)) return 'amplifier'
  if (/(dist|fuzz|drive|overdrive|saturation|clip)/.test(text)) return 'distortion'
  if (/(chorus|flanger|phaser|vibrato|tremolo|mod)/.test(text)) return 'modulation'
  if (/(delay|echo|tap)/.test(text)) return 'delay'
  if (/(reverb|room|hall|plate)/.test(text)) return 'reverb'
  if (/(compress|comp|gate|limit|expander)/.test(text)) return 'dynamics'
  if (/(eq|filter|lowpass|highpass|bandpass)/.test(text)) return 'filter'
  if (/(meter|analyzer|utility|gain|mix|routing|split)/.test(text)) return 'utility'

  return 'default'
}

function buildGraphFromChains(chains: Chain[], layoutPass: number): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = []
  const links: GraphLink[] = []

  if (chains.length === 0) {
    return { nodes, links }
  }

  const chainCenterOffset = (chains.length - 1) / 2

  chains.forEach((chain, chainIndex) => {
    const plugins = [...(chain.plugins || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    const chainX = (chainIndex - chainCenterOffset) * CHAIN_X_SPACING
    const chainHeight = Math.max(8, (plugins.length - 1) * NODE_Y_SPACING)

    const inputNodeId = `chain-${chain.id}-input`
    const outputNodeId = `chain-${chain.id}-output`

    nodes.push({
      id: inputNodeId,
      label: `${chain.name} In`,
      chainId: chain.id,
      layer: 0,
      category: 'utility',
      type: 'input',
      position: { x: chainX, y: chainHeight / 2 + CHAIN_EDGE_PADDING, z: 0 },
      bypassed: false,
    })

    nodes.push({
      id: outputNodeId,
      label: `${chain.name} Out`,
      chainId: chain.id,
      layer: 0,
      category: 'utility',
      type: 'output',
      position: { x: chainX, y: -(chainHeight / 2 + CHAIN_EDGE_PADDING), z: 0 },
      bypassed: false,
    })

    let previousId = inputNodeId

    if (plugins.length === 0) {
      links.push({
        source: inputNodeId,
        target: outputNodeId,
        type: 'audio',
        active: false,
        flowIntensity: 0.25,
      })
      return
    }

    plugins.forEach((plugin, pluginIndex) => {
      const centered = pluginIndex - (plugins.length - 1) / 2
      const jitterBase = chain.id * 997 + pluginIndex * 57 + layoutPass * 131
      const jitterX = stableJitter(jitterBase) * JITTER_SPREAD
      const jitterY = stableJitter(jitterBase + 33) * JITTER_SPREAD
      const jitterZ = stableJitter(jitterBase + 71) * 1.2

      const nodeId = `${chain.id}:${plugin.uri}:${plugin.position ?? pluginIndex}:${pluginIndex}`

      nodes.push({
        id: nodeId,
        label: getDisplayPluginName(plugin.name, plugin.uri),
        pluginUri: plugin.uri,
        chainId: chain.id,
        layer: 0,
        category: inferCategory(plugin),
        type: 'plugin',
        bypassed: plugin.bypassed || false,
        position: {
          x: chainX + jitterX,
          y: -centered * NODE_Y_SPACING + jitterY,
          z: jitterZ,
        },
      })

      links.push({
        source: previousId,
        target: nodeId,
        type: 'audio',
        active: !plugin.bypassed,
        flowIntensity: plugin.bypassed ? 0.3 : 0.85,
      })

      previousId = nodeId
    })

    links.push({
      source: previousId,
      target: outputNodeId,
      type: 'audio',
      active: true,
      flowIntensity: 0.7,
    })
  })

  return { nodes, links }
}

interface ToolbarProps {
  onResetCamera: () => void
  onRelayout: () => void
  onRefreshData: () => void
  canRelayout: boolean
  isRefreshing: boolean
}

function Toolbar({ onResetCamera, onRelayout, onRefreshData, canRelayout, isRefreshing }: ToolbarProps) {
  const { pushToast } = useToasts()
  const snapshots = useGraphStore((state) => state.snapshots)
  const activeSnapshotId = useGraphStore((state) => state.activeSnapshotId)
  const saveSnapshot = useGraphStore((state) => state.saveSnapshot)
  const loadSnapshot = useGraphStore((state) => state.loadSnapshot)
  const deleteSnapshot = useGraphStore((state) => state.deleteSnapshot)
  const [showSnapshots, setShowSnapshots] = useState(false)

  const handleSaveSnapshot = () => {
    const name = prompt('Snapshot name:')
    if (!name) return

    saveSnapshot(name, { x: 0, y: 0, z: 45 })
    pushToast(`Snapshot "${name}" saved`, 'success')
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '60px',
        background: 'linear-gradient(180deg, #1e1e1e 0%, rgba(30,30,30,0.95) 100%)',
        borderBottom: '1px solid #2d2d30',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '0 20px',
        zIndex: 100,
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: '16px',
          fontWeight: 600,
          color: '#d4d4d4',
          fontFamily: 'Consolas, monospace',
          marginRight: 'auto',
        }}
      >
        GRID ADVANCED — 3D Signal Flow
      </h1>

      <ToolbarButton
        icon={<MagnifyingGlass />}
        label={isRefreshing ? 'Refreshing...' : 'Refresh'}
        onClick={onRefreshData}
        disabled={isRefreshing}
      />

      <div style={{ width: '1px', height: '30px', background: '#3e3e42' }} />

      <ToolbarButton icon={<Camera />} label="Save Snapshot" onClick={handleSaveSnapshot} />
      <ToolbarButton
        icon={<Stack />}
        label={`Snapshots (${snapshots.length})`}
        onClick={() => setShowSnapshots(!showSnapshots)}
        active={showSnapshots}
      />

      <div style={{ width: '1px', height: '30px', background: '#3e3e42' }} />

      <ToolbarButton icon={<Cube />} label="Reset Camera" onClick={onResetCamera} />
      <ToolbarButton
        icon={<ArrowsClockwise />}
        label="Re-layout"
        onClick={onRelayout}
        disabled={!canRelayout}
      />

      {showSnapshots && (
        <div
          style={{
            position: 'absolute',
            top: '65px',
            right: '20px',
            width: '300px',
            maxHeight: '400px',
            overflowY: 'auto',
            background: '#2d2d30',
            border: '1px solid #3e3e42',
            borderRadius: '4px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {snapshots.length === 0 ? (
            <div style={{ padding: '20px', color: '#999', textAlign: 'center' }}>
              No snapshots yet
            </div>
          ) : (
            snapshots.map((snap) => (
              <div
                key={snap.id}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #3e3e42',
                  cursor: 'pointer',
                  background: activeSnapshotId === snap.id ? '#007acc22' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
                onClick={() => {
                  loadSnapshot(snap.id)
                  setShowSnapshots(false)
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#d4d4d4', fontSize: '14px' }}>{snap.name}</div>
                  <div style={{ color: '#666', fontSize: '11px' }}>
                    {new Date(snap.timestamp).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteSnapshot(snap.id)
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#666',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

interface ToolbarButtonProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
}

function ToolbarButton({ icon, label, onClick, active, disabled }: ToolbarButtonProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 12px',
        background: active ? '#007acc' : hovered ? '#3e3e42' : 'transparent',
        border: active ? '1px solid #007acc' : '1px solid #3e3e42',
        borderRadius: '4px',
        color: active ? '#ffffff' : '#d4d4d4',
        fontSize: '13px',
        fontFamily: 'Consolas, monospace',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s ease',
        transform: hovered && !disabled ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow:
          hovered && !disabled
            ? '0 4px 12px rgba(0, 122, 204, 0.3)'
            : active
            ? '0 0 12px rgba(0, 122, 204, 0.5)'
            : 'none',
      }}
    >
      <span style={{ display: 'flex' }}>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function Inspector() {
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId)
  const nodes = useGraphStore((state) => state.nodes)
  const currentLayer = useGraphStore((state) => state.currentLayer)

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  return (
    <div
      style={{
        position: 'absolute',
        top: '60px',
        right: 0,
        bottom: 0,
        width: '320px',
        background: '#1e1e1e',
        borderLeft: '1px solid #2d2d30',
        overflowY: 'auto',
        padding: '20px',
      }}
    >
      <h3
        style={{
          margin: '0 0 16px 0',
          fontSize: '14px',
          color: '#d4d4d4',
          fontFamily: 'Consolas, monospace',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Inspector
      </h3>

      <div style={{ marginBottom: '24px' }}>
        <div style={{ color: '#999', fontSize: '12px', marginBottom: '8px' }}>Current Layer</div>
        <div
          style={{
            color: '#007acc',
            fontSize: '24px',
            fontFamily: 'Consolas, monospace',
            fontWeight: 700,
          }}
        >
          {currentLayer}
        </div>
      </div>

      {selectedNode ? (
        <>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: '#999', fontSize: '12px', marginBottom: '4px' }}>Node ID</div>
            <div style={{ color: '#d4d4d4', fontSize: '13px', fontFamily: 'monospace' }}>{selectedNode.id}</div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: '#999', fontSize: '12px', marginBottom: '4px' }}>Label</div>
            <div style={{ color: '#d4d4d4', fontSize: '14px' }}>{selectedNode.label}</div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: '#999', fontSize: '12px', marginBottom: '4px' }}>Type</div>
            <div style={{ color: '#00d9ff', fontSize: '13px' }}>{selectedNode.type}</div>
          </div>

          {selectedNode.category && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: '#999', fontSize: '12px', marginBottom: '4px' }}>Category</div>
              <div style={{ color: '#ffbe0b', fontSize: '13px' }}>{selectedNode.category}</div>
            </div>
          )}

          {selectedNode.position && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: '#999', fontSize: '12px', marginBottom: '4px' }}>Position</div>
              <div style={{ color: '#d4d4d4', fontSize: '12px', fontFamily: 'monospace' }}>
                x: {selectedNode.position.x.toFixed(1)}, y: {selectedNode.position.y.toFixed(1)}, z:{' '}
                {selectedNode.position.z.toFixed(1)}
              </div>
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: '#999', fontSize: '12px', marginBottom: '4px' }}>Layer</div>
            <div style={{ color: '#a239ca', fontSize: '13px' }}>{selectedNode.layer}</div>
          </div>

          {selectedNode.bypassed !== undefined && selectedNode.type === 'plugin' && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: '#999', fontSize: '12px', marginBottom: '4px' }}>Status</div>
              <div style={{ color: selectedNode.bypassed ? '#ff006e' : '#00ff9f', fontSize: '13px' }}>
                {selectedNode.bypassed ? 'Bypassed' : 'Active'}
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ color: '#666', fontSize: '13px', fontStyle: 'italic' }}>No node selected</div>
      )}
    </div>
  )
}

interface StateOverlayProps {
  title: string
  detail?: string
  action?: React.ReactNode
  tone?: 'info' | 'error'
}

function StateOverlay({ title, detail, action, tone = 'info' }: StateOverlayProps) {
  const accent = tone === 'error' ? '#ef4444' : '#60a5fa'

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          minWidth: 320,
          maxWidth: 520,
          margin: '0 24px',
          padding: 20,
          borderRadius: 10,
          border: `1px solid ${accent}55`,
          background: 'rgba(12, 18, 28, 0.88)',
          boxShadow: '0 16px 50px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: detail ? 10 : 0 }}>
          <WarningCircle size={20} color={accent} weight="duotone" />
          <strong style={{ color: '#e5e7eb' }}>{title}</strong>
        </div>

        {detail && <div style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.5 }}>{detail}</div>}

        {action && <div style={{ marginTop: 14 }}>{action}</div>}
      </div>
    </div>
  )
}

function SceneLoadingPlaceholder({ title }: { title: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'radial-gradient(circle at center, rgba(15, 23, 42, 0.6) 0%, rgba(0, 0, 0, 0.92) 70%)',
        color: '#94a3b8',
        fontSize: 13,
        letterSpacing: '0.05em',
      }}
    >
      {title}
    </div>
  )
}

export function GridFlowAdvancedPage() {
  const { pushToast } = useToasts()

  const setSelectedNode = useGraphStore((state) => state.setSelectedNode)
  const setHoveredNode = useGraphStore((state) => state.setHoveredNode)
  const setNodes = useGraphStore((state) => state.setNodes)
  const setLinks = useGraphStore((state) => state.setLinks)
  const nodeCount = useGraphStore((state) => state.nodes.length)

  const [layoutPass, setLayoutPass] = useState(0)
  const [sceneResetKey, setSceneResetKey] = useState(0)
  const [shouldLoadScene, setShouldLoadScene] = useState(false)

  const {
    data: chainsData,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['chains'],
    queryFn: chainsApi.list,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  const chainCount = chainsData?.chains?.length ?? 0
  const pluginCount = useMemo(
    () => chainsData?.chains?.reduce((count, chain) => count + (chain.plugins?.length ?? 0), 0) ?? 0,
    [chainsData]
  )

  useEffect(() => {
    const chains = chainsData?.chains ?? []
    const { nodes, links } = buildGraphFromChains(chains, layoutPass)

    setNodes(nodes)
    setLinks(links)

    if (!nodes.some((n) => n.id === useGraphStore.getState().selectedNodeId)) {
      setSelectedNode(null)
    }
    setHoveredNode(null)
  }, [chainsData, layoutPass, setLinks, setNodes, setSelectedNode, setHoveredNode])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShouldLoadScene(true)
    }, 120)

    return () => window.clearTimeout(timer)
  }, [])

  const handleNodeClick = useCallback(
    (nodeId: string | null) => {
      setSelectedNode(nodeId)
    },
    [setSelectedNode]
  )

  const handleNodeHover = useCallback(
    (nodeId: string | null) => {
      setHoveredNode(nodeId)
    },
    [setHoveredNode]
  )

  const handleResetCamera = useCallback(() => {
    setSceneResetKey((value) => value + 1)
    pushToast('Camera reset', 'success')
  }, [pushToast])

  const handleRelayout = useCallback(() => {
    setLayoutPass((value) => value + 1)
    pushToast('Graph re-laid out', 'success')
  }, [pushToast])

  const handleRefreshData = useCallback(() => {
    void refetch()
  }, [refetch])

  const queryErrorMessage = error instanceof Error ? error.message : null

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: '#000000',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Toolbar
        onResetCamera={handleResetCamera}
        onRelayout={handleRelayout}
        onRefreshData={handleRefreshData}
        canRelayout={nodeCount > 0}
        isRefreshing={isFetching}
      />

      <div
        style={{
          position: 'absolute',
          top: '60px',
          left: 0,
          right: '320px',
          bottom: 0,
        }}
      >
        {shouldLoadScene ? (
          <Suspense fallback={<SceneLoadingPlaceholder title="Loading 3D renderer..." />}>
            <LazyScene3D
              key={sceneResetKey}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              onBackgroundClick={() => {
                setSelectedNode(null)
                setHoveredNode(null)
              }}
            />
          </Suspense>
        ) : (
          <SceneLoadingPlaceholder title="Preparing 3D renderer..." />
        )}

        {isLoading && <StateOverlay title="Loading chain graph..." detail="Fetching real-time chain and plugin topology." />}

        {!isLoading && queryErrorMessage && (
          <StateOverlay
            tone="error"
            title="Unable to load chain data"
            detail={queryErrorMessage}
            action={
              <button
                onClick={() => {
                  void refetch()
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid rgba(239, 68, 68, 0.45)',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#fecaca',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            }
          />
        )}

        {!isLoading && !queryErrorMessage && chainCount === 0 && (
          <StateOverlay
            title="No chains available yet"
            detail="Create a chain in the Grid page first. Advanced 3D view renders from live chain/plugin data."
            action={
              <NavLink
                to="/grid"
                style={{
                  display: 'inline-block',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid rgba(96, 165, 250, 0.4)',
                  background: 'rgba(96, 165, 250, 0.1)',
                  color: '#bfdbfe',
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                Open Grid Editor
              </NavLink>
            }
          />
        )}

        {!isLoading && !queryErrorMessage && chainCount > 0 && pluginCount === 0 && (
          <StateOverlay
            title="Chains found, but no plugins loaded"
            detail="Input/output endpoints are shown. Add plugins to each chain for full graph visualization."
          />
        )}
      </div>

      <Inspector />

      <div
        style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          color: '#666',
          fontSize: '11px',
          fontFamily: 'Consolas, monospace',
        }}
      >
        GRID-ADVANCED v3.1 · chains: {chainCount} · plugins: {pluginCount}
      </div>
    </div>
  )
}

export default GridFlowAdvancedPage
