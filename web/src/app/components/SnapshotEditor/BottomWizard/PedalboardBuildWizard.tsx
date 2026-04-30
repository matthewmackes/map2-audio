import { type ReactNode } from 'react'
import {
  Add,
  ChartLine,
  Folder,
  Flow,
  Help,
  Launch,
  SettingsAdjust,
  Time,
} from '@carbon/icons-react'
import { Button } from '@carbon/react'
import './pedalboardBuildWizard.css'

export type RoutingDropdownOption = {
  id: string
  label: string
  description: string
}

export type EngineSyncTone = 'live' | 'publishing' | 'desync' | 'idle'

export interface PedalboardBuildWizardProps {
  activeWorkspaceActionId?: 'signal-grid' | 'directory' | 'parameters' | 'automation' | 'version-history' | 'help'

  onOpenSignalGrid?: () => void
  onOpenDirectory?: () => void
  directoryDisabled?: boolean

  onOpenParameters?: () => void
  parametersDisabled?: boolean

  onOpenAutomation?: () => void

  onOpenVersionHistory?: () => void
  versionHistoryDisabled?: boolean

  onOpenProgressModal?: () => void
  onOpenSnapshots?: () => void

  onCreateSnapshot?: () => void
  createSnapshotPending?: boolean

  onOpenHelp?: () => void

  snapshotTitle?: string

  channelCount?: number | null
  activeChannelCount?: number | null
  chainCount?: number | null
  updatedAtLabel?: string | null

  engineSyncTone?: EngineSyncTone
  engineSyncLabel?: string
}

function HeroIconRow({
  items,
}: {
  items: Array<{ id: string; label: string; icon: ReactNode; onClick?: () => void; active?: boolean; disabled?: boolean }>
}) {
  return (
    <div className="pedalboard-wizard__icon-row">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`pedalboard-wizard__icon-btn${item.active ? ' is-active' : ''}`}
          aria-label={item.label}
          aria-pressed={item.active}
          title={item.label}
          onClick={item.onClick}
          disabled={item.disabled || !item.onClick}
        >
          {item.icon}
        </button>
      ))}
    </div>
  )
}

