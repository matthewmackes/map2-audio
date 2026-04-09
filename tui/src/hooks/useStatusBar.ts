import { useMemo } from 'react'

export interface StatusBarState {
  left: string
  right: string
}

interface StatusBarOptions {
  apiBase: string
  currentScreenId?: string
  currentScreen: string
  terminalColumns: number
}

function compactApiBase(apiBase: string): string {
  if (apiBase.startsWith('/')) {
    return apiBase
  }

  try {
    const url = new URL(apiBase)
    return `${url.host}${url.pathname}`
  } catch {
    return apiBase.replace(/^https?:\/\//, '')
  }
}

export function buildStatusBarState(status?: StatusBarOptions): StatusBarState {
  const terminalColumns = status?.terminalColumns ?? 80
  const currentScreen = status?.currentScreen ?? 'Home'
  const currentScreenId = status?.currentScreenId ?? 'home'
  const apiBase = status?.apiBase ?? 'http://localhost:8080/api'

  const leftSegments = [currentScreen]
  if (terminalColumns >= 110) {
    leftSegments.push(apiBase)
  } else if (terminalColumns >= 92) {
    leftSegments.push(compactApiBase(apiBase))
  }

  const right = currentScreenId === 'home'
    ? (
        terminalColumns >= 110
          ? '1-8 bypass | ,/. chain | q exit | Ctrl+L clear | ? help | Ctrl+P commands | [ ] cycle'
          : terminalColumns >= 92
            ? '1-8 bypass | ,/. chain | q exit | ^L | ? | ^P'
            : '1-8 | ,/. chain | q'
      )
    : (
        terminalColumns >= 110
          ? 'q exit | Ctrl+L clear | ? help | Ctrl+P commands | [ ] cycle | Esc back'
          : terminalColumns >= 92
            ? 'q exit | ^L | ? | ^P | [ ] | Esc'
            : 'q exit | ? | ^P | Esc'
      )

  return {
    left: leftSegments.join(' | '),
    right,
  }
}

export function useStatusBar(status?: StatusBarOptions): StatusBarState {
  return useMemo(() => {
    return buildStatusBarState(status)
  }, [status])
}
