import React from 'react'
import { render, screen } from '@testing-library/react'
import { PageHeader } from './PageHeader'

describe('PageHeader branding', () => {
  it('renders the default MAP2 brand lockup when no custom logo is provided', () => {
    const { container } = render(<PageHeader title="Overview" subtitle="System summary" />)

    expect(screen.getByText('Overview')).toBeTruthy()
    expect(screen.getByText(/Mackes Audio Platform/i)).toBeTruthy()
    expect(container.querySelector('.page-header__brand')).toBeTruthy()
  })

  it('hides the default MAP2 brand lockup when a custom page logo is provided', () => {
    const { container } = render(
      <PageHeader
        title="DSP"
        logo={{
          url: '/dsp-logo.png',
          alt: 'DSP logo',
        }}
      />,
    )

    expect(screen.getByAltText('DSP logo')).toBeTruthy()
    expect(container.querySelector('.page-header__brand')).toBeNull()
  })
})
