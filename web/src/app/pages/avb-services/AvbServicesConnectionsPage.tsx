/**
 * T2490-1 — AvbServicesConnectionsPage scaffold.
 *
 * Placeholder. Carbon DataTable mirroring MidiServicesConnectionsPage
 * lands in T2490-4.
 */

import { Heading, Layer, Section, Tag } from '@carbon/react'

import { useAvbServicesShellWindow } from './useAvbServicesShellWindow'
import './AvbServicesRegionPage.css'

export function AvbServicesConnectionsPage() {
  useAvbServicesShellWindow(
    'Connections',
    'Talker / listener pairings sourced from the canonical AvbBindingAuthority.',
  )
  return (
    <Section className="avb-services-region" data-testid="avb-services-connections-page">
      <Layer level={0}>
        <header className="avb-services-region__header">
          <Heading className="avb-services-region__title">Connections</Heading>
          <p className="avb-services-region__subtitle">
            Talker / listener pairings. The Carbon DataTable lands in T2490-4
            once the AvbBindingAuthority REST surface (T2490-2) is in place.
          </p>
          <div>
            <Tag type="cool-gray">Scaffold</Tag>
          </div>
        </header>
      </Layer>
      <Layer level={1}>
        <div className="avb-services-region__placeholder">
          No live data yet. T2490-4 will bind this page to
          <code> /api/avb/bindings</code>.
        </div>
      </Layer>
    </Section>
  )
}

export default AvbServicesConnectionsPage
