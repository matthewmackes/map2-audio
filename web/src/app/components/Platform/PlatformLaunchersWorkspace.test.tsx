import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { PlatformLaunchersWorkspace } from './PlatformLaunchersWorkspace'
import type { SpecialSettings } from '../../hooks/useSpecialSettings'

function buildSettings(overrides: Partial<SpecialSettings> = {}): SpecialSettings {
  return {
    enabled: true,
    hiddenPlugins: [],
    menuLocation: 'hidden',
    pinnedRoutes: [],
    landingTiles: [],
    ...overrides,
  }
}

describe('PlatformLaunchersWorkspace', () => {
  const originalWindowOpen = window.open

  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: ResizeObserverMock,
    })
    Object.defineProperty(global, 'ResizeObserver', {
      writable: true,
      value: ResizeObserverMock,
    })
  })

  beforeEach(() => {
    Object.defineProperty(window, 'open', {
      writable: true,
      value: jest.fn(),
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'open', {
      writable: true,
      value: originalWindowOpen,
    })
  })

  it('launches rows directly from the table and configures placement in a sub-modal', async () => {
    const updateSettings = jest.fn().mockResolvedValue(undefined)

    const { container } = render(
      <PlatformLaunchersWorkspace
        settings={buildSettings({ pinnedRoutes: ['/artifacts'] })}
        isLoading={false}
        updateSettings={updateSettings}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Launch MIDI Hub' }))

    expect(window.open).toHaveBeenCalledWith('/midi-hub', '_blank', 'noopener,noreferrer')
    expect(screen.getByRole('table', { name: 'Launcher catalog' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Configure MIDI Hub' }))

    expect(screen.getByText('Landing tile')).toBeInTheDocument()
    expect(within(container).queryByText('Landing tile')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add to landing' }))

    await waitFor(() => expect(updateSettings).toHaveBeenLastCalledWith({
      landingTiles: [{ route: '/midi-hub', size: 'medium' }],
    }))

    const pinToNavButton = screen.getByRole('button', { name: 'Pin to nav' })
    await waitFor(() => expect(pinToNavButton).toBeEnabled())
    fireEvent.click(pinToNavButton)

    await waitFor(() => expect(updateSettings).toHaveBeenLastCalledWith({
      pinnedRoutes: ['/artifacts', '/midi-hub'],
    }))
  })

  it('updates tile sizing and enforces the pinned-nav cap inside the configure modal', async () => {
    const updateSettings = jest.fn().mockResolvedValue(undefined)

    render(
      <PlatformLaunchersWorkspace
        settings={buildSettings({
          pinnedRoutes: ['/artifacts', '/juce-grid', '/intelfx', '/perform'],
          landingTiles: [
            { route: '/midi-hub', size: 'large' },
          ],
        })}
        isLoading={false}
        updateSettings={updateSettings}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configure MIDI Hub' }))
    fireEvent.click(screen.getByRole('button', { name: 'small' }))

    await waitFor(() => expect(updateSettings).toHaveBeenLastCalledWith({
      landingTiles: [{ route: '/midi-hub', size: 'small' }],
    }))

    expect(screen.getByRole('button', { name: 'Nav full' })).toBeDisabled()
  })
})
