import { CheckmarkFilled, Copy, Edit, PlayFilledAlt, Renew } from '@carbon/icons-react'

import { SignalCanvasIcon } from './icons'

export interface ChainHeadDeleteUndo {
  label: string
  actionLabel?: string
}

export interface ChainHeadProps {
  chainLabel: string
  chainName: string
  active?: boolean
  assigned?: boolean
  readOnly?: boolean
  routingLabel?: string
  sendLabel?: string
  deleteUndo?: ChainHeadDeleteUndo | null
  onRename?: () => void
  onDuplicate?: () => void
  onActivate?: () => void
  onDelete?: () => void
  onUndoDelete?: () => void
  onAssign?: () => void
  onRoutingTagClick?: () => void
  onSendTagClick?: () => void
}

export function ChainHead({
  chainLabel,
  chainName,
  active = false,
  assigned = true,
  readOnly = false,
  routingLabel = 'SERIES',
  sendLabel = 'NO SEND',
  deleteUndo = null,
  onRename,
  onDuplicate,
  onActivate,
  onDelete,
  onUndoDelete,
  onAssign,
  onRoutingTagClick,
  onSendTagClick,
}: ChainHeadProps) {
  const mutationDisabled = readOnly
  const activationLabel = active ? `Deactivate ${chainName}` : `Activate ${chainName}`

  return (
    <header className={`snapshot-chain-head${active ? ' is-active' : ''}${assigned ? '' : ' is-unassigned'}${readOnly ? ' is-readonly' : ''}`}>
      <div className="snapshot-chain-head__identity">
        <span className="snapshot-chain-head__letter" aria-hidden>
          {chainLabel}
        </span>
        <div className="snapshot-chain-head__copy">
          <h3>{chainName}</h3>
          <span>{assigned ? (active ? 'ACTIVE' : 'STANDBY') : 'UNASSIGNED'}</span>
        </div>
      </div>

      <div className="snapshot-chain-head__tags" aria-label={`${chainName} routing controls`}>
        <button type="button" className="snapshot-chain-head__tag" onClick={onRoutingTagClick} disabled={!onRoutingTagClick}>
          {routingLabel}
        </button>
        <button type="button" className="snapshot-chain-head__tag" onClick={onSendTagClick} disabled={!onSendTagClick}>
          {sendLabel}
        </button>
      </div>

      <div className="snapshot-chain-head__actions" aria-label={`${chainName} chain actions`}>
        {!assigned ? (
          <button
            type="button"
            className="snapshot-chain-head__icon-button"
            aria-label={`Assign ${chainName}`}
            title="Assign chain"
            onClick={onAssign}
            disabled={mutationDisabled || !onAssign}
          >
            <SignalCanvasIcon id="i-plus" className="snapshot-chain-head__sprite" />
          </button>
        ) : null}
        <button
          type="button"
          className="snapshot-chain-head__icon-button"
          aria-label={`Rename ${chainName}`}
          title="Rename chain"
          onClick={onRename}
          disabled={mutationDisabled || !onRename}
        >
          <Edit size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="snapshot-chain-head__icon-button"
          aria-label={`Duplicate ${chainName}`}
          title="Duplicate chain"
          onClick={onDuplicate}
          disabled={mutationDisabled || !onDuplicate}
        >
          <Copy size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="snapshot-chain-head__icon-button"
          aria-label={activationLabel}
          title={active ? 'Deactivate chain' : 'Activate chain'}
          onClick={onActivate}
          disabled={mutationDisabled || !onActivate}
        >
          {active ? <CheckmarkFilled size={16} aria-hidden="true" /> : <PlayFilledAlt size={16} aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="snapshot-chain-head__icon-button snapshot-chain-head__icon-button--danger"
          aria-label={`Delete ${chainName}`}
          title="Delete chain"
          onClick={onDelete}
          disabled={mutationDisabled || !onDelete}
        >
          <SignalCanvasIcon id="i-trash" className="snapshot-chain-head__sprite" />
        </button>
      </div>

      {deleteUndo ? (
        <div className="snapshot-chain-head__undo-toast" role="status">
          <span>{deleteUndo.label}</span>
          <button type="button" onClick={onUndoDelete} disabled={!onUndoDelete}>
            <Renew size={14} aria-hidden="true" />
            {deleteUndo.actionLabel ?? 'Undo'}
          </button>
        </div>
      ) : null}
    </header>
  )
}
