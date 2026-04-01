import { useCallback, useMemo, useState, type CSSProperties, type SyntheticEvent, memo } from 'react'
import {
  Add,
  AudioConsole,
  ArrowRight,
  Link,
  SettingsAdjust,
  VolumeDown,
  VolumeUp,
  WarningAlt,
} from '@carbon/icons-react'
import { Button, Tile } from '@carbon/react'
import type { AudioRoutingSelectionBinding } from '../../../map2/api'
import { getEffectIconSpec, type EffectIconSpec } from '../icons/effectIcons'
import type { Chain, Plugin, PluginOrderRef } from '../../../map2/types'
import { getDisplayPluginName } from '../../../map2/displayNames'
import { buildPluginOrderRef, samePluginIdentity } from '../../../map2/utils/pluginIdentity'
import { getPluginAccentConfig } from '../../utils/pluginAccent'

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

type EndpointSide = 'input' | 'output'
type EndpointGroupState = 'normal' | 'warning' | 'error'
type SignalGridTerminalRole = 'input' | 'output'
type ChainPlugin = Chain['plugins'][number]
type DraggedPluginRef = PluginOrderRef | null

interface EndpointRailSlot {
  id: string
  label: string
  detail: string
  meterLevel: number
  available: boolean
  warning: boolean
}

interface EndpointRailGroup {
  key: 'local' | 'avb'
  heading: string
  summary: string
  info: string
  slots: EndpointRailSlot[]
  state: EndpointGroupState
}

interface SignalGridSlot {
  key: string
  kind: 'plugin' | 'add' | 'terminal'
  plugin?: ChainPlugin
  terminalRole?: SignalGridTerminalRole
  terminalHeading?: string
  terminalCaption?: string
  terminalTitle?: string
}

interface SignalGridRow {
  key: string
  slots: SignalGridSlot[]
}

const NERD_GLYPH_CLOSE = '\uEA76'

function buildSignalGridRows(
  plugins: ChainPlugin[],
  includeAddSlot: boolean,
  routingMode?: JuceGridAudioInterfaceStatus['routingMode'],
): SignalGridRow[] {
  const outputHeading = routingMode === 'parallel_blend' ? 'SUM' : 'OUT'
  const outputCaption = routingMode === 'parallel_blend' ? 'Merge bus' : 'Output'
  const outputTitle = routingMode === 'parallel_blend'
    ? 'Parallel branches are summed into the output bus.'
    : 'Signal leaves the chain at the output stage.'

  const slots: SignalGridSlot[] = [
    {
      key: 'signal-terminal-input',
      kind: 'terminal',
      terminalRole: 'input',
      terminalHeading: 'IN',
      terminalCaption: 'Input',
      terminalTitle: 'Signal enters the chain here.',
    },
    ...plugins.map((plugin) => ({
      key: `${plugin.uri}:${plugin.position}`,
      kind: 'plugin' as const,
      plugin,
    })),
  ]

  if (includeAddSlot) {
    slots.push({
      key: 'add-effect-slot',
      kind: 'add',
    })
  }

  slots.push({
    key: 'signal-terminal-output',
    kind: 'terminal',
    terminalRole: 'output',
    terminalHeading: outputHeading,
    terminalCaption: outputCaption,
    terminalTitle: outputTitle,
  })

  return [{
    key: 'row-0',
    slots,
  }]
}

const ROUTING_MODE_SHORT_LABELS: Record<NonNullable<JuceGridAudioInterfaceStatus['routingMode']>, string> = {
  parallel_blend: 'MIX',
  ab_switch: 'A/B',
  series: 'SER',
  parameter_morph: 'MOR',
  sidechain: 'S/C',
}

function levelPercent(level: number | undefined) {
  return `${Math.max(0, Math.min(100, (level || 0) * 100))}%`
}

function getSignalCardEffectIcon(meta: Plugin | undefined, plugin: Chain['plugins'][number]): EffectIconSpec {
  const iconHints = [
    meta?.name,
    meta?.category,
    meta?.class_label,
    plugin.plugin_display_type,
    plugin.name,
    plugin.uri,
  ].filter((value): value is string => Boolean(value && value.trim()))

  let fallbackSpec: EffectIconSpec | null = null

  for (const hint of iconHints) {
    const iconSpec = getEffectIconSpec(hint)
    if (iconSpec.matched) {
      return iconSpec
    }

    fallbackSpec ??= iconSpec
  }

  return fallbackSpec ?? getEffectIconSpec('plugin')
}

