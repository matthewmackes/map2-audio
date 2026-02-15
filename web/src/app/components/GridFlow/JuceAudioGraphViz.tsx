/**
 * JuceAudioGraphViz – D3.js + dagre visualization of JUCE AudioProcessorGraph
 *
 * Shows graph-based plugin chaining with:
 *  - Left-to-right signal flow (dagre LR)
 *  - Individual mono ports per channel
 *  - Main audio / sidechain / MIDI / modulation connection types
 *  - Latency accumulation badges on main audio connections
 *  - Animated dash flow on active audio paths
 *  - Zoom, pan, drag, hover highlights
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import * as d3 from 'd3-selection'
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom'
import { drag as d3Drag } from 'd3-drag'
import { linkHorizontal } from 'd3-shape'
import dagre from 'dagre'
import 'd3-transition'

// ─── Types ───────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string
  type: 'audio_io' | 'processor' | 'output' | 'midi_io'
  name: string
  processorType: string
  numInputPorts: number
  numOutputPorts: number
  ownLatencyMs: number
  sampleRate: number
  cpuPercent: number
  status: 'active' | 'warning' | 'error' | 'bypassed'
  isBypassed: boolean
  preset?: string
  xruns: number
  // layout (set by dagre)
  x?: number
  y?: number
  width?: number
  height?: number
  // port metadata
  inputLabels?: string[]
  outputLabels?: string[]
}

interface GraphLink {
  source: string
  sourcePort: number
  target: string
  targetPort: number
  type: 'audio' | 'sidechain' | 'midi' | 'modulation'
  active: boolean
  addedLatencyMs: number
  label?: string
  cumulativeLatencyMs?: number // computed
}

// ─── Example data ────────────────────────────────────────────────────────────

const EXAMPLE_NODES: GraphNode[] = [
  {
    id: 'audio_in',
    type: 'audio_io',
    name: 'AudioInput',
    processorType: 'AudioProcessorGraph::AudioGraphIOProcessor',
    numInputPorts: 0,
    numOutputPorts: 2,
    ownLatencyMs: 0,
    sampleRate: 48000,
    cpuPercent: 0,
    status: 'active',
    isBypassed: false,
    xruns: 0,
    outputLabels: ['Main L', 'Main R'],
  },
  {
    id: 'midi_in',
    type: 'midi_io',
    name: 'MIDI Input',
    processorType: 'MidiInputProcessor',
    numInputPorts: 0,
    numOutputPorts: 1,
    ownLatencyMs: 0,
    sampleRate: 48000,
    cpuPercent: 0,
    status: 'active',
    isBypassed: false,
    xruns: 0,
    outputLabels: ['MIDI Out'],
  },
  {
    id: 'eq',
    type: 'processor',
    name: 'Pro-Q 3',
    processorType: 'FabFilter Pro-Q 3',
    numInputPorts: 3,
    numOutputPorts: 2,
    ownLatencyMs: 0.8,
    sampleRate: 48000,
    cpuPercent: 7,
    status: 'active',
    isBypassed: false,
    preset: 'Vocal De-esser',
    xruns: 0,
    inputLabels: ['In 1', 'In 2', 'MIDI In'],
    outputLabels: ['Out 1', 'Out 2'],
  },
  {
    id: 'comp',
    type: 'processor',
    name: '1176 Compressor',
    processorType: 'Universal Audio 1176',
    numInputPorts: 4,
    numOutputPorts: 2,
    ownLatencyMs: 1.4,
    sampleRate: 48000,
    cpuPercent: 12,
    status: 'active',
    isBypassed: false,
    preset: 'Vocal Squeeze',
    xruns: 0,
    inputLabels: ['In 1', 'In 2', 'SC In', 'MIDI In'],
    outputLabels: ['Out 1', 'Out 2'],
  },
  {
    id: 'sc_input',
    type: 'audio_io',
    name: 'SC External',
    processorType: 'AudioGraphIOProcessor (Aux)',
    numInputPorts: 0,
    numOutputPorts: 1,
    ownLatencyMs: 0,
    sampleRate: 48000,
    cpuPercent: 0,
    status: 'active',
    isBypassed: false,
    xruns: 0,
    outputLabels: ['SC Out'],
  },
  {
    id: 'reverb',
    type: 'processor',
    name: 'Convolution Reverb',
    processorType: 'JUCE Convolution',
    numInputPorts: 2,
    numOutputPorts: 2,
    ownLatencyMs: 2.5,
    sampleRate: 48000,
    cpuPercent: 18,
    status: 'warning',
    isBypassed: false,
    preset: 'Large Hall',
    xruns: 2,
    inputLabels: ['In 1', 'In 2'],
    outputLabels: ['Out 1', 'Out 2'],
  },
  {
    id: 'limiter',
    type: 'processor',
    name: 'Limiter',
    processorType: 'FabFilter Pro-L 2',
    numInputPorts: 2,
    numOutputPorts: 2,
    ownLatencyMs: 0.1,
    sampleRate: 48000,
    cpuPercent: 3,
    status: 'active',
    isBypassed: false,
    preset: 'Mastering Loud',
    xruns: 0,
    inputLabels: ['In 1', 'In 2'],
    outputLabels: ['Out 1', 'Out 2'],
  },
  {
    id: 'audio_out',
    type: 'output',
    name: 'AudioOutput',
    processorType: 'AudioGraphIOProcessor',
    numInputPorts: 2,
    numOutputPorts: 0,
    ownLatencyMs: 0,
    sampleRate: 48000,
    cpuPercent: 0,
    status: 'active',
    isBypassed: false,
    xruns: 0,
    inputLabels: ['Main L', 'Main R'],
  },
]

const EXAMPLE_LINKS: GraphLink[] = [
  // Main audio chain: audio_in → eq → comp → reverb → limiter → audio_out
  { source: 'audio_in', sourcePort: 0, target: 'eq', targetPort: 0, type: 'audio', active: true, addedLatencyMs: 0 },
  { source: 'audio_in', sourcePort: 1, target: 'eq', targetPort: 1, type: 'audio', active: true, addedLatencyMs: 0 },
  { source: 'eq', sourcePort: 0, target: 'comp', targetPort: 0, type: 'audio', active: true, addedLatencyMs: 0.8 },
  { source: 'eq', sourcePort: 1, target: 'comp', targetPort: 1, type: 'audio', active: true, addedLatencyMs: 0.8 },
  { source: 'comp', sourcePort: 0, target: 'reverb', targetPort: 0, type: 'audio', active: true, addedLatencyMs: 1.4 },
  { source: 'comp', sourcePort: 1, target: 'reverb', targetPort: 1, type: 'audio', active: true, addedLatencyMs: 1.4 },
  { source: 'reverb', sourcePort: 0, target: 'limiter', targetPort: 0, type: 'audio', active: true, addedLatencyMs: 2.5 },
  { source: 'reverb', sourcePort: 1, target: 'limiter', targetPort: 1, type: 'audio', active: true, addedLatencyMs: 2.5 },
  { source: 'limiter', sourcePort: 0, target: 'audio_out', targetPort: 0, type: 'audio', active: true, addedLatencyMs: 0.1 },
  { source: 'limiter', sourcePort: 1, target: 'audio_out', targetPort: 1, type: 'audio', active: true, addedLatencyMs: 0.1 },
  // Sidechain: sc_input → comp SC In
  { source: 'sc_input', sourcePort: 0, target: 'comp', targetPort: 2, type: 'sidechain', active: true, addedLatencyMs: 0, label: 'Key In' },
  // MIDI routing: midi_in → eq MIDI
  { source: 'midi_in', sourcePort: 0, target: 'eq', targetPort: 2, type: 'midi', active: true, addedLatencyMs: 0, label: 'MIDI CC#11' },
  // MIDI modulation: midi_in → comp MIDI In
  { source: 'midi_in', sourcePort: 0, target: 'comp', targetPort: 3, type: 'modulation', active: true, addedLatencyMs: 0, label: 'Velocity → Attack' },
]

// ─── Constants ───────────────────────────────────────────────────────────────

const NODE_WIDTH = 160
const NODE_BASE_HEIGHT = 80
const PORT_RADIUS = 5
const PORT_SPACING = 16
const GRID_SIZE = 20

// TRON-INSPIRED COLOR PALETTE - Deep, Analytical, Sexy
const COLORS = {
  audio_io: '#00d9ff',         // Cyan glow - input/output nodes
  processor: '#ff006e',        // Magenta energy - processing nodes  
  output: '#00ff9f',           // Green terminus - final output
  midi_io: '#ffbe0b',          // Amber pulse - MIDI control
  audioLink: '#00d9ff',        // Cyan flow - main audio path
  sidechainLink: '#ff006e',    // Magenta sidechain - key input
  midiLink: '#ffbe0b',         // Amber control - MIDI routing
  modulationLink: '#a239ca',   // Purple modulation - parameter automation
  text: '#e0f2fe',             // Ice blue text - high contrast
  textDim: '#64748b',          // Slate dimmed - secondary info
  bg: '#000000',               // Void black - deep space
  gridLine: '#0a2540',         // Deep blue grid - subtle structure
  gridGlow: '#00d9ff',         // Cyan grid glow - holographic feel
  wireframe: '#1a4d6f',        // Blue wireframe - template structure
  statusActive: '#00ff9f',     // Green active - system online
  statusWarning: '#ffbe0b',    // Amber warning - attention needed
  statusError: '#ff006e',      // Magenta error - critical state
  statusBypassed: '#475569',   // Slate bypassed - inactive
  glow: 'rgba(0, 217, 255, 0.6)',      // Cyan glow effect
  glowStrong: 'rgba(0, 217, 255, 0.9)', // Strong cyan glow
  shadowDeep: 'rgba(0, 0, 0, 0.8)',    // Deep shadow
} as const

function nodeColor(type: GraphNode['type']) {
  return COLORS[type] ?? COLORS.processor
}

function statusColor(status: GraphNode['status']) {
  const map: Record<string, string> = {
    active: COLORS.statusActive,
    warning: COLORS.statusWarning,
    error: COLORS.statusError,
    bypassed: COLORS.statusBypassed,
  }
  return map[status] ?? COLORS.statusActive
}

function cpuColor(pct: number) {
  if (pct > 50) return '#ef4444'
  if (pct > 25) return '#f59e0b'
  return '#22c55e'
}

function nodeHeight(node: GraphNode) {
  const ports = Math.max(node.numInputPorts, node.numOutputPorts, 1)
  const portHeight = ports * PORT_SPACING + 8
  return Math.max(NODE_BASE_HEIGHT, portHeight + 30)
}

// ─── Cumulative latency computation ──────────────────────────────────────────

function computeCumulativeLatency(nodes: GraphNode[], links: GraphLink[]): GraphLink[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  // Build adjacency from audio links only
  const audioLinks = links.filter((l) => l.type === 'audio')
  // Find roots (nodes with no incoming audio)
  const hasIncoming = new Set(audioLinks.map((l) => l.target))
  const roots = nodes.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id)
  // BFS to accumulate
  const cumLatency = new Map<string, number>()
  roots.forEach((r) => cumLatency.set(r, 0))
  const queue = [...roots]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    const outgoing = audioLinks.filter((l) => l.source === current)
    const node = nodeMap.get(current)
    const ownLat = node?.ownLatencyMs ?? 0
    const parentCum = cumLatency.get(current) ?? 0
    for (const link of outgoing) {
      const newCum = parentCum + ownLat
      const existing = cumLatency.get(link.target) ?? 0
      cumLatency.set(link.target, Math.max(existing, newCum))
      queue.push(link.target)
    }
  }
  // Set cumulativeLatencyMs on each link
  return links.map((l) => {
    if (l.type !== 'audio') return l
    const srcNode = nodeMap.get(l.source)
    const parentCum = cumLatency.get(l.source) ?? 0
    const total = parentCum + (srcNode?.ownLatencyMs ?? 0)
    return { ...l, cumulativeLatencyMs: total }
  })
}

// ─── Layout with dagre ───────────────────────────────────────────────────────

interface LayoutResult {
  nodes: (GraphNode & { x: number; y: number; width: number; height: number })[]
  links: GraphLink[]
}

function layoutGraph(nodes: GraphNode[], links: GraphLink[]): LayoutResult {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 100, marginx: 40, marginy: 30 })
  g.setDefaultEdgeLabel(() => ({}))

  const sized = nodes.map((n) => ({ ...n, width: NODE_WIDTH, height: nodeHeight(n) }))
  sized.forEach((n) => g.setNode(n.id, { width: n.width, height: n.height }))
  links.forEach((l) => g.setEdge(l.source, l.target))

  dagre.layout(g)

  const laid = sized.map((n) => {
    const pos = g.node(n.id)
    return { ...n, x: pos.x - n.width / 2, y: pos.y - n.height / 2 }
  })

  return { nodes: laid, links: computeCumulativeLatency(nodes, links) }
}

// ─── Port helpers ────────────────────────────────────────────────────────────

function inputPortY(nodeY: number, nodeH: number, portIdx: number, total: number) {
  const startY = nodeY + (nodeH - (total - 1) * PORT_SPACING) / 2
  return startY + portIdx * PORT_SPACING
}
function outputPortY(nodeY: number, nodeH: number, portIdx: number, total: number) {
  return inputPortY(nodeY, nodeH, portIdx, total)
}

// ─── Chain → Graph conversion ────────────────────────────────────────────────

interface ChainData {
  id: number
  name: string
  is_active: boolean
  plugins: Array<{
    uri: string
    name: string
    bypassed: boolean
    category?: string
  }>
}

function chainsToGraph(
  chains: ChainData[], 
  flowSlots: FlowSlotInfo[], 
  routingMode: RoutingMode,
  activeFlowId: string | null,
  morphSourceId: string | null,
  morphTargetId: string | null
): { nodes: GraphNode[]; links: GraphLink[] } {
  // No chains at all → show example data
  if (!chains || chains.length === 0) {
    return { nodes: EXAMPLE_NODES, links: EXAMPLE_LINKS }
  }

  const nodes: GraphNode[] = []
  const links: GraphLink[] = []

  // Audio input node
  nodes.push({
    id: 'audio_in',
    type: 'audio_io',
    name: 'Audio Input',
    processorType: 'AudioGraphIOProcessor',
    numInputPorts: 0,
    numOutputPorts: 2,
    ownLatencyMs: 0,
    sampleRate: 48000,
    cpuPercent: 0,
    status: 'active',
    isBypassed: false,
    xruns: 0,
    outputLabels: ['L', 'R'],
  })

  // Audio output node
  nodes.push({
    id: 'audio_out',
    type: 'output',
    name: 'Audio Output',
    processorType: 'AudioGraphIOProcessor',
    numInputPorts: 2,
    numOutputPorts: 0,
    ownLatencyMs: 0,
    sampleRate: 48000,
    cpuPercent: 0,
    status: 'active',
    isBypassed: false,
    xruns: 0,
    inputLabels: ['L', 'R'],
  })

  // Get active flow slots that have chain assignments
  const activeFlowSlots = flowSlots.filter(slot => !slot.muted && slot.chainId !== null)

  // ─── Fallback: no flow→chain assignments, show all active chains in series ─
  if (activeFlowSlots.length === 0) {
    const activeChains = chains.filter(c => c.is_active)
    if (activeChains.length === 0) {
      // No active chains at all → just audio_in → audio_out
      links.push(
        { source: 'audio_in', sourcePort: 0, target: 'audio_out', targetPort: 0, type: 'audio', active: true, addedLatencyMs: 0 },
        { source: 'audio_in', sourcePort: 1, target: 'audio_out', targetPort: 1, type: 'audio', active: true, addedLatencyMs: 0 }
      )
      return { nodes, links }
    }

    // Build all active chains in series: audio_in → chain0 plugins → chain1 plugins → audio_out
    let prevNodeId = 'audio_in'
    for (const chain of activeChains) {
      for (let pi = 0; pi < chain.plugins.length; pi++) {
        const plug = chain.plugins[pi]
        const nodeId = `c${chain.id}_p${pi}`
        nodes.push({
          id: nodeId,
          type: 'processor',
          name: plug.name || plug.uri.split('/').pop() || 'Plugin',
          processorType: plug.uri,
          numInputPorts: 2,
          numOutputPorts: 2,
          ownLatencyMs: 0,
          sampleRate: 48000,
          cpuPercent: 0,
          status: plug.bypassed ? 'bypassed' : 'active',
          isBypassed: plug.bypassed,
          xruns: 0,
          inputLabels: ['In L', 'In R'],
          outputLabels: ['Out L', 'Out R'],
        })
        links.push(
          { source: prevNodeId, sourcePort: 0, target: nodeId, targetPort: 0, type: 'audio', active: !plug.bypassed, addedLatencyMs: 0 },
          { source: prevNodeId, sourcePort: 1, target: nodeId, targetPort: 1, type: 'audio', active: !plug.bypassed, addedLatencyMs: 0 }
        )
        prevNodeId = nodeId
      }
    }
    links.push(
      { source: prevNodeId, sourcePort: 0, target: 'audio_out', targetPort: 0, type: 'audio', active: true, addedLatencyMs: 0 },
      { source: prevNodeId, sourcePort: 1, target: 'audio_out', targetPort: 1, type: 'audio', active: true, addedLatencyMs: 0 }
    )
    return { nodes, links }
  }

  // ─── Flow-based routing: slots have chain assignments ──────────────────────

  // Build nodes for each flow's chain
  const flowChainMap = new Map<string, { chain: ChainData; lastNodeId: string }>()
  
  for (const slot of activeFlowSlots) {
    const chain = chains.find(c => c.id === slot.chainId)
    if (!chain || !chain.is_active) continue

    let flowPrevNodeId = `audio_in`
    
    for (let pi = 0; pi < chain.plugins.length; pi++) {
      const plug = chain.plugins[pi]
      const nodeId = `flow_${slot.id}_c${chain.id}_p${pi}`
      
      nodes.push({
        id: nodeId,
        type: 'processor',
        name: `${slot.label}: ${plug.name || plug.uri.split('/').pop() || 'Plugin'}`,
        processorType: plug.uri,
        numInputPorts: 2,
        numOutputPorts: 2,
        ownLatencyMs: 0,
        sampleRate: 48000,
        cpuPercent: 0,
        status: plug.bypassed ? 'bypassed' : 'active',
        isBypassed: plug.bypassed,
        xruns: 0,
        inputLabels: ['In L', 'In R'],
        outputLabels: ['Out L', 'Out R'],
      })

      flowPrevNodeId = nodeId
    }
    
    if (chain.plugins.length > 0) {
      flowChainMap.set(slot.id, { chain, lastNodeId: flowPrevNodeId })
    }
  }

  // Build connections based on routing mode
  if (routingMode === 'series') {
    // Series: audio_in → Flow A → Flow B → Flow C → audio_out
    let prevNodeId = 'audio_in'
    for (const slot of activeFlowSlots) {
      const flowData = flowChainMap.get(slot.id)
      if (!flowData) continue
      
      const chain = flowData.chain
      for (let pi = 0; pi < chain.plugins.length; pi++) {
        const nodeId = `flow_${slot.id}_c${chain.id}_p${pi}`
        links.push({
          source: prevNodeId, sourcePort: 0, target: nodeId, targetPort: 0,
          type: 'audio', active: true, addedLatencyMs: 0,
        })
        links.push({
          source: prevNodeId, sourcePort: 1, target: nodeId, targetPort: 1,
          type: 'audio', active: true, addedLatencyMs: 0,
        })
        prevNodeId = nodeId
      }
    }
    // Connect last to output
    links.push(
      { source: prevNodeId, sourcePort: 0, target: 'audio_out', targetPort: 0, type: 'audio', active: true, addedLatencyMs: 0 },
      { source: prevNodeId, sourcePort: 1, target: 'audio_out', targetPort: 1, type: 'audio', active: true, addedLatencyMs: 0 }
    )
    
  } else if (routingMode === 'parallel_blend') {
    // Parallel: audio_in → split to all flows → merge → audio_out
    // Create mixer node
    nodes.push({
      id: 'mixer',
      type: 'processor',
      name: 'Mix',
      processorType: 'Mixer',
      numInputPorts: activeFlowSlots.length * 2,
      numOutputPorts: 2,
      ownLatencyMs: 0,
      sampleRate: 48000,
      cpuPercent: 0,
      status: 'active',
      isBypassed: false,
      xruns: 0,
    })

    let mixerInputPort = 0
    for (const slot of activeFlowSlots) {
      const flowData = flowChainMap.get(slot.id)
      if (!flowData) continue
      
      const chain = flowData.chain
      // Connect audio_in to first plugin of each flow
      const firstNodeId = `flow_${slot.id}_c${chain.id}_p0`
      links.push(
        { source: 'audio_in', sourcePort: 0, target: firstNodeId, targetPort: 0, type: 'audio', active: true, addedLatencyMs: 0 },
        { source: 'audio_in', sourcePort: 1, target: firstNodeId, targetPort: 1, type: 'audio', active: true, addedLatencyMs: 0 }
      )
      
      // Connect plugins within flow
      for (let pi = 0; pi < chain.plugins.length - 1; pi++) {
        const currNodeId = `flow_${slot.id}_c${chain.id}_p${pi}`
        const nextNodeId = `flow_${slot.id}_c${chain.id}_p${pi + 1}`
        links.push(
          { source: currNodeId, sourcePort: 0, target: nextNodeId, targetPort: 0, type: 'audio', active: true, addedLatencyMs: 0 },
          { source: currNodeId, sourcePort: 1, target: nextNodeId, targetPort: 1, type: 'audio', active: true, addedLatencyMs: 0 }
        )
      }
      
      // Connect last plugin of flow to mixer
      links.push(
        { source: flowData.lastNodeId, sourcePort: 0, target: 'mixer', targetPort: mixerInputPort++, type: 'audio', active: true, addedLatencyMs: 0 },
        { source: flowData.lastNodeId, sourcePort: 1, target: 'mixer', targetPort: mixerInputPort++, type: 'audio', active: true, addedLatencyMs: 0 }
      )
    }
    
    // Connect mixer to output
    links.push(
      { source: 'mixer', sourcePort: 0, target: 'audio_out', targetPort: 0, type: 'audio', active: true, addedLatencyMs: 0 },
      { source: 'mixer', sourcePort: 1, target: 'audio_out', targetPort: 1, type: 'audio', active: true, addedLatencyMs: 0 }
    )
    
  } else if (routingMode === 'ab_switch') {
    // A/B Switch: only active flow is connected
    const activeSlot = activeFlowSlots.find(s => s.id === activeFlowId) || activeFlowSlots[0]
    if (activeSlot) {
      const flowData = flowChainMap.get(activeSlot.id)
      if (flowData) {
        const chain = flowData.chain
        let prevNodeId = 'audio_in'
        for (let pi = 0; pi < chain.plugins.length; pi++) {
          const nodeId = `flow_${activeSlot.id}_c${chain.id}_p${pi}`
          links.push(
            { source: prevNodeId, sourcePort: 0, target: nodeId, targetPort: 0, type: 'audio', active: true, addedLatencyMs: 0 },
            { source: prevNodeId, sourcePort: 1, target: nodeId, targetPort: 1, type: 'audio', active: true, addedLatencyMs: 0 }
          )
          prevNodeId = nodeId
        }
        links.push(
          { source: prevNodeId, sourcePort: 0, target: 'audio_out', targetPort: 0, type: 'audio', active: true, addedLatencyMs: 0 },
          { source: prevNodeId, sourcePort: 1, target: 'audio_out', targetPort: 1, type: 'audio', active: true, addedLatencyMs: 0 }
        )
      }
    }
    
  } else if (routingMode === 'parameter_morph') {
    // Morph: show both source and target flows, merge to output
    const sourceSlot = activeFlowSlots.find(s => s.id === morphSourceId)
    const targetSlot = activeFlowSlots.find(s => s.id === morphTargetId)
    
    // Create morph mixer
    nodes.push({
      id: 'morph_mixer',
      type: 'processor',
      name: 'Morph Mix',
      processorType: 'Morph',
      numInputPorts: 4,
      numOutputPorts: 2,
      ownLatencyMs: 0,
      sampleRate: 48000,
      cpuPercent: 0,
      status: 'active',
      isBypassed: false,
      xruns: 0,
    })
    
    // Connect source flow
    if (sourceSlot) {
      const flowData = flowChainMap.get(sourceSlot.id)
      if (flowData) {
        const chain = flowData.chain
        let prevNodeId = 'audio_in'
        for (let pi = 0; pi < chain.plugins.length; pi++) {
          const nodeId = `flow_${sourceSlot.id}_c${chain.id}_p${pi}`
          links.push(
            { source: prevNodeId, sourcePort: 0, target: nodeId, targetPort: 0, type: 'audio', active: true, addedLatencyMs: 0 },
            { source: prevNodeId, sourcePort: 1, target: nodeId, targetPort: 1, type: 'audio', active: true, addedLatencyMs: 0 }
          )
          prevNodeId = nodeId
        }
        links.push(
          { source: prevNodeId, sourcePort: 0, target: 'morph_mixer', targetPort: 0, type: 'audio', active: true, addedLatencyMs: 0 },
          { source: prevNodeId, sourcePort: 1, target: 'morph_mixer', targetPort: 1, type: 'audio', active: true, addedLatencyMs: 0 }
        )
      }
    }
    
    // Connect target flow
    if (targetSlot) {
      const flowData = flowChainMap.get(targetSlot.id)
      if (flowData) {
        const chain = flowData.chain
        let prevNodeId = 'audio_in'
        for (let pi = 0; pi < chain.plugins.length; pi++) {
          const nodeId = `flow_${targetSlot.id}_c${chain.id}_p${pi}`
          links.push(
            { source: prevNodeId, sourcePort: 0, target: nodeId, targetPort: 0, type: 'audio', active: true, addedLatencyMs: 0 },
            { source: prevNodeId, sourcePort: 1, target: nodeId, targetPort: 1, type: 'audio', active: true, addedLatencyMs: 0 }
          )
          prevNodeId = nodeId
        }
        links.push(
          { source: prevNodeId, sourcePort: 0, target: 'morph_mixer', targetPort: 2, type: 'audio', active: true, addedLatencyMs: 0 },
          { source: prevNodeId, sourcePort: 1, target: 'morph_mixer', targetPort: 3, type: 'audio', active: true, addedLatencyMs: 0 }
        )
      }
    }
    
    // Connect morph mixer to output
    links.push(
      { source: 'morph_mixer', sourcePort: 0, target: 'audio_out', targetPort: 0, type: 'audio', active: true, addedLatencyMs: 0 },
      { source: 'morph_mixer', sourcePort: 1, target: 'audio_out', targetPort: 1, type: 'audio', active: true, addedLatencyMs: 0 }
    )
    
  } else {
    // Default fallback: series routing
    let prevNodeId = 'audio_in'
    for (const slot of activeFlowSlots) {
      const flowData = flowChainMap.get(slot.id)
      if (!flowData) continue
      
      const chain = flowData.chain
      for (let pi = 0; pi < chain.plugins.length; pi++) {
        const nodeId = `flow_${slot.id}_c${chain.id}_p${pi}`
        links.push(
          { source: prevNodeId, sourcePort: 0, target: nodeId, targetPort: 0, type: 'audio', active: true, addedLatencyMs: 0 },
          { source: prevNodeId, sourcePort: 1, target: nodeId, targetPort: 1, type: 'audio', active: true, addedLatencyMs: 0 }
        )
        prevNodeId = nodeId
      }
    }
    links.push(
      { source: prevNodeId, sourcePort: 0, target: 'audio_out', targetPort: 0, type: 'audio', active: true, addedLatencyMs: 0 },
      { source: prevNodeId, sourcePort: 1, target: 'audio_out', targetPort: 1, type: 'audio', active: true, addedLatencyMs: 0 }
    )
  }

  return { nodes, links }
}

// ─── Component ───────────────────────────────────────────────────────────────

type RoutingMode =
  | 'parallel_blend'
  | 'ab_switch'
  | 'series'
  | 'parameter_morph'
  | 'sidechain'

interface FlowSlotInfo {
  id: string
  chainId: number | null
  label: string
  color: string
  muted: boolean
}

export interface JuceAudioGraphVizProps {
  chains?: ChainData[]
  routingMode?: RoutingMode
  flowSlots?: FlowSlotInfo[]
  activeFlowId?: string | null
  morphSourceId?: string | null
  morphTargetId?: string | null
  morphProgress?: number
}

export function JuceAudioGraphViz({ 
  chains,
  routingMode = 'series',
  flowSlots = [],
  activeFlowId = null,
  morphSourceId = null,
  morphTargetId = null,
  morphProgress = 0.5,
}: JuceAudioGraphVizProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    content: string
  } | null>(null)

  // Derive graph data from chains, falling back to example data
  const graphData = useMemo(() => {
    return chainsToGraph(
      chains || [], 
      flowSlots,
      routingMode,
      activeFlowId,
      morphSourceId,
      morphTargetId
    )
  }, [chains, flowSlots, routingMode, activeFlowId, morphSourceId, morphTargetId])

  const buildViz = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    if (typeof document !== 'undefined' && document.readyState !== 'complete') return

    // Clear previous
    d3.select(container).select('svg').remove()

    const width = container.clientWidth || 1400
    const height = 420

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('background', COLORS.bg)
      .style('border-radius', '8px')

    svgRef.current = svg.node()

    // ── Defs ──
    const defs = svg.append('defs')

    // TRON-INSPIRED WIREFRAME GRID - Holographic template
    defs
      .append('pattern')
      .attr('id', 'graph-grid')
      .attr('width', GRID_SIZE)
      .attr('height', GRID_SIZE)
      .attr('patternUnits', 'userSpaceOnUse')
      .append('path')
      .attr('d', `M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`)
      .attr('fill', 'none')
      .attr('stroke', COLORS.gridLine)
      .attr('stroke-width', 1)
      .attr('opacity', 0.3)

    // ENHANCED GRID with subtle glow
    defs
      .append('pattern')
      .attr('id', 'graph-grid-glow')
      .attr('width', GRID_SIZE * 4)
      .attr('height', GRID_SIZE * 4)
      .attr('patternUnits', 'userSpaceOnUse')
      .append('path')
      .attr('d', `M 0 0 L ${GRID_SIZE * 4} 0 M 0 0 L 0 ${GRID_SIZE * 4}`)
      .attr('fill', 'none')
      .attr('stroke', COLORS.gridGlow)
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.15)

    // FAINT TEMPLATE BACKGROUND - Wireframe guide showing example structure
    defs
      .append('pattern')
      .attr('id', 'template-wireframe')
      .attr('width', width)
      .attr('height', height)
      .attr('patternUnits', 'userSpaceOnUse')
      .selectAll('rect')
      .data([
        { x: 60, y: 100, w: 140, h: 70 },   // Template Audio In
        { x: 280, y: 100, w: 140, h: 70 },  // Template Processor 1
        { x: 500, y: 100, w: 140, h: 70 },  // Template Processor 2
        { x: 720, y: 100, w: 140, h: 70 },  // Template Processor 3
        { x: 940, y: 100, w: 140, h: 70 },  // Template Audio Out
      ])
      .enter()
      .append('rect')
      .attr('x', d => d.x)
      .attr('y', d => d.y)
      .attr('width', d => d.w)
      .attr('height', d => d.h)
      .attr('fill', 'none')
      .attr('stroke', COLORS.wireframe)
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,4')
      .attr('opacity', 0.15)
      .attr('rx', 6)

    // GLOW FILTERS for Tron aesthetic
    const glowFilter = defs.append('filter').attr('id', 'glow')
    glowFilter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur')
    const feMerge = glowFilter.append('feMerge')
    feMerge.append('feMergeNode').attr('in', 'coloredBlur')
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic')

    const strongGlowFilter = defs.append('filter').attr('id', 'strong-glow')
    strongGlowFilter.append('feGaussianBlur').attr('stdDeviation', '5').attr('result', 'coloredBlur')
    const feStrongMerge = strongGlowFilter.append('feMerge')
    feStrongMerge.append('feMergeNode').attr('in', 'coloredBlur')
    feStrongMerge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Arrowheads with glow effect
    const arrowIds = ['arrow-audio', 'arrow-sc', 'arrow-midi', 'arrow-mod'] as const
    const arrowColors = [COLORS.audioLink, COLORS.sidechainLink, COLORS.midiLink, COLORS.modulationLink]
    arrowIds.forEach((aid, i) => {
      defs
        .append('marker')
        .attr('id', aid)
        .attr('viewBox', '0 -4 8 8')
        .attr('refX', 8)
        .attr('refY', 0)
        .attr('markerWidth', 7)
        .attr('markerHeight', 7)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-3.5L8,0L0,3.5')
        .attr('fill', arrowColors[i])
        .attr('opacity', 0.9)
        .style('filter', 'url(#glow)')
    })

    // ── Layout ──
    const { nodes, links } = layoutGraph(graphData.nodes, graphData.links)

    // ── Root group for zoom ──
    const root = svg.append('g').attr('class', 'root')

    // LAYERED GRID SYSTEM - Educational wireframe template
    // Layer 1: Base grid (subtle structure)
    root
      .append('rect')
      .attr('width', 4000)
      .attr('height', 4000)
      .attr('x', -1000)
      .attr('y', -1000)
      .attr('fill', 'url(#graph-grid)')
      .attr('opacity', 1)

    // Layer 2: Enhanced grid with glow (holographic feel)
    root
      .append('rect')
      .attr('width', 4000)
      .attr('height', 4000)
      .attr('x', -1000)
      .attr('y', -1000)
      .attr('fill', 'url(#graph-grid-glow)')
      .attr('opacity', 1)

    // Layer 3: Template wireframe (faint guide showing structure)
    root
      .append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('x', 0)
      .attr('y', 0)
      .attr('fill', 'url(#template-wireframe)')
      .attr('opacity', 0.4)
      .style('pointer-events', 'none')

    // ── Zoom ──
    const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 3])
      .on('zoom', (event) => {
        root.attr('transform', event.transform)
      })
    svg.call(zoomBehavior)

    // Initial fit
    const graphBounds = {
      minX: Math.min(...nodes.map((n) => n.x)) - 20,
      minY: Math.min(...nodes.map((n) => n.y)) - 20,
      maxX: Math.max(...nodes.map((n) => n.x + n.width)) + 20,
      maxY: Math.max(...nodes.map((n) => n.y + n.height)) + 20,
    }
    const gw = graphBounds.maxX - graphBounds.minX
    const gh = graphBounds.maxY - graphBounds.minY
    const scale = Math.min(width / gw, height / gh, 1.2) * 0.92
    const tx = (width - gw * scale) / 2 - graphBounds.minX * scale
    const ty = (height - gh * scale) / 2 - graphBounds.minY * scale
    svg.call(zoomBehavior.transform, zoomIdentity.translate(tx, ty).scale(scale))

    // ── Build node map for quick lookup ──
    const nodeMap = new Map(nodes.map((n) => [n.id, n]))

    // ── Edges ──
    const edgesG = root.append('g').attr('class', 'edges')

    // Helper to compute source/target port pixel positions
    function srcPortPos(link: GraphLink) {
      const n = nodeMap.get(link.source)!
      const px = n.x + n.width
      const py = outputPortY(n.y, n.height, link.sourcePort, n.numOutputPorts)
      return { x: px, y: py }
    }
    function tgtPortPos(link: GraphLink) {
      const n = nodeMap.get(link.target)!
      const px = n.x
      const py = inputPortY(n.y, n.height, link.targetPort, n.numInputPorts)
      return { x: px, y: py }
    }

    // Curved link path generator
    function buildPath(link: GraphLink) {
      const s = srcPortPos(link)
      const t = tgtPortPos(link)
      const gen = linkHorizontal<unknown, { x: number; y: number }>()
        .source(() => ({ x: s.x + PORT_RADIUS, y: s.y }))
        .target(() => ({ x: t.x - PORT_RADIUS, y: t.y }))
        .x((d) => d.x)
        .y((d) => d.y)
      return gen(null as unknown) as string
    }

    function edgeStroke(link: GraphLink) {
      if (link.type === 'sidechain') return COLORS.sidechainLink
      if (link.type === 'midi') return COLORS.midiLink
      if (link.type === 'modulation') return COLORS.modulationLink
      // audio – dim the node border color
      const src = nodeMap.get(link.source)
      return src ? nodeColor(src.type) : COLORS.audioLink
    }

    function edgeWidth(link: GraphLink) {
      if (link.type === 'modulation') return 1
      if (link.type === 'sidechain') return 1.3
      if (link.type === 'midi') return 1.4
      return 2
    }

    function edgeDash(link: GraphLink) {
      if (link.type === 'sidechain') return '4 6'
      if (link.type === 'midi') return '2.5 5'
      if (link.type === 'modulation') return '2 4'
      return link.active ? '5 9' : 'none'
    }

    function edgeArrow(link: GraphLink): string {
      if (link.type === 'sidechain') return 'url(#arrow-sc)'
      if (link.type === 'midi') return 'url(#arrow-midi)'
      if (link.type === 'modulation') return 'url(#arrow-mod)'
      return 'url(#arrow-audio)'
    }

    links.forEach((link) => {
      const pathData = buildPath(link)
      if (!pathData) return

      const g = edgesG.append('g').attr('class', `edge edge-${link.type}`)

      // Main path with Tron-style glow
      const path = g
        .append('path')
        .attr('d', pathData)
        .attr('fill', 'none')
        .attr('stroke', edgeStroke(link))
        .attr('stroke-width', edgeWidth(link))
        .attr('stroke-dasharray', edgeDash(link))
        .attr('opacity', link.type === 'modulation' ? 0.6 : 0.85)
        .attr('marker-end', edgeArrow(link))
        .style('filter', 'url(#glow)')

      // Animate active audio links with energy flow
      if (link.type === 'audio' && link.active) {
        const totalLen = (path.node() as SVGPathElement)?.getTotalLength?.() ?? 200
        path
          .attr('stroke-dasharray', '8 12')
          .attr('stroke-dashoffset', totalLen)
          .style('filter', 'url(#strong-glow)')
        path
          .append('animate')
          .attr('attributeName', 'stroke-dashoffset')
          .attr('from', totalLen)
          .attr('to', 0)
          .attr('dur', '2.5s')
          .attr('repeatCount', 'indefinite')
      }

      // Latency badge for main audio connections
      if (link.type === 'audio' && link.cumulativeLatencyMs !== undefined && link.cumulativeLatencyMs > 0) {
        const s = srcPortPos(link)
        const t = tgtPortPos(link)
        const mx = s.x + (t.x - s.x) * 0.55
        const my = s.y + (t.y - s.y) * 0.55 - 14
        const addStr = `+${link.addedLatencyMs.toFixed(1)} ms`
        const totStr = `Σ ${link.cumulativeLatencyMs.toFixed(1)} ms`
        const labelTxt = link.addedLatencyMs > 0 ? `${addStr} | ${totStr}` : totStr

        g.append('rect')
          .attr('x', mx - 52)
          .attr('y', my - 9)
          .attr('width', 104)
          .attr('height', 17)
          .attr('rx', 4)
          .attr('fill', 'rgba(0,0,0,0.75)')
          .attr('stroke', edgeStroke(link))
          .attr('stroke-width', 0.5)
          .attr('opacity', 0.85)

        g.append('text')
          .attr('x', mx)
          .attr('y', my + 3)
          .attr('text-anchor', 'middle')
          .attr('fill', '#d4d4d8')
          .attr('font-size', 9.5)
          .attr('font-family', 'system-ui, Inter, sans-serif')
          .text(labelTxt)
      }

      // Labels for non-audio
      if (link.label && link.type !== 'audio') {
        const s = srcPortPos(link)
        const t = tgtPortPos(link)
        const mx = s.x + (t.x - s.x) * 0.5
        const my = s.y + (t.y - s.y) * 0.5 - 10

        g.append('text')
          .attr('x', mx)
          .attr('y', my)
          .attr('text-anchor', 'middle')
          .attr('fill', edgeStroke(link))
          .attr('font-size', 10)
          .attr('font-family', 'system-ui, Inter, sans-serif')
          .attr('opacity', 0.8)
          .text(link.label)
      }

      // Edge hover
      g.append('path')
        .attr('d', pathData)
        .attr('fill', 'none')
        .attr('stroke', 'transparent')
        .attr('stroke-width', 14)
        .style('cursor', 'pointer')
        .on('mouseenter', function (event: MouseEvent) {
          path.attr('opacity', 1).attr('stroke-width', edgeWidth(link) + 1)
          const srcN = nodeMap.get(link.source)
          const tgtN = nodeMap.get(link.target)
          const srcLabel = srcN?.outputLabels?.[link.sourcePort] ?? `Out ${link.sourcePort + 1}`
          const tgtLabel = tgtN?.inputLabels?.[link.targetPort] ?? `In ${link.targetPort + 1}`
          let tip = `${srcN?.name}:${srcLabel} → ${tgtN?.name}:${tgtLabel}\nType: ${link.type}`
          if (link.type === 'audio' && link.cumulativeLatencyMs !== undefined) {
            tip += `\nAdded: +${link.addedLatencyMs.toFixed(1)} ms\nCumulative: ${link.cumulativeLatencyMs.toFixed(1)} ms`
          }
          if (link.label) tip += `\n${link.label}`
          setTooltip({ x: event.clientX, y: event.clientY, content: tip })
        })
        .on('mouseleave', function () {
          path.attr('opacity', link.type === 'modulation' ? 0.55 : 0.7).attr('stroke-width', edgeWidth(link))
          setTooltip(null)
        })
    })

    // ── Nodes ──
    const nodesG = root.append('g').attr('class', 'nodes')

    nodes.forEach((node) => {
      const ng = nodesG.append('g').attr('class', `node node-${node.type}`).attr('transform', `translate(${node.x},${node.y})`)

      const color = nodeColor(node.type)
      const h = node.height

      // TRON-STYLE NODE with glow effect
      // Outer glow shadow (depth)
      ng.append('rect')
        .attr('width', node.width)
        .attr('height', h)
        .attr('rx', 6)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 8)
        .attr('opacity', 0.15)
        .style('filter', 'url(#glow)')

      // Main node body (dark with subtle gradient)
      ng.append('rect')
        .attr('width', node.width)
        .attr('height', h)
        .attr('rx', 6)
        .attr('fill', 'rgba(5,5,15,0.92)')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .style('filter', 'url(#glow)')

      // Inner glow highlight (top edge)
      ng.append('rect')
        .attr('width', node.width - 4)
        .attr('height', 2)
        .attr('x', 2)
        .attr('y', 2)
        .attr('rx', 1)
        .attr('fill', color)
        .attr('opacity', 0.3)

      // ── Name with enhanced styling ──
      ng.append('text')
        .attr('x', 8)
        .attr('y', 16)
        .attr('fill', color)
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('font-family', 'system-ui, -apple-system, monospace')
        .attr('letter-spacing', '0.5px')
        .style('text-shadow', `0 0 8px ${color}`)
        .text(node.name.length > 16 ? node.name.substring(0, 14) + '…' : node.name)

      // ── Status indicator with glow ──
      ng.append('circle')
        .attr('cx', node.width - 12)
        .attr('cy', 12)
        .attr('r', 5)
        .attr('fill', statusColor(node.status))
        .style('filter', 'url(#strong-glow)')

      // Status pulse animation
      ng.append('circle')
        .attr('cx', node.width - 12)
        .attr('cy', 12)
        .attr('r', 5)
        .attr('fill', 'none')
        .attr('stroke', statusColor(node.status))
        .attr('stroke-width', 2)
        .attr('opacity', 0.7)
        .append('animate')
        .attr('attributeName', 'r')
        .attr('values', '5;8;5')
        .attr('dur', '2s')
        .attr('repeatCount', 'indefinite')

      // ── Technical info with monospace styling ──
      const infoStartY = 30
      const lineH = 11
      const info: [string, string][] = [
        ['⚡ CPU', `${node.cpuPercent}%`],
        ['⏱ LAT', `${node.ownLatencyMs.toFixed(1)}ms`],
        ['◉ RATE', `${(node.sampleRate / 1000).toFixed(0)}kHz`],
      ]
      if (node.isBypassed) info.unshift(['⊘ BYPASS', 'ACTIVE'])
      if (node.preset) info.push(['⚙ PRESET', node.preset.substring(0, 12)])
      if (node.xruns > 0) info.push(['⚠ XRUNS', String(node.xruns)])

      info.forEach(([label, value], i) => {
        const yy = infoStartY + i * lineH
        ng.append('text')
          .attr('x', 8)
          .attr('y', yy)
          .attr('fill', COLORS.textDim)
          .attr('font-size', 8.5)
          .attr('font-family', 'monospace')
          .attr('letter-spacing', '0.5px')
          .text(`${label}: `)
          .append('tspan')
          .attr('fill', label.includes('CPU') ? cpuColor(node.cpuPercent) : COLORS.text)
          .attr('font-weight', 600)
          .text(value)
      })

      // ── Input ports with enhanced styling (left side) ──
      for (let p = 0; p < node.numInputPorts; p++) {
        const py = inputPortY(0, h, p, node.numInputPorts)
        const label = node.inputLabels?.[p] ?? `In ${p + 1}`
        const portG = ng.append('g').attr('transform', `translate(0,${py})`)

        // Port glow background
        portG
          .append('circle')
          .attr('r', PORT_RADIUS + 2)
          .attr('fill', color)
          .attr('opacity', 0.2)

        // Port circle
        portG
          .append('circle')
          .attr('r', PORT_RADIUS)
          .attr('fill', 'rgba(0,0,0,0.9)')
          .attr('stroke', color)
          .attr('stroke-width', 1.5)
          .style('cursor', 'pointer')

        // Port label
        portG
          .append('text')
          .attr('x', PORT_RADIUS + 4)
          .attr('y', 3)
          .attr('fill', COLORS.textDim)
          .attr('font-size', 7.5)
          .attr('font-family', 'monospace')
          .attr('font-weight', 600)
          .text(label)

        // Port interactions with glow effect
        portG
          .on('mouseenter', function (event: MouseEvent) {
            d3.select(this).select('circle').attr('fill', color).attr('r', PORT_RADIUS + 1.5).style('filter', 'url(#strong-glow)')
            const conns = links.filter((l) => l.target === node.id && l.targetPort === p)
            setTooltip({
              x: event.clientX,
              y: event.clientY,
              content: `${label} (port ${p})\n${conns.length} connection${conns.length !== 1 ? 's' : ''}`,
            })
          })
          .on('mouseleave', function () {
            d3.select(this).select('circle').attr('fill', 'rgba(0,0,0,0.9)').attr('r', PORT_RADIUS).style('filter', null)
            setTooltip(null)
          })
      }

      // ── Output ports with enhanced styling (right side) ──
      for (let p = 0; p < node.numOutputPorts; p++) {
        const py = outputPortY(0, h, p, node.numOutputPorts)
        const label = node.outputLabels?.[p] ?? `Out ${p + 1}`
        const portG = ng.append('g').attr('transform', `translate(${node.width},${py})`)

        // Port glow background
        portG
          .append('circle')
          .attr('r', PORT_RADIUS + 2)
          .attr('fill', color)
          .attr('opacity', 0.2)

        // Port circle
        portG
          .append('circle')
          .attr('r', PORT_RADIUS)
          .attr('fill', 'rgba(0,0,0,0.9)')
          .attr('stroke', color)
          .attr('stroke-width', 1.5)
          .style('cursor', 'pointer')

        // Port label (right-aligned)
        portG
          .append('text')
          .attr('x', -(PORT_RADIUS + 4))
          .attr('y', 3)
          .attr('fill', COLORS.textDim)
          .attr('font-size', 7.5)
          .attr('font-family', 'monospace')
          .attr('font-weight', 600)
          .attr('text-anchor', 'end')
          .text(label)

        // Port interactions with glow effect
        portG
          .on('mouseenter', function (event: MouseEvent) {
            d3.select(this).select('circle').attr('fill', color).attr('r', PORT_RADIUS + 1.5).style('filter', 'url(#strong-glow)')
            const conns = links.filter((l) => l.source === node.id && l.sourcePort === p)
            setTooltip({
              x: event.clientX,
              y: event.clientX,
              content: `${label} (port ${p})\n${conns.length} connection${conns.length !== 1 ? 's' : ''}`,
            })
          })
          .on('mouseleave', function () {
            d3.select(this).select('circle').attr('fill', 'rgba(0,0,0,0.9)').attr('r', PORT_RADIUS).style('filter', null)
            setTooltip(null)
          })
      }

      // ── Drag ──
      const dragBehavior = d3Drag<SVGGElement, unknown>().on('drag', function (event) {
        const newX = node.x + event.dx
        const newY = node.y + event.dy
        node.x = newX
        node.y = newY
        d3.select(this).attr('transform', `translate(${newX},${newY})`)
        // Redraw connected edges
        edgesG.selectAll('.edge').remove()
        drawEdges()
      })
      ;(ng as d3.Selection<SVGGElement, unknown, null, undefined>).call(dragBehavior)

      // ── Node hover highlight ──
      ng.on('mouseenter', function () {
        d3.select(this).select('rect').attr('stroke-width', 3.5)
        // Highlight connected edges
        edgesG.selectAll(`.edge`).attr('opacity', 0.15)
        links.forEach((l, li) => {
          if (l.source === node.id || l.target === node.id) {
            edgesG.select(`.edge:nth-child(${li + 1})`).attr('opacity', 1)
          }
        })
      }).on('mouseleave', function () {
        d3.select(this).select('rect').attr('stroke-width', 2.2)
        edgesG.selectAll(`.edge`).attr('opacity', (_, i) => {
          const l = links[i]
          return l?.type === 'modulation' ? 0.55 : 0.7
        })
      })
    })

    // Redraw edges helper (after drag)
    function drawEdges() {
      links.forEach((link) => {
        const pathData = buildPath(link)
        if (!pathData) return

        const g = edgesG.append('g').attr('class', `edge edge-${link.type}`)

        const path = g
          .append('path')
          .attr('d', pathData)
          .attr('fill', 'none')
          .attr('stroke', edgeStroke(link))
          .attr('stroke-width', edgeWidth(link))
          .attr('stroke-dasharray', edgeDash(link))
          .attr('opacity', link.type === 'modulation' ? 0.55 : 0.7)
          .attr('marker-end', edgeArrow(link))

        if (link.type === 'audio' && link.active) {
          const totalLen = (path.node() as SVGPathElement)?.getTotalLength?.() ?? 200
          path.attr('stroke-dasharray', '5 9').attr('stroke-dashoffset', totalLen)
          path
            .append('animate')
            .attr('attributeName', 'stroke-dashoffset')
            .attr('from', totalLen)
            .attr('to', 0)
            .attr('dur', '3.2s')
            .attr('repeatCount', 'indefinite')
        }

        if (link.type === 'audio' && link.cumulativeLatencyMs !== undefined && link.cumulativeLatencyMs > 0) {
          const s = srcPortPos(link)
          const t = tgtPortPos(link)
          const mx = s.x + (t.x - s.x) * 0.55
          const my = s.y + (t.y - s.y) * 0.55 - 14
          const addStr = `+${link.addedLatencyMs.toFixed(1)} ms`
          const totStr = `Σ ${link.cumulativeLatencyMs.toFixed(1)} ms`
          const labelTxt = link.addedLatencyMs > 0 ? `${addStr} | ${totStr}` : totStr

          g.append('rect')
            .attr('x', mx - 52)
            .attr('y', my - 9)
            .attr('width', 104)
            .attr('height', 17)
            .attr('rx', 4)
            .attr('fill', 'rgba(0,0,0,0.75)')
            .attr('stroke', edgeStroke(link))
            .attr('stroke-width', 0.5)
            .attr('opacity', 0.85)

          g.append('text')
            .attr('x', mx)
            .attr('y', my + 3)
            .attr('text-anchor', 'middle')
            .attr('fill', '#d4d4d8')
            .attr('font-size', 9.5)
            .attr('font-family', 'system-ui, Inter, sans-serif')
            .text(labelTxt)
        }

        if (link.label && link.type !== 'audio') {
          const s = srcPortPos(link)
          const t = tgtPortPos(link)
          const mx = s.x + (t.x - s.x) * 0.5
          const my = s.y + (t.y - s.y) * 0.5 - 10

          g.append('text')
            .attr('x', mx)
            .attr('y', my)
            .attr('text-anchor', 'middle')
            .attr('fill', edgeStroke(link))
            .attr('font-size', 10)
            .attr('font-family', 'system-ui, Inter, sans-serif')
            .attr('opacity', 0.8)
            .text(link.label)
        }

        // invisible hover target
        g.append('path')
          .attr('d', pathData)
          .attr('fill', 'none')
          .attr('stroke', 'transparent')
          .attr('stroke-width', 14)
      })
    }
  }, [graphData])

  useEffect(() => {
    let removeLoadListener: (() => void) | undefined
    const scheduleBuild = () => window.requestAnimationFrame(buildViz)

    if (typeof document === 'undefined' || document.readyState === 'complete') {
      scheduleBuild()
    } else {
      const onLoad = () => scheduleBuild()
      window.addEventListener('load', onLoad, { once: true })
      removeLoadListener = () => window.removeEventListener('load', onLoad)
    }

    const handleResize = () => buildViz()
    window.addEventListener('resize', handleResize)
    return () => {
      removeLoadListener?.()
      window.removeEventListener('resize', handleResize)
    }
  }, [buildViz, graphData])

  return (
    <div style={{ position: 'relative', marginBottom: 8 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          background: 'rgba(10,10,10,0.5)',
          borderRadius: '8px 8px 0 0',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="3" width="7" height="7" rx="1.5" stroke="#d946ef" strokeWidth="2" />
          <rect x="15" y="3" width="7" height="7" rx="1.5" stroke="#00d4ff" strokeWidth="2" />
          <rect x="2" y="14" width="7" height="7" rx="1.5" stroke="#a3e635" strokeWidth="2" />
          <rect x="15" y="14" width="7" height="7" rx="1.5" stroke="#f59e0b" strokeWidth="2" />
          <line x1="9" y1="6.5" x2="15" y2="6.5" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="2 2" />
          <line x1="9" y1="17.5" x2="15" y2="17.5" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="2 2" />
          <line x1="5.5" y1="10" x2="5.5" y2="14" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="2 2" />
        </svg>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 14, fontFamily: 'system-ui, Inter, sans-serif' }}>
          JUCE AudioProcessorGraph — Signal Flow Visualization
        </span>
        <span style={{ color: '#64748b', fontSize: 11, marginLeft: 'auto', fontFamily: 'system-ui, Inter, sans-serif' }}>
          Pan &amp; zoom • Drag nodes • Hover for details
        </span>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '4px 12px',
          background: 'rgba(10,10,10,0.4)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          flexWrap: 'wrap',
        }}
      >
        {[
          { color: COLORS.audio_io, label: 'Audio I/O', dash: '' },
          { color: COLORS.processor, label: 'Processor', dash: '' },
          { color: COLORS.output, label: 'Output', dash: '' },
          { color: COLORS.midi_io, label: 'MIDI I/O', dash: '' },
        ].map((item) => (
          <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#94a3b8' }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                border: `2px solid ${item.color}`,
                background: 'rgba(0,0,0,0.3)',
              }}
            />
            {item.label}
          </span>
        ))}
        <span style={{ color: '#333', margin: '0 4px' }}>│</span>
        {[
          { color: COLORS.audioLink, label: 'Audio', style: 'solid' },
          { color: COLORS.sidechainLink, label: 'Sidechain', style: 'dashed' },
          { color: COLORS.midiLink, label: 'MIDI', style: 'dotted' },
          { color: COLORS.modulationLink, label: 'Modulation', style: 'dotted' },
        ].map((item) => (
          <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#94a3b8' }}>
            <span
              style={{
                width: 18,
                height: 0,
                borderTop: `2px ${item.style} ${item.color}`,
              }}
            />
            {item.label}
          </span>
        ))}
      </div>

      {/* SVG container */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: 420,
          borderRadius: '0 0 8px 8px',
          overflow: 'hidden',
          background: '#000',
        }}
      />

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 14,
            top: tooltip.y + 14,
            background: 'rgba(0,0,0,0.92)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            padding: '8px 12px',
            color: '#e2e8f0',
            fontSize: 11.5,
            fontFamily: 'system-ui, Inter, monospace',
            whiteSpace: 'pre-line',
            pointerEvents: 'none',
            zIndex: 9999,
            maxWidth: 300,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  )
}

export default JuceAudioGraphViz
