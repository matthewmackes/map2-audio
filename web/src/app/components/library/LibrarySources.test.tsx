import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockGetIrLibraries = jest.fn()
const mockGetSoundFontLibraries = jest.fn()
const mockUseDownloadProgress = jest.fn()
const mockUseSoundFontDownloadProgress = jest.fn()
const mockStartDownload = jest.fn()
const mockStartSoundFontDownload = jest.fn()

jest.mock('../../../map2/api', () => ({
  irLibraryApi: {
    getLibraries: (...args: unknown[]) => mockGetIrLibraries(...args),
  },
  soundfontApi: {
    getLibraries: (...args: unknown[]) => mockGetSoundFontLibraries(...args),
  },
}))

jest.mock('../../hooks/useDownloadProgress', () => ({
  useDownloadProgress: () => mockUseDownloadProgress(),
}))

jest.mock('../../hooks/useSoundFontDownloadProgress', () => ({
  useSoundFontDownloadProgress: () => mockUseSoundFontDownloadProgress(),
}))

jest.mock('./Tone3000Config', () => ({
  Tone3000Config: () => <div data-testid="tone3000-config">Tone3000 Config</div>,
}))

import { LibrarySources } from './LibrarySources'

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <LibrarySources />
    </QueryClientProvider>,
  )
}

describe('LibrarySources', () => {
  beforeEach(() => {
    mockGetIrLibraries.mockReset()
    mockGetSoundFontLibraries.mockReset()
    mockUseDownloadProgress.mockReset()
    mockUseSoundFontDownloadProgress.mockReset()
    mockStartDownload.mockReset()
    mockStartSoundFontDownload.mockReset()

    mockGetIrLibraries.mockResolvedValue({
      libraries: [
        { name: 'djammincabs', count: 24, license: 'Free for any use' },
        { name: 'tone3000', count: 10, license: 'Various' },
      ],
    })

    mockGetSoundFontLibraries.mockResolvedValue({
      libraries: [
        { name: 'sfzinstruments', count: 14, license: 'Various (mostly CC)' },
      ],
    })

    mockUseDownloadProgress.mockReturnValue({
      startDownload: mockStartDownload,
      isDownloading: false,
      isStarting: false,
      startError: null,
    })

    mockUseSoundFontDownloadProgress.mockReturnValue({
      startDownload: mockStartSoundFontDownload,
      isDownloading: false,
      startError: null,
    })
  })

  it('expands both source groups and renders source tiles', async () => {
    renderComponent()

    fireEvent.click(screen.getByRole('button', { name: 'Show all source groups' }))

    expect(await screen.findByText('Djammincabs')).toBeInTheDocument()
    expect(await screen.findByText('SFZ Instruments')).toBeInTheDocument()
    expect(screen.getByTestId('tone3000-config')).toBeInTheDocument()
  })

  it('starts IR/NAM downloads from section and source actions', async () => {
    renderComponent()

    fireEvent.click(screen.getByRole('button', { name: 'Show all source groups' }))
    await screen.findByText('Djammincabs')

    fireEvent.click(screen.getByRole('button', { name: 'Download all IR and NAM' }))
    fireEvent.click(screen.getByRole('button', { name: 'Download Djammincabs' }))

    expect(mockStartDownload).toHaveBeenCalledWith({ parallel: 4, skip_existing: true })
    expect(mockStartDownload).toHaveBeenCalledWith({ sources: ['djammincabs'], parallel: 4, skip_existing: true })
  })

  it('starts SoundFont downloads and shows SoundFont error notification', async () => {
    mockUseSoundFontDownloadProgress.mockReturnValue({
      startDownload: mockStartSoundFontDownload,
      isDownloading: false,
      startError: new Error('Token expired'),
    })

    renderComponent()

    fireEvent.click(screen.getByRole('button', { name: 'Show all source groups' }))
    await screen.findByText('SFZ Instruments')

    fireEvent.click(screen.getByRole('button', { name: 'Download all SoundFonts' }))
    fireEvent.click(screen.getByRole('button', { name: 'Download SFZ Instruments' }))

    await waitFor(() => {
      expect(mockStartSoundFontDownload).toHaveBeenCalledWith({ parallel: 4, skip_existing: true })
      expect(mockStartSoundFontDownload).toHaveBeenCalledWith({ sources: ['sfzinstruments'], parallel: 4, skip_existing: true })
    })

    expect(screen.getByText('SoundFont download failed')).toBeInTheDocument()
    expect(screen.getByText('Token expired')).toBeInTheDocument()
  })
})
