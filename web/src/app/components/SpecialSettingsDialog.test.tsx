import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SpecialSettingsDialog } from './SpecialSettingsDialog'

jest.mock('../utils/apiTarget', () => ({
  apiUrl: (path: string) => path,
}))

jest.mock('../../map2/displayNames', () => ({
  getDisplayPluginName: (name: string) => name,
}))

describe('SpecialSettingsDialog', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        plugins: [
          { uri: 'map2://juce/nam', name: 'Neural Amp Modeler', category: 'Modeling' },
          { uri: 'map2://juce/drums', name: 'Drums', category: 'Instrument' },
          { uri: 'http://example.invalid/not-native', name: 'External', category: 'Other' },
        ],
      }),
    } as Response)

    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    ;(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock
  })

  afterEach(() => {
    global.fetch = originalFetch
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
    jest.resetAllMocks()
  })

  it('initializes plugin visibility from shared special-settings state without refetching settings', async () => {
    render(
      <SpecialSettingsDialog
        isOpen
        onClose={jest.fn()}
        currentHiddenPlugins={['map2://juce/nam']}
        onSave={jest.fn().mockResolvedValue(undefined)}
      />,
    )

    const hiddenPlugin = await screen.findByLabelText('Neural Amp Modeler')
    const visiblePlugin = await screen.findByLabelText('Drums')

    expect(hiddenPlugin).not.toBeChecked()
    expect(visiblePlugin).toBeChecked()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith('/api/plugins/discover')
  })

  it('saves the updated hidden plugin list', async () => {
    const onClose = jest.fn()
    const onSave = jest.fn().mockResolvedValue(undefined)

    render(
      <SpecialSettingsDialog
        isOpen
        onClose={onClose}
        currentHiddenPlugins={['map2://juce/nam']}
        onSave={onSave}
      />,
    )

    fireEvent.click(await screen.findByLabelText('Drums'))
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        hiddenPlugins: expect.arrayContaining(['map2://juce/nam', 'map2://juce/drums']),
      })
    })
    expect(onClose).toHaveBeenCalled()
  })
})
