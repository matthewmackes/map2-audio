import { createContext, useContext, type ReactNode } from 'react'

type MidiHubNodeScopeValue = {
  nodeId: string | null
  scopeKey: string
}

const DEFAULT_SCOPE: MidiHubNodeScopeValue = {
  nodeId: null,
  scopeKey: 'local',
}

const MidiHubNodeScopeContext = createContext<MidiHubNodeScopeValue>(DEFAULT_SCOPE)

interface MidiHubNodeScopeProviderProps {
  nodeId: string | null
  scopeKey: string
  children: ReactNode
}

export function MidiHubNodeScopeProvider({
  nodeId,
  scopeKey,
  children,
}: MidiHubNodeScopeProviderProps) {
  return (
    <MidiHubNodeScopeContext.Provider value={{ nodeId, scopeKey }}>
      {children}
    </MidiHubNodeScopeContext.Provider>
  )
}

export function useMidiHubNodeScope() {
  return useContext(MidiHubNodeScopeContext)
}
