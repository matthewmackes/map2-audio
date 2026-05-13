// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// T2517-6 — RTL tests for the per-instance MPX-1 side-panel.
// Mocks the useMpx1BlockApi hooks so the panel can be exercised
// without TanStack Query context or a backend.

import '@testing-library/jest-dom'

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { MPX1BlockSidePanel } from './MPX1BlockSidePanel'

// jsdom polyfills for Carbon ComposedModal.
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
  // @ts-expect-error jsdom polyfill
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

// ---------------------------------------------------------------------------
// Mock the useMpx1BlockApi module — these hooks normally hit
// /api/v1/effects/mpx1/* + /api/v1/chains/hardware-usage +
// /api/v1/interfaces/capabilities through TanStack Query.
// ---------------------------------------------------------------------------

const mockUpsertMutate = jest.fn()
const mockDeleteMutate = jest.fn()
const mockCalibrateMutate = jest.fn()
const mockBypassMutate = jest.fn()

const mockInstance = jest.fn()
const mockInterfaces = jest.fn()
const mockAuto = jest.fn()

// T2519 — mock the shared meter-source hook so the panel test can
// exercise placeholder / engine / error states without a fetch.
const mockUseDeviceMeterSource = jest.fn(() => ({
  source: 'placeholder' as const,
  payload: undefined,
  isError: false,
  isLoading: false,
}))

jest.mock('../../../hooks/useDeviceMeterSource', () => ({
  useDeviceMeterSource: (...args: unknown[]) => mockUseDeviceMeterSource(...(args as [])),
}))

jest.mock('./useMpx1BlockApi', () => ({
  useMpx1Instance: () => mockInstance(),
  useInterfaceCapabilities: () => mockInterfaces(),
  useAutoConnectionType: () => mockAuto(),
  useUpsertMpx1Instance: () => ({
    mutate: mockUpsertMutate,
    isPending: false,
    error: null,
  }),
  useDeleteMpx1Instance: () => ({
    mutate: mockDeleteMutate,
    isPending: false,
  }),
  useCalibrateMpx1: (_chainId: string | null) => ({
    mutate: mockCalibrateMutate,
    isPending: false,
  }),
  useSetMpx1Bypass: (_chainId: string | null) => ({
    mutate: mockBypassMutate,
    isPending: false,
  }),
}))

const TASCAM_ROW = {
  interface_id: 'tascam.us-144mkii',
  pack_id: 'tascam',
  model_id: 'us-144mkii',
  display_name: 'TASCAM US-144MKII',
  capabilities: ['digital_io_stereo', 'spdif_coax'],
  hardware_id: 'usb:0644:8020',
}

const UA1000_AES_ROW = {
  interface_id: 'edirol-ua.ua-1000',
  pack_id: 'edirol-ua',
  model_id: 'ua-1000',
  display_name: 'Edirol UA-1000',
  capabilities: ['digital_io_stereo', 'aes_ebu', 'spdif_coax'],
  hardware_id: 'usb:0582:00ed',
}

const SAMPLE_INSTANCE = {
  chain_id: 'chain-A',
  interface_id: 'tascam.us-144mkii',
  connection_type: 'spdif_coax' as const,
  channel_mapping: { send_left: 2, send_right: 3, return_left: 2, return_right: 3 },
  bypass: false,
  calibration: null,
}

beforeEach(() => {
  mockUpsertMutate.mockReset()
  mockDeleteMutate.mockReset()
  mockCalibrateMutate.mockReset()
  mockBypassMutate.mockReset()
  mockInstance.mockReset()
  mockInterfaces.mockReset()
  mockAuto.mockReset()
  mockUseDeviceMeterSource.mockReset()
  mockUseDeviceMeterSource.mockReturnValue({
    source: 'placeholder',
    payload: undefined,
    isError: false,
    isLoading: false,
  })
})

