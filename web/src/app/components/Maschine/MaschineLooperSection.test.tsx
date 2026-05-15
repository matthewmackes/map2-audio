import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { MaschineLooperSection } from './MaschineLooperSection'
import type { MaschineHidEvent } from '../../../map2/types'

// T2523-C jest. Mocks the LooperService client so the section
// renders deterministically; we assert on the structured DOM
// (4-track grid, master tags, transport buttons) and on the
// click→mutation dispatch path for each transport button.

const mockGetStatus = jest.fn()
const mockPlay = jest.fn()
const mockStop = jest.fn()
const mockRecord = jest.fn()
const mockRestart = jest.fn()
const mockClear = jest.fn()

jest.mock('../../../map2/clients/looper', () => ({
  __esModule: true,
  looperApi: {
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
    play: (...args: unknown[]) => mockPlay(...args),
    stop: (...args: unknown[]) => mockStop(...args),
    record: (...args: unknown[]) => mockRecord(...args),
    restart: (...args: unknown[]) => mockRestart(...args),
    clear: (...args: unknown[]) => mockClear(...args),
  },
}))

function makeStatus(overrides?: Record<string, unknown>) {
  return {
    tracks: [
      { track: 0, state: 2, state_label: 'playing', loop_length_frames: 48000, playhead_frames: 24000, layer_count: 2, level_db: 0, muted: false, soloed: false, reverse: false, half_speed: false, locked: false, one_shot: false, one_shot_passes: 1, auto_armed: false, auto_threshold_db: -36, auto_last_level_db: -150, auto_peak_db: -150, stop_mode: 'hard', fade_ms: 250, sync_mode: 'free', slices: [], quantize_division: 'off' },
      { track: 1, state: 1, state_label: 'recording', loop_length_frames: 0, playhead_frames: 0, layer_count: 1, level_db: 0, muted: false, soloed: false, reverse: false, half_speed: false, locked: false, one_shot: false, one_shot_passes: 1, auto_armed: false, auto_threshold_db: -36, auto_last_level_db: -150, auto_peak_db: -150, stop_mode: 'hard', fade_ms: 250, sync_mode: 'free', slices: [], quantize_division: 'off' },
      { track: 2, state: 4, state_label: 'stopped', loop_length_frames: 96000, playhead_frames: 0, layer_count: 3, level_db: 0, muted: false, soloed: false, reverse: false, half_speed: false, locked: true, one_shot: false, one_shot_passes: 1, auto_armed: false, auto_threshold_db: -36, auto_last_level_db: -150, auto_peak_db: -150, stop_mode: 'hard', fade_ms: 250, sync_mode: 'free', slices: [], quantize_division: 'off' },
      { track: 3, state: 0, state_label: 'empty', loop_length_frames: 0, playhead_frames: 0, layer_count: 0, level_db: 0, muted: false, soloed: false, reverse: false, half_speed: false, locked: false, one_shot: false, one_shot_passes: 1, auto_armed: false, auto_threshold_db: -36, auto_last_level_db: -150, auto_peak_db: -150, stop_mode: 'hard', fade_ms: 250, sync_mode: 'free', slices: [], quantize_division: 'off' },
    ],
    active_track_count: 2,
    sync_master: false,
    master_level_db: -3.0,
    master_muted: false,
    bpm: 120.0,
    sync_master_track: null,
    recent_activity: [],
    metrics: {},
    preset_names: [],
    ...overrides,
  }
}

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, refetchInterval: false, gcTime: 0, staleTime: 0 },
    },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('MaschineLooperSection', () => {
  beforeEach(() => {
    mockGetStatus.mockReset()
    mockPlay.mockReset().mockResolvedValue(makeStatus())
    mockStop.mockReset().mockResolvedValue(makeStatus())
    mockRecord.mockReset().mockResolvedValue(makeStatus())
    mockRestart.mockReset().mockResolvedValue(makeStatus())
    mockClear.mockReset().mockResolvedValue(makeStatus())
  })

  it('renders 4 track rows + transport buttons once status arrives', async () => {
    mockGetStatus.mockResolvedValueOnce(makeStatus())
    renderWithClient(<MaschineLooperSection hidEvents={[]} />)
    await waitFor(() => expect(screen.getByTestId('maschine-looper-grid')).toBeInTheDocument())
    for (let i = 0; i < 4; i += 1) {
      expect(screen.getByTestId(`maschine-looper-track-${i}`)).toBeInTheDocument()
    }
    // Carbon prefixes danger buttons with the visually-hidden "danger "
    // tone label in the accessible name. Use substring match so the
    // assertion isn't coupled to Carbon internals.
    expect(screen.getByRole('button', { name: /Rec$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Erase$/ })).toBeInTheDocument()
  })

  it('surfaces the master gain + BPM + active-count tags from status', async () => {
    mockGetStatus.mockResolvedValueOnce(makeStatus())
    renderWithClient(<MaschineLooperSection hidEvents={[]} />)
    await waitFor(() => expect(screen.getByText('Active 2/4')).toBeInTheDocument())
    expect(screen.getByText('Master -3.0 dB')).toBeInTheDocument()
    expect(screen.getByText('120.0 BPM')).toBeInTheDocument()
    expect(screen.getByText('Sync —')).toBeInTheDocument()
  })

  it('shows the LOCK tag on a locked track', async () => {
    mockGetStatus.mockResolvedValueOnce(makeStatus())
    renderWithClient(<MaschineLooperSection hidEvents={[]} />)
    await waitFor(() => expect(screen.getByText('LOCK')).toBeInTheDocument())
  })

  it('fires looperApi.record when the Rec button is clicked', async () => {
    mockGetStatus.mockResolvedValueOnce(makeStatus())
    renderWithClient(<MaschineLooperSection hidEvents={[]} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Rec$/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Rec$/ }))
    await waitFor(() => expect(mockRecord).toHaveBeenCalledWith(0))
  })

  it('fires looperApi.play when the Play button is clicked', async () => {
    mockGetStatus.mockResolvedValueOnce(makeStatus())
    renderWithClient(<MaschineLooperSection hidEvents={[]} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await waitFor(() => expect(mockPlay).toHaveBeenCalledWith(0))
  })

  it('fires looperApi.stop when the Stop button is clicked', async () => {
    mockGetStatus.mockResolvedValueOnce(makeStatus())
    renderWithClient(<MaschineLooperSection hidEvents={[]} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(mockStop).toHaveBeenCalledWith(0))
  })

  it('fires looperApi.restart when the Restart button is clicked', async () => {
    mockGetStatus.mockResolvedValueOnce(makeStatus())
    renderWithClient(<MaschineLooperSection hidEvents={[]} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    await waitFor(() => expect(mockRestart).toHaveBeenCalledWith(0))
  })

  it('fires looperApi.clear when the Erase button is clicked', async () => {
    mockGetStatus.mockResolvedValueOnce(makeStatus())
    renderWithClient(<MaschineLooperSection hidEvents={[]} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /Erase$/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Erase$/ }))
    await waitFor(() => expect(mockClear).toHaveBeenCalledWith(0))
  })

  it('flashes the matching transport button when a physical transport_press lands', async () => {
    mockGetStatus.mockResolvedValue(makeStatus())
    const initial: MaschineHidEvent[] = []
    const { rerender } = renderWithClient(<MaschineLooperSection hidEvents={initial} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument())
    const transportPress: MaschineHidEvent = {
      timestamp: new Date().toISOString(),
      direction: 'in',
      decoded_type: 'transport_press',
      payload: { transport_action: 'play', pressed: true, channel: 2 },
    } as MaschineHidEvent
    rerender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, refetchInterval: false } } })}><MaschineLooperSection hidEvents={[transportPress]} /></QueryClientProvider>)
    await waitFor(() => {
      const playBtn = document.querySelector<HTMLButtonElement>('[data-maschine-looper-transport="play"]')
      expect(playBtn?.dataset.maschineLooperFlash).toBe('on')
    })
  })

  it('renders empty-state-friendly placeholders before the first status response', () => {
    mockGetStatus.mockReturnValue(new Promise(() => {}))
    renderWithClient(<MaschineLooperSection hidEvents={[]} />)
    // Section + 4 placeholder tracks should render even without data.
    expect(screen.getByTestId('maschine-looper-section')).toBeInTheDocument()
    expect(screen.getByTestId('maschine-looper-grid')).toBeInTheDocument()
    expect(screen.getByText('Connecting…')).toBeInTheDocument()
  })
})
