// SnapshotEditor desktop bottom-editor shell (T2473 part 20).
// Renders the pinned parameter-editor panel that appears below the
// signal grid on non-tablet layouts. Three display states:
//   • plugin selected + open  → full parameter editor (+ optional MIDI panel)
//   • snapshot inspector      → PublishReadyBanner only (workflow actions
//                               and workspace nav now live in the top hero)
//   • neither                 → placeholder copy tile
// All state and mutations stay parent-owned.

import { type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Button, Layer, Tile } from '@carbon/react'
import { Close, Launch, SettingsAdjust } from '@carbon/icons-react'

import type { ChainPlugin, MIDILearnTarget, Plugin, PluginParameter } from '../../../map2/types'
import type { EffectIconComponent } from '../../components/icons/effectIcons'
import { JuceGridSelectedBlockMidiPanel } from '../../components/SnapshotEditor/SnapshotEditorSelectedBlockMidiPanel'
import { PublishReadyBanner } from '../../components/SnapshotEditor/PublishReadyBanner'

export interface SnapshotEditorBottomEditorProps {
  // layout gate — parent renders nothing when this is false
  visible: boolean

  bottomEditorRef: RefObject<HTMLElement | null>
  bottomEditorOpen: boolean
  bottomEditorShowsSnapshotInspector: boolean
  bottomEditorAccentColor: string

  selectedPlugin: ChainPlugin | null | undefined
  selectedPluginMeta: Plugin | null | undefined
  selectedPluginHeroIcon: EffectIconComponent | null

  snapshotEditorMutationDisabled: boolean
  snapshotEditingLocked: boolean
  snapshotEntryRequired: boolean

  selectedBlockMidiPanelEnabled: boolean
  selectedPluginEditorContent: ReactNode

  // MIDI panel
  chainId: number | null
  lastMidiEvent: { cc: number; channel: number; value: number } | null
  midiLearnInProgress: boolean
  midiLearnTarget: MIDILearnTarget | null

  // active snapshot
  activeSnapshot: { name: string } | null | undefined
  activeSnapshotId: number | null
  snapshotsDirty: boolean
  activeSnapshotBlockCount: number

  renderSelectedBlockNavBar: (options?: { disabled?: boolean }) => ReactNode

  onStartMidiLearn: (parameter: PluginParameter) => void
  onStopMidiLearn: () => void
  onCloseEditor: () => void
  onOpenEditor: () => void
  onOpenVersionHistory: () => void
  onOpenGuidedProgress: () => void

  getDisplayPluginName: (name: string, uri: string) => string
}

