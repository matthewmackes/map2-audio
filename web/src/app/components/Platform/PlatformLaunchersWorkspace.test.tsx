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
  it('adds launchers to the landing board and global nav through the catalog', async () => {
    const updateSettings = jest.fn().mockResolvedValue(undefined)

    render(
      <PlatformLaunchersWorkspace
        settings={buildSettings({ pinnedRoutes: ['/artifacts'] })}
        isLoading={false}
        updateSettings={updateSettings}
      />,
    )

    const catalogList = screen.getByRole('list', { name: 'Launcher catalog' })
    const midiHubCatalogItem = within(catalogList).getByText('MIDI Hub').closest('.platform-launchers__item') as HTMLElement

    fireEvent.click(within(midiHubCatalogItem).getByRole('button', { name: 'Add to landing' }))

    await waitFor(() => expect(updateSettings).toHaveBeenLastCalledWith({
      landingTiles: [{ route: '/midi-hub', size: 'medium' }],
    }))

    updateSettings.mockClear()
    await waitFor(() => {
      const refreshedCatalogList = screen.getByRole('list', { name: 'Launcher catalog' })
      const refreshedMidiHubCatalogItem = within(refreshedCatalogList).getByText('MIDI Hub').closest('.platform-launchers__item') as HTMLElement
      expect(within(refreshedMidiHubCatalogItem).getByRole('button', { name: 'Pin to nav' })).toBeEnabled()
    })

    const refreshedCatalogList = screen.getByRole('list', { name: 'Launcher catalog' })
    const refreshedMidiHubCatalogItem = within(refreshedCatalogList).getByText('MIDI Hub').closest('.platform-launchers__item') as HTMLElement
    fireEvent.click(within(refreshedMidiHubCatalogItem).getByRole('button', { name: 'Pin to nav' }))

    await waitFor(() => expect(updateSettings).toHaveBeenLastCalledWith({
      pinnedRoutes: ['/artifacts', '/midi-hub'],
    }))
  })

  it('updates tile sizing and enforces the pinned-nav cap in the organizer', async () => {
    const updateSettings = jest.fn().mockResolvedValue(undefined)

    render(
      <PlatformLaunchersWorkspace
        settings={buildSettings({
          pinnedRoutes: ['/artifacts', '/juce-grid', '/intelfx', '/perform'],
          landingTiles: [
            { route: '/labs', size: 'medium' },
            { route: '/midi-hub', size: 'large' },
          ],
        })}
        isLoading={false}
        updateSettings={updateSettings}
      />,
    )

    const landingList = screen.getByRole('list', { name: 'Landing-page tiles' })
    const labsLandingTile = within(landingList).getByRole('heading', { name: 'Labs' }).closest('.platform-launchers__item') as HTMLElement

    fireEvent.click(within(labsLandingTile).getByRole('button', { name: 'small' }))

    await waitFor(() => expect(updateSettings).toHaveBeenLastCalledWith({
      landingTiles: [
        { route: '/labs', size: 'small' },
        { route: '/midi-hub', size: 'large' },
      ],
    }))

    const catalogList = screen.getByRole('list', { name: 'Launcher catalog' })
    const midiHubCatalogItem = within(catalogList).getByText('MIDI Hub').closest('.platform-launchers__item') as HTMLElement
    expect(within(midiHubCatalogItem).getByRole('button', { name: 'Nav full' })).toBeDisabled()
  })
})
