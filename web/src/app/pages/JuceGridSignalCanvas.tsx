import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type SyntheticEvent, memo } from 'react'
import {
  Add,
  AudioConsole,
  Link,
  SettingsAdjust,
  VolumeDown,
  VolumeUp,
  WarningAlt,
} from '@carbon/icons-react'
import { Button, OverflowMenu, OverflowMenuItem, Tag, Tile } from '@carbon/react'
import type { AudioRoutingSelectionBinding } from '../../map2/api'
import { getCategoryConfig } from '../components/PluginCards/types'
import { getEffectIconSpec, type EffectIconSpec } from '../components/icons/effectIcons'
import type { Chain, Plugin, PluginOrderRef } from '../../map2/types'
import { getDisplayPluginName } from '../../map2/displayNames'
import { buildPluginOrderRef, samePluginIdentity } from '../../map2/utils/pluginIdentity'

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
  kind: 'plugin' | 'add'
  plugin?: ChainPlugin
}

interface SignalGridRow {
  key: string
  direction: SignalGridRowDirection
  slots: SignalGridSlot[]
}

const SIGNAL_GRID_CARD_MIN_WIDTH_REM = 9.75
const SIGNAL_GRID_CARD_GAP_REM = 1
const SIGNAL_GRID_ROW_MIN_CAPACITY = 1
const TABLET_BRANCH_PAGE_SIZE = 8
const TABLET_BRANCH_ROW_CAPACITY = 4
const SIGNAL_GRID_SLOT_SELECTOR = ".juce-grid-page__signal-grid-item[data-slot-kind='plugin'], .juce-grid-page__signal-grid-item[data-slot-kind='add']"

function getSignalGridFallbackMetrics() {
  const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16
  return {
    cardWidth: rootFontSize * SIGNAL_GRID_CARD_MIN_WIDTH_REM,
    gapWidth: rootFontSize * SIGNAL_GRID_CARD_GAP_REM,
  }
}

function getSignalGridSlotMetrics(node: HTMLDivElement) {
  const fallback = getSignalGridFallbackMetrics()
  const firstSlot = node.querySelector<HTMLElement>(SIGNAL_GRID_SLOT_SELECTOR)
  const row = node.querySelector<HTMLElement>('.juce-grid-page__signal-grid-row')
  const measuredCardWidth = firstSlot?.getBoundingClientRect().width ?? 0

  let measuredGapWidth = 0
  if (row) {
    const rowStyles = window.getComputedStyle(row)
    const gapCandidate = Number.parseFloat(rowStyles.columnGap || rowStyles.gap || '')
    if (Number.isFinite(gapCandidate) && gapCandidate > 0) {
      measuredGapWidth = gapCandidate
    }
  }

  return {
    cardWidth: measuredCardWidth > 0 ? measuredCardWidth : fallback.cardWidth,
    gapWidth: measuredGapWidth > 0 ? measuredGapWidth : fallback.gapWidth,
  }
}

function measureSignalGridRowCapacity(node: HTMLDivElement) {
  const availableWidth = node.clientWidth

  if (availableWidth <= 0) {
    return null
  }

  const { cardWidth, gapWidth } = getSignalGridSlotMetrics(node)
  const slotWidth = cardWidth + gapWidth

  return Math.max(
    SIGNAL_GRID_ROW_MIN_CAPACITY,
    Math.floor((availableWidth + gapWidth) / slotWidth),
  )
}

