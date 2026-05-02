/**
 * T2482 loop 13 / iter 129 — smoke tests for the 5 region sibling pages.
 *
 * Per the iter-121 plan D3: smoke tests only. Each test:
 *   1. mocks every panel component the page imports
 *   2. renders the page
 *   3. asserts the right panels appear and the heading is present
 *
 * Real interactive coverage (panel internals, mutation flows) lives
 * with each panel's own test file; the sibling page tests just confirm
 * the iter-121 D1/D2 wiring decisions hold.
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import React from 'react'

// ---------- Panel mocks (per the iter-101 D1 wrap-not-rewrite pattern) ----------

jest.mock('../../components/MidiHub/MidiHubHelpPrimitives', () => ({
  __esModule: true,
  MidiHubPanelShell: ({ children, panelId, title }: { children: React.ReactNode; panelId: string; title?: string }) => (
    <section data-testid={`panel-shell-${panelId}`} data-title={title ?? ''}>{children}</section>
  ),
}))

jest.mock('../../components/MidiHub/MidiNetworkPanel', () => ({
  MidiNetworkPanel: () => <div data-testid="midi-network-panel" />,
}))
jest.mock('../../components/MidiHub/Midi2Panel', () => ({
  Midi2Panel: () => <div data-testid="midi2-panel" />,
}))
jest.mock('../../components/MidiHub/TesiraPanel', () => ({
  TesiraPanel: () => <div data-testid="tesira-panel" />,
}))
jest.mock('../../components/MidiHub/VirtualGpioPanel', () => ({
  VirtualGpioPanel: () => <div data-testid="virtual-gpio-panel" />,
}))
jest.mock('../../components/MidiHub/StringInterfacePanel', () => ({
  StringInterfacePanel: () => <div data-testid="string-interface-panel" />,
}))

jest.mock('../../components/MidiHub/MidiClockPanel', () => ({
  MidiClockPanel: () => <div data-testid="midi-clock-panel" />,
}))
jest.mock('../../components/MidiHub/MidiHubPresetManager', () => ({
  MidiHubPresetManager: () => <div data-testid="midi-hub-preset-manager" />,
}))
jest.mock('../../components/MidiHub/MidiRecorderPanel', () => ({
  MidiRecorderPanel: () => <div data-testid="midi-recorder-panel" />,
}))

jest.mock('../../components/MidiHub/EventListManager', () => ({
  EventListManager: () => <div data-testid="event-list-manager" />,
}))
jest.mock('../../components/MidiHub/EventListStatus', () => ({
  EventListStatus: () => <div data-testid="event-list-status" />,
}))
jest.mock('../../components/MidiHub/LearnModeControl', () => ({
  LearnModeControl: () => <div data-testid="learn-mode-control" />,
}))
jest.mock('../../components/MidiHub/MscCommandBuilder', () => ({
  MscCommandBuilder: () => <div data-testid="msc-command-builder" />,
}))
jest.mock('../../components/MidiHub/EventEditor', () => ({
  EventEditor: () => <div data-testid="event-editor" />,
}))

jest.mock('../../components/MidiHub/MidiHubFilterPlanner', () => ({
  MidiHubFilterPlanner: () => <div data-testid="filter-planner" />,
}))
jest.mock('../../components/MidiHub/MidiHubMessageMapper', () => ({
  MidiHubMessageMapper: () => <div data-testid="message-mapper" />,
}))
jest.mock('../../components/MidiHub/MidiScriptEditor', () => ({
  MidiScriptEditor: () => <div data-testid="script-editor" />,
}))
jest.mock('../../components/MidiHub/MidiMacroPanel', () => ({
  MidiMacroPanel: () => <div data-testid="macro-panel" />,
}))
jest.mock('../../components/MidiHub/MidiSchedulerPanel', () => ({
  MidiSchedulerPanel: () => <div data-testid="scheduler-panel" />,
}))

jest.mock('../../components/MidiHub/AiLearnPanel', () => ({
  AiLearnPanel: () => <div data-testid="ai-learn-panel" />,
}))
jest.mock('../../components/MidiHub/MeshNetworkPanel', () => ({
  MeshNetworkPanel: () => <div data-testid="mesh-network-panel" />,
}))
jest.mock('../../components/MidiHub/DeviceShadowPanel', () => ({
  DeviceShadowPanel: () => <div data-testid="device-shadow-panel" />,
}))

// ---------- Imports under test ----------

import { MidiServicesNetworkPage } from './MidiServicesNetworkPage'
import { MidiServicesPresetsPage } from './MidiServicesPresetsPage'
import { MidiServicesEventsPage } from './MidiServicesEventsPage'
import { MidiServicesProcessingPage } from './MidiServicesProcessingPage'
import { MidiServicesLabPage } from './MidiServicesLabPage'
import { MidiServicesTransportPage } from './MidiServicesTransportPage'

describe('MidiServicesNetworkPage', () => {
  it('mounts the 5 network panels', () => {
    render(<MidiServicesNetworkPage />)
    expect(screen.getByTestId('midi-network-panel')).toBeInTheDocument()
    expect(screen.getByTestId('midi2-panel')).toBeInTheDocument()
    expect(screen.getByTestId('tesira-panel')).toBeInTheDocument()
    expect(screen.getByTestId('virtual-gpio-panel')).toBeInTheDocument()
    expect(screen.getByTestId('string-interface-panel')).toBeInTheDocument()
  })

  it('renders a Network heading', () => {
    render(<MidiServicesNetworkPage />)
    expect(screen.getByText('Network')).toBeInTheDocument()
  })
})

describe('MidiServicesPresetsPage', () => {
  it('mounts the 3 presets panels', () => {
    render(<MidiServicesPresetsPage />)
    expect(screen.getByTestId('midi-hub-preset-manager')).toBeInTheDocument()
    expect(screen.getByTestId('midi-clock-panel')).toBeInTheDocument()
    expect(screen.getByTestId('midi-recorder-panel')).toBeInTheDocument()
  })

  it('renders a Presets heading', () => {
    render(<MidiServicesPresetsPage />)
    expect(screen.getByText('Presets')).toBeInTheDocument()
  })
})

describe('MidiServicesEventsPage', () => {
  it('mounts the 5 events panels', () => {
    render(<MidiServicesEventsPage />)
    expect(screen.getByTestId('event-list-manager')).toBeInTheDocument()
    expect(screen.getByTestId('event-list-status')).toBeInTheDocument()
    expect(screen.getByTestId('learn-mode-control')).toBeInTheDocument()
    expect(screen.getByTestId('msc-command-builder')).toBeInTheDocument()
    expect(screen.getByTestId('event-editor')).toBeInTheDocument()
  })

  it('renders an Events heading', () => {
    render(<MidiServicesEventsPage />)
    expect(screen.getByText('Events')).toBeInTheDocument()
  })
})

describe('MidiServicesProcessingPage', () => {
  it('mounts the 5 processing panels', () => {
    render(<MidiServicesProcessingPage />)
    expect(screen.getByTestId('filter-planner')).toBeInTheDocument()
    expect(screen.getByTestId('message-mapper')).toBeInTheDocument()
    expect(screen.getByTestId('script-editor')).toBeInTheDocument()
    expect(screen.getByTestId('macro-panel')).toBeInTheDocument()
    expect(screen.getByTestId('scheduler-panel')).toBeInTheDocument()
  })

  it('renders a Processing heading', () => {
    render(<MidiServicesProcessingPage />)
    expect(screen.getByText('Processing')).toBeInTheDocument()
  })
})

describe('MidiServicesLabPage', () => {
  it('mounts the 3 lab panels', () => {
    render(<MidiServicesLabPage />)
    expect(screen.getByTestId('ai-learn-panel')).toBeInTheDocument()
    expect(screen.getByTestId('mesh-network-panel')).toBeInTheDocument()
    expect(screen.getByTestId('device-shadow-panel')).toBeInTheDocument()
  })

  it('renders a Lab heading', () => {
    render(<MidiServicesLabPage />)
    expect(screen.getByText('Lab')).toBeInTheDocument()
  })
})

describe('MidiServicesTransportPage', () => {
  it('mounts the 2 transport panels', () => {
    render(<MidiServicesTransportPage />)
    expect(screen.getByTestId('midi-clock-panel')).toBeInTheDocument()
    expect(screen.getByTestId('midi-recorder-panel')).toBeInTheDocument()
  })

  it('renders a Transport heading', () => {
    render(<MidiServicesTransportPage />)
    expect(screen.getByText('Transport')).toBeInTheDocument()
  })
})
