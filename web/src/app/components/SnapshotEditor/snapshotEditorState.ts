import type { RoutingMode, SnapshotDetail, SnapshotRouting } from '../../../map2/types'

export interface SnapshotEditorChannelState {
  id: string
  chainId: number | null
  label: string
  color: string
  muted: boolean
  solo: boolean
  dryWetMix: number
}

export interface SnapshotEditorRoutingState {
  mode: RoutingMode
  activeChannelKey: string | null
  blendPositions: Record<string, number>
  morphPosition: number
  morphSourceChannelKey: string | null
  morphTargetChannelKey: string | null
  seriesOrder: string[]
}

export interface SnapshotEditorHydratedState {
  channels: SnapshotEditorChannelState[]
  routing: SnapshotEditorRoutingState
  activeChannelIndex: number
}

export interface SnapshotEditorChannelPaletteEntry {
  label: string
  color: string
}

export interface SnapshotEditorNormalizationOptions {
  palette: SnapshotEditorChannelPaletteEntry[]
  defaultCount: number
  maxChannels: number
}

const ROUTING_MODES = new Set<RoutingMode>(['parallel_blend', 'series', 'morph', 'sidechain'])
const DEFAULT_CHANNEL_COLOR = '#2563eb'
const DEFAULT_DRY_WET_MIX = 100

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function fallbackLabelForIndex(index: number): string {
  return String.fromCharCode(65 + index)
}

function getPaletteEntry(
  palette: SnapshotEditorChannelPaletteEntry[],
  index: number,
): SnapshotEditorChannelPaletteEntry {
  return palette[index] ?? {
    label: fallbackLabelForIndex(index),
    color: DEFAULT_CHANNEL_COLOR,
  }
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    if (value === 'true') {
      return true
    }
    if (value === 'false') {
      return false
    }
  }
  if (typeof value === 'number') {
    if (value === 1) {
      return true
    }
    if (value === 0) {
      return false
    }
  }
  return fallback
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function normalizePercent(value: unknown, fallback: number): number {
  const parsed = normalizeNumber(value)
  if (parsed === null) {
    return fallback
  }
  return clamp(Math.round(parsed), 0, 100)
}

function normalizeUnitInterval(value: unknown, fallback: number): number {
  const parsed = normalizeNumber(value)
  if (parsed === null) {
    return fallback
  }
  return clamp(parsed, 0, 1)
}

function normalizeChainId(value: unknown): number | null {
  const parsed = normalizeNumber(value)
  if (parsed === null || !Number.isInteger(parsed) || parsed <= 0) {
    return null
  }
  return parsed
}

function createDefaultChannel(
  index: number,
  palette: SnapshotEditorChannelPaletteEntry[],
): SnapshotEditorChannelState {
  const paletteEntry = getPaletteEntry(palette, index)
  return {
    id: `channel-${index}`,
    chainId: null,
    label: paletteEntry.label,
    color: paletteEntry.color,
    muted: false,
    solo: false,
    dryWetMix: DEFAULT_DRY_WET_MIX,
  }
}

function resolveUniqueChannelKey(
  value: unknown,
  fallback: string,
  seenIds: Set<string>,
): string {
  let candidate = normalizeString(value, fallback)
  if (!seenIds.has(candidate)) {
    seenIds.add(candidate)
    return candidate
  }

  if (!seenIds.has(fallback)) {
    seenIds.add(fallback)
    return fallback
  }

  let suffix = 1
  while (seenIds.has(`${fallback}-${suffix}`)) {
    suffix += 1
  }
  candidate = `${fallback}-${suffix}`
  seenIds.add(candidate)
  return candidate
}

function normalizeRoutingMode(value: unknown): RoutingMode {
  if (value === 'parameter_morph') {
    return 'morph'
  }
  return typeof value === 'string' && ROUTING_MODES.has(value as RoutingMode)
    ? value as RoutingMode
    : 'parallel_blend'
}

function normalizeOptionalChannelKey(
  value: unknown,
  validIds: Set<string>,
): string | null {
  return typeof value === 'string' && validIds.has(value) ? value : null
}

function normalizeBlendPositions(
  value: unknown,
  validIds: Set<string>,
): Record<string, number> {
  const positions: Record<string, number> = {}
  if (!isRecord(value)) {
    return positions
  }

  for (const [channelKey, rawValue] of Object.entries(value)) {
    if (!validIds.has(channelKey)) {
      continue
    }
    positions[channelKey] = normalizePercent(rawValue, DEFAULT_DRY_WET_MIX)
  }

  return positions
}

