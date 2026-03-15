import { create } from 'zustand'

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

export const usePlatformStore = create<PlatformState>((set, get) => ({
  currentView: 'stack',
  activeLayer: null,
  layerHealth: makePlatformHealthRecord(() => 'unknown'),
  alerts: [],
  summaryMetrics: [],
  animationState: {
    expandingLayer: null,
    collapsingLayer: null,
  },
  openLayer: (layerId) => set({
    currentView: 'layer',
    activeLayer: layerId,
    animationState: {
      expandingLayer: layerId,
      collapsingLayer: null,
    },
  }),
  closeLayer: () => set({
    currentView: 'stack',
    activeLayer: null,
    animationState: {
      expandingLayer: null,
      collapsingLayer: get().activeLayer,
    },
  }),
  clearAnimation: () => set({
    animationState: {
      expandingLayer: null,
      collapsingLayer: null,
    },
  }),
  setLayerHealth: (layerHealth) => set({ layerHealth }),
  setAlerts: (alerts) => set({ alerts }),
  dismissAlert: (alertId) => set((state) => ({
    alerts: state.alerts.filter((alert) => alert.id !== alertId),
  })),
  setSummaryMetrics: (summaryMetrics) => set({ summaryMetrics }),
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
}))
