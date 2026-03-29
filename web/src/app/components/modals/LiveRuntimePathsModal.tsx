import { ArrowLeft, ArrowRight, Renew } from '@carbon/icons-react'
import { Button, Modal, Tag } from '@carbon/react'
import { getEffectIconSpec } from '../icons/effectIcons'
import type { JuceGridLiveChainProjection } from '../SnapshotEditor/snapshotEditorLiveChains'
import './LiveRuntimePathsModal.css'

interface LiveRuntimePathsModalProps {
  open: boolean
  onClose: () => void
  projections: JuceGridLiveChainProjection[]
  summaryOnly?: boolean
  mismatch?: boolean
  overflow?: boolean
  onUpdateLive?: () => void
  onRevertToLive?: () => void
  updatePending?: boolean
}

function getRepresentativeAccessibleLabel(
  item: JuceGridLiveChainProjection['representativeItems'][number],
): string {
  return item.caption ? `${item.label} · ${item.caption}` : item.label
}

function getRepresentativeIcon(
  item: JuceGridLiveChainProjection['representativeItems'][number],
) {
  const iconSpec = getEffectIconSpec(item.iconHint)
  if (iconSpec.matched) {
    return iconSpec
  }
  return getEffectIconSpec(item.kind === 'loop' ? 'rack' : 'plugin')
}

function formatRuntimeLabel(runtimeStatus: JuceGridLiveChainProjection['runtimeStatus']): string {
  switch (runtimeStatus) {
    case 'active':
      return 'Runtime active'
    case 'partial':
      return 'Runtime partial'
    case 'capability_gap':
      return 'Capability gap'
    case 'missing':
      return 'Runtime unavailable'
    case 'inactive':
      return 'Inactive'
    default:
      return runtimeStatus.replace(/_/g, ' ')
  }
}

function getStatusTagType(projection: JuceGridLiveChainProjection): 'green' | 'warm-gray' {
  return projection.status === 'live' ? 'green' : 'warm-gray'
}

