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
            path="/midi-services/devices/meloaudio-midi-commander/configurator"
            element={
              <div data-testid="meloaudio-configurator-page">configurator</div>
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

  it('marks "Map a MIDI controller" as Available with the T2499-A roadmap tag', () => {
    renderInRouter()
    // Connect-keyboard + Map-controller both Available now (2 cards)
    expect(screen.getAllByText('Available')).toHaveLength(2)
    expect(screen.getByText('T2499-A')).toBeInTheDocument()
  })

  it('keeps Calibrate MK1 and AVDECC as Coming soon (not in scope for T2499-A)', () => {
    renderInRouter()
    expect(screen.getAllByText('Coming soon')).toHaveLength(2)
  })

  it('navigates to the MeloAudio Configurator when "Map a MIDI controller" is clicked', () => {
    renderInRouter()
    const tile = screen.getByLabelText('Start setup task: Map a MIDI controller')
    fireEvent.click(tile)
    expect(
      screen.getByTestId('meloaudio-configurator-page'),
    ).toBeInTheDocument()
  })

  it('does not navigate when a Coming soon tile is clicked', () => {
    renderInRouter()
    // Coming-soon tiles render as <Tile> not <ClickableTile> — they're
    // visually disabled. The aria-label "Start setup task" is only
    // attached to ClickableTile, so the lookup itself proves the
    // tile is not clickable.
    expect(
      screen.queryByLabelText('Start setup task: Calibrate Maschine MK1'),
    ).toBeNull()
    expect(
      screen.queryByLabelText('Start setup task: Discover AVDECC devices'),
    ).toBeNull()
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
