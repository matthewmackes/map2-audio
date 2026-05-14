import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { MaschinePadLedChoreography } from './MaschinePadLedChoreography'

// T2522-D cycle 10 — Pad LED choreography editor unit tests.

jest.mock('../../../map2/clients/maschine', () => {
  const defaultBank = {
    status: 'ok',
    usb_serial: 'default-mk1',
    led_choreography: {
      per_pad: Array.from({ length: 16 }, () => ({ idle_color: 'empty', press_color: 'white' })),
    },
  }
  return {
    __esModule: true,
    maschineApi: {
      getLedChoreography: jest.fn(async () => defaultBank),
      updateLedChoreography: jest.fn(async (cho) => ({
        status: 'ok',
        usb_serial: 'default-mk1',
        led_choreography: cho,
      })),
    },
  }
})

const { maschineApi } = jest.requireMock('../../../map2/clients/maschine') as {
  maschineApi: {
    getLedChoreography: jest.Mock
    updateLedChoreography: jest.Mock
  }
}

beforeEach(() => {
  maschineApi.getLedChoreography.mockClear()
  maschineApi.updateLedChoreography.mockClear()
})

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MaschinePadLedChoreography />
    </QueryClientProvider>,
  )
}

describe('MaschinePadLedChoreography', () => {
  it('fetches the choreography on mount and renders all 16 pad rows', async () => {
    renderEditor()
    await waitFor(() => expect(maschineApi.getLedChoreography).toHaveBeenCalledTimes(1))
    const rows = await screen.findAllByText(/^Pad \d+$/)
    expect(rows.length).toBe(16)
  })

  it('marks the editor dirty + enables Save when an idle color changes', async () => {
    renderEditor()
    await screen.findByText('Pad 1')
    expect(screen.getByRole('button', { name: 'Save choreography' })).toBeDisabled()
    const idleSelect = screen.getByLabelText('Idle', { selector: '#led-cho-0-idle' })
    fireEvent.change(idleSelect, { target: { value: 'cyan' } })
    expect(await screen.findByText('Unsaved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save choreography' })).not.toBeDisabled()
  })

  it('PUTs the working choreography on Save', async () => {
    renderEditor()
    await screen.findByText('Pad 1')
    const idleSelect = screen.getByLabelText('Idle', { selector: '#led-cho-2-idle' })
    fireEvent.change(idleSelect, { target: { value: 'green' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save choreography' }))
    await waitFor(() => expect(maschineApi.updateLedChoreography).toHaveBeenCalledTimes(1))
    const sent = maschineApi.updateLedChoreography.mock.calls[0][0] as { per_pad: { idle_color: string }[] }
    expect(sent.per_pad[2].idle_color).toBe('green')
  })

  it('Reset all clears every pad to empty/white', async () => {
    renderEditor()
    await screen.findByText('Pad 1')
    const idleSelect = screen.getByLabelText('Idle', { selector: '#led-cho-0-idle' })
    fireEvent.change(idleSelect, { target: { value: 'cyan' } })
    expect(await screen.findByText('Unsaved')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Reset all/ }))
    // After reset, the working state matches the original mock (which
    // happens to be all-empty/white) so dirty drops back to false.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save choreography' })).toBeDisabled()
    })
  })
})
