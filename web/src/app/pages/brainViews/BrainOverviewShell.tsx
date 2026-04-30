import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Categories,
  ConnectionSignal,
  DataStructured,
  Flow,
} from '@carbon/icons-react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'

import { BoTag, computeWarnCount, BRAIN_VIEW_IDS, type BrainOverviewSharedProps, type BrainViewId } from './brainViewShared'
import { PerformanceView } from './PerformanceView'
import { ConsoleView } from './ConsoleView'
import { StepView } from './StepView'
import { SplitView } from './SplitView'
import { MAP2_SPRING, tabContentVariants } from '../../styles/motionPrimitives'
import {
  useReducedMotionSafeTransition,
  useReducedMotionSafeVariants,
} from '../../styles/useReducedMotionSafeVariants'
import './brainViews.css'

const TAB_META: Record<BrainViewId, { label: string; sub: string; Icon: typeof DataStructured }> = {
  performance: { label: 'Performance', sub: 'Pads · Transport · Meters', Icon: DataStructured },
  console: { label: 'Console', sub: 'Mixer · Faders · Routing', Icon: ConnectionSignal },
  step: { label: 'Step', sub: 'Sequencer · Pattern · Song', Icon: Flow },
  split: { label: 'Split', sub: 'Keyboard · Pads · Routing', Icon: Categories },
}

function parseSection(raw: string | null): BrainViewId | null {
  return raw && (BRAIN_VIEW_IDS as readonly string[]).includes(raw) ? (raw as BrainViewId) : null
}

/**
 * Brain Overview shell.
 *
 * T2442: the four Brain Overview tabs (performance / console / step / split) are
 * now first-class `?section=` values written directly by the parent
 * PerformanceBrainPage. This shell simply reads `?section=` and falls back to
 * `performance` if the param doesn't match one of the four. Storage and
 * `?view=` indirection both removed.
 *
 * T2444: tab indicator now magic-moves via Framer Motion `layoutId`, view
 * content cross-fades via AnimatePresence with mode="wait".
 */
export function BrainOverviewShell(props: BrainOverviewSharedProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const sectionParam = parseSection(searchParams.get('section'))
  const activeView: BrainViewId = sectionParam ?? 'performance'

  const onChangeView = useCallback(
    (view: BrainViewId) => {
      const next = new URLSearchParams(searchParams)
      next.set('section', view)
      setSearchParams(next)
    },
    [searchParams, setSearchParams],
  )

  const warnCount = computeWarnCount(props.diagnostics)
  const qualification = props.diagnostics.controller_qualification
  // T2466-3: respect prefers-reduced-motion + the in-app
  // Reduced-effects toggle for the cross-fade and the tab-indicator
  // magic-move spring.
  const safeTabContentVariants = useReducedMotionSafeVariants(tabContentVariants)
  const tabIndicatorTransition = useReducedMotionSafeTransition(MAP2_SPRING.tabIndicator)

  return (
    <div className="brain-overview">
      <LayoutGroup id="brain-overview-tabs">
        <div className="brain-overview__tabs" role="tablist" aria-label="Brain Overview sections">
          {BRAIN_VIEW_IDS.map((id) => {
            const { label, sub, Icon } = TAB_META[id]
            const isActive = id === activeView
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`brain-overview__tab${isActive ? ' brain-overview__tab--active' : ''}`}
                onClick={() => onChangeView(id)}
              >
                {isActive ? (
                  <motion.span
                    layoutId="brain-overview__tab-indicator"
                    className="brain-overview__tab-indicator"
                    aria-hidden="true"
                    transition={tabIndicatorTransition}
                  />
                ) : null}
                <div className="brain-overview__tab-icon">
                  <Icon size={12} />
                </div>
                <div className="brain-overview__tab-labels">
                  <div className="brain-overview__tab-label">{label}</div>
                  <div className="brain-overview__tab-sub">{sub}</div>
                </div>
              </button>
            )
          })}
          <div className="brain-overview__tab-spacer" />
          <div className="brain-overview__tab-meta">
            {warnCount > 0 ? <BoTag tone="warn">{warnCount} WARN</BoTag> : null}
            {qualification.controller_ready ? <BoTag tone="ok">READY</BoTag> : null}
          </div>
        </div>
      </LayoutGroup>
      <div className="brain-overview__body">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeView}
            className="brain-overview__view"
            variants={safeTabContentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {activeView === 'performance' ? <PerformanceView {...props} /> : null}
            {activeView === 'console' ? <ConsoleView {...props} /> : null}
            {activeView === 'step' ? <StepView {...props} /> : null}
            {activeView === 'split' ? <SplitView {...props} /> : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
