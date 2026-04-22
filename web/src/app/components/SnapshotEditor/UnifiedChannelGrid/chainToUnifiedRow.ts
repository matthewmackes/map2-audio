import type { Chain, Plugin } from '../../../../map2/types'
import { getDisplayPluginName } from '../../../../map2/displayNames'
import { getPluginIdentityKeyFromParts } from '../../../../map2/utils/pluginIdentity'
import { getSystemBlockBadgeLabel } from '../../../utils/snapshotSystemBlocks'
import type { MAP2Category } from '../categoryHues'

import {
  SLOT_COUNT,
  makeEmptySlot,
  type BlockKind,
  type UnifiedChannelRow,
  type UnifiedSlot,
} from './gridConstants'

const CATEGORY_TO_KIND: Record<string, BlockKind> = {
  EQ: 'eq',
  Dynamics: 'dynamics',
  Utility: 'utility',
  Cabinet: 'cabinet-ir',
  Reverb: 'reverb-ir',
}

function resolveCategory(raw: string | null | undefined): MAP2Category | null {
  if (!raw) return null
  const key = raw.trim()
  if (!key) return null
  const knownCategories: MAP2Category[] = [
    'Amplifier', 'Cabinet', 'EQ', 'Dynamics', 'Modulation', 'Delay', 'Reverb',
    'Distortion', 'Utility', 'Instrument', 'Drums', 'Pitch', 'Multi-Effect',
    'Effects', 'AVB',
  ]
  if (knownCategories.includes(key as MAP2Category)) return key as MAP2Category
  const ci = knownCategories.find((c) => c.toLowerCase() === key.toLowerCase())
  return ci ?? null
}

function resolveKind(uri: string, category: MAP2Category | null): BlockKind {
  if (/nam$/i.test(uri) || /\/nam\//i.test(uri)) return 'nam'
  if (category && CATEGORY_TO_KIND[category]) return CATEGORY_TO_KIND[category]
  return 'plugin'
}

function normalizeCpuPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, value)
}

function resolveCpuPercent(
  plugin: Chain['plugins'][number],
  pluginCpuPercentByKey: Record<string, number> | undefined,
): number {
  const instanceId = typeof plugin.instance_id === 'number' && Number.isFinite(plugin.instance_id)
    ? plugin.instance_id
    : null
  const keys = [
    instanceId != null ? String(instanceId) : null,
    getPluginIdentityKeyFromParts(plugin.uri, plugin.position, instanceId),
    getPluginIdentityKeyFromParts(plugin.uri, plugin.position, null),
    plugin.uri,
  ].filter((key): key is string => Boolean(key))

  for (const key of keys) {
    const cpu = normalizeCpuPercent(pluginCpuPercentByKey?.[key])
    if (cpu != null) return cpu
  }

  return normalizeCpuPercent(plugin.cpu_percent) ?? 0
}

export interface ChainToUnifiedRowOptions {
  rowId?: string
  rowName?: string
  ioLabel?: string
  muted?: boolean
  solo?: boolean
  stereo?: boolean
  sidechainSourceLabel?: string | null
  pluginCpuPercentByKey?: Record<string, number>
}

/**
 * Adapt a snapshot Chain → a single UnifiedChannelRow for UnifiedChannelGrid.
 * Plugins are placed into slots by `position` (clamped to SLOT_COUNT). Unoccupied
 * slots remain empty so operators can click-to-add. Slots beyond SLOT_COUNT
 * overflow the last slot and are dropped — schema permits only 8 active inserts
 * per channel and the backend validator enforces this separately.
 */
export function chainToUnifiedRow(
  chain: Chain | null | undefined,
  pluginMeta: Record<string, Plugin>,
  options: ChainToUnifiedRowOptions = {},
): UnifiedChannelRow {
  const rowId = options.rowId ?? (chain ? String(chain.id) : 'empty')
  const rowName = options.rowName ?? (chain?.name ?? 'Chain')
  const slots: UnifiedSlot[] = Array.from({ length: SLOT_COUNT }, (_, i) => makeEmptySlot(i))

  if (chain) {
    for (const plugin of chain.plugins) {
      const slotIndex = Math.max(0, Math.min(SLOT_COUNT - 1, plugin.position))
      if (slots[slotIndex].kind) continue // keep first occupant for duplicate positions

      const meta = pluginMeta[plugin.uri]
      const rawCategory = meta?.category || meta?.class_label || plugin.plugin_display_type || null
      const category = resolveCategory(rawCategory)
      const kind = resolveKind(plugin.uri, category)
      const displayName = getDisplayPluginName(meta?.name || plugin.name || 'Unknown', plugin.uri)
      const systemLabel = getSystemBlockBadgeLabel(plugin)

      slots[slotIndex] = {
        index: slotIndex,
        kind,
        uri: plugin.uri,
        label: systemLabel ? `${systemLabel} ${displayName}` : displayName,
        category,
        bypass: Boolean(plugin.bypassed),
        sidechainSourceLabel: options.sidechainSourceLabel ?? null,
        cpuPercent: resolveCpuPercent(plugin, options.pluginCpuPercentByKey),
      }
    }
  }

  return {
    id: rowId,
    name: rowName,
    ioLabel: options.ioLabel ?? '',
    muted: Boolean(options.muted),
    solo: Boolean(options.solo),
    stereo: Boolean(options.stereo),
    slots,
  }
}
