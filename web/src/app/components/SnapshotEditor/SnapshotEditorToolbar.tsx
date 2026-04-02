import {
  Add,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Favorite,
  FavoriteFilled,
  FolderOpen,
  Locked,
  Redo,
  Renew,
  Undo,
  Unlocked,
} from '@carbon/icons-react'
import { Button } from '@carbon/react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

const TOOLBAR_COLLAPSE_STORAGE_KEY = 'map2_snapshot_toolbar_collapsed'

type ToolbarFavoriteSnapshot = {
  id: number
  name: string
  programNumber: number | null
  isActive: boolean
}

interface SnapshotEditorToolbarProps {
  title: string
  dirty: boolean
  prefersReducedMotion: boolean
  onCreate: () => void
  createPending: boolean
  onSave: () => void
  savePending: boolean
  saveDisabled: boolean
  onPrevious: () => void
  previousDisabled: boolean
  previousTitle?: string
  onNext: () => void
  nextDisabled: boolean
  nextTitle?: string
  onDuplicate: () => void
  duplicatePending: boolean
  duplicateDisabled: boolean
  onToggleLock?: () => void
  lockVisible: boolean
  locked: boolean
  lockPending: boolean
  onUndo: () => void
  undoDisabled: boolean
  undoPending: boolean
  onRedo: () => void
  redoDisabled: boolean
  redoPending: boolean
  onToggleFavorite?: () => void
  favoriteVisible: boolean
  favoriteActive: boolean
  favoritePending: boolean
  favoriteSnapshots: ToolbarFavoriteSnapshot[]
  onOpenFavoriteSnapshot: (snapshotId: number) => void
  onToggleSetlist: () => void
  setlistMode: boolean
  setlistPending: boolean
  setlistTitle: string
  onOpenWorkspace: () => void
}