function isHealthyAvbState(state: string | undefined) {
  if (!state) {
    return false
  }

  return ['operational', 'ready', 'locked'].includes(state.toLowerCase())
}

function getMeterLevel(levels: number[] | undefined, index: number) {
  if (!levels || levels.length === 0) {
    return 0
  }

  return levels[index % levels.length] ?? 0
}

function buildFallbackBindings(status?: JuceGridAudioInterfaceStatus): AudioRoutingSelectionBinding[] {
  if (!status) {
    return []
  }

  const localBindings = (status.selectedPorts ?? []).map<AudioRoutingSelectionBinding>((index) => ({
    selection_type: 'local_port',
    available: true,
    index,
    name: `Port ${index + 1}`,
    source: status.deviceName,
  }))

  const avbBindings = (status.selectedAvbEndpoints ?? []).map<AudioRoutingSelectionBinding>((endpointId) => ({
    selection_type: 'avb_endpoint',
    available: true,
    endpoint_id: endpointId,
    device_name: endpointId,
    host: status.deviceName,
    channels: 1,
    sample_rate: status.sampleRate,
  }))

  return [...localBindings, ...avbBindings]
}

function buildEndpointRailGroups(
  side: EndpointSide,
  status?: JuceGridAudioInterfaceStatus,
): EndpointRailGroup[] {
  const bindings = status?.bindings?.length ? status.bindings : buildFallbackBindings(status)
  const directionLabel = side === 'input' ? 'in' : 'out'

  const localBindings = bindings.filter((binding) => binding.selection_type === 'local_port')
  const localSlots = localBindings.map<EndpointRailSlot>((binding, index) => {
    const portIndex = binding.index ?? index
    const portName = binding.name || `Port ${portIndex + 1}`

    return {
      id: `local-${portIndex}`,
      label: String(portIndex + 1),
      detail: `${portName}\nLocal ${side} port ${portIndex + 1}${binding.available ? '' : '\nUnavailable'}`,
      meterLevel: getMeterLevel(status?.meterLevels, index),
      available: binding.available,
      warning: !binding.available,
    }
  })

  let avbSlotOffset = localSlots.length
  const avbBindings = bindings.filter((binding) => binding.selection_type === 'avb_endpoint')
  const avbSlots = avbBindings.flatMap<EndpointRailSlot>((binding, endpointIndex) => {
    const channelCount = Math.max(1, binding.channels || 1)
    const endpointName = binding.device_name || binding.endpoint_id || `AVB ${endpointIndex + 1}`
    const endpointHost = binding.host ? ` @ ${binding.host}` : ''
    const endpointDirection = binding.direction === 'listener' ? 'Listener' : 'Talker'

    const slots = Array.from({ length: channelCount }, (_, channelIndex) => ({
      id: `avb-${binding.endpoint_id || endpointIndex}-${channelIndex}`,
      label: String(channelIndex + 1),
      detail: [
        endpointName,
        `${endpointDirection}${endpointHost}`,
        `Channel ${channelIndex + 1}/${channelCount}`,
        `${binding.sample_rate || status?.sampleRate || 48000}Hz`,
        binding.missing ? 'Missing retained endpoint' : binding.available ? 'Available' : 'Unavailable',
      ].join('\n'),
      meterLevel: getMeterLevel(status?.meterLevels, avbSlotOffset + channelIndex),
      available: binding.available,
      warning: Boolean(binding.missing || !binding.available),
    }))

    avbSlotOffset += channelCount
    return slots
  })

  const avbInfo = avbBindings.length === 0
    ? 'No AVB routes assigned'
    : avbBindings.map((binding) => {
      const endpointName = binding.device_name || binding.endpoint_id || 'AVB endpoint'
      const endpointHost = binding.host ? ` @ ${binding.host}` : ''
      const endpointState = binding.missing ? 'missing' : binding.available ? 'available' : 'offline'
      return `${endpointName}${endpointHost} · ${binding.channels || 1}ch · ${endpointState}`
    }).join('\n')

  const hasAvbError = avbBindings.some((binding) => binding.missing || !binding.available)
  const hasAvbWarning = avbBindings.length > 0 && !hasAvbError && !isHealthyAvbState(status?.avbReadinessState)

  return [
    {
      key: 'local',
      heading: 'LOCAL',
      summary: `${localSlots.length} ${directionLabel}`,
      info: localSlots.length === 0 ? 'No local routes assigned' : localSlots.map((slot) => slot.detail).join('\n\n'),
      slots: localSlots,
      state: localSlots.some((slot) => !slot.available) ? 'warning' : 'normal',
    },
    {
      key: 'avb',
      heading: 'AVB',
      summary: `${avbSlots.length} ${directionLabel}`,
      info: avbInfo,
      slots: avbSlots,
      state: hasAvbError ? 'error' : hasAvbWarning ? 'warning' : 'normal',
    },
  ]
}

