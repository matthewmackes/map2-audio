// SnapshotEditor tablet-touch layout shell (T2473 part 21).
// Renders the tablet launcher bar + the slide-up tablet editor modal.
// The launcher bar is always visible in tablet mode; the modal
// appears only when tabletEditorVisible is true (plugin selected +
// editor open). All state and mutations stay parent-owned.

import { type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Button, Layer, OverflowMenu, OverflowMenuItem } from '@carbon/react'
import { Add, ChevronLeft, ChevronRight, Close, Edit, Launch, Renew } from '@carbon/icons-react'

import type { ChainPlugin, Plugin } from '../../../map2/types'
import type { EffectIconComponent } from '../../components/icons/effectIcons'
import { getDisplayPluginName } from '../../../map2/displayNames'

export interface SnapshotEditorTabletLayoutProps {
  // Launcher bar
  createSnapshotPending: boolean
  updateSnapshotPending: boolean
  activeSnapshot: { id: number } | null | undefined
  snapshotEditingLocked: boolean
  snapshotSetlistMode: boolean
  snapshotSetlistModePending: boolean
  snapshotSetlistModeTitle: string
  snapshotEditorMutationDisabled: boolean

  selectedPlugin: ChainPlugin | null | undefined
  selectedPluginMeta: Plugin | null | undefined
  selectedPluginHeroIcon: EffectIconComponent | null
  selectedPluginIsSystemNoiseGate: boolean

  tabletFocusedFlow: { id: string } | null | undefined
  tabletEditorVisible: boolean
  bottomEditorAccentColor: string

  canPageTabletFocusedBranchBackward: boolean
  canPageTabletFocusedBranchForward: boolean
  tabletFocusedBranchPageLabel: string

  selectedPluginEditorContent: ReactNode
  renderSelectedBlockNavBar: (options?: { disabled?: boolean }) => ReactNode
  renderTabletLoadButton: () => ReactNode

  bottomEditorRef: RefObject<HTMLElement | null>

  onCreateSnapshot: () => void
  onUpdateSnapshot: () => void
  onToggleSetlistMode: () => void
  onOpenEditor: () => void
  onAddEffect: () => void
  onStepBranchPageLeft: () => void
  onStepBranchPageRight: () => void
  onToggleBypass: () => void
  onClearSelection: () => void
  onDeletePlugin: (info: { uri: string; position: number; name: string }) => void
  onCloseEditor: () => void
}

