import { create } from 'zustand'
import { shallow } from 'zustand/shallow'

import type {
  PlatformAlert,
  PlatformAnimationState,
  PlatformHealth,
  PlatformLayerId,
  PlatformSummaryMetric,
  PlatformView,
} from '../platform/model'
import { makePlatformHealthRecord } from '../platform/model'

interface PlatformState {
  currentView: PlatformView
  activeLayer: PlatformLayerId | null
  layerHealth: Record<PlatformLayerId, PlatformHealth>
  alerts: PlatformAlert[]
  summaryMetrics: PlatformSummaryMetric[]
  animationState: PlatformAnimationState
  openLayer: (layerId: PlatformLayerId) => void
  closeLayer: () => void
  clearAnimation: () => void
  setLayerHealth: (layerHealth: Record<PlatformLayerId, PlatformHealth>) => void
  setAlerts: (alerts: PlatformAlert[]) => void
  dismissAlert: (alertId: string) => void
  setSummaryMetrics: (metrics: PlatformSummaryMetric[]) => void
}

function arePlatformHealthRecordsEqual(
  left: Record<PlatformLayerId, PlatformHealth>,
  right: Record<PlatformLayerId, PlatformHealth>,
): boolean {
  return Object.keys(left).length === Object.keys(right).length
    && Object.entries(left).every(([layerId, health]) => right[layerId as PlatformLayerId] === health)
}

function arePlatformAlertsEqual(left: PlatformAlert[], right: PlatformAlert[]): boolean {
  return left.length === right.length
    && left.every((alert, index) => {
      const nextAlert = right[index]
      return nextAlert
        && nextAlert.id === alert.id
        && nextAlert.layerId === alert.layerId
        && nextAlert.severity === alert.severity
        && nextAlert.title === alert.title
        && nextAlert.subtitle === alert.subtitle
    })
}

function arePlatformSummaryMetricsEqual(left: PlatformSummaryMetric[], right: PlatformSummaryMetric[]): boolean {
  return left.length === right.length
    && left.every((metric, index) => {
      const nextMetric = right[index]
      return nextMetric
        && nextMetric.id === metric.id
        && nextMetric.label === metric.label
        && nextMetric.value === metric.value
        && nextMetric.helper === metric.helper
        && nextMetric.tone === metric.tone
    })
}

export const usePlatformStore = create<PlatformState>((set) => ({
  currentView: 'stack',
  activeLayer: null,
  layerHealth: makePlatformHealthRecord(() => 'unknown'),
  alerts: [],
  summaryMetrics: [],
  animationState: {
    expandingLayer: null,
    collapsingLayer: null,
  },
  openLayer: (layerId) => set((state) => {
    if (
      state.currentView === 'layer'
      && state.activeLayer === layerId
      && state.animationState.expandingLayer === layerId
      && state.animationState.collapsingLayer === null
    ) {
      return state
    }

    return {
      currentView: 'layer',
      activeLayer: layerId,
      animationState: {
        expandingLayer: layerId,
        collapsingLayer: null,
      },
    }
  }),
  closeLayer: () => set((state) => {
    if (
      state.currentView === 'stack'
      && state.activeLayer === null
      && state.animationState.expandingLayer === null
      && state.animationState.collapsingLayer === null
    ) {
      return state
    }

    return {
      currentView: 'stack',
      activeLayer: null,
      animationState: {
        expandingLayer: null,
        collapsingLayer: state.activeLayer,
      },
    }
  }),
  clearAnimation: () => set((state) => {
    if (state.animationState.expandingLayer === null && state.animationState.collapsingLayer === null) {
      return state
    }

    return {
      animationState: {
        expandingLayer: null,
        collapsingLayer: null,
      },
    }
  }),
  setLayerHealth: (layerHealth) => set((state) => (
    arePlatformHealthRecordsEqual(state.layerHealth, layerHealth) ? state : { layerHealth }
  )),
  setAlerts: (alerts) => set((state) => (
    arePlatformAlertsEqual(state.alerts, alerts) ? state : { alerts }
  )),
  dismissAlert: (alertId) => set((state) => {
    if (!state.alerts.some((alert) => alert.id === alertId)) {
      return state
    }

    return {
      alerts: state.alerts.filter((alert) => alert.id !== alertId),
    }
  }),
  setSummaryMetrics: (summaryMetrics) => set((state) => (
    arePlatformSummaryMetricsEqual(state.summaryMetrics, summaryMetrics) ? state : { summaryMetrics }
  )),
}))

export const usePlatformView = () => usePlatformStore((state) => state.currentView)
export const usePlatformActiveLayer = () => usePlatformStore((state) => state.activeLayer)
export const usePlatformLayerHealth = () => usePlatformStore((state) => state.layerHealth)
export const usePlatformAlerts = () => usePlatformStore((state) => state.alerts)
export const usePlatformSummaryMetrics = () => usePlatformStore((state) => state.summaryMetrics)
export const usePlatformAnimationState = () => usePlatformStore((state) => state.animationState)
export const usePlatformActions = () => usePlatformStore((state) => ({
  openLayer: state.openLayer,
  closeLayer: state.closeLayer,
  clearAnimation: state.clearAnimation,
  setLayerHealth: state.setLayerHealth,
  setAlerts: state.setAlerts,
  dismissAlert: state.dismissAlert,
  setSummaryMetrics: state.setSummaryMetrics,
}), shallow)
