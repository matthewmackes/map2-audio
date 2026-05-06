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

  it('splits actions: hero owns group scope (Open snapshots + New snapshot), sub-bar owns snapshot scope (History + Publish to live)', () => {
    const { container } = render(<PedalboardBuildWizard {...baseProps()} />)
    const heroButtons = container.querySelector('.pedalboard-wizard__hero-buttons')
    const subBar = container.querySelector('.pedalboard-wizard__sub-bar')
    expect(heroButtons).not.toBeNull()
    expect(subBar).not.toBeNull()

    expect(within(heroButtons as HTMLElement).getByRole('button', { name: /open snapshots/i })).toBeInTheDocument()
    expect(within(heroButtons as HTMLElement).getByRole('button', { name: /new snapshot/i })).toBeInTheDocument()
    expect(within(heroButtons as HTMLElement).queryByRole('button', { name: /publish to live/i })).toBeNull()

    expect(subBar?.textContent).toContain('Rig20260425')
    expect(within(subBar as HTMLElement).getByRole('button', { name: /history/i })).toBeInTheDocument()
    expect(within(subBar as HTMLElement).getByRole('button', { name: /publish to live/i })).toBeInTheDocument()
    expect(within(subBar as HTMLElement).queryByRole('button', { name: /new snapshot/i })).toBeNull()

    expect(container.querySelector('.pedalboard-wizard__stepper')).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByRole('button', { name: /^continue$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^previous$/i })).toBeNull()
  })
})
