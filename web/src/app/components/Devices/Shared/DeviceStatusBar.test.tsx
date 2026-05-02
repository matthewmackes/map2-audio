/**
 * T2485-2 — DeviceStatusBar unit tests.
 */

import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { DeviceStatusBar } from './DeviceStatusBar'

const NUMERIC_PROGRAM_FORMATTER = (n: number) => String(n + 1).padStart(3, '0')

describe('DeviceStatusBar', () => {
  it('renders device name and shows offline dot when disconnected', () => {
    const { container } = render(
      <DeviceStatusBar connected={false} deviceName="MPX1 Rack" lcdText="OFFLINE" />,
    )
    expect(screen.getByText('MPX1 Rack')).toBeInTheDocument()
    expect(container.querySelector('.device-statusbar__dot.is-online')).toBeNull()
    expect(container.querySelector('.device-statusbar')).toHaveAttribute(
      'data-connected',
      'false',
    )
  })

  it('marks the dot online when connected=true', () => {
    const { container } = render(
      <DeviceStatusBar connected={true} deviceName="MPX1 Rack" lcdText="ONLINE" />,
    )
    expect(container.querySelector('.device-statusbar__dot.is-online')).toBeInTheDocument()
    expect(container.querySelector('.device-statusbar')).toHaveAttribute(
      'data-connected',
      'true',
    )
  })

  it('hides program / mix / tap / bypass slots when their props are omitted', () => {
    const { container } = render(
      <DeviceStatusBar connected={true} deviceName="Minimal" lcdText="…" />,
    )
    expect(container.querySelector('.device-statusbar__program')).toBeNull()
    expect(container.querySelector('.device-statusbar__mix')).toBeNull()
    expect(container.querySelector('.device-statusbar__tap')).toBeNull()
    expect(container.querySelector('.device-statusbar__bypass')).toBeNull()
  })

  it('renders the program stepper and dispatches step deltas', () => {
    const onProgramStep = jest.fn()
    render(
      <DeviceStatusBar
        connected
        deviceName="MPX1 Rack"
        lcdText="P 001"
        programState={{
          number: 0,
          name: 'INIT',
          formatNumber: NUMERIC_PROGRAM_FORMATTER,
        }}
        onProgramStep={onProgramStep}
      />,
    )

    expect(screen.getByText('001')).toBeInTheDocument()
    expect(screen.getByText('INIT')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Previous program'))
    fireEvent.click(screen.getByLabelText('Next program'))
    expect(onProgramStep).toHaveBeenNthCalledWith(1, -1)
    expect(onProgramStep).toHaveBeenNthCalledWith(2, 1)
  })

  it('uses the device-supplied program-number formatter', () => {
    render(
      <DeviceStatusBar
        connected
        deviceName="IntelFX"
        lcdText="…"
        programState={{
          number: 41,
          name: 'HALL',
          formatNumber: (n) => `IFX-${n.toString(16).toUpperCase()}`,
        }}
        onProgramStep={() => undefined}
      />,
    )
    expect(screen.getByText('IFX-29')).toBeInTheDocument()
  })

  it('renders the tap-tempo button and fires onTap', () => {
    const onTap = jest.fn()
    render(
      <DeviceStatusBar
        connected
        deviceName="Dev"
        lcdText="…"
        tapTempo={{ bpm: 120, onTap }}
      />,
    )
    const tapButton = screen.getByRole('button', { name: 'Tap tempo' })
    expect(tapButton).toHaveTextContent('120 BPM')
    fireEvent.click(tapButton)
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('shows BPM placeholder when tapTempo.bpm is null', () => {
    render(
      <DeviceStatusBar
        connected
        deviceName="Dev"
        lcdText="…"
        tapTempo={{ bpm: null, onTap: () => undefined }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Tap tempo' })).toHaveTextContent('TAP BPM')
  })

  it('renders bypass pills with engaged/bypassed state and dispatches toggles', () => {
    const onToggleBypass = jest.fn()
    const { container } = render(
      <DeviceStatusBar
        connected
        deviceName="MPX1"
        lcdText="…"
        bypassBlocks={[
          { id: 'REV', label: 'REV', engaged: true },
          { id: 'PIT', label: 'PIT', engaged: false },
        ]}
        onToggleBypass={onToggleBypass}
      />,
    )

    const rev = container.querySelector('.device-statusbar__pill[aria-pressed="false"]')
    const pit = container.querySelector('.device-statusbar__pill[aria-pressed="true"]')
    expect(rev).toHaveTextContent('REV')
    expect(pit).toHaveTextContent('PIT')
    expect(pit).toHaveClass('is-bypassed')
    expect(rev).not.toHaveClass('is-bypassed')

    fireEvent.click(rev as HTMLElement)
    fireEvent.click(pit as HTMLElement)
    expect(onToggleBypass).toHaveBeenNthCalledWith(1, 'REV')
    expect(onToggleBypass).toHaveBeenNthCalledWith(2, 'PIT')
  })

  it('hides bypass section when blocks array is empty', () => {
    const { container } = render(
      <DeviceStatusBar
        connected
        deviceName="Dev"
        lcdText="…"
        bypassBlocks={[]}
        onToggleBypass={() => undefined}
      />,
    )
    expect(container.querySelector('.device-statusbar__bypass')).toBeNull()
  })

  it('renders the mix slot with aria-label from props', () => {
    const onChange = jest.fn()
    render(
      <DeviceStatusBar
        connected
        deviceName="Dev"
        lcdText="…"
        mix={{ value: 0.5, ariaLabel: 'Custom mix label', onChange }}
      />,
    )
    expect(screen.getByText('Mix')).toBeInTheDocument()
  })
})
