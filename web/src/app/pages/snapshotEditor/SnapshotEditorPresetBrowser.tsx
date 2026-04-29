// SnapshotEditor preset browser modal (T2473 part 4).
// Pure presentational sub-component extracted from the page
// monolith. Renders the saved-preset library and lets the
// operator load or delete an entry. Owns no state — open/close,
// load, delete, and import-jump are all parent-driven.

import { Button, Modal, Tag, Tile } from '@carbon/react'
import { Download } from '@carbon/icons-react'
import { EmptyState } from '../../components/shared/EmptyState'
import type { Snapshot } from '../../../map2/types'

export interface SnapshotEditorPresetBrowserProps {
  open: boolean
  presets: Snapshot[]
  loadPending: boolean
  deletePending: boolean
  onClose: () => void
  onOpenImport: () => void
  onLoad: (presetId: number) => void
  onDelete: (preset: Snapshot) => void
}

export function SnapshotEditorPresetBrowser({
  open,
  presets,
  loadPending,
  deletePending,
  onClose,
  onOpenImport,
  onLoad,
  onDelete,
}: SnapshotEditorPresetBrowserProps) {
  if (!open) return null
  return (
    <Modal
      open
      size="md"
      modalHeading="Load preset"
      primaryButtonText="Close"
      secondaryButtonText="Import"
      onRequestClose={onClose}
      onRequestSubmit={onClose}
      onSecondarySubmit={onOpenImport}
    >
      <div className="juce-grid-page__modal-stack">
        <div className="juce-grid-page__browser-section">
          <div className="juce-grid-page__browser-section-header">
            <div className="juce-grid-page__browser-section-title">
              <Download size={14} />
              <span>Saved presets</span>
            </div>
            <Tag type="cool-gray">{presets.length} presets</Tag>
          </div>

          {presets.length === 0 ? (
            <EmptyState
              className="juce-grid-page__empty-state"
              title="No presets saved"
              description={
                <>
                  Press <kbd>S</kbd> to save the current chain, or import from file.
                </>
              }
            />
          ) : (
            <div className="juce-grid-page__preset-grid">
              {presets.map((preset) => (
                <Tile key={preset.id} className="juce-grid-page__browser-plugin-tile">
                  <div className="juce-grid-page__browser-plugin-header">
                    <div className="juce-grid-page__browser-plugin-copy">
                      <p className="juce-grid-page__browser-plugin-kicker">Saved preset</p>
                      <h3 className="juce-grid-page__browser-plugin-heading">{preset.name}</h3>
                      <p>
                        {preset.description ||
                          'Saved chain preset ready for instant recall.'}
                      </p>
                    </div>
                    <div className="juce-grid-page__browser-plugin-meta">
                      {preset.category && <Tag type="cool-gray">{preset.category}</Tag>}
                      {preset.is_favorite && <Tag type="cool-gray">Favorite</Tag>}
                    </div>
                  </div>

                  <div className="juce-grid-page__compact-tags">
                    <Tag type="warm-gray">
                      Updated{' '}
                      {new Date(
                        preset.updated_at || preset.created_at,
                      ).toLocaleDateString()}
                    </Tag>
                    {preset.tags.slice(0, 3).map((tag) => (
                      <Tag key={`${preset.id}-${tag}`} type="cool-gray">
                        {tag}
                      </Tag>
                    ))}
                  </div>

                  <div className="juce-grid-page__compact-actions">
                    <Button
                      size="sm"
                      kind="primary"
                      onClick={() => onLoad(preset.id)}
                      disabled={loadPending}
                    >
                      Load
                    </Button>
                    <Button
                      size="sm"
                      kind="ghost"
                      onClick={() => onDelete(preset)}
                      disabled={deletePending}
                    >
                      Delete
                    </Button>
                  </div>
                </Tile>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
