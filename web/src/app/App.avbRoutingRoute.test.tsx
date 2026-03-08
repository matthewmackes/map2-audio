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

jest.mock('./pages/AvbRoutingPage', () => ({
  AvbRoutingPage: () => <div data-testid="avb-routing-route">AVB Routing Route</div>,
}))

describe('App routing', () => {
  it('renders AVB routing page for /avb-routing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      window.history.pushState({}, '', '/avb-routing')

      render(<App />)

      expect(await screen.findByTestId('avb-routing-route')).toBeTruthy()
      expect(screen.getByTestId('app-shell')).toBeTruthy()
    } finally {
      warnSpy.mockRestore()
    }
  })
})
