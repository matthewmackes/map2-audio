import type { Chain, ChainPlugin } from '../../../web/src/map2/types'
import { truncateLabel } from '../utils/formatters'

const MAX_LIVE_SLOTS = 8

export interface LivePluginSlot {
  hotkey: number
  plugin: ChainPlugin | null
  primaryLabel: string
  secondaryLabel: string
  bypassed: boolean
}

function pluginIdentitySuffix(plugin: ChainPlugin): string {
  const uriTail = plugin.uri.split(/[\/#]/).filter(Boolean).pop() ?? plugin.uri
  return truncateLabel(uriTail, 18)
}

function orderPlugins(plugins: ChainPlugin[]): ChainPlugin[] {
  return [...plugins].sort((left, right) => left.position - right.position)
}

export function getActiveChain(chains: Chain[]): Chain | null {
  return chains.find((chain) => chain.is_active) ?? chains[0] ?? null
}

export function getAdjacentChain(chains: Chain[], activeChainId: number | null | undefined, offset: -1 | 1): Chain | null {
  if (chains.length < 2) {
    return null
  }

  const explicitIndex = typeof activeChainId === 'number'
    ? chains.findIndex((chain) => chain.id === activeChainId)
    : -1
  const activeIndex = explicitIndex >= 0
    ? explicitIndex
    : Math.max(chains.findIndex((chain) => chain.is_active), 0)

  return chains[(activeIndex + offset + chains.length) % chains.length] ?? null
}

export function getPluginIdentity(plugin: ChainPlugin): { primaryLabel: string; secondaryLabel: string } {
  const primaryLabel = truncateLabel(plugin.name || plugin.uri, 30)
  const secondaryParts = [
    plugin.plugin_display_type,
    plugin.format,
    pluginIdentitySuffix(plugin),
  ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)

  return {
    primaryLabel,
    secondaryLabel: truncateLabel(secondaryParts.join(' · '), 28),
  }
}

export function buildLivePluginSlots(chain: Chain | null, maxSlots = MAX_LIVE_SLOTS): LivePluginSlot[] {
  const orderedPlugins = orderPlugins(chain?.plugins ?? [])

  return Array.from({ length: maxSlots }, (_, index) => {
    const plugin = orderedPlugins[index] ?? null
    const identity = plugin ? getPluginIdentity(plugin) : null
    return {
      hotkey: index + 1,
      plugin,
      primaryLabel: identity?.primaryLabel ?? 'Empty slot',
      secondaryLabel: identity?.secondaryLabel ?? 'No plugin loaded',
      bypassed: plugin?.bypassed ?? false,
    }
  })
}

export function formatBypassEvent(chainName: string, slot: LivePluginSlot, bypassed: boolean, now = new Date()): string {
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds} ${chainName} · ${slot.hotkey} ${slot.primaryLabel} -> ${bypassed ? 'BYPASSED' : 'LIVE'}`
}

export function formatChainActivationEvent(chainName: string, now = new Date()): string {
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds} Active chain -> ${chainName}`
}