function normalizeSeriesOrder(
  value: unknown,
  channels: SnapshotEditorChannelState[],
): string[] {
  const validIds = new Set(channels.map((channel) => channel.id))
  const seenIds = new Set<string>()
  const orderedIds: string[] = []

  if (Array.isArray(value)) {
    for (const rawId of value) {
      if (typeof rawId !== 'string' || !validIds.has(rawId) || seenIds.has(rawId)) {
        continue
      }
      seenIds.add(rawId)
      orderedIds.push(rawId)
    }
  }

  for (const channel of channels) {
    if (seenIds.has(channel.id)) {
      continue
    }
    seenIds.add(channel.id)
    orderedIds.push(channel.id)
  }

  return orderedIds
}

export function createDefaultSnapshotEditorChannels(
  palette: SnapshotEditorChannelPaletteEntry[],
  count: number,
): SnapshotEditorChannelState[] {
  return Array.from({ length: count }, (_, index) => createDefaultChannel(index, palette))
}

export function createDefaultSnapshotEditorRouting(): SnapshotEditorRoutingState {
  return {
    mode: 'parallel_blend',
    activeChannelKey: 'channel-0',
    blendPositions: {},
    morphPosition: 0.5,
    morphSourceChannelKey: null,
    morphTargetChannelKey: null,
    seriesOrder: [],
  }
}

export function normalizeSnapshotEditorChannels(
  value: unknown,
  options: SnapshotEditorNormalizationOptions,
): SnapshotEditorChannelState[] {
  const sourceChannels = Array.isArray(value) ? value : []
  const normalizedCount = sourceChannels.length > 0
    ? clamp(sourceChannels.length, 1, options.maxChannels)
    : options.defaultCount
  const seenIds = new Set<string>()

  return Array.from({ length: normalizedCount }, (_, index) => {
    const fallback = createDefaultChannel(index, options.palette)
    const source = sourceChannels[index]

    if (!isRecord(source)) {
      return {
        ...fallback,
        id: resolveUniqueChannelKey(undefined, fallback.id, seenIds),
      }
    }

    const paletteEntry = getPaletteEntry(options.palette, index)

    return {
      id: resolveUniqueChannelKey(
        source.channel_key ?? source.id ?? source.channelKey,
        fallback.id,
        seenIds,
      ),
      chainId: normalizeChainId(source.chain_id ?? source.chainId),
      label: normalizeString(source.label, paletteEntry.label),
      color: normalizeString(source.color, paletteEntry.color),
      muted: normalizeBoolean(source.muted, false),
      solo: normalizeBoolean(source.solo, false),
      dryWetMix: normalizePercent(source.dry_wet_mix ?? source.dryWetMix, DEFAULT_DRY_WET_MIX),
    }
  })
}

export function normalizeSnapshotEditorRouting(
  value: unknown,
  channels: SnapshotEditorChannelState[],
): SnapshotEditorRoutingState {
  const defaults = createDefaultSnapshotEditorRouting()
  const source = isRecord(value) ? value : {}
  const validIds = new Set(channels.map((channel) => channel.id))
  const firstChannelKey = channels[0]?.id ?? defaults.activeChannelKey

  return {
    mode: normalizeRoutingMode(source.mode),
    activeChannelKey: normalizeOptionalChannelKey(
      source.active_channel_key ?? source.activeChannelKey ?? source.activeSlotId,
      validIds,
    ) ?? firstChannelKey,
    blendPositions: normalizeBlendPositions(source.blend_positions ?? source.blendPositions, validIds),
    morphPosition: normalizeUnitInterval(
      source.morph_position ?? source.morphPosition ?? source.morphProgress,
      defaults.morphPosition,
    ),
    morphSourceChannelKey: normalizeOptionalChannelKey(
      source.morph_source_channel_key ?? source.morphSourceChannelKey ?? source.morphSourceSlotId,
      validIds,
    ),
    morphTargetChannelKey: normalizeOptionalChannelKey(
      source.morph_target_channel_key ?? source.morphTargetChannelKey ?? source.morphTargetSlotId,
      validIds,
    ),
    seriesOrder: normalizeSeriesOrder(source.series_order ?? source.seriesOrder, channels),
  }
}

