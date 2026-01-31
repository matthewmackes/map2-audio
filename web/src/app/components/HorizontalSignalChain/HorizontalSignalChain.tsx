/**
 * Horizontal Signal Chain Component
 *
 * Displays a signal chain as a horizontal row of plugins
 * with expandable signal flow arrows showing technical details.
 */

import { useState, useCallback, useRef } from 'react'
import type { HorizontalSignalChainProps } from './types'
import { HorizontalPluginNode } from './HorizontalPluginNode'
import { SidechainConnector } from './SidechainConnector'

interface SignalInfo {
  channels: number
  sampleRate?: number
  bitDepth?: number
  format?: string
}

function SignalEndpoint({
  type,
  channels = 2,
  sampleRate = 48000,
}: {
  type: 'input' | 'output'
  channels?: number
  sampleRate?: number
}) {
  return (
    <div className={`h-signal-endpoint ${type}`}>
      <div className="h-signal-endpoint-label">{type === 'input' ? 'IN' : 'OUT'}</div>
      <div className="h-signal-endpoint-info">
        <span>{channels}ch</span>
        <span>{sampleRate / 1000}k</span>
      </div>
    </div>
  )
}

function SignalArrow({
  isActive = true,
  fromPlugin,
  toPlugin,
  channels = 2,
  isFirst = false,
  isLast = false,
}: {
  isActive?: boolean
  fromPlugin?: string
  toPlugin?: string
  channels?: number
  isFirst?: boolean
  isLast?: boolean
}) {
  const label = isFirst ? 'Input' : isLast ? 'Output' : `${channels}ch`

  return (
    <div className={`h-signal-arrow ${isActive ? 'active' : 'bypassed'}`}>
      <div className="h-signal-arrow-line" />
      <div className="h-signal-arrow-info">
        <span className="h-signal-arrow-channels">{label}</span>
        {!isFirst && !isLast && fromPlugin && (
          <span className="h-signal-arrow-flow">{isActive ? 'Signal' : 'Bypass'}</span>
        )}
      </div>
      <div className="h-signal-arrow-head" />
    </div>
  )
}

export function HorizontalSignalChain({
  plugins,
  pluginMeta,
  selectedPluginUri,
  onPluginSelect,
  onPluginReorder,
  onToggleBypass,
  onDeletePlugin,
  onSidechainConfig,
  sidechainSources,
  chainLabel,
  isActive = true,
}: HorizontalSignalChainProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle drag start
  const handleDragStart = useCallback((index: number) => (e: React.DragEvent) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }, [])

  // Handle drag over
  const handleDragOver = useCallback((index: number) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedIndex !== null && index !== draggedIndex) {
      setDragOverIndex(index)
    }
  }, [draggedIndex])

  // Handle drop
  const handleDrop = useCallback((targetIndex: number) => (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      return
    }

    // Reorder plugins
    const newOrder = [...plugins]
    const [movedPlugin] = newOrder.splice(draggedIndex, 1)
    newOrder.splice(targetIndex, 0, movedPlugin)

    onPluginReorder(newOrder.map((p) => p.uri))
    setDraggedIndex(null)
    setDragOverIndex(null)
  }, [draggedIndex, plugins, onPluginReorder])

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }, [])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!selectedPluginUri) return

    const currentIndex = plugins.findIndex((p) => p.uri === selectedPluginUri)
    if (currentIndex === -1) return

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = Math.min(currentIndex + 1, plugins.length - 1)
      if (nextIndex !== currentIndex) {
        onPluginSelect(plugins[nextIndex].uri)
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = Math.max(currentIndex - 1, 0)
      if (prevIndex !== currentIndex) {
        onPluginSelect(plugins[prevIndex].uri)
      }
    }
  }, [selectedPluginUri, plugins, onPluginSelect])

  // Get channel count from first plugin or default
  const inputChannels = plugins[0]?.in_ports ?? 2
  const outputChannels = plugins[plugins.length - 1]?.out_ports ?? 2

  return (
    <div
      ref={containerRef}
      className="horizontal-chain"
      role="listbox"
      aria-label="Signal chain plugins"
      onKeyDown={handleKeyDown}
    >
      {/* Input Endpoint */}
      <SignalEndpoint type="input" channels={inputChannels} />

      {/* Input Arrow */}
      <SignalArrow
        isActive={isActive}
        isFirst={true}
        channels={inputChannels}
      />

      {/* Plugin Nodes */}
      {plugins.map((plugin, index) => {
        const meta = pluginMeta[plugin.uri]
        const isSelected = plugin.uri === selectedPluginUri
        const isDragTarget = dragOverIndex === index && draggedIndex !== index
        const pluginActive = isActive && !plugin.bypassed
        const nextPlugin = plugins[index + 1]
        const outChannels = plugin.out_ports ?? meta?.out_ports ?? 2

        // Check sidechain support and connection
        const hasSidechain = (meta?.sidechain_buses ?? 0) > 0
        const sidechainSource = plugin.sidechain_source
        const sidechainSourceInfo = sidechainSources?.find(s => s.id === sidechainSource)

        return (
          <div key={plugin.uri} className={`h-plugin-wrapper ${hasSidechain ? 'has-sidechain' : ''}`}>
            <div className={`h-drop-indicator ${isDragTarget ? 'visible' : ''}`} />
            {/* Sidechain connector above plugin */}
            {hasSidechain && (
              <SidechainConnector
                source={sidechainSource}
                sourceChainLabel={sidechainSourceInfo?.chainLabel}
                isConnected={!!sidechainSource}
                isActive={isActive && !!sidechainSource}
                onClick={onSidechainConfig ? () => onSidechainConfig(plugin.uri) : undefined}
              />
            )}
            <HorizontalPluginNode
              plugin={plugin}
              meta={meta}
              isSelected={isSelected}
              onSelect={() => onPluginSelect(plugin.uri)}
              onToggleBypass={() => onToggleBypass(plugin.uri, !plugin.bypassed)}
              onDelete={onDeletePlugin ? () => onDeletePlugin(plugin.uri) : undefined}
              onSidechainClick={onSidechainConfig ? () => onSidechainConfig(plugin.uri) : undefined}
              onDragStart={handleDragStart(index)}
              onDragOver={handleDragOver(index)}
              onDrop={handleDrop(index)}
              onDragEnd={handleDragEnd}
            />
            {index < plugins.length - 1 && (
              <SignalArrow
                isActive={pluginActive}
                fromPlugin={meta?.name || plugin.name}
                toPlugin={pluginMeta[nextPlugin?.uri]?.name || nextPlugin?.name}
                channels={outChannels}
              />
            )}
          </div>
        )
      })}

      {/* Output Arrow */}
      {plugins.length > 0 && (
        <SignalArrow
          isActive={isActive && !plugins[plugins.length - 1]?.bypassed}
          isLast={true}
          channels={outputChannels}
        />
      )}

      {/* Output Endpoint */}
      <SignalEndpoint type="output" channels={outputChannels} />

      {/* Empty state */}
      {plugins.length === 0 && (
        <SignalArrow isActive={isActive} isFirst={true} isLast={true} channels={2} />
      )}
    </div>
  )
}
