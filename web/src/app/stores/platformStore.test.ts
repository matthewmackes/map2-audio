import { usePlatformStore } from './platformStore'
import type { PlatformAlert, PlatformSummaryMetric } from '../platform/model'
import { makePlatformHealthRecord } from '../platform/model'

const INITIAL_PLATFORM_STATE = usePlatformStore.getState()

function resetPlatformStore() {
  usePlatformStore.setState(INITIAL_PLATFORM_STATE, true)
}

describe('platformStore', () => {
  beforeEach(() => {
    resetPlatformStore()
  })

  afterAll(() => {
    resetPlatformStore()
  })

  it('ignores repeat layer-health payloads with identical values', () => {
    const layerHealth = makePlatformHealthRecord((layerId) => (layerId === 'overview' ? 'warning' : 'healthy'))

    usePlatformStore.getState().setLayerHealth(layerHealth)

    const firstUpdateState = usePlatformStore.getState()
    const firstLayerHealthRef = firstUpdateState.layerHealth

    usePlatformStore.getState().setLayerHealth({
      ...layerHealth,
    })

    const secondUpdateState = usePlatformStore.getState()

    expect(secondUpdateState).toBe(firstUpdateState)
    expect(secondUpdateState.layerHealth).toBe(firstLayerHealthRef)
  })

  it('ignores repeat alert payloads with identical values', () => {
    const alerts: PlatformAlert[] = [
      {
        id: 'overview-warning',
        layerId: 'overview',
        severity: 'warning',
        title: 'Warning active',
        subtitle: 'One node needs attention.',
      },
    ]

    usePlatformStore.getState().setAlerts(alerts)

    const firstUpdateState = usePlatformStore.getState()
    const firstAlertsRef = firstUpdateState.alerts

    usePlatformStore.getState().setAlerts(alerts.map((alert) => ({ ...alert })))

    const secondUpdateState = usePlatformStore.getState()

    expect(secondUpdateState).toBe(firstUpdateState)
    expect(secondUpdateState.alerts).toBe(firstAlertsRef)
  })

  it('ignores repeat summary-metric payloads with identical values', () => {
    const summaryMetrics: PlatformSummaryMetric[] = [
      {
        id: 'summary-nodes',
        label: 'Nodes',
        value: '2/2',
        helper: 'Online across the fabric',
        tone: 'healthy',
      },
    ]

    usePlatformStore.getState().setSummaryMetrics(summaryMetrics)

    const firstUpdateState = usePlatformStore.getState()
    const firstSummaryMetricsRef = firstUpdateState.summaryMetrics

    usePlatformStore.getState().setSummaryMetrics(summaryMetrics.map((metric) => ({ ...metric })))

    const secondUpdateState = usePlatformStore.getState()

    expect(secondUpdateState).toBe(firstUpdateState)
    expect(secondUpdateState.summaryMetrics).toBe(firstSummaryMetricsRef)
  })

  it('avoids redundant open-layer writes for the active layer', () => {
    usePlatformStore.getState().openLayer('overview')

    const firstUpdateState = usePlatformStore.getState()

    usePlatformStore.getState().openLayer('overview')

    expect(usePlatformStore.getState()).toBe(firstUpdateState)
  })
})
