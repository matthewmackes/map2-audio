import { useCallback, useMemo, useState, type CSSProperties, type SyntheticEvent, memo } from 'react'
import {
  Add,
  AudioConsole,
  Link,
  Meter,
  SettingsAdjust,
  VolumeDown,
  VolumeUp,
  WarningAlt,
} from '@carbon/icons-react'
import { Button, OverflowMenu, OverflowMenuItem, Tag, Tile } from '@carbon/react'
import type { AudioRoutingSelectionBinding } from '../../map2/api'
import { getCategoryConfig } from '../components/PluginCards/types'
import { getEffectIcon } from '../components/icons/effectIcons'
import type { Chain, Plugin } from '../../map2/types'
import { getDisplayPluginName } from '../../map2/displayNames'

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
  pluginMeta: Record<string, Plugin>
  selectedPluginUri: string | null
  reorderPreviewUri?: string | null
  reorderTargetUri?: string | null
  reorderPreviewDirection?: 'left' | 'right' | null
  onPluginSelect: (uri: string) => void
  onToggleBypass: (uri: string, bypassed: boolean) => void
  onDeletePlugin?: (uri: string, position: number) => void
  onReorderPlugins: (pluginUris: string[]) => void
  onAddPlugin?: () => void
  audioStatus?: JuceGridAudioInterfaceStatus
  audioOutputStatus?: JuceGridAudioInterfaceStatus
  pluginLevels?: Record<string, { in: number; out: number }>
  automationSummary?: JuceGridSignalAutomationSummary
  showEndpoints?: boolean
  onInputPortSelectClick?: () => void
  onOutputPortSelectClick?: () => void
}

export interface JuceGridSignalAutomationSummary {
  laneCountByPlugin: Record<string, number>
  armedLaneCountByPlugin: Record<string, number>
  playing: boolean
  recording: boolean
}

type EndpointSide = 'input' | 'output'
type EndpointGroupState = 'normal' | 'warning' | 'error'
type SignalGridRowDirection = 'forward' | 'reverse'
type SignalGridRowSize = 'large' | 'medium' | 'small'
type ChainPlugin = Chain['plugins'][number]

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
  kind: 'plugin' | 'add'
  plugin?: ChainPlugin
}

interface SignalGridRow {
  key: string
  direction: SignalGridRowDirection
  size: SignalGridRowSize
  slots: SignalGridSlot[]
}

const SIGNAL_GRID_ROW_CAPACITY = 6
const SIGNAL_GRID_ROW_UNITS: Record<SignalGridRowSize, number> = {
  large: 3,
  medium: 2,
  small: 1,
}

function pickSignalRowLayout(remainingSlots: number): { size: SignalGridRowSize; count: number } {
  for (const size of ['large', 'medium', 'small'] as const) {
    const maxCount = Math.floor(SIGNAL_GRID_ROW_CAPACITY / SIGNAL_GRID_ROW_UNITS[size])
    if (remainingSlots <= maxCount) {
      return { size, count: remainingSlots }
    }
  }

  return { size: 'small', count: Math.min(remainingSlots, SIGNAL_GRID_ROW_CAPACITY) }
}

function buildSignalGridRows(plugins: ChainPlugin[], includeAddSlot: boolean): SignalGridRow[] {
  const slots: SignalGridSlot[] = plugins.map((plugin) => ({
    key: `${plugin.uri}:${plugin.position}`,
    kind: 'plugin',
    plugin,
  }))

  if (includeAddSlot) {
    slots.push({
      key: 'add-effect-slot',
      kind: 'add',
    })
  }

  const rows: SignalGridRow[] = []
  let cursor = 0

  while (cursor < slots.length) {
    const remainingSlots = slots.length - cursor
    const { size, count } = pickSignalRowLayout(remainingSlots)
    const rowIndex = rows.length
    rows.push({
      key: `row-${rowIndex}`,
      direction: rowIndex % 2 === 0 ? 'forward' : 'reverse',
      size,
      slots: slots.slice(cursor, cursor + count),
    })
    cursor += count
  }

  return rows
}

