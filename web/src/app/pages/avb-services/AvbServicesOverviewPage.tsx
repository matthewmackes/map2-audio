/**
 * T2496-1 — AvbServicesOverviewPage.
 *
 * Live operator landing for /avb/*. Mirrors MidiServicesOverviewPage.
 * Five ClickableTile cards (Bindings / Connections / Devices / Routing /
 * Network) source live counts from the existing canonical hooks, plus
 * a Service Health tile sourcing PTP / SRP / TSN tone from the same
 * `/api/avb/status` projection the Network page uses. 5s poll across
 * the board.
 *
 * Replaces the T2490-1 scaffold landing.
 */

import { useNavigate } from 'react-router-dom'
import {
  ClickableTile,
  Heading,
  Layer,
  Section,
  Tag,
  Tile,
} from '@carbon/react'

import { useAvbBindingsCount } from './useAvbBindings'
import { useAvbDiscovery, useAvdeccEntities } from './useAvbDevices'
import { useAvbStatus } from './useAvbNetwork'
import { useAvbServicesShellWindow } from './useAvbServicesShellWindow'
import './AvbServicesOverviewPage.css'

type CountTone = 'gray' | 'red' | 'green'
type HealthTone = 'green' | 'red' | 'warm-gray' | 'cool-gray'

interface RegionCardProps {
  title: string
  body: string
  count: number
  isLoading: boolean
  isError: boolean
  to?: string
}

function RegionCard({ title, body, count, isLoading, isError, to }: RegionCardProps) {
  const navigate = useNavigate()
  let countLabel: string
  let countTone: CountTone = 'gray'
  if (isError) {
    countLabel = '—'
    countTone = 'red'
  } else if (isLoading) {
    countLabel = '…'
  } else {
    countLabel = String(count)
    countTone = count > 0 ? 'green' : 'gray'
  }
  const inner = (
    <>
      <header className="avb-services-overview__tile-header">
        <h3 className="avb-services-overview__tile-title">{title}</h3>
        <Tag type={countTone} size="sm">
          {countLabel}
        </Tag>
      </header>
      <p className="avb-services-overview__tile-body">{body}</p>
    </>
  )
  if (to) {
    return (
      <ClickableTile
        className="avb-services-overview__tile avb-services-overview__tile--clickable"
        onClick={() => navigate(to)}
        data-testid={`avb-overview-tile-${title.toLowerCase()}`}
      >
        {inner}
      </ClickableTile>
    )
  }
  return (
    <Tile
      className="avb-services-overview__tile"
      data-testid={`avb-overview-tile-${title.toLowerCase()}`}
    >
      {inner}
    </Tile>
  )
}

interface HealthRowProps {
  label: string
  value: string
  tone: HealthTone
}

function HealthRow({ label, value, tone }: HealthRowProps) {
  return (
    <div className="avb-services-overview__health-row">
      <span className="avb-services-overview__health-label">{label}</span>
      <Tag type={tone} size="sm">
        {value}
      </Tag>
    </div>
  )
}

function ptpTone(state: string | undefined): HealthTone {
  switch (state) {
    case 'SLAVE':
    case 'MASTER':
    case 'PASSIVE':
      return 'green'
    case 'FAULTY':
      return 'red'
    case 'UNCALIBRATED':
      return 'warm-gray'
    default:
      return 'cool-gray'
  }
}

function srpTone(running: boolean | undefined): HealthTone {
  if (running === undefined) return 'cool-gray'
  return running ? 'green' : 'red'
}

function tsnTone(available: boolean | undefined): HealthTone {
  if (available === undefined) return 'cool-gray'
  return available ? 'green' : 'cool-gray'
}

function overallTone(
  operational: boolean | undefined,
  degraded: boolean | undefined,
): HealthTone {
  if (degraded) return 'red'
  if (operational) return 'green'
  return 'warm-gray'
}

