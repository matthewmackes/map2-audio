import type { PlatformEvent } from '../../map2/platformEvent'
import { routePlatformEvent } from './platformEventRouter'

function makeEvent(overrides: Partial<PlatformEvent> = {}): PlatformEvent {
  return {
    event_id: 'event-1',
    kind: 'system.cpu.critical',
    severity: 'critical',
    source_node: 'node-a',
    source_service: 'health_monitor',
    occurred_at: '2026-04-19T13:00:00Z',
    monotonic_ns: null,
    title: 'CPU critical',
    message: 'CPU sustained at 95%',
    context: {},
    correlation_id: null,
    dedupe_key: 'system:cpu:node-a',
    ttl_seconds: 300,
    expires_at: null,
    priority: 0.95,
    icon: null,
    color: null,
    sound: true,
    sticky: true,
    resource: { kind: 'device', id: 'cpu' },
    broadcast: true,
    target_nodes: [],
    target_surfaces: ['web', 'lcd'],
    workflow: null,
    supersedes: null,
    ack_required: true,
    ...overrides,
  }
}

describe('routePlatformEvent', () => {
  it('routes a critical system event to all expected surfaces', () => {
    const decisions = routePlatformEvent(makeEvent())

    expect(decisions.map((decision) => decision.target)).toEqual([
      'toast',
      'stage_kyron',
      'node_alert',
      'browser_notification',
      'audio_beep',
      'lcd_feed',
    ])
  })

  it('routes device deltas to the device banner', () => {
    const decisions = routePlatformEvent(makeEvent({
      kind: 'device.tesira.fleet.delta',
      severity: 'warning',
      target_surfaces: ['web'],
    }))

    expect(decisions.some((decision) => decision.target === 'device_banner')).toBe(true)
  })
})

