/**
 * T2490-1 — AvbServicesBindingsPage scaffold.
 *
 * Placeholder. Filter-first list + edit / create modals land in
 * T2490-2 + T2490-3.
 */

import { Heading, Layer, Section, Tag } from '@carbon/react'

import { useAvbServicesShellWindow } from './useAvbServicesShellWindow'
import './AvbServicesRegionPage.css'

export function AvbServicesBindingsPage() {
  useAvbServicesShellWindow(
    'Bindings',
    'Canonical AvbBinding authority — talker / listener / stream / format.',
  )
  return (
    <Section className="avb-services-region" data-testid="avb-services-bindings-page">
      <Layer level={0}>
        <header className="avb-services-region__header">
          <Heading className="avb-services-region__title">Bindings</Heading>
          <p className="avb-services-region__subtitle">
            Canonical authority for AVB talker / listener pairings, AVDECC
            stream connections, Tesira preset / design recall, and SRP class.
            Mirrors <code>/midi/bindings</code>.
          </p>
          <div>
            <Tag type="cool-gray">Scaffold</Tag>
          </div>
        </header>
      </Layer>
      <Layer level={1}>
        <div className="avb-services-region__placeholder">
          T2490-2 ships <code>app/services/avb/binding_authority.py</code> +
          <code> app/routes/avb/bindings.py</code> (
          <code>GET / POST / PATCH / DELETE /api/avb/bindings</code>). T2490-3
          refactors <code>avb_router.py</code> to consume this authority.
        </div>
      </Layer>
    </Section>
  )
}

export default AvbServicesBindingsPage
