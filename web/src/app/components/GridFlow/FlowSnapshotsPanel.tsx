/**
 * FlowSnapshotsPanel Component
 * Collapsible panel for managing flow snapshots with MIDI PC switching support
 */

import { memo, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Camera,
  CaretDown,
  CaretRight,
  Trash,
  Copy,
  PencilSimple,
  MusicNote,
  Star,
  DotsThreeVertical,
  Plus,
  Check,
  DotsSixVertical,
} from '@phosphor-icons/react'
import { flowSnapshotsApi } from '../../../map2/api'
import type { FlowSnapshot, FlowSnapshotData } from '../../../map2/types'

export interface FlowSnapshotsPanelProps {
  /** Current flow state to capture */
  currentState: FlowSnapshotData
  /** Called when a snapshot is loaded */
  onSnapshotLoaded: (data: FlowSnapshotData) => void
  /** Whether panel is expanded */
  expanded: boolean
  /** Toggle expanded state */
  onToggleExpanded: () => void
}

export const FlowSnapshotsPanel = memo(function FlowSnapshotsPanel({
  currentState,
  onSnapshotLoaded,
  expanded,
  onToggleExpanded,
}: FlowSnapshotsPanelProps) {
  const queryClient = useQueryClient()
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    snapshot: FlowSnapshot
  } | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [showPCEditor, setShowPCEditor] = useState<number | null>(null)
  const [pcValue, setPCValue] = useState<string>('')
  const [draggedId, setDraggedId] = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch snapshots
  const { data: snapshotsData, isLoading } = useQuery<{
    snapshots: FlowSnapshot[]
    count: number
    active_id: number | null
  }>({
    queryKey: ['flow-snapshots'],
    queryFn: () => flowSnapshotsApi.list(),
    refetchInterval: 5000,
  })

  // Sort snapshots: favorites first, then by display_order
  const snapshots = useMemo(() => {
    const raw = snapshotsData?.snapshots || []
    return [...raw].sort((a, b) => {
      // Favorites first
      if (a.is_favorite && !b.is_favorite) return -1
      if (!a.is_favorite && b.is_favorite) return 1
      // Then by display order
      return a.display_order - b.display_order
    })
  }, [snapshotsData?.snapshots])
  const activeId = snapshotsData?.active_id

  // Mutations
  const createMutation = useMutation({
    mutationFn: flowSnapshotsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
    },
  })

  const loadMutation = useMutation({
    mutationFn: (snapshotId: number) => flowSnapshotsApi.load(snapshotId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
      onSnapshotLoaded(data.snapshot_data)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (snapshotId: number) => flowSnapshotsApi.delete(snapshotId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Parameters<typeof flowSnapshotsApi.update>[1] }) =>
      flowSnapshotsApi.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
    },
  })

  const setProgramMutation = useMutation({
    mutationFn: ({ id, pc }: { id: number; pc: number | null }) =>
      flowSnapshotsApi.setProgram(id, pc),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: flowSnapshotsApi.duplicate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
    },
  })

  const reorderMutation = useMutation({
    mutationFn: flowSnapshotsApi.reorder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-snapshots'] })
    },
  })

  // Handlers
  const handleSaveNew = useCallback(() => {
    const name = prompt('Snapshot name:', `Snapshot ${snapshots.length + 1}`)
    if (name) {
      createMutation.mutate({
        name,
        snapshot_data: currentState,
      })
    }
  }, [currentState, snapshots.length, createMutation])

  const handleLoad = useCallback((snapshot: FlowSnapshot) => {
    loadMutation.mutate(snapshot.id)
  }, [loadMutation])

  const handleDelete = useCallback((snapshot: FlowSnapshot) => {
    if (confirm(`Delete "${snapshot.name}"?`)) {
      deleteMutation.mutate(snapshot.id)
    }
  }, [deleteMutation])

  const handleRename = useCallback((snapshot: FlowSnapshot) => {
    setEditingId(snapshot.id)
    setEditingName(snapshot.name)
  }, [])

  const handleRenameSubmit = useCallback((id: number) => {
    if (editingName.trim()) {
      updateMutation.mutate({ id, updates: { name: editingName.trim() } })
    }
    setEditingId(null)
    setEditingName('')
  }, [editingName, updateMutation])

  const handleSetPC = useCallback((snapshot: FlowSnapshot) => {
    setShowPCEditor(snapshot.id)
    setPCValue(snapshot.program_number?.toString() || '')
  }, [])

  const handlePCSubmit = useCallback((id: number) => {
    const pc = pcValue.trim() === '' ? null : parseInt(pcValue, 10)
    if (pc === null || (pc >= 0 && pc <= 127)) {
      setProgramMutation.mutate({ id, pc })
    }
    setShowPCEditor(null)
    setPCValue('')
  }, [pcValue, setProgramMutation])

  const handleDuplicate = useCallback((snapshot: FlowSnapshot) => {
    duplicateMutation.mutate(snapshot.id)
  }, [duplicateMutation])

  const handleToggleFavorite = useCallback((snapshot: FlowSnapshot) => {
    updateMutation.mutate({
      id: snapshot.id,
      updates: { is_favorite: !snapshot.is_favorite },
    })
  }, [updateMutation])

  // Drag and drop
  const handleDragStart = useCallback((e: React.DragEvent, id: number) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, id: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverId(id)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedId(null)
    setDragOverId(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetId: number) => {
    e.preventDefault()
    if (draggedId === null || draggedId === targetId) {
      setDraggedId(null)
      setDragOverId(null)
      return
    }

    const newOrder = [...snapshots]
    const draggedIndex = newOrder.findIndex(s => s.id === draggedId)
    const targetIndex = newOrder.findIndex(s => s.id === targetId)

    const [removed] = newOrder.splice(draggedIndex, 1)
    newOrder.splice(targetIndex, 0, removed)

    reorderMutation.mutate(newOrder.map(s => s.id))
    setDraggedId(null)
    setDragOverId(null)
  }, [draggedId, snapshots, reorderMutation])

  // Context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, snapshot: FlowSnapshot) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, snapshot })
  }, [])

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  // Focus input when editing
  useEffect(() => {
    if (editingId !== null && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  return (
    <div className="flow-snapshots-panel">
      {/* Header */}
      <button
        className="flow-snapshots-header"
        onClick={onToggleExpanded}
      >
        <div className="flow-snapshots-header-left">
          <Camera size={16} weight="duotone" className="flow-snapshots-icon" />
          <span className="flow-snapshots-title">Flow Snapshots</span>
          <span className="flow-snapshots-count">({snapshots.length})</span>
        </div>
        {expanded ? (
          <CaretDown size={16} weight="bold" className="flow-snapshots-chevron" />
        ) : (
          <CaretRight size={16} weight="bold" className="flow-snapshots-chevron" />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="flow-snapshots-content">
          {/* Save New Button */}
          <button
            className="flow-snapshots-save-btn"
            onClick={handleSaveNew}
            disabled={createMutation.isPending}
          >
            <Plus size={14} weight="bold" />
            Save Current State
          </button>

          {/* Snapshots List */}
          <div className="flow-snapshots-list">
            {isLoading ? (
              <div className="flow-snapshots-loading">Loading...</div>
            ) : snapshots.length === 0 ? (
              <div className="flow-snapshots-empty">
                <Camera size={24} weight="duotone" className="flow-snapshots-empty-icon" />
                <span>No snapshots saved yet</span>
              </div>
            ) : (
              snapshots.map((snapshot) => (
                <div
                  key={snapshot.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, snapshot.id)}
                  onDragOver={(e) => handleDragOver(e, snapshot.id)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, snapshot.id)}
                  onContextMenu={(e) => handleContextMenu(e, snapshot)}
                  onClick={() => handleLoad(snapshot)}
                  className={`flow-snapshot-item ${
                    snapshot.id === activeId ? 'active' : ''
                  } ${dragOverId === snapshot.id ? 'drag-over' : ''} ${
                    draggedId === snapshot.id ? 'dragging' : ''
                  }`}
                >
                  {/* Drag handle */}
                  <div className="flow-snapshot-drag-handle">
                    <DotsSixVertical size={12} weight="duotone" />
                  </div>

                  {/* Active indicator */}
                  {snapshot.id === activeId && (
                    <div className="flow-snapshot-active-dot" />
                  )}

                  {/* Favorite star */}
                  <button
                    className={`flow-snapshot-favorite ${snapshot.is_favorite ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleFavorite(snapshot)
                    }}
                    title={snapshot.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Star size={12} weight="duotone" fill={snapshot.is_favorite ? 'currentColor' : 'none'} />
                  </button>

                  {/* Name (editable) */}
                  {editingId === snapshot.id ? (
                    <input
                      ref={inputRef}
                      type="text"
                      className="flow-snapshot-name-input"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => handleRenameSubmit(snapshot.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit(snapshot.id)
                        if (e.key === 'Escape') {
                          setEditingId(null)
                          setEditingName('')
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="flow-snapshot-name">{snapshot.name}</span>
                  )}

                  {/* Flow indicators */}
                  {snapshot.flow_slots && snapshot.flow_slots.length > 0 && (
                    <div className="flow-snapshot-flows">
                      {snapshot.flow_slots.map((slot) => (
                        <span
                          key={slot.id}
                          className="flow-snapshot-flow-dot"
                          style={{ backgroundColor: slot.color }}
                          title={slot.label}
                        />
                      ))}
                    </div>
                  )}

                  {/* MIDI PC badge */}
                  {showPCEditor === snapshot.id ? (
                    <input
                      type="number"
                      min={0}
                      max={127}
                      className="flow-snapshot-pc-input"
                      value={pcValue}
                      onChange={(e) => setPCValue(e.target.value)}
                      onBlur={() => handlePCSubmit(snapshot.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handlePCSubmit(snapshot.id)
                        if (e.key === 'Escape') {
                          setShowPCEditor(null)
                          setPCValue('')
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="PC#"
                      autoFocus
                    />
                  ) : snapshot.program_number !== null ? (
                    <button
                      className="flow-snapshot-pc-badge"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSetPC(snapshot)
                      }}
                      title="MIDI Program Change"
                    >
                      <MusicNote size={10} weight="duotone" />
                      {snapshot.program_number}
                    </button>
                  ) : (
                    <button
                      className="flow-snapshot-pc-empty"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSetPC(snapshot)
                      }}
                      title="Set MIDI PC"
                    >
                      <MusicNote size={10} weight="duotone" />
                    </button>
                  )}

                  {/* More menu */}
                  <button
                    className="flow-snapshot-more"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleContextMenu(e, snapshot)
                    }}
                  >
                    <DotsThreeVertical size={14} weight="duotone" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="flow-snapshot-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flow-snapshot-context-item"
            onClick={() => {
              handleLoad(contextMenu.snapshot)
              setContextMenu(null)
            }}
          >
            <Check size={14} weight="bold" /> Load
          </button>
          <button
            className="flow-snapshot-context-item"
            onClick={() => {
              handleRename(contextMenu.snapshot)
              setContextMenu(null)
            }}
          >
            <PencilSimple size={14} weight="duotone" /> Rename
          </button>
          <button
            className="flow-snapshot-context-item"
            onClick={() => {
              handleDuplicate(contextMenu.snapshot)
              setContextMenu(null)
            }}
          >
            <Copy size={14} weight="duotone" /> Duplicate
          </button>
          <button
            className="flow-snapshot-context-item"
            onClick={() => {
              handleSetPC(contextMenu.snapshot)
              setContextMenu(null)
            }}
          >
            <MusicNote size={14} weight="duotone" /> Set MIDI PC
          </button>
          <div className="flow-snapshot-context-divider" />
          <button
            className="flow-snapshot-context-item danger"
            onClick={() => {
              handleDelete(contextMenu.snapshot)
              setContextMenu(null)
            }}
          >
            <Trash size={14} weight="duotone" /> Delete
          </button>
        </div>
      )}

      {/* Styles */}
      <style>{`
        .flow-snapshots-panel {
          background: var(--surface, #1a1a2e);
          border: 1px solid var(--border, #2d2d44);
          border-radius: 8px;
          overflow: hidden;
        }

        .flow-snapshots-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          background: var(--surface-elevated, #232340);
          border: none;
          cursor: pointer;
          transition: background 0.15s;
        }

        .flow-snapshots-header:hover {
          background: var(--surface-hover, #2a2a4a);
        }

        .flow-snapshots-header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .flow-snapshots-icon {
          color: var(--primary, #00d4ff);
        }

        .flow-snapshots-title {
          font-size: 13px;
          font-weight: 500;
          color: var(--text, #e0e0e0);
        }

        .flow-snapshots-count {
          font-size: 11px;
          color: var(--text-muted, #888);
        }

        .flow-snapshots-chevron {
          color: var(--text-muted, #888);
        }

        .flow-snapshots-content {
          padding: 12px;
        }

        .flow-snapshots-save-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 12px;
          background: var(--primary, #00d4ff);
          color: var(--primary-foreground, #000);
          border: none;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s, opacity 0.15s;
        }

        .flow-snapshots-save-btn:hover {
          background: var(--primary-hover, #00b8e0);
        }

        .flow-snapshots-save-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .flow-snapshots-list {
          margin-top: 12px;
          max-height: 280px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .flow-snapshots-loading,
        .flow-snapshots-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
          color: var(--text-muted, #888);
          font-size: 12px;
          text-align: center;
        }

        .flow-snapshots-empty-icon {
          margin-bottom: 8px;
          opacity: 0.5;
        }

        .flow-snapshot-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 8px;
          background: var(--surface-elevated, #232340);
          border: 1px solid transparent;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .flow-snapshot-item:hover {
          background: var(--surface-hover, #2a2a4a);
        }

        .flow-snapshot-item.active {
          background: rgba(0, 212, 255, 0.1);
          border-color: var(--primary, #00d4ff);
        }

        .flow-snapshot-item.drag-over {
          border-color: var(--primary, #00d4ff);
          border-style: dashed;
        }

        .flow-snapshot-item.dragging {
          opacity: 0.5;
        }

        .flow-snapshot-drag-handle {
          color: var(--text-muted, #666);
          cursor: grab;
          padding: 2px;
        }

        .flow-snapshot-drag-handle:active {
          cursor: grabbing;
        }

        .flow-snapshot-active-dot {
          width: 6px;
          height: 6px;
          background: var(--primary, #00d4ff);
          border-radius: 50%;
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .flow-snapshot-favorite {
          background: none;
          border: none;
          padding: 2px;
          cursor: pointer;
          color: var(--text-muted, #666);
          transition: color 0.15s;
        }

        .flow-snapshot-favorite:hover {
          color: var(--warning, #f59e0b);
        }

        .flow-snapshot-favorite.active {
          color: var(--warning, #f59e0b);
        }

        .flow-snapshot-name {
          flex: 1;
          font-size: 12px;
          color: var(--text, #e0e0e0);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .flow-snapshot-name-input {
          flex: 1;
          background: var(--input, #1a1a2e);
          border: 1px solid var(--border, #2d2d44);
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 12px;
          color: var(--text, #e0e0e0);
          outline: none;
        }

        .flow-snapshot-name-input:focus {
          border-color: var(--primary, #00d4ff);
        }

        .flow-snapshot-flows {
          display: flex;
          gap: 3px;
          margin-left: 4px;
        }

        .flow-snapshot-flow-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.2);
          flex-shrink: 0;
        }

        .flow-snapshot-pc-badge {
          display: flex;
          align-items: center;
          gap: 3px;
          padding: 2px 6px;
          background: rgba(139, 92, 246, 0.2);
          color: #a78bfa;
          border: none;
          border-radius: 4px;
          font-size: 10px;
          cursor: pointer;
          transition: background 0.15s;
        }

        .flow-snapshot-pc-badge:hover {
          background: rgba(139, 92, 246, 0.3);
        }

        .flow-snapshot-pc-empty {
          background: none;
          border: none;
          padding: 2px;
          cursor: pointer;
          color: var(--text-muted, #666);
          transition: color 0.15s;
        }

        .flow-snapshot-pc-empty:hover {
          color: #a78bfa;
        }

        .flow-snapshot-pc-input {
          width: 48px;
          background: var(--input, #1a1a2e);
          border: 1px solid var(--border, #2d2d44);
          border-radius: 4px;
          padding: 2px 4px;
          font-size: 10px;
          color: var(--text, #e0e0e0);
          text-align: center;
          outline: none;
        }

        .flow-snapshot-pc-input:focus {
          border-color: var(--primary, #00d4ff);
        }

        .flow-snapshot-more {
          background: none;
          border: none;
          padding: 2px;
          cursor: pointer;
          color: var(--text-muted, #666);
          transition: color 0.15s;
        }

        .flow-snapshot-more:hover {
          color: var(--text, #e0e0e0);
        }

        .flow-snapshot-context-menu {
          position: fixed;
          z-index: 1000;
          background: var(--surface-elevated, #232340);
          border: 1px solid var(--border, #2d2d44);
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          padding: 4px;
          min-width: 140px;
        }

        .flow-snapshot-context-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: none;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          color: var(--text, #e0e0e0);
          cursor: pointer;
          transition: background 0.15s;
        }

        .flow-snapshot-context-item:hover {
          background: var(--surface-hover, #2a2a4a);
        }

        .flow-snapshot-context-item.danger {
          color: var(--destructive, #ef4444);
        }

        .flow-snapshot-context-item.danger:hover {
          background: rgba(239, 68, 68, 0.1);
        }

        .flow-snapshot-context-divider {
          height: 1px;
          background: var(--border, #2d2d44);
          margin: 4px 0;
        }
      `}</style>
    </div>
  )
})
