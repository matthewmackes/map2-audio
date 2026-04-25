import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { PedalboardBuildWizard, type ActiveChannelInfo, type RoutingDropdownOption } from './PedalboardBuildWizard'

jest.mock('../../StateAuthority/MorphPad', () => ({
  MorphPad: ({ size }: { size?: number }) => (
    <div data-testid="morph-pad-stub" data-size={size ?? ''} />
  ),
}))

const ROUTING_OPTIONS: RoutingDropdownOption[] = [
  { id: 'series', label: 'Series', description: 'Sequentially process flows.' },
  { id: 'parallel_blend', label: 'Parallel', description: 'Blend flows together.' },
  { id: 'ab_switch', label: 'A/B', description: 'Only one focus flow active.' },
]

const ACTIVE_CHANNEL: ActiveChannelInfo = {
  channelLabel: 'B',
  chainLabel: 'Chain B',
  blockSummary: '1 loaded block',
  blendLabel: '100% blend',
  stateLabel: 'Live',
  stateLive: true,
  muted: false,
  solo: false,
  inputClipActive: false,
  outputClipActive: false,
  clipActive: false,
}

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
    activeChannel: ACTIVE_CHANNEL,
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

  it('opens the routing dropdown and fires onRoutingChange for a different option', () => {
    const onRoutingChange = jest.fn()
    render(<PedalboardBuildWizard {...baseProps({ onRoutingChange })} />)
    const trigger = screen.getByRole('button', { name: /series/i })
    fireEvent.click(trigger)
    const menu = screen.getByRole('listbox', { name: /routing map/i })
    fireEvent.click(within(menu).getByRole('option', { name: /parallel/i }))
    expect(onRoutingChange).toHaveBeenCalledWith('parallel_blend')
  })

  it('mounts the morph pad when showMorphPad is true', () => {
    render(<PedalboardBuildWizard {...baseProps({ showMorphPad: true })} />)
    expect(screen.getByTestId('morph-pad-stub')).toBeInTheDocument()
  })

  it('hides the morph pad when showMorphPad is false', () => {
    render(<PedalboardBuildWizard {...baseProps({ showMorphPad: false })} />)
    expect(screen.queryByTestId('morph-pad-stub')).not.toBeInTheDocument()
  })

  it('passes the active-channel accent color to the channel letter swatch', () => {
    render(<PedalboardBuildWizard {...baseProps({ activeChannel: { ...ACTIVE_CHANNEL, accentColor: '#42be65' } })} />)
    const letter = screen.getByText('B')
    expect(letter.getAttribute('style') ?? '').toContain('--pw-channel-accent: #42be65')
  })

  it('disables the Routing/Devices buttons when their callbacks are absent', () => {
    render(<PedalboardBuildWizard {...baseProps()} />)
    expect(screen.getByRole('button', { name: /^routing$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^devices$/i })).toBeDisabled()
  })

  it('disables Previous on the first reachable stage', () => {
    render(<PedalboardBuildWizard {...baseProps({ pluginCount: 0 })} />)
    // pluginCount 0 forces layout active, no earlier reachable step.
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
  })
})
