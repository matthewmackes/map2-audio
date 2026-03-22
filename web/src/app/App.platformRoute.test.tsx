import React from 'react'
import '@testing-library/jest-dom'
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

jest.mock('./pages/HomePage', () => ({
  HomePage: () => <div data-testid="home-route">Home Route</div>,
}))

jest.mock('./pages/PlatformWorkspacePage', () => ({
  PlatformWorkspacePage: () => {
    const { useLocation: mockUseLocation } = require('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="platform-route">{`${location.pathname}${location.search}`}</div>
  },
}))

jest.mock('./pages/LabsPage', () => ({
  LabsPage: () => {
    const { useLocation: mockUseLocation } = require('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="labs-route">{`${location.pathname}${location.search}`}</div>
  },
}))

jest.mock('./pages/AudioArtifactsPage', () => ({
  AudioArtifactsPage: ({ discoverMode }: { discoverMode?: boolean }) => {
    const { useLocation: mockUseLocation } = require('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="artifacts-route">{`${location.pathname}${location.search}|discover=${discoverMode ? 'yes' : 'no'}`}</div>
  },
}))

describe('App routing', () => {
  it('redirects legacy /platform query routes into the canonical /platforms workspace path', async () => {
    window.history.pushState({}, '', '/platform?layer=overview')

    render(<App />)

    expect(await screen.findByTestId('platform-route')).toHaveTextContent('/platforms/overview')
    expect(screen.getByTestId('app-shell')).toBeTruthy()
  })

  it('redirects legacy /audio-artifacts into the canonical /artifacts route', async () => {
    window.history.pushState({}, '', '/audio-artifacts?category=lv2-plugins')

    render(<App />)

    expect(await screen.findByTestId('artifacts-route')).toHaveTextContent('/artifacts?category=lv2-plugins|discover=no')
  })

  it('redirects the bare /platforms route into the overview workspace', async () => {
    window.history.pushState({}, '', '/platforms')

    render(<App />)

    expect(await screen.findByTestId('platform-route')).toHaveTextContent('/platforms/overview')
  })

  it('keeps Labs as a first-class routed surface', async () => {
    window.history.pushState({}, '', '/labs')

    render(<App />)

    expect(await screen.findByTestId('labs-route')).toHaveTextContent('/labs')
  })
})
