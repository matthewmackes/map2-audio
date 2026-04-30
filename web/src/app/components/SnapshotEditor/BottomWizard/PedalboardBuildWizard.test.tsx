import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { PedalboardBuildWizard, type RoutingDropdownOption } from './PedalboardBuildWizard'

const ROUTING_OPTIONS: RoutingDropdownOption[] = [
  { id: 'series', label: 'Series', description: 'Sequentially process flows.' },
  { id: 'parallel_blend', label: 'Parallel', description: 'Blend flows together.' },
  { id: 'ab_switch', label: 'A/B', description: 'Only one focus flow active.' },
]

function baseProps(overrides: Partial<React.ComponentProps<typeof PedalboardBuildWizard>> = {}) {
  return {
    hasSnapshot: true,
    pluginCount: 1,
    hasSelectedBlock: false,
    hasUnsavedChanges: false,
    hasLiveSnapshot: true,
    automationActive: false,
    snapshotTitle: 'Rig20260425',
    engineSyncTone: 'desync' as const,
    engineSyncLabel: 'Engine desync',
    routingOptions: ROUTING_OPTIONS,
    routingValue: 'series',
    chainCount: 3,
    activeChannelCount: 3,
    channelCount: 3,
    onCreateSnapshot: jest.fn(),
    ...overrides,
  }
}

describe('PedalboardBuildWizard', () => {
  it('renders the snapshot title, engine-sync chip, and channel summary', () => {
    render(<PedalboardBuildWizard {...baseProps()} />)
    expect(screen.getByText('Rig20260425')).toBeInTheDocument()
    expect(screen.getByText('Engine desync')).toBeInTheDocument()
    expect(screen.getByText('3 of 3 channels active')).toBeInTheDocument()
    expect(screen.getByText('3 chains')).toBeInTheDocument()
  })

  it('marks the recommended stage active and surfaces its detail copy', () => {
    render(<PedalboardBuildWizard {...baseProps({ hasSelectedBlock: false })} />)
    // useBuildStageMachine recommends "wire" when layout is ready and no block selected.
    const wireStep = screen.getByRole('tab', { name: /wire/i })
    expect(wireStep).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/Choose a block, then open its parameters panel/i)).toBeInTheDocument()
  })

  it('clicking a step button activates that step', () => {
    render(<PedalboardBuildWizard {...baseProps()} />)
    const saveStep = screen.getByRole('tab', { name: /save/i })
    fireEvent.click(saveStep)
    expect(saveStep).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/Snapshot the current rig state as a draft/i)).toBeInTheDocument()
  })

  it('disables Previous on the first reachable stage', () => {
    render(<PedalboardBuildWizard {...baseProps({ pluginCount: 0 })} />)
    // pluginCount 0 forces layout active, no earlier reachable step.
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
  })
})
