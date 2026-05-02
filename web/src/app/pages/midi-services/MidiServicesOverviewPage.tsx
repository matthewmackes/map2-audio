/**
 * T2482 loop 10 / iter 95 — MidiServicesOverviewPage scaffold.
 *
 * Per the iter-91 design D3 (Overview is a NEW Carbon surface, not a
 * port). Iter 95 ships the page scaffold with header + region
 * placeholders. Iter 96 fills the Tile cards with live counts via
 * `/api/midi/bindings/count` + sibling endpoints.
 *
 * Mounted at `/midi/overview` (the parent /midi route's index
 * redirects to `/midi/connections` per iter 92; iter 96+ may flip
 * the index to point at this overview once the cards render meaningful
 * content).
 */

import { Layer, Heading, Section, Tile } from '@carbon/react'

import './MidiServicesOverviewPage.css'

export function MidiServicesOverviewPage() {
  return (
    <Section className="midi-services-overview">
      <Layer level={0}>
        <header className="midi-services-overview__header">
          <Heading className="midi-services-overview__title">MIDI Services</Heading>
          <p className="midi-services-overview__subtitle">
            Canonical authority for MIDI bindings, routing, devices, and
            transport across the platform. Every MIDI surface
            (Snapshot Editor inline editors, per-device pages, Brain
            inputs, cluster MIDI) reads + writes through this single
            Bindings authority.
          </p>
        </header>
      </Layer>
      <Layer level={1}>
        <div className="midi-services-overview__regions">
          <Tile className="midi-services-overview__tile">
            <h3 className="midi-services-overview__tile-title">Devices</h3>
            <p className="midi-services-overview__tile-body">
              Connected MIDI devices + per-device editor surfaces.
            </p>
          </Tile>
          <Tile className="midi-services-overview__tile">
            <h3 className="midi-services-overview__tile-title">Bindings</h3>
            <p className="midi-services-overview__tile-body">
              Global filterable binding list + authoring workflow.
            </p>
          </Tile>
          <Tile className="midi-services-overview__tile">
            <h3 className="midi-services-overview__tile-title">Routing</h3>
            <p className="midi-services-overview__tile-body">
              Source → consumer routing matrix + cluster peers.
            </p>
          </Tile>
          <Tile className="midi-services-overview__tile">
            <h3 className="midi-services-overview__tile-title">Transport</h3>
            <p className="midi-services-overview__tile-body">
              Clock + transport bindings + tempo provenance.
            </p>
          </Tile>
        </div>
      </Layer>
    </Section>
  )
}

export default MidiServicesOverviewPage
