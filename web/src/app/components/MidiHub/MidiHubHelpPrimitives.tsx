import type { ReactNode } from 'react'
import { Information } from '@carbon/icons-react'
import { Button, Layer, Modal, Tag } from '@carbon/react'
import {
  MIDI_HUB_FAMILY_LABELS,
  MIDI_HUB_PANEL_GUIDANCE,
  type MidiHubPanelId,
} from './midiHubGuidance'

interface MidiHubPanelShellProps {
  panelId: MidiHubPanelId
  children: ReactNode
  onOpenHelp: (panelId: MidiHubPanelId) => void
  hideHints?: boolean
}

export function MidiHubPanelShell({ panelId, children, onOpenHelp, hideHints = false }: MidiHubPanelShellProps) {
  const guidance = MIDI_HUB_PANEL_GUIDANCE[panelId]

  return (
    <Layer className="midi-hub-panel-shell" id={`midi-hub-panel-${panelId}`}>
      <header className="midi-hub-panel-shell__header">
        <div className="midi-hub-panel-shell__copy">
          <div className="midi-hub-panel-shell__meta-row">
            <Tag type="cool-gray">{MIDI_HUB_FAMILY_LABELS[guidance.family]}</Tag>
            {guidance.advanced ? <Tag type="warm-gray">Advanced</Tag> : null}
          </div>
          <h3>{guidance.title}</h3>
          <p className="midi-hub-panel-shell__summary">{guidance.summary}</p>
          {!hideHints ? (
            <ul className="midi-hub-inline-hints">
              {guidance.inlineHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <Button
          kind="ghost"
          size="sm"
          renderIcon={Information}
          onClick={() => onOpenHelp(panelId)}
        >
          Deep help
        </Button>
      </header>

      <div className="midi-hub-panel-shell__content">{children}</div>
    </Layer>
  )
}

interface MidiHubHelpDrawerProps {
  panelId: MidiHubPanelId | null
  open: boolean
  onClose: () => void
}

export function MidiHubHelpDrawer({ panelId, open, onClose }: MidiHubHelpDrawerProps) {
  const guidance = panelId ? MIDI_HUB_PANEL_GUIDANCE[panelId] : null

  return (
    <Modal
      open={open}
      passiveModal
      size="lg"
      modalLabel={guidance ? MIDI_HUB_FAMILY_LABELS[guidance.family] : 'MIDI Hub'}
      modalHeading={guidance?.title ?? 'MIDI Hub help'}
      onRequestClose={onClose}
    >
      {guidance ? (
        <div className="midi-hub-help-modal">
          <div className="midi-hub-help-modal__row">
            <Tag type="cool-gray">{MIDI_HUB_FAMILY_LABELS[guidance.family]}</Tag>
            {guidance.advanced ? <Tag type="warm-gray">Advanced surface</Tag> : null}
          </div>

          <section className="midi-hub-help-modal__section">
            <h4>Why this surface matters</h4>
            <p>{guidance.whyItMatters}</p>
          </section>

          <section className="midi-hub-help-modal__section">
            <h4>Prerequisites</h4>
            <ul className="midi-hub-help-list">
              {guidance.prerequisites.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="midi-hub-help-modal__section">
            <h4>Worked example</h4>
            <p>{guidance.example}</p>
          </section>

          <section className="midi-hub-help-modal__section">
            <h4>Recovery guidance</h4>
            <ul className="midi-hub-help-list">
              {guidance.recovery.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </Modal>
  )
}
