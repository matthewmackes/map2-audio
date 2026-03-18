import { useCallback, useState, type CSSProperties, type SyntheticEvent, memo } from 'react'
import {
  Add,
  AudioConsole,
  Draggable,
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
import { SegmentedLedText } from '../components/Displays/SegmentedLedText'
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

function samplesToMs(samples: number, sampleRate: number) {
  return (samples / sampleRate) * 1000
}

function formatLatencyMetric(samples: number | undefined, sampleRate: number) {
  if (!samples || samples <= 0) {
    return '0.0 ms'
  }

  const latencyMs = samplesToMs(samples, sampleRate)
  if (latencyMs < 1) {
    return `${samples} smp`
  }

  return `${latencyMs.toFixed(latencyMs < 10 ? 1 : 0)} ms`
}

function cpuMetricTone(cpuPercent: number | undefined) {
  if (!Number.isFinite(cpuPercent)) {
    return 'neutral'
  }
  if ((cpuPercent ?? 0) >= 35) {
    return 'warning'
  }
  if ((cpuPercent ?? 0) >= 10) {
    return 'active'
  }
  return 'neutral'
}

function latencyMetricTone(latencySamples: number | undefined, sampleRate: number) {
  if (!latencySamples || latencySamples <= 0) {
    return 'neutral'
  }

  const latencyMs = samplesToMs(latencySamples, sampleRate)
  if (latencyMs >= 12) {
    return 'warning'
  }
  if (latencyMs >= 3) {
    return 'active'
  }
  return 'neutral'
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
  pluginMeta,
  selectedPluginUri,
  onPluginSelect,
  onToggleBypass,
  onDeletePlugin,
  onReorderPlugins,
  onAddPlugin,
  audioStatus,
  audioOutputStatus,
  pluginLevels = {},
  automationSummary,
  showEndpoints = false,
  onInputPortSelectClick,
  onOutputPortSelectClick,
}: JuceGridSignalCanvasProps) {
  const [draggedUri, setDraggedUri] = useState<string | null>(null)
  const [dragOverUri, setDragOverUri] = useState<string | null>(null)
  const sampleRate = audioStatus?.sampleRate || audioOutputStatus?.sampleRate || 48000

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
        <div className="juce-grid-page__signal-plugin-row">
          {chain.plugins.map((plugin) => {
            const meta = pluginMeta[plugin.uri]
            const displayName = getDisplayPluginName(meta?.name || plugin.name || 'Unknown', plugin.uri)
            const categoryConfig = getCategoryConfig(meta?.category || 'Utility')
            const EffectIcon = getEffectIcon(meta?.category)
            const isSelected = plugin.uri === selectedPluginUri
            const isDropTarget = dragOverUri === plugin.uri && draggedUri !== plugin.uri
            const levels = pluginLevels[plugin.uri] || { in: 0, out: 0 }
            const formatLabel = meta?.format || plugin.format || plugin.plugin_display_type || 'Plugin'
            const inputPorts = meta?.in_ports ?? plugin.in_ports ?? 0
            const outputPorts = meta?.out_ports ?? plugin.out_ports ?? 0
            const latencyLabel = formatLatencyMetric(plugin.latency_samples, sampleRate)
            const sidechainBusCount = meta?.sidechain_buses ?? 0
            const sidechainSourcePlugin = plugin.sidechain_source
              ? chain.plugins.find((candidate) => candidate.uri === plugin.sidechain_source)
              : null
            const hasSidechainConnection = Boolean(plugin.sidechain_source)
            const hasSidechainSupport = hasSidechainConnection || sidechainBusCount > 0 || plugin.sidechain_bus !== undefined
            const automationLaneCount = automationSummary?.laneCountByPlugin[plugin.uri] ?? 0
            const armedLaneCount = automationSummary?.armedLaneCountByPlugin[plugin.uri] ?? 0
            const automationLabel = armedLaneCount > 0
              ? 'Armed'
              : automationLaneCount > 0
                ? `${automationLaneCount} lane${automationLaneCount === 1 ? '' : 's'}`
                : 'None'
            const sidechainLabel = hasSidechainConnection ? 'Live' : hasSidechainSupport ? 'Ready' : 'None'
            const sidechainTitle = hasSidechainConnection
              ? `Sidechain source: ${getDisplayPluginName(sidechainSourcePlugin?.name || plugin.sidechain_source || 'Source', plugin.sidechain_source || '')}`
              : hasSidechainSupport
                ? `Sidechain capable${sidechainBusCount > 0 ? ` · ${sidechainBusCount} bus${sidechainBusCount === 1 ? '' : 'es'}` : ''}`
                : 'No sidechain routing'
            const automationTitle = automationLaneCount > 0
              ? [
                `${automationLaneCount} automation lane${automationLaneCount === 1 ? '' : 's'}`,
                armedLaneCount > 0 ? `${armedLaneCount} armed` : null,
                automationSummary?.recording ? 'transport recording' : automationSummary?.playing ? 'transport playing' : null,
              ].filter(Boolean).join(' · ')
              : 'No automation lanes'
            const supportMeta = [
              meta?.category || 'Utility',
              formatLabel,
              `${inputPorts} in / ${outputPorts} out`,
              plugin.bypassed ? 'Bypassed' : null,
            ].filter(Boolean)

            return (
              <article
                key={`${plugin.uri}:${plugin.position}`}
                className={`juce-grid-page__signal-plugin-card ${isSelected ? 'is-selected' : ''} ${plugin.bypassed ? 'is-bypassed' : ''} ${isDropTarget ? 'is-drop-target' : ''}`}
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
                {/* ── Hero icon ── */}
                <div className="juce-grid-page__signal-plugin-hero" aria-hidden>
                  <EffectIcon className="juce-grid-page__signal-plugin-hero-svg" />
                </div>

                {/* ── Bottom info panel ── */}
                <div className="juce-grid-page__signal-plugin-info">
                  {/* Title row: drag handle + name + overflow */}
                  <div className="juce-grid-page__signal-plugin-title-row">
                    <span className="juce-grid-page__signal-plugin-drag" aria-hidden>
                      <Draggable size={14} />
                    </span>
                    <strong className="juce-grid-page__signal-plugin-title" title={displayName}>{displayName}</strong>
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
                  </div>

                  {/* Meta pills */}
                  <div className="juce-grid-page__signal-plugin-pills">
                    {supportMeta.map((item) => (
                      <span
                        key={`${plugin.uri}:${item}`}
                        className={`juce-grid-page__signal-plugin-pill ${item === (meta?.category || 'Utility') ? 'is-category' : ''}`}
                      >
                        {item}
                      </span>
                    ))}
                  </div>

                  {/* Metrics row */}
                  <div
                    className="juce-grid-page__signal-plugin-metrics"
                    data-testid={`juce-grid-signal-plugin-metrics-${plugin.position}`}
                  >
                    <div
                      className={`juce-grid-page__signal-plugin-metric is-${cpuMetricTone(plugin.cpu_percent)}`}
                      title={Number.isFinite(plugin.cpu_percent) ? `CPU load ${plugin.cpu_percent?.toFixed(1)}%` : 'CPU load unavailable'}
                    >
                      <span className="juce-grid-page__signal-plugin-metric-label">CPU</span>
                      <span className="juce-grid-page__signal-plugin-metric-value">
                        {Number.isFinite(plugin.cpu_percent) ? `${plugin.cpu_percent?.toFixed(1)}%` : '--'}
                      </span>
                    </div>
                    <div
                      className={`juce-grid-page__signal-plugin-metric is-${latencyMetricTone(plugin.latency_samples, sampleRate)}`}
                      title={plugin.latency_samples ? `${plugin.latency_samples} samples @ ${sampleRate}Hz` : 'No added latency'}
                    >
                      <span className="juce-grid-page__signal-plugin-metric-label">Lat</span>
                      <span className="juce-grid-page__signal-plugin-metric-value">{latencyLabel}</span>
                    </div>
                    <div
                      className={`juce-grid-page__signal-plugin-metric is-${hasSidechainConnection ? 'active' : hasSidechainSupport ? 'ready' : 'neutral'}`}
                      title={sidechainTitle}
                    >
                      <span className="juce-grid-page__signal-plugin-metric-label">SC</span>
                      <span className="juce-grid-page__signal-plugin-metric-value">{sidechainLabel}</span>
                    </div>
                    <div
                      className={`juce-grid-page__signal-plugin-metric is-${armedLaneCount > 0 ? 'active' : automationLaneCount > 0 ? 'ready' : 'neutral'}`}
                      title={automationTitle}
                    >
                      <span className="juce-grid-page__signal-plugin-metric-label">Auto</span>
                      <span className="juce-grid-page__signal-plugin-metric-value">{automationLabel}</span>
                    </div>
                  </div>

                  {/* Levels row — LED readout */}
                  <div
                    className="juce-grid-page__signal-levels"
                    data-testid={`juce-grid-signal-plugin-levels-${plugin.position}`}
                  >
                    <div className="juce-grid-page__signal-level">
                      <span className="juce-grid-page__signal-level-label">In</span>
                      <SegmentedLedText value={`${Math.round((levels.in || 0) * 100)}%`} size="xs" color={categoryConfig.color} />
                    </div>
                    <div className="juce-grid-page__signal-level">
                      <span className="juce-grid-page__signal-level-label">Out</span>
                      <SegmentedLedText value={`${Math.round((levels.out || 0) * 100)}%`} size="xs" color={categoryConfig.color} />
                    </div>
                  </div>
                </div>
              </article>
            )
          })}

          {onAddPlugin && (
            <button
              type="button"
              className="juce-grid-page__signal-plugin-add"
              onClick={onAddPlugin}
            >
              <Add size={20} />
              <span>Add block</span>
            </button>
          )}
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
