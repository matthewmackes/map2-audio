/**
 * RecordingPanel — T2509-4 (phase 5 of T2504).
 *
 * Operator-facing live recorder controls bound to a single
 * snapshot. Owns the four-state UI (idle / armed / rolling / stopped)
 * + arm/roll/stop/disarm transitions. Consumes the
 * `useRecorderSession` hook from T2509-5 so it stays in sync with
 * the WS topic + the HTTP routes from T2508-4.
 *
 * Carbon conformance:
 *   - InlineNotification reserved for real operator-actionable
 *     warnings (none here; we use Tag for state badges).
 *   - Buttons are Carbon `Button` with explicit `kind` + `size`.
 *   - State is reflected as Carbon Tags; no decorative copy.
 *
 * RT-safety profile: pure browser UI; never enters audioCallback.
 */

import { useMemo } from 'react'
import { Button, Tag, InlineLoading } from '@carbon/react'
import {
  PlayFilled,
  StopFilled,
  RecordingFilled,
  Close,
} from '@carbon/icons-react'

import type {
  RecorderSessionStatus,
  RecorderTapConfig,
} from '../../../map2/clients/recorder'
import { useRecorderSession } from '../../hooks/useRecorderSession'

import './RecordingPanel.css'

export interface RecordingPanelProps {
  /**
   * Snapshot id to bind the recording session to. The Recorder
   * service uses this to thread the take into the State Authority
   * graph's `recording` block (T2506).
   */
  snapshotId: number
  /**
   * Optional pre-configured tap matrix. Default empty — operator's
   * tap configuration UI (future T2509 slice) populates this. An
   * empty matrix arms a status-only session; the engine installs
   * zero capture nodes until the matrix is updated.
   */
  defaultTapMatrix?: Record<string, RecorderTapConfig>
  /**
   * Test seam — overrides for the hook. Production callers leave
   * this undefined so the hook uses its production wiring.
   */
  __hookOverrides?: Parameters<typeof useRecorderSession>[1]
}

function findSessionForSnapshot(
  sessions: RecorderSessionStatus[],
  snapshotId: number,
): RecorderSessionStatus | null {
  return sessions.find((s) => s.snapshot_id === snapshotId) ?? null
}

function stateLabel(state: RecorderSessionStatus['state']): string {
  switch (state) {
    case 'armed':
      return 'Armed'
    case 'rolling':
      return 'Rolling'
    case 'stopped':
      return 'Stopped'
  }
}

function stateTone(
  state: RecorderSessionStatus['state'],
): 'green' | 'red' | 'warm-gray' {
  switch (state) {
    case 'armed':
      return 'green'
    case 'rolling':
      return 'red'
    case 'stopped':
      return 'warm-gray'
  }
}

export function RecordingPanel({
  snapshotId,
  defaultTapMatrix,
  __hookOverrides,
}: RecordingPanelProps) {
  const recorder = useRecorderSession({ enableWebSocket: true }, __hookOverrides)
  const session = useMemo(
    () => findSessionForSnapshot(recorder.sessions, snapshotId),
    [recorder.sessions, snapshotId],
  )

  const idle = session === null
  const armed = session?.state === 'armed'
  const rolling = session?.state === 'rolling'
  const stopped = session?.state === 'stopped'

  const onArm = () =>
    recorder.armSession({
      snapshot_id: snapshotId,
      tap_matrix: defaultTapMatrix ?? {},
    })

  const onRoll = () => {
    if (session) {
      void recorder.startRolling(session.session_id)
    }
  }

  const onStop = () => {
    if (session) {
      void recorder.stopSession(session.session_id)
    }
  }

  const onDisarm = () => {
    if (session) {
      void recorder.disarmSession(session.session_id)
    }
  }

  return (
    <div className="recording-panel" data-testid="recording-panel">
      <div className="recording-panel__header">
        <h3 className="recording-panel__title">Recorder</h3>
        <div className="recording-panel__badges">
          <Tag
            type={recorder.isConnected ? 'green' : 'warm-gray'}
            size="sm"
            data-testid="recording-panel-connection-badge"
          >
            {recorder.isConnected ? 'Live' : 'Offline'}
          </Tag>
          {session ? (
            <Tag type={stateTone(session.state)} size="sm" data-testid="recording-panel-state-badge">
              {stateLabel(session.state)}
            </Tag>
          ) : (
            <Tag type="cool-gray" size="sm" data-testid="recording-panel-state-badge">
              Idle
            </Tag>
          )}
        </div>
      </div>

      {recorder.isLoading ? (
        <InlineLoading description="Loading recorder state…" />
      ) : null}

      <div className="recording-panel__controls">
        {idle ? (
          <Button
            kind="primary"
            size="md"
            renderIcon={RecordingFilled}
            onClick={() => void onArm()}
            data-testid="recording-panel-arm-button"
          >
            Arm session
          </Button>
        ) : null}

        {armed ? (
          <>
            <Button
              kind="primary"
              size="md"
              renderIcon={PlayFilled}
              onClick={onRoll}
              data-testid="recording-panel-roll-button"
            >
              Start rolling
            </Button>
            <Button
              kind="ghost"
              size="md"
              renderIcon={Close}
              onClick={onDisarm}
              data-testid="recording-panel-disarm-button"
            >
              Disarm
            </Button>
          </>
        ) : null}

        {rolling ? (
          <Button
            kind="danger"
            size="md"
            renderIcon={StopFilled}
            onClick={onStop}
            data-testid="recording-panel-stop-button"
          >
            Stop
          </Button>
        ) : null}

        {stopped ? (
          <Button
            kind="ghost"
            size="md"
            renderIcon={Close}
            onClick={onDisarm}
            data-testid="recording-panel-disarm-button"
          >
            Release session
          </Button>
        ) : null}
      </div>

      {session ? (
        <dl className="recording-panel__metadata" data-testid="recording-panel-metadata">
          <div className="recording-panel__metadata-row">
            <dt>Session ID</dt>
            <dd className="recording-panel__metadata-mono">{session.session_id}</dd>
          </div>
          {session.started_at ? (
            <div className="recording-panel__metadata-row">
              <dt>Armed at</dt>
              <dd>{session.started_at}</dd>
            </div>
          ) : null}
          {session.rolling_at ? (
            <div className="recording-panel__metadata-row">
              <dt>Rolling at</dt>
              <dd>{session.rolling_at}</dd>
            </div>
          ) : null}
          {session.stopped_at ? (
            <div className="recording-panel__metadata-row">
              <dt>Stopped at</dt>
              <dd>{session.stopped_at}</dd>
            </div>
          ) : null}
          <div className="recording-panel__metadata-row">
            <dt>Taps</dt>
            <dd>{Object.keys(session.tap_matrix).length} chain(s)</dd>
          </div>
        </dl>
      ) : null}
    </div>
  )
}
