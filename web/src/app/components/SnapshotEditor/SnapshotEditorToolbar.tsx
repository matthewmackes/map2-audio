import { Music, Redo, Router, Save, Settings, SettingsAdjust, Undo } from '@carbon/icons-react'
import { Button } from '@carbon/react'

type MonitorSegment = 'input' | 'output' | 'clip'

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
  onOpenVersionHistory: () => void
  versionHistoryDisabled: boolean
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
  activeLabel?: string
  readOnly?: boolean
  liveLabel?: string
  liveStreaming?: boolean
  engineReconnecting?: boolean
  blendLabel?: string
  routingLabel?: string
  masterMuted?: boolean
  masterSoloed?: boolean
  onToggleMasterMute?: () => void
  onToggleMasterSolo?: () => void
  monitorInputActive?: boolean
  monitorOutputActive?: boolean
  monitorClipActive?: boolean
  onSelectMonitor?: (segment: MonitorSegment) => void
  onOpenRouting?: () => void
  onOpenDevices?: () => void
  onOpenMidiAssignments?: () => void
}

export function SnapshotEditorToolbar({
  title,
  dirty,
  prefersReducedMotion,
  onSave,
  savePending,
  saveDisabled,
  onUndo,
  undoDisabled,
  undoPending,
  onRedo,
  redoDisabled,
  redoPending,
  onOpenWorkspace,
  activeLabel = 'No chain assigned',
  readOnly = false,
  liveLabel = 'LIVE',
  liveStreaming = false,
  engineReconnecting = false,
  blendLabel = '100% BLEND',
  routingLabel = 'NO ROUTING',
  masterMuted = false,
  masterSoloed = false,
  onToggleMasterMute,
  onToggleMasterSolo,
  monitorInputActive = true,
  monitorOutputActive = true,
  monitorClipActive = false,
  onSelectMonitor,
  onOpenRouting,
  onOpenDevices,
  onOpenMidiAssignments,
}: SnapshotEditorToolbarProps) {
  const liveClassName = [
    'snapshot-toolbar__status-chip',
    'snapshot-toolbar__status-chip--live',
    engineReconnecting ? 'is-reconnecting' : '',
    liveStreaming && !prefersReducedMotion ? 'is-streaming' : '',
  ].filter(Boolean).join(' ')
  const resolvedLiveLabel = engineReconnecting ? 'RECONNECTING' : liveLabel

  const renderMonitorButton = (segment: MonitorSegment, label: string, active: boolean) => (
    <button
      type="button"
      className={`snapshot-toolbar__seg-button${active ? ' is-active' : ''}`}
      aria-pressed={active}
      onClick={() => onSelectMonitor?.(segment)}
    >
      {label}
    </button>
  )

  return (
    <div className="snapshot-toolbar-shell snapshot-toolbar-shell--schematic">
      <div
        className={`snapshot-toolbar snapshot-toolbar--schematic ${dirty ? 'is-dirty' : ''}`}
        role="toolbar"
        aria-label="Snapshot editor toolbar"
      >
        <nav className="snapshot-toolbar__breadcrumbs" aria-label="Snapshot breadcrumbs">
          <span>Snapshots</span>
          <span className="snapshot-toolbar__breadcrumb-separator">/</span>
          <span title={title}>{title}</span>
          <span className="snapshot-toolbar__breadcrumb-separator">/</span>
          <span className="snapshot-toolbar__breadcrumb-current">Snapshot Editor</span>
        </nav>

        <div className="snapshot-toolbar__group" role="group" aria-label="Snapshot edit actions">
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
          <Button
            hasIconOnly
            size="sm"
            kind={dirty ? 'primary' : 'ghost'}
            className={`snapshot-toolbar__button snapshot-toolbar__button--save ${dirty ? 'is-dirty' : ''}`}
            renderIcon={Save}
            iconDescription={savePending ? 'Saving snapshot' : 'Save'}
            aria-label={savePending ? 'Saving snapshot' : 'Save'}
            title={savePending ? 'Saving snapshot' : 'Save'}
            onClick={onSave}
            disabled={saveDisabled}
          />
          <Button
            hasIconOnly
            size="sm"
            kind="ghost"
            className="snapshot-toolbar__button snapshot-toolbar__button--settings"
            renderIcon={Settings}
            iconDescription="Settings"
            aria-label="Settings"
            title="Settings"
            onClick={onOpenWorkspace}
          />
        </div>

        <div className="snapshot-toolbar__group" role="group" aria-label="Snapshot live status">
          <span className="snapshot-toolbar__label">Active</span>
          <span className="snapshot-toolbar__value" title={activeLabel}>{activeLabel}</span>
          {readOnly ? <span className="snapshot-toolbar__status-chip snapshot-toolbar__status-chip--readonly">READ ONLY</span> : null}
          <span className={liveClassName}>
            <span className="snapshot-toolbar__status-dot" aria-hidden />
            {resolvedLiveLabel}
          </span>
          <button type="button" className="snapshot-toolbar__status-chip" onClick={onOpenRouting}>
            {blendLabel}
          </button>
          <span className="snapshot-toolbar__status-chip">{routingLabel}</span>
        </div>

        <div className="snapshot-toolbar__group" role="group" aria-label="Master mute and solo">
          <span className="snapshot-toolbar__label">Master</span>
          <button
            type="button"
            className={`snapshot-toolbar__ms-button snapshot-toolbar__ms-button--mute ${masterMuted ? 'is-active' : ''}`}
            aria-pressed={masterMuted}
            onClick={onToggleMasterMute}
          >
            M
          </button>
          <button
            type="button"
            className={`snapshot-toolbar__ms-button snapshot-toolbar__ms-button--solo ${masterSoloed ? 'is-active' : ''}`}
            aria-pressed={masterSoloed}
            onClick={onToggleMasterSolo}
          >
            S
          </button>
        </div>

        <div className="snapshot-toolbar__group" role="group" aria-label="Monitor">
          <span className="snapshot-toolbar__label">Monitor</span>
          <div className="snapshot-toolbar__seg-control" role="group" aria-label="Monitor source">
            {renderMonitorButton('input', 'IN', monitorInputActive)}
            {renderMonitorButton('output', 'OUT', monitorOutputActive)}
            {renderMonitorButton('clip', 'CLIP', monitorClipActive)}
          </div>
        </div>

        <div className="snapshot-toolbar__group snapshot-toolbar__group--right" role="group" aria-label="Routing and devices">
          <Button
            size="sm"
            kind="ghost"
            className="snapshot-toolbar__text-button"
            renderIcon={Music}
            onClick={onOpenMidiAssignments}
            title="Open MIDI Assignments for this snapshot"
          >
            MIDI
          </Button>
          <Button
            size="sm"
            kind="ghost"
            className="snapshot-toolbar__text-button"
            renderIcon={Router}
            onClick={onOpenRouting}
          >
            Routing
          </Button>
          <Button
            size="sm"
            kind="secondary"
            className="snapshot-toolbar__text-button"
            renderIcon={SettingsAdjust}
            onClick={onOpenDevices}
          >
            Devices
          </Button>
        </div>
      </div>
    </div>
  )
}
