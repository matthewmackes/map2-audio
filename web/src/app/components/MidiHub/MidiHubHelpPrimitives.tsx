import type { ReactNode } from 'react'
import { Button, Chip, Drawer } from '@mui/material'
import { Question } from '@phosphor-icons/react'
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
    <article className="card midi-hub-panel-shell" id={`midi-hub-panel-${panelId}`}>
      <header className="midi-hub-panel-shell__header">
        <div className="stack" style={{ gap: 6 }}>
          <div className="midi-hub-panel-shell__meta-row">
            <Chip
              size="small"
              label={MIDI_HUB_FAMILY_LABELS[guidance.family]}
              className="midi-hub-family-chip"
            />
            {guidance.advanced ? (
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                label="Advanced"
              />
            ) : null}
          </div>
          <h3 style={{ marginTop: 0 }}>{guidance.title}</h3>
          <p className="subtitle" style={{ marginTop: 0 }}>{guidance.summary}</p>
          {!hideHints ? (
            <div className="midi-hub-inline-hints">
              {guidance.inlineHints.map((hint) => (
                <p key={hint}>{hint}</p>
              ))}
            </div>
          ) : null}
        </div>

        <Button
          size="small"
          variant="outlined"
          startIcon={<Question size={16} weight="duotone" />}
          onClick={() => onOpenHelp(panelId)}
        >
          Deep Help
        </Button>
      </header>

      <div className="midi-hub-panel-shell__content">{children}</div>
    </article>
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
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 420 },
          background: 'var(--surface-2)',
          color: 'var(--text-primary)',
          borderLeft: '1px solid var(--border)',
          padding: 2,
        },
      }}
    >
      {guidance ? (
        <div className="stack" style={{ gap: 14 }}>
          <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ marginTop: 0 }}>{guidance.title}</h3>
            <Button size="small" variant="outlined" onClick={onClose}>
              Close
            </Button>
          </div>

          <Chip
            size="small"
            label={MIDI_HUB_FAMILY_LABELS[guidance.family]}
            className="midi-hub-family-chip"
          />

          <div className="stack" style={{ gap: 6 }}>
            <h4 style={{ marginTop: 0 }}>Why It Matters</h4>
            <p className="subtitle" style={{ marginTop: 0 }}>{guidance.whyItMatters}</p>
          </div>

          <div className="stack" style={{ gap: 6 }}>
            <h4 style={{ marginTop: 0 }}>Prerequisites</h4>
            <ul className="midi-hub-help-list">
              {guidance.prerequisites.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="stack" style={{ gap: 6 }}>
            <h4 style={{ marginTop: 0 }}>Worked Example</h4>
            <p className="subtitle" style={{ marginTop: 0 }}>{guidance.example}</p>
          </div>

          <div className="stack" style={{ gap: 6 }}>
            <h4 style={{ marginTop: 0 }}>Recovery Guidance</h4>
            <ul className="midi-hub-help-list">
              {guidance.recovery.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </Drawer>
  )
}
