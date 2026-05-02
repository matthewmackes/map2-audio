/**
 * T2490-1 — AvbServicesRoutingPage scaffold.
 *
 * Placeholder. Talker × listener matrix UI lands in T2490-8.
 */

import { Heading, Layer, Section, Tag } from '@carbon/react'

import { useAvbServicesShellWindow } from './useAvbServicesShellWindow'
import './AvbServicesRegionPage.css'

export function AvbServicesRoutingPage() {
  useAvbServicesShellWindow(
    'Routing',
    'Talker × Listener cross-reference matrix.',
  )
  return (
    <Section className="avb-services-region" data-testid="avb-services-routing-page">
      <Layer level={0}>
        <header className="avb-services-region__header">
          <Heading className="avb-services-region__title">Routing</Heading>
          <p className="avb-services-region__subtitle">
            Talker × Listener cross-reference matrix sourced from the canonical
            AvbBindingAuthority. Mirrors <code>/midi/routing</code>.
          </p>
          <div>
            <Tag type="cool-gray">Scaffold</Tag>
          </div>
        </header>
      </Layer>
      <Layer level={1}>
        <div className="avb-services-region__placeholder">
          T2490-8 ships the routing matrix UI. Until then,
          <code> avb_router.py</code> still owns the runtime routing matrix
          (T2490-3 will fold its state under the binding authority).
        </div>
      </Layer>
    </Section>
  )
}

export default AvbServicesRoutingPage
