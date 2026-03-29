import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockListCabinets = jest.fn()
const mockListReverbs = jest.fn()
const mockGetTypeStatus = jest.fn()
const mockLoadCabinet = jest.fn()
const mockLoadCabinetToInstance = jest.fn()
const mockLoadCabinetAtPosition = jest.fn()
const mockLoadReverb = jest.fn()
const mockLoadReverbToInstance = jest.fn()
const mockLoadReverbAtPosition = jest.fn()
const mockUploadCabinet = jest.fn()
const mockUploadReverb = jest.fn()
const mockPushToast = jest.fn()

jest.mock('../../../map2/api', () => ({
  irApi: {
    listCabinets: (...args: unknown[]) => mockListCabinets(...args),
    listReverbs: (...args: unknown[]) => mockListReverbs(...args),
    getTypeStatus: (...args: unknown[]) => mockGetTypeStatus(...args),
    loadCabinet: (...args: unknown[]) => mockLoadCabinet(...args),
    loadCabinetToInstance: (...args: unknown[]) => mockLoadCabinetToInstance(...args),
    loadCabinetAtPosition: (...args: unknown[]) => mockLoadCabinetAtPosition(...args),
    loadReverb: (...args: unknown[]) => mockLoadReverb(...args),
    loadReverbToInstance: (...args: unknown[]) => mockLoadReverbToInstance(...args),
    loadReverbAtPosition: (...args: unknown[]) => mockLoadReverbAtPosition(...args),
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
import { getPluginIdentityKeyFromParts } from '../../../map2/utils/pluginIdentity'

function renderDialog(instanceId?: number, pluginPosition?: number) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <IRManagerDialog type="cabinet" open onClose={jest.fn()} instanceId={instanceId} pluginPosition={pluginPosition} />
      </QueryClientProvider>,
    ),
  }
}

describe('IRManagerDialog', () => {
  beforeEach(() => {
    mockListCabinets.mockReset()
    mockListReverbs.mockReset()
    mockGetTypeStatus.mockReset()
    mockLoadCabinet.mockReset()
    mockLoadCabinetToInstance.mockReset()
    mockLoadCabinetAtPosition.mockReset()
    mockLoadReverb.mockReset()
    mockLoadReverbToInstance.mockReset()
    mockLoadReverbAtPosition.mockReset()
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
    mockGetTypeStatus.mockResolvedValue({ available: true, loaded_cabinet: 'Cab B' })
    mockLoadCabinet.mockResolvedValue({})
    mockLoadCabinetToInstance.mockResolvedValue({})
    mockLoadCabinetAtPosition.mockResolvedValue({})
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

  it('uploads a cabinet IR from the file chooser control', async () => {
    renderDialog()

    await screen.findByText('Cab A')

    fireEvent.change(screen.getByLabelText('Upload cabinet IR file'), {
      target: {
        files: [new File(['wave-data'], 'new-cab.wav', { type: 'audio/wav' })],
      },
    })

    await waitFor(() => {
      expect(mockUploadCabinet).toHaveBeenCalledTimes(1)
    })
    expect((mockUploadCabinet.mock.calls[0]?.[0] as File).name).toBe('new-cab.wav')
    await waitFor(() => {
      expect(mockLoadCabinet.mock.calls[0]?.[0]).toBe('new-cab.wav')
    })
  })

  it('shows the active IR when status uses backend active_* fields', async () => {
    mockGetTypeStatus.mockResolvedValue({ available: true, active_cabinet: 'Cab B' })

    renderDialog()

    expect(await screen.findByText('Live: Cab B')).toBeInTheDocument()
  })

  it('uses instance-scoped cabinet load calls when instanceId is provided', async () => {
    renderDialog(21)

    await screen.findByText('Cab A')

    expect(mockGetTypeStatus).toHaveBeenCalledWith('cabinet', { instanceId: 21 })

    fireEvent.click(screen.getAllByRole('button', { name: 'Load' })[0])

    await waitFor(() => {
      expect(mockLoadCabinetToInstance).toHaveBeenCalledWith('Cab A', 21)
    })
    expect(mockLoadCabinet).not.toHaveBeenCalled()
  })

  it('uses position-scoped cabinet load calls when pluginPosition is provided', async () => {
    renderDialog(undefined, 7)

    await screen.findByText('Cab A')

    expect(mockGetTypeStatus).toHaveBeenCalledWith('cabinet', {
      instanceId: undefined,
      pluginPosition: 7,
    })

    fireEvent.click(screen.getAllByRole('button', { name: 'Load' })[0])

    await waitFor(() => {
      expect(mockLoadCabinetAtPosition).toHaveBeenCalledWith('Cab A', 7)
    })
    expect(mockLoadCabinet).not.toHaveBeenCalled()
  })

  it('invalidates only the scoped cabinet status query after a successful load', async () => {
    const { queryClient } = renderDialog(21, 7)
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    const statusScopeKey = getPluginIdentityKeyFromParts('map2://juce/convolution/cabinet', 7, 21)

    await screen.findByText('Cab A')

    fireEvent.click(screen.getAllByRole('button', { name: 'Load' })[0])

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ir', 'status', 'cabinet', statusScopeKey] })
    })
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['ir'] })
  })

  it('surfaces configured scoped IR state and runtime warnings', async () => {
    mockGetTypeStatus.mockResolvedValue({
      available: true,
      loaded_cabinet: null,
      configuredIR: 'Cab B',
      runtimeWarning: 'Configured cabinet IR block is not active in the live runtime',
    })

    renderDialog(21, 7)

    expect(await screen.findByText('Configured: Cab B')).toBeInTheDocument()
    expect(screen.getByText('Configured cabinet IR block is not active in the live runtime')).toBeInTheDocument()
    expect(screen.getAllByText('Configured').length).toBeGreaterThan(0)
  })

  it('disables scoped IR loads and skips upload auto-load when the selected block is not active in the live runtime', async () => {
    mockGetTypeStatus.mockResolvedValue({
      available: true,
      loaded_cabinet: null,
      configuredIR: 'Cab B',
      runtimeWarning: 'Configured cabinet IR block is not active in the live runtime',
    })

    renderDialog(21, 7)

    const unavailableButtons = await screen.findAllByRole('button', { name: 'Unavailable' })
    expect(unavailableButtons.length).toBeGreaterThan(0)
    expect(unavailableButtons[0]).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Upload cabinet IR file'), {
      target: {
        files: [new File(['wave-data'], 'new-cab.wav', { type: 'audio/wav' })],
      },
    })

    await waitFor(() => {
      expect(mockUploadCabinet).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(mockPushToast).toHaveBeenCalledWith(
        'Selected block is not active in the live runtime; uploaded cabinet IR was added to the library only.',
        'warn',
      )
    })
    expect(mockLoadCabinetAtPosition).not.toHaveBeenCalled()
  })
})
