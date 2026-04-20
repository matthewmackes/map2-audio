import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { TaskbarClock } from './TaskbarClock'

const mockUseHomePlatformStatus = jest.fn()

jest.mock('../hooks/useHomePlatformStatus', () => ({
  useHomePlatformStatus: () => mockUseHomePlatformStatus(),
}))

jest.mock('@carbon/react', () => {
  const actual = jest.requireActual('@carbon/react')
  return {
    ...actual,
    Popover: ({ children, open }: any) => {
      const childArray = Array.isArray(children) ? children : [children]
      return (
        <div>
          {childArray[0]}
          {open ? childArray[1] : null}
        </div>
      )
    },
    PopoverContent: ({ children, className }: any) => <div className={className}>{children}</div>,
  }
})

describe('TaskbarClock', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-06T13:41:00Z'))
    mockUseHomePlatformStatus.mockReturnValue({
      avb: { label: 'AVB: operational', state: 'ok' },
      avdecc: { label: 'AVDECC: 2 entities', state: 'ok' },
      nodes: { label: 'Nodes: 1 active', state: 'ok' },
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders a 12-hour taskbar clock and opens platform details on click', () => {
    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <TaskbarClock />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: /Open clock details/i })).toHaveTextContent('9:41 AM')
    expect(screen.getByRole('button', { name: /Open clock details/i })).toHaveTextContent('Apr 6')

    fireEvent.click(screen.getByRole('button', { name: /Open clock details/i }))

    expect(screen.getByText('System tray clock')).toBeInTheDocument()
    expect(screen.getByText('Monday, April 6, 2026')).toBeInTheDocument()
    expect(screen.getByText(/Version:/)).toBeInTheDocument()
    expect(screen.getByText('AVB: operational')).toBeInTheDocument()
    expect(screen.getByText('AVDECC: 2 entities')).toBeInTheDocument()
    expect(screen.getByText('Nodes: 1 active')).toBeInTheDocument()
  })
})
