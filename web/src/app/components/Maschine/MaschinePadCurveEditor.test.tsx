import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { MaschinePadCurveEditor } from './MaschinePadCurveEditor'

// T2522-C cycle 6 — pressure / velocity curve editor unit tests.
//
// Mock the maschine API client so we exercise the editor in isolation
// without spinning up the backend. We assert (a) initial GET fetches
// and seeds the working copy, (b) editing a coefficient surfaces an
// "Unsaved" badge and enables Save, (c) Save calls updatePressureCurves
// with the working payload, (d) reset-to-linear restores [0, 1].

jest.mock('../../../map2/clients/maschine', () => {
  const defaultCurves = {
    global_compensation: 0,
    per_pad: Array.from({ length: 16 }, () => ({ polynomial: [0, 1] })),
  }
  const getMock = jest.fn(async () => ({
    status: 'ok',
    usb_serial: 'default-mk1',
    pressure_curves: defaultCurves,
  }))
  const updateMock = jest.fn(async (curves) => ({
    status: 'ok',
    usb_serial: 'default-mk1',
    pressure_curves: curves,
  }))
  return {
    __esModule: true,
    maschineApi: {
      getPressureCurves: getMock,
      updatePressureCurves: updateMock,
    },
  }
})

const { maschineApi } = jest.requireMock('../../../map2/clients/maschine') as {
  maschineApi: {
    getPressureCurves: jest.Mock
    updatePressureCurves: jest.Mock
  }
}

beforeEach(() => {
  maschineApi.getPressureCurves.mockClear()
  maschineApi.updatePressureCurves.mockClear()
})

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
}

function renderEditor() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MaschinePadCurveEditor hidEvents={[]} />
    </QueryClientProvider>,
  )
}

describe('MaschinePadCurveEditor', () => {
  it('fetches the curve set on mount and surfaces the title', async () => {
    renderEditor()
    await screen.findByText('Pressure / velocity curves')
    await waitFor(() => expect(maschineApi.getPressureCurves).toHaveBeenCalledTimes(1))
  })

  it('marks the editor dirty + enables Save when a coefficient is edited', async () => {
    renderEditor()
    const linearInput = await screen.findByLabelText('Linear (slope)')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(linearInput, { target: { value: '1.5' } })
    expect(await screen.findByText('Unsaved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
  })

  it('PUTs the working copy when Save is clicked', async () => {
    renderEditor()
    const linearInput = await screen.findByLabelText('Linear (slope)')
    fireEvent.change(linearInput, { target: { value: '1.25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(maschineApi.updatePressureCurves).toHaveBeenCalledTimes(1))
    const sentPayload = maschineApi.updatePressureCurves.mock.calls[0][0]
    expect(sentPayload.global_compensation).toBe(0)
    expect(sentPayload.per_pad).toHaveLength(16)
    expect(sentPayload.per_pad[0].polynomial[1]).toBeCloseTo(1.25)
  })

  it('Reset-to-linear button restores [0, 1] for the active pad', async () => {
    renderEditor()
    const linearInput = await screen.findByLabelText('Linear (slope)')
    fireEvent.change(linearInput, { target: { value: '2.0' } })
    expect(await screen.findByText('Unsaved')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Reset pad to linear/ }))
    // After reset the slope returns to 1; dirty flag flips off because
    // the working copy now matches the original mock payload.
    await waitFor(() => {
      const slope = screen.getByLabelText('Linear (slope)') as HTMLInputElement
      expect(Number(slope.value)).toBeCloseTo(1)
    })
  })
})
