import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { PlatformInfoGuideSection } from './PlatformInfoGuideSection'

describe('PlatformInfoGuideSection', () => {
  beforeEach(() => {
    window.localStorage.clear()
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
      if (url.includes('/api/system/docs/midi%2FCLOCK_SYNC.md')) {
        return {
          ok: true,
          text: async () => '# Clock Sync\n\nTransport alignment notes.\n',
        } as Response
      }
      if (url.includes('/api/system/docs/README.md')) {
        return {
          ok: true,
          text: async () => '# Welcome\n\nPlatform orientation guide.\n',
        } as Response
      }
      return { ok: false, status: 404 } as Response
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    delete (globalThis as { fetch?: typeof fetch }).fetch
  })

  it('renders grouped docs and opens a deep-linked document', async () => {
    render(
      <MemoryRouter
        initialEntries={['/platform?panel=about&context=juce-grid&doc=midi%2FCLOCK_SYNC.md']}
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
    expect(await screen.findByText('MIDI')).toBeTruthy()
    await waitFor(() => expect(screen.getAllByText('Clock Sync').length).toBeGreaterThan(0))
    expect(screen.getByRole('button', { name: /deep link/i })).toBeTruthy()
  })

  it('filters using summary and stores a recent document after opening', async () => {
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
    fireEvent.click(await screen.findByRole('button', { name: /clock sync/i }))

    await waitFor(() => expect(screen.getByText('Recent')).toBeTruthy())
    expect(window.localStorage.getItem('map2_doc_library_recent_v1')).toContain('midi/CLOCK_SYNC.md')
  })
})
