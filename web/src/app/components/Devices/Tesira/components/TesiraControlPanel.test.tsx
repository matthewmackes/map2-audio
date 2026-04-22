import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'

import { TesiraControlPanel } from './TesiraControlPanel'

const mockSetSelectedTab = jest.fn()

const mockContext = {
  selectedDeviceId: 'tesira-1' as string | null,
  selectedTab: 4,
  setSelectedTab: mockSetSelectedTab,
}

jest.mock('../context/TesiraContext', () => ({
  useTesiraContext: () => mockContext,
}))

jest.mock('../hooks/useTesiraApi', () => ({
  useTesiraDevice: () => ({
    data: {
      connected: true,
      device_id: 'tesira-1',
    },
    isLoading: false,
    isError: false,
  }),
}))

jest.mock('./TesiraDeviceHeader', () => ({
  TesiraDeviceHeader: () => <div>device-header</div>,
}))

jest.mock('./TesiraOfflineBanner', () => ({
  TesiraOfflineBanner: () => <div>offline-banner</div>,
}))

jest.mock('./TesiraLevelsTab', () => ({
  TesiraLevelsTab: () => <div>levels-tab</div>,
}))

jest.mock('./TesiraMixerTab', () => ({
  TesiraMixerTab: () => <div>mixer-tab</div>,
}))

jest.mock('./TesiraEQTab', () => ({
  TesiraEQTab: () => <div>eq-tab</div>,
}))

jest.mock('./TesiraPresetsTab', () => ({
  TesiraPresetsTab: () => <div>presets-tab</div>,
}))

jest.mock('./TesiraAvbTab', () => ({
  TesiraAvbTab: () => <div>avb-tab</div>,
}))

jest.mock('./TesiraFaultsTab', () => ({
  TesiraFaultsTab: () => <div>faults-tab</div>,
}))

jest.mock('./TesiraFirmwareTab', () => ({
  TesiraFirmwareTab: () => <div>firmware-tab</div>,
}))

jest.mock('./TesiraLoopBuilderTab', () => ({
  TesiraLoopBuilderTab: () => <div>loops-tab</div>,
}))

describe('TesiraControlPanel', () => {
  beforeAll(() => {
    if (typeof window.matchMedia !== 'function') {
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
    }

    if (typeof window.ResizeObserver === 'undefined') {
      Object.defineProperty(window, 'ResizeObserver', {
        writable: true,
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      })
    }
  })

  beforeEach(() => {
    mockSetSelectedTab.mockReset()
    mockContext.selectedDeviceId = 'tesira-1'
    mockContext.selectedTab = 4
  })

  it('renders the Carbon tab shell and propagates tab changes', () => {
    render(<TesiraControlPanel />)

    expect(screen.getByText('device-header')).toBeTruthy()
    expect(screen.getByText('avb-tab')).toBeTruthy()

    const tabList = screen.getByRole('tablist', { name: 'Tesira device tabs' })
    fireEvent.click(within(tabList).getByRole('tab', { name: 'Faults' }))

    expect(mockSetSelectedTab).toHaveBeenCalledWith(5)
  })

  it('shows a fleet-prompt empty state when no device is selected', () => {
    mockContext.selectedDeviceId = null

    render(<TesiraControlPanel />)

    expect(screen.getByText('Select a device from the fleet panel')).toBeTruthy()
  })
})
