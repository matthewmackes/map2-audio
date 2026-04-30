import { memo, useCallback, useMemo } from 'react'
import { Tile } from '@carbon/react'

import type { AudioRoutingSelectionBinding } from '../../../map2/api'
import type { Chain, Plugin, PluginOrderRef } from '../../../map2/types'
import type { SnapshotEditorFlowAnimation, SnapshotEditorNodeShape } from '../../hooks/useSpecialSettings'
import useCPUMetrics from '../../hooks/useCPUMetrics'

import {
  UnifiedChannelGrid,
  type ChannelStripProps,
  type SelectedBlockCoord,
} from './UnifiedChannelGrid/UnifiedChannelGrid'
import { chainToUnifiedRow } from './UnifiedChannelGrid/chainToUnifiedRow'
import { useChainMeter } from './UnifiedChannelGrid/useChainMeter'

import '../shared/signalFlowAnimations.css'
import './SnapshotEditorSignalCanvas.css'

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
  onAddPlugin?: (position?: number) => void
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
  flowAnimation?: SnapshotEditorFlowAnimation
  gridBackdrop?: boolean
  nodeShape?: SnapshotEditorNodeShape
  flowLabel?: string
  flowDryWetMix?: number
  onFlowDryWetMixChange?: (value: number) => void
  flowInputClipActive?: boolean
  flowOutputClipActive?: boolean
  flowClipActive?: boolean
  onDeleteFlow?: () => void
  canDeleteFlow?: boolean
  flowControlsDisabled?: boolean
}

export interface JuceGridSignalAutomationSummary {
  laneCountByPlugin: Record<string, number>
  armedLaneCountByPlugin: Record<string, number>
  playing: boolean
  recording: boolean
}

