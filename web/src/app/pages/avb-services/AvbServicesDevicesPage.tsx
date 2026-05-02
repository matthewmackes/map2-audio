/**
 * T2490-1 — AvbServicesDevicesPage scaffold.
 *
 * Placeholder. /avb/devices index lands in T2490-5; Tesira fold-in
 * lands in T2490-6.
 */

import { Heading, Layer, Section, Tag } from '@carbon/react'

import { useAvbServicesShellWindow } from './useAvbServicesShellWindow'
import './AvbServicesRegionPage.css'

export function AvbServicesDevicesPage() {
  useAvbServicesShellWindow(
    'Devices',
    'AVDECC entities, Tesira fleet members, and other AVB device profiles.',
  )
  return (
    <Section className="avb-services-region" data-testid="avb-services-devices-page">
      <Layer level={0}>
        <header className="avb-services-region__header">
          <Heading className="avb-services-region__title">Devices</Heading>
          <p className="avb-services-region__subtitle">
            Discovered AVDECC entities, Tesira fleet members, and other
            registered AVB device profiles. Mirrors <code>/midi/devices</code>.
          </p>
          <div>
            <Tag type="cool-gray">Scaffold</Tag>
          </div>
        </header>
      </Layer>
      <Layer level={1}>
        <div className="avb-services-region__placeholder">
          T2490-5 will populate this page from the AVDECC discovery
          service + Tesira fleet registry. T2490-6 folds the existing
          <code> /devices/tesira/*</code> mount under
          <code> /avb/devices/tesira/*</code> with a hard redirect.
        </div>
      </Layer>
    </Section>
  )
}

export default AvbServicesDevicesPage
