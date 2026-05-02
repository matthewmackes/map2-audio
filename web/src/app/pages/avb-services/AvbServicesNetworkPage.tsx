/**
 * T2490-1 — AvbServicesNetworkPage scaffold.
 *
 * Placeholder. PTP / SRP / TSN qdisc surfaces + cluster auto-connect
 * onboarding modal land in T2490-9.
 */

import { Heading, Layer, Section, Tag } from '@carbon/react'

import { useAvbServicesShellWindow } from './useAvbServicesShellWindow'
import './AvbServicesRegionPage.css'

export function AvbServicesNetworkPage() {
  useAvbServicesShellWindow(
    'Network',
    'PTP grandmaster, SRP admission, TSN qdiscs, and AVB cluster onboarding.',
  )
  return (
    <Section className="avb-services-region" data-testid="avb-services-network-page">
      <Layer level={0}>
        <header className="avb-services-region__header">
          <Heading className="avb-services-region__title">Network</Heading>
          <p className="avb-services-region__subtitle">
            PTP grandmaster status, SRP admission log, TSN qdisc surfaces, and
            the AVB cluster auto-connect onboarding modal. Mirrors
            <code> /midi/network</code>.
          </p>
          <div>
            <Tag type="cool-gray">Scaffold</Tag>
          </div>
        </header>
      </Layer>
      <Layer level={1}>
        <div className="avb-services-region__placeholder">
          T2490-9 wires this page to <code>app/services/avb/ptp_monitor.py</code>,
          <code> srp_admission.py</code>, and <code>tsn_qdisc.py</code> and adds
          the cluster onboarding modal mirroring T2486&#39;s MIDI cluster modal.
        </div>
      </Layer>
    </Section>
  )
}

export default AvbServicesNetworkPage
