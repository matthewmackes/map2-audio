import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Favorite,
  FavoriteFilled,
  Play,
  Recording,
  Redo,
  Renew,
  Undo,
} from '@carbon/icons-react'
import { Button } from '@carbon/react'
import { motion } from 'framer-motion'
import type { SnapshotGoLiveState } from '../../utils/snapshotGoLiveState'

interface SnapshotEditorToolbarProps {
  title: string
  dirty: boolean
  prefersReducedMotion: boolean
  goLiveState: SnapshotGoLiveState
  activeSnapshot: boolean
  onGoLive: () => void
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
  onTapTempo: () => void
  tapTempoDisabled: boolean
  tapTempoPending: boolean
  onToggleFavorite?: () => void
  favoriteVisible: boolean
  favoriteActive: boolean
  favoritePending: boolean
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
  goLiveState,
  activeSnapshot,
  onGoLive,
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
  onTapTempo,
  tapTempoDisabled,
  tapTempoPending,
  onToggleFavorite,
  favoriteVisible,
  favoriteActive,
  favoritePending,
  onToggleSetlist,
  setlistMode,
  setlistPending,
  setlistTitle,
  onOpenWorkspace,
}: SnapshotEditorToolbarProps) {
  return (
    <div className={`snapshot-toolbar ${dirty ? 'is-dirty' : ''}`} role="toolbar" aria-label="Snapshots toolbar">
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
      <div className="snapshot-toolbar__label" title={title}>
        <span className="snapshot-toolbar__title">Snapshots</span>
      </div>
      <div className="snapshot-toolbar__actions">
        {goLiveState.phase === 'live' ? (
          <span
            className="snapshot-toolbar__live-indicator juce-grid-page__snapshot-status-state-label is-current is-blinking"
            aria-live="polite"
          >
            LIVE
          </span>
        ) : (
          <Button
            size="sm"
            kind={goLiveState.phase === 'error' ? 'danger' : 'primary'}
            className={`snapshot-toolbar__button snapshot-toolbar__button--go-live ${goLiveState.phase === 'activating' ? 'is-pending' : ''}`}
            renderIcon={goLiveState.phase === 'activating' || goLiveState.phase === 'error' ? Renew : Play}
            onClick={onGoLive}
            disabled={!activeSnapshot || goLiveState.disabled}
          >
            {goLiveState.label}
          </Button>
        )}
        <Button
          size="sm"
          kind="secondary"
          className="snapshot-toolbar__button snapshot-toolbar__button--new"
          onClick={onCreate}
          disabled={createPending}
        >
          {createPending ? 'Creating…' : 'New'}
        </Button>
        <Button
          size="sm"
          kind={dirty ? 'primary' : 'secondary'}
          className="snapshot-toolbar__button snapshot-toolbar__button--save"
          onClick={onSave}
          disabled={saveDisabled}
        >
          <span className="snapshot-toolbar__button-label">
            <span>{savePending ? 'Saving…' : 'Save'}</span>
            {dirty ? <span className="snapshot-toolbar__dirty-dot" aria-hidden /> : null}
          </span>
        </Button>
        <Button
          size="sm"
          kind="ghost"
          className="snapshot-toolbar__button snapshot-toolbar__button--prev"
          renderIcon={ArrowLeft}
          onClick={onPrevious}
          disabled={previousDisabled}
          title={previousTitle}
        >
          Prev
        </Button>
        <Button
          size="sm"
          kind="ghost"
          className="snapshot-toolbar__button snapshot-toolbar__button--next"
          renderIcon={ArrowRight}
          onClick={onNext}
          disabled={nextDisabled}
          title={nextTitle}
        >
          Next
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
        {lockVisible ? (
          <Button
            size="sm"
            kind={locked ? 'secondary' : 'ghost'}
            className="snapshot-toolbar__button snapshot-toolbar__button--lock"
            onClick={onToggleLock}
            disabled={lockPending || !onToggleLock}
          >
            {lockPending ? (locked ? 'Unlocking…' : 'Locking…') : (locked ? 'Unlock' : 'Lock')}
          </Button>
        ) : null}
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
        <Button
          size="sm"
          kind="ghost"
          className="snapshot-toolbar__button snapshot-toolbar__button--tap"
          renderIcon={Recording}
          onClick={onTapTempo}
          disabled={tapTempoDisabled}
        >
          {tapTempoPending ? 'Tapping…' : 'Tap Tempo'}
        </Button>
        {favoriteVisible ? (
          <Button
            size="sm"
            kind={favoriteActive ? 'secondary' : 'ghost'}
            className="snapshot-toolbar__button snapshot-toolbar__button--favorite"
            renderIcon={favoriteActive ? FavoriteFilled : Favorite}
            onClick={onToggleFavorite}
            disabled={favoritePending || !onToggleFavorite}
          >
            {favoritePending ? 'Saving…' : favoriteActive ? 'Favorited' : 'Favorite'}
          </Button>
        ) : null}
        <Button
          size="sm"
          kind={setlistMode ? 'secondary' : 'ghost'}
          className="snapshot-toolbar__button snapshot-toolbar__button--setlist"
          aria-pressed={setlistMode}
          onClick={onToggleSetlist}
          disabled={setlistPending}
          title={setlistTitle}
        >
          {setlistPending ? 'Saving…' : 'Setlist'}
        </Button>
        <Button
          size="sm"
          kind="secondary"
          className="snapshot-toolbar__button snapshot-toolbar__button--load"
          onClick={onOpenWorkspace}
          aria-label="Open snapshots workspace"
          title={title}
        >
          Load
        </Button>
      </div>
    </div>
  )
}
