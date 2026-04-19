import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { LatencyPressureShellReadout } from './LatencyPressureShellReadout'

const mockUseNodePageContext = jest.fn()
const mockUseLatencyPressure = jest.fn()

jest.mock('../hooks/useNodePageContext', () => ({
  useNodePageContext: (...args: unknown[]) => mockUseNodePageContext(...args),
}))

jest.mock('../hooks/useLatencyPressure', () => ({
  useLatencyPressure: (...args: unknown[]) => mockUseLatencyPressure(...args),
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

describe('LatencyPressureShellReadout', () => {
  beforeEach(() => {
    mockUseNodePageContext.mockReset()
    mockUseLatencyPressure.mockReset()
    mockUseNodePageContext.mockReturnValue({
      viewedNode: { node_id: 'node-local', hostname: 'local-rack', is_local: true },
    })
    mockUseLatencyPressure.mockReturnValue({
      isAvailable: true,
      scoreDisplay: '04',
      tone: 'blue',
      status: 'stable',
      toneColor: '#78a9ff',
      helperText: 'Score 04/10 · RTL p95 6.20 ms',
    })
  })

  it('renders the shared score in the stable blue band', () => {
    const { container, getByTestId } = render(
      <MemoryRouter
        initialEntries={['/']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <LatencyPressureShellReadout />
      </MemoryRouter>,
    )

    expect(getByTestId('shell-latency-pressure-readout')).toHaveClass('topbar-pro__latency-pressure--stable')
    expect(container.querySelector('.segmented-led')?.getAttribute('aria-label')).toBe('04')
  })

  it('switches the shell display into the red critical band at score 03', () => {
    mockUseLatencyPressure.mockReturnValue({
      isAvailable: true,
      scoreDisplay: '03',
      tone: 'red',
      status: 'critical',
      toneColor: '#fa4d56',
      helperText: 'Score 03/10 · RTL p95 9.80 ms',
    })

    const { container, getByTestId } = render(
      <MemoryRouter
        initialEntries={['/platform?panel=audio-engine']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <LatencyPressureShellReadout />
      </MemoryRouter>,
    )

    expect(getByTestId('shell-latency-pressure-readout')).toHaveClass('topbar-pro__latency-pressure--critical')
    expect(container.querySelector('.segmented-led')?.getAttribute('aria-label')).toBe('03')
  })

  it('switches the shell display into the warning band for watch-state pressure', () => {
    mockUseLatencyPressure.mockReturnValue({
      isAvailable: true,
      scoreDisplay: '06',
      tone: 'blue',
      status: 'watch',
      toneColor: '#78a9ff',
      helperText: 'Score 06/10 · Callback 63% of budget',
    })

    const { container, getByTestId } = render(
      <MemoryRouter
        initialEntries={['/platforms/audio-engine']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <LatencyPressureShellReadout />
      </MemoryRouter>,
    )

    expect(getByTestId('shell-latency-pressure-readout')).toHaveClass('topbar-pro__latency-pressure--warning')
    expect(container.querySelector('.segmented-led')?.getAttribute('aria-label')).toBe('06')
  })

  it('opens a detail popover when the tray readout is clicked', () => {
    render(
      <MemoryRouter
        initialEntries={['/platforms/audio-engine']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <LatencyPressureShellReadout />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByTestId('shell-latency-pressure-readout'))

    expect(screen.getByText('Latency pressure')).toBeInTheDocument()
    expect(screen.getByText('Score 04/10')).toBeInTheDocument()
    expect(screen.getByText('Scoped to local-rack')).toBeInTheDocument()
  })
})
