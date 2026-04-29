// SnapshotEditor keyboard-shortcut help overlay (T2473 part 1).
// Pure presentational sub-component extracted from the page
// monolith. Owns no state of its own — open/close + the
// "Open docs" secondary action are wired by the parent.

import { Modal, Tile } from '@carbon/react'
import { KEYBOARD_SHORTCUT_SECTIONS } from './snapshotEditorPageTypes'

export interface SnapshotEditorKeyboardShortcutsProps {
  open: boolean
  onClose: () => void
  onOpenDocs: () => void
}

export function SnapshotEditorKeyboardShortcuts({
  open,
  onClose,
  onOpenDocs,
}: SnapshotEditorKeyboardShortcutsProps) {
  if (!open) return null
  return (
    <Modal
      open
      size="md"
      modalHeading="Keyboard shortcuts"
      primaryButtonText="Close"
      secondaryButtonText="Open docs"
      onRequestClose={onClose}
      onRequestSubmit={onClose}
      onSecondarySubmit={onOpenDocs}
    >
      <div className="juce-grid-page__shortcut-grid">
        {KEYBOARD_SHORTCUT_SECTIONS.map((section) => (
          <Tile key={section.title} className="juce-grid-page__shortcut-tile">
            <p className="juce-grid-page__dense-card-kicker">Shortcuts</p>
            <h3 className="juce-grid-page__dense-card-heading">{section.title}</h3>
            <div className="juce-grid-page__shortcut-rows">
              {section.rows.map((row) => (
                <div
                  key={`${section.title}-${row.description}`}
                  className="juce-grid-page__shortcut-row"
                >
                  <div
                    className="juce-grid-page__shortcut-keys"
                    aria-label={row.keys.join(' + ')}
                  >
                    {row.keys.map((key) => (
                      <kbd key={`${section.title}-${row.description}-${key}`}>{key}</kbd>
                    ))}
                  </div>
                  <span>{row.description}</span>
                </div>
              ))}
            </div>
          </Tile>
        ))}
      </div>
    </Modal>
  )
}
