// SnapshotEditor compact-layout workflow panels (T2473 part 13).
// Pure presentational sibling extracted from the page monolith.
// On compact (mobile/touch-non-tablet) layouts, the workspace
// shows a Carbon Tabs strip whose body switches between four
// short panels — Workspace / Editor / Routing / Presets. This
// component owns none of the state; the parent flips compactTab
// and passes the live values in.

import { Button, Column, Grid, Layer, Tag, Tile } from '@carbon/react'
import { Flow } from '@carbon/icons-react'

import type { CompactTabId, RoutingConfig } from './snapshotEditorPageTypes'

export interface CompactPanelsRoutingMode {
  label: string
}

export interface SnapshotEditorCompactPanelsProps {
  visible: boolean
  compactTab: CompactTabId

  snapshotEntryRequired: boolean
  // Truthy when a block is selected; the panel never reads any
  // specific field, so the parent's narrower ChainPlugin shape
  // is structurally compatible.
  selectedPlugin: { uri: string } | null | undefined

  openSelectedBlockEditor: () => void
  openSnapshotProgressModal: (
    tab?: 'wizard' | 'guided' | 'advanced',
    section?: 'overview' | 'routing' | 'devices' | 'runtime' | 'cleanup',
  ) => void
  snapshotEditorMutationDisabled: boolean

  activeRoutingMode: CompactPanelsRoutingMode
  activeFlowLabel: string
  routing: RoutingConfig
}

export function SnapshotEditorCompactPanels({
  visible,
  compactTab,
  snapshotEntryRequired,
  selectedPlugin,
  openSelectedBlockEditor,
  openSnapshotProgressModal,
  snapshotEditorMutationDisabled,
  activeRoutingMode,
  activeFlowLabel,
  routing,
}: SnapshotEditorCompactPanelsProps) {
  if (!visible) return null

  return (
    <div className="juce-grid-page__compact-shell">
      <Grid className="juce-grid-page__section-frame juce-grid-page__section-frame--workspace">
        <Column sm={4} md={8} lg={16} className="juce-grid-page__section-column">
          <section className="juce-grid-page__compact-panel">
            {compactTab === 'grid' && (
              <Layer className="juce-grid-page__compact-layer">
                <div className="juce-grid-page__compact-section-header">
                  <p className="juce-grid-page__compact-section-kicker">Workspace</p>
                  <h2>Grid workspace</h2>
                  <p>
                    Primary editing remains in the grid above. Use the other tabs for focused
                    workflow panels.
                  </p>
                </div>
                <div className="juce-grid-page__compact-stack" />
              </Layer>
            )}

            {compactTab === 'editor' && (
              <Layer className="juce-grid-page__compact-layer">
                <div className="juce-grid-page__compact-section-header">
                  <p className="juce-grid-page__compact-section-kicker">Selected block</p>
                  <h2>Editor</h2>
                  <p>
                    {snapshotEntryRequired
                      ? 'Load a snapshot or click Add effect to create a draft before opening the block editor.'
                      : selectedPlugin
                      ? 'The selected block editor opens in the bottom panel below the workspace.'
                      : 'Select a block in the grid to open its editor.'}
                  </p>
                </div>
                <Tile className="juce-grid-page__effect-modal-placeholder">
                  <div className="juce-grid-page__parameter-editor-copy">
                    <p className="juce-grid-page__dense-card-kicker">Editor state</p>
                    <h3 className="juce-grid-page__selected-block-placeholder-heading">
                      {snapshotEntryRequired
                        ? 'No snapshot loaded'
                        : selectedPlugin
                        ? 'Selected block ready'
                        : 'No block selected'}
                    </h3>
                    <p>
                      {snapshotEntryRequired
                        ? 'Block editing is disabled until a snapshot is loaded or created from the Add effect entry point.'
                        : selectedPlugin
                        ? 'Use the flow card selection to reopen the bottom editor panel.'
                        : 'Tap a processor in the grid to open the bottom editor panel.'}
                    </p>
                  </div>
                  {selectedPlugin && !snapshotEntryRequired && (
                    <Button size="sm" kind="secondary" onClick={openSelectedBlockEditor}>
                      Reopen editor panel
                    </Button>
                  )}
                </Tile>
              </Layer>
            )}

            {compactTab === 'routing' && (
              <Layer className="juce-grid-page__compact-layer">
                <div className="juce-grid-page__compact-section-header">
                  <p className="juce-grid-page__compact-section-kicker">Signal path</p>
                  <h2>Routing topology</h2>
                  <p>
                    {snapshotEntryRequired
                      ? 'Load or create a snapshot before changing routing topology.'
                      : 'Configure how snapshot paths and their live routing interact.'}
                  </p>
                </div>
                <div className="juce-grid-page__toolbar-buttons">
                  <Button
                    size="sm"
                    kind="tertiary"
                    renderIcon={Flow}
                    onClick={() => openSnapshotProgressModal('advanced', 'routing')}
                    disabled={snapshotEditorMutationDisabled}
                  >
                    Configure routing
                  </Button>
                </div>
                <div className="juce-grid-page__compact-tags juce-grid-page__compact-tags--summary">
                  <Tag type="blue">{activeRoutingMode.label}</Tag>
                  <Tag type="cool-gray">Focus {activeFlowLabel}</Tag>
                  {routing.mode === 'parameter_morph' && (
                    <Tag type="purple">Morph {Math.round(routing.morphProgress * 100)}%</Tag>
                  )}
                </div>
              </Layer>
            )}

            {compactTab === 'presets' && (
              <Layer className="juce-grid-page__compact-layer">
                <div className="juce-grid-page__compact-section-header">
                  <p className="juce-grid-page__compact-section-kicker">Library</p>
                  <h2>Presets</h2>
                  <p>
                    Preset save and recall state now appears in the live snapshot status card
                    above.
                  </p>
                </div>
              </Layer>
            )}
          </section>
        </Column>
      </Grid>
    </div>
  )
}