function buildRailTooltip(
  side: EndpointSide,
  status: JuceGridAudioInterfaceStatus | undefined,
  groups: EndpointRailGroup[],
) {
  const directionLabel = side === 'input' ? 'Input' : 'Output'
  const routingMode = status?.routingMode ? ROUTING_MODE_SHORT_LABELS[status.routingMode] || status.routingMode : 'n/a'
  const sections = [
    `${directionLabel}: ${status?.deviceName || 'Audio interface'}`,
    `State: ${status?.isRunning ? 'Running' : 'Stopped'}`,
    `Clock: ${status?.sampleRate || 48000}Hz / ${status?.bufferSize || 256} smp`,
    `Routing: ${routingMode}`,
    `Assigned: ${groups.reduce((sum, group) => sum + group.slots.length, 0)} ${side === 'input' ? 'in' : 'out'}`,
  ]

  if (status?.avbReadinessState) {
    sections.push(`AVB: ${status.avbReadinessState}`)
  }

  groups.forEach((group) => {
    sections.push(`${group.heading}: ${group.info}`)
  })

  return sections.join('\n')
}

export const JuceGridSignalCanvas = memo(function JuceGridSignalCanvas({
  chain,
  branchId = null,
  pluginMeta,
  selectedPluginUri,
  selectedPluginPosition = null,
  reorderPreviewUri = null,
  reorderPreviewPosition = null,
  reorderTargetUri = null,
  reorderTargetPosition = null,
  reorderPreviewDirection = null,
  onPluginSelect,
  onDeletePlugin,
  onReorderPlugins,
  onAddPlugin,
  showAddPluginSlot,
  audioStatus,
  audioOutputStatus,
  showEndpoints = false,
  onInputPortSelectClick,
  onOutputPortSelectClick,
  tabletMode = false,
  focusedBranchId = null,
  currentBranchPage = 0,
  onBranchPageChange,
  onCanvasEmptyPress,
  readOnly = false,
}: JuceGridSignalCanvasProps) {
  const [draggedPlugin, setDraggedPlugin] = useState<DraggedPluginRef>(null)
  const [dragOverPlugin, setDragOverPlugin] = useState<DraggedPluginRef>(null)
  const signalRows = useMemo(
    () => buildSignalGridRows(
      chain?.plugins ?? [],
      (showAddPluginSlot ?? Boolean(onAddPlugin)) && !readOnly,
      audioStatus?.routingMode ?? audioOutputStatus?.routingMode,
    ),
    [audioOutputStatus?.routingMode, audioStatus?.routingMode, chain?.plugins, onAddPlugin, readOnly, showAddPluginSlot],
  )

  const isSelectedPlugin = useCallback((plugin: ChainPlugin | undefined) => {
    if (!plugin || !selectedPluginUri) {
      return false
    }
    if (plugin.uri !== selectedPluginUri) {
      return false
    }
    if (typeof selectedPluginPosition === 'number') {
      return plugin.position === selectedPluginPosition
    }
    return true
  }, [selectedPluginPosition, selectedPluginUri])

  const handleDrop = useCallback((targetPlugin: ChainPlugin) => {
    if (readOnly || !chain || !draggedPlugin || samePluginIdentity(draggedPlugin, targetPlugin)) {
      setDraggedPlugin(null)
      setDragOverPlugin(null)
      return
    }

    const sourceIndex = chain.plugins.findIndex((plugin) => samePluginIdentity(plugin, draggedPlugin))
    const targetIndex = chain.plugins.findIndex((plugin) => samePluginIdentity(plugin, targetPlugin))
    if (sourceIndex < 0 || targetIndex < 0) {
      setDraggedPlugin(null)
      setDragOverPlugin(null)
      return
    }

    const next = [...chain.plugins]
    const [moved] = next.splice(sourceIndex, 1)
    next.splice(targetIndex, 0, moved)
    onReorderPlugins(next.map((plugin) => buildPluginOrderRef(plugin)))
    setDraggedPlugin(null)
    setDragOverPlugin(null)
  }, [chain, draggedPlugin, onReorderPlugins, readOnly])

  const stopPluginCardEvent = useCallback((event: SyntheticEvent) => {
    event.stopPropagation()
  }, [])

  if (!chain) {
    return (
      <div className="juce-grid-page__signal-canvas">
        <Tile className="juce-grid-page__signal-empty">
          <div className="juce-grid-page__signal-endpoint-copy">
            <strong>Select a chain to view and edit</strong>
            <p>Choose or assign a chain to populate the signal grid.</p>
          </div>
        </Tile>
      </div>
    )
  }

  const renderEndpointRail = (
    side: EndpointSide,
    status: JuceGridAudioInterfaceStatus | undefined,
    onSelectPorts?: () => void,
  ) => {
    const groups = buildEndpointRailGroups(side, status)
    const selectedChannelCount = groups.reduce((sum, group) => sum + group.slots.length, 0)
    const hasAvbAssignments = groups[1].slots.length > 0
    const railLabel = hasAvbAssignments
      ? side === 'input' ? 'AVB IN' : 'AVB OUT'
      : side === 'input' ? 'INPUT' : 'OUTPUT'
    const railTooltip = buildRailTooltip(side, status, groups)
    const routingMode = status?.routingMode ? ROUTING_MODE_SHORT_LABELS[status.routingMode] : 'n/a'

    return (
      <Tile
        className={`juce-grid-page__signal-endpoint juce-grid-page__signal-endpoint--${side} ${hasAvbAssignments ? 'has-avb' : ''} ${groups[1].state === 'warning' ? 'has-avb-warning' : ''} ${groups[1].state === 'error' ? 'has-avb-error' : ''}`}
        title={railTooltip}
        data-testid={`juce-grid-signal-rail-${side}`}
      >
        <div className="juce-grid-page__signal-rail-label-strip" title={railTooltip}>
          <span className="juce-grid-page__signal-rail-label">{railLabel}</span>
        </div>

        <div className="juce-grid-page__signal-rail-body">
          <div className="juce-grid-page__signal-rail-top">
            <div className="juce-grid-page__signal-rail-icons" title={railTooltip}>
              {side === 'input' ? <VolumeDown size={20} /> : <VolumeUp size={20} />}
              <AudioConsole size={18} />
            </div>

            {onSelectPorts && (
              <Button
                size="sm"
                kind="ghost"
                hasIconOnly
                renderIcon={SettingsAdjust}
                iconDescription={`Configure ${side} routing`}
                onClick={onSelectPorts}
                className="juce-grid-page__signal-rail-config"
                disabled={readOnly}
              />
            )}
          </div>

          <div className="juce-grid-page__signal-rail-chip-grid">
            <span className={`juce-grid-page__signal-rail-chip ${status?.isRunning ? 'is-live' : ''}`}>
              {status?.isRunning ? 'RUN' : 'STOP'}
            </span>
            <span className="juce-grid-page__signal-rail-chip">
              {selectedChannelCount}{side === 'input' ? 'I' : 'O'}
            </span>
            <span className="juce-grid-page__signal-rail-chip">{Math.round((status?.sampleRate || 48000) / 1000)}K</span>
            <span className="juce-grid-page__signal-rail-chip">{status?.bufferSize || 256}</span>
            <span className="juce-grid-page__signal-rail-chip juce-grid-page__signal-rail-chip--wide">{routingMode}</span>
          </div>

          <div className="juce-grid-page__signal-rail-groups">
            {groups.map((group) => (
              <section
                key={`${side}-${group.key}`}
                className={`juce-grid-page__signal-rail-group is-${group.key} is-${group.state}`}
                title={group.info}
              >
                <div className="juce-grid-page__signal-rail-group-header">
                  <span className="juce-grid-page__signal-rail-group-icon" aria-hidden>
                    {group.key === 'local' ? <AudioConsole size={14} /> : <Link size={14} />}
                  </span>
                  <span className="juce-grid-page__signal-rail-group-heading">{group.heading}</span>
                  <span className="juce-grid-page__signal-rail-group-summary">{group.summary}</span>
                  {group.key === 'avb' && group.state !== 'normal' && (
                    <WarningAlt
                      size={14}
                      aria-label="AVB warning"
                      className="juce-grid-page__signal-rail-group-warning"
                    />
                  )}
                </div>

                <div className="juce-grid-page__signal-rail-slot-stack">
                  {group.slots.length > 0 ? group.slots.map((slot) => (
                    <div
                      key={slot.id}
                      className={`juce-grid-page__signal-rail-slot ${slot.warning ? 'is-warning' : ''} ${!slot.available ? 'is-unavailable' : ''}`}
                      title={slot.detail}
                    >
                      <span className="juce-grid-page__signal-rail-slot-meter">
                        <span
                          className="juce-grid-page__signal-rail-slot-fill"
                          style={{ height: levelPercent(slot.meterLevel) }}
                        />
                      </span>
                      <span className="juce-grid-page__signal-rail-slot-label">{slot.label}</span>
                    </div>
                  )) : (
                    <div className="juce-grid-page__signal-rail-empty-slot">None</div>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      </Tile>
    )
  }

  return (
    <div className="juce-grid-page__signal-canvas">
      {showEndpoints && (
        <div className="juce-grid-page__signal-endpoints juce-grid-page__signal-endpoints--input">
          {renderEndpointRail('input', audioStatus, onInputPortSelectClick)}
        </div>
      )}

      <div className="juce-grid-page__signal-path">
        <div
          className={`juce-grid-page__signal-grid ${selectedPluginUri ? 'has-active-card' : ''} ${tabletMode ? 'is-tablet-mode' : ''} ${focusedBranchId && branchId === focusedBranchId ? 'is-focused-branch' : ''}`}
          data-testid="juce-grid-signal-grid"
          onClick={() => {
            if (tabletMode) {
              onCanvasEmptyPress?.()
            }
          }}
        >
          {signalRows.map((row, rowIndex) => {
            const displaySlots = row.slots

            return (
              <div
                key={row.key}
                className="juce-grid-page__signal-grid-row-shell"
                data-testid={`juce-grid-signal-row-shell-${rowIndex}`}
              >
                <div
                  className="juce-grid-page__signal-grid-row is-forward"
                  data-testid={`juce-grid-signal-row-${rowIndex}`}
                  data-row-direction="forward"
                >
                  {displaySlots.map((slot) => {
                    const slotSelected = slot.kind === 'plugin' && isSelectedPlugin(slot.plugin)
                    const isDimmed = Boolean(selectedPluginUri) && !slotSelected

                    return (
                      <div
                        key={slot.key}
                        className={`juce-grid-page__signal-grid-item ${isDimmed ? 'is-dimmed' : ''}`}
                        data-slot-kind={slot.kind}
                      >
                        {slot.kind === 'terminal' ? (
                          <div
                            className={`juce-grid-page__signal-terminal juce-grid-page__signal-terminal--${slot.terminalRole}`}
                            data-testid={`juce-grid-signal-terminal-${slot.terminalRole}`}
                            data-terminal-role={slot.terminalRole}
                            title={slot.terminalTitle}
                            aria-label={`${slot.terminalCaption} node`}
                          >
                            <span className="juce-grid-page__signal-terminal-glyph" aria-hidden>
                              {slot.terminalRole === 'input'
                                ? <VolumeDown size={18} />
                                : slot.terminalHeading === 'SUM'
                                  ? <Link size={18} />
                                  : <VolumeUp size={18} />}
                            </span>
                            <span className="juce-grid-page__signal-terminal-copy">
                              <span className="juce-grid-page__signal-terminal-heading">{slot.terminalHeading}</span>
                              <span className="juce-grid-page__signal-terminal-caption">{slot.terminalCaption}</span>
                            </span>
                            <span className="juce-grid-page__signal-terminal-arrow" aria-hidden>
                              <ArrowRight size={16} />
                            </span>
                          </div>
                        ) : slot.kind === 'plugin' && slot.plugin ? (() => {
                          const plugin = slot.plugin
                          const meta = pluginMeta[plugin.uri]
                          const displayName = getDisplayPluginName(meta?.name || plugin.name || 'Unknown', plugin.uri)
                          const categoryLabel = meta?.category || 'Utility'
                          const categoryConfig = getPluginAccentConfig(plugin.uri, categoryLabel)
                          const effectIcon = getSignalCardEffectIcon(meta, plugin)
                          const EffectIcon = effectIcon.component
                          const isSelected = isSelectedPlugin(plugin)
                          const isDropTarget = Boolean(
                            dragOverPlugin
                            && samePluginIdentity(dragOverPlugin, plugin)
                            && !samePluginIdentity(draggedPlugin, plugin),
                          )
                          const isReorderPreview = Boolean(
                            reorderPreviewUri
                            && typeof reorderPreviewPosition === 'number'
                            && plugin.uri === reorderPreviewUri
                            && plugin.position === reorderPreviewPosition,
                          )
                          const isReorderTarget = Boolean(
                            reorderTargetUri
                            && typeof reorderTargetPosition === 'number'
                            && plugin.uri === reorderTargetUri
                            && plugin.position === reorderTargetPosition,
                          )

                          return (
                            <article
                              className={`juce-grid-page__signal-plugin-card ${isSelected ? 'is-selected' : ''} ${plugin.bypassed ? 'is-bypassed' : ''} ${isDropTarget ? 'is-drop-target' : ''} ${isReorderPreview ? `is-reorder-preview is-reorder-preview-${reorderPreviewDirection}` : ''} ${isReorderTarget ? 'is-reorder-target' : ''}`}
                              data-testid={`juce-grid-signal-plugin-card-${plugin.position}`}
                              aria-label={`${displayName}, ${categoryLabel}${plugin.bypassed ? ', bypassed' : ''}`}
                              aria-pressed={isSelected}
                              role="button"
                              tabIndex={0}
                              draggable={!tabletMode && !readOnly}
                              onClick={(event) => {
                                event.stopPropagation()
                                onPluginSelect(plugin.uri, plugin.position)
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  onPluginSelect(plugin.uri, plugin.position)
                                }
                              }}
                              onDragStart={() => {
                                if (tabletMode || readOnly) {
                                  return
                                }
                                setDraggedPlugin(buildPluginOrderRef(plugin))
                              }}
                              onDragOver={(event) => {
                                if (tabletMode || readOnly) {
                                  return
                                }
                                event.preventDefault()
                                setDragOverPlugin(buildPluginOrderRef(plugin))
                              }}
                              onDrop={() => {
                                if (tabletMode || readOnly) {
                                  return
                                }
                                handleDrop(plugin)
                              }}
                              onDragEnd={() => {
                                setDraggedPlugin(null)
                                setDragOverPlugin(null)
                              }}
                              style={{ '--juce-grid-signal-accent': categoryConfig.color } as CSSProperties}
                            >
                              <div className="juce-grid-page__signal-plugin-face">
                                {isSelected && onDeletePlugin && !readOnly && (
                                  <div
                                    className="juce-grid-page__signal-plugin-actions"
                                    data-testid={`juce-grid-signal-plugin-actions-${plugin.position}`}
                                    onClick={stopPluginCardEvent}
                                    onMouseDown={stopPluginCardEvent}
                                    onPointerDown={stopPluginCardEvent}
                                  >
                                    <button
                                      type="button"
                                      className="juce-grid-page__signal-plugin-delete"
                                      data-testid={`juce-grid-signal-plugin-delete-${plugin.position}`}
                                      aria-label={`Remove ${displayName} from chain`}
                                      onClick={() => onDeletePlugin(plugin.uri, plugin.position)}
                                    >
                                      <span className="juce-grid-page__signal-plugin-delete-glyph" aria-hidden>
                                        {NERD_GLYPH_CLOSE}
                                      </span>
                                    </button>
                                  </div>
                                )}

                                <div className="juce-grid-page__signal-plugin-hero" aria-hidden>
                                  <div
                                    className="juce-grid-page__signal-plugin-hero-image"
                                    data-icon-tone={effectIcon.tone}
                                  >
                                    <EffectIcon className={`juce-grid-page__signal-plugin-hero-svg is-${effectIcon.tone}`} />
                                  </div>
                                </div>

                                <div className="juce-grid-page__signal-plugin-copy">
                                  <h3 className="juce-grid-page__signal-plugin-title" title={displayName}>{displayName}</h3>
                                  <span className="cds--visually-hidden">{categoryLabel}</span>
                                </div>
                              </div>
                            </article>
                          )
                        })() : (
                          <button
                            type="button"
                            className="juce-grid-page__signal-plugin-add"
                            onClick={(event) => {
                              event.stopPropagation()
                              onAddPlugin?.()
                            }}
                            aria-label="Add effect"
                            disabled={readOnly}
                          >
                            <span className="juce-grid-page__signal-plugin-add-hero" aria-hidden>
                              <Add size={40} />
                            </span>
                            <span className="juce-grid-page__signal-plugin-add-band">Add effect</span>
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showEndpoints && (
        <div className="juce-grid-page__signal-endpoints juce-grid-page__signal-endpoints--output">
          {renderEndpointRail('output', audioOutputStatus || audioStatus, onOutputPortSelectClick)}
        </div>
      )}
    </div>
  )
})

export default JuceGridSignalCanvas
