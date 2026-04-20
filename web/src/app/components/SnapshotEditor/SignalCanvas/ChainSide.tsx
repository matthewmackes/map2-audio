import { CheckmarkFilled, Copy, Edit, PlayFilledAlt } from '@carbon/icons-react'

import { SignalCanvasIcon } from './icons'

export interface ChainSideProps {
  chainLabel: string
  chainName: string
  active?: boolean
  assigned?: boolean
  readOnly?: boolean
  muted?: boolean
  soloed?: boolean
  pluginCount?: number
  branchCount?: number
  cpuLoad?: number
  routingLabel?: string
  sendLabel?: string
  assignmentLabel?: string
  onRename?: () => void
  onDuplicate?: () => void
  onActivate?: () => void
  onDelete?: () => void
  onAssign?: () => void
  onMuteToggle?: () => void
  onSoloToggle?: () => void
}

export function ChainSide({
  chainLabel,
  chainName,
  active = false,
  assigned = true,
  readOnly = false,
  muted = false,
  soloed = false,
  pluginCount = 0,
  branchCount = 1,
  cpuLoad = 0,
  routingLabel = 'SERIES',
  sendLabel = 'NO SEND',
  assignmentLabel,
  onRename,
  onDuplicate,
  onActivate,
  onDelete,
  onAssign,
  onMuteToggle,
  onSoloToggle,
}: ChainSideProps) {
  const mutationDisabled = readOnly
  const safePluginCount = Math.max(0, Math.floor(pluginCount))
  const safeBranchCount = Math.max(1, Math.floor(branchCount))
  const safeCpuLoad = clampPercent(cpuLoad)

  return (
    <aside className={`snapshot-chain-side${active ? ' is-active' : ''}${muted ? ' is-muted' : ''}${readOnly ? ' is-readonly' : ''}`} aria-label={`${chainName} chain side panel`}>
      <div className="snapshot-chain-side__header">
        <span className="snapshot-chain-side__letter" aria-hidden>
          {chainLabel}
        </span>
        <div className="snapshot-chain-side__title">
          <h3>{chainName}</h3>
          <span>{assignmentLabel ?? (assigned ? 'Assigned signal path' : 'No chain assigned')}</span>
        </div>
      </div>

      <div className="snapshot-chain-side__tags">
        <span>{routingLabel}</span>
        <span>{sendLabel}</span>
      </div>

      <div className="snapshot-chain-side__pedals" aria-label={`${chainName} mute and solo`}>
        <button
          type="button"
          className={`snapshot-chain-side__pedal${muted ? ' is-on' : ''}`}
          aria-pressed={muted}
          aria-label={`${muted ? 'Unmute' : 'Mute'} ${chainName}`}
          onClick={onMuteToggle}
          disabled={mutationDisabled || !onMuteToggle}
        >
          M
        </button>
        <button
          type="button"
          className={`snapshot-chain-side__pedal${soloed ? ' is-on' : ''}`}
          aria-pressed={soloed}
          aria-label={`${soloed ? 'Unsolo' : 'Solo'} ${chainName}`}
          onClick={onSoloToggle}
          disabled={mutationDisabled || !onSoloToggle}
        >
          S
        </button>
      </div>

      <dl className="snapshot-chain-side__stats">
        <div>
          <dt>Blocks</dt>
          <dd>{safePluginCount}</dd>
        </div>
        <div>
          <dt>Branches</dt>
          <dd>{safeBranchCount}</dd>
        </div>
        <div>
          <dt>CPU</dt>
          <dd>{safeCpuLoad}%</dd>
        </div>
      </dl>

      <div className="snapshot-chain-side__actions" aria-label={`${chainName} inspector actions`}>
        {!assigned ? (
          <button type="button" aria-label={`Assign ${chainName}`} onClick={onAssign} disabled={mutationDisabled || !onAssign}>
            <SignalCanvasIcon id="i-plus" className="snapshot-chain-side__sprite" />
            <span>Assign</span>
          </button>
        ) : null}
        <button type="button" aria-label={`Rename ${chainName}`} onClick={onRename} disabled={mutationDisabled || !onRename}>
          <Edit size={16} aria-hidden="true" />
          <span>Rename</span>
        </button>
        <button type="button" aria-label={`Duplicate ${chainName}`} onClick={onDuplicate} disabled={mutationDisabled || !onDuplicate}>
          <Copy size={16} aria-hidden="true" />
          <span>Duplicate</span>
        </button>
        <button type="button" aria-label={`${active ? 'Deactivate' : 'Activate'} ${chainName}`} onClick={onActivate} disabled={mutationDisabled || !onActivate}>
          {active ? <CheckmarkFilled size={16} aria-hidden="true" /> : <PlayFilledAlt size={16} aria-hidden="true" />}
          <span>{active ? 'Deactivate' : 'Activate'}</span>
        </button>
        <button type="button" aria-label={`Delete ${chainName}`} onClick={onDelete} disabled={mutationDisabled || !onDelete}>
          <SignalCanvasIcon id="i-trash" className="snapshot-chain-side__sprite" />
          <span>Delete</span>
        </button>
      </div>
    </aside>
  )
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.round(Math.max(0, Math.min(1, value)) * 100)
}
