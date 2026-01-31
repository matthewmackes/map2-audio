/**
 * Horizontal Signal Chain Component
 *
 * Displays a signal chain as a horizontal row of monochrome icons
 * with hover tooltips showing technical details.
 *
 * Audio effect icons from PiPedal project
 * https://github.com/rerdavies/pipedal
 * MIT License - Robin E. R. Davies
 */

import { useState, useCallback, useRef } from 'react'
import type { HorizontalSignalChainProps } from './types'
import { HorizontalPluginNode } from './HorizontalPluginNode'
import { HorizontalConnector } from './HorizontalConnector'
import { FxTerminal } from './icons'

export function HorizontalSignalChain({
  plugins,
  pluginMeta,
  selectedPluginUri,
  onPluginSelect,
  onPluginReorder,
  onToggleBypass,
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

  return (
    <div
      ref={containerRef}
      className="horizontal-chain"
      role="listbox"
      aria-label="Signal chain plugins"
      onKeyDown={handleKeyDown}
    >
      {/* Input Endpoint */}
      <div className="h-endpoint input" title="Audio Input">
        <FxTerminal className="h-endpoint-icon" />
        <span className="h-endpoint-label">IN</span>
      </div>

      {plugins.length > 0 && <HorizontalConnector isActive={isActive} />}

      {/* Plugin Nodes */}
      {plugins.map((plugin, index) => {
        const meta = pluginMeta[plugin.uri]
        const isSelected = plugin.uri === selectedPluginUri
        const isDragTarget = dragOverIndex === index && draggedIndex !== index

        return (
          <div key={plugin.uri} className="h-plugin-wrapper">
            <div className={`h-drop-indicator ${isDragTarget ? 'visible' : ''}`} />
            <HorizontalPluginNode
              plugin={plugin}
              meta={meta}
              isSelected={isSelected}
              onSelect={() => onPluginSelect(plugin.uri)}
              onToggleBypass={() => onToggleBypass(plugin.uri, !plugin.bypassed)}
              onDragStart={handleDragStart(index)}
              onDragOver={handleDragOver(index)}
              onDrop={handleDrop(index)}
              onDragEnd={handleDragEnd}
            />
            {index < plugins.length - 1 && (
              <HorizontalConnector isActive={isActive && !plugin.bypassed} />
            )}
          </div>
        )
      })}

      {plugins.length > 0 && <HorizontalConnector isActive={isActive} />}

      {/* Output Endpoint */}
      <div className="h-endpoint output" title="Audio Output">
        <FxTerminal className="h-endpoint-icon" />
        <span className="h-endpoint-label">OUT</span>
      </div>

      {/* Empty state */}
      {plugins.length === 0 && (
        <div className="h-empty-state">
          <span>No plugins in chain</span>
        </div>
      )}
    </div>
  )
}
