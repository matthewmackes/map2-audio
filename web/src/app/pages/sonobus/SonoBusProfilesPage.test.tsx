/**
 * T2521-6f — SonoBusProfilesPage tests.
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

const mockUseSonoBusProfiles = jest.fn()

jest.mock('./useSonoBusBindings', () => ({
  __esModule: true,
  useSonoBusProfiles: () => mockUseSonoBusProfiles(),
}))

import { SonoBusProfilesPage } from './SonoBusProfilesPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <SonoBusProfilesPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockUseSonoBusProfiles.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
  })
})

describe('SonoBusProfilesPage', () => {
  it('renders heading + empty state', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'SonoBus Profiles' })).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-profiles-empty')).toBeInTheDocument()
  })

  it('renders one card per preset', () => {
    mockUseSonoBusProfiles.mockReturnValue({
      data: [
        {
          profile_id: 'pcm_lowest_latency',
          label: 'PCM lowest latency',
          codec_profile: 'pcm',
          stream_format: 'pcm_s24_48000',
          jitter_buffer_ms: 4,
          resend_policy: 'burst_loss_only',
          latency_target_ms: 8,
          description: 'Q9 default.',
        },
        {
          profile_id: 'pcm_resilient',
          label: 'PCM resilient',
          codec_profile: 'pcm',
          stream_format: 'pcm_s24_48000',
          jitter_buffer_ms: 12,
          resend_policy: 'full',
          latency_target_ms: 20,
          description: 'For lossy paths.',
        },
      ],
      isLoading: false,
      isError: false,
    })
    renderPage()
    const lowest = screen.getByTestId('sonobus-profile-pcm_lowest_latency')
    const resilient = screen.getByTestId('sonobus-profile-pcm_resilient')
    expect(lowest).toHaveTextContent('PCM lowest latency')
    expect(lowest).toHaveTextContent('4 ms')
    expect(resilient).toHaveTextContent('full')
  })

  it('shows error tag when query fails', () => {
    mockUseSonoBusProfiles.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    })
    renderPage()
    expect(screen.getByText('Profiles query failed')).toBeInTheDocument()
  })
})
