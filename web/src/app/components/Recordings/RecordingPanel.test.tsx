/**
 * RecordingPanel — T2509-4 tests.
 *
 * Mocks useRecorderSession so the panel can be exercised without a
 * live backend. Covers:
 *   - Idle state shows "Arm session" + Idle badge.
 *   - After arm, button surface flips to Start rolling + Disarm.
 *   - Rolling state shows red Stop button.
 *   - Stopped state shows Release session.
 *   - Connection badge reflects isConnected.
 *   - arm/roll/stop/disarm trigger the hook's mutators with correct args.
 */

import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'

import { RecordingPanel } from './RecordingPanel'
import * as hookModule from '../../hooks/useRecorderSession'
import type { RecorderSessionStatus } from '../../../map2/clients/recorder'

jest.mock('../../hooks/useRecorderSession')

function makeStatus(
  overrides: Partial<RecorderSessionStatus> = {},
): RecorderSessionStatus {
  return {
    session_id: 'sess-A',
    snapshot_id: 42,
    state: 'armed',
    armed: true,
    rolling: false,
    started_at: '2026-05-11T18:00:00+00:00',
    rolling_at: null,
    stopped_at: null,
    tap_matrix: {},
    participating_nodes: ['map2-prod-01'],
    ...overrides,
  }
}

function mockHook({
  sessions = [],
  isConnected = false,
  isLoading = false,
  armSession = jest.fn().mockResolvedValue(undefined),
  startRolling = jest.fn().mockResolvedValue(undefined),
  stopSession = jest.fn().mockResolvedValue(undefined),
  disarmSession = jest.fn().mockResolvedValue(undefined),
}: Partial<ReturnType<typeof hookModule.useRecorderSession>> = {}) {
  ;(hookModule.useRecorderSession as jest.Mock).mockReturnValue({
    sessions,
    isConnected,
    isLoading,
    armSession,
    startRolling,
    stopSession,
    disarmSession,
  })
  return { armSession, startRolling, stopSession, disarmSession }
}

describe('RecordingPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('idle state shows Arm session button and Idle badge', () => {
    mockHook()
    render(<RecordingPanel snapshotId={42} />)
    expect(screen.getByTestId('recording-panel-state-badge')).toHaveTextContent('Idle')
    expect(screen.getByTestId('recording-panel-arm-button')).toBeInTheDocument()
    expect(screen.queryByTestId('recording-panel-stop-button')).toBeNull()
  })

  test('connection badge reflects isConnected', () => {
    mockHook({ isConnected: true })
    render(<RecordingPanel snapshotId={42} />)
    expect(screen.getByTestId('recording-panel-connection-badge')).toHaveTextContent('Live')
  })

  test('arm button calls hook.armSession with snapshot_id and tap_matrix', () => {
    const { armSession } = mockHook()
    render(
      <RecordingPanel
        snapshotId={42}
        defaultTapMatrix={{ 'chain-a': { pre_fx: true, post_fx: false } }}
      />,
    )
    fireEvent.click(screen.getByTestId('recording-panel-arm-button'))
    expect(armSession).toHaveBeenCalledWith({
      snapshot_id: 42,
      tap_matrix: { 'chain-a': { pre_fx: true, post_fx: false } },
    })
  })

  test('armed state shows Start rolling + Disarm', () => {
    mockHook({ sessions: [makeStatus({ state: 'armed' })] })
    render(<RecordingPanel snapshotId={42} />)
    expect(screen.getByTestId('recording-panel-state-badge')).toHaveTextContent('Armed')
    expect(screen.getByTestId('recording-panel-roll-button')).toBeInTheDocument()
    expect(screen.getByTestId('recording-panel-disarm-button')).toBeInTheDocument()
    expect(screen.queryByTestId('recording-panel-arm-button')).toBeNull()
  })

  test('rolling state shows Stop button', () => {
    mockHook({
      sessions: [
        makeStatus({ state: 'rolling', rolling: true, rolling_at: '2026-05-11T18:01:00+00:00' }),
      ],
    })
    render(<RecordingPanel snapshotId={42} />)
    expect(screen.getByTestId('recording-panel-state-badge')).toHaveTextContent('Rolling')
    expect(screen.getByTestId('recording-panel-stop-button')).toBeInTheDocument()
  })

  test('stopped state shows Release session', () => {
    mockHook({
      sessions: [
        makeStatus({
          state: 'stopped',
          armed: false,
          rolling: false,
          stopped_at: '2026-05-11T18:02:00+00:00',
        }),
      ],
    })
    render(<RecordingPanel snapshotId={42} />)
    expect(screen.getByTestId('recording-panel-state-badge')).toHaveTextContent('Stopped')
    expect(screen.getByTestId('recording-panel-disarm-button')).toHaveTextContent('Release session')
  })

  test('roll button calls startRolling with the session_id', () => {
    const { startRolling } = mockHook({
      sessions: [makeStatus({ session_id: 'sess-B', state: 'armed' })],
    })
    render(<RecordingPanel snapshotId={42} />)
    fireEvent.click(screen.getByTestId('recording-panel-roll-button'))
    expect(startRolling).toHaveBeenCalledWith('sess-B')
  })

  test('stop button calls stopSession with the session_id', () => {
    const { stopSession } = mockHook({
      sessions: [makeStatus({ session_id: 'sess-C', state: 'rolling', rolling: true })],
    })
    render(<RecordingPanel snapshotId={42} />)
    fireEvent.click(screen.getByTestId('recording-panel-stop-button'))
    expect(stopSession).toHaveBeenCalledWith('sess-C')
  })

  test('disarm button calls disarmSession with the session_id', () => {
    const { disarmSession } = mockHook({
      sessions: [makeStatus({ session_id: 'sess-D', state: 'armed' })],
    })
    render(<RecordingPanel snapshotId={42} />)
    fireEvent.click(screen.getByTestId('recording-panel-disarm-button'))
    expect(disarmSession).toHaveBeenCalledWith('sess-D')
  })

  test('only the session for this snapshot is surfaced', () => {
    mockHook({
      sessions: [
        makeStatus({ session_id: 'sess-other', snapshot_id: 99, state: 'rolling' }),
      ],
    })
    render(<RecordingPanel snapshotId={42} />)
    // Snapshot 42 has no session; panel reads idle.
    expect(screen.getByTestId('recording-panel-state-badge')).toHaveTextContent('Idle')
    expect(screen.getByTestId('recording-panel-arm-button')).toBeInTheDocument()
  })

  test('metadata table renders session-id and timestamps when present', () => {
    mockHook({
      sessions: [
        makeStatus({
          session_id: 'sess-meta',
          state: 'rolling',
          rolling_at: '2026-05-11T18:01:00+00:00',
        }),
      ],
    })
    render(<RecordingPanel snapshotId={42} />)
    const metadata = screen.getByTestId('recording-panel-metadata')
    expect(metadata).toHaveTextContent('sess-meta')
    expect(metadata).toHaveTextContent('2026-05-11T18:01:00+00:00')
  })
})
