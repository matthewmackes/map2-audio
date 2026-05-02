/**
 * T2490-1 — AvbServicesOverviewPage scaffold.
 *
 * Placeholder. Live counts + Tile cards land in T2490-7 + T2490-9.
 */

import { Heading, Layer, Section, Tag } from '@carbon/react'

import { useAvbServicesShellWindow } from './useAvbServicesShellWindow'
import './AvbServicesRegionPage.css'

export function AvbServicesOverviewPage() {
  useAvbServicesShellWindow(
    'Overview',
    'Cross-link landing for the AVB Services surface — counts, health, and links to each region.',
  )
  return (
    <Section className="avb-services-region" data-testid="avb-services-overview-page">
      <Layer level={0}>
        <header className="avb-services-region__header">
          <Heading className="avb-services-region__title">Overview</Heading>
          <p className="avb-services-region__subtitle">
            T2490-1 scaffold landing. Live talker / listener / stream / device
            counts will populate here as T2490-2 (binding authority) and T2490-7
            (cluster matrix) ship.
          </p>
          <div>
            <Tag type="cool-gray">Scaffold</Tag>
          </div>
        </header>
      </Layer>
      <Layer level={1}>
        <div className="avb-services-region__placeholder">
          Region scaffolds available: Connections, Bindings, Devices, Routing,
          Network. All read from the canonical <code>AvbBindingAuthority</code>
          once T2490-2 + T2490-3 land.
        </div>
      </Layer>
    </Section>
  )
}

export default AvbServicesOverviewPage