function resolveRowId(branchId: string | null | undefined, chainId: number | string | undefined): string {
  if (branchId) return String(branchId)
  if (chainId !== undefined && chainId !== null) return String(chainId)
  return 'chain'
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
  onDeletePlugin,
  onReorderPlugins,
  onAddPlugin,
  onMuteToggle,
  onSoloToggle,
  audioStatus,
  audioOutputStatus,
  onCanvasEmptyPress,
  readOnly = false,
  flowAnimation = 'cascade',
  gridBackdrop = true,
  nodeShape = 'square',
  flowLabel,
  flowDryWetMix,
  onFlowDryWetMixChange,
  flowInputClipActive = false,
  flowOutputClipActive = false,
  flowClipActive = false,
  onDeleteFlow,
  canDeleteFlow = false,
  flowControlsDisabled = false,
}: JuceGridSignalCanvasProps) {
  const rowId = resolveRowId(branchId, chain?.id)
  const routingMode = audioStatus?.routingMode ?? audioOutputStatus?.routingMode ?? 'series'
  const sidechainLabel = routingMode === 'sidechain' ? 'KEY SEND' : null
  const cpuTelemetry = useCPUMetrics({ pollingInterval: 1000 })

  const row = useMemo(
    () =>
      chainToUnifiedRow(chain, pluginMeta, {
        rowId,
        rowName: chain?.name || (chainLabel ? `Chain ${chainLabel}` : 'Chain'),
        muted: chainMuted,
        solo: chainSoloed,
        sidechainSourceLabel: sidechainLabel,
        pluginCpuPercentByKey: cpuTelemetry.metrics.perPluginPercent,
      }),
    [chain, chainLabel, chainMuted, chainSoloed, cpuTelemetry.metrics.perPluginPercent, pluginMeta, rowId, sidechainLabel],
  )

  const rows = useMemo(() => (chain ? [row] : []), [chain, row])

  const selectedBlock: SelectedBlockCoord | null = useMemo(() => {
    if (!selectedPluginUri) return null
    const matchIdx = row.slots.findIndex(
      (slot) =>
        slot.uri === selectedPluginUri &&
        (typeof selectedPluginPosition !== 'number' || slot.index === selectedPluginPosition),
    )
    if (matchIdx < 0) return null
    return { rowId: row.id, slotIndex: matchIdx }
  }, [row, selectedPluginUri, selectedPluginPosition])

  const meter = useChainMeter(chain ? rowId : null)
  const meters = useMemo(() => ({ [rowId]: meter }), [rowId, meter])

  const channelStrips = useMemo<Record<string, ChannelStripProps> | undefined>(() => {
    if (!flowLabel) return undefined
    return {
      [rowId]: {
        flowLabel,
        identitySubtitle: chain?.name ? `Chain ${flowLabel}` : `Channel ${flowLabel}`,
        pathLabel: `Path ${flowLabel}`,
        flowDryWetMix,
        onFlowDryWetMixChange,
        flowInputClipActive,
        flowOutputClipActive,
        flowClipActive,
        onDeleteFlow,
        canDeleteFlow,
        flowControlsDisabled,
      },
    }
  }, [
    canDeleteFlow,
    chain?.name,
    flowClipActive,
    flowControlsDisabled,
    flowDryWetMix,
    flowInputClipActive,
    flowLabel,
    flowOutputClipActive,
    onDeleteFlow,
    onFlowDryWetMixChange,
    rowId,
  ])

  const handleSelectBlock = useCallback(
    (_rowId: string, slotIndex: number) => {
      const slot = row.slots[slotIndex]
      if (slot?.uri) onPluginSelect(slot.uri, slot.index)
    },
    [row, onPluginSelect],
  )

  const handleAddBlock = useCallback(
    (_rowId: string, slotIndex: number) => {
      if (readOnly) return
      onAddPlugin?.(slotIndex)
    },
    [onAddPlugin, readOnly],
  )

  const handleRemoveBlock = useCallback(
    (_rowId: string, slotIndex: number) => {
      if (readOnly) return
      const slot = row.slots[slotIndex]
      if (slot?.uri && onDeletePlugin) onDeletePlugin(slot.uri, slot.index)
    },
    [row, onDeletePlugin, readOnly],
  )

  const handleToggleMute = useCallback(() => onMuteToggle?.(), [onMuteToggle])
  const handleToggleSolo = useCallback(() => onSoloToggle?.(), [onSoloToggle])

  const handleKeyboardReorder = useCallback(
    (_rowId: string, fromIndex: number, toIndex: number) => {
      if (readOnly || !chain) return
      const fromSlot = row.slots[fromIndex]
      const toSlot = row.slots[toIndex]
      if (!fromSlot?.uri) return

      const next: PluginOrderRef[] = chain.plugins.map((p) => {
        if (p.uri === fromSlot.uri && p.position === fromSlot.index) {
          return { uri: p.uri, position: toIndex }
        }
        if (toSlot?.uri && p.uri === toSlot.uri && p.position === toSlot.index) {
          return { uri: p.uri, position: fromSlot.index }
        }
        return { uri: p.uri, position: p.position }
      })
      onReorderPlugins(next)
    },
    [chain, onReorderPlugins, readOnly, row],
  )

  if (!chain) {
    return (
      <div
        className="snapshot-editor-signal-canvas"
        data-flow={flowAnimation}
        data-grid-backdrop={gridBackdrop ? 'true' : 'false'}
        data-node-shape={nodeShape}
      >
        <Tile className="snapshot-chain-row__empty" onClick={onCanvasEmptyPress}>
          <strong>Select a chain to view and edit</strong>
          <span>Choose or assign a chain to populate the signal grid.</span>
        </Tile>
      </div>
    )
  }

  return (
    <div
      className="snapshot-editor-signal-canvas"
      data-flow={flowAnimation}
      data-grid-backdrop={gridBackdrop ? 'true' : 'false'}
      data-node-shape={nodeShape}
      data-testid="snapshot-signal-canvas"
    >
      <UnifiedChannelGrid
        rows={rows}
        selectedBlock={selectedBlock}
        meters={meters}
        channelStrips={channelStrips}
        onSelectBlock={handleSelectBlock}
        onAddBlock={handleAddBlock}
        onRemoveBlock={readOnly ? undefined : handleRemoveBlock}
        onReorderBlock={handleKeyboardReorder}
        onToggleMute={handleToggleMute}
        onToggleSolo={handleToggleSolo}
      />
    </div>
  )
})

export default JuceGridSignalCanvas
