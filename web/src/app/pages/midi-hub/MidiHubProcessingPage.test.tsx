import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mockMidiHubApi = {
  updateRoute: jest.fn(async () => ({ ok: true, route: { route_id: 'route-1' } })),
  upsertScript: jest.fn(async () => ({ ok: true, script: { script_id: 'script-1' } })),
  runScript: jest.fn(async () => ({ ok: true, script_id: 'script-1' })),
  triggerMacro: jest.fn(async () => ({ ok: true, macro_id: 'macro-1' })),
  createSchedulerEntry: jest.fn(async () => ({ ok: true, entry: { schedule_id: 'evt-1' } })),
  cancelSchedulerEntry: jest.fn(async () => ({ ok: true })),
}

jest.mock('../../../map2/api', () => ({
  midiHubApi: mockMidiHubApi,
}))

jest.mock('./MidiHubAreaLayout', () => ({
  MidiHubAreaLayout: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}))

jest.mock('../../components/MidiHub/MidiHubHelpPrimitives', () => ({
  MidiHubPanelShell: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}))

jest.mock('../../components/MidiHub/MidiHubFilterPlanner', () => {
  const { midiHubApi } = require('../../../map2/api')
  return {
    MidiHubFilterPlanner: () => (
      <div>
        <button type="button">Ch 2</button>
        <button type="button">control_change</button>
        <button type="button" onClick={() => midiHubApi.updateRoute('route-1', { filter: { channels: [2], message_types: ['control_change'] } }, null)}>
          Save filter route
        </button>
      </div>
    ),
  }
})

jest.mock('../../components/MidiHub/MidiHubMessageMapper', () => {
  const ReactLocal = require('react')
  return {
    MidiHubMessageMapper: () => {
      const [target, setTarget] = ReactLocal.useState('')
      return (
        <div>
          <label htmlFor="mock-target">Target</label>
          <input id="mock-target" value={target} onChange={(event) => setTarget(event.currentTarget.value)} />
          <button type="button">Slot 1</button>
          <button type="button">Save slot</button>
        </div>
      )
    },
  }
})

jest.mock('../../components/MidiHub/MidiScriptEditor', () => {
  const { midiHubApi } = require('../../../map2/api')
  return {
    MidiScriptEditor: () => (
      <div>
        <div>Scene Loader</div>
        <button type="button">Load</button>
        <button type="button" onClick={() => midiHubApi.upsertScript({ script_id: 'script-1', name: 'Scene Loader', code: 'pass' }, null)}>
          Save script
        </button>
        <button type="button" onClick={() => midiHubApi.runScript('script-1', { source: 'ui' }, null)}>
          Run script
        </button>
      </div>
    ),
  }
})

jest.mock('../../components/MidiHub/MidiMacroPanel', () => {
  const { midiHubApi } = require('../../../map2/api')
  return {
    MidiMacroPanel: () => (
      <div>
        <div>Macro 1</div>
        <button type="button" onClick={() => midiHubApi.triggerMacro('macro-1', { source: 'ui' }, null)}>
          Trigger macro
        </button>
      </div>
    ),
  }
})

jest.mock('../../components/MidiHub/MidiSchedulerPanel', () => {
  const { midiHubApi } = require('../../../map2/api')
  return {
    MidiSchedulerPanel: () => (
      <div>
        <button type="button" onClick={() => midiHubApi.createSchedulerEntry({ schedule_id: 'evt-1', destination_port: 'dst', message: [192, 10] }, null)}>
          Schedule event
        </button>
        <button type="button" onClick={() => midiHubApi.cancelSchedulerEntry('evt-1', null)}>
          Cancel
        </button>
      </div>
    ),
  }
})

const { MidiHubProcessingPage } =
  require('./MidiHubProcessingPage') as typeof import('./MidiHubProcessingPage')

describe('MidiHubProcessingPage', () => {
  beforeEach(() => {
    Object.values(mockMidiHubApi).forEach((value) => value.mockClear())
  })

  it('renders the processing route and exercises filter, mapper, script, macro, and scheduler workflows', async () => {
    render(<MidiHubProcessingPage />)

    expect(screen.getByRole('heading', { name: 'Message Processing' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Filter Planner' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Save filter route' }))
    await waitFor(() => expect(mockMidiHubApi.updateRoute).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Target'), { target: { value: 'Macro Target' } })
    expect(screen.getByDisplayValue('Macro Target')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save slot' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save script' }))
    await waitFor(() => expect(mockMidiHubApi.upsertScript).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Run script' }))
    await waitFor(() => expect(mockMidiHubApi.runScript).toHaveBeenCalledWith('script-1', { source: 'ui' }, null))

    fireEvent.click(screen.getByRole('button', { name: 'Trigger macro' }))
    await waitFor(() => expect(mockMidiHubApi.triggerMacro).toHaveBeenCalledWith('macro-1', { source: 'ui' }, null))

    fireEvent.click(screen.getByRole('button', { name: 'Schedule event' }))
    await waitFor(() => expect(mockMidiHubApi.createSchedulerEntry).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(mockMidiHubApi.cancelSchedulerEntry).toHaveBeenCalledWith('evt-1', null))
  })
})
