/**
 * Horizontal plugin node - compact monochrome icon representation
 */

import { useState, useRef, useCallback } from 'react'
import type { HorizontalPluginNodeProps } from './types'
import { getIconForCategory } from './icons'
import { PluginTooltipContent } from './PluginTooltip'

export function HorizontalPluginNode({
  plugin,
  meta,
  isSelected,
  onSelect,
  onToggleBypass,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: HorizontalPluginNodeProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const nodeRef = useRef<HTMLDivElement>(null)

  const Icon = getIconForCategory(meta?.category || meta?.class_label)
  const name = meta?.name || plugin.name || plugin.uri.split('/').pop() || 'Unknown'

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      setIsDragging(true)
      onDragStart?.(e)
    },
    [onDragStart]
  )

  const handleDragEnd = useCallback(
    (e: React.DragEvent) => {
      setIsDragging(false)
      onDragEnd?.(e)
    },
    [onDragEnd]
  )

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onToggleBypass()
    },
    [onToggleBypass]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSelect()
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        onToggleBypass()
      }
    },
    [onSelect, onToggleBypass]
  )

  const classNames = [
    'h-plugin-node',
    isSelected && 'selected',
    plugin.bypassed && 'bypassed',
    isDragging && 'dragging',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={nodeRef}
      className={classNames}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onKeyDown={handleKeyDown}
      draggable
      onDragStart={handleDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={handleDragEnd}
      tabIndex={0}
      role="option"
      aria-selected={isSelected}
      aria-label={`${name}${plugin.bypassed ? ' (bypassed)' : ''}`}
      title={name}
    >
      <Icon className="h-plugin-icon" />

      {/* Bypass indicator dot */}
      {!plugin.bypassed && (
        <div className="h-plugin-status-dot" aria-hidden="true" />
      )}

      {/* Tooltip on hover */}
      {isHovered && !isDragging && (
        <div className="h-plugin-tooltip-wrapper">
          <PluginTooltipContent plugin={plugin} meta={meta} />
        </div>
      )}
    </div>
  )
}