function getFirstPluginInRow(row: SignalGridRow): ChainPlugin | undefined {
  return row.slots.find((slot) => slot.kind === 'plugin')?.plugin
}

function getLastPluginInRow(row: SignalGridRow): ChainPlugin | undefined {
  return [...row.slots].reverse().find((slot) => slot.kind === 'plugin')?.plugin
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

function getSignalCardEffectIcon(meta: Plugin | undefined, plugin: Chain['plugins'][number]) {
  const iconHints = [
    meta?.name,
    meta?.category,
    meta?.class_label,
    plugin.plugin_display_type,
    plugin.name,
    plugin.uri,
  ].filter((value): value is string => Boolean(value && value.trim()))

  for (const hint of iconHints) {
    const icon = getEffectIcon(hint)
    if (icon) {
      return icon
    }
  }

  return getEffectIcon('plugin')
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

function shouldRenderDashedFlow(currentPlugin: Chain['plugins'][number] | undefined, nextPlugin?: Chain['plugins'][number]) {
  return Boolean(currentPlugin?.bypassed || nextPlugin?.bypassed)
}

export const JuceGridSignalCanvas = memo(function JuceGridSignalCanvas({
  chain,
  pluginMeta,
  selectedPluginUri,
  reorderPreviewUri = null,
  reorderTargetUri = null,
  reorderPreviewDirection = null,
  onPluginSelect,
  onToggleBypass,
  onDeletePlugin,
  onReorderPlugins,
  onAddPlugin,
  audioStatus,
  audioOutputStatus,
  showEndpoints = false,
  onInputPortSelectClick,
  onOutputPortSelectClick,
}: JuceGridSignalCanvasProps) {
  const [draggedUri, setDraggedUri] = useState<string | null>(null)
  const [dragOverUri, setDragOverUri] = useState<string | null>(null)
  const signalRows = useMemo(
    () => buildSignalGridRows(chain?.plugins ?? [], Boolean(onAddPlugin)),
    [chain?.plugins, onAddPlugin],
  )

  const handleDrop = useCallback((targetUri: string) => {
    if (!chain || !draggedUri || draggedUri === targetUri) {
      setDraggedUri(null)
      setDragOverUri(null)
      return
    }

    const sourceIndex = chain.plugins.findIndex((plugin) => plugin.uri === draggedUri)
    const targetIndex = chain.plugins.findIndex((plugin) => plugin.uri === targetUri)
    if (sourceIndex < 0 || targetIndex < 0) {
      setDraggedUri(null)
      setDragOverUri(null)
      return
    }

    const next = [...chain.plugins]
    const [moved] = next.splice(sourceIndex, 1)
    next.splice(targetIndex, 0, moved)
    onReorderPlugins(next.map((plugin) => plugin.uri))
    setDraggedUri(null)
    setDragOverUri(null)
  }, [chain, draggedUri, onReorderPlugins])

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
          className={`juce-grid-page__signal-flow-bridge ${shouldRenderDashedFlow(chain.plugins[0]) ? 'is-dashed' : ''}`}
          aria-hidden
          data-testid="juce-grid-signal-flow-bridge-input"
        >
          <span className="juce-grid-page__signal-flow-bridge-label">Input</span>
          <span className="juce-grid-page__signal-flow-line" />
          <span className="juce-grid-page__signal-flow-dots">
            <span className="juce-grid-page__signal-flow-dot" />
            <span className="juce-grid-page__signal-flow-dot" />
            <span className="juce-grid-page__signal-flow-dot" />
          </span>
        </div>

        <div className="juce-grid-page__signal-grid" data-testid="juce-grid-signal-grid">
          {signalRows.map((row, rowIndex) => {
            const displaySlots = row.direction === 'reverse' ? [...row.slots].reverse() : row.slots
            const nextRow = signalRows[rowIndex + 1]
            const rowExitPlugin = getLastPluginInRow(row)
            const nextRowEntryPlugin = nextRow ? getFirstPluginInRow(nextRow) : undefined
            const verticalConnectorDashed = shouldRenderDashedFlow(rowExitPlugin, nextRowEntryPlugin)
            const verticalConnectorSide = row.direction === 'forward' ? 'right' : 'left'

            return (
              <div
                key={row.key}
                className="juce-grid-page__signal-grid-row-shell"
                data-testid={`juce-grid-signal-row-shell-${rowIndex}`}
              >
                <div
                  className={`juce-grid-page__signal-grid-row juce-grid-page__signal-grid-row--${row.size} ${row.direction === 'reverse' ? 'is-reverse' : 'is-forward'}`}
                  data-testid={`juce-grid-signal-row-${rowIndex}`}
                  data-row-size={row.size}
                  data-row-direction={row.direction}
                >
                  {displaySlots.map((slot, displayIndex) => {
                    const nextDisplaySlot = displaySlots[displayIndex + 1]
                    const leftPlugin = slot.kind === 'plugin' ? slot.plugin : undefined
                    const rightPlugin = nextDisplaySlot?.kind === 'plugin' ? nextDisplaySlot.plugin : undefined
                    const connectorDashed = shouldRenderDashedFlow(leftPlugin, rightPlugin)

                    return (
                      <div
                        key={slot.key}
                        className="juce-grid-page__signal-grid-item"
                        data-slot-kind={slot.kind}
                      >
                        {slot.kind === 'plugin' && slot.plugin ? (() => {
                          const plugin = slot.plugin
                          const meta = pluginMeta[plugin.uri]
                          const displayName = getDisplayPluginName(meta?.name || plugin.name || 'Unknown', plugin.uri)
                          const categoryConfig = getCategoryConfig(meta?.category || 'Utility')
                          const EffectIcon = getSignalCardEffectIcon(meta, plugin)
                          const isSelected = plugin.uri === selectedPluginUri
                          const isDropTarget = dragOverUri === plugin.uri && draggedUri !== plugin.uri

                          return (
                            <article
                              className={`juce-grid-page__signal-plugin-card ${isSelected ? 'is-selected' : ''} ${plugin.bypassed ? 'is-bypassed' : ''} ${isDropTarget ? 'is-drop-target' : ''} ${reorderPreviewUri === plugin.uri ? `is-reorder-preview is-reorder-preview-${reorderPreviewDirection}` : ''} ${reorderTargetUri === plugin.uri ? 'is-reorder-target' : ''}`}
                              data-testid={`juce-grid-signal-plugin-card-${plugin.position}`}
                              aria-label={`${displayName}${plugin.bypassed ? ' bypassed' : ''}`}
                              aria-pressed={isSelected}
                              role="button"
                              tabIndex={0}
                              draggable
                              onClick={() => onPluginSelect(plugin.uri)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  onPluginSelect(plugin.uri)
                                }
                              }}
                              onDragStart={() => setDraggedUri(plugin.uri)}
                              onDragOver={(event) => {
                                event.preventDefault()
                                setDragOverUri(plugin.uri)
                              }}
                              onDrop={() => handleDrop(plugin.uri)}
                              onDragEnd={() => {
                                setDraggedUri(null)
                                setDragOverUri(null)
                              }}
                              style={{ '--juce-grid-signal-accent': categoryConfig.color } as CSSProperties}
                            >
                              <div className="juce-grid-page__signal-plugin-hero" aria-hidden>
                                <EffectIcon className="juce-grid-page__signal-plugin-hero-svg" />
                              </div>

                              <div className="juce-grid-page__signal-plugin-info">
                                <div
                                  className="juce-grid-page__signal-plugin-actions"
                                  data-testid={`juce-grid-signal-plugin-actions-${plugin.position}`}
                                  onClick={stopPluginCardEvent}
                                  onMouseDown={stopPluginCardEvent}
                                  onPointerDown={stopPluginCardEvent}
                                >
                                  <OverflowMenu
                                    ariaLabel={`Actions for ${displayName}`}
                                    iconDescription={`Actions for ${displayName}`}
                                    size="sm"
                                    flipped
                                  >
                                    <OverflowMenuItem itemText="Inspect block" onClick={() => onPluginSelect(plugin.uri)} />
                                    <OverflowMenuItem
                                      itemText={plugin.bypassed ? 'Enable block' : 'Bypass block'}
                                      onClick={() => onToggleBypass(plugin.uri, !plugin.bypassed)}
                                    />
                                    {onDeletePlugin && (
                                      <OverflowMenuItem
                                        itemText="Remove block"
                                        isDelete
                                        onClick={() => onDeletePlugin(plugin.uri, plugin.position)}
                                      />
                                    )}
                                  </OverflowMenu>
                                </div>

                                <strong className="juce-grid-page__signal-plugin-title" title={displayName}>{displayName}</strong>
                              </div>
                            </article>
                          )
                        })() : (
                          <button
                            type="button"
                            className="juce-grid-page__signal-plugin-add"
                            onClick={onAddPlugin}
                            aria-label="Add effect"
                          >
                            <Add size={20} />
                            <span>Add effect</span>
                          </button>
                        )}

                        {nextDisplaySlot && (
                          <div
                            className={`juce-grid-page__signal-flow-connector ${connectorDashed ? 'is-dashed' : ''}`}
                            aria-hidden
                            data-testid={slot.kind === 'plugin' && slot.plugin ? `juce-grid-signal-flow-connector-${slot.plugin.position}` : `juce-grid-signal-flow-connector-${rowIndex}-${displayIndex}`}
                          >
                            <span className="juce-grid-page__signal-flow-line" />
                            <span className="juce-grid-page__signal-flow-dots">
                              <span className="juce-grid-page__signal-flow-dot" />
                              <span className="juce-grid-page__signal-flow-dot" />
                              <span className="juce-grid-page__signal-flow-dot" />
                            </span>
                            <span className="juce-grid-page__signal-flow-line" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {nextRow && (
                  <div
                    className={`juce-grid-page__signal-flow-vertical-connector ${verticalConnectorDashed ? 'is-dashed' : ''} ${verticalConnectorSide === 'right' ? 'is-right' : 'is-left'}`}
                    aria-hidden
                    data-testid={`juce-grid-signal-vertical-connector-${rowIndex}`}
                    data-connector-side={verticalConnectorSide}
                  >
                    <span className="juce-grid-page__signal-flow-line juce-grid-page__signal-flow-line--vertical" />
                    <span className="juce-grid-page__signal-flow-dots juce-grid-page__signal-flow-dots--vertical">
                      <span className="juce-grid-page__signal-flow-dot" />
                      <span className="juce-grid-page__signal-flow-dot" />
                      <span className="juce-grid-page__signal-flow-dot" />
                    </span>
                    <span className="juce-grid-page__signal-flow-line juce-grid-page__signal-flow-line--vertical" />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div
          className={`juce-grid-page__signal-flow-bridge ${chain.plugins.length > 0 && shouldRenderDashedFlow(chain.plugins[chain.plugins.length - 1]) ? 'is-dashed' : ''}`}
          aria-hidden
          data-testid="juce-grid-signal-flow-bridge-output"
        >
          <span className="juce-grid-page__signal-flow-dots">
            <span className="juce-grid-page__signal-flow-dot" />
            <span className="juce-grid-page__signal-flow-dot" />
            <span className="juce-grid-page__signal-flow-dot" />
          </span>
          <span className="juce-grid-page__signal-flow-line" />
          <span className="juce-grid-page__signal-flow-bridge-label">Output</span>
        </div>

        <div className="juce-grid-page__signal-status-row">
          <Tag type={chain.is_active ? 'green' : 'warm-gray'}>
            {chain.is_active ? 'Chain active' : 'Chain idle'}
          </Tag>
          <Tag type="cool-gray">
            <Meter size={14} />
            <span>{chain.plugins.length} block{chain.plugins.length === 1 ? '' : 's'}</span>
          </Tag>
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
