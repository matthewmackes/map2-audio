import type { ReactNode } from 'react'
import { WarningAlt } from '@carbon/icons-react'
import { Layer, Tag } from '@carbon/react'

export type MidiHubPanelId =
  | 'core'
  | 'routing'
  | 'presets'
  | 'event-lists'
  | 'event-status'
  | 'event-editor'
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
  | 'tesira'
  | 'gpio'
  | 'string-interface'
  | 'ai-learn'
  | 'mesh'
  | 'device-shadow'
  | 'innovation'

type MidiHubPanelMeta = {
  title: string
  family: string
  shortLabel: string
  advanced?: boolean
}

export const MIDI_HUB_PANEL_META: Record<MidiHubPanelId, MidiHubPanelMeta> = {
  core: {
    title: 'Legacy MIDI Control',
    family: 'Legacy Surface',
    shortLabel: 'Legacy route',
    advanced: true,
  },
  routing: {
    title: 'Routing Workspace',
    family: 'Signal Path',
    shortLabel: 'Matrix and patchbay',
  },
  presets: {
    title: 'Presets and Program Change',
    family: 'Show Control',
    shortLabel: 'Recall and slots',
  },
  'event-lists': {
    title: 'Event List Manager',
    family: 'Show Control',
    shortLabel: 'Cue lists',
  },
  'event-status': {
    title: 'Event List Status',
    family: 'Show Control',
    shortLabel: 'Clock status',
  },
  'event-editor': {
    title: 'Event Editor',
    family: 'Show Control',
    shortLabel: 'Cue timing',
  },
  network: {
    title: 'RTP-MIDI and OSC Bridge',
    family: 'Network and Protocol',
    shortLabel: 'Remote sessions',
  },
  filters: {
    title: 'Message Filtering',
    family: 'Message Processing',
    shortLabel: 'Filter design',
  },
  mapper: {
    title: 'Message Mapping',
    family: 'Message Processing',
    shortLabel: 'Map translation',
  },
  scripts: {
    title: 'Script Engine',
    family: 'Automation',
    shortLabel: 'Python runtime',
    advanced: true,
  },
  macros: {
    title: 'Macros',
    family: 'Automation',
    shortLabel: 'Triggered actions',
  },
  scheduler: {
    title: 'Scheduled MIDI Events',
    family: 'Automation',
    shortLabel: 'Timed send',
    advanced: true,
  },
  clock: {
    title: 'Clock and Transport',
    family: 'Timing and Capture',
    shortLabel: 'Clock source',
  },
  recorder: {
    title: 'Capture and Playback',
    family: 'Timing and Capture',
    shortLabel: 'Session recorder',
  },
  traffic: {
    title: 'Event Monitor',
    family: 'Signal Path',
    shortLabel: 'Live events',
  },
  midi2: {
    title: 'MIDI 2.0 Workspace',
    family: 'Network and Protocol',
    shortLabel: 'UMP and MIDI-CI',
  },
  tesira: {
    title: 'Tesira TTP Integration',
    family: 'Network and Protocol',
    shortLabel: 'Biamp control',
  },
  gpio: {
    title: 'Virtual GPIO Matrix',
    family: 'Network and Protocol',
    shortLabel: 'Contact closures',
  },
  'string-interface': {
    title: 'String Interface',
    family: 'Network and Protocol',
    shortLabel: 'UDP text cues',
  },
  'ai-learn': {
    title: 'AI Learn Suggestions',
    family: 'Lab',
    shortLabel: 'Assistive mappings',
    advanced: true,
  },
  mesh: {
    title: 'Mesh Networking',
    family: 'Lab',
    shortLabel: 'Peer routing',
    advanced: true,
  },
  'device-shadow': {
    title: 'Device Shadow State',
    family: 'Lab',
    shortLabel: 'Drift tracking',
    advanced: true,
  },
  innovation: {
    title: 'Advanced and Experimental',
    family: 'Experimental',
    shortLabel: 'AI and mesh',
    advanced: true,
  },
}

interface MidiHubPanelShellProps {
  panelId: MidiHubPanelId
  children: ReactNode
  title?: ReactNode
  actionTag?: ReactNode
}

type MidiHubEmptyStateProps = {
  title: string
  description: string
  action?: ReactNode
  icon?: ReactNode
}

export function MidiHubPanelShell({ panelId, children, title, actionTag }: MidiHubPanelShellProps) {
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
          <h3>{title ?? panel.title}</h3>
        </div>
        {actionTag ? <div className="midi-hub-panel-shell__action">{actionTag}</div> : null}
      </header>

      <div className="midi-hub-panel-shell__content">{children}</div>
    </Layer>
  )
}

export function MidiHubEmptyState({
  title,
  description,
  action,
  icon = <WarningAlt size={20} />,
}: MidiHubEmptyStateProps) {
  return (
    <Layer className="midi-hub-empty-state-card">
      <div className="midi-hub-empty-state-card__icon" aria-hidden="true">
        {icon}
      </div>
      <div className="midi-hub-empty-state-card__copy">
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
      {action ? <div className="midi-hub-empty-state-card__action">{action}</div> : null}
    </Layer>
  )
}
