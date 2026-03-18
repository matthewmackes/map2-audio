import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { AboutPage } from './AboutPage'

jest.mock('../components/ThemeCreatorDialog', () => ({
  ThemeCreatorDialog: () => null,
}))

jest.mock('../components/ShoppingSearchDialog', () => ({
  ShoppingSearchDialog: () => null,
}))

describe('AboutPage', () => {
  beforeEach(() => {
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
    expect(document.querySelector('.about-page')).toBeTruthy()
    expect(document.querySelector('.about-page__surface')).toBeTruthy()
  })
})
