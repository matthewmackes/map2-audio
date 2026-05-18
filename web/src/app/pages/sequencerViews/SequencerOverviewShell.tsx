import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'

import { SEQUENCER_VIEW_IDS, type SequencerOverviewSharedProps, type SequencerViewId } from './sequencerViewShared'
import { PerformanceView } from './PerformanceView'
import { ConsoleView } from './ConsoleView'
import { StepView } from './StepView'
import { SplitView } from './SplitView'
import { SetupView } from './SetupView'
import { tabContentVariants } from '../../styles/motionPrimitives'
import { useReducedMotionSafeVariants } from '../../styles/useReducedMotionSafeVariants'
import './sequencerViews.css'

function parseSection(raw: string | null): SequencerViewId | null {
  return raw && (SEQUENCER_VIEW_IDS as readonly string[]).includes(raw) ? (raw as SequencerViewId) : null
}

/**
 * Brain Overview shell.
 *
 * The horizontal tab bar that lists *every* Sequencer subsection now lives in
 * SequencerPage so non-overview sections (perform/layers/sequence/...) also
 * surface in the bar. This shell renders only the five Brain Overview views
 * (performance / console / step / split / setup) and cross-fades between them.
 */
export function SequencerOverviewShell(props: SequencerOverviewSharedProps) {
  const [searchParams] = useSearchParams()
  const sectionParam = parseSection(searchParams.get('section'))
  const activeView: SequencerViewId = sectionParam ?? 'performance'

  const safeTabContentVariants = useReducedMotionSafeVariants(tabContentVariants)

  return (
    <div className="brain-overview">
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
            {activeView === 'setup' ? <SetupView /> : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
