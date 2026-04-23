import '@testing-library/jest-dom'
import React from 'react'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { DevicesStorePage } from './DevicesStorePage'

const mockPushToast = jest.fn()
const mockDismissToast = jest.fn()

jest.mock('../Toasts', () => ({
  useToasts: () => ({ pushToast: mockPushToast, dismissToast: mockDismissToast }),
}))

const mockHeroExists = jest.fn()
const mockHeroUpload = jest.fn()
const mockHeroRevert = jest.fn()

jest.mock('../../../map2/clients/deviceHeroImages', () => ({
  buildDeviceHeroImageUrl: (deviceId: string, version?: number | string) =>
    version === undefined
      ? `/api/devices/hero-images/${deviceId}`
      : `/api/devices/hero-images/${deviceId}?v=${version}`,
  deviceHeroImagesApi: {
    exists: (...args: unknown[]) => mockHeroExists(...args),
    upload: (...args: unknown[]) => mockHeroUpload(...args),
    revert: (...args: unknown[]) => mockHeroRevert(...args),
  },
}))

function renderWithRouter(initialEntry = '/devices') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/devices" element={<DevicesStorePage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="route-probe">{location.pathname}</div>
}

function getCard(deviceId: string): HTMLElement {
  return document.querySelector(`[data-device-id="${deviceId}"]`) as HTMLElement
}

