import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

jest.mock('../theme', () => ({
  useTheme: () => ({
    theme: { carbonTheme: 'g100' },
    themeId: 'default',
    setTheme: jest.fn(),
    themes: {},
  }),
}))

const { OutboardHardwareShell } =
  jest.requireActual('./OutboardHardwareShell') as typeof import('./OutboardHardwareShell')
const { OutboardHardwareOverviewPage } =
  jest.requireActual('./OutboardHardwareOverviewPage') as typeof import('./OutboardHardwareOverviewPage')
const { OutboardHardwareDevicePage } =
  jest.requireActual('./OutboardHardwareDevicePage') as typeof import('./OutboardHardwareDevicePage')

function renderOverview(initialEntry = '/outboard-hardware') {
  return render(
    <MemoryRouter
      initialEntries={[initialEntry]}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="/outboard-hardware/*" element={<OutboardHardwareShell />}>
          <Route index element={<OutboardHardwareOverviewPage />} />
          <Route path=":deviceId" element={<OutboardHardwareDevicePage />} />
        </Route>
        <Route path="/tesira" element={<div>Tesira route</div>} />
        <Route path="/edirol-ua1000" element={<div>Edirol route</div>} />
        <Route path="/hotone-jogg" element={<div>HoTone route</div>} />
        <Route path="/mpx1/*" element={<div>MPX1 route</div>} />
        <Route path="/intelfx/*" element={<div>IntelFX route</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('OutboardHardwareOverviewPage', () => {
  it('shows the grouped hardware counts on the overview page', () => {
    renderOverview()

    expect(screen.getByText('Total devices')).toBeInTheDocument()
    expect(screen.getAllByText('AVB DSP Mixer').length).toBeGreaterThan(0)
    expect(screen.getAllByText('USB Audio Interface').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Multi-FX Processor').length).toBeGreaterThan(0)
    expect(screen.getByText('5 devices')).toBeInTheDocument()
  })

  it('opens the workspace detail page from a device card', () => {
    renderOverview()

    const tesiraCard = screen.getByRole('heading', { name: 'Tesira AVB', level: 2 }).closest('.cds--tile')
    expect(tesiraCard).not.toBeNull()
    fireEvent.click(within(tesiraCard as HTMLElement).getByRole('button', { name: 'Open in workspace' }))
    expect(screen.getByRole('heading', { name: 'Tesira AVB' })).toBeInTheDocument()
  })

  it('opens the dedicated route from a device card', () => {
    renderOverview()
    const mpx1Card = screen.getByRole('heading', { name: 'MPX1 Rack', level: 2 }).closest('.cds--tile')
    expect(mpx1Card).not.toBeNull()
    fireEvent.click(within(mpx1Card as HTMLElement).getByRole('button', { name: 'Open dedicated route' }))
    expect(screen.getByText('MPX1 route')).toBeInTheDocument()
  })
})
