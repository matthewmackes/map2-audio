import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { MaschineMappingStudio } from './MaschineMappingStudio'
import type {
  MaschineDaemonStatus,
  MaschineEncoderMap,
} from '../../../map2/types'

// T2522-D cycle 9 — Mapping Studio scaffold + drag-drop primitive.

jest.mock('../../../map2/clients/maschine', () => ({
  __esModule: true,
  maschineApi: {
    updateEncoderMap: jest.fn(async (encoder_map: unknown) => ({
      status: 'ok',
      encoder_map,
    })),
    getLedChoreography: jest.fn(async () => ({
      status: 'ok',
      usb_serial: 'default-mk1',
      led_choreography: {
        per_pad: Array.from({ length: 16 }, () => ({ idle_color: 'empty', press_color: 'white' })),
      },
    })),
    updateLedChoreography: jest.fn(async (cho: unknown) => ({
      status: 'ok',
      usb_serial: 'default-mk1',
      led_choreography: cho,
    })),
  },
}))

const { maschineApi } = jest.requireMock('../../../map2/clients/maschine') as {
  maschineApi: { updateEncoderMap: jest.Mock }
}

beforeEach(() => {
  maschineApi.updateEncoderMap.mockClear()
})

// jsdom doesn't ship DataTransfer; the drag/drop tests need a tiny
// stand-in that supports getData/setData/types. fireEvent's
// dataTransfer init only forwards an object; the component reads
// through .getData(MIME) and the .types array gate.
class FakeDataTransfer {
  private store = new Map<string, string>()
  effectAllowed = 'none'
  dropEffect = 'none'
  setData(format: string, data: string) {
    this.store.set(format, data)
  }
  getData(format: string) {
    return this.store.get(format) ?? ''
  }
  get types() {
    return Array.from(this.store.keys())
  }
}

function makeStatus(): MaschineDaemonStatus {
  return {
    connected: true,
    audio_grid: {
      blocks: [
        {
          block_id: 'block-reverb',
          pad_index: 0,
          plugin_name: 'Reverb',
          top_parameters: [
            { param_id: 'wet', value: 0.5 },
            { param_id: 'decay', value: 1.2 },
          ],
        },
        {
          block_id: 'block-delay',
          pad_index: 1,
          plugin_name: 'Delay',
          top_parameters: [{ param_id: 'time', value: 0.3 }],
        },
      ],
      selected_block_id: null,
      page_index: 0,
      snapshot_id: 7,
      snapshot_name: 'Live Snapshot',
    },
  } as unknown as MaschineDaemonStatus
}

function emptyEncoderMap(): MaschineEncoderMap {
  return {
    enc1: null,
    enc2: null,
    enc3: null,
    enc4: null,
    enc5: null,
    enc6: null,
    enc7: null,
    enc8: null,
    vol: { fixed: true, label: 'Master Gain' },
    tempo: { fixed: true, label: '120 BPM' },
    swing: { label: 'Swing' },
  }
}

function withQuery(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>
}

