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

jest.mock('../../layout/useSetShellWindow', () => ({
  useSetShellWindow: jest.fn(),
}))

jest.mock('./MidiHubContentFrame', () => ({
  MidiHubContentFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

    const useSetShellWindowMock = (
      jest.requireMock('../../layout/useSetShellWindow') as { useSetShellWindow: jest.Mock }
    ).useSetShellWindow
    expect(useSetShellWindowMock).toHaveBeenCalled()
    expect(
      useSetShellWindowMock.mock.calls.some((call: unknown[]) => {
        const patch = call[0] as { kicker?: string }
        return typeof patch?.kicker === 'string' && patch.kicker.includes('Network')
      }),
    ).toBe(true)
    expect(screen.getByText('Network Panel Mock')).toBeTruthy()
    expect(screen.getByText('MIDI 2 Panel Mock')).toBeTruthy()
    expect(screen.getByText('Tesira Panel Mock')).toBeTruthy()
    expect(screen.getByText('Virtual GPIO Panel Mock')).toBeTruthy()
    expect(screen.getByText('String Interface Panel Mock')).toBeTruthy()
  })
})
