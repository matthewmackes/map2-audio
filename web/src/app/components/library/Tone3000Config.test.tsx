import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockGetTone3000Status = jest.fn()
const mockSetTone3000ApiKey = jest.fn()
const mockTestTone3000Auth = jest.fn()
const mockUseDownloadProgress = jest.fn()
const mockStartDownload = jest.fn()
const mockCancelDownload = jest.fn()

jest.mock('../../../map2/api', () => ({
  irLibraryApi: {
    getTone3000Status: (...args: unknown[]) => mockGetTone3000Status(...args),
    setTone3000ApiKey: (...args: unknown[]) => mockSetTone3000ApiKey(...args),
    testTone3000Auth: (...args: unknown[]) => mockTestTone3000Auth(...args),
  },
}))

jest.mock('../../hooks/useDownloadProgress', () => ({
  useDownloadProgress: () => mockUseDownloadProgress(),
}))

import { Tone3000Config } from './Tone3000Config'

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <Tone3000Config />
    </QueryClientProvider>,
  )
}

describe('Tone3000Config', () => {
  beforeEach(() => {
    mockGetTone3000Status.mockReset()
    mockSetTone3000ApiKey.mockReset()
    mockTestTone3000Auth.mockReset()
    mockUseDownloadProgress.mockReset()
    mockStartDownload.mockReset()
    mockCancelDownload.mockReset()

    mockGetTone3000Status.mockResolvedValue({
      configured: false,
      authenticated: false,
      auth_url: 'https://www.tone3000.com/api/v1/auth',
      token_expires: null,
    })
    mockSetTone3000ApiKey.mockResolvedValue({ status: 'ok', configured: true })
    mockTestTone3000Auth.mockResolvedValue({
      status: 'ok',
      authenticated: true,
      sample_models: [{ name: 'Model A', author: 'Author A', category: 'Amp' }],
    })

    mockUseDownloadProgress.mockReturnValue({
      startDownload: mockStartDownload,
      isDownloading: false,
      isStarting: false,
      status: { sources: [] },
      cancelDownload: mockCancelDownload,
      isCancelling: false,
    })
  })

  it('shows credential setup and saves entered API key', async () => {
    renderComponent()

    await screen.findByRole('link', { name: 'Get API key' })

    fireEvent.click(screen.getByRole('button', { name: 'Enter key' }))
    fireEvent.change(screen.getByLabelText('Tone3000 API key'), {
      target: { value: '  abc123  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save API key' }))

    await waitFor(() => {
      expect(mockSetTone3000ApiKey).toHaveBeenCalledWith('abc123')
    })
  })

  it('renders configured controls and forwards download/cancel actions', async () => {
    mockGetTone3000Status.mockResolvedValue({
      configured: true,
      authenticated: true,
      auth_url: 'https://www.tone3000.com/api/v1/auth',
      token_expires: '2026-12-01T08:00:00Z',
    })
    mockUseDownloadProgress.mockReturnValue({
      startDownload: mockStartDownload,
      isDownloading: false,
      isStarting: false,
      status: {
        sources: [
          {
            name: 'tone3000',
            state: 'downloading',
            discovered: 12,
            total_files: 10,
            downloaded: 4,
            failed: 0,
            skipped: 1,
            current_file: 'amp-model.nam',
          },
        ],
      },
      cancelDownload: mockCancelDownload,
      isCancelling: false,
    })

    renderComponent()

    expect(await screen.findByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('Downloading models')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Download top 10 NAM models' }))
    fireEvent.click(screen.getByRole('button', { name: 'Download cabinet IRs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel download' }))

    expect(mockStartDownload).toHaveBeenCalledWith({
      sources: ['tone3000'],
      parallel: 4,
      skip_existing: true,
    })
    expect(mockStartDownload).toHaveBeenCalledWith({
      sources: ['djammincabs', 'overdriven'],
      parallel: 4,
      skip_existing: true,
    })
    expect(mockCancelDownload).toHaveBeenCalled()
  })

  it('runs authentication test and renders sample model feedback', async () => {
    mockGetTone3000Status.mockResolvedValue({
      configured: true,
      authenticated: true,
      auth_url: 'https://www.tone3000.com/api/v1/auth',
      token_expires: null,
    })

    renderComponent()

    fireEvent.click(await screen.findByRole('button', { name: 'Test authentication' }))

    expect(await screen.findByText('Authentication successful')).toBeInTheDocument()
    expect(screen.getByText('Model A by Author A')).toBeInTheDocument()
  })
})