describe('MaschineMappingStudio', () => {
  it('lists every chain-block parameter as a draggable source card', () => {
    render(
      withQuery(
        <MaschineMappingStudio
          status={makeStatus()}
          encoderMap={emptyEncoderMap()}
          refetchStatus={jest.fn()}
        />,
      ),
    )
    expect(screen.getByText('wet')).toBeInTheDocument()
    expect(screen.getByText('decay')).toBeInTheDocument()
    expect(screen.getByText('time')).toBeInTheDocument()
    // Two Reverb cards (wet + decay) reuse the same block label.
    const reverbCards = screen.getAllByText('Reverb')
    expect(reverbCards.length).toBe(2)
    expect(screen.getByText('Delay')).toBeInTheDocument()
  })

  it('binds a parameter to an encoder slot via drag-and-drop and surfaces Unsaved', () => {
    const { container } = render(
      withQuery(
        <MaschineMappingStudio
          status={makeStatus()}
          encoderMap={emptyEncoderMap()}
          refetchStatus={jest.fn()}
        />,
      ),
    )
    const sourceCard = screen.getByText('wet').closest('li')!
    const enc1Target = container.querySelector('li[data-encoder-slot="enc1"]')!

    // Simulate the drag using the React testing library fireEvent
    // helpers. dataTransfer is populated via the global DataTransfer
    // mock available in jsdom 30+; if it's not, we fabricate one.
    const dt = new FakeDataTransfer()
    fireEvent.dragStart(sourceCard, { dataTransfer: dt })
    fireEvent.dragOver(enc1Target, { dataTransfer: dt })
    fireEvent.drop(enc1Target, { dataTransfer: dt })

    // The bound encoder shows the truncated source label and the
    // unsaved badge appears.
    expect(screen.getByText(/Reverb \/ wet/)).toBeInTheDocument()
    expect(screen.getByText('Unsaved')).toBeInTheDocument()
  })

  it('saves the working map by calling updateEncoderMap with the new binding', async () => {
    const refetch = jest.fn()
    const { container } = render(
      withQuery(
        <MaschineMappingStudio
          status={makeStatus()}
          encoderMap={emptyEncoderMap()}
          refetchStatus={refetch}
        />,
      ),
    )
    const sourceCard = screen.getByText('wet').closest('li')!
    const enc1Target = container.querySelector('li[data-encoder-slot="enc1"]')!

    const dt = new FakeDataTransfer()
    fireEvent.dragStart(sourceCard, { dataTransfer: dt })
    fireEvent.dragOver(enc1Target, { dataTransfer: dt })
    fireEvent.drop(enc1Target, { dataTransfer: dt })

    fireEvent.click(screen.getByRole('button', { name: 'Save bindings' }))
    await waitFor(() => expect(maschineApi.updateEncoderMap).toHaveBeenCalledTimes(1))
    const saved = maschineApi.updateEncoderMap.mock.calls[0][0] as MaschineEncoderMap
    expect(saved.enc1).toEqual({
      block_id: 'block-reverb',
      param_id: 'wet',
      label: 'Reverb / wet',
      fixed: false,
    })
    expect(refetch).toHaveBeenCalled()
  })

  it('does not allow dropping onto a fixed encoder slot', () => {
    const { container } = render(
      withQuery(
        <MaschineMappingStudio
          status={makeStatus()}
          encoderMap={emptyEncoderMap()}
          refetchStatus={jest.fn()}
        />,
      ),
    )
    const sourceCard = screen.getByText('wet').closest('li')!
    const volTarget = container.querySelector('li[data-encoder-slot="vol"]')!

    const dt = new FakeDataTransfer()
    fireEvent.dragStart(sourceCard, { dataTransfer: dt })
    fireEvent.dragOver(volTarget, { dataTransfer: dt })
    fireEvent.drop(volTarget, { dataTransfer: dt })

    // No Unsaved badge — the drop was a no-op because vol is fixed.
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()
    // The Master Gain label remains.
    expect(screen.getByText('Master Gain')).toBeInTheDocument()
  })

  it('cycle-10 — SHIFT toggle scopes drops to shift_<slot> keys without losing base bindings', async () => {
    const { container } = render(
      withQuery(
        <MaschineMappingStudio
          status={makeStatus()}
          encoderMap={emptyEncoderMap()}
          refetchStatus={jest.fn()}
        />,
      ),
    )
    // Drop wet → enc1 in BASE layer.
    const sourceCard = screen.getByText('wet').closest('li')!
    const enc1Target = container.querySelector('li[data-encoder-slot="enc1"]')!
    let dt = new FakeDataTransfer()
    fireEvent.dragStart(sourceCard, { dataTransfer: dt })
    fireEvent.dragOver(enc1Target, { dataTransfer: dt })
    fireEvent.drop(enc1Target, { dataTransfer: dt })
    // Toggle SHIFT layer on. Carbon's <Toggle> exposes a checkbox role.
    const shiftToggle = screen.getByRole('switch', { name: /SHIFT overlay/ })
    fireEvent.click(shiftToggle)
    // Drop time → enc1 in SHIFT layer (a different slot key).
    const timeCard = screen.getByText('time').closest('li')!
    dt = new FakeDataTransfer()
    fireEvent.dragStart(timeCard, { dataTransfer: dt })
    fireEvent.dragOver(enc1Target, { dataTransfer: dt })
    fireEvent.drop(enc1Target, { dataTransfer: dt })
    // Save → both keys present in payload.
    fireEvent.click(screen.getByRole('button', { name: 'Save bindings' }))
    await waitFor(() => expect(maschineApi.updateEncoderMap).toHaveBeenCalledTimes(1))
    const sent = maschineApi.updateEncoderMap.mock.calls[0][0] as Record<string, unknown>
    expect(sent.enc1).toEqual({
      block_id: 'block-reverb',
      param_id: 'wet',
      label: 'Reverb / wet',
      fixed: false,
    })
    expect(sent.shift_enc1).toEqual({
      block_id: 'block-delay',
      param_id: 'time',
      label: 'Delay / time',
      fixed: false,
    })
  })

  it('shows a clear empty-state when the active snapshot has no chain blocks', () => {
    const empty = makeStatus()
    if (empty.audio_grid) empty.audio_grid.blocks = []
    render(
      withQuery(
        <MaschineMappingStudio
          status={empty}
          encoderMap={emptyEncoderMap()}
          refetchStatus={jest.fn()}
        />,
      ),
    )
    expect(screen.getByText(/No chain blocks mounted/)).toBeInTheDocument()
  })
})
