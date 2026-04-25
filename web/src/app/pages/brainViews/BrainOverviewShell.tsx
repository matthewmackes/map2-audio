import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Categories,
  ConnectionSignal,
  DataStructured,
  Flow,
} from '@carbon/icons-react'

import { BoTag, computeWarnCount, BRAIN_VIEW_IDS, type BrainOverviewSharedProps, type BrainViewId } from './brainViewShared'
import { PerformanceView } from './PerformanceView'
import { ConsoleView } from './ConsoleView'
import { StepView } from './StepView'
import { SplitView } from './SplitView'
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

  return (
    <div className="brain-overview">
      <div className="brain-overview__tabs">
        {BRAIN_VIEW_IDS.map((id) => {
          const { label, sub, Icon } = TAB_META[id]
          const isActive = id === activeView
          return (
            <button
              key={id}
              type="button"
              className={`brain-overview__tab${isActive ? ' brain-overview__tab--active' : ''}`}
              onClick={() => onChangeView(id)}
            >
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
      <div className="brain-overview__body">
        {activeView === 'performance' ? <PerformanceView {...props} /> : null}
        {activeView === 'console' ? <ConsoleView {...props} /> : null}
        {activeView === 'step' ? <StepView {...props} /> : null}
        {activeView === 'split' ? <SplitView {...props} /> : null}
      </div>
    </div>
  )
}
