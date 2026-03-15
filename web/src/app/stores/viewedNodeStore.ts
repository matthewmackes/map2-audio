import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const VIEWED_NODE_STORAGE_KEY = 'map2_viewed_nodes'

type ViewedNodeState = {
  pageNodeMap: Record<string, string>
  setViewedNode: (pageKey: string, nodeId: string) => void
  clearViewedNode: (pageKey: string) => void
  getViewedNode: (pageKey: string, fallbackLocalId: string) => string
}

function normalizePageKey(pageKey: string): string {
  return pageKey.trim()
}

function normalizeNodeId(nodeId: string): string {
  return nodeId.trim()
}

export const useViewedNodeStore = create<ViewedNodeState>()(
  persist(
    (set, get) => ({
      pageNodeMap: {},
      setViewedNode: (pageKey, nodeId) => {
        const normalizedPageKey = normalizePageKey(pageKey)
        const normalizedNodeId = normalizeNodeId(nodeId)
        if (!normalizedPageKey || !normalizedNodeId) {
          return
        }

        set((state) => ({
          pageNodeMap: {
            ...state.pageNodeMap,
            [normalizedPageKey]: normalizedNodeId,
          },
        }))
      },
      clearViewedNode: (pageKey) => {
        const normalizedPageKey = normalizePageKey(pageKey)
        if (!normalizedPageKey) {
          return
        }

        set((state) => {
          const nextPageNodeMap = { ...state.pageNodeMap }
          delete nextPageNodeMap[normalizedPageKey]
          return { pageNodeMap: nextPageNodeMap }
        })
      },
      getViewedNode: (pageKey, fallbackLocalId) => {
        const normalizedPageKey = normalizePageKey(pageKey)
        const storedNodeId = normalizedPageKey ? get().pageNodeMap[normalizedPageKey] : undefined
        return storedNodeId || fallbackLocalId
      },
    }),
    {
      name: VIEWED_NODE_STORAGE_KEY,
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({ pageNodeMap: state.pageNodeMap }),
    },
  ),
)

export function getViewedNodeForPage(pageKey: string, fallbackLocalId: string): string {
  return useViewedNodeStore.getState().getViewedNode(pageKey, fallbackLocalId)
}

export function useViewedNode(pageKey: string, fallbackLocalId: string): string {
  return useViewedNodeStore((state) => state.pageNodeMap[normalizePageKey(pageKey)] || fallbackLocalId)
}

