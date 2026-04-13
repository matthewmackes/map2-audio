import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
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

function renderShell(initialEntry = '/outboard-hardware') {
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

describe('OutboardHardwareShell', () => {
  it('lists the overview and all five device entries in the shared shell', () => {
    renderShell()

    expect(screen.getByRole('heading', { name: 'Outboard Hardware', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Overview')).toBeInTheDocument()
    for (const label of ['Tesira AVB', 'Edirol UA-1000', 'HoTone JoGG', 'MPX1 Rack', 'IntelFX Rack']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
    expect(screen.getByText('Dedicated Routes')).toBeInTheDocument()
  })

  it('renders the requested device page from the shared route id', () => {
    renderShell('/outboard-hardware/lexicon-mpx1')

    expect(screen.getByRole('heading', { name: 'MPX1 Rack' })).toBeInTheDocument()
    expect(screen.getByText('Open dedicated route')).toBeInTheDocument()
    expect(screen.getAllByText('/mpx1').length).toBeGreaterThan(0)
  })
})
