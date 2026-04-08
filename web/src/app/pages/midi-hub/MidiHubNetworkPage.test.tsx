import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

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
}))

jest.mock('../../components/MidiHub/MidiHubNodeScope', () => ({
  useMidiHubNodeScope: () => ({ nodeId: null, scopeKey: 'local' }),
}))

jest.mock('../../components/Toasts', () => ({
  useToasts: () => ({ pushToast: jest.fn() }),
}))

jest.mock('./MidiHubAreaLayout', () => ({
  MidiHubAreaLayout: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}))

jest.mock('../../components/MidiHub/MidiNetworkPanel', () => ({
  MidiNetworkPanel: () => <div>Network Panel Mock</div>,
}))

jest.mock('../../components/MidiHub/Midi2Panel', () => ({
  Midi2Panel: () => <div>MIDI 2 Panel Mock</div>,
}))

jest.mock('../../components/MidiHub/TesiraPanel', () => ({
  TesiraPanel: () => <div>Tesira Panel Mock</div>,
}))

jest.mock('../../components/MidiHub/VirtualGpioPanel', () => ({
  VirtualGpioPanel: () => <div>Virtual GPIO Panel Mock</div>,
}))

jest.mock('../../components/MidiHub/StringInterfacePanel', () => ({
  StringInterfacePanel: () => <div>String Interface Panel Mock</div>,
}))

const { MidiHubNetworkPage } =
  jest.requireActual('./MidiHubNetworkPage') as typeof import('./MidiHubNetworkPage')

function renderPage() {
  return render(
    <MemoryRouter>
      <MidiHubNetworkPage />
    </MemoryRouter>,
  )
}

describe('MidiHubNetworkPage', () => {
  it('renders all network protocol sections', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Network & Protocol' })).toBeTruthy()
    expect(screen.getByText('Network Panel Mock')).toBeTruthy()
    expect(screen.getByText('MIDI 2 Panel Mock')).toBeTruthy()
    expect(screen.getByText('Tesira Panel Mock')).toBeTruthy()
    expect(screen.getByText('Virtual GPIO Panel Mock')).toBeTruthy()
    expect(screen.getByText('String Interface Panel Mock')).toBeTruthy()
  })
})
