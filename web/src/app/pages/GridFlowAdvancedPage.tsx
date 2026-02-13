/**
 * GridFlowAdvancedPage - 3D Signal Flow Visualization
 * 
 * Asteroids-inspired 3D graph view with:
 * - Layered depth for JUCE graphs (hierarchical)
 * - Shader-based flow animations
 * - MIDI-reactive particle systems
 * - Real-time chain/plugin visualization
 * - Minimal dark VS Code aesthetic
 */

import { useState, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  FloppyDisk,
  Camera,
  Cube,
  Lightning,
  Stack,
  X,
  ArrowsClockwise,
  MagnifyingGlass,
  Trash,
  Copy
} from '@phosphor-icons/react'
import { Scene3D } from '../components/GridFlowAdvanced/3d/Scene3D'
import { useGraphStore } from '../stores/graphStore'
import { chainsApi, pluginsApi } from '../../map2/api'
import { useToasts } from '../components/Toasts'
import type { Chain, Plugin } from '../../map2/types'

// Toolbar component
function Toolbar() {
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
    
    saveSnapshot(name, { x: 0, y: 0, z: 50 })
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
        zIndex: 100
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: '16px',
          fontWeight: 600,
          color: '#d4d4d4',
          fontFamily: 'Consolas, monospace',
          marginRight: 'auto'
        }}
      >
        GRID ADVANCED — 3D Signal Flow
      </h1>
      
      <ToolbarButton icon={<Plus />} label="Add Node" onClick={() => {}} />
      <ToolbarButton icon={<Copy />} label="Duplicate" onClick={() => {}} />
      <ToolbarButton icon={<Trash />} label="Delete" onClick={() => {}} />
      
      <div style={{ width: '1px', height: '30px', background: '#3e3e42' }} />
      
      <ToolbarButton
        icon={<Camera />}
        label="Save Snapshot"
        onClick={handleSaveSnapshot}
      />
      <ToolbarButton
        icon={<Stack />}
        label={`Snapshots (${snapshots.length})`}
        onClick={() => setShowSnapshots(!showSnapshots)}
        active={showSnapshots}
      />
      
      <div style={{ width: '1px', height: '30px', background: '#3e3e42' }} />
      
      <ToolbarButton icon={<Cube />} label="Reset Camera" onClick={() => {}} />
      <ToolbarButton icon={<ArrowsClockwise />} label="Re-layout" onClick={() => {}} />
      
      {/* Snapshots panel */}
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
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
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
                  background:
                    activeSnapshotId === snap.id ? '#007acc22' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
                onClick={() => {
                  loadSnapshot(snap.id)
                  setShowSnapshots(false)
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#d4d4d4', fontSize: '14px' }}>
                    {snap.name}
                  </div>
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
                    padding: '4px'
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
}

function ToolbarButton({ icon, label, onClick, active }: ToolbarButtonProps) {
  const [hovered, setHovered] = useState(false)
  
  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 12px',
        background: active
          ? '#007acc'
          : hovered
          ? '#3e3e42'
          : 'transparent',
        border: active ? '1px solid #007acc' : '1px solid #3e3e42',
        borderRadius: '4px',
        color: active ? '#ffffff' : '#d4d4d4',
        fontSize: '13px',
        fontFamily: 'Consolas, monospace',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hovered
          ? '0 4px 12px rgba(0, 122, 204, 0.3)'
          : active
          ? '0 0 12px rgba(0, 122, 204, 0.5)'
          : 'none'
      }}
    >
      <span style={{ display: 'flex' }}>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

