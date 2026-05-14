/**
 * T2521-6d — SonoBusServicesTabs tests.
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

import { SonoBusServicesTabs } from './SonoBusServicesTabs'

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SonoBusServicesTabs />
    </MemoryRouter>,
  )
}

describe('SonoBusServicesTabs', () => {
  it('renders all six tabs', () => {
    renderAt('/sonobus')
    expect(screen.getByTestId('sonobus-tab-overview')).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-tab-connections')).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-tab-peers')).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-tab-groups')).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-tab-network')).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-tab-diagnostics')).toBeInTheDocument()
  })

  it('marks the overview tab active when path is exactly /sonobus', () => {
    renderAt('/sonobus')
    expect(screen.getByTestId('sonobus-tab-overview')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('sonobus-tab-peers')).not.toHaveAttribute('aria-current')
  })

  it('does not mark overview active when on a child path', () => {
    renderAt('/sonobus/peers')
    expect(screen.getByTestId('sonobus-tab-overview')).not.toHaveAttribute('aria-current')
    expect(screen.getByTestId('sonobus-tab-peers')).toHaveAttribute('aria-current', 'page')
  })

  it('marks diagnostics active on /sonobus/diagnostics', () => {
    renderAt('/sonobus/diagnostics')
    expect(screen.getByTestId('sonobus-tab-diagnostics')).toHaveAttribute('aria-current', 'page')
  })
})
