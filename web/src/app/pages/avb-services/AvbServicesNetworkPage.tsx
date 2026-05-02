/**
 * T2490-9 — AvbServicesNetworkPage.
 *
 * Operator-visible PTP / SRP / TSN status surface backed by the
 * existing `/api/avb/{ptp,srp,tsn,status}` endpoints. Three Carbon
 * Tile groups: Sync (PTP), Reservation (SRP + admissions), Shaping
 * (TSN qdisc) — each with a header status Tag tone-mapped from the
 * upstream payload.
 *
 * Cluster auto-connect onboarding modal (mirroring T2486 for MIDI)
 * deferred to a follow-up iter.
 */

import { useMemo } from 'react'
import {
  Heading,
  InlineNotification,
  Layer,
  Section,
  Tag,
  Tile,
} from '@carbon/react'

import {
  useAvbPtpStatus,
  useAvbSrpAdmissions,
  useAvbSrpStatus,
  useAvbStatus,
  useAvbTsnStatus,
  type PtpStatus,
  type SrpStatus,
  type TsnStatus,
} from './useAvbNetwork'
import { useAvbServicesShellWindow } from './useAvbServicesShellWindow'
import './AvbServicesRegionPage.css'
import './AvbServicesNetworkPage.css'

type CarbonTagType = 'green' | 'red' | 'magenta' | 'cool-gray' | 'warm-gray' | 'blue'

