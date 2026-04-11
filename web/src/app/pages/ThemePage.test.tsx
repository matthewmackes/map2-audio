import '@testing-library/jest-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { CATEGORY_COLOR_OVERRIDE_STORAGE_KEY } from '../data/categoryStyles'
import { REDUCED_EFFECTS_STORAGE_KEY, useEffectsSettingsStore } from '../stores/effectsSettingsStore'
import { HOME_DESKTOP_WALLPAPER_STORAGE_KEY } from './desktopWallpaper'
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
      landingTiles: [],
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
  function renderThemePage(initialEntries: string[] = ['/platforms/theme']) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    return render(
      <MemoryRouter
        initialEntries={initialEntries}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <QueryClientProvider client={queryClient}>
          <ThemePage />
        </QueryClientProvider>
      </MemoryRouter>,
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

  it('renders the dedicated Theme platform workspace as a unified editor workflow', () => {
    renderThemePage()

    expect(screen.getByRole('heading', { name: 'Theme' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Desktop Themes' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Scheme' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Preview target' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Token studio' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Appearance assets' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Desktop personalization' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Behavior and accessibility' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /open launcher organizer/i })).toBeNull()
  })

  it('uses the preset catalog as the only theme-selection control', () => {
    renderThemePage()

    expect(screen.queryByRole('combobox', { name: /^theme$/i })).toBeNull()
    expect(screen.getAllByRole('button', { name: /Carbon gray 10/i }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Windows 95/i })).toBeTruthy()
    expect(screen.getByText('Suggested directions')).toBeTruthy()
  })

  it('persists desktop wallpaper mode selections from the personalization section', () => {
    renderThemePage()

    fireEvent.click(screen.getByRole('radio', { name: /theme solid color/i }))

    expect(window.localStorage.getItem(HOME_DESKTOP_WALLPAPER_STORAGE_KEY)).toContain('"mode":"solid-theme"')
  })

  it('selects uploaded wallpaper mode without auto-opening the file picker', () => {
    renderThemePage()

    const uploadInput = screen.getByLabelText('Upload desktop wallpaper')
    const clickSpy = jest.spyOn(uploadInput, 'click')

    fireEvent.click(screen.getByRole('radio', { name: /uploaded image/i }))

    expect(window.localStorage.getItem(HOME_DESKTOP_WALLPAPER_STORAGE_KEY)).toContain('"mode":"uploaded-image"')
    expect(clickSpy).not.toHaveBeenCalled()
    expect(screen.getByText('No file chosen.')).toBeTruthy()
  })

  it('opens the hidden wallpaper upload input from the explicit choose-file action', async () => {
    renderThemePage()

    const uploadInput = screen.getByLabelText('Upload desktop wallpaper')
    const clickSpy = jest.spyOn(uploadInput, 'click')

    fireEvent.click(screen.getByRole('radio', { name: /uploaded image/i }))
    fireEvent.click(await screen.findByRole('button', { name: /choose file/i }))

    expect(clickSpy).toHaveBeenCalled()
  })

  it('exposes a classic preview target radio group for the desktop preview', () => {
    renderThemePage()

    const previewTargetGroup = screen.getByRole('radiogroup', { name: /preview target/i })

    expect(within(previewTargetGroup).getAllByRole('radio')).toHaveLength(4)
    expect(within(previewTargetGroup).getByRole('radio', { name: /^Active window/i })).toHaveAttribute('aria-checked', 'true')
  })

  it('opens the special settings menu from the behavior section', () => {
    renderThemePage()

    expect(screen.getByText('1 hidden plugin')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /open special settings menu/i }))

    expect(screen.getByTestId('special-settings-dialog')).toBeTruthy()
  })

  it('persists category color overrides from the appearance assets section', async () => {
    renderThemePage()

    const dynamicsPicker = screen.getByLabelText('Dynamics color') as HTMLInputElement
    fireEvent.change(dynamicsPicker, { target: { value: '#112233' } })

    expect(window.localStorage.getItem(CATEGORY_COLOR_OVERRIDE_STORAGE_KEY)).toContain('#112233')
    expect(screen.getByText('#112233')).toBeTruthy()
  })

  it('persists reduced-effects mode and GUI font changes', () => {
    renderThemePage()

    const reduceEffectsToggle = screen.getByRole('switch', { name: /reduce effects mode/i })
    fireEvent.click(reduceEffectsToggle)

    expect(window.localStorage.getItem(REDUCED_EFFECTS_STORAGE_KEY)).toContain('"reducedEffectsEnabled":true')

    const interTile = screen.getByRole('radio', { name: /inter/i })
    fireEvent.click(interTile)

    return waitFor(() => {
      expect(window.localStorage.getItem('map2.platform-font-preset.v1')).toBe('inter')
      expect(document.documentElement.style.getPropertyValue('--font-ui')).toContain('Inter')
    })
  })

  it('persists the selected page transition preset from the motion modal', async () => {
    renderThemePage()

    fireEvent.click(screen.getByRole('radio', { name: /pager slide/i }))

    await waitFor(() => {
      expect(window.localStorage.getItem(REDUCED_EFFECTS_STORAGE_KEY)).toContain('"pageTransitionPreset":"pager-slide"')
    })
  })

  it('saves and applies a custom theme from the integrated workbench', async () => {
    renderThemePage()

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

    fireEvent.click(screen.getByRole('button', { name: /^Primary\s+#/i }))

    const familyGroup = screen.getByRole('radiogroup', { name: 'Color family' })
    const shadeGroup = screen.getByRole('radiogroup', { name: /shades$/i })

    expect(within(familyGroup).getAllByRole('radio').length).toBeGreaterThan(0)
    expect(within(shadeGroup).getAllByRole('radio').length).toBeGreaterThan(0)
  })

  it('shows plugin override controls inside the appearance assets section', async () => {
    renderThemePage()
    fireEvent.click(screen.getByRole('button', { name: /plugin overrides/i }))

    await waitFor(() => {
      expect(mockDiscover).toHaveBeenCalled()
      expect(screen.queryByText('Loading plugin catalog…')).toBeNull()
    })

    const modeGroup = screen.getByRole('group', { name: /appearance assets mode/i })
    expect(within(modeGroup).getByRole('button', { name: /plugin overrides/i })).toBeTruthy()
    expect(within(modeGroup).getByRole('button', { name: /category accents/i })).toBeTruthy()
  })

  it('falls back to the lightweight plugin catalog when discovery fails', async () => {
    mockDiscover.mockRejectedValueOnce(new Error('Plugin inventory warming'))

    renderThemePage()
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
