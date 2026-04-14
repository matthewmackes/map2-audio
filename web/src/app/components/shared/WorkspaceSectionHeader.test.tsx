import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { WorkspaceSectionHeader } from './WorkspaceSectionHeader'

describe('WorkspaceSectionHeader', () => {
  it('renders the title as the primary heading', () => {
    render(<WorkspaceSectionHeader title="Outboard Hardware" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Outboard Hardware' })).toBeInTheDocument()
  })

  it('renders optional eyebrow, subtitle, and actions when provided', () => {
    render(
      <WorkspaceSectionHeader
        eyebrow="Physical Surfaces"
        title="Ableton Push"
        subtitle="Online and matched"
        actions={<button type="button">Inspect</button>}
      />,
    )

    expect(screen.getByText('Physical Surfaces')).toBeInTheDocument()
    expect(screen.getByText('Online and matched')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inspect' })).toBeInTheDocument()
  })

  it('omits optional regions when eyebrow, subtitle, and actions are absent', () => {
    const { container } = render(<WorkspaceSectionHeader title="Audio Artifacts" />)

    expect(container.querySelector('.workspace-section-header__eyebrow')).toBeNull()
    expect(container.querySelector('.workspace-section-header__actions')).toBeNull()
    expect(container.querySelector('.workspace-section-header p')).toBeNull()
  })
})
