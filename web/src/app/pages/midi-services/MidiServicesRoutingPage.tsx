/**
 * T2482 loop 11 / iter 107 — /midi/routing scaffold.
 *
 * Per the iter-101 plan D5: this is a 30-line placeholder so the
 * /midi/routing route mounts cleanly + the iter-109 Overview Tile
 * deep-link has a destination. The actual routing matrix UI
 * (cluster peers, source→consumer routing) is loop 12+ scope.
 *
 * Carbon-conformant; no MUI / Phosphor; no hardcoded colors.
 */

import { Link as RouterLink } from 'react-router-dom'
import {
  Heading,
  InlineNotification,
  Layer,
  Link as CarbonLink,
  Section,
} from '@carbon/react'

import './MidiServicesOverviewPage.css'  // share the simple layout styles

export function MidiServicesRoutingPage() {
  return (
    <Section className="midi-services-overview">
      <Layer level={0}>
        <header className="midi-services-overview__header">
          <Heading className="midi-services-overview__title">Routing</Heading>
          <p className="midi-services-overview__subtitle">
            Source → consumer routing matrix and cluster peer routing for
            MIDI events. The full matrix UI (per the iter-91 design D3)
            ships in a future loop. For now, source/target authoring is
            done per-binding via the Bindings page.
          </p>
        </header>
      </Layer>
      <Layer level={1}>
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="Region under construction"
          subtitle="Routing matrix authoring lands in a future SHIP loop. Per-binding routing is editable today via the Bindings page."
        />
        <p className="midi-services-overview__subtitle midi-services-overview__subtitle--spaced">
          Continue to <CarbonLink as={RouterLink} to="/midi/bindings">Bindings</CarbonLink>{' '}
          to edit existing routing per-binding, or to{' '}
          <CarbonLink as={RouterLink} to="/midi/overview">Overview</CarbonLink>{' '}
          for region-level counts.
        </p>
      </Layer>
    </Section>
  )
}

export default MidiServicesRoutingPage
