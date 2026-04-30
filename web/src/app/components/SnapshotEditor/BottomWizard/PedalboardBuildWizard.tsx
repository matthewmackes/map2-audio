import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Add,
  ArrowRight,
  ChartLine,
  Checkmark,
  Folder,
  Flow,
  Help,
  Launch,
  SettingsAdjust,
  Time,
} from '@carbon/icons-react'
import { Button } from '@carbon/react'
import {
  useBuildStageMachine,
  type BuildStageDescriptor,
  type BuildStageId,
} from './useBuildStageMachine'
import './pedalboardBuildWizard.css'

export type RoutingDropdownOption = {
  id: string
  label: string
  description: string
}

export type EngineSyncTone = 'live' | 'publishing' | 'desync' | 'idle'

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

  // New for the Build Workflow design.
  channelCount?: number | null
  activeChannelCount?: number | null
  chainCount?: number | null
  updatedAtLabel?: string | null

  engineSyncTone?: EngineSyncTone
  engineSyncLabel?: string

  routingOptions?: RoutingDropdownOption[]
  routingValue?: string
}

type StepCopy = {
  detail: string
  meta: Array<[string, string]>
  primaryCta: { label: string; onClick?: () => void; disabled?: boolean; pending?: boolean }
  secondaryCta?: { label: string; onClick?: () => void; disabled?: boolean }
}

function stageStatusToVariant(status: BuildStageDescriptor['status']): 'done' | 'active' | 'todo' {
  switch (status) {
    case 'complete': return 'done'
    case 'active': return 'active'
    case 'ready': return 'todo'
    case 'locked': return 'todo'
  }
}

