import '@testing-library/jest-dom'
import * as React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { SetupView } from './SetupView'

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    })
  }
})

function renderInRouter() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/sequencer/setup']}>
        <Routes>
          <Route path="/sequencer/setup" element={<SetupView />} />
          <Route
            path="/midi/devices/configurator"
            element={
              <div data-testid="framework-configurator-page">configurator</div>
            }
          />
          <Route
            path="/avb/avdecc/binding-wizard"
            element={
              <div data-testid="avdecc-binding-wizard-page">wizard</div>
            }
          />
          <Route
            path="/maschine/onboarding"
            element={
              <div data-testid="maschine-onboarding-page">onboarding</div>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SetupView — Sequencer Setup tasks', () => {
  it('renders all four onboarding cards', () => {
    renderInRouter()
    expect(screen.getByText('Connect a new keyboard')).toBeInTheDocument()
    expect(screen.getByText('Map a MIDI controller')).toBeInTheDocument()
    expect(screen.getByText('Calibrate Maschine MK1')).toBeInTheDocument()
    expect(screen.getByText('Discover AVDECC devices')).toBeInTheDocument()
  })

  it('marks all four cards Available with their roadmap tags', () => {
    renderInRouter()
    // Connect-keyboard + Map-controller + Discover-AVDECC + Calibrate-MK1 are
    // all Available now (4 cards). T2499-B flipped Calibrate MK1 with the
    // onboarding orchestrator surface (routes + wizard); real-hardware capture
    // stays a bench gate. AVDECC is simulator-driven (T004 hardware gate).
    expect(screen.getAllByText('Available')).toHaveLength(4)
    expect(screen.queryAllByText('Coming soon')).toHaveLength(0)
    expect(screen.getByText('T2499-A')).toBeInTheDocument()
    expect(screen.getByText('T2499-B')).toBeInTheDocument()
    expect(screen.getByText('T2499-C')).toBeInTheDocument()
  })

  it('navigates to the framework Configurator when "Map a MIDI controller" is clicked', () => {
    renderInRouter()
    const tile = screen.getByLabelText('Start setup task: Map a MIDI controller')
    fireEvent.click(tile)
    expect(
      screen.getByTestId('framework-configurator-page'),
    ).toBeInTheDocument()
  })

  it('navigates to the MK1 onboarding wizard when "Calibrate Maschine MK1" is clicked', () => {
    renderInRouter()
    const tile = screen.getByLabelText('Start setup task: Calibrate Maschine MK1')
    fireEvent.click(tile)
    expect(
      screen.getByTestId('maschine-onboarding-page'),
    ).toBeInTheDocument()
  })

  it('navigates to the AVDECC binding wizard when "Discover AVDECC devices" is clicked', () => {
    renderInRouter()
    const tile = screen.getByLabelText('Start setup task: Discover AVDECC devices')
    fireEvent.click(tile)
    expect(
      screen.getByTestId('avdecc-binding-wizard-page'),
    ).toBeInTheDocument()
  })

  it('Connect-keyboard tile still opens the legacy on-page task flow', () => {
    renderInRouter()
    const tile = screen.getByLabelText('Start setup task: Connect a new keyboard')
    fireEvent.click(tile)
    // ConnectKeyboardTask renders something distinct from the catalog
    // header. We verify the catalog header is gone (i.e. the view
    // switched modes).
    expect(screen.queryByText('Operator setup')).toBeNull()
  })
})
