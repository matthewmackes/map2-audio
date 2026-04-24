import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { NotificationProvider } from '../../components/Toasts'
import { MidiHubNodeScopeProvider } from '../../components/MidiHub/MidiHubNodeScope'

const mockMidiHubApi = {
  listPresets: jest.fn(async () => ({
    presets: [
      { preset_id: 'baseline', name: 'Baseline', description: 'Known good', created_at: 0, updated_at: 0, conditions: {} },
      { preset_id: 'show-a', name: 'Show A', description: 'Performance scene', created_at: 0, updated_at: 0, conditions: {} },
    ],
    default: { default_preset_id: 'baseline' },
  })),
  getPresetChains: jest.fn(async () => ({
    count: 1,
    chains: {
      show_open: ['baseline', 'show-a'],
    },
  })),
  getProgramSlots: jest.fn(async () => ({
    slots: {
      '1': 'baseline',
    },
  })),
  recallPreset: jest.fn(async () => ({ ok: true })),
  savePreset: jest.fn(async () => ({ ok: true })),
  deletePreset: jest.fn(async () => ({ ok: true })),
  setDefaultPreset: jest.fn(async () => ({ ok: true })),
  comparePresets: jest.fn(async () => ({ ok: true, diff: { changed: ['tempo'] } })),
  exportPreset: jest.fn(async () => ({ ok: true, path: '/tmp/baseline.json' })),
  importPreset: jest.fn(async () => ({ ok: true })),
  setProgramSlot: jest.fn(async () => ({ ok: true })),
  deleteProgramSlot: jest.fn(async () => ({ ok: true })),
  setPresetChain: jest.fn(async () => ({ ok: true })),
  runPresetChain: jest.fn(async () => ({ ok: true })),
  stopPresetChain: jest.fn(async () => ({ ok: true })),
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

jest.mock('../../components/MidiHub/MidiClockPanel', () => ({
  MidiClockPanel: () => <div>Clock Panel Mock</div>,
}))

jest.mock('../../components/MidiHub/MidiRecorderPanel', () => ({
  MidiRecorderPanel: () => <div>Recorder Panel Mock</div>,
}))

const { MidiHubPresetsPage } =
  jest.requireActual('./MidiHubPresetsPage') as typeof import('./MidiHubPresetsPage')

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
            <MidiHubPresetsPage />
          </MidiHubNodeScopeProvider>
        </NotificationProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MidiHubPresetsPage', () => {
  beforeEach(() => {
    Object.values(mockMidiHubApi).forEach((value) => value.mockClear())
  })

  it('renders presets, recalls a preset, opens the compare modal, and saves chain ordering', async () => {
    renderPage()

    expect((await screen.findAllByText('Baseline')).length).toBeGreaterThanOrEqual(2)
    const useSetShellWindowMock = (
      jest.requireMock('../../layout/useSetShellWindow') as { useSetShellWindow: jest.Mock }
    ).useSetShellWindow
    expect(useSetShellWindowMock).toHaveBeenCalled()
    expect(
      useSetShellWindowMock.mock.calls.some((call: unknown[]) => {
        const patch = call[0] as { kicker?: string }
        return typeof patch?.kicker === 'string' && patch.kicker.includes('Presets')
      }),
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Preset actions for baseline' }))
    fireEvent.click(await screen.findByText('Recall'))
    await waitFor(() => expect(mockMidiHubApi.recallPreset).toHaveBeenCalledWith('baseline', null))

    fireEvent.click(screen.getByRole('button', { name: 'Compare presets' }))
    expect(await screen.findByRole('heading', { name: 'Compare presets' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Compare left'), { target: { value: 'baseline' } })
    fireEvent.change(screen.getByLabelText('Compare right'), { target: { value: 'show-a' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run compare' }))
    await waitFor(() => expect(mockMidiHubApi.comparePresets).toHaveBeenCalledWith('baseline', 'show-a', null))

    fireEvent.change(screen.getByLabelText('Preset chain'), { target: { value: 'show_open' } })
    fireEvent.click(screen.getByRole('button', { name: 'Chain order actions for baseline-0' }))
    fireEvent.click(await screen.findByText('Move down'))
    fireEvent.click(screen.getByRole('button', { name: 'Save chain order' }))
    await waitFor(() =>
      expect(mockMidiHubApi.setPresetChain).toHaveBeenCalledWith('show_open', ['show-a', 'baseline'], null),
    )
  })
})
