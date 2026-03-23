import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockListModels = jest.fn()
const mockGetStatus = jest.fn()
const mockGetInstanceStatus = jest.fn()
const mockLoadModel = jest.fn()
const mockLoadModelToInstance = jest.fn()
const mockUpload = jest.fn()
const mockPushToast = jest.fn()
const mockFetch = jest.fn()

jest.mock('../../../map2/api', () => ({
  namApi: {
    listModels: (...args: unknown[]) => mockListModels(...args),
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
    getInstanceStatus: (...args: unknown[]) => mockGetInstanceStatus(...args),
    loadModel: (...args: unknown[]) => mockLoadModel(...args),
    loadModelToInstance: (...args: unknown[]) => mockLoadModelToInstance(...args),
    upload: (...args: unknown[]) => mockUpload(...args),
  },
}))

jest.mock('../Toasts', () => ({
  useToasts: () => ({
    pushToast: mockPushToast,
  }),
}))

import { NAMManagerDialog } from './NAMManagerDialog'

function renderDialog(instanceId?: number) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <NAMManagerDialog open onClose={jest.fn()} instanceId={instanceId} />
    </QueryClientProvider>,
  )
}

describe('NAMManagerDialog', () => {
  beforeEach(() => {
    mockListModels.mockReset()
    mockGetStatus.mockReset()
    mockGetInstanceStatus.mockReset()
    mockLoadModel.mockReset()
    mockLoadModelToInstance.mockReset()
    mockUpload.mockReset()
    mockPushToast.mockReset()
    mockFetch.mockReset()

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

    Object.defineProperty(global, 'fetch', {
      value: mockFetch,
      configurable: true,
      writable: true,
    })

    mockListModels.mockResolvedValue({
      models: [
        { name: 'Mesa Mark V', type: 'amp', size_mb: 42.6 },
        { name: 'Tube Screamer OD', type: 'pedal', size_mb: 8.2 },
      ],
      total: 2,
      limit: 100,
      offset: 0,
    })

    mockGetStatus.mockResolvedValue({
      available: true,
      activeModel: 'Mesa Mark V',
      mix: 1,
      bypass: false,
      inputLevel: 0,
      outputLevel: 0,
      peakInput: 0,
      peakOutput: 0,
      latency: 0,
      availableModels: ['Mesa Mark V', 'Tube Screamer OD'],
    })
    mockGetInstanceStatus.mockResolvedValue({
      available: true,
      activeModel: 'Mesa Mark V',
      mix: 1,
      bypass: false,
      inputLevel: 0,
      outputLevel: 0,
      peakInput: 0,
      peakOutput: 0,
      latency: 0,
      availableModels: ['Mesa Mark V', 'Tube Screamer OD'],
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          {
            id: 'featured-1',
            name: 'Tube Screamer OD',
            amp_name: 'Tube Screamer',
            amp_type: 'Overdrive',
          },
        ],
      }),
    })

    mockLoadModel.mockResolvedValue({})
    mockLoadModelToInstance.mockResolvedValue({})
    mockUpload.mockResolvedValue({ model: { name: 'uploaded.nam' } })
  })

  it('renders grouped models and loads a selected model', async () => {
    renderDialog()

    const ampHeader = await screen.findByText('Amplifiers (1)')
    expect(ampHeader).toBeInTheDocument()

    const pedalHeader = screen.getByText('Pedals and drives (1)')
    const pedalSection = pedalHeader.closest('section')
    expect(pedalSection).not.toBeNull()

    fireEvent.click(within(pedalSection as HTMLElement).getByRole('button', { name: 'Load' }))

    await waitFor(() => {
      expect(mockLoadModel).toHaveBeenCalledWith('Tube Screamer OD')
    })
  })

  it('filters models from search input', async () => {
    renderDialog()

    expect(await screen.findByText('Mesa Mark V')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), {
      target: { value: 'tube' },
    })

    expect(screen.getByText('Tube Screamer OD')).toBeInTheDocument()
    expect(screen.queryByText('Mesa Mark V')).not.toBeInTheDocument()
  })

  it('uploads a NAM file from the file chooser control', async () => {
    renderDialog()

    await screen.findByText('Mesa Mark V')

    fireEvent.change(screen.getByLabelText('Upload NAM model file'), {
      target: {
        files: [new File(['nam-data'], 'fresh-profile.nam', { type: 'application/octet-stream' })],
      },
    })

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(1)
    })
    expect((mockUpload.mock.calls[0]?.[0] as File).name).toBe('fresh-profile.nam')
    await waitFor(() => {
      expect(mockLoadModel.mock.calls[0]?.[0]).toBe('uploaded.nam')
    })
  })

  it('uses instance-scoped NAM status and load calls when instanceId is provided', async () => {
    renderDialog(17)

    await screen.findByText('Mesa Mark V')

    expect(mockGetInstanceStatus).toHaveBeenCalledWith(17)

    fireEvent.click(screen.getAllByRole('button', { name: 'Load' })[0])

    await waitFor(() => {
      expect(mockLoadModelToInstance).toHaveBeenCalledWith('Tube Screamer OD', 17)
    })
    expect(mockLoadModel).not.toHaveBeenCalled()
  })
})
