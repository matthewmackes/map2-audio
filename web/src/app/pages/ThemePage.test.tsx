import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { CATEGORY_COLOR_OVERRIDE_STORAGE_KEY } from '../data/categoryStyles'
import { REDUCED_EFFECTS_STORAGE_KEY, useEffectsSettingsStore } from '../stores/effectsSettingsStore'
import { ThemePage } from './ThemePage'

const mockUpdateSpecialSettings = jest.fn()

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
    useEffectsSettingsStore.setState({ reducedEffectsEnabled: false })
    mockUpdateSpecialSettings.mockReset()

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
    render(<ThemePage />)

    expect(screen.getByRole('heading', { name: 'Theme' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /open theme library/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /open directions/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /open theme studio/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /open font modal/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /open category modal/i })).toBeTruthy()
  })

  it('opens the special settings menu from the motion section', () => {
    render(<ThemePage />)

    fireEvent.click(screen.getByRole('button', { name: /open motion modal/i }))
    expect(screen.getByText('1 hidden plugin')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /open special settings menu/i }))

    expect(screen.getByTestId('special-settings-dialog')).toBeTruthy()
  })

  it('persists category color overrides from the Theme workspace', () => {
    render(<ThemePage />)
    fireEvent.click(screen.getByRole('button', { name: /open category modal/i }))

    const dynamicsPicker = screen.getByLabelText('Dynamics color') as HTMLInputElement
    fireEvent.change(dynamicsPicker, { target: { value: '#112233' } })

    expect(window.localStorage.getItem(CATEGORY_COLOR_OVERRIDE_STORAGE_KEY)).toContain('#112233')
    expect(screen.getByText('#112233')).toBeTruthy()
  })

  it('persists reduced-effects mode and GUI font changes', () => {
    render(<ThemePage />)

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

  it('saves and applies a custom theme from the theme studio modal', async () => {
    render(<ThemePage />)
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
    render(<ThemePage />)
    fireEvent.click(screen.getByRole('button', { name: /open theme studio/i }))

    fireEvent.click(screen.getAllByRole('button', { name: /^Primary\b/i })[0])

    const familyGroup = screen.getByRole('radiogroup', { name: 'Color family' })
    const shadeGroup = screen.getByRole('radiogroup', { name: /shades$/i })

    expect(within(familyGroup).getAllByRole('radio').length).toBeGreaterThan(0)
    expect(within(shadeGroup).getAllByRole('radio').length).toBeGreaterThan(0)
  })
})
