import { memo, useMemo } from 'react'
import { Tile } from '@carbon/react'

import type { AudioRoutingSelectionBinding } from '../../../map2/api'
import type { Chain, Plugin, PluginOrderRef } from '../../../map2/types'
import { getDisplayPluginName } from '../../../map2/displayNames'
import { pluginCategoryIcon } from '../shared/pluginCategoryIcon'
import { getSystemBlockBadgeLabel } from '../../utils/snapshotSystemBlocks'
import { ChainRow, type ChainRowPlugin } from './SignalCanvas/ChainRow'
import { SignalCanvasIconSprite } from './SignalCanvas/icons'

import './SignalCanvas/SignalCanvas.css'

export interface JuceGridAudioInterfaceStatus {
  deviceName?: string
  sampleRate?: number
  bufferSize?: number
  channels?: number
  isRunning?: boolean
  selectedPorts?: number[]
  selectedAvbEndpoints?: string[]
  totalPorts?: number
  routingMode?: 'parallel_blend' | 'ab_switch' | 'series' | 'parameter_morph' | 'sidechain'
  chainActive?: boolean
  chainName?: string
  bindings?: AudioRoutingSelectionBinding[]
  avbReadinessState?: string
  meterLevels?: number[]
}

export interface JuceGridSignalCanvasProps {
  chain: Chain | null
  branchId?: string | null
  chainLabel?: string
  chainMuted?: boolean
  chainSoloed?: boolean
  pluginMeta: Record<string, Plugin>
  selectedPluginUri: string | null
  selectedPluginPosition?: number | null
  reorderPreviewUri?: string | null
  reorderPreviewPosition?: number | null
  reorderTargetUri?: string | null
  reorderTargetPosition?: number | null
  reorderPreviewDirection?: 'left' | 'right' | null
  onPluginSelect: (uri: string, position: number) => void
  onToggleBypass: (uri: string, bypassed: boolean, position: number) => void
  onDeletePlugin?: (uri: string, position: number) => void
  onReorderPlugins: (pluginOrder: PluginOrderRef[]) => void
  onAddPlugin?: () => void
  onRenameChain?: () => void
  onDuplicateChain?: () => void
  onToggleChainActive?: () => void
  onDeleteChain?: () => void
  onAssignChain?: () => void
  onMuteToggle?: () => void
  onSoloToggle?: () => void
  showAddPluginSlot?: boolean
  audioStatus?: JuceGridAudioInterfaceStatus
  audioOutputStatus?: JuceGridAudioInterfaceStatus
  pluginLevels?: Record<string, { in: number; out: number }>
  automationSummary?: JuceGridSignalAutomationSummary
  showEndpoints?: boolean
  onInputPortSelectClick?: () => void
  onOutputPortSelectClick?: () => void
  tabletMode?: boolean
  focusedBranchId?: string | null
  currentBranchPage?: number
  onBranchPageChange?: (branchId: string, nextPage: number) => void
  onCanvasEmptyPress?: () => void
  readOnly?: boolean
}

export interface JuceGridSignalAutomationSummary {
  laneCountByPlugin: Record<string, number>
  armedLaneCountByPlugin: Record<string, number>
  playing: boolean
  recording: boolean
}

const ROUTING_MODE_LABELS: Record<NonNullable<JuceGridAudioInterfaceStatus['routingMode']>, string> = {
  parallel_blend: 'PARALLEL',
  ab_switch: 'A/B',
  series: 'SERIES',
  parameter_morph: 'MORPH',
  sidechain: 'SIDECHAIN',
}

function resolveChainLabel(branchId: string | null | undefined, explicitLabel: string | undefined): string {
  if (explicitLabel?.trim()) {
    return explicitLabel.trim().slice(0, 2).toUpperCase()
  }

  const match = String(branchId ?? '').match(/[a-z0-9]+$/i)?.[0]
  return match ? match.slice(0, 1).toUpperCase() : 'A'
}

function resolvePluginCpu(plugin: Chain['plugins'][number]): number {
  const raw = plugin.cpu_percent
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return 0
  }
  return Math.max(0, Math.min(1, raw > 1 ? raw / 100 : raw))
}

