/**
 * Zustand store for 3D Signal Flow Graph state
 */
import { create } from 'zustand'

export interface GraphNode {
  id: string
  label: string
  pluginUri?: string
  chainId?: number
  layer: number // Z-depth layer (0 = main, negative = sub-graphs)
  category?: string
  type: 'plugin' | 'input' | 'output' | 'midi' | 'layer-portal'
  position?: { x: number; y: number; z: number }
  bypassed?: boolean
  color?: string
  midiEvents?: MidiEvent[]
}

export interface GraphLink {
  source: string
  target: string
  type: 'audio' | 'midi' | 'layer-connection'
  active: boolean
  flowIntensity: number // 0-1 for animation speed
}

export interface MidiEvent {
  type: 'note-on' | 'note-off' | 'cc' | 'program-change'
  timestamp: number
  velocity?: number
  note?: number
  channel?: number
  cc?: number
  value?: number
}

export interface Snapshot {
  id: string
  name: string
  timestamp: number
  nodes: GraphNode[]
  links: GraphLink[]
  cameraPosition: { x: number; y: number; z: number }
}

interface GraphStore {
  nodes: GraphNode[]
  links: GraphLink[]
  selectedNodeId: string | null
  hoveredNodeId: string | null
  currentLayer: number
  snapshots: Snapshot[]
  activeSnapshotId: string | null
  midiEvents: Map<string, MidiEvent[]> // nodeId -> events
  
  // Actions
  setNodes: (nodes: GraphNode[]) => void
  setLinks: (links: GraphLink[]) => void
  addNode: (node: GraphNode) => void
  removeNode: (nodeId: string) => void
  updateNode: (nodeId: string, updates: Partial<GraphNode>) => void
  addLink: (link: GraphLink) => void
  removeLink: (source: string, target: string) => void
  setSelectedNode: (nodeId: string | null) => void
  setHoveredNode: (nodeId: string | null) => void
  setCurrentLayer: (layer: number) => void
  addMidiEvent: (nodeId: string, event: MidiEvent) => void
  clearMidiEvents: (nodeId: string) => void
  saveSnapshot: (name: string, cameraPosition: { x: number; y: number; z: number }) => void
  loadSnapshot: (snapshotId: string) => void
  deleteSnapshot: (snapshotId: string) => void
}

export const useGraphStore = create<GraphStore>((set) => ({
  nodes: [],
  links: [],
  selectedNodeId: null,
  hoveredNodeId: null,
  currentLayer: 0,
  snapshots: [],
  activeSnapshotId: null,
  midiEvents: new Map(),

  setNodes: (nodes) => set({ nodes }),
  setLinks: (links) => set({ links }),
  
  addNode: (node) => set((state) => ({
    nodes: [...state.nodes, node]
  })),
  
  removeNode: (nodeId) => set((state) => ({
    nodes: state.nodes.filter(n => n.id !== nodeId),
    links: state.links.filter(l => l.source !== nodeId && l.target !== nodeId),
    selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId
  })),
  
  updateNode: (nodeId, updates) => set((state) => ({
    nodes: state.nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n)
  })),
  
  addLink: (link) => set((state) => ({
    links: [...state.links, link]
  })),
  
  removeLink: (source, target) => set((state) => ({
    links: state.links.filter(l => !(l.source === source && l.target === target))
  })),
  
  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),
  setHoveredNode: (nodeId) => set({ hoveredNodeId: nodeId }),
  setCurrentLayer: (layer) => set({ currentLayer: layer }),
  
  addMidiEvent: (nodeId, event) => set((state) => {
    const newEvents = new Map(state.midiEvents)
    const existing = newEvents.get(nodeId) || []
    newEvents.set(nodeId, [...existing, event])
    return { midiEvents: newEvents }
  }),
  
  clearMidiEvents: (nodeId) => set((state) => {
    const newEvents = new Map(state.midiEvents)
    newEvents.delete(nodeId)
    return { midiEvents: newEvents }
  }),
  
  saveSnapshot: (name, cameraPosition) => set((state) => {
    const snapshot: Snapshot = {
      id: `snapshot-${Date.now()}`,
      name,
      timestamp: Date.now(),
      nodes: state.nodes,
      links: state.links,
      cameraPosition
    }
    return {
      snapshots: [...state.snapshots, snapshot],
      activeSnapshotId: snapshot.id
    }
  }),
  
  loadSnapshot: (snapshotId) => set((state) => {
    const snapshot = state.snapshots.find(s => s.id === snapshotId)
    if (!snapshot) return state
    return {
      nodes: snapshot.nodes,
      links: snapshot.links,
      activeSnapshotId: snapshotId
    }
  }),
  
  deleteSnapshot: (snapshotId) => set((state) => ({
    snapshots: state.snapshots.filter(s => s.id !== snapshotId),
    activeSnapshotId: state.activeSnapshotId === snapshotId ? null : state.activeSnapshotId
  }))
}))
