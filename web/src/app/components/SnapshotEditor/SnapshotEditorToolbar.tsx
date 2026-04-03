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
import { useEffect, useId, useState } from 'react'

const TOOLBAR_COLLAPSE_STORAGE_KEY = 'map2_snapshot_toolbar_collapsed'

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
  onOpenWorkspace,
}: SnapshotEditorToolbarProps) {
  const toolbarPanelId = useId()
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
                    hasIconOnly
                    size="sm"
                    kind="secondary"
                    className="snapshot-toolbar__button snapshot-toolbar__button--new"
                    renderIcon={Add}
                    iconDescription={createPending ? 'Creating snapshot' : 'New snapshot'}
                    aria-label={createPending ? 'Creating snapshot' : 'New snapshot'}
                    title={createPending ? 'Creating snapshot' : 'New snapshot'}
                    onClick={onCreate}
                    disabled={createPending}
                  />
                  <Button
                    hasIconOnly
                    size="sm"
                    kind="secondary"
                    className="snapshot-toolbar__button snapshot-toolbar__button--load"
                    renderIcon={FolderOpen}
                    iconDescription="Load snapshot"
                    aria-label="Load snapshot"
                    onClick={onOpenWorkspace}
                    title={title}
                  />
                  <Button
                    hasIconOnly
                    size="sm"
                    kind="ghost"
                    className="snapshot-toolbar__button snapshot-toolbar__button--duplicate"
                    renderIcon={Copy}
                    iconDescription={duplicatePending ? 'Duplicating snapshot' : 'Duplicate snapshot'}
                    aria-label={duplicatePending ? 'Duplicating snapshot' : 'Duplicate snapshot'}
                    title={duplicatePending ? 'Duplicating snapshot' : 'Duplicate snapshot'}
                    onClick={onDuplicate}
                    disabled={duplicateDisabled}
                  />
                  <Button
                    hasIconOnly
                    size="sm"
                    kind={dirty ? 'primary' : 'secondary'}
                    className={`snapshot-toolbar__button snapshot-toolbar__button--update ${dirty ? 'is-dirty' : ''}`}
                    renderIcon={Renew}
                    iconDescription={savePending ? 'Updating snapshot' : 'Update snapshot'}
                    aria-label={savePending ? 'Updating snapshot' : 'Update snapshot'}
                    title={savePending ? 'Updating snapshot' : 'Update snapshot'}
                    onClick={onSave}
                    disabled={saveDisabled}
                  />
                </div>

                <div className="snapshot-toolbar__group" role="group" aria-label="History and lock actions">
                  <Button
                    hasIconOnly
                    size="sm"
                    kind="ghost"
                    className="snapshot-toolbar__button snapshot-toolbar__button--undo"
                    renderIcon={Undo}
                    iconDescription={undoPending ? 'Undoing change' : 'Undo'}
                    aria-label={undoPending ? 'Undoing change' : 'Undo'}
                    title={undoPending ? 'Undoing change' : 'Undo'}
                    onClick={onUndo}
                    disabled={undoDisabled}
                  />
                  <Button
                    hasIconOnly
                    size="sm"
                    kind="ghost"
                    className="snapshot-toolbar__button snapshot-toolbar__button--redo"
                    renderIcon={Redo}
                    iconDescription={redoPending ? 'Redoing change' : 'Redo'}
                    aria-label={redoPending ? 'Redoing change' : 'Redo'}
                    title={redoPending ? 'Redoing change' : 'Redo'}
                    onClick={onRedo}
                    disabled={redoDisabled}
                  />
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

                <div className="snapshot-toolbar__group" role="group" aria-label="Navigation and favorites actions">
                  <Button
                    hasIconOnly
                    size="sm"
                    kind="ghost"
                    className="snapshot-toolbar__button snapshot-toolbar__button--back"
                    renderIcon={ArrowLeft}
                    iconDescription="Back"
                    aria-label="Back"
                    onClick={onPrevious}
                    disabled={previousDisabled}
                    title={previousTitle}
                  />
                  <Button
                    hasIconOnly
                    size="sm"
                    kind="ghost"
                    className="snapshot-toolbar__button snapshot-toolbar__button--forward"
                    renderIcon={ArrowRight}
                    iconDescription="Forward"
                    aria-label="Forward"
                    onClick={onNext}
                    disabled={nextDisabled}
                    title={nextTitle}
                  />
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
        hasIconOnly
        iconDescription={collapsed ? 'Expand snapshots toolbar' : 'Collapse snapshots toolbar'}
        aria-label={collapsed ? 'Expand snapshots toolbar' : 'Collapse snapshots toolbar'}
        title={collapsed ? 'Expand snapshots toolbar' : 'Collapse snapshots toolbar'}
        aria-controls={toolbarPanelId}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((current) => !current)}
      />
    </div>
  )
}
