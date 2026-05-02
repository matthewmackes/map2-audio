/**
 * T2482 loop 10 / iter 95 — MidiServicesOverviewPage scaffold.
 * T2482 loop 10 / iter 96 — Tile cards now wired to live counts via
 * useMidiServicesCounts (TanStack Query against /api/midi/bindings/count
 * + per-scope filtered binding lists).
 *
 * Per the iter-91 design D3 (Overview is a NEW Carbon surface, not a
 * port). Mounted at `/midi/overview` per iter 92.
 */

import { Layer, Heading, Section, Tag, Tile } from '@carbon/react'

import { useMidiServicesCounts } from './useMidiServicesCounts'
import './MidiServicesOverviewPage.css'

interface RegionCardProps {
  title: string
  body: string
  count: number
  isLoading: boolean
  isError: boolean
}

function RegionCard({ title, body, count, isLoading, isError }: RegionCardProps) {
  let countLabel: string
  let countTone: 'gray' | 'red' | 'green' = 'gray'
  if (isError) {
    countLabel = '—'
    countTone = 'red'
  } else if (isLoading) {
    countLabel = '…'
  } else {
    countLabel = String(count)
    countTone = count > 0 ? 'green' : 'gray'
  }
  return (
    <Tile className="midi-services-overview__tile">
      <header className="midi-services-overview__tile-header">
        <h3 className="midi-services-overview__tile-title">{title}</h3>
        <Tag type={countTone} size="sm">{countLabel}</Tag>
      </header>
      <p className="midi-services-overview__tile-body">{body}</p>
    </Tile>
  )
}

export function MidiServicesOverviewPage() {
  const counts = useMidiServicesCounts()
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
          <RegionCard
            title="Devices"
            body="Connected MIDI devices + per-device editor surfaces."
            count={counts.deviceBindings}
            isLoading={counts.isLoading}
            isError={counts.isError}
          />
          <RegionCard
            title="Bindings"
            body="Global filterable binding list + authoring workflow."
            count={counts.totalBindings}
            isLoading={counts.isLoading}
            isError={counts.isError}
          />
          <RegionCard
            title="Routing"
            body="Source → consumer routing matrix + cluster peers."
            count={counts.routingBindings}
            isLoading={counts.isLoading}
            isError={counts.isError}
          />
          <RegionCard
            title="Transport"
            body="Clock + transport bindings + tempo provenance."
            count={counts.transportBindings}
            isLoading={counts.isLoading}
            isError={counts.isError}
          />
        </div>
      </Layer>
    </Section>
  )
}

export default MidiServicesOverviewPage