describe('MPX1BlockSidePanel', () => {
  it('Carbon ComposedModal is not visible when open=false', () => {
    mockInstance.mockReturnValue({ data: null })
    mockInterfaces.mockReturnValue({ data: { interfaces: [TASCAM_ROW] } })
    mockAuto.mockReturnValue({ preferred: 'spdif_coax', aesCapable: [], spdifCapable: [TASCAM_ROW] })
    const { container } = render(
      <MPX1BlockSidePanel open={false} chainId="chain-A" onClose={() => {}} />,
    )
    // Carbon ComposedModal renders the header markup in the DOM even
    // when collapsed, but the outer wrapper drops the `is-visible`
    // class so it isn't shown. Pin both states so a future Carbon
    // refactor that breaks this stays caught.
    const modal = container.querySelector('.cds--modal')
    expect(modal).not.toBeNull()
    expect(modal?.classList.contains('is-visible')).toBe(false)
  })

  it('renders the configure heading with chain label when open', () => {
    mockInstance.mockReturnValue({ data: null })
    mockInterfaces.mockReturnValue({ data: { interfaces: [TASCAM_ROW] } })
    mockAuto.mockReturnValue({ preferred: 'spdif_coax', aesCapable: [], spdifCapable: [TASCAM_ROW] })
    render(<MPX1BlockSidePanel open chainId="chain-7" onClose={() => {}} />)
    expect(
      screen.getByText(/Lexicon MPX-1 — bridge configuration/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Chain chain-7/)).toBeInTheDocument()
  })

  it('seeds the interface select with the first eligible interface when no instance exists', () => {
    mockInstance.mockReturnValue({ data: null })
    mockInterfaces.mockReturnValue({ data: { interfaces: [UA1000_AES_ROW, TASCAM_ROW] } })
    mockAuto.mockReturnValue({
      preferred: 'aes_ebu',
      aesCapable: [UA1000_AES_ROW],
      spdifCapable: [UA1000_AES_ROW, TASCAM_ROW],
    })
    render(<MPX1BlockSidePanel open chainId="chain-A" onClose={() => {}} />)
    const select = screen.getByLabelText(/Audio interface/i) as HTMLSelectElement
    expect(select.value).toBe('edirol-ua.ua-1000')
  })

  it('seeds the form fields from an existing instance', () => {
    mockInstance.mockReturnValue({ data: SAMPLE_INSTANCE })
    mockInterfaces.mockReturnValue({ data: { interfaces: [TASCAM_ROW] } })
    mockAuto.mockReturnValue({ preferred: 'spdif_coax', aesCapable: [], spdifCapable: [TASCAM_ROW] })
    render(<MPX1BlockSidePanel open chainId="chain-A" onClose={() => {}} />)
    // Connection radio prefilled.
    const spdifRadio = screen.getByLabelText(/S\/PDIF coax/i) as HTMLInputElement
    expect(spdifRadio.checked).toBe(true)
    // Channel mapping inputs prefilled (values reflect SAMPLE_INSTANCE).
    const sendL = screen.getByLabelText(/Send Left/i) as HTMLInputElement
    expect(sendL.value).toBe('2')
  })

  it('save button reads "Add MPX-1 to chain" when no instance, "Save changes" when one exists', () => {
    mockInstance.mockReturnValue({ data: null })
    mockInterfaces.mockReturnValue({ data: { interfaces: [TASCAM_ROW] } })
    mockAuto.mockReturnValue({ preferred: 'spdif_coax', aesCapable: [], spdifCapable: [TASCAM_ROW] })
    const { rerender } = render(
      <MPX1BlockSidePanel open chainId="chain-A" onClose={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /Add MPX-1 to chain/i })).toBeInTheDocument()

    mockInstance.mockReturnValue({ data: SAMPLE_INSTANCE })
    rerender(<MPX1BlockSidePanel open chainId="chain-A" onClose={() => {}} />)
    expect(screen.getByRole('button', { name: /Save changes/i })).toBeInTheDocument()
  })

  it('Save calls upsert mutation with the current form state', () => {
    mockInstance.mockReturnValue({ data: SAMPLE_INSTANCE })
    mockInterfaces.mockReturnValue({ data: { interfaces: [TASCAM_ROW] } })
    mockAuto.mockReturnValue({ preferred: 'spdif_coax', aesCapable: [], spdifCapable: [TASCAM_ROW] })
    render(<MPX1BlockSidePanel open chainId="chain-A" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }))
    expect(mockUpsertMutate).toHaveBeenCalledTimes(1)
    const call = mockUpsertMutate.mock.calls[0][0] as {
      chainId: string
      body: { interface_id: string; connection_type: string; bypass: boolean }
    }
    expect(call.chainId).toBe('chain-A')
    expect(call.body.interface_id).toBe('tascam.us-144mkii')
    expect(call.body.connection_type).toBe('spdif_coax')
    expect(call.body.bypass).toBe(false)
  })

  it('Remove from chain calls delete and propagates onClose on success', () => {
    const onClose = jest.fn()
    mockInstance.mockReturnValue({ data: SAMPLE_INSTANCE })
    mockInterfaces.mockReturnValue({ data: { interfaces: [TASCAM_ROW] } })
    mockAuto.mockReturnValue({ preferred: 'spdif_coax', aesCapable: [], spdifCapable: [TASCAM_ROW] })
    render(<MPX1BlockSidePanel open chainId="chain-A" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /Remove from chain/i }))
    expect(mockDeleteMutate).toHaveBeenCalledTimes(1)
    expect(mockDeleteMutate.mock.calls[0][0]).toBe('chain-A')
    // The mutation hook receives the second arg with onSuccess — fire it.
    const opts = mockDeleteMutate.mock.calls[0][1] as { onSuccess?: () => void }
    opts.onSuccess?.()
    expect(onClose).toHaveBeenCalled()
  })

  it('Run calibration is disabled while no instance exists, enabled after one does', () => {
    mockInstance.mockReturnValue({ data: null })
    mockInterfaces.mockReturnValue({ data: { interfaces: [TASCAM_ROW] } })
    mockAuto.mockReturnValue({ preferred: 'spdif_coax', aesCapable: [], spdifCapable: [TASCAM_ROW] })
    const { rerender } = render(
      <MPX1BlockSidePanel open chainId="chain-A" onClose={() => {}} />,
    )
    expect(
      screen.getByRole('button', { name: /Run calibration/i }),
    ).toBeDisabled()

    mockInstance.mockReturnValue({ data: SAMPLE_INSTANCE })
    rerender(<MPX1BlockSidePanel open chainId="chain-A" onClose={() => {}} />)
    expect(
      screen.getByRole('button', { name: /Run calibration/i }),
    ).not.toBeDisabled()
  })

  it('Bypass button label and kind flips with the current instance.bypass flag', () => {
    mockInstance.mockReturnValue({ data: SAMPLE_INSTANCE })
    mockInterfaces.mockReturnValue({ data: { interfaces: [TASCAM_ROW] } })
    mockAuto.mockReturnValue({ preferred: 'spdif_coax', aesCapable: [], spdifCapable: [TASCAM_ROW] })
    const { rerender } = render(
      <MPX1BlockSidePanel open chainId="chain-A" onClose={() => {}} />,
    )
    expect(
      screen.getByRole('button', { name: /Bypass MPX-1/i }),
    ).toBeInTheDocument()

    mockInstance.mockReturnValue({ data: { ...SAMPLE_INSTANCE, bypass: true } })
    rerender(<MPX1BlockSidePanel open chainId="chain-A" onClose={() => {}} />)
    expect(
      screen.getByRole('button', { name: /Bypassed — re-engage/i }),
    ).toBeInTheDocument()
  })

  it('Bypass click calls the bypass mutation with the inverted value', () => {
    mockInstance.mockReturnValue({ data: SAMPLE_INSTANCE })
    mockInterfaces.mockReturnValue({ data: { interfaces: [TASCAM_ROW] } })
    mockAuto.mockReturnValue({ preferred: 'spdif_coax', aesCapable: [], spdifCapable: [TASCAM_ROW] })
    render(<MPX1BlockSidePanel open chainId="chain-A" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Bypass MPX-1/i }))
    expect(mockBypassMutate).toHaveBeenCalledWith(true)
  })

  it('shows the calibration placeholder copy when uncalibrated', () => {
    mockInstance.mockReturnValue({ data: SAMPLE_INSTANCE })
    mockInterfaces.mockReturnValue({ data: { interfaces: [TASCAM_ROW] } })
    mockAuto.mockReturnValue({ preferred: 'spdif_coax', aesCapable: [], spdifCapable: [TASCAM_ROW] })
    render(<MPX1BlockSidePanel open chainId="chain-A" onClose={() => {}} />)
    expect(
      screen.getByText(/uncalibrated \(using 256-sample placeholder\)/i),
    ).toBeInTheDocument()
  })

  it('shows the calibrated sample count when set', () => {
    mockInstance.mockReturnValue({
      data: {
        ...SAMPLE_INSTANCE,
        calibration: { latency_samples: 412, measured_at: '2026-05-13T00:00:00Z' },
      },
    })
    mockInterfaces.mockReturnValue({ data: { interfaces: [TASCAM_ROW] } })
    mockAuto.mockReturnValue({ preferred: 'spdif_coax', aesCapable: [], spdifCapable: [TASCAM_ROW] })
    render(<MPX1BlockSidePanel open chainId="chain-A" onClose={() => {}} />)
    expect(screen.getByText(/412 samples/i)).toBeInTheDocument()
  })

  it('disables the interface select when no eligible interface is connected', () => {
    mockInstance.mockReturnValue({ data: null })
    mockInterfaces.mockReturnValue({ data: { interfaces: [] } })
    mockAuto.mockReturnValue({ preferred: null, aesCapable: [], spdifCapable: [] })
    render(<MPX1BlockSidePanel open chainId="chain-A" onClose={() => {}} />)
    const select = screen.getByLabelText(/Audio interface/i) as HTMLSelectElement
    expect(select).toBeDisabled()
    // The "No connected interface" warning Tag should be rendered.
    expect(
      screen.getByText(/No connected interface advertises a digital bridge/i),
    ).toBeInTheDocument()
  })

  it('shows the upsert-conflict notification when the mutation returns 409 detail', () => {
    mockInstance.mockReturnValue({ data: null })
    mockInterfaces.mockReturnValue({ data: { interfaces: [TASCAM_ROW] } })
    mockAuto.mockReturnValue({ preferred: 'spdif_coax', aesCapable: [], spdifCapable: [TASCAM_ROW] })
    // Override the upsert hook to expose an error with detail.
    const useMpx1BlockApi = jest.requireMock('./useMpx1BlockApi') as {
      useUpsertMpx1Instance: () => unknown
    }
    useMpx1BlockApi.useUpsertMpx1Instance = () => ({
      mutate: mockUpsertMutate,
      isPending: false,
      error: Object.assign(new Error('hardware_singleton_in_use'), {
        detail: {
          code: 'hardware_singleton_in_use',
          in_use_by_chain: 'chain-OTHER',
        },
      }),
    })
    render(<MPX1BlockSidePanel open chainId="chain-A" onClose={() => {}} />)
    expect(
      screen.getByText(/MPX-1 is already in use by another chain/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/chain-OTHER/)).toBeInTheDocument()
  })

  // -----------------------------------------------------------------
  // T2519 — Live signal section + meter-source Tag.
  // -----------------------------------------------------------------

  it('renders the meter-source section with the warm-gray placeholder Tag by default', () => {
    mockInstance.mockReturnValue({ data: null })
    mockInterfaces.mockReturnValue({ data: { interfaces: [TASCAM_ROW] } })
    mockAuto.mockReturnValue({ preferred: 'spdif_coax', aesCapable: [], spdifCapable: [TASCAM_ROW] })
    render(<MPX1BlockSidePanel open chainId="chain-A" onClose={() => {}} />)
    expect(screen.getByTestId('mpx1-meter-source-section')).toBeInTheDocument()
    const tag = screen.getByTestId('mpx1-meter-source')
    expect(tag).toHaveTextContent('Awaiting engine wire-up')
    expect(tag.classList.contains('cds--tag--warm-gray')).toBe(true)
  })

  it('renders the green Live Tag when the meter source is engine', () => {
    mockUseDeviceMeterSource.mockReturnValue({
      source: 'engine',
      payload: undefined,
      isError: false,
      isLoading: false,
    })
    mockInstance.mockReturnValue({ data: null })
    mockInterfaces.mockReturnValue({ data: { interfaces: [TASCAM_ROW] } })
    mockAuto.mockReturnValue({ preferred: 'spdif_coax', aesCapable: [], spdifCapable: [TASCAM_ROW] })
    render(<MPX1BlockSidePanel open chainId="chain-A" onClose={() => {}} />)
    const tag = screen.getByTestId('mpx1-meter-source')
    expect(tag).toHaveTextContent('Live')
    expect(tag.classList.contains('cds--tag--green')).toBe(true)
  })

  it('renders the red Endpoint unavailable Tag when the route 5xxs', () => {
    mockUseDeviceMeterSource.mockReturnValue({
      source: undefined,
      payload: undefined,
      isError: true,
      isLoading: false,
    })
    mockInstance.mockReturnValue({ data: null })
    mockInterfaces.mockReturnValue({ data: { interfaces: [TASCAM_ROW] } })
    mockAuto.mockReturnValue({ preferred: 'spdif_coax', aesCapable: [], spdifCapable: [TASCAM_ROW] })
    render(<MPX1BlockSidePanel open chainId="chain-A" onClose={() => {}} />)
    expect(screen.getByTestId('mpx1-meter-source')).toHaveTextContent(
      'Endpoint unavailable',
    )
  })

  it('disables the meter-source query when the modal is closed (enabled=false)', () => {
    mockInstance.mockReturnValue({ data: null })
    mockInterfaces.mockReturnValue({ data: { interfaces: [TASCAM_ROW] } })
    mockAuto.mockReturnValue({ preferred: 'spdif_coax', aesCapable: [], spdifCapable: [TASCAM_ROW] })
    render(<MPX1BlockSidePanel open={false} chainId="chain-A" onClose={() => {}} />)
    // useDeviceMeterSource called with enabled=false.
    const lastCall = mockUseDeviceMeterSource.mock.calls[
      mockUseDeviceMeterSource.mock.calls.length - 1
    ] as unknown as [string, { enabled?: boolean } | undefined]
    expect(lastCall[0]).toBe('lexicon-mpx1')
    expect(lastCall[1]?.enabled).toBe(false)
  })
})
