/**
 * T2521-6c — SonoBusGroupsPage tests.
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

const mockUseSonoBusGroups = jest.fn()

jest.mock('./useSonoBusBindings', () => ({
  __esModule: true,
  useSonoBusGroups: () => mockUseSonoBusGroups(),
}))

import { SonoBusGroupsPage } from './SonoBusGroupsPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <SonoBusGroupsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockUseSonoBusGroups.mockReturnValue({ data: [], isLoading: false, isError: false })
})

describe('SonoBusGroupsPage', () => {
  it('renders heading + empty state', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'SonoBus Groups' })).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-groups-empty')).toBeInTheDocument()
  })

  it('renders one card per group', () => {
    mockUseSonoBusGroups.mockReturnValue({
      data: [
        {
          group_id: 'g-A',
          session_label: 'Set A',
          binding_count: 2,
          enabled_binding_count: 2,
          channel_count_total: 6,
        },
      ],
      isLoading: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByTestId('sonobus-group-g-A')).toHaveTextContent('Set A')
    expect(screen.getByTestId('sonobus-group-g-A')).toHaveTextContent('6')
  })

  it('shows error tag', () => {
    mockUseSonoBusGroups.mockReturnValue({ data: undefined, isError: true, isLoading: false })
    renderPage()
    expect(screen.getByText('Groups query failed')).toBeInTheDocument()
  })
})