export function normalizeSnapshotEditorActiveChannelIndex(
  value: unknown,
  channels: SnapshotEditorChannelState[],
): number {
  const parsed = normalizeNumber(value)
  if (parsed === null || !Number.isInteger(parsed)) {
    return 0
  }
  return clamp(parsed, 0, Math.max(channels.length - 1, 0))
}

export function normalizeSnapshotEditorStateSources(
  channelsSource: unknown,
  routingSource: unknown,
  activeIndexSource: unknown,
  options: SnapshotEditorNormalizationOptions,
): SnapshotEditorHydratedState {
  const channels = normalizeSnapshotEditorChannels(channelsSource, options)
  return {
    channels,
    routing: normalizeSnapshotEditorRouting(routingSource, channels),
    activeChannelIndex: normalizeSnapshotEditorActiveChannelIndex(activeIndexSource, channels),
  }
}

export function snapshotDetailToEditorState(
  snapshot: Pick<SnapshotDetail, 'channels' | 'paths' | 'routing' | 'active_channel_index'>,
  options: SnapshotEditorNormalizationOptions,
): SnapshotEditorHydratedState {
  const snapshotPaths = Array.isArray(snapshot.paths) ? snapshot.paths : []
  const channelsSource = snapshotPaths.length > 0
    ? snapshotPaths.map((path) => ({
      channel_key: path.id,
      chain_id: path.runtime_chain_id ?? path.snapshot_chain_id,
      label: path.label,
      color: path.color,
      muted: path.muted,
      solo: path.solo,
      dry_wet_mix: path.dry_wet_mix,
      order_index: path.order_index,
    }))
    : snapshot.channels
  return normalizeSnapshotEditorStateSources(
    channelsSource,
    snapshot.routing,
    snapshot.active_channel_index,
    options,
  )
}

export function snapshotEditorStateToRouting(
  routing: SnapshotEditorRoutingState,
): SnapshotRouting {
  return {
    mode: routing.mode,
    active_channel_key: routing.activeChannelKey,
    blend_positions: { ...routing.blendPositions },
    morph_position: routing.morphPosition,
    morph_source_channel_key: routing.morphSourceChannelKey,
    morph_target_channel_key: routing.morphTargetChannelKey,
    series_order: [...routing.seriesOrder],
  }
}

