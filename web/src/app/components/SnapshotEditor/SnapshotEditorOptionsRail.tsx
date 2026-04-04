import {
  Add,
  ChevronLeft,
  ChevronRight,
  Launch,
  MachineLearningModel,
  Music,
  Settings,
  TrashCan,
} from '@carbon/icons-react'
import { Button } from '@carbon/react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useId, useState } from 'react'

const OPTIONS_RAIL_COLLAPSE_STORAGE_KEY = 'map2_snapshot_options_rail_collapsed'

interface SnapshotEditorOptionsRailProps {
  prefersReducedMotion: boolean
  onOpenControlCenter: () => void
  controlCenterDisabled: boolean
  onAddFlow: () => void
  addFlowDisabled: boolean
  onOpenMidi: () => void
  midiDisabled: boolean
  midiTitle: string
  midiLearning: boolean
  onOpenLiveRuntime: () => void
  liveRuntimeLabel: string
  liveRuntimeActive: boolean
  onOpenPerform: () => void
  onClearFlows: () => void
  clearFlowsDisabled: boolean
}

export function SnapshotEditorOptionsRail({
  prefersReducedMotion,
  onOpenControlCenter,
  controlCenterDisabled,
  onAddFlow,
  addFlowDisabled,
  onOpenMidi,
  midiDisabled,
  midiTitle,
  midiLearning,
  onOpenLiveRuntime,
  liveRuntimeLabel,
  liveRuntimeActive,
  onOpenPerform,
  onClearFlows,
  clearFlowsDisabled,
}: SnapshotEditorOptionsRailProps) {
  const toolbarPanelId = useId()
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false
    }
    try {
      return window.localStorage.getItem(OPTIONS_RAIL_COLLAPSE_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(OPTIONS_RAIL_COLLAPSE_STORAGE_KEY, collapsed ? 'true' : 'false')
    } catch {}
  }, [collapsed])

  return (
    <div className="snapshot-toolbar-shell snapshot-toolbar-shell--options">
      <AnimatePresence initial={false}>
        {!collapsed ? (
          <motion.div
            key="tray"
            className="snapshot-toolbar__tray"
            initial={{ width: 0, opacity: 0, x: -28, marginRight: 0 }}
            animate={{ width: 'auto', opacity: 1, x: 0, marginRight: 12 }}
            exit={{ width: 0, opacity: 0, x: -28, marginRight: 0 }}
            transition={{
              type: 'spring',
              stiffness: 320,
              damping: 28,
              mass: 0.9,
              opacity: { duration: 0.2, ease: 'easeOut' },
            }}
          >
            <div
              id={toolbarPanelId}
              className="snapshot-toolbar snapshot-toolbar--options"
              role="toolbar"
              aria-label="Options toolbar"
            >
              <div className="snapshot-toolbar__actions">
                <div className="snapshot-toolbar__group" role="group" aria-label="Workspace controls">
                  <Button
                    hasIconOnly
                    size="sm"
                    kind="secondary"
                    className="snapshot-toolbar__button snapshot-toolbar__button--control-center"
                    renderIcon={Settings}
                    iconDescription="Open control center"
                    aria-label="Open control center"
                    title="Open control center"
                    onClick={onOpenControlCenter}
                    disabled={controlCenterDisabled}
                  />
                  <Button
                    hasIconOnly
                    size="sm"
                    kind="primary"
                    className={`snapshot-toolbar__button snapshot-toolbar__button--add-flow ${!prefersReducedMotion && !addFlowDisabled ? 'is-pulsing' : ''}`}
                    renderIcon={Add}
                    iconDescription="Add signal path"
                    aria-label="Add signal path"
                    title="Add signal path"
                    onClick={onAddFlow}
                    disabled={addFlowDisabled}
                  />
                </div>

                <div className="snapshot-toolbar__group" role="group" aria-label="Performance and runtime tools">
                  <Button
                    hasIconOnly
                    size="sm"
                    kind="ghost"
                    className={`snapshot-toolbar__button snapshot-toolbar__button--midi ${midiLearning ? 'is-learning' : ''}`}
                    renderIcon={MachineLearningModel}
                    iconDescription="Edit MIDI mappings"
                    aria-label="Edit MIDI mappings"
                    title={midiTitle}
                    onClick={onOpenMidi}
                    disabled={midiDisabled}
                  />
                  <Button
                    hasIconOnly
                    size="sm"
                    kind="ghost"
                    className={`snapshot-toolbar__button snapshot-toolbar__button--live ${liveRuntimeActive ? 'is-live' : ''}`}
                    renderIcon={Launch}
                    iconDescription={liveRuntimeLabel}
                    aria-label={liveRuntimeLabel}
                    title={liveRuntimeLabel}
                    onClick={onOpenLiveRuntime}
                  />
                  <Button
                    hasIconOnly
                    size="sm"
                    kind="ghost"
                    className="snapshot-toolbar__button snapshot-toolbar__button--perform"
                    renderIcon={Music}
                    iconDescription="Open performance view"
                    aria-label="Open performance view"
                    title="Open performance view"
                    onClick={onOpenPerform}
                  />
                </div>

                <div className="snapshot-toolbar__group" role="group" aria-label="Danger zone">
                  <Button
                    hasIconOnly
                    size="sm"
                    kind="ghost"
                    className="snapshot-toolbar__button snapshot-toolbar__button--clear"
                    renderIcon={TrashCan}
                    iconDescription="Clear signal paths"
                    aria-label="Clear signal paths"
                    title="Clear signal paths"
                    onClick={onClearFlows}
                    disabled={clearFlowsDisabled}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Button
        size="sm"
        kind={collapsed ? 'primary' : 'tertiary'}
        className={`snapshot-toolbar__toggle snapshot-toolbar__toggle--options ${collapsed ? 'is-collapsed' : ''}`}
        renderIcon={collapsed ? ChevronRight : ChevronLeft}
        hasIconOnly
        iconDescription={collapsed ? 'Expand options toolbar' : 'Collapse options toolbar'}
        aria-label={collapsed ? 'Expand options toolbar' : 'Collapse options toolbar'}
        title={collapsed ? 'Expand options toolbar' : 'Collapse options toolbar'}
        aria-controls={toolbarPanelId}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((current) => !current)}
      />
    </div>
  )
}

export default SnapshotEditorOptionsRail
