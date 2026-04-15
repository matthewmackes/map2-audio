import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { WorkspacePageTemplate } from './WorkspacePageTemplate'

describe('WorkspacePageTemplate', () => {
  it('collapses to a single content column when no sidebar is provided', () => {
    const { container } = render(
      <WorkspacePageTemplate
        sidebar={undefined}
        content={<div>Primary content</div>}
      />,
    )

    const template = container.querySelector('.workspace-page-template')
    const window = container.querySelector('.workspace-page-template__window')
    expect(template).toHaveClass('workspace-page-template--content-only')
    expect(window).toHaveClass('workspace-page-template__window')
    expect(window).toHaveClass('workspace-page-template__window--content-only')
    expect(window).not.toHaveClass('workspace-page-template__window--with-sidebar')
    expect(screen.getByText('Primary content')).toBeInTheDocument()
    expect(container.querySelector('.workspace-page-template__sidebar')).not.toBeInTheDocument()
  })

  it('renders the sidebar column when one is provided', () => {
    const { container } = render(
      <WorkspacePageTemplate
        sidebar={<nav>Sidebar nav</nav>}
        content={<div>Primary content</div>}
      />,
    )

    const window = container.querySelector('.workspace-page-template__window')
    expect(window).toHaveClass('workspace-page-template__window--with-sidebar')
    expect(container.querySelector('.workspace-page-template__sidebar')).toBeInTheDocument()
    expect(screen.getByText('Sidebar nav')).toBeInTheDocument()
  })
})
