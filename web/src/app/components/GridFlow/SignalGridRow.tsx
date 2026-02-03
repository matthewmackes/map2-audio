/**
 * SignalGridRow Component
 *
 * Single horizontal row in the signal grid.
 * Shows plugins connected by animated signal flow cables with add button.
 */

import { useCallback, useState, memo, useRef, useEffect } from 'react'
import { Plus, MoreHorizontal } from 'lucide-react'
import { GridPluginBlock } from './GridPluginBlock'
import { SignalCable } from './SignalCable'
import { getCategoryColor } from './categoryConfig'
import type { ChainPlugin, Plugin } from '../../../map2/types'

export interface SignalGridRowProps {
  rowLabel: string
  rowIndex: number
  plugins: ChainPlugin[]
  pluginMeta: Record<string, Plugin>
  selectedPluginUri: string | null
  onPluginSelect: (uri: string) => void
  onToggleBypass: (uri: string) => void
  onDeletePlugin?: (uri: string) => void
  onReorderPlugins: (pluginUris: string[]) => void
  onAddPlugin?: () => void
  onAddPluginDirect?: (uri: string) => void
  isActive?: boolean
  pluginLevels?: Record<string, { in: number; out: number }>
}

export const SignalGridRow = memo(function SignalGridRow({
  rowLabel,
  rowIndex,
  plugins,
  pluginMeta,
  selectedPluginUri,
  onPluginSelect,
  onToggleBypass,
  onDeletePlugin,
  onReorderPlugins,
  onAddPlugin,
  onAddPluginDirect,
  isActive = true,
  pluginLevels = {},
}: SignalGridRowProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [showQuickList, setShowQuickList] = useState(false)
  const addButtonRef = useRef<HTMLButtonElement>(null)

  // Extract native plugins (map2://)
  const nativePlugins = Object.values(pluginMeta).filter(p => p.uri.startsWith('map2://'))
  const sortedNativePlugins = [...nativePlugins].sort((a, b) => a.name.localeCompare(b.name))

  // Handle drag start
  const handleDragStart = useCallback(
    (index: number) => (e: React.DragEvent) => {
      setDraggedIndex(index)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(index))
    },
    []
  )

  // Handle drag over
  const handleDragOver = useCallback(
    (index: number) => (e: React.DragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (draggedIndex !== null && index !== draggedIndex) {
        setDragOverIndex(index)
      }
    },
    [draggedIndex]
  )

  // Handle drop
  const handleDrop = useCallback(
    (targetIndex: number) => (e: React.DragEvent) => {
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

      onReorderPlugins(newOrder.map((p) => p.uri))
      setDraggedIndex(null)
      setDragOverIndex(null)
    },
    [draggedIndex, plugins, onReorderPlugins]
  )

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }, [])

  // Close quick list when clicking outside
  useEffect(() => {
    if (!showQuickList) return

    const handleClickOutside = (e: MouseEvent) => {
      if (addButtonRef.current && !addButtonRef.current.contains(e.target as Node)) {
        // Check if click is on the quick list
        const quickList = document.querySelector('.signal-grid-quick-list')
        if (quickList && quickList.contains(e.target as Node)) {
          return
        }
        setShowQuickList(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showQuickList])

  // Handle add button click - toggle quick list
  const handleAddButtonClick = useCallback(() => {
    if (nativePlugins.length > 0) {
      setShowQuickList(!showQuickList)
    } else {
      onAddPlugin?.()
    }
  }, [nativePlugins.length, showQuickList, onAddPlugin])

  // Handle selecting a native plugin from quick list
  const handleSelectNativePlugin = useCallback((uri: string) => {
    onAddPluginDirect?.(uri)
    setShowQuickList(false)
  }, [onAddPluginDirect])

  return (
    <div className={`signal-grid-row ${isActive ? 'active' : 'inactive'}`}>
      {/* Row label */}
      <div className="signal-grid-row-label">
        <span className="signal-grid-row-label-text">{rowLabel}</span>
      </div>

      {/* Signal input indicator */}
      <div className="signal-grid-input">
        <div className="signal-grid-input-dot" />
      </div>

      {/* Plugins with connectors */}
      <div className="signal-grid-plugins">
        {plugins.map((plugin, index) => {
          const meta = pluginMeta[plugin.uri]
          const isSelected = plugin.uri === selectedPluginUri
          const isDragTarget = dragOverIndex === index && draggedIndex !== index
          const levels = pluginLevels[plugin.uri] || { in: 0, out: 0 }
          const categoryColor = getCategoryColor(meta?.category || 'Utility')

          return (
            <div key={plugin.uri} className="signal-grid-plugin-wrapper">
              {/* Animated cable before plugin */}
              {index > 0 && (
                <SignalCable
                  isActive={!plugin.bypassed && isActive}
                  color={categoryColor}
                  orientation="horizontal"
                />
              )}

              {/* Drop indicator */}
              <div className={`signal-grid-drop-indicator ${isDragTarget ? 'visible' : ''}`} />

              {/* Plugin block with level meters */}
              <GridPluginBlock
                plugin={plugin}
                meta={meta}
                isSelected={isSelected}
                onSelect={() => onPluginSelect(plugin.uri)}
                onToggleBypass={() => onToggleBypass(plugin.uri)}
                onDelete={onDeletePlugin ? () => onDeletePlugin(plugin.uri) : undefined}
                onDragStart={handleDragStart(index)}
                onDragOver={handleDragOver(index)}
                onDrop={handleDrop(index)}
                onDragEnd={handleDragEnd}
                levelIn={levels.in}
                levelOut={levels.out}
              />
            </div>
          )
        })}

        {/* Add plugin button */}
        {onAddPlugin && (
          <div className="signal-grid-add-btn-container">
            {plugins.length > 0 && (
              <SignalCable isActive={isActive} color="var(--primary)" orientation="horizontal" />
            )}
            <button
              ref={addButtonRef}
              className={`signal-grid-add-btn ${showQuickList ? 'active' : ''}`}
              onClick={handleAddButtonClick}
              title={nativePlugins.length > 0 ? "Add plugin (quick list)" : "Add plugin"}
            >
              <Plus size={16} />
            </button>

            {/* Quick list popup */}
            {showQuickList && nativePlugins.length > 0 && (
              <div className="signal-grid-quick-list">
                {sortedNativePlugins.map((plugin) => (
                  <button
                    key={plugin.uri}
                    className="signal-grid-quick-list-item"
                    onClick={() => handleSelectNativePlugin(plugin.uri)}
                    title={plugin.name}
                  >
                    <span className="signal-grid-quick-list-name">{plugin.name}</span>
                    <span className="signal-grid-quick-list-category">{plugin.category}</span>
                  </button>
                ))}

                {/* More button */}
                <div className="signal-grid-quick-list-divider" />
                <button
                  className="signal-grid-quick-list-more"
                  onClick={() => {
                    setShowQuickList(false)
                    onAddPlugin?.()
                  }}
                  title="Open full plugin picker"
                >
                  <MoreHorizontal size={14} />
                  <span>More...</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Signal output indicator */}
      <div className="signal-grid-output">
        <div className="signal-grid-output-dot" />
      </div>

      {/* Row number on right */}
      <div className="signal-grid-row-number">
        Row {rowIndex + 1}
      </div>
    </div>
  )
})

export default SignalGridRow
