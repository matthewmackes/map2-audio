import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { ContentKicker } from './ContentKicker'

describe('ContentKicker host breadcrumb root', () => {
  beforeEach(() => {
    ;(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
    })
  })

  it('renders an emphasized host breadcrumb and filters host choices before selection', () => {
    const handleSelect = jest.fn()

    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <ContentKicker
          title="Overview"
          crumbs={[{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms' }, { label: 'Overview' }]}
          hostRoot={{
            label: 'map2-host',
            options: [
              {
                nodeId: 'node-local',
                label: 'map2-host',
                secondaryLabel: 'Studio',
                statusLabel: 'OK',
                statusTone: 'ok',
                isActive: true,
              },
              {
                nodeId: 'node-remote',
                label: 'stage-rack',
                secondaryLabel: 'Stage',
                statusLabel: 'WARN',
                statusTone: 'warn',
                isActive: false,
              },
            ],
            onSelect: handleSelect,
          }}
        />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /current host map2-host/i }))

    const filterInput = screen.getByRole('searchbox', { name: /filter hosts/i })
    fireEvent.change(filterInput, { target: { value: 'stage' } })

    expect(screen.getByRole('button', { name: /stage-rack/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /stage-rack/i }))
    expect(handleSelect).toHaveBeenCalledWith('node-remote')
  })
})
