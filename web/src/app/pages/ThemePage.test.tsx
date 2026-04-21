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

jest.mock('react-virtualized-auto-sizer', () => ({
  __esModule: true,
  default: ({ children }: { children: (size: { width: number; height: number }) => React.ReactNode }) =>
    children({ width: 480, height: 320 }),
}))

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
  resolveSnapshotEditorSignalCanvasSettings: () => ({
    flowAnimation: 'cascade',
    gridBackdrop: true,
    nodeShape: 'rounded',
  }),
}))

jest.mock('../components/SpecialSettingsDialog', () => ({
  SpecialSettingsDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="special-settings-dialog">Special settings dialog</div> : null,
}))

describe('ThemePage', () => {
  function openThemeTab(label: RegExp | string) {
    fireEvent.click(screen.getByRole('tab', { name: label }))
  }

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

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: jest.fn(),
    })
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

  it('renders the dedicated Theme platform workspace as top tabs with one focused panel at a time', () => {
    renderThemePage()

    expect(screen.getByRole('heading', { name: 'Theme', level: 1 })).toBeTruthy()
    expect(screen.getByRole('tablist', { name: 'Theme workspace sections' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Appearance' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Scheme and Preview' })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'Preview' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Color Scheme' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Personalization' })).toBeNull()

    openThemeTab('Fonts and Objects')
    expect(screen.getByRole('heading', { name: 'Fonts and Objects' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Objects' })).toBeTruthy()

    openThemeTab('Background')
    expect(screen.getByRole('heading', { name: 'Background' })).toBeTruthy()

    openThemeTab('Behavior')
    expect(screen.getByRole('heading', { name: 'Behavior and accessibility' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /open launcher organizer/i })).toBeNull()
  })

  it('uses the preset catalog as the only theme-selection control', () => {
    renderThemePage()

    expect(screen.queryByRole('combobox', { name: /^theme$/i })).toBeNull()
    expect(screen.getByRole('combobox', { name: /^scheme$/i })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Carbon gray 10/i }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Carbon white/i })).toBeTruthy()
    expect(screen.getByText('Quick Starts')).toBeTruthy()
  })

  it('persists desktop wallpaper mode selections from the background section', () => {
    renderThemePage()
    openThemeTab('Background')

    fireEvent.click(screen.getByRole('radio', { name: /theme color/i }))

    expect(window.localStorage.getItem(HOME_DESKTOP_WALLPAPER_STORAGE_KEY)).toContain('"mode":"solid-theme"')
  })

  it('selects uploaded wallpaper mode without auto-opening the file picker', () => {
    renderThemePage()
    openThemeTab('Background')

    const uploadInput = screen.getByLabelText('Upload desktop wallpaper')
    const clickSpy = jest.spyOn(uploadInput, 'click')

    fireEvent.click(screen.getByRole('radio', { name: /upload image/i }))

    expect(window.localStorage.getItem(HOME_DESKTOP_WALLPAPER_STORAGE_KEY)).toContain('"mode":"uploaded-image"')
    expect(clickSpy).not.toHaveBeenCalled()
    expect(screen.getByText('No file chosen.')).toBeTruthy()
  })

  it('opens the hidden wallpaper upload input from the explicit choose-file action', async () => {
    renderThemePage()
    openThemeTab('Background')

    const uploadInput = screen.getByLabelText('Upload desktop wallpaper')
    const clickSpy = jest.spyOn(uploadInput, 'click')

    fireEvent.click(screen.getByRole('radio', { name: /upload image/i }))
    fireEvent.click(await screen.findByRole('button', { name: /choose file/i }))

    expect(clickSpy).toHaveBeenCalled()
  })

  it('exposes a classic preview target radio group inside the appearance tab', () => {
    renderThemePage()

    const previewTargetGroup = screen.getByRole('radiogroup', { name: /preview target/i })

    expect(within(previewTargetGroup).getAllByRole('radio')).toHaveLength(4)
    expect(within(previewTargetGroup).getByRole('radio', { name: /^Active window/i })).toHaveAttribute('aria-checked', 'true')
  })

  it('uses Primary Strong and Text Inverse for active preview title bars', () => {
    renderThemePage()

    const activeWindowBar = screen.getByText('Active Window').closest('.theme-page__desktop-window-bar')
    const messageBoxBar = screen.getByText('Message Box').closest('.theme-page__desktop-window-bar')

    expect(activeWindowBar).not.toBeNull()
    expect(messageBoxBar).not.toBeNull()
    expect(activeWindowBar).toHaveStyle('background: rgb(0, 67, 206); color: rgb(255, 255, 255);')
    expect(messageBoxBar).toHaveStyle('background: rgb(0, 67, 206); color: rgb(255, 255, 255);')
  })

  it('opens the special settings menu from the behavior section', () => {
    renderThemePage()
    openThemeTab('Behavior')

    expect(screen.getByText('1 hidden plugin')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /open special settings menu/i }))

    expect(screen.getByTestId('special-settings-dialog')).toBeTruthy()
  })

  it('moves focus into the token palette picker and restores it to the slot trigger on close', () => {
    renderThemePage()
    fireEvent.click(screen.getByRole('button', { name: /^Customize$/i }))

    const primarySlot = screen.getByRole('button', { name: /^Primary\s+#/i })
    fireEvent.click(primarySlot)

    const firstFamilyButton = screen.getByRole('radio', { name: /select blue family/i })
    expect(firstFamilyButton).toHaveFocus()

    fireEvent.click(within(firstFamilyButton.closest('.theme-page__picker') as HTMLElement).getByRole('button', { name: /^close$/i }))
    expect(primarySlot).toHaveFocus()
  })

  it('persists category color overrides from the fonts and objects section with the constrained palette picker', async () => {
    renderThemePage()
    openThemeTab('Fonts and Objects')

    expect(screen.queryByDisplayValue('#112233')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Dynamics color' }))
    fireEvent.click(screen.getByRole('radio', { name: /select cyan family/i }))
    fireEvent.click(screen.getByRole('radio', { name: /select cyan 50/i }))

    expect(window.localStorage.getItem(CATEGORY_COLOR_OVERRIDE_STORAGE_KEY)).toContain('#1192e8')
    expect(screen.getByText('#1192e8')).toBeTruthy()
  })

  it('persists reduced-effects mode and GUI font changes', () => {
    renderThemePage()
    openThemeTab('Behavior')

    const reduceEffectsToggle = screen.getByRole('switch', { name: /reduce effects mode/i })
    fireEvent.click(reduceEffectsToggle)

    expect(window.localStorage.getItem(REDUCED_EFFECTS_STORAGE_KEY)).toContain('"reducedEffectsEnabled":true')

    openThemeTab('Fonts and Objects')
    const interLabel = screen.getByText('Inter')
    const interTile = interLabel.closest('button')
    expect(interTile).not.toBeNull()
    fireEvent.click(interTile as HTMLButtonElement)

    return waitFor(() => {
      expect(window.localStorage.getItem('map2.platform-font-preset.v1')).toBe('inter')
      expect(document.documentElement.style.getPropertyValue('--font-ui')).toContain('Inter')
    })
  })

  it('persists the selected page transition preset from the motion modal', async () => {
    renderThemePage()
    openThemeTab('Behavior')

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

  it('cancels theme switching when unsaved token overrides exist', async () => {
    renderThemePage()
    fireEvent.click(screen.getByRole('button', { name: /^Customize$/i }))

    fireEvent.click(screen.getByRole('button', { name: /^Primary\s+#/i }))
    fireEvent.click(screen.getByRole('radio', { name: /select cyan family/i }))
    fireEvent.click(screen.getByRole('radio', { name: /select cyan 50/i }))
    fireEvent.click(screen.getByRole('button', { name: /carbon white/i }))

    expect(screen.getByText('Discard unsaved token edits?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('Draft preview active')).toBeTruthy()
    expect(screen.getAllByText('Blue / Gray 10').length).toBeGreaterThan(0)
  })

  it('discards token overrides only after explicit confirmation during theme switching', async () => {
    renderThemePage()
    fireEvent.click(screen.getByRole('button', { name: /^Customize$/i }))

    fireEvent.click(screen.getByRole('button', { name: /^Primary\s+#/i }))
    fireEvent.click(screen.getByRole('radio', { name: /select cyan family/i }))
    fireEvent.click(screen.getByRole('radio', { name: /select cyan 50/i }))
    fireEvent.click(screen.getByRole('button', { name: /carbon white/i }))
    fireEvent.click(screen.getByRole('button', { name: /discard and switch/i }))

    await waitFor(() => {
      expect(screen.getAllByText('Carbon white').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Live shell').length).toBeGreaterThan(0)
    })
  })

  it('disables draft actions until the draft becomes dirty', () => {
    renderThemePage()

    expect(screen.getByRole('button', { name: /reset draft/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /save and apply custom theme/i })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /^Customize$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Primary\s+#/i }))
    fireEvent.click(screen.getByRole('radio', { name: /select cyan family/i }))
    fireEvent.click(screen.getByRole('radio', { name: /select cyan 50/i }))

    expect(screen.getByRole('button', { name: /reset draft/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /save and apply custom theme/i })).toBeEnabled()
  })

  it('shows a persistent draft warning with a save-now action for token overrides', async () => {
    renderThemePage()
    fireEvent.click(screen.getByRole('button', { name: /^Customize$/i }))

    fireEvent.click(screen.getByRole('button', { name: /^Primary\s+#/i }))
    fireEvent.click(screen.getByRole('radio', { name: /select cyan family/i }))
    fireEvent.click(screen.getByRole('radio', { name: /select cyan 50/i }))

    expect(screen.getByText('Token overrides are still in draft.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /save now/i }))

    await waitFor(() => {
      expect(window.localStorage.getItem('custom-themes')).toContain('Blue / Gray 10')
      expect(window.localStorage.getItem('theme')).toContain('custom-')
    })
  })

  it('exposes radio semantics for the custom token palette picker', () => {
    renderThemePage()
    fireEvent.click(screen.getByRole('button', { name: /^Customize$/i }))

    fireEvent.click(screen.getByRole('button', { name: /^Primary\s+#/i }))

    const familyGroup = screen.getByRole('radiogroup', { name: 'Color family' })
    const shadeGroup = screen.getByRole('radiogroup', { name: /shades$/i })

    expect(within(familyGroup).getAllByRole('radio').length).toBeGreaterThan(0)
    expect(within(shadeGroup).getAllByRole('radio').length).toBeGreaterThan(0)
  })

  it('shows plugin override controls inside the fonts and objects section', async () => {
    renderThemePage()
    openThemeTab('Fonts and Objects')
    fireEvent.click(screen.getByRole('button', { name: /plugin appearance/i }))

    await waitFor(() => {
      expect(mockDiscover).toHaveBeenCalled()
      expect(screen.queryByText('Loading plugin catalog…')).toBeNull()
    })

    const modeGroup = screen.getByRole('group', { name: /appearance assets mode/i })
    expect(within(modeGroup).getByRole('button', { name: /plugin appearance/i })).toBeTruthy()
    expect(within(modeGroup).getByRole('button', { name: /category colors/i })).toBeTruthy()
  })

  it('uses display-friendly labels for plugin source filters', async () => {
    renderThemePage()
    openThemeTab('Fonts and Objects')
    fireEvent.click(screen.getByRole('button', { name: /plugin appearance/i }))

    await waitFor(() => {
      expect(mockDiscover).toHaveBeenCalled()
    })

    expect(screen.getByRole('button', { name: /^All sources$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^LV2$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^JUCE$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Toob Amp$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Hardware$/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^toobamp$/i })).toBeNull()
  })

  it('switches active panels from the top tabs', () => {
    renderThemePage()

    expect(screen.getByRole('tab', { name: 'Appearance' })).toHaveAttribute('aria-selected', 'true')
    openThemeTab('Background')
    expect(screen.getByRole('tab', { name: 'Background' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('heading', { name: 'Behavior and accessibility' })).toBeNull()
  })

  it('keeps library actions available while other panels replace the main view', () => {
    renderThemePage()

    expect(screen.getByRole('button', { name: /save and apply custom theme/i })).toBeTruthy()
    openThemeTab('Behavior')
    expect(screen.queryByRole('button', { name: /save and apply custom theme/i })).toBeNull()
  })

  it('falls back to the lightweight plugin catalog when discovery fails', async () => {
    mockDiscover.mockRejectedValueOnce(new Error('Plugin inventory warming'))

    renderThemePage()
    openThemeTab('Fonts and Objects')
    fireEvent.click(screen.getByRole('button', { name: /plugin appearance/i }))

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
