import '@testing-library/jest-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { PerformanceBrainCard } from './PerformanceBrainCard'

const mockGetState = jest.fn()
const mockGetTransport = jest.fn()
const mockGetMixer = jest.fn()
const mockSetTransport = jest.fn()
const mockSetMixer = jest.fn()
const mockUpdateSlot = jest.fn()

jest.mock('../../Base/PluginCardShell', () => ({
  PluginCardShell: ({ plugin, visualization, children, footer, onLaunch }: any) => (
    <section aria-label={`${plugin.name} shell`}>
      {onLaunch ? <button onClick={onLaunch}>Open Full Editor</button> : null}
      <div>{visualization}</div>
      <div>{children}</div>
      <footer>{footer}</footer>
    </section>
  ),
}))

jest.mock('../../withMidiDialog', () => ({
  withMidiDialog: (Component: React.ComponentType<any>) => Component,
}))

jest.mock('../../../ParameterControl', () => ({
  NumberInput: ({ label, ariaLabel, value, onChange }: any) => (
    <label>
      <span>{label}</span>
      <input
        aria-label={ariaLabel ?? label}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  ),
  ParameterKnob: ({ label, ariaLabel, value, onChange }: any) => (
    <label>
      <span>{label}</span>
      <input
        type="number"
        aria-label={ariaLabel ?? label}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  ),
}))

jest.mock('@/map2/api', () => ({
  brainApi: {
    getState: (...args: any[]) => mockGetState(...args),
    getTransport: (...args: any[]) => mockGetTransport(...args),
    getMixer: (...args: any[]) => mockGetMixer(...args),
    setTransport: (...args: any[]) => mockSetTransport(...args),
    setMixer: (...args: any[]) => mockSetMixer(...args),
    updateSlot: (...args: any[]) => mockUpdateSlot(...args),
  },
}))

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
}

function makePlugin() {
  return {
    uri: 'map2://juce/brain',
    name: 'Performance Brain',
    author: 'MAP2',
    category: 'Instrument',
    class_label: 'Instrument',
    version: '1.0',
    license: 'AGPL-3.0-only',
    has_ui: false,
    in_ports: 0,
    out_ports: 2,
    parameters: [],
    instance_id: 17,
  }
}

function primeApi() {
  mockGetState.mockResolvedValue({
    set_name: 'Stage Brain',
    active_slot: 0,
    slots: [
      { slot_id: 0, name: 'Kick', mode: 'drum', level: 0.76 },
    ],
  })
  mockGetTransport.mockResolvedValue({
    is_playing: true,
    bpm: 128,
    pattern: 6,
    variation: 2,
  })
  mockGetMixer.mockResolvedValue({
    buses: [],
    master: { master_volume: 0.9, drive_db: 0, compressor_amount: 0.2, reverb_mix: 0.2, limiter_ceiling_db: -0.5 },
  })
  mockSetTransport.mockImplementation(async (patch: Record<string, unknown>) => ({
    is_playing: typeof patch.is_playing === 'boolean' ? patch.is_playing : true,
    bpm: typeof patch.bpm === 'number' ? patch.bpm : 128,
    pattern: typeof patch.pattern === 'number' ? patch.pattern : 6,
    variation: 2,
  }))
  mockSetMixer.mockImplementation(async (nextMixer: unknown) => nextMixer)
  mockUpdateSlot.mockResolvedValue({ slot_id: 0, name: 'Kick', mode: 'drum', level: 0.65 })
}

describe('PerformanceBrainCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    window.history.replaceState({}, '', '/')
    primeApi()
  })

  it('renders the compact transport and focused-slot summary', async () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <PerformanceBrainCard
          plugin={makePlugin()}
          pluginPosition={3}
          parameterValues={{}}
          onParameterChange={jest.fn()}
          accentColor="#0f62fe"
        />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByLabelText('Focused slot summary')).toHaveTextContent('1: Kick'))

    expect(screen.getByLabelText('Master')).toBeInTheDocument()
    expect(screen.getByLabelText('Active slot level')).toBeInTheDocument()
    expect(screen.getByLabelText('Brain BPM')).toBeInTheDocument()
    expect(screen.getByLabelText('Brain pattern')).toBeInTheDocument()
  })

  it('toggles transport from the compact card and updates the scoped button state', async () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <PerformanceBrainCard
          plugin={makePlugin()}
          pluginPosition={3}
          parameterValues={{}}
          onParameterChange={jest.fn()}
          accentColor="#0f62fe"
        />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop Performance Brain transport' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Stop Performance Brain transport' }))

    await waitFor(() =>
      expect(mockSetTransport).toHaveBeenCalledWith({ is_playing: false }, { instanceId: 17, pluginPosition: 3 }),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start Performance Brain transport' })).toBeInTheDocument())
  })

  it('renders quick mix controls and updates pattern state with the scoped Brain runtime identity', async () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <PerformanceBrainCard
          plugin={makePlugin()}
          pluginPosition={3}
          parameterValues={{}}
          onParameterChange={jest.fn()}
          accentColor="#0f62fe"
        />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByLabelText('Active slot level')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Brain pattern'), { target: { value: '8' } })

    await waitFor(() =>
      expect(mockSetTransport).toHaveBeenCalledWith({ pattern: 7 }, { instanceId: 17, pluginPosition: 3 }),
    )
  })

  it('launches the full Performance Brain workspace with instance scope', async () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <PerformanceBrainCard
          plugin={makePlugin()}
          pluginPosition={3}
          parameterValues={{}}
          onParameterChange={jest.fn()}
          accentColor="#0f62fe"
        />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Full Editor' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Open Full Editor' }))

    expect(window.location.pathname).toBe('/brain')
    expect(window.location.search).toBe('?instance_id=17&plugin_position=3')
  })
})
