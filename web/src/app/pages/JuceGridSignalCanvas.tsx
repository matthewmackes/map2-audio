import { useCallback, useState, type CSSProperties, memo } from 'react'
import { Add, Draggable, Meter, TrashCan, VolumeMute, VolumeUp } from '@carbon/icons-react'
import { Button, Tag, Tile } from '@carbon/react'
import { getCategoryConfig } from '../components/PluginCards/types'
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
  showEndpoints?: boolean
  onInputPortSelectClick?: () => void
  onOutputPortSelectClick?: () => void
}

function summarizeEndpoint(status?: JuceGridAudioInterfaceStatus) {
  if (!status) {
    return {
      mode: 'Disconnected',
      detail: 'No port data',
      rate: 'n/a',
    }
  }

  const selectedCount = (status.selectedPorts?.length || 0) + (status.selectedAvbEndpoints?.length || 0)
  const mode = selectedCount === 0 ? 'Unassigned' : selectedCount === 1 ? 'Mono' : selectedCount === 2 ? 'Stereo' : `${selectedCount}ch`
  const avb = status.selectedAvbEndpoints?.length ? ` + ${status.selectedAvbEndpoints.length} AVB` : ''
  return {
    mode,
    detail: `${status.selectedPorts?.length || 0} local${avb}`,
    rate: `${status.sampleRate || 48000}Hz / ${status.bufferSize || 256}smp`,
  }
}

function levelPercent(level: number | undefined) {
  return `${Math.max(0, Math.min(100, (level || 0) * 100))}%`
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
  showEndpoints = false,
  onInputPortSelectClick,
  onOutputPortSelectClick,
}: JuceGridSignalCanvasProps) {
  const [draggedUri, setDraggedUri] = useState<string | null>(null)
  const [dragOverUri, setDragOverUri] = useState<string | null>(null)

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

  const renderEndpointTile = (
    label: string,
    status: JuceGridAudioInterfaceStatus | undefined,
    onSelectPorts?: () => void,
  ) => {
    const summary = summarizeEndpoint(status)
    return (
      <Tile className="juce-grid-page__signal-endpoint">
        <div className="juce-grid-page__signal-endpoint-copy">
          <strong>{label}</strong>
          <p>{status?.deviceName || 'Audio interface'}</p>
        </div>
        <div className="juce-grid-page__signal-endpoint-meta">
          <Tag type={status?.isRunning ? 'green' : 'warm-gray'}>
            {status?.isRunning ? 'Running' : 'Stopped'}
          </Tag>
          {status?.routingMode && <Tag type="cool-gray">{status.routingMode.replace('_', ' ')}</Tag>}
          <Tag type="blue">{summary.mode}</Tag>
        </div>
        <div className="juce-grid-page__signal-endpoint-copy">
          <p>{summary.detail}</p>
          <p>{summary.rate}</p>
        </div>
        {onSelectPorts && (
          <Button size="sm" kind="ghost" onClick={onSelectPorts}>
            Configure ports
          </Button>
        )}
      </Tile>
    )
  }

  return (
    <div className="juce-grid-page__signal-canvas">
      {showEndpoints && (
        <div className="juce-grid-page__signal-endpoints">
          {renderEndpointTile('Input', audioStatus, onInputPortSelectClick)}
        </div>
      )}

      <div className="juce-grid-page__signal-path">
        <div className="juce-grid-page__signal-plugin-row">
          {chain.plugins.map((plugin) => {
            const meta = pluginMeta[plugin.uri]
            const displayName = getDisplayPluginName(meta?.name || plugin.name || 'Unknown', plugin.uri)
            const categoryConfig = getCategoryConfig(meta?.category || 'Utility')
            const isSelected = plugin.uri === selectedPluginUri
            const isDropTarget = dragOverUri === plugin.uri && draggedUri !== plugin.uri
            const levels = pluginLevels[plugin.uri] || { in: 0, out: 0 }

            return (
              <article
                key={`${plugin.uri}:${plugin.position}`}
                className={`juce-grid-page__signal-plugin-card ${isSelected ? 'is-selected' : ''} ${plugin.bypassed ? 'is-bypassed' : ''} ${isDropTarget ? 'is-drop-target' : ''}`}
                draggable
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
                <div className="juce-grid-page__signal-plugin-header">
                  <button
                    type="button"
                    className="juce-grid-page__signal-plugin-select"
                    onClick={() => onPluginSelect(plugin.uri)}
                  >
                    <span className="juce-grid-page__signal-plugin-drag">
                      <Draggable size={16} />
                    </span>
                    <span className="juce-grid-page__signal-plugin-copy">
                      <strong>{displayName}</strong>
                      <span>{meta?.category || 'Utility'}</span>
                    </span>
                  </button>
                  <div className="juce-grid-page__signal-plugin-actions">
                    <Button
                      size="sm"
                      kind={plugin.bypassed ? 'secondary' : 'ghost'}
                      hasIconOnly
                      renderIcon={plugin.bypassed ? VolumeMute : VolumeUp}
                      iconDescription={plugin.bypassed ? 'Enable plugin' : 'Bypass plugin'}
                      onClick={() => onToggleBypass(plugin.uri, !plugin.bypassed)}
                    />
                    {onDeletePlugin && (
                      <Button
                        size="sm"
                        kind="danger--tertiary"
                        hasIconOnly
                        renderIcon={TrashCan}
                        iconDescription="Remove plugin"
                        onClick={() => onDeletePlugin(plugin.uri, plugin.position)}
                      />
                    )}
                  </div>
                </div>

                <div className="juce-grid-page__signal-plugin-meta">
                  {meta?.format && <Tag type="blue">{meta.format}</Tag>}
                  <Tag type="cool-gray">{(meta?.in_ports ?? plugin.in_ports ?? 0)}→{(meta?.out_ports ?? plugin.out_ports ?? 0)}</Tag>
                  {plugin.bypassed && <Tag type="warm-gray">Bypassed</Tag>}
                </div>

                <div className="juce-grid-page__signal-levels">
                  <div className="juce-grid-page__signal-level">
                    <span>In</span>
                    <div className="juce-grid-page__signal-level-track">
                      <div className="juce-grid-page__signal-level-fill" style={{ width: levelPercent(levels.in) }} />
                    </div>
                  </div>
                  <div className="juce-grid-page__signal-level">
                    <span>Out</span>
                    <div className="juce-grid-page__signal-level-track">
                      <div className="juce-grid-page__signal-level-fill" style={{ width: levelPercent(levels.out) }} />
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
        <div className="juce-grid-page__signal-endpoints">
          {renderEndpointTile('Output', audioOutputStatus || audioStatus, onOutputPortSelectClick)}
        </div>
      )}
    </div>
  )
})

export default JuceGridSignalCanvas
