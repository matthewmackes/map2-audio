/**
 * IntelFXFlowView — route wrapper for the IntelFX signal flow canvas (/intelfx/flow).
 */

import { Layer, Tag } from '@carbon/react'

import { IntelFXFlowCanvas } from '../components/IntelFX/IntelFXFlowCanvas'
import { LandscapePrompt } from '../components/shared/LandscapePrompt'
import { useIntelFXPageContext } from './IntelFXPage'
import './IntelFXFlowView.css'

export function IntelFXFlowView() {
  const { intelfx, setLcdText } = useIntelFXPageContext()

  return (
    <div className="intelfx-flow-view">
      <LandscapePrompt componentId="intelfx-flow" />
      <Layer className="intelfx-flow-view__hero">
        <div className="intelfx-flow-view__hero-copy">
          <h2 className="intelfx-flow-view__title">Signal flow</h2>
          <p className="intelfx-flow-view__subtitle">
            Inspect block order, bypass state, and patch topology for the IntelFX chain.
          </p>
        </div>
        <div className="intelfx-flow-view__hero-tags">
          <Tag type="blue">11 blocks</Tag>
          <Tag type="gray">Real-time editor</Tag>
        </div>
      </Layer>

      <section className="intelfx-flow-view__canvas-shell" aria-label="IntelFX signal flow editor">
        <IntelFXFlowCanvas intelfx={intelfx} setStatusText={setLcdText} />
      </section>
    </div>
  )
}