export function LiveRuntimePathsModal({
  open,
  onClose,
  projections,
  summaryOnly = false,
  mismatch = false,
  overflow = false,
  onUpdateLive,
  onRevertToLive,
  updatePending = false,
}: LiveRuntimePathsModalProps) {
  if (!open) {
    return null
  }

  const counts = projections.reduce((summary, projection) => {
    if (projection.status === 'live') {
      summary.live += 1
    } else {
      summary.degraded += 1
    }
    return summary
  }, { live: 0, degraded: 0 })

  const showMismatchBanner = mismatch && (onUpdateLive || onRevertToLive)

  return (
    <Modal
      open={open}
      size="lg"
      passiveModal
      hasScrollingContent
      modalLabel="Backend truth"
      modalHeading="Live paths"
      onRequestClose={onClose}
    >
      <div className="live-runtime-paths-modal" data-testid="live-runtime-paths-modal">
        <div className="live-runtime-paths-modal__header">
          <p className="live-runtime-paths-modal__copy">
            {projections.length > 0
              ? 'Read-only live path inventory sourced from backend runtime truth. Each live path maps to a runtime chain while active.'
              : 'No live or degraded paths are currently reported by the backend runtime.'}
          </p>
          <div className="live-runtime-paths-modal__tags">
            <Tag type="green">{counts.live} live</Tag>
            {counts.degraded > 0 ? <Tag type="warm-gray">{counts.degraded} degraded</Tag> : null}
            <Tag type="cool-gray">{summaryOnly ? 'Summary mode' : 'Miniature signal view'}</Tag>
          </div>
        </div>

        {showMismatchBanner ? (
          <div className="live-runtime-paths-modal__mismatch">
            <div className="live-runtime-paths-modal__mismatch-copy">
              <p className="live-runtime-paths-modal__kicker">Workspace mismatch</p>
              <h3>Local workspace and backend live truth diverge</h3>
              <p>
                {overflow
                  ? 'Backend live truth currently exceeds the local path capacity. Update Live remains available, but Revert Workspace is disabled until the live path count drops.'
                  : 'Update Live pushes the local path set into the platform. Revert Workspace rebuilds the local path assignments from the current backend live truth.'}
              </p>
            </div>
            <div className="live-runtime-paths-modal__actions">
              {onUpdateLive ? (
                <Button
                  size="sm"
                  kind="primary"
                  renderIcon={Renew}
                  onClick={onUpdateLive}
                  disabled={updatePending}
                >
                  Update Live
                </Button>
              ) : null}
              {onRevertToLive ? (
                <Button
                  size="sm"
                  kind="secondary"
                  renderIcon={ArrowLeft}
                  onClick={onRevertToLive}
                  disabled={updatePending || overflow}
                >
                  Revert Workspace
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {projections.length === 0 ? (
          <div className="live-runtime-paths-modal__empty">
            <p>No backend-live paths currently reported.</p>
          </div>
        ) : summaryOnly ? (
          <div className="live-runtime-paths-modal__summary-list" aria-label="Live paths summary">
            {projections.map((projection) => (
              <article
                key={`summary-${projection.chainId}`}
                className={`live-runtime-paths-modal__summary-item is-${projection.status}`}
              >
                <div className="live-runtime-paths-modal__summary-main">
                  <span className="live-runtime-paths-modal__path-label">{projection.flowLabels.join('+')}</span>
                  <strong>{projection.chainName}</strong>
                </div>
                <div className="live-runtime-paths-modal__summary-tags">
                  <Tag type={getStatusTagType(projection)}>
                    {projection.status === 'live' ? 'Live' : 'Degraded'}
                  </Tag>
                  {projection.syntheticFlow ? <Tag type="cool-gray">Live-only</Tag> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="live-runtime-paths-modal__rows" aria-label="Live paths truth rows">
            {projections.map((projection) => (
              <article
                key={`runtime-path-${projection.chainId}`}
                className={`live-runtime-paths-modal__row is-${projection.status}`}
              >
                <div className="live-runtime-paths-modal__row-header">
                  <div className="live-runtime-paths-modal__row-copy">
                    <div className="live-runtime-paths-modal__row-title">
                      <span className="live-runtime-paths-modal__path-label">{projection.flowLabels.join('+')}</span>
                      <strong>{projection.chainName}</strong>
                    </div>
                    <p>
                      {projection.syntheticFlow ? 'Live-only path' : 'Assigned path'}
                      {' · '}
                      {formatRuntimeLabel(projection.runtimeStatus)}
                    </p>
                  </div>
                  <div className="live-runtime-paths-modal__row-tags">
                    <Tag type={getStatusTagType(projection)}>
                      {projection.status === 'live' ? 'Live' : 'Degraded'}
                    </Tag>
                    {projection.syntheticFlow ? <Tag type="cool-gray">Live-only</Tag> : null}
                  </div>
                </div>

                {projection.warningText ? (
                  <p className="live-runtime-paths-modal__warning">{projection.warningText}</p>
                ) : null}

                <div className="live-runtime-paths-modal__miniature" aria-label={`${projection.chainName} signal path`}>
                  {projection.representativeItems.length > 0 ? projection.representativeItems.map((item, index) => {
                    const iconSpec = getRepresentativeIcon(item)
                    const Icon = iconSpec.component
                    const accessibleLabel = getRepresentativeAccessibleLabel(item)

                    return (
                      <div
                        key={`${projection.chainId}-${item.id}`}
                        className={`live-runtime-paths-modal__miniature-item is-${item.kind} ${item.dimmed ? 'is-dimmed' : ''}`}
                      >
                        <div
                          className={`live-runtime-paths-modal__miniature-chip is-${iconSpec.tone}`}
                          title={accessibleLabel}
                          aria-label={accessibleLabel}
                        >
                          <span
                            className={`live-runtime-paths-modal__miniature-icon is-${iconSpec.tone}`}
                            aria-hidden="true"
                          >
                            <Icon />
                          </span>
                          <span className="live-runtime-paths-modal__miniature-label">{item.label}</span>
                        </div>
                        {index < projection.representativeItems.length - 1 ? (
                          <ArrowRight size={12} className="live-runtime-paths-modal__miniature-arrow" aria-hidden />
                        ) : null}
                      </div>
                    )
                  }) : (
                    <span className="live-runtime-paths-modal__miniature-empty">No blocks</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