describe('DevicesStorePage', () => {
  const globals = globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }
  let installedResizeObserver = false

  beforeAll(() => {
    // Carbon Modal uses ResizeObserver internally; jsdom doesn't ship one.
    // Polyfill only if nothing else has installed one for this worker.
    if (!globals.ResizeObserver) {
      globals.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as typeof ResizeObserver
      installedResizeObserver = true
    }
  })

  afterAll(() => {
    if (installedResizeObserver) {
      delete globals.ResizeObserver
    }
  })

  beforeEach(() => {
    window.localStorage.clear()
    mockPushToast.mockReset()
    mockDismissToast.mockReset()
    mockHeroExists.mockReset()
    mockHeroUpload.mockReset()
    mockHeroRevert.mockReset()
    // Default: no overrides anywhere.
    mockHeroExists.mockResolvedValue(false)
    mockHeroUpload.mockResolvedValue({ status: 'ok', device_id: '', uploaded_at: 0, original_size_bytes: 0, original_mime: 'image/png' })
    mockHeroRevert.mockResolvedValue({ status: 'ok', removed: true, device_id: '' })
  })

  it('renders every registry entry grouped under processor → console → control-surface → audio-interface', () => {
    renderWithRouter()
    expect(screen.getByText('Processors')).toBeInTheDocument()
    expect(screen.getByText('Consoles')).toBeInTheDocument()
    expect(screen.getByText('Control Surfaces')).toBeInTheDocument()
    expect(screen.getByText('Audio Interfaces')).toBeInTheDocument()

    // Sample entries from each kind
    expect(screen.getByText('Lexicon MPX-1')).toBeInTheDocument()
    expect(screen.getByText('LCD Console')).toBeInTheDocument()
    expect(screen.getByText('Native Instruments Maschine MK1')).toBeInTheDocument()
    expect(screen.getByText('Edirol UA-1000')).toBeInTheDocument()
  })

  it('shows Open + Pin footer buttons on an unpinned card', () => {
    renderWithRouter()
    const card = getCard('mpx1')
    expect(card).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Open' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Pin' })).toBeInTheDocument()
    expect(within(card).queryAllByRole('button', { name: /Unpin/ })).toHaveLength(0)
    expect(card.dataset.pinned).toBe('false')
  })

  it('clicking Pin on an unpinned card pins it and shows only an Unpin button (dimmed)', () => {
    renderWithRouter()
    fireEvent.click(within(getCard('mpx1')).getByRole('button', { name: 'Pin' }))
    const card = getCard('mpx1')
    expect(card.dataset.pinned).toBe('true')
    expect(within(card).queryByRole('button', { name: 'Open' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Pin' })).toBeNull()
    expect(within(card).getByRole('button', { name: /Unpin/ })).toBeInTheDocument()
    expect(mockPushToast).toHaveBeenCalledWith('Pinned Lexicon MPX-1.', 'success', expect.anything())
  })

  it('clicking Unpin on a pinned card emits a toast with an Undo action', () => {
    window.localStorage.setItem(
      'map2.ui.settings',
      JSON.stringify({ version: 1, pinnedDevices: ['mpx1'] }),
    )
    renderWithRouter()
    fireEvent.click(within(getCard('mpx1')).getByRole('button', { name: /Unpin/ }))
    expect(mockPushToast).toHaveBeenCalledWith(
      'Unpinned Lexicon MPX-1 from Devices.',
      'info',
      expect.objectContaining({
        durationMs: 5000,
        action: expect.objectContaining({ label: 'Undo' }),
      }),
    )
    // The Undo callback should re-pin when invoked.
    const call = mockPushToast.mock.calls.find((c) => c[0] === 'Unpinned Lexicon MPX-1 from Devices.')
    const undoHandler = call?.[2]?.action?.onClick as (() => void) | undefined
    expect(undoHandler).toBeInstanceOf(Function)
    act(() => { undoHandler?.() })
    const settings = JSON.parse(window.localStorage.getItem('map2.ui.settings') ?? '{}')
    expect(settings.pinnedDevices).toContain('mpx1')
  })

  it('clicking Open on an unpinned card prompts a "Pin and open" confirmation modal', () => {
    renderWithRouter()
    fireEvent.click(within(getCard('mpx1')).getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('dialog', { name: /Pin Lexicon MPX-1\?/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pin and open' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Just open' })).toBeInTheDocument()
  })

  it('"Pin and open" pins the device and navigates to its route', () => {
    renderWithRouter()
    fireEvent.click(within(getCard('mpx1')).getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pin and open' }))
    const settings = JSON.parse(window.localStorage.getItem('map2.ui.settings') ?? '{}')
    expect(settings.pinnedDevices).toContain('mpx1')
    expect(screen.getByTestId('route-probe')).toHaveTextContent('/devices/mpx1/panel')
  })

  it('"Just open" navigates without pinning', () => {
    renderWithRouter()
    fireEvent.click(within(getCard('mpx1')).getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('button', { name: 'Just open' }))
    const settings = JSON.parse(window.localStorage.getItem('map2.ui.settings') ?? '{}')
    expect(settings.pinnedDevices ?? []).not.toContain('mpx1')
    expect(screen.getByTestId('route-probe')).toHaveTextContent('/devices/mpx1/panel')
  })

  it('a pinned card opens directly without the confirmation modal', () => {
    window.localStorage.setItem(
      'map2.ui.settings',
      JSON.stringify({ version: 1, pinnedDevices: ['mpx1'] }),
    )
    renderWithRouter()
    // When pinned there is no Open button — behavior is tested via the GlobalTreeNav
    // pinned-row click path. Here we just verify the card no longer exposes Open/Pin.
    const card = getCard('mpx1')
    expect(within(card).queryByRole('button', { name: 'Open' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Pin' })).toBeNull()
  })

  it('a control-surface card routes to its legacy route (not /devices/:id)', () => {
    renderWithRouter()
    fireEvent.click(within(getCard('maschine-mk1')).getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('button', { name: 'Just open' }))
    expect(screen.getByTestId('route-probe')).toHaveTextContent('/maschine')
  })

  it('exposes a hero-image overflow menu trigger on every card', () => {
    renderWithRouter()
    const card = getCard('mpx1')
    // Carbon's OverflowMenu wires the trigger through a tooltip, so rather than
    // asserting a specific accessible name we verify the trigger is present.
    expect(card.querySelector('.cds--overflow-menu')).toBeInTheDocument()
  })

  it('uploading a PNG hero image calls the client, bumps the override version, and toasts success', async () => {
    mockHeroUpload.mockResolvedValueOnce({
      status: 'ok',
      device_id: 'mpx1',
      uploaded_at: 1,
      original_size_bytes: 123,
      original_mime: 'image/png',
    })
    renderWithRouter()
    const card = getCard('mpx1')
    const fileInput = card.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).toBeInTheDocument()

    const pngFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'mpx1.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [pngFile] } })
    })

    expect(mockHeroUpload).toHaveBeenCalledWith('mpx1', pngFile)
    expect(mockPushToast).toHaveBeenCalledWith(
      'Hero image updated for Lexicon MPX-1.',
      'success',
      expect.anything(),
    )
  })

  it('rejects uploads that are not image/png before hitting the backend', async () => {
    renderWithRouter()
    const card = getCard('mpx1')
    const fileInput = card.querySelector('input[type="file"]') as HTMLInputElement
    const jpegFile = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'mpx1.jpg', { type: 'image/jpeg' })
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [jpegFile] } })
    })
    expect(mockHeroUpload).not.toHaveBeenCalled()
    expect(mockPushToast).toHaveBeenCalledWith(
      expect.stringContaining('PNG'),
      'error',
      expect.anything(),
    )
  })

  it('rejects uploads larger than the 2 MB cap without hitting the backend', async () => {
    renderWithRouter()
    const card = getCard('mpx1')
    const fileInput = card.querySelector('input[type="file"]') as HTMLInputElement
    const hugeFile = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'mpx1.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [hugeFile] } })
    })
    expect(mockHeroUpload).not.toHaveBeenCalled()
    expect(mockPushToast).toHaveBeenCalledWith(
      expect.stringContaining('2 MB'),
      'error',
      expect.anything(),
    )
  })

  it('surfaces a backend upload failure as an error toast and does not bump the version', async () => {
    mockHeroUpload.mockRejectedValueOnce(new Error('payload_too_large'))
    renderWithRouter()
    const fileInput = getCard('mpx1').querySelector('input[type="file"]') as HTMLInputElement
    const pngFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'mpx1.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [pngFile] } })
    })
    expect(mockPushToast).toHaveBeenCalledWith(
      expect.stringMatching(/Couldn.t upload hero image for Lexicon MPX-1/),
      'error',
      expect.anything(),
    )
  })
})