export function PedalboardBuildWizard({
  activeWorkspaceActionId,
  onOpenSignalGrid,
  onOpenDirectory,
  directoryDisabled,
  onOpenParameters,
  parametersDisabled,
  onOpenAutomation,
  onOpenVersionHistory,
  versionHistoryDisabled,
  onOpenProgressModal,
  onOpenSnapshots,
  onCreateSnapshot,
  createSnapshotPending,
  onOpenHelp,
  snapshotTitle,
  channelCount,
  activeChannelCount,
  chainCount,
  updatedAtLabel,
  engineSyncTone = 'idle',
  engineSyncLabel,
}: PedalboardBuildWizardProps) {
  const channelsLabel = (() => {
    if (typeof activeChannelCount === 'number' && typeof channelCount === 'number') {
      return `${activeChannelCount} of ${channelCount} channels active`
    }
    if (typeof channelCount === 'number') {
      return `${channelCount} channels`
    }
    return null
  })()

  const metaLine = (() => {
    const parts: string[] = []
    if (typeof chainCount === 'number') parts.push(`${chainCount} ${chainCount === 1 ? 'chain' : 'chains'}`)
    if (updatedAtLabel) parts.push(updatedAtLabel)
    return parts.join(' · ')
  })()

  const heroIconItems = [
    { id: 'signal-grid', label: 'Signal grid', icon: <Flow size={14} />, onClick: onOpenSignalGrid, active: activeWorkspaceActionId === 'signal-grid' },
    { id: 'directory', label: 'Directory', icon: <Folder size={14} />, onClick: onOpenDirectory, disabled: directoryDisabled },
    { id: 'parameters', label: 'Parameters', icon: <SettingsAdjust size={14} />, onClick: onOpenParameters, active: activeWorkspaceActionId === 'parameters', disabled: parametersDisabled },
    { id: 'automation', label: 'Automation', icon: <ChartLine size={14} />, onClick: onOpenAutomation, active: activeWorkspaceActionId === 'automation' },
    { id: 'version-history', label: 'Version history', icon: <Time size={14} />, onClick: onOpenVersionHistory, active: activeWorkspaceActionId === 'version-history', disabled: versionHistoryDisabled },
    { id: 'help', label: 'Help', icon: <Help size={14} />, onClick: onOpenHelp, active: activeWorkspaceActionId === 'help' },
  ]


  return (
    <section className="pedalboard-wizard" aria-label="Build workflow">
      <header className="pedalboard-wizard__hero">
        <div className="pedalboard-wizard__hero-meta">
          <span className="pedalboard-wizard__hero-eyebrow">
            <span className="pedalboard-wizard__hero-eyebrow-dot" aria-hidden />
            Snapshot management
          </span>
          <div className="pedalboard-wizard__hero-title-row">
            <h2 className="pedalboard-wizard__hero-title">{snapshotTitle ?? 'No snapshot loaded'}</h2>
            {engineSyncLabel ? (
              <span
                className={`pedalboard-wizard__sync-chip pedalboard-wizard__sync-chip--${engineSyncTone}`}
                role="status"
              >
                <span className="pedalboard-wizard__sync-chip-dot" aria-hidden />
                {engineSyncLabel}
              </span>
            ) : null}
          </div>
          <div className="pedalboard-wizard__hero-sub">
            {channelsLabel ? (
              <span className="pedalboard-wizard__hero-sub-chip">
                <span className="pedalboard-wizard__sync-chip-dot" aria-hidden />
                {channelsLabel}
              </span>
            ) : null}
            {metaLine ? <span className="pedalboard-wizard__hero-sub-meta">{metaLine}</span> : null}
          </div>
        </div>
        <div className="pedalboard-wizard__hero-actions">
          <HeroIconRow items={heroIconItems} />
          <div className="pedalboard-wizard__hero-buttons">
            <Button size="sm" kind="ghost" renderIcon={Launch} onClick={onOpenProgressModal} disabled={!onOpenProgressModal}>
              Publish to live
            </Button>
            <Button size="sm" kind="ghost" renderIcon={Folder} onClick={onOpenSnapshots} disabled={!onOpenSnapshots}>
              Open snapshots
            </Button>
            <Button
              size="sm"
              kind="primary"
              renderIcon={Add}
              onClick={onCreateSnapshot}
              disabled={!onCreateSnapshot || createSnapshotPending}
            >
              {createSnapshotPending ? 'Creating…' : 'New snapshot'}
            </Button>
          </div>
        </div>
      </header>

      <div className="pedalboard-wizard__sub-bar" role="toolbar" aria-label="Snapshot quick actions">
        <span className="pedalboard-wizard__sub-bar-title" aria-label="Active snapshot">
          {snapshotTitle ?? 'No snapshot loaded'}
        </span>
        <div className="pedalboard-wizard__sub-bar-actions">
          <Button
            size="sm"
            kind="ghost"
            renderIcon={Time}
            onClick={onOpenVersionHistory}
            disabled={!onOpenVersionHistory || versionHistoryDisabled}
          >
            History
          </Button>
          <Button
            size="sm"
            kind="ghost"
            renderIcon={Launch}
            onClick={onOpenProgressModal}
            disabled={!onOpenProgressModal}
          >
            Publish to live
          </Button>
          <Button
            size="sm"
            kind="primary"
            renderIcon={Add}
            onClick={onCreateSnapshot}
            disabled={!onCreateSnapshot || createSnapshotPending}
          >
            {createSnapshotPending ? 'Creating…' : 'New snapshot'}
          </Button>
        </div>
      </div>
    </section>
  )
}
