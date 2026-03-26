import '@testing-library/jest-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { CATEGORY_COLOR_OVERRIDE_STORAGE_KEY } from '../data/categoryStyles'
import { REDUCED_EFFECTS_STORAGE_KEY, useEffectsSettingsStore } from '../stores/effectsSettingsStore'
import { ThemePage } from './ThemePage'

const mockUpdateSpecialSettings = jest.fn()
const mockDiscover = jest.fn()
const mockGetAllPlugins = jest.fn()
const mockListPluginAppearances = jest.fn()
const mockPutPluginAppearance = jest.fn()
const mockRemovePluginAppearance = jest.fn()
const mockUploadPluginAppearance = jest.fn()

jest.mock('@/map2/api', () => ({
  pluginsApi: {
    discover: (...args: unknown[]) => mockDiscover(...args),
    getAll: (...args: unknown[]) => mockGetAllPlugins(...args),
  },
  pluginAppearancesApi: {
    list: (...args: unknown[]) => mockListPluginAppearances(...args),
    put: (...args: unknown[]) => mockPutPluginAppearance(...args),
    remove: (...args: unknown[]) => mockRemovePluginAppearance(...args),
    uploadIcon: (...args: unknown[]) => mockUploadPluginAppearance(...args),
  },
}))

jest.mock('../hooks/useSpecialSettings', () => ({
  useSpecialSettings: () => ({
    settings: {
      enabled: true,
      hiddenPlugins: ['map2://native/hidden'],
      menuLocation: 'hidden',
      pinnedRoutes: [],
    },
    isLoading: false,
    error: null,
    updateSettings: mockUpdateSpecialSettings,
    reload: jest.fn(),
  }),
}))

jest.mock('../components/SpecialSettingsDialog', () => ({
  SpecialSettingsDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="special-settings-dialog">Special settings dialog</div> : null,
}))

