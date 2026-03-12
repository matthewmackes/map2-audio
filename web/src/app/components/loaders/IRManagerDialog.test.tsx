import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockListCabinets = jest.fn()
const mockListReverbs = jest.fn()
const mockGetStatus = jest.fn()
const mockLoadCabinet = jest.fn()
const mockLoadReverb = jest.fn()
const mockUploadCabinet = jest.fn()
const mockUploadReverb = jest.fn()
const mockPushToast = jest.fn()

jest.mock('../../../map2/api', () => ({
  irApi: {
    listCabinets: (...args: unknown[]) => mockListCabinets(...args),
    listReverbs: (...args: unknown[]) => mockListReverbs(...args),
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
    loadCabinet: (...args: unknown[]) => mockLoadCabinet(...args),
    loadReverb: (...args: unknown[]) => mockLoadReverb(...args),
    uploadCabinet: (...args: unknown[]) => mockUploadCabinet(...args),
    uploadReverb: (...args: unknown[]) => mockUploadReverb(...args),
  },
}))

jest.mock('../Toasts', () => ({
  useToasts: () => ({
    pushToast: mockPushToast,
  }),
}))

import { IRManagerDialog } from './IRManagerDialog'

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <IRManagerDialog type="cabinet" open onClose={jest.fn()} />
    </QueryClientProvider>,
  )
}

describe('IRManagerDialog', () => {
  beforeEach(() => {
    mockListCabinets.mockReset()
    mockListReverbs.mockReset()
    mockGetStatus.mockReset()
    mockLoadCabinet.mockReset()
    mockLoadReverb.mockReset()
    mockUploadCabinet.mockReset()
    mockUploadReverb.mockReset()
    mockPushToast.mockReset()

    if (typeof window.matchMedia !== 'function') {
      Object.defineProperty(window, 'matchMedia', {
        value: jest.fn().mockImplementation((query: string) => ({
          matches: query.includes('max-width') ? false : false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
        configurable: true,
      })
    }

    if (typeof window.ResizeObserver === 'undefined') {
      Object.defineProperty(window, 'ResizeObserver', {
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
        configurable: true,
      })
    }

    mockListCabinets.mockResolvedValue({
      irs: [
        { name: 'Cab A', type: 'cabinet', path: '/tmp/cab-a.wav', size: 2048, sample_rate: 48000 },
        { name: 'Cab B', type: 'cabinet', path: '/tmp/cab-b.wav', size: 4096, sample_rate: 44100 },
      ],
      count: 2,
    })
    mockGetStatus.mockResolvedValue({ available: true, loaded_cabinet: 'Cab B' })
    mockLoadCabinet.mockResolvedValue({})
    mockUploadCabinet.mockResolvedValue({ filename: 'new-cab.wav' })
  })

  it('renders cabinet rows and loads selected IR', async () => {
    renderDialog()

    expect(await screen.findByText('Cab A')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Load' })[0])

    await waitFor(() => {
      expect(mockLoadCabinet).toHaveBeenCalled()
    })
    expect(mockLoadCabinet.mock.calls[0]?.[0]).toBe('Cab A')
  })

  it('filters rows via search input', async () => {
    renderDialog()

    expect(await screen.findByText('Cab B')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), {
      target: { value: 'Cab A' },
    })

    expect(screen.getByText('Cab A')).toBeInTheDocument()
    expect(screen.queryByText('Cab B')).not.toBeInTheDocument()
  })
})
