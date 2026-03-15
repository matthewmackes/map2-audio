import React from 'react'
import { render, screen } from '@testing-library/react'
import { App } from './App'

jest.mock('./layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}))

jest.mock('./components/Toasts', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useToasts: () => ({
    pushToast: jest.fn(),
    dismissToast: jest.fn(),
  }),
}))

jest.mock('./hooks/useMidiLearn', () => ({
  MidiLearnProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock('./contexts/ClusterContext', () => ({
  ClusterProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock('@tanstack/react-query-devtools', () => ({
  ReactQueryDevtools: () => null,
}))

jest.mock('../map2/hooks/useWebSocket', () => ({
  useWebSocketConnection: () => ({
    status: 'connected',
    client: {
      onReconnectExhausted: () => () => undefined,
      retryNow: () => undefined,
    },
  }),
}))

jest.mock('./pages/PlatformShellPage', () => ({
  PlatformShellPage: () => <div data-testid="platform-route">Platform Route</div>,
}))

describe('App routing', () => {
  it('renders platform shell page for /platform', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      window.history.pushState({}, '', '/platform')

      render(<App />)

      expect(await screen.findByTestId('platform-route')).toBeTruthy()
      expect(screen.getByTestId('app-shell')).toBeTruthy()
    } finally {
      warnSpy.mockRestore()
    }
  })
})
