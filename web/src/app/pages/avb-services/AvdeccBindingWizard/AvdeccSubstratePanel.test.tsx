/**
 * T2499-C Slice 5 — substrate-state diagnostic panel tests.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

import {
  AvdeccSubstratePanel,
  type SubstrateState,
} from './AvdeccSubstratePanel'

function healthyState(over: Partial<SubstrateState> = {}): SubstrateState {
  return {
    interface: { name: 'eth0', up: true },
    ptp: {
      locked: true,
      offset_ns: 12,
      grandmaster_id: '000a35feedface00',
    },
    entity_count: 4,
    source: 'live',
    origin: null,
    ...over,
  }
}

function degradedState(over: Partial<SubstrateState> = {}): SubstrateState {
  return {
    interface: { name: 'sim0', up: false },
    ptp: {
      locked: false,
      offset_ns: 0,
      grandmaster_id: '0000000000000000',
    },
    entity_count: 0,
    source: 'avdecc_simulator',
    origin: 'env:offline',
    ...over,
  }
}

// ---------------------------------------------------------------------------
// Healthy path
// ---------------------------------------------------------------------------

describe('AvdeccSubstratePanel — healthy', () => {
  it('renders the Healthy status tag', () => {
    render(<AvdeccSubstratePanel state={healthyState()} />)
    expect(screen.queryByTestId('avdecc-substrate-status-healthy')).not.toBeNull()
  })

  it('does not render a Fix-it button when healthy', () => {
    render(
      <AvdeccSubstratePanel
        state={healthyState()}
        onOpenSubstrateConfig={() => {}}
      />,
    )
    expect(screen.queryByTestId('avdecc-substrate-fix-it')).toBeNull()
  })

  it('shows the interface name + up tag', () => {
    render(<AvdeccSubstratePanel state={healthyState({ interface: { name: 'enp3s0', up: true } })} />)
    expect(screen.queryByText('enp3s0')).not.toBeNull()
    expect(screen.queryByTestId('avdecc-substrate-iface-up')).not.toBeNull()
  })

  it('shows PTP locked + grandmaster info', () => {
    render(<AvdeccSubstratePanel state={healthyState()} />)
    expect(screen.queryByTestId('avdecc-substrate-ptp-locked')).not.toBeNull()
    expect(screen.queryByText(/000a35feedface00/)).not.toBeNull()
  })

  it('renders entity count', () => {
    render(<AvdeccSubstratePanel state={healthyState({ entity_count: 16 })} />)
    expect(screen.getByTestId('avdecc-substrate-entity-count').textContent).toContain('16')
  })
})

// ---------------------------------------------------------------------------
// Degraded path — interface down
// ---------------------------------------------------------------------------

describe('AvdeccSubstratePanel — degraded (interface down)', () => {
  it('renders the Degraded status tag', () => {
    render(<AvdeccSubstratePanel state={degradedState()} />)
    expect(screen.queryByTestId('avdecc-substrate-status-degraded')).not.toBeNull()
  })

  it('renders the warning InlineNotification with interface-down copy', () => {
    render(<AvdeccSubstratePanel state={degradedState()} />)
    const banner = screen.queryByTestId('avdecc-substrate-warning')
    expect(banner).not.toBeNull()
    expect(banner!.textContent).toMatch(/interface is down/i)
  })

  it('renders the Fix-it button when onOpenSubstrateConfig is provided', () => {
    render(
      <AvdeccSubstratePanel
        state={degradedState()}
        onOpenSubstrateConfig={() => {}}
      />,
    )
    expect(screen.queryByTestId('avdecc-substrate-fix-it')).not.toBeNull()
  })

  it('fires onOpenSubstrateConfig when Fix-it is clicked', () => {
    const onOpen = jest.fn()
    render(
      <AvdeccSubstratePanel
        state={degradedState()}
        onOpenSubstrateConfig={onOpen}
      />,
    )
    fireEvent.click(screen.getByTestId('avdecc-substrate-fix-it'))
    expect(onOpen).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Degraded path — interface up but PTP not locked
// ---------------------------------------------------------------------------

describe('AvdeccSubstratePanel — degraded (PTP not locked)', () => {
  it('shows a different warning subtitle when only PTP is degraded', () => {
    render(
      <AvdeccSubstratePanel
        state={{
          interface: { name: 'eth0', up: true },
          ptp: { locked: false, offset_ns: 0, grandmaster_id: '00' },
          entity_count: 4,
          source: 'live',
        }}
      />,
    )
    const banner = screen.queryByTestId('avdecc-substrate-warning')
    expect(banner).not.toBeNull()
    expect(banner!.textContent).toMatch(/PTP is not locked/i)
  })
})

// ---------------------------------------------------------------------------
// Simulator origin tag
// ---------------------------------------------------------------------------

describe('AvdeccSubstratePanel — simulator origin', () => {
  it('renders the simulator tag with origin when source=avdecc_simulator', () => {
    render(<AvdeccSubstratePanel state={degradedState()} />)
    const tag = screen.queryByTestId('avdecc-substrate-simulator-tag')
    expect(tag).not.toBeNull()
    expect(tag!.textContent).toContain('env:offline')
  })

  it('omits the simulator tag when source=live', () => {
    render(<AvdeccSubstratePanel state={healthyState()} />)
    expect(screen.queryByTestId('avdecc-substrate-simulator-tag')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Error pass-through
// ---------------------------------------------------------------------------

describe('AvdeccSubstratePanel — error pass-through', () => {
  it('renders the error message when state.error is present', () => {
    render(
      <AvdeccSubstratePanel
        state={{
          ...healthyState(),
          error: 'AVB readiness service unreachable',
        }}
      />,
    )
    const err = screen.queryByTestId('avdecc-substrate-error')
    expect(err).not.toBeNull()
    expect(err!.textContent).toContain('unreachable')
  })
})
