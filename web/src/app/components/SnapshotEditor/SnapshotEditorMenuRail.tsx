import { Button } from '@carbon/react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

const MENU_PINNED_STORAGE_KEY = 'map2_snapshot_menu_pinned'

interface SnapshotEditorMenuRailProps {
  prefersReducedMotion: boolean
  title: string
  dirty: boolean
  onCreate: () => void
  createPending: boolean
  onSave: () => void
  savePending: boolean
  saveDisabled: boolean
  onOpenWorkspace: () => void
  onDuplicate: () => void
  duplicatePending: boolean
  duplicateDisabled: boolean
  onOpenVersionHistory: () => void
  versionHistoryDisabled: boolean
  onOpenControlCenter: () => void
  controlCenterDisabled: boolean
  onAddFlow: () => void
  addFlowDisabled: boolean
  onOpenMidi: () => void
  midiDisabled: boolean
  midiTitle: string
  midiLearning: boolean
  onOpenLiveRuntime: () => void
  liveRuntimeLabel: string
  liveRuntimeActive: boolean
  onOpenPerform: () => void
  onUndo: () => void
  undoDisabled: boolean
  undoPending: boolean
  onRedo: () => void
  redoDisabled: boolean
  redoPending: boolean
  onPrevious: () => void
  previousDisabled: boolean
  previousTitle?: string
  onNext: () => void
  nextDisabled: boolean
  nextTitle?: string
  onToggleLock?: () => void
  lockVisible: boolean
  locked: boolean
  lockPending: boolean
  onToggleFavorite?: () => void
  favoriteVisible: boolean
  favoriteActive: boolean
  favoritePending: boolean
  onClearFlows: () => void
  clearFlowsDisabled: boolean
}

interface MenuItemConfig {
  id: string
  label: string
  activeLabel?: string
  pendingLabel?: string
  className: string
  onClick?: () => void
  disabled?: boolean
  pending?: boolean
  title?: string
}

