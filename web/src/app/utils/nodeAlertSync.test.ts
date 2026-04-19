import { normalizeAlertTopologyNodes, syncNodeAlerts } from './nodeAlertSync'

function makeNode(status: 'ok' | 'warn' | 'critical' | 'offline') {
  return {
    hostname: 'node-a',
    display_label: null,
    role: 'all_in_one' as const,
    node_id: 'node-a',
    status,
    cpu_percent: 10,
    memory_percent: 20,
    xrun_count: 0,
    audio_latency_ms: 1.3,
    services: { backend: true, juce_engine: true, pipewire: true },
    last_seen: '2026-03-23T19:00:00Z',
    is_local: true,
    is_viewed: true,
  }
}

describe('nodeAlertSync', () => {
  it('normalizes malformed topology node payloads to an empty list', () => {
    expect(normalizeAlertTopologyNodes({ nodes: { bad: true } })).toEqual([])
  })

  it('dismisses stale alerts when the normalized node list is empty', () => {
    const upsertAlert = jest.fn()
    const dismissAlert = jest.fn()
    const enqueueToast = jest.fn()

    const nextStatuses = syncNodeAlerts([], { 'node-a': 'critical' }, {
      upsertAlert,
      dismissAlert,
      enqueueToast,
    })

    expect(nextStatuses).toEqual({})
    expect(dismissAlert).toHaveBeenCalledWith('node-a')
    expect(upsertAlert).not.toHaveBeenCalled()
    expect(enqueueToast).not.toHaveBeenCalled()
  })

  it('still emits critical alerts for valid nodes', () => {
    const upsertAlert = jest.fn()
    const dismissAlert = jest.fn()
    const enqueueToast = jest.fn()

    const nextStatuses = syncNodeAlerts([makeNode('critical')], {}, {
      upsertAlert,
      dismissAlert,
      enqueueToast,
    })

    expect(nextStatuses).toEqual({ 'node-a': 'critical' })
    expect(upsertAlert).toHaveBeenCalledTimes(1)
    expect(enqueueToast).toHaveBeenCalledTimes(1)
  })
})