// Inspector sidebar
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
        padding: '20px'
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
          letterSpacing: '0.5px'
        }}
      >
        Inspector
      </h3>
      
      <div style={{ marginBottom: '24px' }}>
        <div style={{ color: '#999', fontSize: '12px', marginBottom: '8px' }}>
          Current Layer
        </div>
        <div
          style={{
            color: '#007acc',
            fontSize: '24px',
            fontFamily: 'Consolas, monospace',
            fontWeight: 700
          }}
        >
          {currentLayer}
        </div>
      </div>
      
      {selectedNode ? (
        <>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: '#999', fontSize: '12px', marginBottom: '4px' }}>
              Node ID
            </div>
            <div style={{ color: '#d4d4d4', fontSize: '13px', fontFamily: 'monospace' }}>
              {selectedNode.id}
            </div>
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: '#999', fontSize: '12px', marginBottom: '4px' }}>
              Label
            </div>
            <div style={{ color: '#d4d4d4', fontSize: '14px' }}>
              {selectedNode.label}
            </div>
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: '#999', fontSize: '12px', marginBottom: '4px' }}>
              Type
            </div>
            <div style={{ color: '#00d9ff', fontSize: '13px' }}>
              {selectedNode.type}
            </div>
          </div>
          
          {selectedNode.category && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: '#999', fontSize: '12px', marginBottom: '4px' }}>
                Category
              </div>
              <div style={{ color: '#ffbe0b', fontSize: '13px' }}>
                {selectedNode.category}
              </div>
            </div>
          )}
          
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: '#999', fontSize: '12px', marginBottom: '4px' }}>
              Layer
            </div>
            <div style={{ color: '#a239ca', fontSize: '13px' }}>
              {selectedNode.layer}
            </div>
          </div>
          
          {selectedNode.bypassed !== undefined && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: '#999', fontSize: '12px', marginBottom: '4px' }}>
                Status
              </div>
              <div
                style={{
                  color: selectedNode.bypassed ? '#ff006e' : '#00ff9f',
                  fontSize: '13px'
                }}
              >
                {selectedNode.bypassed ? 'Bypassed' : 'Active'}
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ color: '#666', fontSize: '13px', fontStyle: 'italic' }}>
          No node selected
        </div>
      )}
    </div>
  )
}

// Main page component
export function GridFlowAdvancedPage() {
  const queryClient = useQueryClient()
  
  const setSelectedNode = useGraphStore((state) => state.setSelectedNode)
  const setHoveredNode = useGraphStore((state) => state.setHoveredNode)
  const setNodes = useGraphStore((state) => state.setNodes)
  const setLinks = useGraphStore((state) => state.setLinks)
  
  // Load chains data
  const { data: chains } = useQuery({
    queryKey: ['chains'],
    queryFn: chainsApi.list
  })
  
  // Initialize graph from chains
  useEffect(() => {
    if (!chains?.chains) return
    
    // Convert chains to graph nodes/links
    const nodes = chains.chains.flatMap((chain, chainIndex) => {
      const plugins = chain.plugins || []
      return plugins.map((plugin, pluginIndex) => ({
        id: `${chain.id}-${plugin.uri}-${pluginIndex}`,
        label: plugin.name || 'Plugin',
        pluginUri: plugin.uri,
        chainId: chain.id,
        layer: 0,
        category: 'default',
        type: 'plugin' as const,
        bypassed: plugin.bypassed || false
      }))
    })
    
    const links = chains.chains.flatMap((chain) => {
      const plugins = chain.plugins || []
      return plugins.slice(0, -1).map((plugin, i) => ({
        source: `${chain.id}-${plugin.uri}-${i}`,
        target: `${chain.id}-${plugins[i + 1].uri}-${i + 1}`,
        type: 'audio' as const,
        active: true,
        flowIntensity: 0.8
      }))
    })
    
    setNodes(nodes)
    setLinks(links)
  }, [chains, setNodes, setLinks])
  
  const handleNodeClick = useCallback(
    (nodeId: string) => {
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
  
  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: '#000000',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <Toolbar />
      
      <div
        style={{
          position: 'absolute',
          top: '60px',
          left: 0,
          right: '320px',
          bottom: 0
        }}
      >
        <Scene3D onNodeClick={handleNodeClick} onNodeHover={handleNodeHover} />
      </div>
      
      <Inspector />
      
      {/* Version indicator */}
      <div
        style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          color: '#666',
          fontSize: '11px',
          fontFamily: 'Consolas, monospace'
        }}
      >
        GRID-ADVANCED v3.0
      </div>
    </div>
  )
}

export default GridFlowAdvancedPage