function buildSignalGridRows(
  plugins: ChainPlugin[],
  includeAddSlot: boolean,
  rowCapacity: number,
  alternateDirections = true,
): SignalGridRow[] {
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
    const rowIndex = rows.length
    const count = Math.max(SIGNAL_GRID_ROW_MIN_CAPACITY, rowCapacity)
    rows.push({
      key: `row-${rowIndex}`,
      direction: alternateDirections && rowIndex % 2 === 1 ? 'reverse' : 'forward',
      slots: slots.slice(cursor, cursor + count),
    })
    cursor += count
  }

  return rows
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
  onToggleBypass,
  onDeletePlugin,
  onReorderPlugins,
  onAddPlugin,
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
}: JuceGridSignalCanvasProps) {
  const [draggedPlugin, setDraggedPlugin] = useState<DraggedPluginRef>(null)
  const [dragOverPlugin, setDragOverPlugin] = useState<DraggedPluginRef>(null)
  const [rowCapacity, setRowCapacity] = useState(4)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = gridRef.current
    if (!node) {
      return
    }

    const updateCapacity = () => {
      const nextCapacity = measureSignalGridRowCapacity(node)
      if (!nextCapacity) {
        return
      }
      setRowCapacity((current) => (current === nextCapacity ? current : nextCapacity))
    }

    let frameId: number | null = null
    const scheduleCapacityUpdate = () => {
      if (typeof window.requestAnimationFrame !== 'function') {
        updateCapacity()
        return
      }

      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null
        updateCapacity()
      })
    }

    scheduleCapacityUpdate()
    window.addEventListener('resize', scheduleCapacityUpdate)

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(scheduleCapacityUpdate)
      observer.observe(node)
    }

    return () => {
      if (frameId !== null && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(frameId)
      }
      window.removeEventListener('resize', scheduleCapacityUpdate)
      observer?.disconnect()
    }
  }, [chain?.id])

  const totalTabletPages = tabletMode
    ? Math.max(1, Math.ceil((chain?.plugins.length ?? 0) / TABLET_BRANCH_PAGE_SIZE))
    : 1
  const resolvedTabletPage = tabletMode
    ? Math.max(0, Math.min(currentBranchPage, totalTabletPages - 1))
    : 0

  useEffect(() => {
    if (!tabletMode || !branchId || !onBranchPageChange || resolvedTabletPage === currentBranchPage) {
      return
    }

    onBranchPageChange(branchId, resolvedTabletPage)
  }, [branchId, currentBranchPage, onBranchPageChange, resolvedTabletPage, tabletMode])

  const pagedPlugins = useMemo(() => {
    if (!tabletMode) {
      return chain?.plugins ?? []
    }

    const startIndex = resolvedTabletPage * TABLET_BRANCH_PAGE_SIZE
    return (chain?.plugins ?? []).slice(startIndex, startIndex + TABLET_BRANCH_PAGE_SIZE)
  }, [chain?.plugins, resolvedTabletPage, tabletMode])

  const signalRows = useMemo(
    () => buildSignalGridRows(
      pagedPlugins,
      tabletMode ? false : Boolean(onAddPlugin),
      tabletMode ? TABLET_BRANCH_ROW_CAPACITY : rowCapacity,
      !tabletMode,
    ),
    [onAddPlugin, pagedPlugins, rowCapacity, tabletMode],
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
    if (!chain || !draggedPlugin || samePluginIdentity(draggedPlugin, targetPlugin)) {
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
  }, [chain, draggedPlugin, onReorderPlugins])

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
          ref={gridRef}
          className={`juce-grid-page__signal-grid ${selectedPluginUri ? 'has-active-card' : ''} ${tabletMode ? 'is-tablet-mode' : ''} ${focusedBranchId && branchId === focusedBranchId ? 'is-focused-branch' : ''}`}
          data-testid="juce-grid-signal-grid"
          onClick={() => {
            if (tabletMode) {
              onCanvasEmptyPress?.()
            }
          }}
        >
          {signalRows.map((row, rowIndex) => {
            const displaySlots = row.direction === 'reverse' ? [...row.slots].reverse() : row.slots
            const activeDisplayIndex = displaySlots.findIndex(
              (slot) => slot.kind === 'plugin' && isSelectedPlugin(slot.plugin),
            )
            const activeCardShifted = activeDisplayIndex === displaySlots.length - 1

            return (
              <div
                key={row.key}
                className="juce-grid-page__signal-grid-row-shell"
                data-testid={`juce-grid-signal-row-shell-${rowIndex}`}
              >
                <div
                  className={`juce-grid-page__signal-grid-row ${row.direction === 'reverse' ? 'is-reverse' : 'is-forward'}`}
                  data-testid={`juce-grid-signal-row-${rowIndex}`}
                  data-row-direction={row.direction}
                >
                  {displaySlots.map((slot, displayIndex) => {
                    const slotSelected = slot.kind === 'plugin' && isSelectedPlugin(slot.plugin)
                    const isDimmed = Boolean(selectedPluginUri) && !slotSelected

                    return (
                      <div
                        key={slot.key}
                        className={`juce-grid-page__signal-grid-item ${isDimmed ? 'is-dimmed' : ''}`}
                        data-slot-kind={slot.kind}
                      >
                        {slot.kind === 'plugin' && slot.plugin ? (() => {
                          const plugin = slot.plugin
                          const meta = pluginMeta[plugin.uri]
                          const displayName = getDisplayPluginName(meta?.name || plugin.name || 'Unknown', plugin.uri)
                          const categoryLabel = meta?.category || 'Utility'
                          const categoryConfig = getCategoryConfig(categoryLabel)
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
                              aria-label={`${displayName}${plugin.bypassed ? ' bypassed' : ''}`}
                              aria-pressed={isSelected}
                              role="button"
                              tabIndex={0}
                              draggable={!tabletMode}
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
                                if (tabletMode) {
                                  return
                                }
                                setDraggedPlugin(buildPluginOrderRef(plugin))
                              }}
                              onDragOver={(event) => {
                                if (tabletMode) {
                                  return
                                }
                                event.preventDefault()
                                setDragOverPlugin(buildPluginOrderRef(plugin))
                              }}
                              onDrop={() => {
                                if (tabletMode) {
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
                                {!tabletMode && (
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
                                      <OverflowMenuItem itemText="Inspect block" onClick={() => onPluginSelect(plugin.uri, plugin.position)} />
                                      <OverflowMenuItem
                                        itemText={plugin.bypassed ? 'Enable block' : 'Bypass block'}
                                        onClick={() => onToggleBypass(plugin.uri, !plugin.bypassed, plugin.position)}
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
                                  <strong className="juce-grid-page__signal-plugin-title" title={displayName}>{displayName}</strong>
                                  <span className="juce-grid-page__signal-plugin-category" title={categoryLabel}>{categoryLabel}</span>
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
                          >
                            <Add size={20} />
                            <span>Add effect</span>
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
