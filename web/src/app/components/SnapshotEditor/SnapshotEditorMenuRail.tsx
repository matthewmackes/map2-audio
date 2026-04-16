import { Camera, List } from '@carbon/icons-react'
import { Button } from '@carbon/react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

const MENU_PINNED_STORAGE_KEY = 'map2_snapshot_menu_pinned'

interface SnapshotEditorMenuRailProps {
  prefersReducedMotion: boolean
  onCreateSnapshot: () => void
  createSnapshotDisabled: boolean
  createSnapshotPending: boolean
  onOpenControlCenter: () => void
  controlCenterDisabled: boolean
  onAddFlow: () => void
  addFlowDisabled: boolean
  onOpenMidi: () => void
  midiDisabled: boolean
  midiTitle: string
  onOpenLiveRuntime: () => void
  liveRuntimeLabel: string
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
  onCreateSnapshot,
  createSnapshotDisabled,
  createSnapshotPending,
  onOpenControlCenter,
  controlCenterDisabled,
  onAddFlow,
  addFlowDisabled,
  onOpenMidi,
  midiDisabled,
  midiTitle,
  onOpenLiveRuntime,
  liveRuntimeLabel,
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

  const primaryItems = useMemo<MenuItemConfig[]>(() => {
    return [
      {
        id: 'control-center',
        label: 'Snapshot configuration',
        className: 'snapshot-menu-rail__item--control-center',
        onClick: onOpenControlCenter,
        disabled: controlCenterDisabled,
      },
      {
        id: 'add-flow',
        label: 'Add signal path',
        className: 'snapshot-menu-rail__item--add-flow',
        onClick: onAddFlow,
        disabled: addFlowDisabled,
      },
      {
        id: 'midi',
        label: 'Edit MIDI mappings',
        className: 'snapshot-menu-rail__item--midi',
        onClick: onOpenMidi,
        disabled: midiDisabled,
        title: midiTitle,
      },
      {
        id: 'live',
        label: 'Inspect live state',
        className: 'snapshot-menu-rail__item--live',
        onClick: onOpenLiveRuntime,
        title: liveRuntimeLabel,
      },
      {
        id: 'perform',
        label: 'Open performance view',
        className: 'snapshot-menu-rail__item--perform',
        onClick: onOpenPerform,
      },
    ]
  }, [
    addFlowDisabled,
    controlCenterDisabled,
    liveRuntimeLabel,
    midiDisabled,
    midiTitle,
    onAddFlow,
    onOpenControlCenter,
    onOpenLiveRuntime,
    onOpenMidi,
    onOpenPerform,
  ])

  const utilityItems = useMemo<MenuItemConfig[]>(() => {
    return [
      {
        id: 'undo',
        label: 'Undo last change',
        pendingLabel: 'Undoing the last change...',
        className: 'snapshot-menu-rail__item--undo',
        onClick: onUndo,
        disabled: undoDisabled,
        pending: undoPending,
      },
      {
        id: 'redo',
        label: 'Redo last change',
        pendingLabel: 'Redoing the last change...',
        className: 'snapshot-menu-rail__item--redo',
        onClick: onRedo,
        disabled: redoDisabled,
        pending: redoPending,
      },
      {
        id: 'previous',
        label: 'Open previous snapshot',
        className: 'snapshot-menu-rail__item--back',
        onClick: onPrevious,
        disabled: previousDisabled,
        title: previousTitle,
      },
      {
        id: 'next',
        label: 'Open next snapshot',
        className: 'snapshot-menu-rail__item--forward',
        onClick: onNext,
        disabled: nextDisabled,
        title: nextTitle,
      },
    ]
  }, [
    nextDisabled,
    nextTitle,
    onNext,
    onPrevious,
    onRedo,
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
  const primaryActionCount = primaryItems.length + 1

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
              role="menu"
              aria-label="Snapshot editor quick actions"
            >
              <div className="snapshot-menu-rail__header">
                <div className="snapshot-menu-rail__header-copy">
                  <p className="snapshot-menu-rail__eyebrow">Snapshot Editor</p>
                  <h2 className="snapshot-menu-rail__title">{primaryActionCount} quick actions</h2>
                  <p className="snapshot-menu-rail__summary">
                    Carbon-aligned actions for the current snapshot workflow.
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
                <p className="snapshot-menu-rail__section-label">Actions</p>
                <Button
                  size="sm"
                  kind="primary"
                  renderIcon={Camera}
                  className="snapshot-menu-rail__create snapshot-menu-rail__create-button"
                  role="menuitem"
                  aria-label="Create Snapshot"
                  title="Create Snapshot"
                  onClick={() => runAction(onCreateSnapshot)}
                  disabled={createSnapshotDisabled}
                >
                  {createSnapshotPending ? 'Creating…' : 'Create'}
                </Button>
                <div className="snapshot-menu-rail__list">
                  {primaryItems.map((item) => (
                    <Button
                      key={item.id}
                      size="sm"
                      kind="ghost"
                      className={`snapshot-menu-rail__item ${item.className}`}
                      role="menuitem"
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
                      role="menuitem"
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
          renderIcon={List}
          hasIconOnly
          iconDescription="Quick actions"
          aria-controls={panelId}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => {
            if (open && pinned) {
              setPinned(false)
              setOpen(false)
              return
            }
            setOpen((current) => !current)
          }}
        />
      </div>
    </div>
  )
}

export default SnapshotEditorMenuRail
