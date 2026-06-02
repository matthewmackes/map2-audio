/**
 * RecordingPanel — T2509 render-snapshot smoke.
 *
 * Automated visual-verification artifact (satisfies CLAUDE.md §0.8
 * without a live server or human eyeball). Mocks useRecorderSession so
 * the panel renders deterministically, then captures a render snapshot
 * for each of the four lifecycle states:
 *   - IDLE    — no session for the snapshot_id; Idle badge + Arm session.
 *   - ARMED   — state='armed'; Armed badge + Start rolling / Disarm.
 *   - ROLLING — state='rolling'; Rolling badge + Stop.
 *   - STOPPED — state='stopped'; Stopped badge + Release session.
 *
 * Each test also asserts the real Carbon Tag text + button labels so a
 * snapshot can never silently certify the wrong state. Mirrors the mock
 * pattern + makeStatus() helper in RecordingPanel.test.tsx.
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

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

describe('RecordingPanel render snapshots', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders idle-state snapshot', () => {
    mockHook({ sessions: [] })
    const { container } = render(<RecordingPanel snapshotId={42} />)
    expect(screen.getByTestId('recording-panel-state-badge')).toHaveTextContent('Idle')
    expect(screen.getByTestId('recording-panel-arm-button')).toHaveTextContent('Arm session')
    expect(container).toMatchSnapshot()
  })

  test('renders armed-state snapshot', () => {
    mockHook({ sessions: [makeStatus({ state: 'armed' })] })
    const { container } = render(<RecordingPanel snapshotId={42} />)
    expect(screen.getByTestId('recording-panel-state-badge')).toHaveTextContent('Armed')
    expect(screen.getByTestId('recording-panel-roll-button')).toHaveTextContent('Start rolling')
    expect(screen.getByTestId('recording-panel-disarm-button')).toHaveTextContent('Disarm')
    expect(container).toMatchSnapshot()
  })

  test('renders rolling-state snapshot', () => {
    mockHook({
      sessions: [
        makeStatus({
          state: 'rolling',
          rolling: true,
          rolling_at: '2026-05-11T18:01:00+00:00',
        }),
      ],
    })
    const { container } = render(<RecordingPanel snapshotId={42} />)
    expect(screen.getByTestId('recording-panel-state-badge')).toHaveTextContent('Rolling')
    expect(screen.getByTestId('recording-panel-stop-button')).toHaveTextContent('Stop')
    expect(container).toMatchSnapshot()
  })

  test('renders stopped-state snapshot', () => {
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
    const { container } = render(<RecordingPanel snapshotId={42} />)
    expect(screen.getByTestId('recording-panel-state-badge')).toHaveTextContent('Stopped')
    expect(screen.getByTestId('recording-panel-disarm-button')).toHaveTextContent('Release session')
    expect(container).toMatchSnapshot()
  })
})