export function SnapshotEditorToolbar({
  title,
  dirty,
  prefersReducedMotion,
  onCreate,
  createPending,
  onSave,
  savePending,
  saveDisabled,
  onPrevious,
  previousDisabled,
  previousTitle,
  onNext,
  nextDisabled,
  nextTitle,
  onDuplicate,
  duplicatePending,
  duplicateDisabled,
  onToggleLock,
  lockVisible,
  locked,
  lockPending,
  onUndo,
  undoDisabled,
  undoPending,
  onRedo,
  redoDisabled,
  redoPending,
  onToggleFavorite,
  favoriteVisible,
  favoriteActive,
  favoritePending,
  favoriteSnapshots,
  onOpenFavoriteSnapshot,
  onToggleSetlist,
  setlistMode,
  setlistPending,
  setlistTitle,
  onOpenWorkspace,
}: SnapshotEditorToolbarProps) {
  const [setlistMenuOpen, setSetlistMenuOpen] = useState(false)
  const setlistMenuId = useId()
  const toolbarPanelId = useId()
  const setlistShellRef = useRef<HTMLDivElement | null>(null)
  const setlistMenuRef = useRef<HTMLDivElement | null>(null)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false
    }
    try {
      return window.localStorage.getItem(TOOLBAR_COLLAPSE_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(TOOLBAR_COLLAPSE_STORAGE_KEY, collapsed ? 'true' : 'false')
    } catch {}
  }, [collapsed])

  useEffect(() => {
    if (!collapsed) {
      return
    }
    setSetlistMenuOpen(false)
  }, [collapsed])

  useEffect(() => {
    if (!setlistMenuOpen || collapsed) {
      return undefined
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (setlistShellRef.current?.contains(target) || setlistMenuRef.current?.contains(target)) {
        return
      }
      setSetlistMenuOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      setSetlistMenuOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [setlistMenuOpen])

  const favoriteSnapshotCountLabel = useMemo(() => {
    const count = favoriteSnapshots.length
    return `${count} favorite snapshot${count === 1 ? '' : 's'}`
  }, [favoriteSnapshots])

  const handleSetlistModeToggle = () => {
    onToggleSetlist()
    setSetlistMenuOpen(false)
  }

  const handleFavoriteSnapshotOpen = (snapshotId: number) => {
    onOpenFavoriteSnapshot(snapshotId)
    setSetlistMenuOpen(false)
  }

  return (
    <div className="snapshot-toolbar-shell">
      <AnimatePresence initial={false}>
        {!collapsed ? (
          <motion.div
            key="tray"
            className="snapshot-toolbar__tray"
            initial={{ width: 0, opacity: 0, x: -28, marginRight: 0 }}
            animate={{ width: 'auto', opacity: 1, x: 0, marginRight: 12 }}
            exit={{ width: 0, opacity: 0, x: -28, marginRight: 0 }}
            transition={{
              type: 'spring',
              stiffness: 320,
              damping: 28,
              mass: 0.9,
              opacity: { duration: 0.2, ease: 'easeOut' },
            }}
          >
            <div
              id={toolbarPanelId}
              className={`snapshot-toolbar ${dirty ? 'is-dirty' : ''}`}
              role="toolbar"
              aria-label="Snapshots toolbar"
            >
              {dirty && (
                prefersReducedMotion ? (
                  <span className="snapshot-toolbar__pulse" aria-hidden />
                ) : (
                  <motion.span
                    className="snapshot-toolbar__pulse"
                    aria-hidden
                    initial={{ scale: 0.9, opacity: 0.7 }}
                    animate={{ scale: [0.95, 1.25, 0.95], opacity: [0.8, 0.25, 0.8] }}
                    transition={{ repeat: Infinity, repeatType: 'loop', stiffness: 80, damping: 20, duration: 1 }}
                  />
                )
              )}
              <div className="snapshot-toolbar__actions">
                <div className="snapshot-toolbar__group" role="group" aria-label="Snapshot workflow actions">
                  <Button
                    size="sm"
                    kind="secondary"
                    className="snapshot-toolbar__button snapshot-toolbar__button--new"
                    renderIcon={Add}
                    onClick={onCreate}
                    disabled={createPending}
                  >
                    {createPending ? 'Creating…' : 'New'}
                  </Button>
                  <Button
                    size="sm"
                    kind="secondary"
                    className="snapshot-toolbar__button snapshot-toolbar__button--load"
                    renderIcon={FolderOpen}
                    onClick={onOpenWorkspace}
                    title={title}
                  >
                    Load
                  </Button>
                  <Button
                    size="sm"
                    kind="ghost"
                    className="snapshot-toolbar__button snapshot-toolbar__button--duplicate"
                    renderIcon={Copy}
                    onClick={onDuplicate}
                    disabled={duplicateDisabled}
                  >
                    {duplicatePending ? 'Duplicating…' : 'Duplicate'}
                  </Button>
                  <Button
                    size="sm"
                    kind={dirty ? 'primary' : 'secondary'}
                    className="snapshot-toolbar__button snapshot-toolbar__button--update"
                    renderIcon={Renew}
                    onClick={onSave}
                    disabled={saveDisabled}
                  >
                    <span className="snapshot-toolbar__button-label">
                      <span>{savePending ? 'Updating…' : 'Update'}</span>
                      {dirty ? <span className="snapshot-toolbar__dirty-dot" aria-hidden /> : null}
                    </span>
                  </Button>
                </div>

                <div className="snapshot-toolbar__group" role="group" aria-label="History and lock actions">
                  <Button
                    size="sm"
                    kind="ghost"
                    className="snapshot-toolbar__button snapshot-toolbar__button--undo"
                    renderIcon={Undo}
                    onClick={onUndo}
                    disabled={undoDisabled}
                  >
                    {undoPending ? 'Undoing…' : 'Undo'}
                  </Button>
                  <Button
                    size="sm"
                    kind="ghost"
                    className="snapshot-toolbar__button snapshot-toolbar__button--redo"
                    renderIcon={Redo}
                    onClick={onRedo}
                    disabled={redoDisabled}
                  >
                    {redoPending ? 'Redoing…' : 'Redo'}
                  </Button>
                  {lockVisible ? (
                    <Button
                      hasIconOnly
                      size="sm"
                      kind={locked ? 'secondary' : 'ghost'}
                      className={`snapshot-toolbar__button snapshot-toolbar__icon-button snapshot-toolbar__button--lock ${locked ? 'is-locked' : ''}`}
                      renderIcon={locked ? Locked : Unlocked}
                      iconDescription={locked ? 'Unlock snapshot editing' : 'Lock snapshot editing'}
                      aria-pressed={locked}
                      aria-label={locked ? 'Unlock snapshot editing' : 'Lock snapshot editing'}
                      title={locked ? 'Unlock snapshot editing' : 'Lock snapshot editing'}
                      onClick={onToggleLock}
                      disabled={lockPending || !onToggleLock}
                    />
                  ) : null}
                </div>

                <div className="snapshot-toolbar__group" role="group" aria-label="Setlist and navigation actions">
                  <div className="snapshot-toolbar__setlist-shell" ref={setlistShellRef}>
                    <Button
                      size="sm"
                      kind={setlistMode ? 'secondary' : 'ghost'}
                      className="snapshot-toolbar__button snapshot-toolbar__button--setlist"
                      renderIcon={FavoriteFilled}
                      aria-haspopup="menu"
                      aria-expanded={setlistMenuOpen}
                      aria-controls={setlistMenuOpen ? setlistMenuId : undefined}
                      onClick={() => setSetlistMenuOpen((current) => !current)}
                      title="Open the favorite snapshots setlist"
                    >
                      Setlist (Favorites)
                    </Button>

                    {setlistMenuOpen ? (
                      <div
                        ref={setlistMenuRef}
                        id={setlistMenuId}
                        className="snapshot-toolbar__setlist-menu"
                        role="menu"
                        aria-label="Favorite snapshots setlist"
                      >
                        <div className="snapshot-toolbar__setlist-menu-header">
                          <div>
                            <p className="snapshot-toolbar__setlist-menu-eyebrow">Favorite snapshots</p>
                            <h3 className="snapshot-toolbar__setlist-menu-title">Quick list</h3>
                          </div>
                          <span className={`snapshot-toolbar__setlist-mode-badge ${setlistMode ? 'is-active' : ''}`}>
                            {setlistMode ? 'Setlist on' : 'Program on'}
                          </span>
                        </div>

                        <button
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={setlistMode}
                          className="snapshot-toolbar__setlist-menu-item snapshot-toolbar__setlist-menu-item--mode"
                          onClick={handleSetlistModeToggle}
                          disabled={setlistPending}
                          title={setlistTitle}
                        >
                          <span className="snapshot-toolbar__setlist-menu-copy">
                            <span className="snapshot-toolbar__setlist-menu-label">
                              {setlistPending
                                ? 'Updating setlist navigation…'
                                : setlistMode
                                  ? 'Use all snapshots for Back and Forward'
                                  : 'Use favorites for Back and Forward'}
                            </span>
                            <span className="snapshot-toolbar__setlist-menu-meta">{setlistTitle}</span>
                          </span>
                          <span className="snapshot-toolbar__setlist-menu-action">{setlistMode ? 'Disable' : 'Enable'}</span>
                        </button>

                        <div className="snapshot-toolbar__setlist-menu-divider" />

                        <p className="snapshot-toolbar__setlist-menu-summary">{favoriteSnapshotCountLabel}</p>

                        {favoriteSnapshots.length > 0 ? (
                          <div className="snapshot-toolbar__setlist-menu-list">
                            {favoriteSnapshots.map((snapshot) => (
                              <button
                                key={snapshot.id}
                                type="button"
                                role="menuitem"
                                className={`snapshot-toolbar__setlist-menu-item ${snapshot.isActive ? 'is-current' : ''}`}
                                onClick={() => handleFavoriteSnapshotOpen(snapshot.id)}
                              >
                                <span className="snapshot-toolbar__setlist-menu-copy">
                                  <span className="snapshot-toolbar__setlist-menu-label">{snapshot.name}</span>
                                  <span className="snapshot-toolbar__setlist-menu-meta">
                                    {snapshot.programNumber != null
                                      ? `Program ${String(snapshot.programNumber).padStart(3, '0')}`
                                      : 'No MIDI program'}
                                  </span>
                                </span>
                                <span className="snapshot-toolbar__setlist-menu-action">
                                  {snapshot.isActive ? 'Current' : 'Load'}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="snapshot-toolbar__setlist-menu-empty">
                            Add favorites with the heart button and they will appear here.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>

                  <Button
                    size="sm"
                    kind="ghost"
                    className="snapshot-toolbar__button snapshot-toolbar__button--back"
                    renderIcon={ArrowLeft}
                    onClick={onPrevious}
                    disabled={previousDisabled}
                    title={previousTitle}
                  >
                    Back
                  </Button>
                  <Button
                    size="sm"
                    kind="ghost"
                    className="snapshot-toolbar__button snapshot-toolbar__button--forward"
                    renderIcon={ArrowRight}
                    onClick={onNext}
                    disabled={nextDisabled}
                    title={nextTitle}
                  >
                    Forward
                  </Button>
                  {favoriteVisible ? (
                    <Button
                      hasIconOnly
                      size="sm"
                      kind={favoriteActive ? 'secondary' : 'ghost'}
                      className={`snapshot-toolbar__button snapshot-toolbar__icon-button snapshot-toolbar__button--favorite ${favoriteActive ? 'is-active' : ''}`}
                      renderIcon={favoriteActive ? FavoriteFilled : Favorite}
                      iconDescription={favoriteActive ? 'Remove snapshot from favorites' : 'Mark snapshot as favorite'}
                      aria-pressed={favoriteActive}
                      aria-label={favoriteActive ? 'Remove snapshot from favorites' : 'Mark snapshot as favorite'}
                      title={favoriteActive ? 'Remove snapshot from favorites' : 'Mark snapshot as favorite'}
                      onClick={onToggleFavorite}
                      disabled={favoritePending || !onToggleFavorite}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Button
        size="sm"
        kind={collapsed ? 'primary' : 'tertiary'}
        className={`snapshot-toolbar__toggle ${collapsed ? 'is-collapsed' : ''}`}
        renderIcon={collapsed ? ChevronRight : ChevronLeft}
        aria-controls={toolbarPanelId}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((current) => !current)}
      >
        Snapshots
      </Button>
    </div>
  )
}
