import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { PlatformModalContent } from './PlatformModal'

const mockUpdateSettings = jest.fn()
const mockSetAlerts = jest.fn()
const mockSetLayerHealth = jest.fn()
const mockSetSummaryMetrics = jest.fn()

jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    section: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <section {...props}>{children}</section>,
  },
}))

jest.mock('../../hooks/useSpecialSettings', () => ({
  useSpecialSettings: () => ({
    settings: { pinnedRoutes: [], enabled: true, hiddenPlugins: [], menuLocation: 'hidden' },
    isLoading: false,
    error: null,
    updateSettings: mockUpdateSettings,
  }),
}))

jest.mock('../../hooks/useDeviceLocation', () => ({
  useHardwareMenuLocations: () => ({
    locationsByRoute: {},
  }),
}))

jest.mock('../../hooks/usePlatformShellData', () => ({
  usePlatformShellData: () => ({
    layers: [
      {
        id: 'overview',
        label: 'Overview',
        shortLabel: 'Overview',
        description: 'Overview',
        accent: 'var(--cds-support-warning)',
        health: 'healthy',
        activityLevel: 0,
        alertCount: 0,
        summaryMetrics: [],
        tableRows: [],
        tableColumns: [],
        tableTitle: 'Overview',
        tableDescription: 'Overview',
        gridItems: [],
        notifications: [],
        isLoading: false,
        error: null,
      },
    ],
    layerHealth: {},
    summaryMetrics: [],
    alerts: [],
  }),
}))

jest.mock('../../stores/platformStore', () => ({
  usePlatformView: () => 'stack',
  usePlatformActiveLayer: () => null,
  usePlatformLayerHealth: () => ({}),
  usePlatformAlerts: () => [],
  usePlatformAnimationState: () => ({ expandingLayer: null, collapsingLayer: null }),
  usePlatformSummaryMetrics: () => [],
  usePlatformActions: () => ({
    openLayer: jest.fn(),
    closeLayer: jest.fn(),
    clearAnimation: jest.fn(),
    setAlerts: mockSetAlerts,
    setLayerHealth: mockSetLayerHealth,
    setSummaryMetrics: mockSetSummaryMetrics,
    dismissAlert: jest.fn(),
  }),
}))

jest.mock('../../hooks/useMidiCluster', () => ({
  useMidiClusterNodes: () => ({ data: [], isLoading: false }),
  useMidiClusterConnections: () => ({ data: [], isLoading: false }),
  useMidiClusterEndpoints: () => ({ data: [], isLoading: false }),
}))

describe('PlatformModalContent', () => {
  beforeEach(() => {
    mockUpdateSettings.mockReset()
    mockSetAlerts.mockReset()
    mockSetLayerHealth.mockReset()
    mockSetSummaryMetrics.mockReset()

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    })
  })

  it('pins platform control-panel items into the main navigation settings', () => {
    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PlatformModalContent onClose={() => undefined} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Pin Overview' }))

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      pinnedRoutes: ['/platforms/overview'],
    })
  })

  it('shows the former advanced launcher set inside the Labs workspace', () => {
    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PlatformModalContent onClose={() => undefined} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Open Labs workspace' }))

    expect(screen.getAllByText('Labs').length).toBeGreaterThan(0)
    expect(screen.getByText('MIDI Hub')).toBeTruthy()
    expect(screen.getByText('Tesira AVB')).toBeTruthy()
    expect(screen.getByText('Blocked / Lab')).toBeTruthy()
  })

  it('delegates Labs route launches to the modal host callback', () => {
    const handleLaunchRoute = jest.fn()

    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PlatformModalContent onClose={() => undefined} onLaunchRoute={handleLaunchRoute} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Open Labs workspace' }))
    fireEvent.click(screen.getByRole('button', { name: 'MIDI Hub' }))

    expect(handleLaunchRoute).toHaveBeenCalledWith('/midi-hub')
  })
})
