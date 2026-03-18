import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const MIDI_HUB_NAV_STORAGE_KEY = 'map2_midi_hub_nav'

type MidiHubRouteState = {
  scrollTop: number
  panels: Record<string, boolean>
}

type MidiHubNavState = {
  routes: Record<string, MidiHubRouteState>
  setScrollTop: (routeKey: string, scrollTop: number) => void
  setPanelExpanded: (routeKey: string, panelId: string, expanded: boolean) => void
  getScrollTop: (routeKey: string) => number
  isPanelExpanded: (routeKey: string, panelId: string, fallback?: boolean) => boolean
}

function normalizeRouteKey(routeKey: string): string {
  return routeKey.trim() || 'connections'
}

function normalizePanelId(panelId: string): string {
  return panelId.trim()
}

function readRouteState(routes: Record<string, MidiHubRouteState>, routeKey: string): MidiHubRouteState {
  return routes[normalizeRouteKey(routeKey)] ?? { scrollTop: 0, panels: {} }
}

export const useMidiHubNavStore = create<MidiHubNavState>()(
  persist(
    (set, get) => ({
      routes: {},
      setScrollTop: (routeKey, scrollTop) => {
        const normalizedRouteKey = normalizeRouteKey(routeKey)
        set((state) => ({
          routes: {
            ...state.routes,
            [normalizedRouteKey]: {
              ...readRouteState(state.routes, normalizedRouteKey),
              scrollTop: Math.max(0, Math.round(scrollTop)),
            },
          },
        }))
      },
      setPanelExpanded: (routeKey, panelId, expanded) => {
        const normalizedRouteKey = normalizeRouteKey(routeKey)
        const normalizedPanelId = normalizePanelId(panelId)
        if (!normalizedPanelId) {
          return
        }
        set((state) => {
          const routeState = readRouteState(state.routes, normalizedRouteKey)
          return {
            routes: {
              ...state.routes,
              [normalizedRouteKey]: {
                ...routeState,
                panels: {
                  ...routeState.panels,
                  [normalizedPanelId]: expanded,
                },
              },
            },
          }
        })
      },
      getScrollTop: (routeKey) => readRouteState(get().routes, routeKey).scrollTop,
      isPanelExpanded: (routeKey, panelId, fallback = true) => {
        const normalizedPanelId = normalizePanelId(panelId)
        if (!normalizedPanelId) {
          return fallback
        }
        const panelValue = readRouteState(get().routes, routeKey).panels[normalizedPanelId]
        return typeof panelValue === 'boolean' ? panelValue : fallback
      },
    }),
    {
      name: MIDI_HUB_NAV_STORAGE_KEY,
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({ routes: state.routes }),
    },
  ),
)
