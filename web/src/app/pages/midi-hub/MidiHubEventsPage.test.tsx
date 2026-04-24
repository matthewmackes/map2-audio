import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { NotificationProvider } from '../../components/Toasts'
import { MidiHubNodeScopeProvider } from '../../components/MidiHub/MidiHubNodeScope'

const mockMidiHubApi = {
  listEventLists: jest.fn(async () => ({
    count: 1,
    event_lists: [
      {
        event_list_id: 'show-open',
        name: 'Show Open',
        list_type: 'mtc',
        source_id: 'internal',
        internal_clock_enabled: true,
        first_time: '00:00:00:00',
        last_time: '00:05:00:00',
        fps: 30,
        timezone: 'UTC',
        enabled: true,
        running: false,
        current_timecode: '00:00:10:00',
        current_frame: 300,
        current_datetime: null,
        clock_source: 'internal',
        learn_mode_enabled: false,
        learn_action_type: 'RecallPreset',
        learn_label: 'Learned cue',
        learn_payload: {},
        fired_event_ids: [],
        event_count: 1,
      },
    ],
  })),
  upsertEventList: jest.fn(async () => ({ ok: true, event_list: { event_list_id: 'show-open' } })),
  startEventList: jest.fn(async () => ({ ok: true, event_list: { event_list_id: 'show-open' } })),
  stopEventList: jest.fn(async () => ({ ok: true, event_list: { event_list_id: 'show-open' } })),
  deleteEventList: jest.fn(async () => ({ ok: true })),
  getEventListStatus: jest.fn(async () => ({
    ok: true,
    status: {
      running: false,
      clock_source: 'internal',
      fps: 30,
      list_type: 'mtc',
      current_timecode: '00:00:10:00',
      current_datetime: null,
      fired_event_ids: [],
    },
  })),
  listEventListEvents: jest.fn(async () => ({
    count: 1,
    events: [
      {
        event_id: 'cue-1',
        order: 1,
        time_address: '00:00:10:00',
        action_type: 'RecallPreset',
        label: 'Cue 1',
        payload: { preset_id: 'baseline' },
        enabled: true,
      },
    ],
  })),
  upsertEventListEvent: jest.fn(async () => ({ ok: true, event: { event_id: 'cue-1' } })),
  deleteEventListEvent: jest.fn(async () => ({ ok: true })),
  setEventListLearnMode: jest.fn(async () => ({ ok: true, event_list: { event_list_id: 'show-open' } })),
  captureEventListLearnMode: jest.fn(async () => ({ ok: true, event: { event_id: 'show-open-learn-2' } })),
  sendMscMessage: jest.fn(async () => ({ ok: true, message_hex: 'f07f0002000131f7' })),
}

jest.mock('../../../map2/api', () => ({
  midiHubApi: mockMidiHubApi,
}))

jest.mock('../../components/Toasts', () => ({
  NotificationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useToasts: () => ({
    pushToast: jest.fn(),
    dismissToast: jest.fn(),
  }),
  useNotifications: () => ({
    notifications: [],
    pushNotification: jest.fn(),
    dismissNotification: jest.fn(),
    clearNotifications: jest.fn(),
  }),
}))

jest.mock('../../layout/useSetShellWindow', () => ({
  useSetShellWindow: jest.fn(),
}))

jest.mock('./MidiHubContentFrame', () => ({
  MidiHubContentFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

jest.mock('../../components/MidiHub/MidiHubHelpPrimitives', () => ({
  MidiHubPanelShell: ({
    children,
    title,
  }: {
    children: React.ReactNode
    title?: React.ReactNode
  }) => (
    <section>
      {title ? <h3>{title}</h3> : null}
      {children}
    </section>
  ),
  MidiHubEmptyState: ({ title, description }: { title: string; description: string }) => (
    <div>
      <h4>{title}</h4>
      <p>{description}</p>
    </div>
  ),
}))

const { MidiHubEventsPage } =
  jest.requireActual('./MidiHubEventsPage') as typeof import('./MidiHubEventsPage')

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })

  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverMock,
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <NotificationProvider>
          <MidiHubNodeScopeProvider nodeId={null} scopeKey="local">
            <MidiHubEventsPage />
          </MidiHubNodeScopeProvider>
        </NotificationProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MidiHubEventsPage', () => {
  beforeEach(() => {
    Object.values(mockMidiHubApi).forEach((value) => value.mockClear())
  })

  it('renders event lists, shows traffic-free status, saves events, captures learn mode, and sends MSC', async () => {
    renderPage()

    expect(await screen.findByText('Show Open')).toBeTruthy()
    const useSetShellWindowMock = (
      jest.requireMock('../../layout/useSetShellWindow') as { useSetShellWindow: jest.Mock }
    ).useSetShellWindow
    expect(useSetShellWindowMock).toHaveBeenCalled()
    expect(
      useSetShellWindowMock.mock.calls.some((call: unknown[]) => {
        const patch = call[0] as { kicker?: string }
        return typeof patch?.kicker === 'string' && patch.kicker.includes('Events')
      }),
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Event list actions for show-open' }))
    fireEvent.click(await screen.findByText('Open'))
    fireEvent.click(screen.getByRole('button', { name: 'Save event' }))
    await waitFor(() => expect(mockMidiHubApi.upsertEventListEvent).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Save learn mode' }))
    await waitFor(() => expect(mockMidiHubApi.setEventListLearnMode).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Capture current position' }))
    await waitFor(() => expect(mockMidiHubApi.captureEventListLearnMode).toHaveBeenCalledWith('show-open', null))

    fireEvent.click(screen.getByRole('button', { name: 'Send MSC' }))
    await waitFor(() => expect(mockMidiHubApi.sendMscMessage).toHaveBeenCalled())
    expect(await screen.findByText('f07f0002000131f7')).toBeTruthy()
  })
})
