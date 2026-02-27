/**
 * GridPluginBlock Component
 *
 * Compact plugin block for Cortex Control style grid layout.
 * Displays plugin as a color-coded square with icon and level meters.
 */

import { useCallback, useState, memo } from 'react'
import { X, Power } from '@phosphor-icons/react'
import { getCategoryConfig, getCategoryIcon } from './categoryConfig'
import type { ChainPlugin, Plugin } from '../../../map2/types'
import { getDisplayPluginName } from '../../../map2/displayNames'

export interface GridPluginBlockProps {
  plugin: ChainPlugin
  meta?: Plugin
  isSelected: boolean
  onSelect: () => void
  onToggleBypass?: () => void
  onDelete?: () => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  levelIn?: number
  levelOut?: number
}

export const GridPluginBlock = memo(function GridPluginBlock({
  plugin,
  meta,
  isSelected,
  onSelect,
  onToggleBypass,
  onDelete,
  draggable = true,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  levelIn = 0,
  levelOut = 0,
}: GridPluginBlockProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const category = meta?.category || 'Utility'
  const { color, bg } = getCategoryConfig(category)
  const Icon = getCategoryIcon(category)
  const name = getDisplayPluginName(meta?.name || plugin.name || 'Unknown', plugin.uri)
  const shortName = name.length > 12 ? name.substring(0, 10) + '...' : name

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      setIsDragging(true)
      onDragStart?.(e)
    },
    [onDragStart]
  )

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
    onDragEnd?.()
  }, [onDragEnd])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSelect()
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        onToggleBypass?.()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        onDelete?.()
      }
    },
    [onSelect, onToggleBypass, onDelete]
  )

  // Get level meter colors based on level
  const getLevelColor = (level: number) => {
    if (level > 0.9) return '#ef4444' // Red - clipping
    if (level > 0.7) return '#f59e0b' // Orange - hot
    return '#22c55e' // Green - normal
  }

  return (
    <div
      className={`grid-plugin-block ${isSelected ? 'selected' : ''} ${plugin.bypassed ? 'bypassed' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{
        '--block-color': color,
        '--block-bg': bg,
      } as React.CSSProperties}
      onClick={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onKeyDown={handleKeyDown}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={handleDragEnd}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      title={name}
    >
      {/* Input Level Meter */}
      {!plugin.bypassed && (
        <div
          className="grid-plugin-meter grid-plugin-meter-in"
          style={{
            height: `${Math.min(100, levelIn * 100)}%`,
            background: getLevelColor(levelIn),
          }}
          title={`In: ${(levelIn * 100).toFixed(0)}%`}
        />
      )}

      {/* Icon */}
      <div className="grid-plugin-icon">
        <Icon size={20} />
      </div>

      {/* Name (shown on hover or select) */}
      {(isHovered || isSelected) && (
        <div className="grid-plugin-name">{shortName}</div>
      )}

      {/* Bypass indicator */}
      {plugin.bypassed && (
        <div className="grid-plugin-bypass-badge">
          <Power size={10} weight="duotone" />
        </div>
      )}

      {/* Delete button (shown when selected) */}
      {isSelected && onDelete && (
        <button
          className="grid-plugin-delete"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title="Remove plugin"
        >
          <X size={12} weight="bold" />
        </button>
      )}

      {/* Output Level Meter */}
      {!plugin.bypassed && (
        <div
          className="grid-plugin-meter grid-plugin-meter-out"
          style={{
            height: `${Math.min(100, levelOut * 100)}%`,
            background: getLevelColor(levelOut),
          }}
          title={`Out: ${(levelOut * 100).toFixed(0)}%`}
        />
      )}
    </div>
  )
})

export default GridPluginBlock
