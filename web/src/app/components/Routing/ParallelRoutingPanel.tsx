import { InlineNotification, Tag } from '@carbon/react'
import { Add as Plus, Branch as GitBranch, Renew as ArrowsClockwise, Renew as SpinnerGap, TrashCan as Trash, WarningAlt as WarningCircle } from '@carbon/icons-react'
import { useParallel } from '../../hooks/useParallel'
import { LegacyButton } from '../shared/LegacyButton'
import { EmptyState } from '../shared/EmptyState'
import { LoadingState } from '../shared/LoadingState'
import { useToasts } from '../Toasts'
import { NumberInput } from '../ParameterControl'

interface ParallelRoutingPanelProps {
  nodeId?: string | null
  remoteLabel?: string | null
  latencyMs?: number | null
}

export function ParallelRoutingPanel({
  nodeId,
  remoteLabel,
  latencyMs,
}: ParallelRoutingPanelProps) {
  const { pushToast } = useToasts()
  const {
    groups,
    isLoading,
    isError,
    error,
    refetch,
    createParallelGroup,
    removeParallelGroup,
    setGroupABBlend,
    setGroupBypass,
    isCreating,
    isRemoving,
    isUpdating,
  } = useParallel({ nodeId })

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        border: '1px solid rgba(99, 102, 241, 0.16)',
        background: 'rgba(15, 23, 42, 0.88)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <GitBranch size={18} style={{ color: '#818cf8' }} />
          <strong>Parallel Routing</strong>
          <Tag type="cool-gray" size="sm">{groups.length} groups</Tag>
          {remoteLabel && <Tag type="green" size="sm">Remote control · {remoteLabel}</Tag>}
          {remoteLabel && typeof latencyMs === 'number' && latencyMs > 10 && (
            <Tag type="warm-gray" size="sm">{latencyMs.toFixed(1)} ms</Tag>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <LegacyButton variant="ghost" size="sm" iconDescription="Refresh parallel routing" onClick={() => refetch()}>
            <ArrowsClockwise size={14} />
          </LegacyButton>
          <LegacyButton
            variant="secondary"
            size="sm"
            disabled={isCreating}
            onClick={async () => {
              try {
                await createParallelGroup(undefined, 2)
                pushToast('Parallel group created', 'success')
              } catch (error) {
                pushToast(error instanceof Error ? error.message : 'Failed to create parallel group', 'error')
              }
            }}
          >
            {isCreating ? <SpinnerGap size={14} className="spin" /> : <Plus size={14} />}
            New Group
          </LegacyButton>
        </div>
      </div>

      {isLoading ? (
        <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
          <SpinnerGap size={16} className="spin" />
          <span className="muted">Loading parallel groups…</span>
        </div>
      ) : isError ? (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="Failed to load parallel groups"
          subtitle={error instanceof Error ? error.message : 'The routing service did not return the current parallel-group state.'}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          title="No parallel groups on this node yet"
          description="Create one to manage A/B or blended branch routing remotely."
          compact
          align="left"
        />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {groups.map((group) => (
            <div
              key={group.id}
              style={{
                padding: 14,
                borderRadius: 10,
                border: '1px solid rgba(148, 163, 184, 0.12)',
                background: 'rgba(15, 23, 42, 0.6)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Group {group.id}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {group.branches.length} branches · {group.branches.reduce((sum, branch) => sum + branch.length, 0)} plugins
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <LegacyButton
                    variant={group.bypass ? 'primary' : 'ghost'}
                    size="sm"
                    disabled={isUpdating}
                    onClick={async () => {
                      try {
                        await setGroupBypass(group.id, !group.bypass)
                        pushToast(group.bypass ? 'Parallel group enabled' : 'Parallel group bypassed', 'success')
                      } catch (error) {
                        pushToast(error instanceof Error ? error.message : 'Failed to update bypass', 'error')
                      }
                    }}
                  >
                    {group.bypass ? 'Bypassed' : 'Live'}
                  </LegacyButton>
                  <LegacyButton
                    variant="ghost"
                    size="sm"
                    iconDescription="Remove parallel group"
                    disabled={isRemoving}
                    onClick={async () => {
                      try {
                        await removeParallelGroup(group.id)
                        pushToast('Parallel group removed', 'warn')
                      } catch (error) {
                        pushToast(error instanceof Error ? error.message : 'Failed to remove parallel group', 'error')
                      }
                    }}
                  >
                    <Trash size={14} />
                  </LegacyButton>
                </div>
              </div>

              <label style={{ display: 'block', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: '#94a3b8' }}>
                  <span>A/B Blend</span>
                  <span>{Math.round(group.abBlend * 100)}%</span>
                </div>
                <NumberInput
                  label="A/B Blend"
                  value={Math.round(group.abBlend * 100)}
                  min={0}
                  max={100}
                  step={1}
                  showLabel={false}
                  showBounds={false}
                  size="small"
                  disabled={isUpdating}
                  onChange={(value) => {
                    const blend = value / 100
                    void setGroupABBlend(group.id, blend).catch((error) => {
                      pushToast(error instanceof Error ? error.message : 'Failed to update blend', 'error')
                    })
                  }}
                />
              </label>

              <div style={{ display: 'grid', gap: 8 }}>
                {group.branches.map((branch, index) => (
                  <div
                    key={`${group.id}-${index}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'rgba(30, 41, 59, 0.55)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>Branch {index + 1}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {branch.length} plugins
                      </div>
                    </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Level {Math.round((group.branchLevels[index] ?? 1) * 100)}%
                  </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {remoteLabel && typeof latencyMs === 'number' && latencyMs > 10 && (
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            color: '#fbbf24',
            fontSize: 12,
          }}
        >
          <WarningCircle size={16} />
          Remote branch edits may feel less responsive above 10 ms peer latency.
        </div>
      )}
    </div>
  )
}

export default ParallelRoutingPanel