describe('ThemePage', () => {
  function renderThemePage() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    return render(
      <QueryClientProvider client={queryClient}>
        <ThemePage />
      </QueryClientProvider>,
    )
  }

  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    ;(globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
      ResizeObserverMock as unknown as typeof ResizeObserver
  })

  beforeEach(() => {
    window.localStorage.clear()
    useEffectsSettingsStore.setState({
      reducedEffectsEnabled: false,
      pageTransitionPreset: 'hyperactive-block',
    })
    mockUpdateSpecialSettings.mockReset()
    mockDiscover.mockReset()
    mockGetAllPlugins.mockReset()
    mockListPluginAppearances.mockReset()
    mockPutPluginAppearance.mockReset()
    mockRemovePluginAppearance.mockReset()
    mockUploadPluginAppearance.mockReset()
    mockListPluginAppearances.mockResolvedValue({ count: 0, items: [] })
    mockDiscover.mockResolvedValue({
      count: 2,
      plugins: [
        {
          uri: 'map2://juce/nam',
          name: 'NAM Deluxe',
          author: 'MAP2',
          category: 'Amplifier',
          class_label: 'Amplifier',
          version: '1.0',
          license: 'MIT',
          has_ui: true,
          in_ports: 2,
          out_ports: 2,
          parameters: [],
          format: 'LV2',
        },
        {
          uri: 'hardware://lexicon-mpx1-spdif',
          name: 'Lexicon MPX-1',
          author: 'Lexicon',
          category: 'Hardware',
          class_label: 'Hardware',
          version: '1.0',
          license: 'N/A',
          has_ui: false,
          in_ports: 2,
          out_ports: 2,
          parameters: [],
          format: 'Hardware',
          is_hardware: true,
        },
      ],
    })
    mockGetAllPlugins.mockResolvedValue([
      {
        uri: 'map2://juce/nam',
        name: 'NAM Deluxe',
        author: 'MAP2',
        category: 'Amplifier',
        class_label: 'Amplifier',
        version: '1.0',
        license: 'MIT',
        has_ui: true,
        in_ports: 2,
        out_ports: 2,
        parameters: [],
        format: 'LV2',
      },
    ])
    mockPutPluginAppearance.mockImplementation(async (uri: string, payload: Record<string, unknown>) => ({
      uri,
      ...payload,
    }))

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: false,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    })
  })

  it('renders the dedicated Theme platform workspace as modal launchers', () => {
    renderThemePage()

    expect(screen.getByRole('heading', { name: 'Theme' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /open theme library/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /open directions/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /open theme studio/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /open font modal/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /open category modal/i })).toBeTruthy()
  })

  it('opens the special settings menu from the motion section', () => {
    renderThemePage()

    fireEvent.click(screen.getByRole('button', { name: /open motion modal/i }))
    expect(screen.getByText('1 hidden plugin')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /open special settings menu/i }))

    expect(screen.getByTestId('special-settings-dialog')).toBeTruthy()
  })

  it('persists category color overrides from the Theme workspace', async () => {
    renderThemePage()
    fireEvent.click(screen.getByRole('button', { name: /open category modal/i }))

    await waitFor(() => {
      expect(screen.queryByText('Loading plugin catalog…')).toBeNull()
    })

    const dynamicsPicker = screen.getByLabelText('Dynamics color') as HTMLInputElement
    fireEvent.change(dynamicsPicker, { target: { value: '#112233' } })

    expect(window.localStorage.getItem(CATEGORY_COLOR_OVERRIDE_STORAGE_KEY)).toContain('#112233')
    expect(screen.getByText('#112233')).toBeTruthy()
  })

  it('persists reduced-effects mode and GUI font changes', () => {
    renderThemePage()

    fireEvent.click(screen.getByRole('button', { name: /open motion modal/i }))
    const reduceEffectsToggle = screen.getByRole('switch', { name: /reduce effects mode/i })
    fireEvent.click(reduceEffectsToggle)

    expect(window.localStorage.getItem(REDUCED_EFFECTS_STORAGE_KEY)).toContain('"reducedEffectsEnabled":true')

    fireEvent.click(screen.getAllByRole('button', { name: /^close$/i }).at(-1) as HTMLButtonElement)
    fireEvent.click(screen.getByRole('button', { name: /open font modal/i }))
    const interTile = screen.getByRole('radio', { name: /inter/i })
    fireEvent.click(interTile)

    return waitFor(() => {
      expect(window.localStorage.getItem('map2.platform-font-preset.v1')).toBe('inter')
      expect(document.documentElement.style.getPropertyValue('--font-ui')).toContain('Inter')
    })
  })

  it('persists the selected page transition preset from the motion modal', async () => {
    renderThemePage()

    fireEvent.click(screen.getByRole('button', { name: /open motion modal/i }))
    fireEvent.click(screen.getByRole('radio', { name: /pager slide/i }))

    await waitFor(() => {
      expect(window.localStorage.getItem(REDUCED_EFFECTS_STORAGE_KEY)).toContain('"pageTransitionPreset":"pager-slide"')
    })
  })

  it('saves and applies a custom theme from the theme studio modal', async () => {
    renderThemePage()
    fireEvent.click(screen.getByRole('button', { name: /open theme studio/i }))

    fireEvent.change(screen.getByLabelText(/custom theme name/i), {
      target: { value: 'Ops Deck' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save and apply custom theme/i }))

    await waitFor(() => {
      expect(window.localStorage.getItem('custom-themes')).toContain('Ops Deck')
      expect(window.localStorage.getItem('theme')).toContain('custom-')
    })
  })

  it('exposes radio semantics for the custom token palette picker', () => {
    renderThemePage()
    fireEvent.click(screen.getByRole('button', { name: /open theme studio/i }))

    fireEvent.click(screen.getAllByRole('button', { name: /^Primary\b/i })[0])

    const familyGroup = screen.getByRole('radiogroup', { name: 'Color family' })
    const shadeGroup = screen.getByRole('radiogroup', { name: /shades$/i })

    expect(within(familyGroup).getAllByRole('radio').length).toBeGreaterThan(0)
    expect(within(shadeGroup).getAllByRole('radio').length).toBeGreaterThan(0)
  })

  it('shows plugin override controls inside the category workspace modal', async () => {
    renderThemePage()
    fireEvent.click(screen.getByRole('button', { name: /open category modal/i }))

    await waitFor(() => {
      expect(mockDiscover).toHaveBeenCalled()
      expect(screen.queryByText('Loading plugin catalog…')).toBeNull()
    })

    const modeGroup = screen.getByRole('group', { name: /category editor mode/i })
    expect(within(modeGroup).getByRole('button', { name: /plugin overrides/i })).toBeTruthy()
    expect(within(modeGroup).getByRole('button', { name: /category accents/i })).toBeTruthy()
  })

  it('falls back to the lightweight plugin catalog when discovery fails', async () => {
    mockDiscover.mockRejectedValueOnce(new Error('Plugin inventory warming'))

    renderThemePage()
    fireEvent.click(screen.getByRole('button', { name: /open category modal/i }))
    fireEvent.click(screen.getByRole('button', { name: /plugin overrides/i }))

    await waitFor(() => {
      expect(mockDiscover).toHaveBeenCalled()
      expect(mockGetAllPlugins).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.queryByText('Loading plugin catalog…')).toBeNull()
    })
    expect(screen.queryByText('Plugin catalog unavailable.')).toBeNull()
  })
})
