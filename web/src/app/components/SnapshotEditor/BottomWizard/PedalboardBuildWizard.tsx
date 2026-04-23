import { useCallback, useEffect, useState, type ElementType } from 'react'
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
import { Button, Tag, Tile } from '@carbon/react'
import {
  useBuildStageMachine,
  type BuildStageDescriptor,
  type BuildStageId,
} from './useBuildStageMachine'
import './pedalboardBuildWizard.css'

export interface PedalboardBuildWizardProps {
  hasSnapshot: boolean
  pluginCount: number
  hasSelectedBlock: boolean
  hasUnsavedChanges: boolean
  hasLiveSnapshot: boolean
  automationActive: boolean

  activeWorkspaceActionId?: 'signal-grid' | 'directory' | 'parameters' | 'automation' | 'version-history' | 'help'

  onOpenSignalGrid?: () => void
  onOpenDirectory?: () => void
  directoryDisabled?: boolean

  onOpenParameters?: () => void
  parametersDisabled?: boolean

  onOpenAutomation?: () => void

  onOpenVersionHistory?: () => void
  versionHistoryDisabled?: boolean

  onSaveDraft?: () => void
  saveDraftPending?: boolean
  saveDraftDisabled?: boolean

  onOpenProgressModal?: () => void
  onOpenSnapshots?: () => void

  onCreateSnapshot?: () => void
  createSnapshotPending?: boolean

  onOpenHelp?: () => void

  snapshotTitle?: string
}

type StageButton = {
  id: string
  label: string
  icon: ElementType
  onClick?: () => void
  disabled?: boolean
  pending?: boolean
  active?: boolean
  kind?: 'primary' | 'secondary' | 'tertiary'
}

function stageGlyph(status: BuildStageDescriptor['status']): string {
  switch (status) {
    case 'complete': return '✓'
    case 'active': return '●'
    case 'ready': return '○'
    case 'locked': return '◌'
  }
}