export function snapshotEditorStateToDetailPayload(
  state: SnapshotEditorHydratedState,
  base?: Partial<SnapshotDetail>,
): Pick<SnapshotDetail, 'paths' | 'channels' | 'chains' | 'routing' | 'midi_map' | 'controls'> {
  const baseChains = base?.chains ?? []
  const basePathsById = new Map((base?.paths ?? []).map((path) => [path.id, path] as const))
  const snapshotChainIdByRuntimeId = new Map<number, number>()
  let nextSyntheticSnapshotChainId = Math.max(
    0,
    ...baseChains.map((chain) => chain.id ?? 0),
    ...(base?.paths ?? []).map((path) => path.snapshot_chain_id ?? 0),
  )

  state.channels.forEach((channel) => {
    if (channel.chainId === null) {
      return
    }
    const basePath = basePathsById.get(channel.id)
    const preservedSnapshotChainId = basePath?.runtime_chain_id === channel.chainId
      ? basePath.snapshot_chain_id
      : (
        basePath?.runtime_chain_id === null && basePath?.snapshot_chain_id === channel.chainId
          ? basePath.snapshot_chain_id
          : null
      )
    if (preservedSnapshotChainId !== null && preservedSnapshotChainId !== undefined) {
      snapshotChainIdByRuntimeId.set(channel.chainId, preservedSnapshotChainId)
      nextSyntheticSnapshotChainId = Math.max(nextSyntheticSnapshotChainId, preservedSnapshotChainId)
      return
    }
    if (!snapshotChainIdByRuntimeId.has(channel.chainId)) {
      nextSyntheticSnapshotChainId += 1
      snapshotChainIdByRuntimeId.set(channel.chainId, nextSyntheticSnapshotChainId)
    }
  })

  const chains = baseChains.map((chain) => {
    const sourceRuntimeChainId = state.channels.find((channel) => (
      channel.chainId !== null && (
        chain.id === channel.chainId
        || basePathsById.get(channel.id)?.snapshot_chain_id === chain.id
      )
    ))?.chainId ?? null
    const nextId = sourceRuntimeChainId !== null
      ? (snapshotChainIdByRuntimeId.get(sourceRuntimeChainId) ?? null)
      : chain.id ?? null

    return {
      ...chain,
      id: nextId,
    }
  })

  const channels = state.channels.map((channel, index) => ({
    id: base?.channels?.[index]?.id ?? null,
    snapshot_id: base?.id ?? null,
    channel_key: channel.id,
    label: channel.label,
    color: channel.color,
    muted: channel.muted,
    solo: channel.solo,
    dry_wet_mix: channel.dryWetMix,
    order_index: index,
    chain_id: channel.chainId !== null
      ? (snapshotChainIdByRuntimeId.get(channel.chainId) ?? null)
      : null,
  }))

  return {
    paths: state.channels.map((channel, index) => {
      const basePath = basePathsById.get(channel.id)
      const snapshotChainId = channel.chainId !== null
        ? (snapshotChainIdByRuntimeId.get(channel.chainId) ?? null)
        : null
      const sourceChain = channel.chainId !== null
        ? baseChains.find((chain) => (
          chain.id === channel.chainId
          || basePath?.snapshot_chain_id === chain.id
        ))
        : undefined

      return {
        id: channel.id,
        name: sourceChain?.name ?? basePath?.name ?? `Path ${channel.label}`,
        label: channel.label,
        color: channel.color,
        muted: channel.muted,
        solo: channel.solo,
        dry_wet_mix: channel.dryWetMix,
        order_index: index,
        snapshot_chain_id: snapshotChainId,
        runtime_chain_id: null,
        plugins: sourceChain?.plugins ?? [],
        loop_insertions: sourceChain?.loop_insertions ?? [],
        effects_loops: sourceChain?.effects_loops ?? [],
      }
    }),
    channels,
    chains,
    routing: snapshotEditorStateToRouting(state.routing),
    midi_map: base?.midi_map ?? [],
    controls: base?.controls ?? {
      midi_map: base?.midi_map ?? [],
      automation_lanes: [],
      expression_mappings: [],
      maschine_encoder_map: {
        enc1: null,
        enc2: null,
        enc3: null,
        enc4: null,
        enc5: null,
        enc6: null,
        enc7: null,
        enc8: null,
        vol: { fixed: true, label: 'Master Gain' },
        tempo: { fixed: true, label: 'MIDI Clock BPM' },
        swing: { label: 'Swing' },
      },
    },
  }
}

export function snapshotEditorStateToDetail(
  state: SnapshotEditorHydratedState,
  base?: Partial<SnapshotDetail>,
): SnapshotDetail {
  const payload = snapshotEditorStateToDetailPayload(state, base)
  return {
    id: base?.id ?? 0,
    name: base?.name ?? 'Unsaved Snapshot',
    description: base?.description ?? '',
    tags: base?.tags ?? [],
    program_number: base?.program_number ?? null,
    input_device: base?.input_device ?? null,
    output_device: base?.output_device ?? null,
    is_favorite: base?.is_favorite ?? false,
    display_order: base?.display_order ?? 0,
    channels: payload.channels,
    chains: payload.chains,
    paths: payload.paths,
    routing: payload.routing,
    midi_map: payload.midi_map,
    io_bindings: base?.io_bindings ?? {
      input_device: base?.input_device ?? null,
      output_device: base?.output_device ?? null,
      remap_required: false,
    },
    controls: payload.controls,
    assets: base?.assets ?? [],
    live_state: base?.live_state ?? {
      is_live: false,
      paths: [],
      runtime_chains: [],
    },
    lineage: base?.lineage ?? {
      derived_from_snapshot_id: null,
    },
    active_channel_index: state.activeChannelIndex,
    channel_count: payload.channels.length,
    chain_count: payload.chains.length,
    community_uuid: base?.community_uuid ?? null,
    community_shared: base?.community_shared ?? false,
    community_author: base?.community_author ?? null,
    community_download_count: base?.community_download_count ?? 0,
    community_rating: base?.community_rating ?? null,
    community_rating_count: base?.community_rating_count ?? 0,
    created_at: base?.created_at ?? null,
    updated_at: base?.updated_at ?? null,
    deployments: base?.deployments ?? [],
  }
}
