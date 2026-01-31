/**
 * Horizontal plugin node - compact icon with name and action buttons
 */

import { useState, useRef, useCallback } from 'react'
import { Power, Trash2, Link2 } from 'lucide-react'
import type { HorizontalPluginNodeProps } from './types'
import { getIconForCategory } from './icons'

export function HorizontalPluginNode({
  plugin,
  meta,
  isSelected,
  onSelect,
  onToggleBypass,
  onDelete,
  onSidechainClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: HorizontalPluginNodeProps) {
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
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        onDelete?.()
      }
    },
    [onSelect, onToggleBypass, onDelete]
  )

  const handleBypassClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onToggleBypass()
    },
    [onToggleBypass]
  )

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onDelete?.()
    },
    [onDelete]
  )

  const handleSidechainClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      onSidechainClick?.()
    },
    [onSidechainClick]
  )

  // Check if plugin supports sidechain
  const hasSidechainSupport = (meta?.sidechain_buses ?? 0) > 0
  const hasSidechainConnected = !!plugin.sidechain_source

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
    >
      {/* Sidechain Input Indicator */}
      {hasSidechainSupport && (
        <button
          className={`h-plugin-sidechain-input ${hasSidechainConnected ? 'connected' : ''}`}
          onClick={handleSidechainClick}
          title={hasSidechainConnected
            ? `Sidechain: ${plugin.sidechain_source}`
            : 'Click to configure sidechain input'
          }
        >
          <Link2 size={10} />
          <span className="h-sidechain-label">SC</span>
        </button>
      )}

      {/* Icon */}
      <div className="h-plugin-icon-wrapper">
        <Icon className="h-plugin-icon" />
        {/* Bypass indicator dot */}
        {!plugin.bypassed && (
          <div className="h-plugin-status-dot" aria-hidden="true" />
        )}
      </div>

      {/* Plugin Name */}
      <div className="h-plugin-name" title={name}>
        {name}
      </div>

      {/* Action Buttons */}
      <div className="h-plugin-actions">
        <button
          className={`h-plugin-action-btn ${plugin.bypassed ? 'bypassed' : 'active'}`}
          onClick={handleBypassClick}
          title={plugin.bypassed ? 'Enable' : 'Bypass'}
        >
          <Power size={12} />
        </button>
        {onDelete && (
          <button
            className="h-plugin-action-btn delete"
            onClick={handleDeleteClick}
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

    </div>
  )
}
