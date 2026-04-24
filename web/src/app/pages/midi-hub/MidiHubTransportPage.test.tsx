import React from 'react'
import { render, screen } from '@testing-library/react'

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
}))

jest.mock('../../components/MidiHub/MidiClockPanel', () => ({
  MidiClockPanel: () => <div>Clock Panel Mock</div>,
}))

jest.mock('../../components/MidiHub/MidiRecorderPanel', () => ({
  MidiRecorderPanel: () => <div>Recorder Panel Mock</div>,
}))

const { MidiHubTransportPage } =
  jest.requireActual('./MidiHubTransportPage') as typeof import('./MidiHubTransportPage')

describe('MidiHubTransportPage', () => {
  it('renders the transport route sections', () => {
    render(<MidiHubTransportPage />)

    const useSetShellWindowMock = (
      jest.requireMock('../../layout/useSetShellWindow') as { useSetShellWindow: jest.Mock }
    ).useSetShellWindow
    expect(useSetShellWindowMock).toHaveBeenCalled()
    expect(
      useSetShellWindowMock.mock.calls.some((call: unknown[]) => {
        const patch = call[0] as { kicker?: string }
        return typeof patch?.kicker === 'string' && patch.kicker.includes('Transport')
      }),
    ).toBe(true)
    expect(screen.getByText('Clock Panel Mock')).toBeTruthy()
    expect(screen.getByText('Recorder Panel Mock')).toBeTruthy()
  })
})