export function SnapshotEditorBottomEditor({
  visible,
  bottomEditorRef,
  bottomEditorOpen,
  bottomEditorShowsSnapshotInspector,
  bottomEditorAccentColor,
  selectedPlugin,
  selectedPluginMeta,
  selectedPluginHeroIcon: SelectedPluginHeroIcon,
  snapshotEditorMutationDisabled,
  snapshotEditingLocked,
  snapshotEntryRequired,
  selectedBlockMidiPanelEnabled,
  selectedPluginEditorContent,
  chainId,
  lastMidiEvent,
  midiLearnInProgress,
  midiLearnTarget,
  activeSnapshot,
  activeSnapshotId,
  snapshotsDirty,
  activeSnapshotBlockCount,
  renderSelectedBlockNavBar,
  onStartMidiLearn,
  onStopMidiLearn,
  onCloseEditor,
  onOpenEditor,
  onOpenVersionHistory,
  onOpenGuidedProgress,
  getDisplayPluginName,
}: SnapshotEditorBottomEditorProps) {
  if (!visible) return null

  return (
    <section
      ref={bottomEditorRef}
      className={`juce-grid-page__bottom-editor-shell ${bottomEditorOpen ? 'is-open' : 'is-closed'}`}
      aria-label={bottomEditorOpen ? 'Block parameter editor' : bottomEditorShowsSnapshotInspector ? 'Snapshot inspector' : undefined}
      aria-hidden={bottomEditorOpen || bottomEditorShowsSnapshotInspector ? undefined : true}
    >
      <Layer className={`juce-grid-page__bottom-editor-panel ${bottomEditorOpen ? 'is-open' : 'is-closed'}`}>
        {/* Suppress the redundant top-of-panel kicker/heading/subtitle when
            we're showing the Snapshot Management hero — the hero now carries
            all of that copy and pinning a second header here is duplication. */}
        <div
          className={`juce-grid-page__bottom-editor-header${
            bottomEditorShowsSnapshotInspector && !bottomEditorOpen ? ' is-hero-only' : ''
          }`}
        >
          <div className="juce-grid-page__bottom-editor-identity">
            <div
              className={`juce-grid-page__bottom-editor-icon ${selectedPlugin?.bypassed ? 'is-bypassed' : ''}`}
              aria-hidden
              style={{ '--juce-grid-editor-accent': bottomEditorAccentColor } as CSSProperties}
            >
              {selectedPlugin && SelectedPluginHeroIcon
                ? <SelectedPluginHeroIcon width={32} height={32} />
                : <SettingsAdjust size={32} />}
            </div>
            <div className="juce-grid-page__bottom-editor-copy">
              <p className="juce-grid-page__bottom-editor-kicker">{bottomEditorShowsSnapshotInspector ? 'Snapshot' : 'Selected block'}</p>
              <h2 className="juce-grid-page__bottom-editor-heading">
                {bottomEditorOpen && selectedPlugin
                  ? getDisplayPluginName(selectedPluginMeta?.name || selectedPlugin.name, selectedPlugin.uri)
                  : bottomEditorShowsSnapshotInspector
                  ? 'Snapshot settings'
                  : 'Block editor'}
              </h2>
              <p className="juce-grid-page__bottom-editor-subtitle">
                {bottomEditorOpen && selectedPlugin
                  ? selectedPluginMeta?.category || 'Processor'
                  : bottomEditorShowsSnapshotInspector
                  ? 'Publish, browse, or create snapshots from the editor inspector.'
                  : 'Open the pinned editor to work on the current block.'}
              </p>
            </div>
          </div>
          <div className="juce-grid-page__bottom-editor-actions">
            {!bottomEditorShowsSnapshotInspector ? (
              <>
                {renderSelectedBlockNavBar({ disabled: !bottomEditorOpen || snapshotEditingLocked })}
                <Button
                  size="sm"
                  kind="ghost"
                  renderIcon={bottomEditorOpen ? Close : Launch}
                  onClick={bottomEditorOpen ? onCloseEditor : onOpenEditor}
                  disabled={!selectedPlugin}
                  aria-label={bottomEditorOpen ? 'Close editor' : 'Open editor'}
                  aria-controls="juce-grid-bottom-editor-panel"
                  aria-expanded={bottomEditorOpen}
                  className={`juce-grid-page__bottom-editor-toggle ${bottomEditorOpen ? 'is-open' : 'is-closed'}`}
                  style={{ '--juce-grid-editor-accent': bottomEditorAccentColor } as CSSProperties}
                >
                  {bottomEditorOpen ? 'Close editor' : 'Open editor'}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        <div
          id="juce-grid-bottom-editor-panel"
          className={`juce-grid-page__bottom-editor-body ${selectedBlockMidiPanelEnabled ? 'has-desktop-midi-panel' : ''}`}
        >
          {bottomEditorOpen && selectedPlugin ? (
            <div className="juce-grid-page__bottom-editor-parameter-stack">
              {selectedBlockMidiPanelEnabled && selectedPluginMeta ? (
                <div className="juce-grid-page__bottom-editor-desktop-layout">
                  <div className="juce-grid-page__bottom-editor-main">
                    {selectedPluginEditorContent}
                  </div>
                  <JuceGridSelectedBlockMidiPanel
                    plugin={selectedPlugin}
                    meta={selectedPluginMeta}
                    chainId={chainId}
                    activeSnapshotId={activeSnapshotId}
                    lastMidiEvent={lastMidiEvent}
                    midiLearnInProgress={midiLearnInProgress}
                    midiLearnTarget={midiLearnTarget}
                    onStartLearn={onStartMidiLearn}
                    onStopLearn={onStopMidiLearn}
                  />
                </div>
              ) : (
                selectedPluginEditorContent
              )}
            </div>
          ) : bottomEditorShowsSnapshotInspector ? (
            <div className="juce-grid-page__snapshot-inspector-row">
              {/* Snapshot management (workflow icon bar, channel/chain
                  summary, group + per-snapshot actions) now lives in the
                  top hero panel — see SnapshotEditorSnapshotStatusPanel.
                  This branch keeps only the Publish-ready banner so the
                  bottom sheet stays a quiet handoff surface. */}
              {activeSnapshot && snapshotsDirty ? (
                <PublishReadyBanner
                  snapshotName={activeSnapshot.name}
                  blockCount={activeSnapshotBlockCount}
                  onDiff={onOpenVersionHistory}
                  onPublish={onOpenGuidedProgress}
                />
              ) : null}
            </div>
          ) : (
            <Tile className="juce-grid-page__bottom-editor-placeholder">
              <div className="juce-grid-page__parameter-editor-copy">
                <p className="juce-grid-page__dense-card-kicker">Editor state</p>
                <h3 className="juce-grid-page__selected-block-placeholder-heading">
                  {snapshotEntryRequired ? 'No snapshot loaded' : selectedPlugin ? 'Selected block ready' : 'No block selected'}
                </h3>
                <p>
                  {snapshotEntryRequired
                    ? 'Load or create a snapshot before opening the pinned block editor.'
                    : selectedPlugin
                    ? 'The editor shell stays pinned here. Use Open editor when you want to work on the selected block.'
                    : 'Select a processor in the grid to load its controls here without shifting the page.'}
                </p>
              </div>
            </Tile>
          )}
        </div>
      </Layer>
    </section>
  )
}
