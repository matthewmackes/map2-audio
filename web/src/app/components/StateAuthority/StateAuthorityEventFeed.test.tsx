import { render, screen } from '@testing-library/react'
import { StateAuthorityEventFeed } from './StateAuthorityEventFeed'
import type { PlatformEvent } from '../../../map2/platformEvent'

jest.mock('../../hooks/usePlatformEvents', () => ({
  usePlatformEvents: jest.fn(() => ({
    events: [],
    allEvents: [],
    connected: false,
    replayComplete: false,
    ack: jest.fn(),
  })),
}))

const { usePlatformEvents } = jest.requireMock('../../hooks/usePlatformEvents') as {
  usePlatformEvents: jest.Mock
}

function buildEvent(overrides: Partial<PlatformEvent> = {}): PlatformEvent {
  return {
    event_id: 'evt-1',
    kind: 'state_authority.reconciliation.healthy',
    severity: 'info',
    source_node: 'node-local',
    source_service: 'state_authority_reconciliation_scheduler',
    occurred_at: '2026-04-22T15:00:00Z',
    monotonic_ns: null,
    title: 'Recon tick',
    message: 'Healthy',
    context: {
      layer: 'local',
      report: { status: 'healthy' },
    },
    correlation_id: null,
    dedupe_key: null,
    ttl_seconds: 300,
    expires_at: null,
    priority: 0.3,
    icon: null,
    color: null,
    sound: null,
    sticky: false,
    resource: null,
    broadcast: true,
    target_nodes: [],
    target_surfaces: [],
    workflow: null,
    supersedes: null,
    ack_required: false,
    ...overrides,
  }
}

describe('StateAuthorityEventFeed', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls usePlatformEvents with the state_authority + snapshot.activation kind prefixes', () => {
    render(<StateAuthorityEventFeed />)
    expect(usePlatformEvents).toHaveBeenCalledWith({
      kindPrefixes: ['state_authority.', 'snapshot.activation.'],
    })
  })

  it('renders an empty-state notification when the feed is empty', () => {
    render(<StateAuthorityEventFeed />)
    expect(screen.getByText(/No State Authority events yet/i)).toBeTruthy()
  })

  it('surfaces disconnected state in the empty-state subtitle', () => {
    usePlatformEvents.mockReturnValueOnce({
      events: [],
      allEvents: [],
      connected: false,
      replayComplete: false,
      ack: jest.fn(),
    })
    render(<StateAuthorityEventFeed />)
    expect(screen.getByText(/PlatformEventBus is disabled/i)).toBeTruthy()
  })

  it('renders event rows with kind + message + severity tag', () => {
    const events = [
      buildEvent({ event_id: 'a', kind: 'state_authority.reconciliation.drift_detected', severity: 'warning', message: '3 params drifted' }),
      buildEvent({ event_id: 'b', kind: 'snapshot.activation.ok', severity: 'info', message: 'Sunday Lead applied' }),
    ]
    render(<StateAuthorityEventFeed events={events} />)
    expect(screen.getByText('state_authority.reconciliation.drift_detected')).toBeTruthy()
    expect(screen.getByText('snapshot.activation.ok')).toBeTruthy()
    expect(screen.getByText('3 params drifted')).toBeTruthy()
    expect(screen.getByText('Sunday Lead applied')).toBeTruthy()
    // Severity tags
    expect(screen.getByText('warning')).toBeTruthy()
    expect(screen.getAllByText('info').length).toBeGreaterThan(0)
  })

  it('limits rendered events to the `limit` prop', () => {
    const events = Array.from({ length: 40 }, (_, i) =>
      buildEvent({ event_id: `e${i}`, message: `event ${i}` }),
    )
    render(<StateAuthorityEventFeed events={events} limit={5} />)
    const counter = screen.getByText(/Live event feed — 5 of 40/i)
    expect(counter).toBeTruthy()
  })

  it('renders connected Tag when the store is connected', () => {
    usePlatformEvents.mockReturnValueOnce({
      events: [buildEvent()],
      allEvents: [buildEvent()],
      connected: true,
      replayComplete: true,
      ack: jest.fn(),
    })
    render(<StateAuthorityEventFeed />)
    expect(screen.getByText('connected')).toBeTruthy()
  })

  it('renders reconciliation drift context summary when available', () => {
    const events = [
      buildEvent({
        context: {
          layer: 'local',
          report: {
            status: 'self_healed',
            parameter_drift_count: 3,
            correction_count: 3,
          },
        },
      }),
    ]
    render(<StateAuthorityEventFeed events={events} />)
    expect(screen.getByText(/drift=3/i)).toBeTruthy()
    expect(screen.getByText(/corrected=3/i)).toBeTruthy()
  })

  it('renders activation context summary (snapshot + node)', () => {
    const events = [
      buildEvent({
        kind: 'snapshot.activation.ok',
        severity: 'info',
        message: 'Applied',
        context: {
          snapshot_id: 42,
          node_id: 'node-A',
        },
      }),
    ]
    render(<StateAuthorityEventFeed events={events} />)
    const summary = screen.getByText(/snapshot=42/i)
    expect(summary).toBeTruthy()
    expect(summary.textContent).toContain('node=node-A')
  })
})
