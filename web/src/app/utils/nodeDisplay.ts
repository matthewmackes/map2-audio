import { canonicalizeNavigationRoute } from '../data/advancedMenuItems'
import type { NodeIdentity, NodeRole, NodeStatus, NodeSummary } from '../types/node'

export type NodeRolePresence = 'LOCAL' | 'VIEW' | 'PEER'

export const NODE_PAGE_KEYS = {
  home: 'home',
  audioEngine: 'audio-engine',
  lv2Plugins: 'lv2-plugins',
  chains: 'chains',
  midiHub: 'midi-hub',
  labs: 'labs',
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

/**
 * Map NodeStatus to the MAP2 StatusChip tone vocabulary (canonical primitives,
 * T2474 B4). Use in new code that consumes <StatusChip />; legacy call sites
 * keep using getNodeStatusTagType() against Carbon Tag until migrated.
 */
export function getNodeStatusChipTone(
  status: NodeStatus,
): 'ok' | 'caution' | 'critical' | 'offline' {
  switch (status) {
    case 'ok':
      return 'ok'
    case 'warn':
      return 'caution'
    case 'critical':
      return 'critical'
    default:
      return 'offline'
  }
}

/**
 * Map NodeStatus to the MAP2 DeviceNodeCard health vocabulary.
 */
export function getNodeHealthForCard(
  status: NodeStatus,
): 'ok' | 'caution' | 'critical' | 'offline' {
  return getNodeStatusChipTone(status)
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
  const canonicalPathname = canonicalizeNavigationRoute(pathname)

  if (canonicalPathname === '/') {
    return NODE_PAGE_KEYS.home
  }
  if (canonicalPathname.startsWith('/engine')) {
    return NODE_PAGE_KEYS.audioEngine
  }
  // Nav reorg 2026-05-03 (second pass) — both legacy `/workspace` and
  // canonical `/node-ops` map to the platform page key.
  if (
    canonicalPathname === '/workspace'
    || canonicalPathname.startsWith('/workspace/')
    || canonicalPathname === '/node-ops'
    || canonicalPathname.startsWith('/node-ops/')
  ) {
    return NODE_PAGE_KEYS.platform
  }
  if (canonicalPathname.startsWith('/plugins')) {
    return NODE_PAGE_KEYS.lv2Plugins
  }
  if (canonicalPathname.startsWith('/chains')) {
    return NODE_PAGE_KEYS.chains
  }
  if (canonicalPathname.startsWith('/midi-hub')) {
    return NODE_PAGE_KEYS.midiHub
  }
  if (canonicalPathname.startsWith('/platform')) {
    return NODE_PAGE_KEYS.platform
  }
  if (canonicalPathname.startsWith('/platforms')) {
    return NODE_PAGE_KEYS.platform
  }
  if (canonicalPathname.startsWith('/labs')) {
    return NODE_PAGE_KEYS.labs
  }
  if (canonicalPathname.startsWith('/nodes')) {
    return NODE_PAGE_KEYS.nodes
  }
  return null
}