export function SnapshotEditorMenuRail({
  prefersReducedMotion,
  title,
  dirty,
  onCreate,
  createPending,
  onSave,
  savePending,
  saveDisabled,
  onOpenWorkspace,
  onDuplicate,
  duplicatePending,
  duplicateDisabled,
  onOpenVersionHistory,
  versionHistoryDisabled,
  onOpenControlCenter,
  controlCenterDisabled,
  onAddFlow,
  addFlowDisabled,
  onOpenMidi,
  midiDisabled,
  midiTitle,
  midiLearning,
  onOpenLiveRuntime,
  liveRuntimeLabel,
  liveRuntimeActive,
  onOpenPerform,
  onUndo,
  undoDisabled,
  undoPending,
  onRedo,
  redoDisabled,
  redoPending,
  onPrevious,
  previousDisabled,
  previousTitle,
  onNext,
  nextDisabled,
  nextTitle,
  onToggleLock,
  lockVisible,
  locked,
  lockPending,
  onToggleFavorite,
  favoriteVisible,
  favoriteActive,
  favoritePending,
  onClearFlows,
  clearFlowsDisabled,
}: SnapshotEditorMenuRailProps) {
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [pinned, setPinned] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false
    }
    try {
      return window.localStorage.getItem(MENU_PINNED_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false
    }
    try {
      return window.localStorage.getItem(MENU_PINNED_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(MENU_PINNED_STORAGE_KEY, pinned ? 'true' : 'false')
    } catch {
      return
    }
  }, [pinned])

  useEffect(() => {
    if (pinned) {
      setOpen(true)
    }
  }, [pinned])

  useEffect(() => {
    if (!open || pinned) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, pinned])

  const runAction = (action?: () => void) => {
    if (!action) {
      return
    }
    action()
    if (!pinned) {
      setOpen(false)
    }
  }

  const primaryItems = useMemo<MenuItemConfig[]>(() => [
    {
      id: 'control-center',
      label: 'Open the control center?',
      className: 'snapshot-menu-rail__item--control-center',
      onClick: onOpenControlCenter,
      disabled: controlCenterDisabled,
    },
    {
      id: 'add-flow',
      label: 'Add a signal path?',
      className: 'snapshot-menu-rail__item--add-flow',
      onClick: onAddFlow,
      disabled: addFlowDisabled,
    },
    {
      id: 'midi',
      label: midiLearning ? 'MIDI learn is armed. Edit mappings?' : 'Edit MIDI mappings?',
      className: 'snapshot-menu-rail__item--midi',
      onClick: onOpenMidi,
      disabled: midiDisabled,
      title: midiTitle,
    },
    {
      id: 'live',
      label: liveRuntimeActive ? 'Live state is active. Inspect it?' : 'Inspect the live state?',
      className: 'snapshot-menu-rail__item--live',
      onClick: onOpenLiveRuntime,
      title: liveRuntimeLabel,
    },
    {
      id: 'perform',
      label: 'Open performance view?',
      className: 'snapshot-menu-rail__item--perform',
      onClick: onOpenPerform,
    },
    {
      id: 'create',
      label: 'Create a new snapshot?',
      pendingLabel: 'Creating a new snapshot...',
      className: 'snapshot-menu-rail__item--new',
      onClick: onCreate,
      disabled: createPending,
      pending: createPending,
    },
    {
      id: 'load',
      label: 'Load a saved snapshot?',
      className: 'snapshot-menu-rail__item--load',
      onClick: onOpenWorkspace,
      title,
    },
    {
      id: 'duplicate',
      label: 'Duplicate this snapshot?',
      pendingLabel: 'Duplicating this snapshot...',
      className: 'snapshot-menu-rail__item--duplicate',
      onClick: onDuplicate,
      disabled: duplicateDisabled,
      pending: duplicatePending,
    },
    {
      id: 'history',
      label: 'Review version history?',
      className: 'snapshot-menu-rail__item--history',
      onClick: onOpenVersionHistory,
      disabled: versionHistoryDisabled,
    },
    {
      id: 'save',
      label: dirty ? 'Save these changes?' : 'Save the current snapshot?',
      activeLabel: dirty ? 'Save these changes?' : undefined,
      pendingLabel: 'Saving these changes...',
      className: `snapshot-menu-rail__item--save${dirty ? ' is-dirty' : ''}`,
      onClick: onSave,
      disabled: saveDisabled,
      pending: savePending,
    },
  ], [
    addFlowDisabled,
    controlCenterDisabled,
    createPending,
    dirty,
    duplicateDisabled,
    duplicatePending,
    liveRuntimeActive,
    liveRuntimeLabel,
    midiDisabled,
    midiLearning,
    midiTitle,
    onAddFlow,
    onCreate,
    onDuplicate,
    onOpenControlCenter,
    onOpenLiveRuntime,
    onOpenMidi,
    onOpenPerform,
    onOpenVersionHistory,
    onOpenWorkspace,
    onSave,
    saveDisabled,
    savePending,
    title,
    versionHistoryDisabled,
  ])

  const utilityItems = useMemo<MenuItemConfig[]>(() => {
    const items: MenuItemConfig[] = [
      {
        id: 'undo',
        label: 'Undo the last change',
        pendingLabel: 'Undoing the last change...',
        className: 'snapshot-menu-rail__item--undo',
        onClick: onUndo,
        disabled: undoDisabled,
        pending: undoPending,
      },
      {
        id: 'redo',
        label: 'Redo the last change',
        pendingLabel: 'Redoing the last change...',
        className: 'snapshot-menu-rail__item--redo',
        onClick: onRedo,
        disabled: redoDisabled,
        pending: redoPending,
      },
      {
        id: 'previous',
        label: 'Go to the previous snapshot',
        className: 'snapshot-menu-rail__item--back',
        onClick: onPrevious,
        disabled: previousDisabled,
        title: previousTitle,
      },
      {
        id: 'next',
        label: 'Go to the next snapshot',
        className: 'snapshot-menu-rail__item--forward',
        onClick: onNext,
        disabled: nextDisabled,
        title: nextTitle,
      },
    ]

    if (lockVisible) {
      items.push({
        id: 'lock',
        label: locked ? 'Unlock editing' : 'Lock editing',
        pendingLabel: locked ? 'Unlocking editing...' : 'Locking editing...',
        className: 'snapshot-menu-rail__item--lock',
        onClick: onToggleLock,
        disabled: lockPending || !onToggleLock,
        pending: lockPending,
      })
    }

    if (favoriteVisible) {
      items.push({
        id: 'favorite',
        label: favoriteActive ? 'Remove from favorites' : 'Add to favorites',
        pendingLabel: favoriteActive ? 'Updating favorites...' : 'Updating favorites...',
        className: 'snapshot-menu-rail__item--favorite',
        onClick: onToggleFavorite,
        disabled: favoritePending || !onToggleFavorite,
        pending: favoritePending,
      })
    }

    items.push({
      id: 'clear',
      label: 'Clear all signal paths',
      className: 'snapshot-menu-rail__item--clear',
      onClick: onClearFlows,
      disabled: clearFlowsDisabled,
    })

    return items
  }, [
    clearFlowsDisabled,
    favoriteActive,
    favoritePending,
    favoriteVisible,
    lockPending,
    lockVisible,
    locked,
    nextDisabled,
    nextTitle,
    onClearFlows,
    onNext,
    onPrevious,
    onRedo,
    onToggleFavorite,
    onToggleLock,
    onUndo,
    previousDisabled,
    previousTitle,
    redoDisabled,
    redoPending,
    undoDisabled,
    undoPending,
  ])

  const transition = prefersReducedMotion
    ? { duration: 0 }
    : {
        type: 'spring' as const,
        stiffness: 320,
        damping: 28,
        mass: 0.9,
      }

  return (
    <div
      ref={rootRef}
      className={`snapshot-menu-rail${open ? ' is-open' : ''}${pinned ? ' is-pinned' : ''}`}
    >
      <AnimatePresence initial={false}>
        {open ? (
          <motion.aside
            key="panel"
            className="snapshot-menu-rail__panel-shell"
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={transition}
          >
            <div
              id={panelId}
              className="snapshot-menu-rail__panel"
              role="toolbar"
              aria-label="Snapshot editor quick menu"
            >
              <div className="snapshot-menu-rail__header">
                <div className="snapshot-menu-rail__header-copy">
                  <p className="snapshot-menu-rail__eyebrow">Quick Menu</p>
                  <h2 className="snapshot-menu-rail__title">10 quick questions</h2>
                  <p className="snapshot-menu-rail__summary">
                    Text-only controls for the snapshot editor.
                  </p>
                </div>
                <div className="snapshot-menu-rail__header-actions">
                  <Button
                    size="sm"
                    kind={pinned ? 'primary' : 'ghost'}
                    className={`snapshot-menu-rail__header-button${pinned ? ' is-active' : ''}`}
                    onClick={() => {
                      setPinned((current) => {
                        const next = !current
                        if (next) {
                          setOpen(true)
                        }
                        return next
                      })
                    }}
                  >
                    {pinned ? 'Unpin menu' : 'Pin menu'}
                  </Button>
                  {!pinned ? (
                    <Button
                      size="sm"
                      kind="ghost"
                      className="snapshot-menu-rail__header-button"
                      onClick={() => setOpen(false)}
                    >
                      Close
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="snapshot-menu-rail__section">
                <p className="snapshot-menu-rail__section-label">Primary</p>
                <div className="snapshot-menu-rail__list">
                  {primaryItems.map((item) => (
                    <Button
                      key={item.id}
                      size="md"
                      kind="ghost"
                      className={`snapshot-menu-rail__item ${item.className}`}
                      onClick={() => runAction(item.onClick)}
                      disabled={item.disabled}
                      title={item.title}
                    >
                      {item.pending ? item.pendingLabel : item.activeLabel ?? item.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="snapshot-menu-rail__section snapshot-menu-rail__section--utility">
                <p className="snapshot-menu-rail__section-label">Utilities</p>
                <div className="snapshot-menu-rail__list">
                  {utilityItems.map((item) => (
                    <Button
                      key={item.id}
                      size="sm"
                      kind="ghost"
                      className={`snapshot-menu-rail__item snapshot-menu-rail__item--utility ${item.className}`}
                      onClick={() => runAction(item.onClick)}
                      disabled={item.disabled}
                      title={item.title}
                    >
                      {item.pending ? item.pendingLabel : item.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      <div className="snapshot-menu-rail__rail">
        <Button
          size="sm"
          kind={open ? 'secondary' : 'primary'}
          className={`snapshot-menu-rail__trigger${open ? ' is-open' : ''}`}
          aria-controls={panelId}
          aria-expanded={open}
          onClick={() => {
            if (open && pinned) {
              setPinned(false)
              setOpen(false)
              return
            }
            setOpen((current) => !current)
          }}
        >
          {open ? (pinned ? 'Pinned menu' : 'Hide menu') : 'Show menu'}
        </Button>
      </div>
    </div>
  )
}

export default SnapshotEditorMenuRail
