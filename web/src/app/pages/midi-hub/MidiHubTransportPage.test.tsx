import React from 'react'
import { render, screen } from '@testing-library/react'

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

jest.mock('../../components/MidiHub/MidiClockPanel', () => ({
  MidiClockPanel: () => <div>Clock Panel Mock</div>,
}))

jest.mock('../../components/MidiHub/MidiRecorderPanel', () => ({
  MidiRecorderPanel: () => <div>Recorder Panel Mock</div>,
}))

const { MidiHubTransportPage } = require('./MidiHubTransportPage') as typeof import('./MidiHubTransportPage')

describe('MidiHubTransportPage', () => {
  it('renders the transport route sections', () => {
    render(<MidiHubTransportPage />)

    expect(screen.getByRole('heading', { name: 'Transport' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Clock engine' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Recorder' })).toBeTruthy()
    expect(screen.getByText('Clock Panel Mock')).toBeTruthy()
    expect(screen.getByText('Recorder Panel Mock')).toBeTruthy()
  })
})
