import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { ToastProvider, useToasts } from './Toasts'

const mockUseClusterSnapshotRuntimeLiveState = jest.fn()

jest.mock('../hooks/useSnapshotRuntimeState', () => ({
  useClusterSnapshotRuntimeLiveState: (...args: unknown[]) => mockUseClusterSnapshotRuntimeLiveState(...args),
}))

function Harness() {
  const { pushToast } = useToasts()

  return (
    <button
      type="button"
      onClick={() => {
        pushToast('Backend unreachable - click to retry.', 'error', {
          id: 'backend-unreachable',
          title: 'Backend unreachable',
          persistent: true,
          stage: {
            kind: 'critical_alert',
            severity: 'critical',
            resource: {
              kind: 'backend',
              id: 'primary',
            },
            compactLabel: 'Backend',
            replaceLiveBanner: true,
          },
        })
      }}
    >
      Trigger backend alert
    </button>
  )
}

function renderProvider(initialEntries: string[] = ['/workspace/platforms/overview']) {
  return render(
    <MemoryRouter
      initialEntries={initialEntries}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <ToastProvider>
        <Harness />
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('ToastProvider stage notification surface', () => {
  beforeEach(() => {
    mockUseClusterSnapshotRuntimeLiveState.mockReturnValue({
      data: {
        nodes: [
          {
            node_id: 'node-local',
            seq: 4,
            emitted_at: '2026-04-18T15:00:00Z',
            state: 'live',
            snapshot_id: 44,
            snapshot_revision: '7',
            snapshot_name: 'Arena Intro',
            triggered_by: 'operator',
            live_snapshot_payload: null,
            last_successful_request_id: 'req-44',
            failure_reason: null,
            runtime_metrics: {},
            warning_threshold_seconds: 30,
            offline_threshold_seconds: 60,
            age_seconds: 2,
            is_warning: false,
            is_offline: false,
            display_state: 'live',
            display_label: 'Live confirmed',
          },
        ],
      },
    })
  })

  it('renders the live snapshot banner, collapses into the rail, and restores on click', () => {
    renderProvider()

    expect(screen.getByText('Arena Intro')).toBeInTheDocument()
    expect(screen.getByText(/Live confirmed/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide live snapshot banner' }))

    expect(screen.getByLabelText('Notification rail')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Arena Intro/i }))

    expect(screen.getByText('Arena Intro')).toBeInTheDocument()
    expect(screen.queryByLabelText('Notification rail')).not.toBeInTheDocument()
  })

  it('replaces the live snapshot banner with a critical alert and restores it after dismissal', () => {
    renderProvider()

    fireEvent.click(screen.getByRole('button', { name: 'Trigger backend alert' }))

    expect(screen.getByRole('heading', { name: 'Backend unreachable' })).toBeInTheDocument()
    expect(screen.queryByText('Arena Intro')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Backend unreachable' }))

    expect(screen.getByText('Arena Intro')).toBeInTheDocument()
    expect(screen.queryByText('Backend unreachable')).not.toBeInTheDocument()
  })

  it('suppresses the pinned live snapshot banner on Snapshot Editor routes', () => {
    renderProvider(['/snapshot-editor'])

    expect(screen.queryByText('Arena Intro')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Notification rail')).not.toBeInTheDocument()
  })
})
