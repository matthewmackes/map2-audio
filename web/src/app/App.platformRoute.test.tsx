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

jest.mock('./pages/PlatformWorkspaceCatalogPage', () => ({
  PlatformWorkspaceCatalogPage: () => {
    const { useLocation: mockUseLocation } = require('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="platform-workspace-catalog-route">{`${location.pathname}${location.search}`}</div>
  },
}))

jest.mock('./pages/SynthForgePage', () => ({
  SynthForgePage: () => {
    const { useLocation: mockUseLocation } = require('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="synthforge-route">{`${location.pathname}${location.search}`}</div>
  },
}))

jest.mock('./pages/GroundControlProPage', () => ({
  GroundControlProPage: () => {
    const { useLocation: mockUseLocation } = require('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="ground-control-pro-route">{`${location.pathname}${location.search}`}</div>
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

  it('does not keep /audio-table as a routed surface after the platforms hard cut', async () => {
    window.history.pushState({}, '', '/audio-table')

    render(<App />)

    expect(await screen.findByTestId('home-route')).toHaveTextContent('Home Route')
  })

  it('redirects the bare /platforms route into the overview workspace', async () => {
    window.history.pushState({}, '', '/platforms')

    render(<App />)

    expect(await screen.findByTestId('platform-route')).toHaveTextContent('/platforms/overview')
  })

  it('keeps the dedicated Platforms adoption route on the canonical workspace path', async () => {
    window.history.pushState({}, '', '/platforms/adoption?state=claimable')

    render(<App />)

    expect(await screen.findByTestId('platform-route')).toHaveTextContent('/platforms/adoption?state=claimable')
  })

  it('keeps Workspace Catalog as a first-class routed surface', async () => {
    window.history.pushState({}, '', '/platforms/workspace-catalog')

    render(<App />)

    expect(await screen.findByTestId('platform-workspace-catalog-route')).toHaveTextContent('/platforms/workspace-catalog')
  })

  it('keeps SynthForge as a first-class routed surface', async () => {
    window.history.pushState({}, '', '/synth-forge')

    render(<App />)

    expect(await screen.findByTestId('synthforge-route')).toHaveTextContent('/synth-forge')
  })

  it('keeps Ground Control Pro as a first-class routed surface', async () => {
    window.history.pushState({}, '', '/ground-control-pro')

    render(<App />)

    expect(await screen.findByTestId('ground-control-pro-route')).toHaveTextContent('/ground-control-pro')
  })
})
