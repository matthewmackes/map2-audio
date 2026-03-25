import { useMemo } from 'react'

export interface StatusBarState {
  left: string
  right: string
}

export function useStatusBar(status?: {
  apiBase: string
  currentScreen: string
  connectionLabel?: string
  terminalColumns: number
}): StatusBarState {
  return useMemo(() => {
    const connectionLabel = status?.connectionLabel ?? 'Idle'
    const left = `${status?.currentScreen ?? 'Home'} | ${connectionLabel} | ${status?.apiBase ?? 'http://localhost:8080/api'}`
    const right = `${status?.terminalColumns ?? 80} cols | ? help | Ctrl+P screens | Esc back`
    return { left, right }
  }, [status])
}
