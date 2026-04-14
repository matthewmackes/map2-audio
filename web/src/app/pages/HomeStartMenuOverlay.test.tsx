import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

jest.mock('../components/NodeNav/NodeNavBar', () => ({
  NodeNavBar: () => <div>NodeNavBar</div>,
}))

jest.mock('../components/LatencyPressureShellReadout', () => ({
  LatencyPressureShellReadout: () => <div>LatencyPressure</div>,
}))

jest.mock('../components/TaskbarClock', () => ({
  TaskbarClock: () => <div>TaskbarClock</div>,
}))

jest.mock('../layout/PushConfirmationNoticePill', () => ({
  PushConfirmationNoticePill: () => <div>PushConfirmation</div>,
}))

jest.mock('../layout/useLauncherInterfaceSummary', () => ({
  useLauncherInterfaceSummary: () => ({
    isLoading: false,
    audioInterfaces: ['UA-1000'],
    midiInterfaces: ['Push 1'],
  }),
}))

jest.mock('../hooks/useHomePlatformStatus', () => ({
  useHomePlatformStatus: () => ({
    avb: { label: 'AVB ready' },
    avdecc: { label: 'AVDECC ready' },
    nodes: { label: '1 node online' },
  }),
}))

jest.mock('../hooks/useHostMachine', () => ({
  useHostMachineInfo: () => ({
    data: {
      os_version: 'Fedora',
      hostname: 'map2-host',
    },
  }),
}))

jest.mock('../hooks/usePushConfirmation', () => ({
  usePushConfirmation: () => ({
    data: {
      pending_confirmation: null,
    },
  }),
}))

jest.mock('./homeDesktopSession', () => ({
  reloadHomeDesktopShell: jest.fn(),
  returnHomeDesktopToBoot: jest.fn(),
}))

jest.mock('../layout/shellEvents', () => ({
  dispatchShellOpenRestartConfirmEvent: jest.fn(),
}))

const { HomeStartMenuOverlay } =
  jest.requireActual('./HomeStartMenuOverlay') as typeof import('./HomeStartMenuOverlay')

describe('HomeStartMenuOverlay', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    })
  })

  it('shows the canonical tall-strip launcher set and removes legacy workspace/device entries', () => {
    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <HomeStartMenuOverlay open onClose={jest.fn()} />
      </MemoryRouter>,
    )

    for (const label of ['Device(s) Manager', 'Snapshot Editor', 'Advanced MIDI', 'Brain', 'Drum-Machine', 'SynthForge']) {
      expect(screen.getByText(label, { selector: '.start-menu-strip-item__label' })).toBeInTheDocument()
    }

    for (const label of ['Outboard Hardware', 'Tesira AVB', 'Edirol UA-1000', 'HoTone JoGG', 'MPX1 Rack', 'IntelFX Rack', 'Stage Mode', 'Workspaces']) {
      expect(screen.queryByRole('menuitem', { name: new RegExp(label, 'i') })).not.toBeInTheDocument()
    }
  })
})
