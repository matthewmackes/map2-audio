// Primitives smoke tests — every new primitive renders without crashing
// and applies the expected tone class. Not a deep behavioural test;
// existing behaviour-test discipline (per-primitive .test.tsx) lands as
// individual components grow real logic.

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import {
  ActionButton,
  AlertPanel,
  AvbStatusChip,
  ClockSyncChip,
  CommitPrompt,
  ControlPanel,
  DangerButton,
  DeviceNodeCard,
  DrawerPanel,
  ErrorState,
  HealthMetric,
  LatencyChip,
  LiveStagedToggle,
  MetricCard,
  ModuleCard,
  PageHeader,
  RoutingPanel,
  SectionHeader,
  SignalChainBlock,
  StagedChangesIndicator,
  StatusChip,
  SystemStatusBar,
  bandForHealthValue,
  bandForLatency,
} from './index'

describe('primitives smoke', () => {
  it('StatusChip renders with tone class', () => {
    const { container } = render(<StatusChip tone="live" label="LIVE" />)
    expect(container.querySelector('.map2-status-chip--live')).toBeInTheDocument()
    expect(screen.getByText('LIVE')).toBeInTheDocument()
  })

  it('StatusChip renders dot, value, and size variant', () => {
    const { container } = render(
      <StatusChip tone="critical" label="DOWN" value="3" size="sm" dot />,
    )
    expect(container.querySelector('.map2-status-chip--critical')).toBeInTheDocument()
    expect(container.querySelector('.map2-status-chip--sm')).toBeInTheDocument()
    expect(container.querySelector('.map2-status-chip__dot')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('LatencyChip selects band by ms', () => {
    expect(bandForLatency(3)).toBe('good')
    expect(bandForLatency(8)).toBe('caution')
    expect(bandForLatency(20)).toBe('critical')
  })

  it('LatencyChip renders unknown when null', () => {
    render(<LatencyChip latencyMs={null} unknownLabel="—" />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('LatencyChip formats sub-10ms with one decimal', () => {
    render(<LatencyChip latencyMs={3.4} />)
    expect(screen.getByText('3.4 ms')).toBeInTheDocument()
  })

  it('LatencyChip formats >=10ms as integer', () => {
    render(<LatencyChip latencyMs={12.7} />)
    expect(screen.getByText('13 ms')).toBeInTheDocument()
  })

  it('ClockSyncChip renders all states', () => {
    const states = ['master', 'slave', 'locked', 'unlocked', 'unknown'] as const
    for (const state of states) {
      const { unmount } = render(<ClockSyncChip state={state} />)
      unmount()
    }
  })

  it('AvbStatusChip renders all states', () => {
    const states = ['locked', 'unlocked', 'grandmaster', 'unknown'] as const
    for (const status of states) {
      const { unmount } = render(<AvbStatusChip status={status} />)
      unmount()
    }
  })

  it('PageHeader renders title and optional eyebrow/subtitle/actions', () => {
    render(
      <PageHeader
        eyebrow="WORKSPACE"
        title="MIDI Hub"
        subtitle="Routing and monitoring"
        actions={<button type="button">Action</button>}
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'MIDI Hub' })).toBeInTheDocument()
    expect(screen.getByText('WORKSPACE')).toBeInTheDocument()
    expect(screen.getByText('Routing and monitoring')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
  })

  it('SectionHeader renders h2', () => {
    render(<SectionHeader title="Status" description="Live counts" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Status' })).toBeInTheDocument()
  })

  it('SystemStatusBar renders chips with optional label', () => {
    render(
      <SystemStatusBar label="SYSTEM">
        <StatusChip tone="ok" label="OK" />
      </SystemStatusBar>,
    )
    expect(screen.getByText('SYSTEM')).toBeInTheDocument()
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('MetricCard renders label, value, helper chip', () => {
    render(<MetricCard label="CPU" value="42%" helper="Live" helperTone="ok" />)
    expect(screen.getByText('CPU')).toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('HealthMetric selects band and clamps value', () => {
    expect(bandForHealthValue(50, 70, 85)).toBe('ok')
    expect(bandForHealthValue(75, 70, 85)).toBe('caution')
    expect(bandForHealthValue(95, 70, 85)).toBe('critical')
    const { container } = render(<HealthMetric label="CPU" value={92} />)
    expect(container.querySelector('.map2-health-metric--critical')).toBeInTheDocument()
  })

  it('ControlPanel renders header and body', () => {
    render(
      <ControlPanel title="Routing" description="Audio routing">
        <span>body</span>
      </ControlPanel>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Routing' })).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  it('RoutingPanel adds routing class', () => {
    const { container } = render(<RoutingPanel><span>x</span></RoutingPanel>)
    expect(container.querySelector('.map2-routing-panel')).toBeInTheDocument()
    expect(container.querySelector('.map2-control-panel')).toBeInTheDocument()
  })

  it('ModuleCard renders title and optional state chip', () => {
    render(<ModuleCard title="EQ" state={{ tone: 'live', label: 'LIVE' }} />)
    expect(screen.getByText('EQ')).toBeInTheDocument()
    expect(screen.getByText('LIVE')).toBeInTheDocument()
  })

  it('SignalChainBlock renders bypass class when bypassed', () => {
    const { container } = render(<SignalChainBlock title="Compressor" bypassed />)
    expect(container.querySelector('.map2-signal-chain-block--bypassed')).toBeInTheDocument()
  })

  it('SignalChainBlock renders as button when onClick set', () => {
    render(<SignalChainBlock title="EQ" onClick={() => undefined} />)
    expect(screen.getByRole('button', { name: /EQ/ })).toBeInTheDocument()
  })

  it('DeviceNodeCard renders presence accent class', () => {
    const { container } = render(
      <DeviceNodeCard hostname="map2-prime" role="Audio Node" presence="local" health="ok" healthPercent={96} />,
    )
    expect(container.querySelector('.map2-device-node-card--local')).toBeInTheDocument()
    expect(screen.getByText('map2-prime')).toBeInTheDocument()
    expect(screen.getByText('96%')).toBeInTheDocument()
  })

  it('ActionButton renders with primary kind by default', () => {
    render(<ActionButton>Apply</ActionButton>)
    const btn = screen.getByRole('button', { name: 'Apply' })
    expect(btn).toBeInTheDocument()
  })

  it('DangerButton renders with danger kind and skips confirm when requireConfirm=false', () => {
    const onClick = jest.fn()
    const { container } = render(
      <DangerButton requireConfirm={false} onClick={onClick}>
        Delete
      </DangerButton>,
    )
    // Carbon danger buttons get a hidden "danger" suffix via aria-describedby,
    // so the accessible name resolves to "Delete danger" rather than "Delete".
    // Match by class instead — kind="danger" → cds--btn--danger.
    const btn = container.querySelector('.cds--btn--danger') as HTMLButtonElement | null
    expect(btn).not.toBeNull()
    btn!.click()
    expect(onClick).toHaveBeenCalled()
  })

  it('AlertPanel renders blocking severity as Carbon error', () => {
    render(<AlertPanel severity="blocking" title="Engine offline">Cannot apply</AlertPanel>)
    expect(screen.getByText('Engine offline')).toBeInTheDocument()
    expect(screen.getByText('Cannot apply')).toBeInTheDocument()
  })

  it('AlertPanel renders advisory with action button when actionLabel set', () => {
    const onAction = jest.fn()
    render(
      <AlertPanel severity="advisory" title="Latency above 10ms" actionLabel="Investigate" onActionClick={onAction}>
        Drift detected
      </AlertPanel>,
    )
    screen.getByRole('button', { name: 'Investigate' }).click()
    expect(onAction).toHaveBeenCalled()
  })

  it('CommitPrompt renders only when pendingCount > 0', () => {
    const { container, rerender } = render(<CommitPrompt pendingCount={0} onApply={() => undefined} />)
    expect(container.querySelector('.map2-commit-prompt')).not.toBeInTheDocument()
    rerender(<CommitPrompt pendingCount={3} onApply={() => undefined} />)
    expect(container.querySelector('.map2-commit-prompt')).toBeInTheDocument()
    expect(screen.getByText('3 changes')).toBeInTheDocument()
  })

  it('CommitPrompt apply + discard buttons fire callbacks', () => {
    const onApply = jest.fn()
    const onDiscard = jest.fn()
    render(<CommitPrompt pendingCount={1} onApply={onApply} onDiscard={onDiscard} />)
    screen.getByRole('button', { name: 'Apply' }).click()
    screen.getByRole('button', { name: 'Discard' }).click()
    expect(onApply).toHaveBeenCalled()
    expect(onDiscard).toHaveBeenCalled()
  })

  it('StagedChangesIndicator hides when count is 0', () => {
    const { container, rerender } = render(<StagedChangesIndicator count={0} />)
    expect(container.querySelector('.map2-status-chip')).not.toBeInTheDocument()
    rerender(<StagedChangesIndicator count={2} />)
    expect(container.querySelector('.map2-status-chip')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('LiveStagedToggle calls onChange', () => {
    const onChange = jest.fn()
    render(<LiveStagedToggle view="live" onChange={onChange} />)
    screen.getByRole('tab', { name: /STAGED/ }).click()
    expect(onChange).toHaveBeenCalledWith('staged')
  })

  it('ErrorState renders title, description, and detail', () => {
    render(
      <ErrorState
        title="Build failed"
        description="Vite reported a parse error"
        detail="Unexpected token at line 42"
      />,
    )
    expect(screen.getByText('Build failed')).toBeInTheDocument()
    expect(screen.getByText('Vite reported a parse error')).toBeInTheDocument()
    expect(screen.getByText('Unexpected token at line 42')).toBeInTheDocument()
  })

  it('DrawerPanel renders nothing when closed', () => {
    const { container } = render(
      <DrawerPanel open={false} onClose={() => undefined} title="Inspector">body</DrawerPanel>,
    )
    expect(container.querySelector('.map2-drawer-panel')).not.toBeInTheDocument()
  })

  it('DrawerPanel renders title and body when open', () => {
    render(
      <DrawerPanel open onClose={() => undefined} title="Inspector" eyebrow="DEVICE">
        <span>panel body</span>
      </DrawerPanel>,
    )
    expect(screen.getByText('Inspector')).toBeInTheDocument()
    expect(screen.getByText('DEVICE')).toBeInTheDocument()
    expect(screen.getByText('panel body')).toBeInTheDocument()
  })

  it('DrawerPanel close button fires onClose', () => {
    const onClose = jest.fn()
    render(
      <DrawerPanel open onClose={onClose} title="Inspector">x</DrawerPanel>,
    )
    screen.getByRole('button', { name: 'Close' }).click()
    expect(onClose).toHaveBeenCalled()
  })
})
