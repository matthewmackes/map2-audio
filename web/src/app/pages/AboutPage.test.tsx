import React from 'react'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { AboutPage } from './AboutPage'

jest.mock('../components/ShoppingSearchDialog', () => ({
  ShoppingSearchDialog: () => null,
}))

describe('AboutPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
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
      if (url.includes('/api/system/docs/list')) {
        return { ok: true, json: async () => [] } as Response
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

    await screen.findByRole('heading', { name: /an open, educational/i })
    expect((globalThis.fetch as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/map2 · platform guide/i)).toBeTruthy()
    expect(screen.getByRole('heading', { name: /research library/i })).toBeTruthy()
    expect(document.querySelector('.about-page')).toBeTruthy()
    expect(document.querySelector('.about-page__surface')).toBeTruthy()
  })

  it('renders version and hardware helper sections without theme controls', async () => {
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

    await screen.findByRole('heading', { name: /an open, educational/i })

    expect(screen.getByText('Version')).toBeTruthy()
    expect(screen.getAllByText('License').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: /the open-source projects that make map2 possible\./i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /choose theme/i })).toBeNull()
  })

  it('shows the legal disclaimer first with the AGPL section visible', async () => {
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

    await screen.findByRole('heading', { name: /an open, educational/i })

    const legalHeading = screen.getByRole('heading', { name: /legal notice · agpl-3\.0-only · not affiliated/i })
    const missionHeading = screen.getByRole('heading', { name: /research & education/i })
    const agplHeading = screen.getByRole('button', { name: /gnu affero general public license v3\.0 \(agpl-3\.0-only\)/i })

    expect(legalHeading.compareDocumentPosition(missionHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(legalHeading.compareDocumentPosition(agplHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('button', { name: /legal disclaimer/i })).toBeNull()
  })
})
