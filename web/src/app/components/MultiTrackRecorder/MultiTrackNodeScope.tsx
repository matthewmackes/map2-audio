/**
 * T2503 Set 10 — MultiTrack Recorder node scope.
 *
 * Mirrors the MidiHubNodeScope pattern. The shell wraps every sub-area
 * in this provider so per-area queries can read the current node id
 * + scope key without each sub-area re-deriving them from useNodePageContext.
 */
import { createContext, useContext, type ReactNode } from 'react'

interface MultiTrackNodeScopeValue {
  nodeId: string | null
  scopeKey: string
}

const DEFAULT_SCOPE: MultiTrackNodeScopeValue = {
  nodeId: null,
  scopeKey: 'local',
}

const MultiTrackNodeScopeContext = createContext<MultiTrackNodeScopeValue>(DEFAULT_SCOPE)

interface MultiTrackNodeScopeProviderProps {
  nodeId: string | null
  scopeKey: string
  children: ReactNode
}

export function MultiTrackNodeScopeProvider({
  nodeId,
  scopeKey,
  children,
}: MultiTrackNodeScopeProviderProps) {
  return (
    <MultiTrackNodeScopeContext.Provider value={{ nodeId, scopeKey }}>
      {children}
    </MultiTrackNodeScopeContext.Provider>
  )
}

export function useMultiTrackNodeScope() {
  return useContext(MultiTrackNodeScopeContext)
}
