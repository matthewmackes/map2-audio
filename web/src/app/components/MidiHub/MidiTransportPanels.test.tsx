import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockMidiHubApi = {
  getClockStatus: jest.fn(),
  updateClockConfig: jest.fn(),
  tapClock: jest.fn(),
  startClock: jest.fn(),
  continueClock: jest.fn(),
  stopClock: jest.fn(),
  listRecordingSessions: jest.fn(),
  startRecording: jest.fn(),
  stopRecording: jest.fn(),
  playbackRecording: jest.fn(),
  stopRecordingPlayback: jest.fn(),
  exportRecording: jest.fn(),
  deleteRecording: jest.fn(),
}

jest.mock('../../../map2/api', () => ({
  midiHubApi: mockMidiHubApi,
}))

jest.mock('./useMidiHubOverview', () => ({
  useMidiHubOverview: () => ({
    outputPorts: [
      { port_id: 'din-out', name: 'DIN Out', direction: 'output', kind: 'din' },
      { port_id: 'usb-out', name: 'USB Out', direction: 'output', kind: 'usb' },
    ],
  }),
}))

jest.mock('../Toasts', () => ({
  useToasts: () => ({
    pushToast: jest.fn(),
  }),
}))

const { MidiClockPanel } = require('./MidiClockPanel') as typeof import('./MidiClockPanel')
const { MidiRecorderPanel } = require('./MidiRecorderPanel') as typeof import('./MidiRecorderPanel')
const { MidiHubNodeScopeProvider } = require('./MidiHubNodeScope') as typeof import('./MidiHubNodeScope')

function renderWithProviders(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MidiHubNodeScopeProvider nodeId="node-a" scopeKey="scope-a">
        {node}
      </MidiHubNodeScopeProvider>
    </QueryClientProvider>,
  )
}

describe('Midi transport panels', () => {
  beforeEach(() => {
    Object.values(mockMidiHubApi).forEach((value) => value.mockReset())

    mockMidiHubApi.getClockStatus.mockResolvedValue({
      running: true,
      bpm: 123.45,
      output_ports: ['din-out'],
      source_mode: 'internal',
      divider: 2,
      multiplier: 3,
      offset_ms: 0,
      detected_bpm: 123.4,
      song_position: 32,
    })
    mockMidiHubApi.updateClockConfig.mockResolvedValue({})
    mockMidiHubApi.tapClock.mockResolvedValue({})
    mockMidiHubApi.startClock.mockResolvedValue({})
    mockMidiHubApi.continueClock.mockResolvedValue({})
    mockMidiHubApi.stopClock.mockResolvedValue({})

    mockMidiHubApi.listRecordingSessions.mockResolvedValue({
      count: 1,
      sessions: [
        {
          session_id: 'take-a',
          name: 'Take A',
          created_at: 1710000000,
          loop_enabled: false,
          event_count: 24,
        },
      ],
    })
    mockMidiHubApi.startRecording.mockResolvedValue({})
    mockMidiHubApi.stopRecording.mockResolvedValue({})
    mockMidiHubApi.playbackRecording.mockResolvedValue({})
    mockMidiHubApi.stopRecordingPlayback.mockResolvedValue({})
    mockMidiHubApi.exportRecording.mockResolvedValue({ path: '/tmp/take-a.mid' })
    mockMidiHubApi.deleteRecording.mockResolvedValue({})
  })

  it('renders clock status, lets operators pick ports, and saves divider/multiplier config', async () => {
    renderWithProviders(<MidiClockPanel />)

    expect(await screen.findByText('Transport BPM')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Detected 123.40')).toBeTruthy())
    await waitFor(() => expect(screen.getByRole('button', { name: /din out/i })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /usb out/i }))
    fireEvent.change(screen.getByLabelText('BPM'), { target: { value: '140' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Clock divider' }), { target: { value: '4' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Clock multiplier' }), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /apply clock/i }))

    await waitFor(() =>
      expect(mockMidiHubApi.updateClockConfig).toHaveBeenCalledWith(
        {
          bpm: 140,
          source_mode: 'internal',
          output_ports: ['din-out', 'usb-out'],
          divider: 4,
          multiplier: 2,
        },
        'node-a',
      ),
    )
  })

  it('renders recording sessions in a data table and sends playback/export actions with configured values', async () => {
    renderWithProviders(<MidiRecorderPanel />)

    expect(await screen.findByText('Recording sessions')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Take A')).toBeTruthy())

    fireEvent.change(screen.getByLabelText('Playback destination'), { target: { value: 'monitor' } })
    fireEvent.click(screen.getByLabelText('Loop playback'))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Playback speed' }), { target: { value: '1.5' } })
    expect(screen.getByText('Export BPM')).toBeTruthy()
    expect(screen.getByText('Export ticks/quarter')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^play$/i }))
    await waitFor(() =>
      expect(mockMidiHubApi.playbackRecording).toHaveBeenCalledWith(
        'take-a',
        {
          destination_override: 'monitor',
          loop: true,
          speed: 1.5,
        },
        'node-a',
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: /export smf/i }))
    await waitFor(() =>
      expect(mockMidiHubApi.exportRecording).toHaveBeenCalledWith(
        'take-a',
        {
          bpm: 120,
          ticks_per_quarter: 480,
        },
        'node-a',
      ),
    )
  })
})
