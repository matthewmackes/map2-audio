import type { ReactNode } from 'react'
import { Layer, Tag } from '@carbon/react'

export type MidiHubPanelId =
  | 'routing'
  | 'presets'
  | 'network'
  | 'filters'
  | 'mapper'
  | 'scripts'
  | 'macros'
  | 'scheduler'
  | 'clock'
  | 'recorder'
  | 'traffic'
  | 'midi2'
  | 'innovation'

type MidiHubPanelMeta = {
  title: string
  family: string
  shortLabel: string
  summary: string
  advanced?: boolean
}

export const MIDI_HUB_PANEL_META: Record<MidiHubPanelId, MidiHubPanelMeta> = {
  routing: {
    title: 'Routing Workspace',
    family: 'Route & Transform',
    shortLabel: 'Route core',
    summary: 'Establish the live path and inspect the active topology.',
  },
  presets: {
    title: 'Preset Publishing',
    family: 'Automation & Management',
    shortLabel: 'Recall store',
    summary: 'Capture, compare, and publish stable working states.',
  },
  network: {
    title: 'Network MIDI & OSC',
    family: 'Discover & Connect',
    shortLabel: 'Network bridge',
    summary: 'Manage RTP, UDP, and OSC session edges.',
  },
  filters: {
    title: 'Filtering Strategy',
    family: 'Route & Transform',
    shortLabel: 'Message filter',
    summary: 'Constrain traffic by channel, family, source, and port.',
  },
  mapper: {
    title: 'Mapper & Transformation Blueprint',
    family: 'Route & Transform',
    shortLabel: 'Transform lane',
    summary: 'Stage source-to-target message conversion contracts.',
  },
  scripts: {
    title: 'Script Engine',
    family: 'Automation & Management',
    shortLabel: 'Script hooks',
    summary: 'Run event-driven custom logic with explicit control.',
    advanced: true,
  },
  macros: {
    title: 'Macro Sequencing',
    family: 'Automation & Management',
    shortLabel: 'Macro scenes',
    summary: 'Bundle repeatable cross-device actions into one trigger.',
  },
  scheduler: {
    title: 'Scheduled Actions',
    family: 'Automation & Management',
    shortLabel: 'Scheduled events',
    summary: 'Queue delayed or timed MIDI actions deterministically.',
    advanced: true,
  },
  clock: {
    title: 'Clock & Sync',
    family: 'Sync & Diagnostics',
    shortLabel: 'Clock master',
    summary: 'Choose the timing owner and validate transport stability.',
  },
  recorder: {
    title: 'Capture & Replay',
    family: 'Sync & Diagnostics',
    shortLabel: 'Capture replay',
    summary: 'Record and replay traffic for evidence and regression checks.',
  },
  traffic: {
    title: 'Traffic Monitor',
    family: 'Sync & Diagnostics',
    shortLabel: 'Message trace',
    summary: 'Inspect live flow and isolate ingress, route, or destination faults.',
  },
  midi2: {
    title: 'MIDI 2.0 Workspace',
    family: 'MIDI 2.0 & Labs',
    shortLabel: 'UMP status',
    summary: 'Check UMP posture, translation, and capability readiness.',
  },
  innovation: {
    title: 'Innovation Surface',
    family: 'MIDI 2.0 & Labs',
    shortLabel: 'Lab surfaces',
    summary: 'Exercise future-facing control and translation experiments.',
    advanced: true,
  },
}

interface MidiHubPanelShellProps {
  panelId: MidiHubPanelId
  children: ReactNode
}

export function MidiHubPanelShell({ panelId, children }: MidiHubPanelShellProps) {
  const panel = MIDI_HUB_PANEL_META[panelId]

  return (
    <Layer className="midi-hub-panel-shell" id={`midi-hub-panel-${panelId}`}>
      <header className="midi-hub-panel-shell__header">
        <div className="midi-hub-panel-shell__copy">
          <div className="midi-hub-panel-shell__meta-row">
            <Tag type="cool-gray">{panel.family}</Tag>
            <Tag type="blue">{panel.shortLabel}</Tag>
            {panel.advanced ? <Tag type="warm-gray">Advanced</Tag> : null}
          </div>
          <h3>{panel.title}</h3>
          <p className="midi-hub-panel-shell__summary">{panel.summary}</p>
        </div>
      </header>

      <div className="midi-hub-panel-shell__content">{children}</div>
    </Layer>
  )
}
