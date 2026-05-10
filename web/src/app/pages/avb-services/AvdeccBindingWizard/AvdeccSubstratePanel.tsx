/**
 * T2499-C Slice 5 — substrate-state diagnostic panel.
 *
 * Surfaces interface / PTP / entity-count readiness inline with the
 * wizard. Per Q3 the wizard does NOT block on substrate state — it
 * always launches and the panel shows what's degraded with a "Fix it"
 * link to AVB Services config.
 *
 * Schema mirrors `MAP2 ▸ AVB substrate_state()`:
 *
 *   {
 *     interface: { name: string, up: boolean },
 *     ptp:       { locked: boolean, offset_ns: number, grandmaster_id: string },
 *     entity_count: number,
 *     source: "live" | "avdecc_simulator",
 *     origin?: string | null,
 *   }
 */
import React from 'react'
import { Tag, Button, InlineNotification } from '@carbon/react'

export interface SubstrateState {
  interface: { name: string; up: boolean }
  ptp: { locked: boolean; offset_ns: number; grandmaster_id: string }
  entity_count: number
  source: 'live' | 'avdecc_simulator' | string
  origin?: string | null
  error?: string
}

export interface AvdeccSubstratePanelProps {
  state: SubstrateState
  onOpenSubstrateConfig?: () => void
}

export function AvdeccSubstratePanel({
  state,
  onOpenSubstrateConfig,
}: AvdeccSubstratePanelProps): React.ReactElement {
  const interfaceUp = state.interface.up
  const ptpLocked = state.ptp.locked
  const isSimulator = state.source === 'avdecc_simulator'

  const status = interfaceUp && ptpLocked ? 'healthy' : 'degraded'

  return (
    <div data-testid="avdecc-substrate-panel">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 8,
        }}
      >
        <span style={{ fontWeight: 600 }}>Substrate</span>
        <StatusTag status={status} />
        {isSimulator && (
          <Tag size="sm" type="cyan" data-testid="avdecc-substrate-simulator-tag">
            Simulator: {state.origin ?? 'unknown'}
          </Tag>
        )}
      </div>
      <ul
        style={{ margin: 0, paddingLeft: 16, fontSize: '0.875rem' }}
        data-testid="avdecc-substrate-rows"
      >
        <li>
          Interface{' '}
          <code data-testid="avdecc-substrate-iface-name">{state.interface.name}</code>{' '}
          —{' '}
          {interfaceUp ? (
            <Tag size="sm" type="green" data-testid="avdecc-substrate-iface-up">
              up
            </Tag>
          ) : (
            <Tag size="sm" type="red" data-testid="avdecc-substrate-iface-down">
              down
            </Tag>
          )}
        </li>
        <li>
          PTP{' '}
          {ptpLocked ? (
            <Tag size="sm" type="green" data-testid="avdecc-substrate-ptp-locked">
              locked
            </Tag>
          ) : (
            <Tag size="sm" type="red" data-testid="avdecc-substrate-ptp-unlocked">
              not locked
            </Tag>
          )}{' '}
          {ptpLocked && (
            <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>
              offset_ns={state.ptp.offset_ns} gm={state.ptp.grandmaster_id}
            </span>
          )}
        </li>
        <li data-testid="avdecc-substrate-entity-count">
          Entity count: <strong>{state.entity_count}</strong>
        </li>
      </ul>
      {status === 'degraded' && (
        <div style={{ marginTop: 12 }}>
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="AVB substrate is not fully ready"
            subtitle={
              !interfaceUp
                ? 'AVB interface is down. Bring it up in AVB Services config before binding.'
                : 'PTP is not locked. The wizard can still bind, but timing-critical streams may glitch until lock.'
            }
            data-testid="avdecc-substrate-warning"
          />
          {onOpenSubstrateConfig && (
            <Button
              kind="tertiary"
              size="sm"
              onClick={onOpenSubstrateConfig}
              data-testid="avdecc-substrate-fix-it"
              style={{ marginTop: 8 }}
            >
              Fix it — open AVB Services config
            </Button>
          )}
        </div>
      )}
      {state.error && (
        <p
          style={{ marginTop: 8, color: 'var(--cds-text-error)' }}
          data-testid="avdecc-substrate-error"
        >
          {state.error}
        </p>
      )}
    </div>
  )
}

function StatusTag({ status }: { status: 'healthy' | 'degraded' }): React.ReactElement {
  return status === 'healthy' ? (
    <Tag size="sm" type="green" data-testid="avdecc-substrate-status-healthy">
      Healthy
    </Tag>
  ) : (
    <Tag size="sm" type="red" data-testid="avdecc-substrate-status-degraded">
      Degraded
    </Tag>
  )
}

export default AvdeccSubstratePanel
