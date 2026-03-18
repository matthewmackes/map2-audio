import type { NodeIdentity, NodeRole, NodeStatus, NodeSummary } from '../types/node'

export type NodeRolePresence = 'LOCAL' | 'VIEW' | 'PEER'

export const NODE_PAGE_KEYS = {
  home: 'home',
  audioEngine: 'audio-engine',
  lv2Plugins: 'lv2-plugins',
  dsp: 'dsp',
  chains: 'chains',
  midiHub: 'midi-hub',
  platform: 'nodes',
  nodes: 'nodes',
} as const

type NodeLike = Pick<NodeIdentity, 'hostname' | 'display_label'> | Pick<NodeSummary, 'hostname' | 'display_label'>

export function formatNodeDisplayName(node: NodeLike): string {
  return node.display_label ? `${node.hostname} (${node.display_label})` : node.hostname
}

export function truncateNodeHostname(hostname: string, maxLength = 14): string {
  if (hostname.length <= maxLength) {
    return hostname
  }
  return `${hostname.slice(0, Math.max(0, maxLength - 1))}…`
}

export function getNodePresence(node: NodeSummary, viewedNodeId?: string | null): NodeRolePresence {
  if (node.is_local) {
    return 'LOCAL'
  }
  if (viewedNodeId && node.node_id === viewedNodeId) {
    return 'VIEW'
  }
  if (node.is_viewed) {
    return 'VIEW'
  }
  return 'PEER'
}

export function getNodePresenceAccent(presence: NodeRolePresence): string {
  switch (presence) {
    case 'LOCAL':
      return '#0f62fe'
    case 'VIEW':
      return '#198038'
    default:
      return '#8d8d8d'
  }
}

export function getNodeRoleLabel(role: NodeRole): string {
  switch (role) {
    case 'audio_node':
      return 'Audio Node'
    case 'management_node':
      return 'Management Node'
    case 'all_in_one':
      return 'All-In-One'
    default:
      return role
  }
}

export function getNodeStatusTagType(status: NodeStatus): 'green' | 'warm-gray' | 'red' | 'gray' {
  switch (status) {
    case 'ok':
      return 'green'
    case 'warn':
      return 'warm-gray'
    case 'critical':
      return 'red'
    default:
      return 'gray'
  }
}

export function getNodeStatusLabel(status: NodeStatus): string {
  return status.toUpperCase()
}

export function buildNodeAlertMessage(node: NodeSummary): string {
  if (node.status === 'offline') {
    return 'Node unreachable'
  }
  if (!node.services.juce_engine) {
    return 'JUCE engine offline'
  }
  if (!node.services.pipewire) {
    return 'PipeWire unavailable'
  }
  if (!node.services.backend) {
    return 'Backend unavailable'
  }
  if (node.xrun_count > 0) {
    return `${node.xrun_count} xruns in last 60s`
  }
  if (node.cpu_percent > 85) {
    return `CPU at ${Math.round(node.cpu_percent)}%`
  }
  if (node.memory_percent > 90) {
    return `Memory at ${Math.round(node.memory_percent)}%`
  }
  if (node.status === 'critical') {
    return 'Critical node health state'
  }
  return 'Node health warning'
}

export function computeNodeHealthPercent(node: NodeSummary): number {
  if (node.status === 'offline') return 0
  let score = 100
  if (!node.services.backend) score -= 30
  if (!node.services.juce_engine) score -= 25
  if (!node.services.pipewire) score -= 25
  if (node.xrun_count > 0) score -= Math.min(20, node.xrun_count * 4)
  if (node.cpu_percent > 80) score -= Math.round((node.cpu_percent - 80) * 1.5)
  if (node.memory_percent > 85) score -= Math.round((node.memory_percent - 85) * 1.0)
  return Math.max(0, Math.min(100, score))
}

export function getHealthPercentTone(percent: number): 'good' | 'warn' | 'critical' {
  if (percent >= 80) return 'good'
  if (percent >= 60) return 'warn'
  return 'critical'
}

export function pageKeyFromPathname(pathname: string): string | null {
  if (pathname === '/') {
    return NODE_PAGE_KEYS.home
  }
  if (pathname.startsWith('/engine')) {
    return NODE_PAGE_KEYS.audioEngine
  }
  if (pathname.startsWith('/plugins')) {
    return NODE_PAGE_KEYS.lv2Plugins
  }
  if (pathname.startsWith('/dsp')) {
    return NODE_PAGE_KEYS.dsp
  }
  if (pathname.startsWith('/chains')) {
    return NODE_PAGE_KEYS.chains
  }
  if (pathname.startsWith('/midi-hub')) {
    return NODE_PAGE_KEYS.midiHub
  }
  if (pathname.startsWith('/platform')) {
    return NODE_PAGE_KEYS.platform
  }
  if (pathname.startsWith('/nodes')) {
    return NODE_PAGE_KEYS.nodes
  }
  return null
}