function ptpTone(state: string | undefined): CarbonTagType {
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

function boolTone(value: boolean | undefined, okLabel: string, badLabel: string): {
  tone: CarbonTagType
  label: string
} {
  if (value === undefined) return { tone: 'cool-gray', label: '—' }
  return value ? { tone: 'green', label: okLabel } : { tone: 'red', label: badLabel }
}

function PtpTile({ ptp }: { ptp: PtpStatus | undefined }) {
  const state = ptp?.state ?? '—'
  return (
    <Tile className="avb-network-tile">
      <header className="avb-network-tile__header">
        <h3>PTP / gPTP</h3>
        <Tag type={ptpTone(state)}>{state}</Tag>
      </header>
      <dl className="avb-network-tile__rows">
        <div>
          <dt>Grandmaster</dt>
          <dd>{ptp?.grandmaster_id ?? '—'}</dd>
        </div>
        <div>
          <dt>Local clock</dt>
          <dd>{ptp?.local_clock_id ?? '—'}</dd>
        </div>
        <div>
          <dt>Domain</dt>
          <dd>{ptp?.domain ?? '—'}</dd>
        </div>
        <div>
          <dt>Offset</dt>
          <dd>{ptp?.offset_ns != null ? `${ptp.offset_ns} ns` : '—'}</dd>
        </div>
        <div>
          <dt>Mean path delay</dt>
          <dd>{ptp?.mean_path_delay_ns != null ? `${ptp.mean_path_delay_ns} ns` : '—'}</dd>
        </div>
        <div>
          <dt>GM clock class</dt>
          <dd>{ptp?.grandmaster_clock_class ?? '—'}</dd>
        </div>
      </dl>
    </Tile>
  )
}

function SrpTile({
  srp,
  admissionCount,
}: {
  srp: SrpStatus | undefined
  admissionCount: number
}) {
  const running = boolTone(srp?.running, 'running', 'stopped')
  return (
    <Tile className="avb-network-tile">
      <header className="avb-network-tile__header">
        <h3>SRP / MSRP</h3>
        <Tag type={running.tone}>{running.label}</Tag>
      </header>
      <dl className="avb-network-tile__rows">
        <div>
          <dt>Daemon</dt>
          <dd>{srp?.daemon_type ?? '—'}</dd>
        </div>
        <div>
          <dt>Binary</dt>
          <dd>{srp?.binary_path ?? '—'}</dd>
        </div>
        <div>
          <dt>Control socket</dt>
          <dd>{srp?.control_socket ?? '—'}</dd>
        </div>
        <div>
          <dt>Protocol</dt>
          <dd>{srp?.protocol_mode ?? '—'}</dd>
        </div>
        <div>
          <dt>Required</dt>
          <dd>{srp?.required ? 'yes' : 'no'}</dd>
        </div>
        <div>
          <dt>Admissions logged</dt>
          <dd>{admissionCount}</dd>
        </div>
      </dl>
    </Tile>
  )
}

function TsnTile({ tsn }: { tsn: TsnStatus | undefined }) {
  return (
    <Tile className="avb-network-tile">
      <header className="avb-network-tile__header">
        <h3>TSN qdisc</h3>
        <Tag type={tsn?.available ? 'green' : 'cool-gray'}>
          {tsn?.available ? 'available' : '—'}
        </Tag>
      </header>
      <dl className="avb-network-tile__rows">
        <div>
          <dt>Interface</dt>
          <dd>{tsn?.interface ?? '—'}</dd>
        </div>
        <div>
          <dt>mqprio</dt>
          <dd>{tsn?.mqprio_configured ? 'configured' : 'not configured'}</dd>
        </div>
        <div>
          <dt>CBS</dt>
          <dd>{tsn?.cbs_configured ? 'configured' : 'not configured'}</dd>
        </div>
        <div>
          <dt>ETF</dt>
          <dd>{tsn?.etf_configured ? 'configured' : 'not configured'}</dd>
        </div>
        <div>
          <dt>VLAN</dt>
          <dd>{tsn?.vlan_configured ? 'configured' : 'not configured'}</dd>
        </div>
        <div>
          <dt>Traffic classes</dt>
          <dd>{tsn?.num_traffic_classes ?? '—'}</dd>
        </div>
      </dl>
    </Tile>
  )
}

export function AvbServicesNetworkPage() {
  useAvbServicesShellWindow(
    'Network',
    'PTP grandmaster, SRP admission, TSN qdiscs, and AVB cluster onboarding.',
  )

  const statusQuery = useAvbStatus()
  const ptpQuery = useAvbPtpStatus()
  const srpQuery = useAvbSrpStatus()
  const tsnQuery = useAvbTsnStatus()
  const admissionsQuery = useAvbSrpAdmissions(25)

  const isAnyError =
    statusQuery.isError ||
    ptpQuery.isError ||
    srpQuery.isError ||
    tsnQuery.isError ||
    admissionsQuery.isError

  const overall = statusQuery.data
  const overallTone: CarbonTagType = useMemo(() => {
    if (!overall) return 'cool-gray'
    if (overall.degraded) return 'red'
    if (overall.operational) return 'green'
    return 'warm-gray'
  }, [overall])

  return (
    <Section className="avb-services-region" data-testid="avb-services-network-page">
      <Layer level={0}>
        <header className="avb-services-region__header">
          <Heading className="avb-services-region__title">Network</Heading>
          <p className="avb-services-region__subtitle">
            PTP grandmaster status, SRP daemon + admission log, and TSN
            qdisc configuration. Backed by
            <code> /api/avb/{`{ptp,srp,tsn,status}`}</code> (5s poll).
            Cluster auto-connect onboarding modal lands in a follow-up
            iter once T2490-3b puts live router state through the
            binding authority.
          </p>
          <div>
            <Tag type={overallTone}>
              {overall?.state ?? 'unknown'}
            </Tag>
            {overall?.interface ? (
              <Tag type="cool-gray">iface: {overall.interface}</Tag>
            ) : null}
          </div>
        </header>
      </Layer>

      {isAnyError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Could not load AVB network status"
          subtitle="Confirm the backend service is reachable on port 8080."
        />
      ) : null}

      <Layer level={1}>
        <div className="avb-network-grid">
          <PtpTile ptp={ptpQuery.data} />
          <SrpTile
            srp={srpQuery.data}
            admissionCount={admissionsQuery.data?.count ?? 0}
          />
          <TsnTile tsn={tsnQuery.data} />
        </div>
      </Layer>
    </Section>
  )
}

export default AvbServicesNetworkPage