function buildStepCopy(
  stage: BuildStageDescriptor,
  ctx: {
    pluginCount: number
    hasSelectedBlock: boolean
    hasUnsavedChanges: boolean
    hasLiveSnapshot: boolean
    automationActive: boolean
    routingLabel: string
    onOpenSignalGrid?: () => void
    onOpenDirectory?: () => void
    directoryDisabled?: boolean
    onOpenParameters?: () => void
    parametersDisabled?: boolean
    onOpenAutomation?: () => void
    onSaveDraft?: () => void
    saveDraftDisabled?: boolean
    saveDraftPending?: boolean
    onOpenProgressModal?: () => void
    onOpenSnapshots?: () => void
    onOpenVersionHistory?: () => void
    versionHistoryDisabled?: boolean
  },
): StepCopy {
  switch (stage.id) {
    case 'layout':
      return {
        detail: 'Block topology committed. Drag additional blocks from the directory to extend the rig graph.',
        meta: [
          ['Blocks', String(ctx.pluginCount)],
          ['Status', stage.recap],
        ],
        primaryCta: {
          label: 'Add block',
          onClick: ctx.onOpenDirectory,
          disabled: ctx.directoryDisabled,
        },
        secondaryCta: {
          label: 'Open signal grid',
          onClick: ctx.onOpenSignalGrid,
        },
      }
    case 'wire':
      return {
        detail: ctx.hasSelectedBlock
          ? 'Editing the selected block — adjust parameters in the inspector below.'
          : 'Choose a block, then open its parameters panel to attach inputs, outputs and CV routing.',
        meta: [
          ['Selected', ctx.hasSelectedBlock ? 'Yes' : '—'],
          ['Routing map', ctx.routingLabel],
        ],
        primaryCta: {
          label: ctx.hasSelectedBlock ? 'Open parameters' : 'Open parameters',
          onClick: ctx.onOpenParameters,
          disabled: ctx.parametersDisabled,
        },
      }
    case 'tune':
      return {
        detail: 'Curve parameters across the morph pad, attach LFOs, and bind macros to physical controls.',
        meta: [
          ['Automation', ctx.automationActive ? 'Open' : 'Idle'],
          ['Status', stage.recap],
        ],
        primaryCta: {
          label: ctx.automationActive ? 'Close automation' : 'Open automation',
          onClick: ctx.onOpenAutomation,
        },
      }
    case 'save':
      return {
        detail: 'Snapshot the current rig state as a draft. You can keep iterating without losing the version.',
        meta: [
          ['Draft', ctx.hasUnsavedChanges ? 'Unsaved' : 'Saved'],
          ['Versions', 'Open history'],
        ],
        primaryCta: {
          label: ctx.hasUnsavedChanges ? 'Save draft' : 'Draft saved',
          onClick: ctx.onSaveDraft,
          disabled: ctx.saveDraftDisabled,
          pending: ctx.saveDraftPending,
        },
        secondaryCta: {
          label: 'Version history',
          onClick: ctx.onOpenVersionHistory,
          disabled: ctx.versionHistoryDisabled,
        },
      }
    case 'publish':
      return {
        detail: 'Promote the rig to the live channel set, or open the snapshot library to review history.',
        meta: [
          ['Live', ctx.hasLiveSnapshot ? 'Loaded' : 'None'],
          ['Status', stage.recap],
        ],
        primaryCta: {
          label: 'Publish to live',
          onClick: ctx.onOpenProgressModal,
        },
        secondaryCta: {
          label: 'Open snapshots',
          onClick: ctx.onOpenSnapshots,
        },
      }
  }
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
  channelCount,
  activeChannelCount,
  chainCount,
  updatedAtLabel,
  engineSyncTone = 'idle',
  engineSyncLabel,
  routingOptions,
  routingValue,
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

  const stageIndex = machine.stages.findIndex((stage) => stage.id === activeStageId)
  const safeIndex = stageIndex < 0 ? 0 : stageIndex
  const activeStage = machine.stages[safeIndex]
  const progressFraction = machine.stages.length > 1 ? safeIndex / (machine.stages.length - 1) : 0

  const routingLabel = useMemo(() => {
    if (!routingOptions || !routingValue) return 'Shared'
    return routingOptions.find((option) => option.id === routingValue)?.label ?? 'Shared'
  }, [routingOptions, routingValue])

  const stepCopy = buildStepCopy(activeStage, {
    pluginCount,
    hasSelectedBlock,
    hasUnsavedChanges,
    hasLiveSnapshot,
    automationActive,
    routingLabel,
    onOpenSignalGrid,
    onOpenDirectory,
    directoryDisabled,
    onOpenParameters,
    parametersDisabled,
    onOpenAutomation,
    onSaveDraft,
    saveDraftDisabled,
    saveDraftPending,
    onOpenProgressModal,
    onOpenSnapshots,
    onOpenVersionHistory,
    versionHistoryDisabled,
  })

  const goPrev = useCallback(() => {
    for (let i = safeIndex - 1; i >= 0; i -= 1) {
      const candidate = machine.stages[i]
      if (candidate && candidate.status !== 'locked') {
        setExplicitStageId(candidate.id)
        return
      }
    }
  }, [machine.stages, safeIndex])

  const goNext = useCallback(() => {
    for (let i = safeIndex + 1; i < machine.stages.length; i += 1) {
      const candidate = machine.stages[i]
      if (candidate && candidate.status !== 'locked') {
        setExplicitStageId(candidate.id)
        return
      }
    }
  }, [machine.stages, safeIndex])

  const isLast = safeIndex === machine.stages.length - 1
  const hasPrev = machine.stages.slice(0, safeIndex).some((s) => s.status !== 'locked')
  const hasNext = machine.stages.slice(safeIndex + 1).some((s) => s.status !== 'locked')

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

      <ol className="pedalboard-wizard__stepper" role="tablist" aria-label="Build stages">
        {machine.stages.map((stage, index) => {
          const variant = stageStatusToVariant(stage.status)
          const stepNumber = String(index + 1).padStart(2, '0')
          const isCurrent = stage.id === activeStageId
          const className = [
            'pedalboard-wizard__step',
            `pedalboard-wizard__step--${variant}`,
            isCurrent ? 'is-active' : '',
            stage.status === 'locked' ? 'is-locked' : '',
          ].filter(Boolean).join(' ')
          return (
            <li key={stage.id} className={className}>
              <button
                type="button"
                className="pedalboard-wizard__step-button"
                onClick={() => selectStage(stage.id)}
                disabled={stage.status === 'locked'}
                role="tab"
                aria-selected={isCurrent}
              >
                <span className="pedalboard-wizard__step-marker" aria-hidden>
                  {variant === 'done' ? <Checkmark size={12} /> : <span className="pedalboard-wizard__step-num">{stepNumber}</span>}
                </span>
                <span className="pedalboard-wizard__step-text">
                  <span className="pedalboard-wizard__step-label">{stage.label}</span>
                  <span className="pedalboard-wizard__step-recap">{stage.recap}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <div className="pedalboard-wizard__progress" aria-hidden>
        <div className="pedalboard-wizard__progress-track">
          <div className="pedalboard-wizard__progress-fill" style={{ width: `${progressFraction * 100}%` }} />
        </div>
        <span className="pedalboard-wizard__progress-label">
          <span className="pedalboard-wizard__progress-num">{safeIndex + 1}</span>
          <span className="pedalboard-wizard__progress-of"> / {machine.stages.length}</span>
        </span>
      </div>

      <section className="pedalboard-wizard__detail" aria-live="polite">
        <div className="pedalboard-wizard__detail-copy">
          <span className="pedalboard-wizard__detail-tag">Current step</span>
          <p className="pedalboard-wizard__detail-text">{stepCopy.detail}</p>
          <div className="pedalboard-wizard__detail-meta">
            {stepCopy.meta.map(([key, val]) => (
              <div key={key} className="pedalboard-wizard__detail-meta-cell">
                <span className="pedalboard-wizard__detail-meta-key">{key}</span>
                <span className="pedalboard-wizard__detail-meta-val">{val}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="pedalboard-wizard__detail-actions">
          <Button size="sm" kind="ghost" onClick={goPrev} disabled={!hasPrev}>
            Previous
          </Button>
          {stepCopy.secondaryCta && stepCopy.secondaryCta.onClick ? (
            <Button
              size="sm"
              kind="secondary"
              onClick={stepCopy.secondaryCta.onClick}
              disabled={stepCopy.secondaryCta.disabled}
            >
              {stepCopy.secondaryCta.label}
            </Button>
          ) : null}
          <Button
            size="sm"
            kind="primary"
            renderIcon={isLast ? Launch : ArrowRight}
            onClick={isLast ? stepCopy.primaryCta.onClick : (hasNext ? goNext : stepCopy.primaryCta.onClick)}
            disabled={isLast ? (stepCopy.primaryCta.disabled || !stepCopy.primaryCta.onClick) : (!hasNext && (stepCopy.primaryCta.disabled || !stepCopy.primaryCta.onClick))}
          >
            {isLast ? stepCopy.primaryCta.label : 'Continue'}
          </Button>
        </div>
      </section>
    </section>
  )
}