export function AvbServicesOverviewPage() {
  useAvbServicesShellWindow(
    'Overview',
    'Live counts and health for the AVB Services surface — bindings, connections, devices, routing, network.',
  )

  const bindingsCount = useAvbBindingsCount()
  const discovery = useAvbDiscovery()
  const entities = useAvdeccEntities()
  const status = useAvbStatus()

  const totalBindings = bindingsCount.data ?? 0
  const discoveryNodes = discovery.data?.total_discovered ?? 0
  const avdeccEntities = entities.data?.entities.length ?? 0
  const talkerNodes = discovery.data?.talker_nodes ?? 0
  const listenerNodes = discovery.data?.listener_nodes ?? 0

  const ptpState = status.data?.ptp?.state
  const srpRunning = status.data?.srp?.running
  const tsnAvailable = status.data?.tsn?.available

  const overall = status.data
  const overallLabel = overall?.state ?? (overall ? 'unknown' : '…')
  const overallToneValue = overallTone(
    overall?.operational,
    overall?.degraded,
  )

  return (
    <Section className="avb-services-overview" data-testid="avb-services-overview-page">
      <Layer level={0}>
        <header className="avb-services-overview__header">
          <Heading className="avb-services-overview__title">AVB Services</Heading>
          <p className="avb-services-overview__subtitle">
            Canonical authority for AVB talker / listener pairings, AVDECC stream
            connections, Tesira preset / design recall, and SRP class. Every AVB
            surface — operator routing matrix, cluster peer fan-out, AVDECC
            entity tables, Tesira fleet workspace — reads and writes through this
            single binding authority.
          </p>
        </header>
      </Layer>
      <Layer level={1}>
        <div className="avb-services-overview__regions">
          <RegionCard
            title="Bindings"
            body="Canonical AvbBinding authority — talker / listener / stream / format."
            count={totalBindings}
            isLoading={bindingsCount.isLoading}
            isError={bindingsCount.isError}
            to="/avb/bindings"
          />
          <RegionCard
            title="Connections"
            body="Talker × listener pairings authored through the binding authority."
            count={totalBindings}
            isLoading={bindingsCount.isLoading}
            isError={bindingsCount.isError}
            to="/avb/connections"
          />
          <RegionCard
            title="Devices"
            body="Discovered AVB nodes + AVDECC entities + Tesira fleet workspace."
            count={discoveryNodes + avdeccEntities}
            isLoading={discovery.isLoading || entities.isLoading}
            isError={discovery.isError || entities.isError}
            to="/avb/devices"
          />
          <RegionCard
            title="Routing"
            body="Source × consumer matrix + transport-node fabric graph."
            count={talkerNodes + listenerNodes}
            isLoading={discovery.isLoading}
            isError={discovery.isError}
            to="/avb/routing"
          />
          <RegionCard
            title="Network"
            body="PTP grandmaster, SRP admission, TSN qdiscs, and AVB cluster onboarding."
            count={overall?.operational ? 1 : 0}
            isLoading={status.isLoading}
            isError={status.isError}
            to="/avb/network"
          />
          <Tile
            className="avb-services-overview__tile avb-services-overview__tile--health"
            data-testid="avb-overview-tile-health"
          >
            <header className="avb-services-overview__tile-header">
              <h3 className="avb-services-overview__tile-title">Service health</h3>
              <Tag type={overallToneValue} size="sm">
                {overallLabel}
              </Tag>
            </header>
            <div className="avb-services-overview__health-rows">
              <HealthRow
                label="PTP / gPTP"
                value={ptpState ?? '—'}
                tone={ptpTone(ptpState)}
              />
              <HealthRow
                label="SRP / MSRP"
                value={
                  srpRunning === undefined
                    ? '—'
                    : srpRunning
                      ? 'running'
                      : 'stopped'
                }
                tone={srpTone(srpRunning)}
              />
              <HealthRow
                label="TSN qdisc"
                value={
                  tsnAvailable === undefined
                    ? '—'
                    : tsnAvailable
                      ? 'available'
                      : 'absent'
                }
                tone={tsnTone(tsnAvailable)}
              />
            </div>
          </Tile>
        </div>
      </Layer>
    </Section>
  )
}

export default AvbServicesOverviewPage
