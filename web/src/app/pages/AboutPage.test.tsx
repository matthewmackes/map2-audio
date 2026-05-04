import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { AboutPage } from './AboutPage'

describe('AboutPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    ;(globalThis as { fetch?: typeof fetch }).fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/version')) {
        return { ok: true, json: async () => ({ version: '0.0.0-test', build_date: '2026-05-04', commit: 'abcdef1' }) } as Response
      }
      return { ok: true, json: async () => ({}) } as Response
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    delete (globalThis as { fetch?: typeof fetch }).fetch
  })

  it('renders the platform overview hero and accent title', async () => {
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

    await screen.findByRole('heading', { name: /an open, educational platform for/i })
    expect(screen.getByText(/01 · Platform overview/i)).toBeTruthy()
    expect(screen.getByText(/Mackes Audio Platform 2/i)).toBeTruthy()
  })

  it('renders the operating modes, signal chain and architecture sections', async () => {
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

    await screen.findByRole('heading', { name: /three modes, one platform/i })
    expect(screen.getByRole('heading', { name: /input to archive, in nine stages/i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /the stack, end to end/i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /open-source roots/i })).toBeTruthy()
  })

  it('renders the legal section with AGPLv3 disclaimer', async () => {
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

    await screen.findByRole('heading', { name: /agpl-3\.0/i })
    expect(screen.getByText(/Not affiliated/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Read AGPLv3/i })).toBeTruthy()
  })
})