export function PedalboardBuildWizard({
  hasSnapshot,
  pluginCount,
  hasSelectedBlock,
  hasUnsavedChanges,
  hasLiveSnapshot,
  automationActive,
  activeWorkspaceActionId,
  onOpenSignalGrid,
  onOpenDirectory,
  directoryDisabled,
  onOpenParameters,
  parametersDisabled,
  onOpenAutomation,
  onOpenVersionHistory,
  versionHistoryDisabled,
  onSaveDraft,
  saveDraftPending,
  saveDraftDisabled,
  onOpenProgressModal,
  onOpenSnapshots,
  onCreateSnapshot,
  createSnapshotPending,
  onOpenHelp,
  snapshotTitle,
}: PedalboardBuildWizardProps) {
  const machine = useBuildStageMachine({
    hasSnapshot,
    pluginCount,
    hasSelectedBlock,
    hasUnsavedChanges,
    hasLiveSnapshot,
    automationActive,
  })

  const [explicitStageId, setExplicitStageId] = useState<BuildStageId | null>(null)
  const activeStageId: BuildStageId = explicitStageId ?? machine.recommendedStageId

  useEffect(() => {
    if (explicitStageId === null) return
    const explicitStage = machine.stages.find((stage) => stage.id === explicitStageId)
    if (explicitStage?.status === 'locked') {
      setExplicitStageId(null)
    }
  }, [explicitStageId, machine.stages])

  const selectStage = useCallback((stageId: BuildStageId) => {
    const target = machine.stages.find((stage) => stage.id === stageId)
    if (!target || target.status === 'locked') return
    setExplicitStageId(stageId)
  }, [machine.stages])

  const activeStage = machine.stages.find((stage) => stage.id === activeStageId)!

  const stageButtons: Record<BuildStageId, StageButton[]> = {
    layout: [
      {
        id: 'signal-grid',
        label: 'Open Signal Grid',
        icon: Flow,
        onClick: onOpenSignalGrid,
        active: activeWorkspaceActionId === 'signal-grid',
        kind: 'secondary',
      },
      {
        id: 'directory',
        label: 'Add block from directory',
        icon: Folder,
        onClick: onOpenDirectory,
        disabled: directoryDisabled,
        kind: 'primary',
      },
    ],
    wire: [
      {
        id: 'parameters',
        label: hasSelectedBlock ? 'Edit block parameters' : 'Select a block, then open parameters',
        icon: SettingsAdjust,
        onClick: onOpenParameters,
        disabled: parametersDisabled,
        active: activeWorkspaceActionId === 'parameters',
        kind: 'primary',
      },
    ],
    tune: [
      {
        id: 'automation',
        label: automationActive ? 'Close automation' : 'Open automation lanes',
        icon: ChartLine,
        onClick: onOpenAutomation,
        active: automationActive,
        kind: 'primary',
      },
    ],
    save: [
      {
        id: 'save-draft',
        label: hasUnsavedChanges ? 'Save draft' : 'Draft saved',
        icon: Launch,
        onClick: onSaveDraft,
        disabled: saveDraftDisabled,
        pending: saveDraftPending,
        kind: 'primary',
      },
      {
        id: 'version-history',
        label: 'Version history',
        icon: Time,
        onClick: onOpenVersionHistory,
        disabled: versionHistoryDisabled,
        active: activeWorkspaceActionId === 'version-history',
        kind: 'secondary',
      },
      {
        id: 'new-snapshot',
        label: createSnapshotPending ? 'Creating…' : 'New snapshot',
        icon: Add,
        onClick: onCreateSnapshot,
        disabled: createSnapshotPending,
        pending: createSnapshotPending,
        kind: 'secondary',
      },
    ],
    publish: [
      {
        id: 'publish-to-live',
        label: 'Publish to live',
        icon: Launch,
        onClick: onOpenProgressModal,
        disabled: !hasLiveSnapshot && !onOpenProgressModal,
        kind: 'primary',
      },
      {
        id: 'open-snapshots',
        label: 'Open snapshot library',
        icon: Folder,
        onClick: onOpenSnapshots,
        kind: 'secondary',
      },
    ],
  }

  return (
    <Tile className="pedalboard-wizard" aria-label="Pedalboard build wizard">
      <header className="pedalboard-wizard__header">
        <div className="pedalboard-wizard__title-col">
          <p className="pedalboard-wizard__kicker">Pedalboard build</p>
          <h3 className="pedalboard-wizard__title">
            {snapshotTitle ?? 'No snapshot loaded'}
          </h3>
        </div>
        {onOpenHelp ? (
          <button
            type="button"
            className="pedalboard-wizard__help-badge"
            onClick={onOpenHelp}
            aria-label="Open keyboard and workflow help"
            title="Help"
          >
            <Help size={16} />
          </button>
        ) : null}
      </header>

      <nav className="pedalboard-wizard__stepper" aria-label="Build stages">
        <ol className="pedalboard-wizard__stepper-list">
          {machine.stages.map((stage) => {
            const isActive = stage.id === activeStageId
            const isDisabled = stage.status === 'locked'
            const className = [
              'pedalboard-wizard__stepper-item',
              `pedalboard-wizard__stepper-item--${stage.status}`,
              isActive ? 'is-active' : '',
            ].filter(Boolean).join(' ')
            return (
              <li key={stage.id} className={className}>
                <button
                  type="button"
                  className="pedalboard-wizard__stepper-button"
                  onClick={() => selectStage(stage.id)}
                  disabled={isDisabled}
                  aria-current={isActive ? 'step' : undefined}
                >
                  <span className="pedalboard-wizard__stepper-glyph" aria-hidden="true">
                    {stageGlyph(stage.status)}
                  </span>
                  <span className="pedalboard-wizard__stepper-label">{stage.label}</span>
                  <span className="pedalboard-wizard__stepper-recap">{stage.recap}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <section
        className={`pedalboard-wizard__stage-body pedalboard-wizard__stage-body--${activeStage.id}`}
        aria-live="polite"
      >
        <div className="pedalboard-wizard__stage-meta">
          <Tag type={activeStage.status === 'complete' ? 'green' : activeStage.status === 'active' ? 'blue' : 'cool-gray'}>
            {activeStage.label}
          </Tag>
          <span className="pedalboard-wizard__stage-recap">{activeStage.recap}</span>
        </div>
        <div className="pedalboard-wizard__stage-actions">
          {stageButtons[activeStage.id].filter((action) => Boolean(action.onClick)).map((action) => {
            const Icon = action.icon
            const kind = action.kind ?? 'secondary'
            return (
              <Button
                key={action.id}
                size="sm"
                kind={action.active ? 'secondary' : kind}
                renderIcon={Icon}
                onClick={action.onClick}
                disabled={Boolean(action.disabled) || Boolean(action.pending)}
                aria-current={action.active ? 'page' : undefined}
              >
                {action.pending ? `${action.label}…` : action.label}
              </Button>
            )
          })}
        </div>
      </section>
    </Tile>
  )
}
