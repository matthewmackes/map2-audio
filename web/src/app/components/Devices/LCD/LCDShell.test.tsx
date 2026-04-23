import React from 'react'
import '@testing-library/jest-dom'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen } from '@testing-library/react'

import { LCDShell, LCD_SECTION_IDS } from './LCDShell'

jest.mock('../../../hooks/useDeviceNodeContext', () => ({
  useDeviceNodeContext: () => ({
    deviceState: 'ready',
    currentNode: { nodeId: 'NODE-A', hostname: 'node-a', isOnline: true, role: 'all-in-one' },
    targetNode: null,
    location: { nodeId: 'NODE-A' },
    matches: [],
    issues: [],
    isLoading: false,
    selectedNodeId: 'NODE-A',
  }),
}))

jest.mock('./views/LCDDisplaysView', () => ({
  LCDDisplaysView: () => <div data-testid="lcd-view-displays">displays</div>,
}))
jest.mock('./views/LCDEventsView', () => ({
  LCDEventsView: () => <div data-testid="lcd-view-events">events</div>,
}))
jest.mock('./views/LCDNodesView', () => ({
  LCDNodesView: () => <div data-testid="lcd-view-nodes">nodes</div>,
}))
jest.mock('./views/LCDAlertsView', () => ({
  LCDAlertsView: () => <div data-testid="lcd-view-alerts">alerts</div>,
}))
jest.mock('./views/LCDHardwareView', () => ({
  LCDHardwareView: () => <div data-testid="lcd-view-hardware">hardware</div>,
}))
jest.mock('./views/LCDSettingsView', () => ({
  LCDSettingsView: () => <div data-testid="lcd-view-settings">settings</div>,
}))
jest.mock('./views/LCDPresetsView', () => ({
  LCDPresetsView: () => <div data-testid="lcd-view-presets">presets</div>,
}))
jest.mock('./views/LCDSnapshotsView', () => ({
  LCDSnapshotsView: () => <div data-testid="lcd-view-snapshots">snapshots</div>,
}))

import { LCDDisplaysView } from './views/LCDDisplaysView'
import { LCDEventsView } from './views/LCDEventsView'
import { LCDNodesView } from './views/LCDNodesView'
import { LCDAlertsView } from './views/LCDAlertsView'
import { LCDHardwareView } from './views/LCDHardwareView'
import { LCDSettingsView } from './views/LCDSettingsView'
import { LCDPresetsView } from './views/LCDPresetsView'
import { LCDSnapshotsView } from './views/LCDSnapshotsView'
import { Navigate } from 'react-router-dom'

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="/devices/lcd/*" element={<LCDShell />}>
          <Route index element={<Navigate to="displays" replace />} />
          <Route path="displays" element={<LCDDisplaysView />} />
          <Route path="events" element={<LCDEventsView />} />
          <Route path="nodes" element={<LCDNodesView />} />
          <Route path="alerts" element={<LCDAlertsView />} />
          <Route path="hardware" element={<LCDHardwareView />} />
          <Route path="settings" element={<LCDSettingsView />} />
          <Route path="presets" element={<LCDPresetsView />} />
          <Route path="snapshots" element={<LCDSnapshotsView />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('LCDShell (T2430-A)', () => {
  it('exports 8 canonical section ids in stable order', () => {
    expect(LCD_SECTION_IDS).toEqual([
      'displays',
      'events',
      'nodes',
      'alerts',
      'hardware',
      'settings',
      'presets',
      'snapshots',
    ])
  })

  it('redirects /devices/lcd (index) to /devices/lcd/displays', () => {
    renderAt('/devices/lcd')
    expect(screen.getByTestId('lcd-view-displays')).toBeInTheDocument()
  })

  it.each(LCD_SECTION_IDS)('renders the %s sub-view at its canonical path', (section) => {
    renderAt(`/devices/lcd/${section}`)
    expect(screen.getByTestId(`lcd-view-${section}`)).toBeInTheDocument()
  })
})
