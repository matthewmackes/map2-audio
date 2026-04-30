import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { PedalboardBuildWizard } from './PedalboardBuildWizard'

function baseProps(overrides: Partial<React.ComponentProps<typeof PedalboardBuildWizard>> = {}) {
  return {
    snapshotTitle: 'Rig20260425',
    engineSyncTone: 'desync' as const,
    engineSyncLabel: 'Engine desync',
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
    // Snapshot name appears twice (hero title + sub-bar) — assert presence rather than uniqueness.
    expect(screen.getAllByText('Rig20260425').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Engine desync')).toBeInTheDocument()
    expect(screen.getByText('3 of 3 channels active')).toBeInTheDocument()
    expect(screen.getByText('3 chains')).toBeInTheDocument()
  })

  it('renders a quick-action sub-bar (snapshot name + History + Publish + New snapshot) in place of the removed build stepper', () => {
    const { container } = render(<PedalboardBuildWizard {...baseProps()} />)
    const subBar = container.querySelector('.pedalboard-wizard__sub-bar')
    expect(subBar).not.toBeNull()
    expect(subBar?.textContent).toContain('Rig20260425')
    expect(within(subBar as HTMLElement).getByRole('button', { name: /history/i })).toBeInTheDocument()
    expect(within(subBar as HTMLElement).getByRole('button', { name: /publish to live/i })).toBeInTheDocument()
    expect(within(subBar as HTMLElement).getByRole('button', { name: /new snapshot/i })).toBeInTheDocument()
    expect(container.querySelector('.pedalboard-wizard__stepper')).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByRole('button', { name: /^continue$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^previous$/i })).toBeNull()
  })
})