function buildCanvasPlugins(
  chain: Chain,
  pluginMeta: Record<string, Plugin>,
  pluginLevels: Record<string, { in: number; out: number }> | undefined,
  selectedPluginUri: string | null,
  selectedPluginPosition: number | null | undefined,
): ChainRowPlugin[] {
  return chain.plugins.map((plugin) => {
    const meta = pluginMeta[plugin.uri]
    const categoryLabel = meta?.category || meta?.class_label || plugin.plugin_display_type || 'Utility'
    const displayName = getDisplayPluginName(meta?.name || plugin.name || 'Unknown', plugin.uri)
    const levels = pluginLevels?.[`${plugin.uri}:${plugin.position}`] ?? pluginLevels?.[plugin.uri]
    const cpuLoad = Math.max(resolvePluginCpu(plugin), levels ? Math.max(levels.in, levels.out) * 0.15 : 0)
    const selected = plugin.uri === selectedPluginUri
      && (typeof selectedPluginPosition !== 'number' || plugin.position === selectedPluginPosition)

    return {
      uri: plugin.uri,
      position: plugin.position,
      label: displayName,
      categoryLabel,
      iconId: pluginCategoryIcon(`${categoryLabel} ${plugin.name} ${plugin.uri}`),
      bypassed: plugin.bypassed,
      selected,
      cpuLoad,
      systemBlockBadge: getSystemBlockBadgeLabel(plugin),
    }
  })
}

export const JuceGridSignalCanvas = memo(function JuceGridSignalCanvas({
  chain,
  branchId = null,
  chainLabel,
  chainMuted = false,
  chainSoloed = false,
  pluginMeta,
  selectedPluginUri,
  selectedPluginPosition = null,
  onPluginSelect,
  onToggleBypass,
  onDeletePlugin,
  onAddPlugin,
  onRenameChain,
  onDuplicateChain,
  onToggleChainActive,
  onDeleteChain,
  onAssignChain,
  onMuteToggle,
  onSoloToggle,
  showAddPluginSlot,
  audioStatus,
  audioOutputStatus,
  pluginLevels,
  focusedBranchId = null,
  onCanvasEmptyPress,
  readOnly = false,
}: JuceGridSignalCanvasProps) {
  const label = resolveChainLabel(branchId, chainLabel)
  const routingMode = audioStatus?.routingMode ?? audioOutputStatus?.routingMode ?? 'series'
  const routingLabel = ROUTING_MODE_LABELS[routingMode] ?? 'SERIES'
  const outputLevels = audioOutputStatus?.meterLevels ?? audioStatus?.meterLevels ?? []
  const active = Boolean(chain?.is_active || audioStatus?.chainActive || focusedBranchId === branchId)
  const plugins = useMemo(
    () => chain ? buildCanvasPlugins(chain, pluginMeta, pluginLevels, selectedPluginUri, selectedPluginPosition) : [],
    [chain, pluginLevels, pluginMeta, selectedPluginPosition, selectedPluginUri],
  )

  if (!chain) {
    return (
      <div className="snapshot-editor-signal-canvas" data-flow="cascade" data-grid-backdrop="true" data-node-shape="square">
        <SignalCanvasIconSprite />
        <Tile className="snapshot-chain-row__empty" onClick={onCanvasEmptyPress}>
          <strong>Select a chain to view and edit</strong>
          <span>Choose or assign a chain to populate the signal grid.</span>
        </Tile>
      </div>
    )
  }

  return (
    <div className="snapshot-editor-signal-canvas" data-flow="cascade" data-grid-backdrop="true" data-node-shape="square">
      <SignalCanvasIconSprite />
      <ChainRow
        chainLabel={label}
        chainName={chain.name || `Chain ${label}`}
        active={active}
        assigned
        readOnly={readOnly}
        muted={chainMuted}
        soloed={chainSoloed}
        branchCount={Math.max(1, plugins.length > 2 ? 2 : 1)}
        routingLabel={routingLabel}
        sendLabel={routingMode === 'sidechain' ? 'KEY SEND' : 'NO SEND'}
        plugins={plugins}
        addEnabled={(showAddPluginSlot ?? Boolean(onAddPlugin)) && !readOnly}
        meterLeft={outputLevels[0] ?? 0}
        meterRight={outputLevels[1] ?? outputLevels[0] ?? 0}
        meterStale={!audioStatus?.isRunning && !audioOutputStatus?.isRunning}
        onPluginSelect={(plugin) => onPluginSelect(plugin.uri, plugin.position)}
        onToggleBypass={(plugin) => onToggleBypass(plugin.uri, !plugin.bypassed, plugin.position)}
        onDeletePlugin={onDeletePlugin ? (plugin) => onDeletePlugin(plugin.uri, plugin.position) : undefined}
        onAddPlugin={onAddPlugin}
        onRenameChain={onRenameChain}
        onDuplicateChain={onDuplicateChain}
        onToggleChainActive={onToggleChainActive}
        onDeleteChain={onDeleteChain}
        onAssignChain={onAssignChain}
        onMuteToggle={onMuteToggle}
        onSoloToggle={onSoloToggle}
      />
    </div>
  )
})

export default JuceGridSignalCanvas
