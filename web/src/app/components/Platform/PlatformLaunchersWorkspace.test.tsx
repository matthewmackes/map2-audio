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

function getCatalogSection() {
  const heading = screen.getByRole('heading', { name: 'Full Catalog' })
  const section = heading.closest('section')
  expect(section).not.toBeNull()
  return section as HTMLElement
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

  it('renders a storefront surface, launches routes, and configures placement from the catalog region', async () => {
    const updateSettings = jest.fn().mockResolvedValue(undefined)

    render(
      <PlatformLaunchersWorkspace
        settings={buildSettings({ pinnedRoutes: ['/artifacts'] })}
        isLoading={false}
        updateSettings={updateSettings}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Carbon storefront for MAP2 workspaces' })).toBeInTheDocument()
    expect(screen.queryByText('Storefront spotlight')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Workspace catalog section navigation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Launcher catalog' })).not.toBeInTheDocument()

    const catalog = getCatalogSection()
    fireEvent.click(within(catalog).getByRole('button', { name: 'Launch MIDI Hub' }))

    expect(window.open).toHaveBeenCalledWith('/midi-hub', '_blank', 'noopener,noreferrer')

    fireEvent.click(within(catalog).getByRole('button', { name: 'Configure MIDI Hub' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getAllByText('Human Interface').length).toBeGreaterThan(0)
    expect(within(dialog).getByText('Availability')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Storefront brief' })).toHaveAttribute(
      'href',
      '/api/system/docs/WORKSPACE_CATALOG_STOREFRONT_REFERENCE.md',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add to desktop' }))

    await waitFor(() => expect(updateSettings).toHaveBeenLastCalledWith({
      landingTiles: [
        { route: '/platforms/overview', size: 'medium' },
        { route: '/midi-hub', size: 'medium' },
      ],
    }))

    expect(screen.getByLabelText('Desktop preview')).toBeInTheDocument()
    expect(screen.getByLabelText('Start Menu preview')).toBeInTheDocument()

    const pinToNavButton = screen.getByRole('button', { name: 'Pin to Start Menu' })
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

    fireEvent.click(within(getCatalogSection()).getByRole('button', { name: 'Configure MIDI Hub' }))
    fireEvent.click(screen.getByRole('button', { name: 'small' }))

    await waitFor(() => expect(updateSettings).toHaveBeenLastCalledWith({
      landingTiles: [
        { route: '/platforms/overview', size: 'medium' },
        { route: '/midi-hub', size: 'small' },
      ],
    }))

    expect(screen.getByRole('button', { name: 'Start Menu full' })).toBeDisabled()
  })

  it('filters launcher cards by category and search terms', () => {
    render(
      <PlatformLaunchersWorkspace
        settings={buildSettings()}
        isLoading={false}
        updateSettings={jest.fn().mockResolvedValue(undefined)}
      />,
    )

    const catalog = getCatalogSection()
    expect(within(catalog).getByRole('button', { name: 'Launch MIDI Hub' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Audio Interface \(/ }))

    expect(within(catalog).queryByRole('button', { name: 'Launch MIDI Hub' })).toBeNull()
    expect(within(catalog).getByRole('button', { name: 'Launch Audio Interfaces' })).toBeInTheDocument()
    expect(within(catalog).getByRole('button', { name: 'Launch Edirol UA-1000' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^All \(/ }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search workspaces' }), {
      target: { value: 'Hardware Not Detected' },
    })

    expect(within(getCatalogSection()).getByRole('button', { name: 'Launch LCD Console' })).toBeInTheDocument()
    expect(within(getCatalogSection()).queryByRole('button', { name: 'Launch Edirol UA-1000' })).toBeNull()
  })

  it('keeps only the browse-everything full catalog section visible', () => {
    render(
      <PlatformLaunchersWorkspace
        settings={buildSettings()}
        isLoading={false}
        updateSettings={jest.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(screen.queryByText('Curated collection')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Featured' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Platform Essentials' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Recently Added' })).not.toBeInTheDocument()

    const catalog = getCatalogSection()
    const midiHubCard = within(catalog).getByRole('heading', { name: 'MIDI Hub' }).closest('.platform-launchers__card')
    expect(midiHubCard).not.toBeNull()
    expect(within(midiHubCard as HTMLElement).queryByText('Featured')).toBeNull()
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

    fireEvent.click(within(getCatalogSection()).getByRole('button', { name: 'Configure Overview' }))

    expect(screen.getByRole('button', { name: 'Required on desktop' })).toBeDisabled()
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
