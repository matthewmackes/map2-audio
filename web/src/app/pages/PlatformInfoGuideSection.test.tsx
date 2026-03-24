import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { PlatformInfoGuideSection } from './PlatformInfoGuideSection'

describe('PlatformInfoGuideSection', () => {
  let anchorClickSpy: jest.SpyInstance

  beforeEach(() => {
    window.localStorage.clear()
    anchorClickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    ;(globalThis as { fetch?: typeof fetch }).fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/system/docs/list')) {
        return {
          ok: true,
          json: async () => ([
            {
              name: 'README.md',
              title: 'Welcome',
              summary: 'Platform orientation guide.',
              category: 'General',
              headings: ['Welcome'],
              keywords: ['welcome', 'platform'],
            },
            {
              name: 'midi/CLOCK_SYNC.md',
              title: 'Clock Sync',
              summary: 'Transport alignment notes.',
              category: 'MIDI',
              headings: ['Clock Sync', 'MIDI Clock'],
              keywords: ['midi', 'clock'],
            },
          ]),
        } as Response
      }
      return { ok: false, status: 404 } as Response
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    anchorClickSpy.mockRestore()
    delete (globalThis as { fetch?: typeof fetch }).fetch
  })

  it('renders grouped docs with direct download actions', async () => {
    render(
      <MemoryRouter
        initialEntries={['/platform?panel=about&context=juce-grid']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PlatformInfoGuideSection themeCard={<div>Theme card</div>} />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Documentation library')).toBeTruthy()
    expect(await screen.findByText('Recommended')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'MIDI' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Clock Sync' })).toBeTruthy()
    expect(await screen.findAllByRole('button', { name: 'Download' })).toHaveLength(2)
  })

  it('filters using summary and stores a recent document after downloading', async () => {
    render(
      <MemoryRouter
        initialEntries={['/platform?panel=about&context=juce-grid']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PlatformInfoGuideSection themeCard={<div>Theme card</div>} />
      </MemoryRouter>,
    )

    const filter = await screen.findByLabelText('Filter documentation')
    fireEvent.change(filter, { target: { value: 'transport' } })
    fireEvent.click((await screen.findAllByRole('button', { name: 'Download' }))[0])

    await waitFor(() => expect(screen.getByText('Recent')).toBeTruthy())
    expect(window.localStorage.getItem('map2_doc_library_recent_v1')).toContain('midi/CLOCK_SYNC.md')
  })
})
