import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { DashboardCard } from './DashboardCard'

describe('DashboardCard', () => {
  it('renders a static tile by default', () => {
    render(
      <DashboardCard className="test-card">
        <span>Static content</span>
      </DashboardCard>,
    )

    expect(screen.getByText('Static content').closest('.dashboard-card')).toHaveClass('test-card')
    expect(document.querySelector('.dashboard-card--interactive')).toBeNull()
  })

  it('renders an interactive clickable tile when requested', () => {
    const handleClick = jest.fn()

    render(
      <DashboardCard interactive href="/sequencer" onClick={handleClick}>
        <span>Interactive content</span>
      </DashboardCard>,
    )

    const tile = screen.getByRole('link', { name: 'Interactive content' })
    fireEvent.click(tile)

    expect(tile).toHaveClass('dashboard-card--interactive')
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
