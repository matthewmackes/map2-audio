import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
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

function renderDevice(initialEntry: string) {
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

describe('OutboardHardwareDevicePage', () => {
  it('renders the dedicated route CTA for a known device', () => {
    renderDevice('/outboard-hardware/eventide-intelfx')

    expect(screen.getByRole('heading', { name: 'IntelFX Rack' })).toBeInTheDocument()
    expect(screen.getByText('Identity and routing metadata')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open dedicated route' }))
    expect(screen.getByText('IntelFX route')).toBeInTheDocument()
  })

  it('renders a not-found state for unknown device ids', () => {
    renderDevice('/outboard-hardware/unknown-unit')

    expect(screen.getByRole('heading', { name: 'Outboard Hardware Unit Not Found' })).toBeInTheDocument()
    expect(screen.getByText('Back to overview')).toBeInTheDocument()
  })
})
