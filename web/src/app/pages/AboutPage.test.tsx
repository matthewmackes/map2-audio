import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { AboutPage } from './AboutPage'
import { CATEGORY_COLOR_OVERRIDE_STORAGE_KEY } from '../data/categoryStyles'
import { REDUCED_EFFECTS_STORAGE_KEY, useEffectsSettingsStore } from '../stores/effectsSettingsStore'

jest.mock('../components/ThemeCreatorDialog', () => ({
  ThemeCreatorDialog: () => null,
}))

jest.mock('../components/ShoppingSearchDialog', () => ({
  ShoppingSearchDialog: () => null,
}))

describe('AboutPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useEffectsSettingsStore.setState({ reducedEffectsEnabled: false })
    ;(globalThis as { fetch?: typeof fetch }).fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/version')) {
        return { ok: true, json: async () => ({ version: '0.0.0-test' }) } as Response
      }
      if (url.includes('/api/system/welcome-banner')) {
        return { ok: true, json: async () => ({ installed: false }) } as Response
      }
      if (url.includes('/api/system/boot-splash')) {
        return { ok: true, json: async () => ({ installed: false }) } as Response
      }
      return { ok: true, json: async () => ({}) } as Response
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    delete (globalThis as { fetch?: typeof fetch }).fetch
  })

  it('renders Carbon route shell and page heading', async () => {
    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AboutPage />
      </MemoryRouter>,
    )

    await waitFor(() => expect((globalThis.fetch as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(3))
    expect(screen.getByRole('heading', { name: /map2 platform guide/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /choose theme/i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /category colors/i })).toBeTruthy()
    expect(document.querySelector('.about-page')).toBeTruthy()
    expect(document.querySelector('.about-page__surface')).toBeTruthy()
  })

  it('persists category color changes from the settings card', async () => {
    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AboutPage />
      </MemoryRouter>,
    )

    await waitFor(() => expect((globalThis.fetch as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(3))

    const dynamicsPicker = screen.getByLabelText('Dynamics color') as HTMLInputElement
    fireEvent.change(dynamicsPicker, { target: { value: '#112233' } })

    expect(window.localStorage.getItem(CATEGORY_COLOR_OVERRIDE_STORAGE_KEY)).toContain('#112233')
    expect(screen.getByText('#112233')).toBeTruthy()
  })

  it('persists the reduced effects preference from the theme settings card', async () => {
    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AboutPage />
      </MemoryRouter>,
    )

    await waitFor(() => expect((globalThis.fetch as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(3))

    const reduceEffectsButton = screen.getByRole('button', { name: /reduce effects mode/i })
    fireEvent.click(reduceEffectsButton)

    expect(reduceEffectsButton).toHaveAttribute('aria-pressed', 'true')
    expect(window.localStorage.getItem(REDUCED_EFFECTS_STORAGE_KEY)).toContain('"reducedEffectsEnabled":true')
  })
})