export function SnapshotEditorTabletLayout({
  createSnapshotPending,
  updateSnapshotPending,
  activeSnapshot,
  snapshotEditingLocked,
  snapshotSetlistMode,
  snapshotSetlistModePending,
  snapshotSetlistModeTitle,
  snapshotEditorMutationDisabled,
  selectedPlugin,
  selectedPluginMeta,
  selectedPluginHeroIcon: SelectedPluginHeroIcon,
  selectedPluginIsSystemNoiseGate,
  tabletFocusedFlow,
  tabletEditorVisible,
  bottomEditorAccentColor,
  canPageTabletFocusedBranchBackward,
  canPageTabletFocusedBranchForward,
  tabletFocusedBranchPageLabel,
  selectedPluginEditorContent,
  renderSelectedBlockNavBar,
  renderTabletLoadButton,
  bottomEditorRef,
  onCreateSnapshot,
  onUpdateSnapshot,
  onToggleSetlistMode,
  onOpenEditor,
  onAddEffect,
  onStepBranchPageLeft,
  onStepBranchPageRight,
  onToggleBypass,
  onClearSelection,
  onDeletePlugin,
  onCloseEditor,
}: SnapshotEditorTabletLayoutProps) {
  return (
    <>
      <section className="juce-grid-page__tablet-launcher" aria-label="Tablet workspace launcher">
        <div className="juce-grid-page__tablet-launcher-section juce-grid-page__tablet-launcher-section--left">
          <Button
            size="md"
            kind="primary"
            renderIcon={Add}
            className="juce-grid-page__tablet-launcher-utility juce-grid-page__tablet-launcher-utility--create"
            onClick={onCreateSnapshot}
            disabled={createSnapshotPending}
          >
            {createSnapshotPending ? 'Creating…' : 'New Snapshot'}
          </Button>
          <Button
            size="md"
            kind="secondary"
            renderIcon={Renew}
            className="juce-grid-page__tablet-launcher-utility juce-grid-page__tablet-launcher-utility--update"
            onClick={onUpdateSnapshot}
            disabled={!activeSnapshot || snapshotEditingLocked || updateSnapshotPending}
          >
            {updateSnapshotPending ? 'Updating…' : 'Update Snapshot'}
          </Button>
          <Button
            size="md"
            kind={snapshotSetlistMode ? 'secondary' : 'ghost'}
            className="juce-grid-page__tablet-launcher-utility"
            aria-pressed={snapshotSetlistMode}
            onClick={onToggleSetlistMode}
            disabled={snapshotSetlistModePending}
            title={snapshotSetlistModeTitle}
          >
            {snapshotSetlistModePending ? 'Saving…' : 'Setlist'}
          </Button>
          {renderTabletLoadButton()}
        </div>

        <div className="juce-grid-page__tablet-launcher-section juce-grid-page__tablet-launcher-section--center">
          <Button
            size="md"
            kind="primary"
            renderIcon={selectedPlugin ? Launch : Add}
            onClick={selectedPlugin ? onOpenEditor : onAddEffect}
            disabled={selectedPlugin ? false : !tabletFocusedFlow || snapshotEditingLocked}
            aria-label={selectedPlugin ? 'Open editor' : 'Add effect'}
            aria-controls={selectedPlugin ? 'juce-grid-tablet-editor-panel' : undefined}
            aria-expanded={selectedPlugin ? tabletEditorVisible : undefined}
          >
            {selectedPlugin ? 'Open editor' : 'Add effect'}
          </Button>
        </div>

        <div className="juce-grid-page__tablet-launcher-section juce-grid-page__tablet-launcher-section--right">
          {renderSelectedBlockNavBar({ disabled: !selectedPlugin || snapshotEditingLocked })}
          <div className="juce-grid-page__tablet-launcher-pager" aria-label="Branch page controls">
            <Button
              hasIconOnly
              size="sm"
              kind="ghost"
              renderIcon={ChevronLeft}
              iconDescription="Previous branch page"
              aria-label="Previous branch page"
              onClick={onStepBranchPageLeft}
              disabled={!tabletFocusedFlow || !canPageTabletFocusedBranchBackward}
            />
            <span className="juce-grid-page__tablet-launcher-page-readout">{tabletFocusedBranchPageLabel}</span>
            <Button
              hasIconOnly
              size="sm"
              kind="ghost"
              renderIcon={ChevronRight}
              iconDescription="Next branch page"
              aria-label="Next branch page"
              onClick={onStepBranchPageRight}
              disabled={!tabletFocusedFlow || !canPageTabletFocusedBranchForward}
            />
          </div>
          {selectedPlugin && (
            <OverflowMenu
              ariaLabel="Tablet block actions"
              iconDescription="Tablet block actions"
              size="sm"
              flipped
            >
              <OverflowMenuItem
                itemText={selectedPlugin.bypassed ? 'Enable block' : 'Bypass block'}
                onClick={onToggleBypass}
                disabled={snapshotEditorMutationDisabled}
              />
              <OverflowMenuItem
                itemText="Clear selection"
                onClick={onClearSelection}
              />
              <OverflowMenuItem
                itemText="Remove block"
                isDelete
                disabled={snapshotEditorMutationDisabled || selectedPluginIsSystemNoiseGate}
                onClick={() => onDeletePlugin({
                  uri: selectedPlugin.uri,
                  position: selectedPlugin.position,
                  name: getDisplayPluginName(selectedPluginMeta?.name || selectedPlugin.name, selectedPlugin.uri),
                })}
              />
            </OverflowMenu>
          )}
        </div>
      </section>

      {tabletEditorVisible && (
        <>
          <button
            type="button"
            className="juce-grid-page__tablet-editor-scrim"
            aria-label="Close editor"
            onClick={onCloseEditor}
          />
          <section
            id="juce-grid-tablet-editor-panel"
            ref={bottomEditorRef}
            className="juce-grid-page__tablet-editor-shell"
            aria-label="Block parameter editor"
          >
            <Layer className="juce-grid-page__tablet-editor-panel">
              <div className="juce-grid-page__tablet-editor-header">
                <div className="juce-grid-page__tablet-editor-identity">
                  <div
                    className={`juce-grid-page__bottom-editor-icon ${selectedPlugin?.bypassed ? 'is-bypassed' : ''}`}
                    aria-hidden
                    style={{ '--juce-grid-editor-accent': bottomEditorAccentColor } as CSSProperties}
                  >
                    {selectedPlugin && SelectedPluginHeroIcon
                      ? <SelectedPluginHeroIcon width={28} height={28} />
                      : <Edit size={28} />}
                  </div>
                  <div className="juce-grid-page__tablet-editor-copy">
                    <p className="juce-grid-page__dense-card-kicker">Selected block</p>
                    <h2 className="juce-grid-page__tablet-editor-heading">
                      {selectedPlugin
                        ? getDisplayPluginName(selectedPluginMeta?.name || selectedPlugin.name, selectedPlugin.uri)
                        : 'Block editor'}
                    </h2>
                    <p>{selectedPluginMeta?.category || 'Processor'}</p>
                  </div>
                </div>
                <Button size="sm" kind="ghost" renderIcon={Close} onClick={onCloseEditor}>
                  Close
                </Button>
              </div>
              <div className="juce-grid-page__tablet-editor-body">
                {selectedPluginEditorContent}
              </div>
            </Layer>
          </section>
        </>
      )}
    </>
  )
}
