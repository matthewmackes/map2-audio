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
    expect(screen.getByRole('columnheader', { name: 'Hero title' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Description' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Category' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Configure MIDI Hub' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Human Interface')).toBeInTheDocument()
    expect(within(dialog).getByText('Run the unified MIDI surface for controller setup, core command workflows, routing, scripts, presets, clock, diagnostics, and advanced controller orchestration.')).toBeInTheDocument()
    expect(screen.getByText('Landing tile')).toBeInTheDocument()
    expect(within(container).queryByText('Landing tile')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add to landing' }))

    await waitFor(() => expect(updateSettings).toHaveBeenLastCalledWith({
      landingTiles: [
        { route: '/platforms/overview', size: 'medium' },
        { route: '/midi-hub', size: 'medium' },
      ],
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
      landingTiles: [
        { route: '/platforms/overview', size: 'medium' },
        { route: '/midi-hub', size: 'small' },
      ],
    }))

    expect(screen.getByRole('button', { name: 'Nav full' })).toBeDisabled()
  })

  it('filters launcher rows by category before opening a route', () => {
    render(
      <PlatformLaunchersWorkspace
        settings={buildSettings()}
        isLoading={false}
        updateSettings={jest.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(screen.getByRole('button', { name: 'Launch MIDI Hub' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Audio Interface \(/ }))

    expect(screen.queryByRole('button', { name: 'Launch MIDI Hub' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Launch Audio Interfaces' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Launch Edirol UA-1000' })).toBeInTheDocument()
  })

  it('keeps Platforms locked on Home and first in landing order', async () => {
    const updateSettings = jest.fn().mockResolvedValue(undefined)

    render(
      <PlatformLaunchersWorkspace
        settings={buildSettings({
          landingTiles: [
            { route: '/midi-hub', size: 'small' },
            { route: '/platforms/overview', size: 'medium' },
          ],
        })}
        isLoading={false}
        updateSettings={updateSettings}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Configure Overview' }))

    expect(screen.getByRole('button', { name: 'Required on landing' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move down' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move up' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'small' }))

    await waitFor(() => expect(updateSettings).toHaveBeenLastCalledWith({
      landingTiles: [
        { route: '/platforms/overview', size: 'small' },
        { route: '/midi-hub', size: 'small' },
      ],
    }))
  })
})
